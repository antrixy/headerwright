// selftest.mjs — HeaderWright selftest suite.
// Run: node test/selftest.mjs   (from the repo root; no dependencies)
// Exit code 0 iff every check passes AND the total equals EXPECTED_CHECKS.
//
// Scope: everything in extension/lib/ — the pure layer with no chrome.*
// calls, which is why lib/ exists as a separate directory. This suite
// verifies rule CONSTRUCTION and format STABILITY. It deliberately makes
// no claim about rule APPLICATION to real traffic: a rule can be built
// correctly, match in the oracle, and still no-op without a host
// permission grant. Application evidence comes from the manual smoke test
// in test/SMOKE.md, run against a live echo endpoint — not from here.
//
// Count tripwire: EXPECTED_CHECKS below is the promotion tripwire, same
// mechanism as toon-diff's selftest counts. Adding checks requires
// bumping it in the same commit; a change that silently drops checks
// fails the run. Update it deliberately or not at all.

import {
  validateHeaderEntry,
  isValidDomain,
  profileToRule,
  RESOURCE_TYPES,
  APPENDABLE_REQUEST_HEADERS,
  isValidHeaderName,
  isValidHeaderValue,
  isValidRuleId,
  nextRuleId,
  normalizeDomains,
  MAX_UNSAFE_DYNAMIC_RULES,
  MAX_RULE_ID,
} from "../extension/lib/rules.js";
import {
  canonicalizeProfiles,
  stableStringify,
  serializeProfiles,
  parseProfilesFile,
  FILE_FORMAT,
  FILE_VERSION,
} from "../extension/lib/canonical.js";
import {
  diffDomainGrants,
  referencedDomains,
  originFor,
  originsFor,
} from "../extension/lib/grants.js";
import {
  computeBadge,
  describeSync,
  BADGE_ON,
  BADGE_OFF,
  BADGE_FAILED,
  DEFAULT_SYNC_STATE,
} from "../extension/lib/status.js";
import { createSerialQueue } from "../extension/lib/queue.js";

const EXPECTED_CHECKS = 148;

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}

// Returns fn()'s value, or the THREW sentinel if it raised.
//
// EVERY success-expecting call into lib/ must go through this. An uncaught
// throw aborts the whole run: no FAIL lines are printed, the count tripwire
// never executes, and the result is indistinguishable from "no check covers
// this". That produced a false "0 fails" mutation reading TWICE while building
// v0.1.2 — once on the generated-id round trip, once on the cap boundary — and
// a mutation that appears uncaught is exactly the reading that stops someone
// writing the check that was already there.
const THREW = Symbol("threw");
function attempt(fn) {
  try {
    return fn();
  } catch {
    return THREW;
  }
}

function checkThrows(name, fn, messageIncludes) {
  try {
    fn();
    failed++;
    console.error(`FAIL: ${name} (did not throw)`);
  } catch (err) {
    if (messageIncludes && !err.message.includes(messageIncludes)) {
      failed++;
      console.error(
        `FAIL: ${name} (threw "${err.message}", expected it to include "${messageIncludes}")`
      );
    } else {
      passed++;
    }
  }
}

// ------------------------------------------------- validateHeaderEntry

check("set with value is valid",
  validateHeaderEntry({ name: "X-A", operation: "set", value: "1" }).valid);
check("remove without value is valid",
  validateHeaderEntry({ name: "X-A", operation: "remove" }).valid);
check("append on allowlisted header is valid",
  validateHeaderEntry({ name: "cookie", operation: "append", value: "k=v" }).valid);
check("append allowlist is case-insensitive on input",
  validateHeaderEntry({ name: "Cookie", operation: "append", value: "k=v" }).valid);
check("append on non-allowlisted header is invalid",
  !validateHeaderEntry({ name: "X-Custom", operation: "append", value: "1" }).valid);
check("set without value is invalid",
  !validateHeaderEntry({ name: "X-A", operation: "set" }).valid);
check("set with empty value is invalid",
  !validateHeaderEntry({ name: "X-A", operation: "set", value: "" }).valid);
check("empty header name is invalid",
  !validateHeaderEntry({ name: "", operation: "set", value: "1" }).valid);
check("whitespace header name is invalid",
  !validateHeaderEntry({ name: "  ", operation: "set", value: "1" }).valid);
check("unknown operation is invalid",
  !validateHeaderEntry({ name: "X-A", operation: "add", value: "1" }).valid);
check("null entry is invalid",
  !validateHeaderEntry(null).valid);

// ------------------------------------------------------- isValidDomain

check("example.com is valid", isValidDomain("example.com"));
check("sub.example.com is valid", isValidDomain("sub.example.com"));
check("localhost is valid (single label, deliberate)", isValidDomain("localhost"));
check("hyphenated label is valid", isValidDomain("my-api.example.co"));
check("scheme is invalid", !isValidDomain("https://example.com"));
check("port is invalid", !isValidDomain("localhost:3000"));
check("path is invalid", !isValidDomain("example.com/x"));
check("leading hyphen is invalid", !isValidDomain("-example.com"));
check("trailing dot is invalid", !isValidDomain("example.com."));
check("empty string is invalid", !isValidDomain(""));
check("uppercase is invalid (callers lowercase first)", !isValidDomain("Example.com"));

// ------------------------------------------------------- profileToRule

const baseProfile = {
  id: 3,
  name: "P",
  domains: ["a.example.com", "b.example.com"],
  headers: [
    { name: "X-A", operation: "set", value: "1" },
    { name: "X-Bad", operation: "append", value: "x" }, // invalid: filtered
    { name: "X-B", operation: "remove" },
  ],
};

const rule = profileToRule(baseProfile, ["a.example.com"]);
check("rule id equals profile id", rule.id === 3);
check("rule condition uses only granted domains",
  rule.condition.requestDomains.length === 1 &&
  rule.condition.requestDomains[0] === "a.example.com");
check("invalid header entries are filtered out",
  rule.action.requestHeaders.length === 2);
check("remove entry carries no value key",
  !("value" in rule.action.requestHeaders[1]));
check("resourceTypes is the full explicit list (main_frame default bug)",
  rule.condition.resourceTypes.length === RESOURCE_TYPES.length &&
  rule.condition.resourceTypes.includes("main_frame"));
check("no granted domains yields null", profileToRule(baseProfile, []) === null);
check("null grantedDomains yields null", profileToRule(baseProfile, null) === null);
check("no valid headers yields null",
  profileToRule(
    { id: 1, name: "P", domains: ["a.com"], headers: [{ name: "X", operation: "append", value: "1" }] },
    ["a.com"]
  ) === null);
check("append allowlist is non-trivially sized",
  APPENDABLE_REQUEST_HEADERS.size >= 15);

// ---------------------------------------------------------- canonical

const messyProfiles = [
  { id: 2, name: "B", domains: ["z.example.com", "a.example.com"], headers: [
    { name: "X-Two", operation: "remove" },
    { name: "X-One", operation: "set", value: "v1" },
  ]},
  { id: 1, name: "A", domains: ["LOCALHOST"], headers: [
    { name: "cookie", operation: "append", value: "k=v" },
  ]},
];

const s1 = serializeProfiles(messyProfiles);
check("serializing twice is byte-identical", s1 === serializeProfiles(messyProfiles));
check("profile input order does not affect bytes",
  s1 === serializeProfiles([messyProfiles[1], messyProfiles[0]]));
check("round-trip (parse then serialize) is byte-identical",
  s1 === attempt(() => serializeProfiles(parseProfilesFile(s1))));
check("output ends with exactly one trailing newline",
  s1.endsWith("}\n") && !s1.endsWith("\n\n"));
check("domains are sorted and lowercased in canonical form",
  canonicalizeProfiles(messyProfiles)[0].domains[0] === "localhost" &&
  canonicalizeProfiles(messyProfiles)[1].domains.join(",") === "a.example.com,z.example.com");
check("header order is preserved (not sorted)",
  canonicalizeProfiles(messyProfiles)[1].headers[0].name === "X-Two");
check("stableStringify sorts object keys",
  stableStringify({ b: 1, a: 2 }) === '{\n  "a": 2,\n  "b": 1\n}');
check("stableStringify handles empty object and array",
  stableStringify({}) === "{}" && stableStringify([]) === "[]");

const validDoc = (profiles) =>
  JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, profiles });

checkThrows("rejects non-JSON", () => parseProfilesFile("{{{"), "not valid JSON");
checkThrows("rejects wrong format", () =>
  parseProfilesFile(JSON.stringify({ format: "x", version: 1, profiles: [] })), '"format"');
checkThrows("rejects wrong version", () =>
  parseProfilesFile(JSON.stringify({ format: FILE_FORMAT, version: 2, profiles: [] })), "version");
checkThrows("rejects duplicate ids", () =>
  parseProfilesFile(validDoc([
    { id: 1, name: "a", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "1" }] },
    { id: 1, name: "b", domains: ["b.com"], headers: [{ name: "x", operation: "set", value: "1" }] },
  ])), "duplicate id");
checkThrows("rejects invalid domain", () =>
  parseProfilesFile(validDoc([
    { id: 1, name: "a", domains: ["not a domain!"], headers: [{ name: "x", operation: "set", value: "1" }] },
  ])), "not a valid domain");
checkThrows("rejects append-allowlist violation via import", () =>
  parseProfilesFile(validDoc([
    { id: 1, name: "a", domains: ["a.com"], headers: [{ name: "X-Custom", operation: "append", value: "1" }] },
  ])), "does not support append");
checkThrows("rejects empty headers array", () =>
  parseProfilesFile(validDoc([
    { id: 1, name: "a", domains: ["a.com"], headers: [] },
  ])), '"headers"');
check("accepts and canonicalizes a valid file",
  attempt(() => parseProfilesFile(validDoc([
    { id: 1, name: "a", domains: ["B.com", "a.com"], headers: [{ name: "x", operation: "set", value: "1" }] },
  ]))[0].domains.join(",")) === "a.com,b.com");

// ------------------------------------------------- grants / A1 scenarios
// Shared-domain retention FIRST: it is the case a naive "revoke whatever
// the edited profile used to have" fix silently breaks, and the case that
// would have caught finding 1b.

const prof = (id, domains) => ({
  id,
  name: `P${id}`,
  domains,
  headers: [{ name: "X-A", operation: "set", value: "1" }],
});

// Setup: A: example.com   B: example.com, api.example.com
const setA1 = [prof(1, ["example.com"]), prof(2, ["example.com", "api.example.com"])];
// Edit A: example.com -> localhost
const setA2 = [prof(1, ["localhost"]), prof(2, ["example.com", "api.example.com"])];
// Then edit B: example.com, api.example.com -> localhost
const setA3 = [prof(1, ["localhost"]), prof(2, ["localhost"])];

const editA = diffDomainGrants({
  previousProfiles: setA1,
  nextProfiles: setA2,
  grantedDomains: ["example.com", "api.example.com"],
});
check("A1: shared domain RETAINED when one profile stops referencing it",
  !editA.toRevoke.includes("example.com"));
check("A1: untouched domain of another profile RETAINED",
  !editA.toRevoke.includes("api.example.com"));
check("A1: newly referenced domain is requested",
  editA.toRequest.join(",") === "localhost");
check("A1: edit revokes nothing while a reference survives",
  editA.toRevoke.length === 0);

const editB = diffDomainGrants({
  previousProfiles: setA2,
  nextProfiles: setA3,
  grantedDomains: ["example.com", "api.example.com", "localhost"],
});
check("A1: now-unreferenced domains are REVOKED",
  editB.toRevoke.join(",") === "api.example.com,example.com");
check("A1: still-referenced domain is not revoked",
  !editB.toRevoke.includes("localhost"));
check("A1: already-granted domain is not re-requested",
  editB.toRequest.length === 0);

check("A1: unchanged profile set produces no permission churn",
  (() => {
    const d = diffDomainGrants({
      previousProfiles: setA1,
      nextProfiles: setA1,
      grantedDomains: ["example.com", "api.example.com"],
    });
    return d.toRequest.length === 0 && d.toRevoke.length === 0;
  })());
check("A1: unchanged set STILL re-requests a denied domain (finding 2 recovery path)",
  diffDomainGrants({
    previousProfiles: setA1,
    nextProfiles: setA1,
    grantedDomains: ["example.com"],
  }).toRequest.join(",") === "api.example.com");
check("A1: delete revokes only what no remaining profile references",
  diffDomainGrants({
    previousProfiles: setA1,
    nextProfiles: [setA1[0]],
    grantedDomains: ["example.com", "api.example.com"],
  }).toRevoke.join(",") === "api.example.com");
check("A1: never revokes a domain that was not granted",
  diffDomainGrants({
    previousProfiles: setA1,
    nextProfiles: [],
    grantedDomains: ["example.com"],
  }).toRevoke.join(",") === "example.com");
check("A1: import replace-all drops old and requests new",
  (() => {
    const d = diffDomainGrants({
      previousProfiles: setA1,
      nextProfiles: [prof(9, ["other.test"])],
      grantedDomains: ["example.com", "api.example.com"],
    });
    return d.toRevoke.join(",") === "api.example.com,example.com" &&
      d.toRequest.join(",") === "other.test";
  })());
check("A1: results are sorted and deduplicated",
  diffDomainGrants({
    previousProfiles: [],
    nextProfiles: [prof(1, ["z.test", "a.test"]), prof(2, ["a.test"])],
    grantedDomains: [],
  }).toRequest.join(",") === "a.test,z.test");

check("referencedDomains dedupes across profiles",
  referencedDomains(setA1).join(",") === "api.example.com,example.com");
check("referencedDomains tolerates a profile with no domains key",
  referencedDomains([{ id: 1, name: "x" }]).length === 0);
check("originFor builds the port-agnostic origin pattern",
  originFor("localhost") === "*://localhost/*");
check("originsFor maps a list",
  originsFor(["a.test", "b.test"]).join(" ") === "*://a.test/* *://b.test/*");

// ------------------------------------------- header syntax (finding 3, A2)
// Provenance: RFC 9110 token set for names; NUL/CR/LF plus the remaining C0
// controls and DEL for values. The Chrome DNR reference specifies NEITHER —
// see the PROVENANCE comments in lib/rules.js.

check("plain token name is valid", isValidHeaderName("X-Custom-Header"));
check("RFC token specials are valid", isValidHeaderName("a!#$%&'*+-.^_`|~9Z"));
check("name with a space is invalid", !isValidHeaderName("X Custom"));
check("name with a colon is invalid", !isValidHeaderName("X-Custom:"));
check("name with leading whitespace is invalid (import path has no trim)",
  !isValidHeaderName(" X-Custom"));
check("name with trailing whitespace is invalid", !isValidHeaderName("X-Custom "));
check("empty name is invalid", !isValidHeaderName(""));
check("name with a tab is invalid", !isValidHeaderName("X\tCustom"));
check("non-string name is invalid", !isValidHeaderName(null));

check("ordinary value is valid", isValidHeaderValue("Hello, world/1.0 (test)"));
check("value with NUL is invalid", !isValidHeaderValue("a\u0000b"));
check("value with CR is invalid", !isValidHeaderValue("a\rb"));
check("value with LF is invalid", !isValidHeaderValue("a\nb"));
check("value with CRLF injection is invalid",
  !isValidHeaderValue("x\r\nX-Injected: 1"));
check("value with DEL is invalid", !isValidHeaderValue("a\u007fb"));
check("value with another C0 control is invalid (deliberate, stricter)",
  !isValidHeaderValue("a\u0001b"));
check("value with HTAB is invalid (KNOWN deviation: RFC allows it)",
  !isValidHeaderValue("a\tb"));
check("non-string value is invalid", !isValidHeaderValue(undefined));

check("bad name rejected through validateHeaderEntry",
  !validateHeaderEntry({ name: "X Custom", operation: "set", value: "1" }).valid);
check("bad value rejected through validateHeaderEntry",
  !validateHeaderEntry({ name: "X-A", operation: "set", value: "a\r\nb" }).valid);
check("remove operation ignores the value channel entirely",
  validateHeaderEntry({ name: "X-A", operation: "remove", value: "a\rb" }).valid);

// ------------------------------------------ rule-id range (finding 3, A3)

check("id 1 is valid", isValidRuleId(1));
check("id at the inferred maximum is valid", isValidRuleId(MAX_RULE_ID));
check("id 0 is invalid", !isValidRuleId(0));
check("negative id is invalid", !isValidRuleId(-1));
check("non-integer id is invalid", !isValidRuleId(1.5));
check("id above the inferred maximum is invalid", !isValidRuleId(MAX_RULE_ID + 1));
check("MAX_SAFE_INTEGER id is invalid", !isValidRuleId(Number.MAX_SAFE_INTEGER));
check("NaN id is invalid", !isValidRuleId(NaN));
checkThrows("import rejects an over-range id", () =>
  parseProfilesFile(validDoc([
    { id: MAX_RULE_ID + 1, name: "a", domains: ["a.com"],
      headers: [{ name: "x", operation: "set", value: "1" }] },
  ])), '"id" must be an integer');

// -------------------------------- generated rule ids (finding 9, A3 extended)
// A3 was written for the IMPORT path and satisfied there. The GENERATION path
// in saveProfile() was never covered, and finding 9 is what came through the
// gap. These checks pin the generator against the same bound import obeys.

const idSet = (...ids) => ids.map((id) => ({ id, name: "p", domains: ["a.com"],
  headers: [{ name: "x", operation: "set", value: "1" }] }));

check("first profile gets id 1", nextRuleId([]) === 1);
check("null profile set is treated as empty", nextRuleId(null) === 1);
check("contiguous ids allocate above the top", nextRuleId(idSet(1, 2, 3)) === 4);
check("a gap is filled before extending", nextRuleId(idSet(1, 3)) === 2);
check("the lowest gap wins, not the first found scanning ids",
  nextRuleId(idSet(2, 3, 5)) === 1);
check("unsorted input allocates the same as sorted",
  nextRuleId(idSet(3, 1, 2)) === nextRuleId(idSet(1, 2, 3)));
check("non-integer ids in storage do not block allocation",
  nextRuleId([{ id: "1" }, { id: null }, { id: 1.5 }]) === 1);

// THE FINDING 9 CASE ITSELF. max(id)+1 over a ceiling profile is 2147483648,
// which Chrome rejects as a 32-bit overflow and which the old generator wrote
// to storage unchecked. Both halves are pinned: the result must be in range,
// and it must specifically not be the overflowing value.
check("a ceiling profile does not poison the id space",
  nextRuleId(idSet(MAX_RULE_ID)) === 1);
check("generated id after a ceiling profile is valid",
  isValidRuleId(nextRuleId(idSet(MAX_RULE_ID))));
check("generated id after a ceiling profile is NOT max+1",
  nextRuleId(idSet(MAX_RULE_ID)) !== MAX_RULE_ID + 1);
check("ceiling plus a contiguous block still fills the gap",
  nextRuleId(idSet(1, 2, 3, MAX_RULE_ID)) === 4);

// The generator's output must satisfy the same predicate import enforces, and
// must never collide with a live id. Checked across a spread of shapes rather
// than one, so a fix that special-cases the ceiling alone does not pass.
let allValid = true;
let noCollision = true;
for (const ids of [[], [1], [1, 2, 3], [2, 3], [5, 9], [MAX_RULE_ID],
                   [1, MAX_RULE_ID], [MAX_RULE_ID - 1, MAX_RULE_ID]]) {
  const generated = nextRuleId(idSet(...ids));
  if (!isValidRuleId(generated)) allValid = false;
  if (ids.includes(generated)) noCollision = false;
}
check("every generated id is a valid rule id", allValid);
check("no generated id collides with an existing profile", noCollision);

// A generated id must survive the import path, which is the boundary the
// generator was failing to inherit from. Round-trips the invented id through
// parseProfilesFile rather than asserting about it in isolation.
// Caught rather than allowed to propagate on purpose: a generator regression
// makes parseProfilesFile THROW here, and an uncaught throw aborts the run
// mid-suite, which makes the mutation failure COUNT unreadable and skips the
// count tripwire entirely. This must register as a failed check, not a crash.
const generatedAfterCeiling = nextRuleId(idSet(MAX_RULE_ID));
check("a generated id round-trips through import validation",
  attempt(() => parseProfilesFile(validDoc(idSet(generatedAfterCeiling)))[0].id)
    === generatedAfterCeiling);

// ------------------------------------------- domain dedup (finding 7)
// The contract claimed set semantics for domains and the serializer did not
// honour them. These pin the conformance fix, NOT a format change: version
// stays 1 and no conforming file's bytes move.

check("normalizeDomains removes exact duplicates",
  normalizeDomains(["a.com", "a.com", "a.com"]).join(",") === "a.com");
check("normalizeDomains dedups case-insensitively",
  normalizeDomains(["example.com", "EXAMPLE.com", "Example.COM"]).join(",")
    === "example.com");
check("normalizeDomains sorts",
  normalizeDomains(["z.com", "a.com"]).join(",") === "a.com,z.com");
check("normalizeDomains tolerates a missing list",
  normalizeDomains(undefined).length === 0 && normalizeDomains(null).length === 0);
check("normalizeDomains drops non-strings rather than throwing",
  normalizeDomains(["a.com", 7, null, "a.com"]).join(",") === "a.com");
check("normalizeDomains is idempotent",
  normalizeDomains(normalizeDomains(["B.com", "b.com", "a.com"])).join(",")
    === normalizeDomains(["B.com", "b.com", "a.com"]).join(","));

// THE TEST C COUNTEREXAMPLE, kept as the regression fixture. This exact
// profile exported as ["example.com","example.com","example.com"] on v0.1.1
// while the status line read "1/1 domain granted".
const dupProfile = [{
  id: 1, name: "Test",
  domains: ["example.com", "EXAMPLE.com", "example.com"],
  headers: [{ name: "X-A", operation: "set", value: "1" }],
}];
check("canonical form of the Test C profile has ONE domain",
  canonicalizeProfiles(dupProfile)[0].domains.length === 1);
check("the duplicate set serializes identically to the singleton set",
  serializeProfiles(dupProfile)
    === serializeProfiles([{ ...dupProfile[0], domains: ["example.com"] }]));

// The contract's own two rules, checked against the shape that violated them.
check("identical SETS serialize to identical bytes regardless of duplicates",
  serializeProfiles([{ ...dupProfile[0], domains: ["a.com", "a.com", "b.com"] }])
    === serializeProfiles([{ ...dupProfile[0], domains: ["b.com", "a.com"] }]));
check("export -> import -> export stays byte-identical with duplicates in",
  serializeProfiles(dupProfile)
    === attempt(() => serializeProfiles(parseProfilesFile(serializeProfiles(dupProfile)))));
check("import accepts duplicates and returns the deduped set",
  attempt(() => parseProfilesFile(validDoc(dupProfile))[0].domains.join(",")) === "example.com");

// COUNT AGREEMENT (finding 7's second half). The chip list renders
// profile.domains and the status line counts referencedDomains(); they
// disagreed on screen. After normalization the two count the same thing, which
// is the property to pin — the popup wiring itself needs chrome.* and lives in
// SMOKE.md.
const canonicalDup = canonicalizeProfiles(dupProfile);
check("chip count equals status-line domain count after normalization",
  canonicalDup[0].domains.length === referencedDomains(canonicalDup).length);
check("count agreement holds across profiles sharing a domain",
  canonicalizeProfiles([
    { ...dupProfile[0], id: 1, domains: ["a.com", "a.com"] },
    { ...dupProfile[0], id: 2, domains: ["a.com", "B.com", "b.com"] },
  ]).reduce((n, p) => n + p.domains.length, 0) === 3);

// ------------------------------------- over-cap import refusal (finding 6)
// The cap is enforced at parse time so an over-cap file is REFUSED rather than
// accepted and silently truncated at the wire. Counted in profiles because
// grant state is unknowable here — see the comment in parseProfilesFile.

const bulk = (n, from = 1) => Array.from({ length: n }, (_, i) => ({
  id: from + i, name: `p${from + i}`, domains: ["a.com"],
  headers: [{ name: "X-A", operation: "set", value: "1" }],
}));

check("the cap constant is 5000, the unsafe-rule limit not the 30000 one",
  MAX_UNSAFE_DYNAMIC_RULES === 5000);
// Caught, not propagated. An off-by-one in the cap comparison makes this call
// THROW, and an uncaught throw aborts the run, prints no FAIL lines, and reads
// downstream as "no check caught this mutation" — which is how a missing test
// and a crashing one become indistinguishable. Same reason as the generated-id
// round-trip check below. Every success-expecting parseProfilesFile call in
// this suite must catch.
check("a file at exactly the cap is ACCEPTED",
  attempt(() => parseProfilesFile(validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES))).length)
    === MAX_UNSAFE_DYNAMIC_RULES);
checkThrows("a file one over the cap is REFUSED",
  () => parseProfilesFile(validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES + 1))),
  "more than the");
checkThrows("the refusal states the actual profile count",
  () => parseProfilesFile(validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES + 1))),
  String(MAX_UNSAFE_DYNAMIC_RULES + 1));
checkThrows("the refusal states the limit",
  () => parseProfilesFile(validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES + 1))),
  String(MAX_UNSAFE_DYNAMIC_RULES));

// The count check runs BEFORE per-profile validation, so an over-cap file gets
// the cap reason rather than a complaint about profile 4,312. Pinned because
// the ordering is the difference between an actionable message and a confusing
// one, and a later refactor could reorder it without noticing.
checkThrows("an over-cap file with a bad profile still reports the CAP",
  () => parseProfilesFile(validDoc([
    ...bulk(MAX_UNSAFE_DYNAMIC_RULES),
    { id: 99999, name: "", domains: ["a.com"],
      headers: [{ name: "X-A", operation: "set", value: "1" }] },
  ])), "more than the");

// A4 regression guard: refusal is a throw, so no caller can have applied
// anything. parseProfilesFile is pure — it returns a value or throws, and
// never mutates its input.
const preserved = validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES + 1));
let threw = false;
try { parseProfilesFile(preserved); } catch { threw = true; }
check("an over-cap import throws rather than returning a truncated set", threw);
check("an over-cap import leaves the source document untouched",
  JSON.parse(preserved).profiles.length === MAX_UNSAFE_DYNAMIC_RULES + 1);

// ------------------------------------------ badge honesty (finding 4, A5)
// The narrow half only: does the badge stop asserting ON when registration
// failed. activeRuleCount and the four-state scheme are NOT here on purpose.

check("enabled + successful sync shows ON",
  computeBadge({ enabled: true, syncOk: true }) === BADGE_ON);
check("disabled + successful sync shows OFF",
  computeBadge({ enabled: false, syncOk: true }) === BADGE_OFF);
check("enabled + FAILED sync does not show ON",
  computeBadge({ enabled: true, syncOk: false }) !== BADGE_ON);
check("enabled + FAILED sync shows the failure badge",
  computeBadge({ enabled: true, syncOk: false }) === BADGE_FAILED);
check("DISABLED + failed sync does not show OFF either (clear may have failed)",
  computeBadge({ enabled: false, syncOk: false }) === BADGE_FAILED);
check("badge text fits Chrome's badge (<= 4 chars) in every state",
  [BADGE_ON, BADGE_OFF, BADGE_FAILED].every((b) => b.text.length <= 4));
check("every badge state carries a colour",
  [BADGE_ON, BADGE_OFF, BADGE_FAILED].every((b) => /^#[0-9a-f]{6}$/i.test(b.color)));

check("status line says applying when enabled and synced",
  describeSync({ enabled: true, syncOk: true }) === "applying");
check("status line says paused when disabled and synced",
  describeSync({ enabled: false, syncOk: true }) === "paused");
check("status line does not claim applying after a failed sync",
  describeSync({ enabled: true, syncOk: false }) !== "applying");
check("status line does not claim paused after a failed sync",
  describeSync({ enabled: false, syncOk: false }) !== "paused");
check("failed-sync text names the failure rather than a stale good state",
  describeSync({ enabled: true, syncOk: false }).includes("failed"));
check("missing sync state defaults to ok, not to a claimed failure",
  DEFAULT_SYNC_STATE.ok === true &&
  computeBadge({ enabled: true, syncOk: DEFAULT_SYNC_STATE.ok }) === BADGE_ON);

// ------------------------------------------- serial queue (finding 5)
// Async, so these run after the synchronous checks above and their results
// are asserted before the count is read (see the await at the bottom).

async function queueChecks() {
  const order = [];
  const slow = (id, ms) => () =>
    new Promise((res) => setTimeout(() => { order.push(id); res(id); }, ms));

  // A later, faster call must not finish before an earlier, slower one.
  const q1 = createSerialQueue((fn) => fn()());
  const a = q1(() => slow("a", 30));
  const b = q1(() => slow("b", 0));
  await Promise.all([a, b]);
  check("later call cannot overtake an earlier one", order.join(",") === "a,b");

  // A rejected run must not poison the chain.
  let ran = 0;
  let caught = null;
  const q2 = createSerialQueue(
    async (shouldThrow) => {
      ran++;
      if (shouldThrow) throw new Error("boom");
    },
    (err) => { caught = err.message; }
  );
  await q2(true);
  await q2(false);
  check("a failed run does not stop later runs", ran === 2);
  check("the failure is surfaced to onError", caught === "boom");

  // Serialization must hold under a burst, which is the real shape: five
  // listeners can fire before the worker suspends.
  const seen = [];
  let active = 0;
  let overlapped = false;
  const q3 = createSerialQueue(async (id) => {
    active++;
    if (active > 1) overlapped = true;
    await new Promise((res) => setTimeout(res, 1));
    seen.push(id);
    active--;
  });
  await Promise.all([1, 2, 3, 4, 5].map((n) => q3(n)));
  check("no two runs overlap under a burst", !overlapped);
  check("burst runs complete in enqueue order", seen.join("") === "12345");

  // Missing onError must not itself throw.
  const q4 = createSerialQueue(async () => { throw new Error("silent"); });
  await q4();
  check("omitting onError is safe", true);
}

await queueChecks();

// -------------------------------------------------------------- result

const total = passed + failed;
if (failed > 0) {
  console.error(`selftest: ${failed} of ${total} checks FAILED`);
  process.exit(1);
}
if (total !== EXPECTED_CHECKS) {
  console.error(
    `selftest: count tripwire — ${total} checks ran, expected ${EXPECTED_CHECKS}. ` +
      `If checks were added or removed deliberately, update EXPECTED_CHECKS in the same commit.`
  );
  process.exit(1);
}
console.log(`selftest: ${total}/${EXPECTED_CHECKS} checks passed`);
