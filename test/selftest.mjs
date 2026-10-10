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
  deriveFacts,
  checkArtifacts,
  ARTIFACTS,
  REGISTERED_PATHS,
  PINNED_MANIFEST_VERSION,
} from "./release-consistency.mjs";
import {
  formToDraft,
  draftToForm,
  isValidDraft,
  draftDiffersFromProfile,
  profileToFormShape,
  DRAFT_VERSION,
} from "../extension/lib/draft.js";
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
  versionFor,
} from "../extension/lib/canonical.js";
import {
  diffDomainGrants,
  referencedDomains,
  originsForDomain,
  originsFor,
  isIpLiteral,
  isManagedOrigin,
  staleManagedOrigins,
  legacyOriginsForDomain,
  isLegacyOnlyGrant,
} from "../extension/lib/grants.js";
import {
  computeBadge,
  describeSync,
  classify,
  readSyncRecord,
  configRevision,
  BADGE_ON,
  BADGE_OFF,
  BADGE_FAILED,
  BADGE_PARTIAL,
  BADGE_STALE,
  DEFAULT_SYNC_STATE,
} from "../extension/lib/status.js";
// NAMESPACE IMPORT FOR SYMBOLS ADDED IN s2 (AR-01), deliberately. A named
// import of an export that does not exist is a LINK-TIME error: the whole
// suite dies before its first check, which reads as a crash rather than as the
// FAIL lines a missing function should produce. That holds for the red run and
// for any mutant that deletes the export. See test/PREDICTIONS-2026-09-27-s2.md.
import * as statusLib from "../extension/lib/status.js";
// Same reason, AR-01b: profileDigest, checkEditBase and describeEditRefusal
// arrive in canonical.js in s2, and a missing one must read as FAIL lines.
import * as canonicalLib from "../extension/lib/canonical.js";
// Same reason, AR-02 (s3): draftKeyFor, draftFor, baseForEditor,
// retainDraftsFor, createDraftStore and createDraftSession arrive in draft.js,
// and VALID_SIDES and VALID_OPERATIONS become exports of rules.js. See
// test/PREDICTIONS-2026-09-29-s3.md.
import * as draftLib from "../extension/lib/draft.js";
import * as rulesLib from "../extension/lib/rules.js";
import { createHash } from "node:crypto";
import {
  domainsOverlap,
  domainListsOverlap,
  headerNamesFor,
  headerKeysFor,
  sideOf,
  findCollisions,
  collidingProfileIds,
  describeCollisions,
  describeSaveRefusal,
  describeImportRefusal,
} from "../extension/lib/collisions.js";
import {
  createSerialQueue,
  createDebounced,
  runThenAlways,
  createActionGate,
  ACTION_REFUSED,
} from "../extension/lib/queue.js";
import { decodeStoredState } from "../extension/lib/stored.js";
import { validateProfile } from "../extension/lib/profile.js";
import {
  describeReadback,
  formatReadbackLine,
} from "../extension/lib/readback.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
// The registry of what the extension asks of Chrome (AR-11, AR-23). A
// namespace import, for the reason given above: a missing export must read
// as FAIL lines, not kill the suite at link time.
import * as platformFloor from "./platform-floor.mjs";
// DR-02 (s5): budget.js is new, so it comes in through a dynamic import caught
// to {}. Absent, or missing an export, it reads as FAIL lines, not a crash.
const budgetLib = await import("../extension/lib/budget.js").catch(() => ({}));

const EXPECTED_CHECKS = 668;

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
// `?.` ON BOTH, AND THE REASON IS NOT STYLE. These two checks predate v0.2.0,
// when profileToRule() always emitted requestHeaders and an unguarded access
// could not throw. The side split made the array OMITTABLE — it is assigned
// only when non-empty — so any mutation that routes these entries to the
// response side leaves requestHeaders undefined and these lines throw.
// mutate-collisions.py counts `^FAIL:` lines, so a throw aborts the suite and
// scores whatever happened to run first: the "legacy default flips" mutant
// died here at 2 fails with 307 checks never executed, and its real coverage
// was unmeasured. A check that throws is worse than one that fails, because
// it misreports. Reach for `?.` by default when indexing into any structure
// the builder may legitimately omit.
check("invalid header entries are filtered out",
  rule.action.requestHeaders?.length === 2);
// The guard must make a MISSING array fail, not pass. `"value" in ({})` is
// false, so defaulting the lookup to an empty object would have reported a
// pass on an absent array — the vacuous-success shape this whole edit exists
// to remove. The length conjunct short-circuits instead: undefined fails the
// check and the index never evaluates.
check("remove entry carries no value key",
  rule.action.requestHeaders?.length === 2 &&
  !("value" in rule.action.requestHeaders[1]));
check("resourceTypes is the full explicit list (main_frame default bug)",
  rule.condition.resourceTypes.length === RESOURCE_TYPES.length &&
  rule.condition.resourceTypes.includes("main_frame"));
check("no granted domains yields null", profileToRule(baseProfile, []) === null);

// ------------------------------------------ rule id is validated (R10, 0.2.0)
//
// isValidRuleId() shipped in v0.1.2 and its doc comment names this failure
// exactly — one out-of-range id fails the whole ATOMIC update, taking every
// other profile's rules with it. Nothing on the build path called it. sw.js
// meanwhile promised, directly above updateDynamicRules(), that rule validity
// was filtered out beforehand so one bad profile could not do that. The
// guarantee was stated and not delivered.
//
// Reachable because storage is untrusted input: parseProfilesFile() refuses
// bad ids on import and nextProfileId() cannot generate one, so nothing the UI
// offers arrives here. Same reasoning that retains the over-cap branch in
// sw.js rather than deleting it as unreachable.
const withId = (id) => profileToRule(
  { id, name: "p", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] },
  ["a.com"]
);
for (const badId of [0, -3, 1.5, "seven", null, undefined, NaN]) {
  check(`rule id refused: ${String(badId)}`, withId(badId) === null);
}
check("rule id accepted at the lower bound", withId(1)?.id === 1);
check("rule id accepted at MAX_RULE_ID", withId(MAX_RULE_ID)?.id === MAX_RULE_ID);
check("rule id refused above MAX_RULE_ID", withId(MAX_RULE_ID + 1) === null);

// buildRules() lives in sw.js and imports chrome.*, so it is checked by source
// scan in the popup/source-scan section below, where stripJsComments() is
// already defined — duplicate ids fail the atomic call by a different
// mechanism than invalid ones and need their own coverage.

// ------------------------------- total stored-state decoder (HW-V6-04)
//
// BEHAVIOURAL, NOT A SOURCE SCAN, and that is the point of the function
// living in lib/ at all. sw.js cannot be imported here — it calls chrome.* at
// module scope — so everything else in the worker is checked by reading it as
// text, which proves the shape of a fix and not its behaviour.
//
// What broke: `(stored[KEY] || []).map(...)` throws on a truthy non-array, and
// the read sat outside runSync's try. A user switching HeaderWright OFF with
// malformed profile data kept the old dynamic rules ACTIVE — headers went on
// being modified by an extension the user had turned off — with no status
// written and no badge update.
//
// The whole protection now rests on this function never throwing, so that is
// what is asserted, for every shape storage can actually hold.
const KEYS = { profiles: "hw:profiles", enabled: "hw:enabled" };
// RETURNS null ON THROW, and every check below must FAIL on null rather than
// crash. decodeStoredState is the function whose entire contract is "never
// throws", so the checks that verify the rest of its behaviour are exactly the
// ones a throwing mutant would abort — scoring whatever ran first and hiding
// the rest. Two mutants demonstrated this before the guard went in.
const decode = (raw, enabled = true) => {
  try {
    return decodeStoredState(
      { "hw:profiles": raw, "hw:enabled": enabled }, KEYS
    );
  } catch {
    return null;
  }
};

for (const [label, raw] of [
  ["undefined", undefined], ["null", null], ["an object", { a: 1 }],
  ["a string", "nope"], ["a number", 42], ["a boolean", true],
  ["an empty array", []], ["a null element", [null]],
  ["a string element", ["x"]], ["a nested array", [[1]]],
  ["unreadable domains", [{ id: 1, name: "p", domains: "a.com" }]],
]) {
  check(`HW-V6-04: decoding ${label} does not throw`, decode(raw) !== null);
}

// ENABLED IS INDEPENDENT OF PROFILE SHAPE. This is the line that makes disable
// work from a corrupt configuration: runSync never consults profiles when
// enabled is false, so nothing in them can keep stale rules registered.
check("HW-V6-04: enabled survives a completely malformed profiles value",
  decode({ junk: true }, true)?.enabled === true &&
  decode({ junk: true }, false)?.enabled === false);
check("HW-V6-04: a malformed profiles value yields no profiles and a reason",
  decode({ junk: true })?.profiles.length === 0 &&
  decode({ junk: true })?.problems.length === 1);
// ONE BAD PROFILE MUST NOT TAKE THE GOOD ONES DOWN. The old code threw on the
// whole array; the previous atomic-update defect had the same shape one layer
// down. Both are the same mistake: letting one bad record decide for the rest.
// THE "GOOD" PROFILE HERE MUST ACTUALLY BE GOOD. The first version used
// `headers: []`, which the shallow decoder accepted and the converged
// validator correctly rejects — so the check was asserting that a valid
// profile survives while supplying an invalid one. It failed the moment the
// validators converged, which is the check working.
const mixed = decode([
  { id: 1, name: "ok", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v" }] },
  null,
]);
check("HW-V6-04: a valid profile survives alongside an invalid one",
  mixed?.profiles.length === 1 && mixed?.profiles[0].id === 1 &&
  mixed?.problems.length === 1);
// Malformed entries are DROPPED, never repaired. Guessing what a corrupt
// record meant is how the wrong-side defects happened.
// ------------------------------- one validator, two modes (HW-V7-01)
//
// THE POINT IS CONVERGENCE, NOT ANOTHER GUARD. Three external reviews found
// defects living between eight separate answers to "is this profile valid?".
// The strict per-profile rules were inline in canonical.js, a shallower shape
// check was inline in stored.js, and the popup read storage with its own
// third interpretation. All three now route through lib/profile.js.
//
// These checks assert the two modes agree on the RULES and differ only in the
// RESPONSE to failure: import rejects the file, storage drops the record.
const strictOf = (profile) => {
  try {
    parseProfilesFile(JSON.stringify({
      format: FILE_FORMAT, version: 2, profiles: [profile],
    }));
    return null;
  } catch (err) {
    return err.message;
  }
};
// GUARDED. decodeStoredState's entire contract is that it does not throw, so
// the checks verifying the rest of its behaviour are precisely the ones a
// throwing mutant would abort — scoring whatever ran first and hiding the
// rest. Returning null makes the refusal a FAIL.
const tolerantOf = (profile) => {
  try {
    return decodeStoredState(
      { "hw:profiles": [profile], "hw:enabled": true }, KEYS
    );
  } catch {
    return null;
  }
};

for (const [label, profile] of [
  ["headers is an object", { id: 2, name: "b", domains: ["a.com"], headers: {} }],
  ["id is zero", { id: 0, name: "b", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["name is empty", { id: 2, name: "", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["domains is empty", { id: 2, name: "b", domains: [], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["headers is empty", { id: 2, name: "b", domains: ["a.com"], headers: [] }],
  ["unknown profile field", { id: 2, name: "b", domains: ["a.com"], colour: "red", headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["misspelled side", { id: 2, name: "b", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v", side: "respones" }] }],
]) {
  // Both modes must AGREE this is invalid. A shape one accepts and the other
  // rejects is exactly the seam every one of these defects crossed.
  check(`HW-V7-01: both modes reject — ${label}`,
    strictOf(profile) !== null &&
    tolerantOf(profile)?.profiles.length === 0 &&
    tolerantOf(profile)?.problems.length === 1);
}

// AND A VALID PROFILE MUST SURVIVE BOTH. A validator that rejected everything
// would pass every check above.
const okProfile = { id: 3, name: "ok", domains: ["a.com"],
  headers: [{ name: "x", operation: "set", value: "v" }] };
// ------------------------- writer/reader symmetry (HW-V7-02)
//
// THE INVARIANT, MADE EXECUTABLE: everything serializeProfiles() accepts,
// parseProfilesFile() accepts. It did not hold. The writer checked field names
// and header values and nothing else, so this build serialized profiles its
// own importer rejected — an export the user believes they have and does not:
//
//     {id: 0, name: "", domains: []}  ->  serialized fine, then rejected
//
// Table-driven rather than one example, because the asymmetry existed for
// every profile-level field independently and a single case would have proved
// only that one of them was fixed.
const SYMMETRY_CASES = [
  ["id zero", { id: 0, name: "n", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["id negative", { id: -1, name: "n", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["id NaN", { id: NaN, name: "n", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["id fractional", { id: 1.5, name: "n", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["name empty", { id: 1, name: "", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["name blank", { id: 1, name: "   ", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["domains empty", { id: 1, name: "n", domains: [], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["domain invalid", { id: 1, name: "n", domains: ["not a domain"], headers: [{ name: "x", operation: "set", value: "v" }] }],
  ["headers empty", { id: 1, name: "n", domains: ["a.com"], headers: [] }],
  ["headers object", { id: 1, name: "n", domains: ["a.com"], headers: {} }],
];

for (const [label, profile] of SYMMETRY_CASES) {
  // NaN is the awkward one: the stable JSON writer emits it as null, so the
  // value CHANGES before the reader ever sees it. Refusing at write time is
  // the only point where the original fault is still visible.
  check(`HW-V7-02: export refuses what import would reject — ${label}`,
    attempt(() => serializeProfiles([profile])) === THREW);
}

// AND THE INVARIANT ITSELF, over everything the writer does accept.
check("HW-V7-02: anything serializeProfiles accepts, parseProfilesFile accepts",
  [
    [{ id: 1, name: "n", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] }],
    [{ id: 1, name: "n", domains: ["a.com"], headers: [{ name: "x", operation: "remove" }] }],
    [{ id: 1, name: "n", domains: ["A.com", "a.com"], headers: [{ name: "X", operation: "set", value: "v", side: "response" }] }],
    [{ id: 2, name: "n", domains: ["a.com"], headers: [{ name: "x", operation: "set", value: "v" }] },
     { id: 1, name: "m", domains: ["b.com"], headers: [{ name: "y", operation: "set", value: "w" }] }],
  ].every((profiles) => {
    const text = attempt(() => serializeProfiles(profiles));
    if (text === THREW) return false;
    return attempt(() => parseProfilesFile(text)) !== THREW;
  }));

// THE ENVELOPE GETS THE SAME POLICY AS PROFILES AND HEADERS. It was the one
// level never checked, so an unknown top-level key was accepted and silently
// dropped — in the file whose comment claimed unknown fields were refused.
checkThrows("HW-V7-02: an unknown top-level field is refused, not dropped", () =>
  parseProfilesFile(JSON.stringify({
    format: FILE_FORMAT, version: 1, futureEnvelopeField: "keep", profiles: [],
  })), 'unknown top-level field "futureEnvelopeField"');
check("HW-V7-02: the three known envelope keys are still accepted",
  attempt(() => parseProfilesFile(JSON.stringify({
    format: FILE_FORMAT, version: 1,
    profiles: [{ id: 1, name: "n", domains: ["a.com"],
      headers: [{ name: "x", operation: "set", value: "v" }] }],
  }))) !== THREW);

check("HW-V7-01: both modes accept a valid profile",
  strictOf(okProfile) === null &&
  tolerantOf(okProfile)?.profiles.length === 1 &&
  tolerantOf(okProfile)?.problems.length === 0);

check("HW-V6-04: problems name which profile, not just that there was one",
  /profile 2/.test(mixed?.problems[0] ?? ""));

// -------------------------------------- mutation harness safety (HW-V6-06)
//
// A VERIFICATION COMMAND MUST NOT BE ABLE TO BREAK THE PRODUCT. All three
// harnesses used to write mutants into the real tree and restore only on
// normal completion. SIGKILL mid-run left collisions.js carrying the
// FINDING-021 mutant, and because each harness captures its "original" at
// startup, the NEXT run would have baselined on the mutant and reported green
// against a broken file.
//
// Source scan, because these are Python and this suite is Node. What it pins
// is the property, not the implementation: mutants must land in a copy, and
// the harness must reach its own verdict rather than leaving the reader to
// notice problems in its output.
const harnesses = ["mutate-collisions", "mutate-grants", "mutate-scans"].map(
  (name) => [name, readFileSync(new URL(`./${name}.py`, import.meta.url), "utf8")]
);
for (const [name, src] of harnesses) {
  check(`HW-V6-06: ${name}.py mutates a disposable copy, not the source`,
    /ROOT = disposable_root\(SOURCE_ROOT\)/.test(src) &&
    !/^ROOT = pathlib\.Path\(__file__\)/m.test(src));
  // The before/after digest is evidence rather than defence — the copy already
  // provides the protection. It exists so "mutation testing does not modify
  // the source" is measured every run instead of asserted in a comment, which
  // is this project's most repeated defect.
  // PIN THE EXIT DECISION, NOT THE WARNING. The first version of this check
  // matched the digest comparison anywhere in the file, so deleting the
  // warning print still passed — the mutant scored ZERO and exposed it. What
  // makes the assertion load-bearing is that the digest participates in
  // whether the harness FAILS, not that it prints something.
  check(`HW-V6-06: ${name}.py fails when the source tree changed`,
    /DIGEST_AFTER = tree_digest\(SOURCE_ROOT\)/.test(src) &&
    /sys\.exit\(1\)/.test(src) &&
    /(if|or) .*DIGEST_AFTER != DIGEST_BEFORE:\n    sys\.exit\(1\)/.test(src));
  check(`HW-V6-06: ${name}.py exits nonzero on its own findings`,
    /sys\.exit\(1\)/.test(src));
}

// ------------------------------------------------------- manifest (R6, 0.2.0)
//
// NOTHING IN THIS SUITE READ THE MANIFEST BEFORE v0.2.0. The emitted rule
// shape depends on what Chrome accepts, so an install on an older Chrome gets
// an extension that cannot execute what it builds.
const manifest = JSON.parse(
  readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8")
);
check("manifest declares minimum_chrome_version",
  typeof manifest.minimum_chrome_version === "string");
// THE FLOOR IS NO LONGER PINNED HERE. It was pinned to "101", the version of
// requestDomains alone, and so it never noticed optional_host_permissions
// (102) or a request append (108). It is now DERIVED from
// test/platform-floor.mjs in the platform-floor section below (AR-11).
// Moving it is still a deliberate act that fails the suite until the
// manifest and README follow.
check("manifest still requests declarativeNetRequestWithHostAccess",
  (manifest.permissions || []).includes("declarativeNetRequestWithHostAccess"));

// ------------------------------------------------------------- drafts (F042)
//
// FINDING-042: the popup discarded in-progress edits on focus loss. The fix is
// snapshot-and-restore rather than a confirm-on-close SPECIFICALLY so it can
// be held here — a prompt is only testable in a browser, and this project has
// spent three sittings on defects only a browser could see.
//
// THE POINT OF EVERY CHECK BELOW IS THAT A DRAFT IS RAW, NOT NORMALIZED.
// readForm() lowercases and sorts domains and drops blank rows because it
// produces something fit to save. Restoring that would rewrite the user's
// typing mid-edit, which is a quieter version of the defect being fixed.
// s3 (AR-02): a draft for a saved profile is valid only with the base it was
// written against. A well-formed stand-in, not a real digest.
const F042_BASE = "sha256:profile-v1:" + "f".repeat(64);
const rawForm = {
  editingProfileId: 2,
  baseDigest: F042_BASE,
  name: "  probe  ",
  domains: "EXAMPLE.com,   api.Example.com , ",
  rows: [
    { name: "X-A", side: "request", operation: "set", value: "1" },
    { name: "", side: "request", operation: "set", value: "" },
    { name: "X-B", side: "response", operation: "remove", value: "" },
  ],
};
const roundTripped = draftToForm(formToDraft(rawForm));

// NULL-GUARDED since s3. An unrestorable draft made roundTripped null and the
// next line threw at top level, which crashes the suite instead of failing a
// check (the standing rule: a check must FAIL, never THROW). s3's mutants
// reach that state on purpose.
check("F042: a draft round-trips the raw name, untrimmed",
  roundTripped !== null && roundTripped.name === "  probe  ");
check("F042: a draft round-trips the raw domains string, unnormalized",
  roundTripped !== null && roundTripped.domains === "EXAMPLE.com,   api.Example.com , ");
check("F042: a draft keeps blank rows",
  roundTripped !== null && roundTripped.rows.length === 3 && roundTripped.rows[1].name === "");
check("F042: a draft keeps the side and operation of each row",
  roundTripped !== null && roundTripped.rows[2].side === "response" &&
    roundTripped.rows[2].operation === "remove");
check("F042: a draft carries which profile was being edited",
  roundTripped !== null && roundTripped.editingProfileId === 2);
check("F042: a new-profile draft carries a null id",
  formToDraft({ ...rawForm, editingProfileId: null }).editingProfileId === null);

// REJECT RATHER THAN REPAIR. A half-restored malformed draft would put
// unexplained text into a form the user is about to save.
check("F042: a draft from a future version is refused",
  !isValidDraft({ ...formToDraft(rawForm), version: DRAFT_VERSION + 1 }));
check("F042: a draft with a non-array rows field is refused",
  !isValidDraft({ ...formToDraft(rawForm), rows: "nope" }));
check("F042: a draft with a malformed row is refused",
  !isValidDraft({ ...formToDraft(rawForm), rows: [{ name: "X" }] }));
check("F042: draftToForm returns null for anything unrestorable",
  draftToForm({ version: 999 }) === null && draftToForm(null) === null);

// THE MARKER MUST NOT NAG. Opening the editor and closing it again leaves a
// draft identical to storage; marking that would teach the user to ignore the
// marker, which is the one thing it cannot afford.
const savedProfile = {
  id: 2,
  name: "probe",
  domains: ["hw.test"],
  headers: [
    { name: "X-HW-Probe", operation: "set", value: "present" },
    { name: "X-HW-Oracle", side: "response", operation: "set", value: "rewritten" },
  ],
};
const untouched = formToDraft({
  ...profileToFormShape(savedProfile, sideOf),
  baseDigest: F042_BASE,
});
// The validity guard is s3's: an INVALID draft is never marked either, so
// without it this check passes for the wrong reason.
check("F042: a draft matching the saved profile is not marked unsaved",
  isValidDraft(untouched) && !draftDiffersFromProfile(untouched, savedProfile, sideOf));

const edited = formToDraft({
  ...profileToFormShape(savedProfile, sideOf),
  baseDigest: F042_BASE,
  rows: [
    { name: "X-HW-Probe", side: "request", operation: "set", value: "CHANGED" },
    { name: "X-HW-Oracle", side: "response", operation: "set", value: "rewritten" },
  ],
});
check("F042: a draft differing in a header value IS marked unsaved",
  draftDiffersFromProfile(edited, savedProfile, sideOf));

// THE SIDELESS-MEANS-REQUEST RULE MUST SURVIVE THE PROJECTION. The stored
// shape omits `side` for request entries and the form always carries one, so
// comparing stored shapes directly would report a difference for every profile
// the moment the editor opened.
check("F042: projecting a sideless stored entry yields side=request",
  profileToFormShape(savedProfile, sideOf).rows[0].side === "request");
check("F042: an empty profile projects to one blank row",
  profileToFormShape(null, sideOf).rows.length === 1 &&
    profileToFormShape(null, sideOf).rows[0].name === "");

// ------------------------------------ registered-rule readback (F040/F043)
//
// FINDING-040 and FINDING-043, ruled together 2026-09-21 (project-planning
// decisions.md). The card renders what getDynamicRules() returned, so a `set`
// the operator meant as a `remove` reads "set", and a clipped header name is
// shown in full. Checks 1–15 of test/PREDICTIONS-2026-09-21-readback.md, in
// that order. Every call goes through attempt(): a throw must FAIL a check,
// never abort the run.

const rbRule = (requestHeaders, responseHeaders) => {
  const action = { type: "modifyHeaders" };
  if (requestHeaders !== undefined) action.requestHeaders = requestHeaders;
  if (responseHeaders !== undefined) action.responseHeaders = responseHeaders;
  return { id: 2, priority: 1, action, condition: {} };
};
const rbText = (r) =>
  r === THREW ? [] : r.lines.map((line) => formatReadbackLine(line));
const rbMixed = rbRule(
  [
    { header: "X-HW-Probe", operation: "set", value: "present" },
    { header: "X-HW-Second", operation: "append", value: "b" },
  ],
  [{ header: "X-HW-Oracle", operation: "set", value: "rewritten" }]
);

const rb1 = attempt(() => describeReadback({ syncState: "applied", rule: null }));
check("RB: applied with no registered rule reads 'none', with no lines",
  rb1 !== THREW && rb1.kind === "none" && rb1.lines.length === 0);

const rb2 = attempt(() => describeReadback({ syncState: "stale", rule: rbMixed }));
check("RB: stale shows NO lines even when a rule is registered",
  rb2 !== THREW && rb2.kind === "checking" && rb2.lines.length === 0);

const rb3 = attempt(() => describeReadback({ syncState: "paused", rule: rbMixed }));
check("RB: paused shows NO lines even when a rule is registered",
  rb3 !== THREW && rb3.kind === "off" && rb3.lines.length === 0);

const rb4 = attempt(() => describeReadback({ syncState: "applied", rule: rbMixed }));
check("RB: request lines precede response lines, each in array order",
  JSON.stringify(rbText(rb4)) === JSON.stringify([
    'req \u00b7 set \u00b7 X-HW-Probe \u2192 "present"',
    'req \u00b7 append \u00b7 X-HW-Second \u2192 "b"',
    'res \u00b7 set \u00b7 X-HW-Oracle \u2192 "rewritten"',
  ]));

check("RB: an entry in responseHeaders is labelled res",
  rb4 !== THREW && rb4.lines[2] && rb4.lines[2].side === "res" &&
    rb4.lines[0].side === "req");

const rb6 = attempt(() => describeReadback({ syncState: "applied",
  rule: rbRule(undefined, [{ header: "X-HW-Removable", operation: "remove" }]) }));
check("RB: a remove line carries no arrow and no value",
  rbText(rb6)[0] === "res \u00b7 remove \u00b7 X-HW-Removable");

const rb7 = attempt(() => describeReadback({ syncState: "applied",
  rule: rbRule([{ header: "X-Empty", operation: "set", value: "" }]) }));
check("RB: a set with an empty value renders the empty quotes",
  rbText(rb7)[0] === 'req \u00b7 set \u00b7 X-Empty \u2192 ""');

const rbLong = "X-HeaderWright-A-Very-Long-Custom-Header-Name-For-Testing";
const rb8 = attempt(() => describeReadback({ syncState: "applied",
  rule: rbRule([{ header: rbLong, operation: "set", value: "v" }]) }));
check("RB: a 40+ character header name appears in full",
  rbLong.length >= 40 && (rbText(rb8)[0] || "").includes(rbLong));

// THE INVISIBLE VARIANT. C8's exact mis-build: a `set` whose value is what the
// fixture already sends. The wire shows no change; the card must show "set".
const rb9 = attempt(() => describeReadback({ syncState: "applied",
  rule: rbRule(undefined, [{ header: "X-HW-Removable", operation: "set", value: "present" }]) }));
const rb9Line = rbText(rb9)[0] || "";
check("RB: F040 invisible variant reads set and the value, never remove",
  rb9Line.includes("set") && rb9Line.includes('"present"') &&
    !rb9Line.includes("remove"));

// S2's near-miss: two rows that rendered identically in the editor.
const rb10 = attempt(() => describeReadback({ syncState: "applied",
  rule: rbRule([
    { header: "X-Forwarded-For", operation: "append", value: "bravo" },
    { header: "X-Forwarded", operation: "set", value: "alpha" },
  ]) }));
const rb10Text = rbText(rb10);
check("RB: F043 pair X-Forwarded / X-Forwarded-For renders two distinct lines",
  rb10Text.length === 2 && rb10Text[0] !== rb10Text[1] &&
    rb10Text[0].includes("X-Forwarded-For ") && rb10Text[1].includes("X-Forwarded "));

const rb11 = attempt(() => describeReadback({ syncState: "failed", rule: rbMixed }));
check("RB: failed keeps the still-registered lines, with a note",
  rb11 !== THREW && rb11.kind === "previous" && rb11.lines.length === 3 &&
    typeof rb11.note === "string" && rb11.note.length > 0);

const rb12 = attempt(() => describeReadback({ syncState: "partial", rule: rbMixed }));
check("RB: partial with a rule reads as entries",
  rb12 !== THREW && rb12.kind === "entries" && rb12.lines.length === 3);

const rb13 = attempt(() => describeReadback({ syncState: "applied",
  rule: rbRule([{ header: "X-Pad", operation: "set", value: "  padded  " }]) }));
check("RB: edge whitespace in a value survives inside the quotes",
  rbText(rb13)[0] === 'req \u00b7 set \u00b7 X-Pad \u2192 "  padded  "');

const rb14 = attempt(() => describeReadback({ syncState: "applied",
  rule: rbRule({ header: "X-Not-An-Array", operation: "set", value: "v" }) }));
check("RB: a non-array requestHeaders reads 'unreadable' and does not throw",
  rb14 !== THREW && rb14.kind === "unreadable" && rb14.lines.length === 0);

const rb15 = attempt(() => describeReadback({ syncState: "applied", rule: rbRule() }));
check("RB: a rule with neither header list reads 'none'",
  rb15 !== THREW && rb15.kind === "none" && rb15.lines.length === 0);


// ---------------------------------------- manifest user-facing copy (F039)
//
// FINDING-039. The 0.2.0 candidate shipped with a description reading "Set,
// append, and remove HTTP request headers by profile" on a release whose
// entire subject is RESPONSE headers. It drifted for a whole cycle and was
// caught only because it happened to be on screen in a browser sitting —
// nothing in this suite read the field. `SCOPE.md` had the same defect and was
// fixed in `07d9763`; the manifest was the copy nobody checked.
//
// THE CHECKS ARE DERIVED, NOT PINNED TO PROSE. A test that asserts the exact
// string would pass on any reword, including a wrong one, and would have to be
// edited every time the copy is improved. These ask instead whether the copy
// AGREES WITH THE CODE: if profileToRule() emits responseHeaders, the
// user-facing text may not describe the extension as request-only.
const emitsResponseHeaders = Boolean(
  profileToRule(
    { id: 1, name: "P", domains: ["a.com"],
      headers: [{ name: "X-R", side: "response", operation: "set", value: "v" }] },
    ["a.com"]
  )?.action?.responseHeaders?.length
);
check("F039: the tree emits responseHeaders (premise of the copy checks)",
  emitsResponseHeaders);

// The description must not promise what the validator refuses. Response-side
// append is refused in this release (see validateHeaderEntry); a description
// naming `append` without scoping it to requests is a promise the product
// does not keep.
const appendRefusedOnResponse = validateHeaderEntry(
  { name: "Accept", side: "response", operation: "append", value: "v" }
).valid === false;
check("F039: response-side append is refused (premise of the copy checks)",
  appendRefusedOnResponse);

const desc = String(manifest.description || "");
check("F039: the description mentions response headers",
  !emitsResponseHeaders || /response/i.test(desc));
// DELIBERATELY BRITTLE, and the first draft of it was too loose: it asked only
// that "request" appear after "append", which the stale copy "append, and
// remove HTTP request and response headers" satisfies while making exactly the
// false promise. Caught by mutating the description back. The check now
// demands an explicit request-only qualifier, so rewording the scope forces a
// deliberate edit here — the same trade the oracle's phase-inversion check
// makes.
check("F039: the description scopes append to requests only",
  !appendRefusedOnResponse || !/append/i.test(desc) ||
  /append[^.;]*request[- ]only|request[- ]only[^.;]*append/i.test(desc));

// Chrome's manifest reference: description is "no more than 132 characters"
// (developer.chrome.com, manifest/description, re-checked 2026-09-20). An
// over-length description is a STORE SUBMISSION failure, which is the worst
// place to discover it. Not verified empirically here — the docs are the
// source, and that is stated rather than implied.
check("F039: the description is within Chrome's 132-character limit",
  desc.length > 0 && desc.length <= 132);

// THE NAME IS NOW CHECKED TOO. It read "HeaderWright — Modify HTTP Request
// Headers" through the whole v0.2.0 cycle. Renaming a published extension
// affects store search and existing links, so it was held as a RULING rather
// than slipped into a defect fix; ruled 2026-09-20 to "HeaderWright — Modify
// HTTP Headers", dropping one word. See
// `antrixy/project-planning/handoffs/headerwright/decisions-entry-manifest-name.md`.
//
// Same derived form as the description checks: the name may not describe the
// extension as request-side when the tree emits responseHeaders. A name that
// says BOTH is fine — this rejects the request-only claim, not the word.
const name = String(manifest.name || "");
check("F039: the name does not claim request-only while responses are emitted",
  !emitsResponseHeaders || !/request/i.test(name) || /response/i.test(name));

// Chrome's manifest reference: name is "maximum of 75 characters"
// (developer.chrome.com, manifest/name, checked 2026-09-20). Docs are the
// source; not verified empirically here, and that is stated rather than
// implied — the same footing as the 132-character description limit above.
check("F039: the name is within Chrome's 75-character limit",
  name.length > 0 && name.length <= 75);
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

// attempt() ON EVERY RAW SERIALIZE FROM HERE DOWN. These calls could not throw
// before v0.2.0: canonicalizeProfiles() rebuilt entries from a fixed list and
// refused nothing. It now refuses unknown fields (R24) and invalid values in
// known fields (HW-V6-05), so any mutation that makes a fixture invalid turns
// these into aborts rather than failures. One did: flipping the legacy side
// default made an `append` entry read as a response, which the export path
// correctly refuses — and the suite died there with 380 checks unrun.
const s1 = attempt(() => serializeProfiles(messyProfiles));
check("serializing twice is byte-identical",
  s1 !== THREW && s1 === attempt(() => serializeProfiles(messyProfiles)));
check("profile input order does not affect bytes",
  s1 !== THREW && s1 === attempt(() => serializeProfiles([messyProfiles[1], messyProfiles[0]])));
check("round-trip (parse then serialize) is byte-identical",
  s1 !== THREW && s1 === attempt(() => serializeProfiles(parseProfilesFile(s1))));
check("output ends with exactly one trailing newline",
  typeof s1 === "string" && s1.endsWith("}\n") && !s1.endsWith("\n\n"));
// GUARDED WRAPPER, USED FOR EVERY CANONICALIZE IN THIS FILE.
// canonicalizeProfiles() was total until v0.2.0 and now refuses unknown fields
// (R24) and invalid values in known fields (HW-V6-05). That turned every
// existing call site into a potential ABORT rather than a failure: a mutation
// which makes a shared fixture invalid kills the run wherever it is first
// touched, and the printed count is whatever happened to execute first.
// Returning [] means an unexpected refusal FAILS the check that relied on it
// and leaves the rest of the suite measurable.
const canon = (profiles) => {
  try {
    return canonicalizeProfiles(profiles);
  } catch {
    return [];
  }
};

check("domains are sorted and lowercased in canonical form",
  canon(messyProfiles)[0]?.domains[0] === "localhost" &&
  canon(messyProfiles)[1]?.domains.join(",") === "a.example.com,z.example.com");
check("header order is preserved (not sorted)",
  canon(messyProfiles)[1]?.headers[0].name === "X-Two");
check("stableStringify sorts object keys",
  stableStringify({ b: 1, a: 2 }) === '{\n  "a": 2,\n  "b": 1\n}');
check("stableStringify handles empty object and array",
  stableStringify({}) === "{}" && stableStringify([]) === "[]");

const validDoc = (profiles) =>
  JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, profiles });

// ------------------------------------------- the codec's side field (v0.2.0)
//
// THE INVARIANT THAT WAS MISSING. Every other module learned about `side` in
// the v0.2.0 build order — predicate, validator, builder, surface — and the
// codec was not in that list. It rebuilt each entry from a fixed field list,
// so export silently turned a response header into a request header: the exact
// defect the ruling refused to ship when it declined to release the validator
// without the builder, reappearing one module over. Caught in review, not by
// this suite, which had no end-to-end assertion crossing the codec at all.
//
// The shape below is the point: serialize -> parse -> profileToRule, and
// assert on the RULE rather than on the parsed object. Checking that `side`
// survives parsing would have passed against a codec that preserved the field
// and a builder that ignored it.

// RETURNS null RATHER THAN THROWING, and the checks below must fail on null.
// parseProfilesFile() is a throwing API and this helper sits inside check()'s
// eagerly-evaluated argument, so a mutation that makes the round trip refuse
// would abort the whole suite and score whatever ran first — the crash-hides-
// coverage failure this suite already carries a fix for. Caught here, the
// refusal becomes an ordinary FAIL.
const sideRoundTrip = (entry) => {
  try {
    const profiles = [{ id: 1, name: "p", domains: ["a.com"], headers: [entry] }];
    const back = parseProfilesFile(serializeProfiles(profiles));
    return profileToRule(back[0], ["a.com"]).action;
  } catch {
    return null;
  }
};

const rtResponse = sideRoundTrip({ name: "x-h", operation: "set", value: "v", side: "response" });
check("codec: a response entry is still a response header after a round trip",
  rtResponse?.responseHeaders?.length === 1 &&
  rtResponse?.requestHeaders === undefined);

const rtRequest = sideRoundTrip({ name: "x-h", operation: "set", value: "v" });
check("codec: a sideless entry is still a request header after a round trip",
  rtRequest?.requestHeaders?.length === 1 &&
  rtRequest?.responseHeaders === undefined);

check("codec: canonicalization preserves side: response",
  canon([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v", side: "response" }] }]
  )[0].headers[0].side === "response");
// Request stays absence. Emitting side: "request" would rewrite the bytes of
// every existing export for no change in meaning, and would drag every
// request-only file up to version 2 for nothing.
check("codec: canonicalization writes request as absence, not side: \"request\"",
  !("side" in canon([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v" }] }]
  )[0].headers[0]));

// VERSION ANSWERS "WHAT MUST A READER UNDERSTAND", not "what wrote this".
check("codec: a request-only set still exports as version 1",
  versionFor([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v" }] }]) === 1);
check("codec: any response entry raises the set to version 2",
  versionFor([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v" },
              { name: "y", operation: "set", value: "v", side: "response" }] }]) === 2);
// ASSERT ON THE SERIALIZED BYTES, NOT ONLY ON versionFor(). Testing the helper
// leaves serializeProfiles() free to ignore it — a mutation that stamped
// FILE_VERSION unconditionally scored ZERO against the two checks above, which
// is how this gap was found.
check("codec: serializeProfiles stamps the computed version, not the build's",
  JSON.parse(serializeProfiles([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v" }] }])).version === 1 &&
  JSON.parse(serializeProfiles([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v", side: "response" }] }])).version === 2);
check("codec: version 1 files are still readable",
  parseProfilesFile(JSON.stringify({ format: FILE_FORMAT, version: 1, profiles: [
    { id: 1, name: "p", domains: ["a.com"],
      headers: [{ name: "x", operation: "set", value: "v" }] }] })).length === 1);

// THE ONE THAT MAKES THE BUMP WORTH ANYTHING. A file carrying v2 meaning while
// claiming v1 would be accepted by every shipped 0.1.x build and applied on the
// request side — a misapplication rather than a refusal.
checkThrows("codec: side inside a version 1 envelope is refused", () =>
  parseProfilesFile(JSON.stringify({ format: FILE_FORMAT, version: 1, profiles: [
    { id: 1, name: "p", domains: ["a.com"],
      headers: [{ name: "x", operation: "set", value: "v", side: "response" }] }] })),
  "requires version 2");
checkThrows("codec: an unknown header field is refused, not dropped", () =>
  parseProfilesFile(JSON.stringify({ format: FILE_FORMAT, version: 2, profiles: [
    { id: 1, name: "p", domains: ["a.com"],
      headers: [{ name: "x", operation: "set", value: "v", flavour: "q" }] }] })),
  "unknown field");
// EXPORT-SIDE STRICTNESS. The v0.2.0 unknown-field refusal guarded only the
// READ path, and R1 was a WRITE-path bug: the popup stored `side`, the
// canonicalizer rebuilt from a fixed list, and the field never reached a file
// for any reader to refuse. A strict reader cannot refuse what it is never
// shown. These pin the direction the original defect actually travelled.
checkThrows("codec: serializing an unknown ENTRY field throws, never drops", () =>
  serializeProfiles([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v", futureField: "keep" }] }]),
  "unknown field");
checkThrows("codec: serializing an unknown PROFILE field throws, never drops", () =>
  serializeProfiles([{ id: 1, name: "p", domains: ["a.com"], futureField: "keep",
    headers: [{ name: "x", operation: "set", value: "v" }] }]),
  "unknown field");
check("codec: the export refusal names the field and where it is",
  (() => {
    try {
      serializeProfiles([{ id: 7, name: "p", domains: ["a.com"],
        headers: [{ name: "x", operation: "set", value: "v", zzz: 1 }] }]);
      return false;
    } catch (err) {
      // Position AND id: position correlates with the importer's messages,
      // the id finds the profile in a large file.
      return err.message.includes("profile 1 (id 7)") &&
             err.message.includes("header 1") && err.message.includes("zzz");
    }
  })());

// ------------------------- known fields, invalid VALUES (HW-V6-05)
//
// R24 made the export path refuse unknown FIELD NAMES. It said nothing about
// what is IN a known field, so `side: "respones"` — a plain typo — passed the
// field check, failed no test, and was written out with the side dropped. It
// re-imported as a REQUEST header: the original wrong-side defect, reached
// through a misspelling instead of a missing field.
//
// validateHeaderEntry() already refused unknown sides and operations. The
// export path simply never asked it. A strict reader and a permissive writer
// is what this entire class of defect is made of.
checkThrows("codec: a misspelled side is refused on export, not silently dropped", () =>
  serializeProfiles([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v", side: "respones" }] }]),
  'unknown side "respones"');
// Case matters: sideOf() compares exactly, so "REQUEST" would read as request
// by accident rather than by agreement.
checkThrows("codec: a wrong-case side is refused on export", () =>
  serializeProfiles([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v", side: "REQUEST" }] }]),
  "unknown side");
checkThrows("codec: an unknown operation is refused on export", () =>
  serializeProfiles([{ id: 1, name: "p", domains: ["a.com"],
    headers: [{ name: "x", operation: "st", value: "v" }] }]),
  "unknown operation");
// THE REFUSAL MUST SAY WHY IT MATTERS. "unknown side" alone reads as pedantry;
// the point is that the file could not be re-imported as what it says.
check("codec: the value refusal explains the consequence, not just the fault",
  (() => {
    try {
      serializeProfiles([{ id: 9, name: "p", domains: ["a.com"],
        headers: [{ name: "x", operation: "set", value: "v", side: "respones" }] }]);
      return false;
    } catch (err) {
      return err.message.includes("profile 1 (id 9)") &&
             err.message.includes("header 1") &&
             err.message.includes("re-imported");
    }
  })());
// The valid values must still pass, or the fix is a refusal of everything.
check("codec: valid sides still round-trip after the value check",
  (() => {
    // BOTH CODEC CALLS THROW BY DESIGN, so the round trip is wrapped and a
    // refusal becomes `null` — which fails the comparisons below instead of
    // aborting the suite. Two mutants demonstrated the unguarded version:
    // they made the round trip refuse, the throw escaped this IIFE, and the
    // run died partway with its real coverage unmeasured.
    const rt = (entry) => {
      try {
        const back = parseProfilesFile(serializeProfiles(
          [{ id: 1, name: "p", domains: ["a.com"], headers: [entry] }]
        ));
        return profileToRule(back[0], ["a.com"]).action;
      } catch {
        return null;
      }
    };
    const res = rt({ name: "x", operation: "set", value: "v", side: "response" });
    const req = rt({ name: "x", operation: "set", value: "v" });
    return res?.responseHeaders?.length === 1 && res?.requestHeaders === undefined &&
           req?.requestHeaders?.length === 1 && req?.responseHeaders === undefined;
  })());

checkThrows("codec: an unknown profile field is refused, not dropped", () =>
  parseProfilesFile(JSON.stringify({ format: FILE_FORMAT, version: 2, profiles: [
    { id: 1, name: "p", domains: ["a.com"], colour: "red",
      headers: [{ name: "x", operation: "set", value: "v" }] }] })),
  "unknown field");

checkThrows("rejects non-JSON", () => parseProfilesFile("{{{"), "not valid JSON");
checkThrows("rejects wrong format", () =>
  parseProfilesFile(JSON.stringify({ format: "x", version: 1, profiles: [] })), '"format"');
// VERSION 3, NOT 2. This check used 2 as its example of an unreadable version
// until v0.2.0 made 2 the current one — at which point it passed for the wrong
// reason for exactly as long as nobody ran the suite. A negative check whose
// example becomes valid stops testing anything and says nothing about it.
checkThrows("rejects wrong version", () =>
  parseProfilesFile(JSON.stringify({ format: FILE_FORMAT, version: 3, profiles: [] })), "version");
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
// REVERSED IN v0.1.7, AND THE OLD ASSERTION IS QUOTED SO THIS READS AS A
// RULING RATHER THAN A DELETION. It used to read "unchanged set STILL
// re-requests a denied domain (finding 2 recovery path)" and asserted
// toRequest === "api.example.com". Two things were wrong with it. The
// behaviour is FINDING-028: an unchanged set has nothing new to want, and
// requesting anyway is what let one approval on a delete confirmation grant
// four unapproved domains. And the NAME was wrong — finding 2's recovery path
// is the clickable chip, which finding 2 shipped precisely because Edit->Save
// "works and nothing in the interface suggested" it. The check was named after
// the fix while pinning the workaround the fix replaced.
check("A1: unchanged set does NOT re-request a denied domain (v0.1.7, FINDING-028)",
  diffDomainGrants({
    previousProfiles: setA1,
    nextProfiles: setA1,
    grantedDomains: ["example.com"],
  }).toRequest.length === 0);

// ---------------------------------------------------- FINDING-028 / 024
//
// The defect in one sentence: toRequest was diffed against grant state alone,
// so it was every ungranted domain in the SURVIVING set regardless of what the
// change did. These rows are the shapes that were wrong, not paraphrases of
// the fix — each one returns something non-empty against v0.1.6.

check("F028: a delete requests NOTHING, even with ungranted survivors",
  diffDomainGrants({
    previousProfiles: setA1,
    nextProfiles: [setA1[0]],
    grantedDomains: [],
  }).toRequest.length === 0);

// OBS-E5's exact shape: five profiles, every grant denied, delete the first.
// v0.1.6 returned the other four here and one approval took all of them.
check("F028: OBS-E5 shape — delete with ALL grants denied requests nothing",
  (() => {
    const five = [1, 2, 3, 4, 5].map((i) => prof(i, [`p${i}.test`]));
    return diffDomainGrants({
      previousProfiles: five,
      nextProfiles: five.slice(1),
      grantedDomains: [],
    }).toRequest.length === 0;
  })());

// The narrowing must not cost a legitimate request. An ADDED domain is still
// requested while ungranted survivors are left alone — both halves in one row,
// because asserting only the first would pass on a function that requests
// everything.
check("F028: an ADDED domain is requested while ungranted survivors are not",
  (() => {
    const before = [prof(1, ["old.test"])];
    const after = [prof(1, ["old.test"]), prof(2, ["new.test"])];
    return diffDomainGrants({
      previousProfiles: before,
      nextProfiles: after,
      grantedDomains: [],
    }).toRequest.join(",") === "new.test";
  })());

// FOUND BY THE MUTATION PASS, NOT BY REVIEW. Dropping the grant intersection
// and keeping only the membership diff survived every row above with zero
// failures: it produces the right answer for every ungranted case and requests
// a domain that is already fully granted. That is permission churn on an
// ordinary save, and it is the half of asymmetry 2 that v0.1.7 KEPT.
check("A1: adding an ALREADY-GRANTED domain requests nothing",
  diffDomainGrants({
    previousProfiles: [prof(1, ["a.test"])],
    nextProfiles: [prof(1, ["a.test"]), prof(2, ["b.test"])],
    grantedDomains: ["a.test", "b.test"],
  }).toRequest.length === 0);

// FINDING-024 is the same line seen through the legacy set: editing one
// profile re-requested every legacy domain in the config at once, which
// contradicted the migration notice's own "click any underlined domain".
check("F024: a save does not re-request ANOTHER profile's legacy domain",
  diffDomainGrants({
    previousProfiles: [prof(1, ["legacy.test"]), prof(2, ["a.test"])],
    nextProfiles: [prof(1, ["legacy.test"]), prof(2, ["b.test"])],
    grantedDomains: ["a.test"],
    heldDomains: ["a.test", "legacy.test"],
  }).toRequest.join(",") === "b.test");
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
// ------------------------------------------------ origin patterns (F18/F19)
//
// THE PINNED BUG. Through v0.1.3 this section asserted
//   originFor("localhost") === "*://localhost/*"
// which is a faithful test of the wrong thing: it pinned an exact-host
// permission against a DNR condition that also matches subdomains, so the
// suite went green on precisely the mismatch that made every subdomain rule
// a silent no-op. A string-equality test cannot catch that class of bug. The
// oracle below compares COVERED HOST SETS, which can.

// Does DNR's requestDomains entry `domain` match `host`? Chrome: the domain
// itself and any subdomain of it.
function dnrCovers(domain, host) {
  return host === domain || host.endsWith("." + domain);
}

// Does a Chrome match pattern of the shape "*://HOST/*" cover `host`?
// "*.d" covers d and any subdomain of d; a bare host covers itself only.
function patternCovers(pattern, host) {
  const m = /^\*:\/\/(.+)\/\*$/.exec(pattern);
  if (!m) return false;
  const pat = m[1];
  if (pat.startsWith("*.")) {
    const base = pat.slice(2);
    return host === base || host.endsWith("." + base);
  }
  return host === pat;
}

const HOST_CORPUS = [
  "example.com",
  "api.example.com",
  "foo.api.example.com",
  "notexample.com",
  "example.com.evil.test",
  "evil-example.com",
  "localhost",
  "sub.localhost",
  "192.168.1.5",
  "sub.192.168.1.5",
];

check("F18 INVARIANT: permission set covers exactly the DNR host set",
  ["example.com", "localhost", "a.b.test"].every((domain) =>
    HOST_CORPUS.every(
      (host) =>
        dnrCovers(domain, host) ===
        originsForDomain(domain).some((p) => patternCovers(p, host))
    )
  ));
check("F18: the apex domain is covered",
  originsForDomain("example.com").some((p) =>
    patternCovers(p, "example.com")));
check("F18: a subdomain is covered — the v0.1.3 regression",
  originsForDomain("example.com").some((p) =>
    patternCovers(p, "api.example.com")));
check("F18: a deep subdomain is covered",
  originsForDomain("example.com").some((p) =>
    patternCovers(p, "a.b.c.example.com")));
check("F18: a suffix-confusable host is NOT covered",
  !originsForDomain("example.com").some((p) =>
    patternCovers(p, "notexample.com")));
check("F18: the domain as a left label of another host is NOT covered",
  !originsForDomain("example.com").some((p) =>
    patternCovers(p, "example.com.evil.test")));
check("F18: both patterns are emitted for a hostname",
  originsForDomain("example.com").join(" ") ===
    "*://example.com/* *://*.example.com/*");
check("F18: the v0.1.3 pattern is still in the set, so upgrades orphan nothing",
  originsForDomain("example.com").includes("*://example.com/*"));
check("F18: an IPv4 literal gets the apex pattern only",
  originsForDomain("192.168.1.5").join(" ") === "*://192.168.1.5/*");
check("F18: isIpLiteral accepts a dotted quad and rejects a hostname",
  isIpLiteral("10.0.0.1") && !isIpLiteral("example.com") &&
    !isIpLiteral("1.2.3") && !isIpLiteral(""));
check("F18: originsFor flattens, dedupes, and sorts",
  originsFor(["b.test", "a.test", "b.test"]).join(" ") ===
    "*://*.a.test/* *://*.b.test/* *://a.test/* *://b.test/*");
check("F18: originsFor tolerates a missing list",
  originsFor(undefined).length === 0);

check("F19: isManagedOrigin recognizes both shapes this extension emits",
  isManagedOrigin("*://example.com/*") &&
    isManagedOrigin("*://*.example.com/*"));
check("F19: isManagedOrigin rejects all-hosts and foreign shapes",
  !isManagedOrigin("*://*/*") && !isManagedOrigin("<all_urls>") &&
    !isManagedOrigin("https://example.com/*") &&
    !isManagedOrigin("*://example.com/path*"));
check("F19: a grant no profile references is stale",
  staleManagedOrigins(setA1, [
    "*://example.com/*",
    "*://*.example.com/*",
    "*://api.example.com/*",
    "*://*.api.example.com/*",
    "*://old.example.com/*",
  ]).join(" ") === "*://old.example.com/*");
check("F19: a referenced domain's grants are never stale",
  staleManagedOrigins([prof(1, ["a.test"])], [
    "*://a.test/*",
    "*://*.a.test/*",
  ]).length === 0);
check("F19: a partial v0.1.3-era grant is retained, not swept",
  staleManagedOrigins([prof(1, ["a.test"])],
    ["*://a.test/*"]).length === 0);
check("F19: user-granted all-hosts is left alone",
  staleManagedOrigins([], ["*://*/*", "<all_urls>"]).length === 0);
check("F19: a scheme-specific grant is outside the sweep",
  staleManagedOrigins([], ["https://a.test/*", "http://a.test/*"]).length === 0);
// PINS A KNOWN LIMITATION, not a desired behaviour. The sweep cannot tell a
// grant it requested from one the user made, because getAll() carries no
// provenance. This check records that an unreferenced managed-SHAPE origin
// is removed regardless of origin-of-origin; if a provenance ledger ever
// lands, this is the check that must change and the reason it existed.
check("F19: an unreferenced managed-shape grant is swept (provenance unknown)",
  staleManagedOrigins([], ["*://a.test/*", "*://*.a.test/*"]).length === 2);
check("F19: tolerates a missing origins list",
  staleManagedOrigins(setA1, undefined).length === 0);

// ------------------------------------- legacy-only revocation (finding 20)
// REGRESSION SUITE for a bug THIS RELEASE INTRODUCED and caught before
// shipping. v0.1.3 revoked correctly on
// delete; the strict grant check added for finding 18 was then fed to the
// revoke path too, and a mid-migration domain fell through both branches —
// not granted enough to use, not granted enough to release. These pin the
// two sets apart so collapsing them again fails here rather than in the
// field. The legacy install is the ONLY state where they differ, which is
// exactly why the original suite could not see it.

const legacyProf = [prof(1, ["example.com"])];

check("F20: delete releases a legacy-only grant (strict-only leaked it)",
  diffDomainGrants({
    previousProfiles: legacyProf,
    nextProfiles: [],
    grantedDomains: [],
    heldDomains: ["example.com"],
  }).toRevoke.join(",") === "example.com");
check("F20: editing a domain out releases its legacy-only grant",
  diffDomainGrants({
    previousProfiles: legacyProf,
    nextProfiles: [prof(1, ["other.test"])],
    grantedDomains: [],
    heldDomains: ["example.com"],
  }).toRevoke.join(",") === "example.com");
check("F20: import replace-all releases legacy-only grants it drops",
  diffDomainGrants({
    previousProfiles: legacyProf,
    nextProfiles: [prof(9, ["other.test"])],
    grantedDomains: [],
    heldDomains: ["example.com"],
  }).toRevoke.join(",") === "example.com");
check("F20: a legacy-only domain still in use is RETAINED",
  diffDomainGrants({
    previousProfiles: legacyProf,
    nextProfiles: legacyProf,
    grantedDomains: [],
    heldDomains: ["example.com"],
  }).toRevoke.length === 0);
check("F20: a legacy-only domain another profile references is RETAINED",
  diffDomainGrants({
    previousProfiles: [prof(1, ["example.com"]), prof(2, ["example.com"])],
    nextProfiles: [prof(2, ["example.com"])],
    grantedDomains: [],
    heldDomains: ["example.com"],
  }).toRevoke.length === 0);
// REVERSED IN v0.1.7 with the old assertion kept. It read "MIGRATION PATH
// SURVIVES — a legacy domain is still re-requested" and asserted
// toRequest === "example.com" for an UNCHANGED profile set. That is
// FINDING-024's mechanism stated as a requirement. What finding 20 was
// actually protecting is the STRICT/PERMISSIVE split, and that split is
// unaffected: the row below still holds it, and the row under it proves a
// legacy domain the change ADDS is still requested in full.
check("F20/F028: a legacy-only domain in BOTH sets is NOT re-requested",
  diffDomainGrants({
    previousProfiles: legacyProf,
    nextProfiles: legacyProf,
    grantedDomains: [],
    heldDomains: ["example.com"],
  }).toRequest.length === 0);

// The strict set is still strict where it matters. A domain this change adds,
// holding only the pre-0.1.4 apex pattern, reads as ungranted and is requested
// so the upgrade completes. Swapping toRequest to the permissive set would
// pass every row above and fail this one.
check("F20: a legacy-only domain ADDED by this change IS requested",
  diffDomainGrants({
    previousProfiles: [],
    nextProfiles: legacyProf,
    grantedDomains: [],
    heldDomains: ["example.com"],
  }).toRequest.join(",") === "example.com");
check("F20: the two sets are read from opposite sides, not interchangeable",
  (() => {
    const d = diffDomainGrants({
      previousProfiles: [prof(1, ["gone.test"]), prof(2, ["kept.test"])],
      nextProfiles: [prof(2, ["kept.test"])],
      grantedDomains: ["kept.test"],
      heldDomains: ["gone.test", "kept.test"],
    });
    // gone.test is held but never fully granted: revoke it, never request it.
    return d.toRevoke.join(",") === "gone.test" && d.toRequest.length === 0;
  })());
check("F20: heldDomains defaults to grantedDomains for untaught callers",
  diffDomainGrants({
    previousProfiles: legacyProf,
    nextProfiles: [],
    grantedDomains: ["example.com"],
  }).toRevoke.join(",") === "example.com");
check("F20: nothing held means nothing to revoke",
  diffDomainGrants({
    previousProfiles: legacyProf,
    nextProfiles: [],
    grantedDomains: [],
    heldDomains: [],
  }).toRevoke.length === 0);

// ------------------------------------------- upgrade notice (F18 migration)// The notice is driven ENTIRELY by this predicate, which is why it is pure
// and lives here rather than as a version check in popup.js. The property
// that matters is not "does it show" but "can it stop showing": every path
// to true requires a legacy grant, and granting clears it permanently.

check("F18 migration: a v0.1.3-era grant needs re-approval",
  isLegacyOnlyGrant("example.com",
    { legacyGranted: true, currentGranted: false }));
check("F18 migration: SELF-EXPIRES — re-granting clears it forever",
  !isLegacyOnlyGrant("example.com",
    { legacyGranted: true, currentGranted: true }));
check("F18 migration: a never-granted domain is not a migration",
  !isLegacyOnlyGrant("example.com",
    { legacyGranted: false, currentGranted: false }));
check("F18 migration: unreachable on a fresh install (no legacy grant)",
  ["example.com", "a.b.test", "localhost"].every((d) =>
    !isLegacyOnlyGrant(d, { legacyGranted: false, currentGranted: false })));
check("F18 migration: an IP literal never migrates — the shapes are equal",
  !isLegacyOnlyGrant("192.168.1.5",
    { legacyGranted: true, currentGranted: false }));
check("F18 migration: legacyOriginsForDomain is the exact v0.1.3 output",
  legacyOriginsForDomain("example.com").join(" ") === "*://example.com/*");
check("F18 migration: the legacy pattern is a subset of the current set",
  legacyOriginsForDomain("example.com").every((o) =>
    originsForDomain("example.com").includes(o)));

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
  canon(dupProfile)[0]?.domains.length === 1);
check("the duplicate set serializes identically to the singleton set",
  attempt(() => serializeProfiles(dupProfile)) !== THREW &&
  attempt(() => serializeProfiles(dupProfile))
    === attempt(() => serializeProfiles([{ ...dupProfile[0], domains: ["example.com"] }])));

// The contract's own two rules, checked against the shape that violated them.
check("identical SETS serialize to identical bytes regardless of duplicates",
  attempt(() => serializeProfiles([{ ...dupProfile[0], domains: ["a.com", "a.com", "b.com"] }]))
    === attempt(() => serializeProfiles([{ ...dupProfile[0], domains: ["b.com", "a.com"] }])));
check("export -> import -> export stays byte-identical with duplicates in",
  attempt(() => serializeProfiles(dupProfile)) !== THREW &&
  attempt(() => serializeProfiles(dupProfile))
    === attempt(() => serializeProfiles(parseProfilesFile(serializeProfiles(dupProfile)))));
check("import accepts duplicates and returns the deduped set",
  attempt(() => parseProfilesFile(validDoc(dupProfile))[0].domains.join(",")) === "example.com");

// COUNT AGREEMENT (finding 7's second half). The chip list renders
// profile.domains and the status line counts referencedDomains(); they
// disagreed on screen. After normalization the two count the same thing, which
// is the property to pin — the popup wiring itself needs chrome.* and lives in
// SMOKE.md.
const canonicalDup = canon(dupProfile);
check("chip count equals status-line domain count after normalization",
  canonicalDup[0].domains.length === referencedDomains(canonicalDup).length);
check("count agreement holds across profiles sharing a domain",
  canon([
    { ...dupProfile[0], id: 1, domains: ["a.com", "a.com"] },
    { ...dupProfile[0], id: 2, domains: ["a.com", "B.com", "b.com"] },
  ]).reduce((n, p) => n + p.domains.length, 0) === 3);

// ------------------------------------- over-cap import refusal (finding 6)
// The cap is enforced at parse time so an over-cap file is REFUSED rather than
// accepted and silently truncated at the wire. Counted in profiles because
// grant state is unknowable here — see the comment in parseProfilesFile.

// HEADER NAMES ARE DISTINCT PER PROFILE, AND THAT CHANGED IN v0.1.5. Until
// FINDING-021 these were all `X-A` on `a.com`, which is now a 5000-way
// collision and would be refused before the cap check could be reached. The
// cap fixtures were never about collisions, so the fixture moved rather than
// the checks. Distinct NAMES rather than distinct DOMAINS on purpose:
// findCollisions() buckets by header name first, so distinct names give 5000
// buckets of one and the fixture stays fast, while distinct domains sharing
// one header name would give one bucket of 5000 and a quadratic domain scan.
const bulk = (n, from = 1) => Array.from({ length: n }, (_, i) => ({
  id: from + i, name: `p${from + i}`, domains: ["a.com"],
  headers: [{ name: `X-A-${from + i}`, operation: "set", value: "1" }],
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
// Anchored on the deliberate sentence rather than an incidental fragment. The
// first version of these checks matched "more than the", which was a phrase
// nobody had chosen on purpose — rewording the message for clarity during the
// smoke run broke two checks that were not testing behaviour at all. Assert on
// the part of the message the reader is meant to act on.
checkThrows("a file one over the cap is REFUSED",
  () => parseProfilesFile(validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES + 1))),
  "The most that can be applied");
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
  ])), "The most that can be applied");

// A4 regression guard: refusal is a throw, so no caller can have applied
// anything. parseProfilesFile is pure — it returns a value or throws, and
// never mutates its input.
const preserved = validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES + 1));
let threw = false;
try { parseProfilesFile(preserved); } catch { threw = true; }
check("an over-cap import throws rather than returning a truncated set", threw);
check("an over-cap import leaves the source document untouched",
  JSON.parse(preserved).profiles.length === MAX_UNSAFE_DYNAMIC_RULES + 1);

// The instruction tells the reader HOW MANY to remove, so it has to be
// computed. A hardcoded "remove 1" would be wrong for every file but the
// smallest overage, and wrong advice is worse than none.
checkThrows("the refusal says how many profiles to remove (singular)",
  () => parseProfilesFile(validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES + 1))),
  "at least 1 profile from");
checkThrows("the overage scales, and pluralises",
  () => parseProfilesFile(validDoc(bulk(MAX_UNSAFE_DYNAMIC_RULES + 3))),
  "at least 3 profiles from");

// ------------------------------------ cross-profile collisions (FINDING-021)
// Two profiles whose domains overlap and which both write the same header have
// no defined winner; v0.1.5 refuses the configuration rather than letting
// Chrome pick. OBS-C10 is the banked before-state — one silent winner on the
// wire — and it deliberately does NOT establish which mechanism chose it,
// which is precisely why refusal was taken over precedence.

const validEntry = (entry) => validateHeaderEntry(entry).valid;
const cProf = (id, name, domains, headers) => ({ id, name, domains, headers });
const setH = (name, value = "1") => ({ name, operation: "set", value });
const rmH = (name) => ({ name, operation: "remove" });

// --- domain overlap, which is label-suffix containment and not string suffix

check("F021: a domain overlaps itself",
  domainsOverlap("example.com", "example.com"));
check("F021: an apex overlaps its subdomain (DNR matches both)",
  domainsOverlap("example.com", "api.example.com"));
check("F021: overlap is symmetric",
  domainsOverlap("api.example.com", "example.com"));
check("F021: an apex overlaps a deep subdomain",
  domainsOverlap("example.com", "a.b.c.example.com"));

// THE CHECK THIS GROUP EXISTS FOR. "notexample.com".endsWith("example.com") is
// true, and a string-suffix test would refuse two configurations that cover
// disjoint hosts. The leading dot is the whole fix. Part 11 step 4's
// confusable control is the wire version of this.
check("F021: a SUFFIX CONFUSABLE does not overlap",
  !domainsOverlap("example.com", "notexample.com"));
check("F021: the confusable case is symmetric too",
  !domainsOverlap("notexample.com", "example.com"));
check("F021: unrelated domains do not overlap",
  !domainsOverlap("example.com", "example.org"));
check("F021: sibling subdomains do not overlap",
  !domainsOverlap("a.example.com", "b.example.com"));
check("F021: an IP literal overlaps only itself",
  domainsOverlap("127.0.0.1", "127.0.0.1") &&
  !domainsOverlap("127.0.0.1", "127.0.0.2"));
check("F021: domain LISTS overlap if any pair does",
  domainListsOverlap(["a.test", "example.com"], ["z.test", "api.example.com"]));
check("F021: disjoint domain lists do not overlap",
  !domainListsOverlap(["a.test", "b.test"], ["c.test", "d.test"]));

// --- which header names count

check("F021: header names are compared case-insensitively",
  headerNamesFor(cProf(1, "p", ["a.test"], [setH("X-Api-Key")]), validEntry)
    .has("x-api-key"));
// An entry profileToRule() would filter out never reaches DNR, so it cannot
// collide with anything. Counting it would refuse a configuration over a
// header that was never going to apply.
check("F021: an INVALID header entry does not count toward a collision",
  headerNamesFor(cProf(1, "p", ["a.test"], [setH("bad header name")]), validEntry)
    .size === 0);

// --- the pairwise scan

const collidingPair = [
  cProf(1, "Alpha", ["example.com"], [setH("X-H", "A")]),
  cProf(2, "Beta", ["example.com"], [setH("X-H", "B")]),
];
const found = findCollisions(collidingPair, validEntry);
check("F021: two profiles writing one header on one domain collide",
  found.length === 1 && found[0].header === "x-h");
check("F021: the collision names BOTH profiles, lower id first",
  found[0].profileIds[0] === 1 && found[0].profileIds[1] === 2);
check("F021: both sides are marked, never one",
  collidingProfileIds(found).has(1) && collidingProfileIds(found).has(2));

// The FINDING-018 surface: these two did not overlap before subdomain
// matching shipped and do now, which is what makes existing 0.1.4 installs
// reachable by this and why the build-time half is not optional.
check("F021: apex and subdomain profiles collide (the 018-enlarged surface)",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [setH("X-H")]),
    cProf(2, "Beta", ["api.example.com"], [setH("X-H")]),
  ], validEntry).length === 1);
check("F021: suffix-confusable domains do NOT collide",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [setH("X-H")]),
    cProf(2, "Beta", ["notexample.com"], [setH("X-H")]),
  ], validEntry).length === 0);
check("F021: different headers on the same domain do not collide",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [setH("X-A")]),
    cProf(2, "Beta", ["example.com"], [setH("X-B")]),
  ], validEntry).length === 0);

// --- v0.2.0: SIDE, in the validator and the rule builder. These two had to
// change together: while profileToRule() put every valid entry into
// requestHeaders, making the validator accept a response entry would have
// applied it on the WRONG SIDE, silently.

const rRespH = { name: "X-H", operation: "set", value: "1", side: "response" };
const rReqH = { name: "X-H", operation: "set", value: "1" };

check("F021/side: an absent side is valid (every 0.1.x entry)",
  validateHeaderEntry(rReqH).valid);
check("F021/side: an explicit request/response side is valid",
  validateHeaderEntry({ ...rReqH, side: "request" }).valid &&
  validateHeaderEntry(rRespH).valid);
// sideOf() would read this as "request" and apply a header the file did not ask for.
check("F021/side: an unrecognised side is REJECTED, not defaulted",
  !validateHeaderEntry({ ...rReqH, side: "trailer" }).valid &&
  validateHeaderEntry({ ...rReqH, side: "trailer" }).reason.includes("trailer"));
check("F021/side: side is case-sensitive, an uppercase side is rejected",
  !validateHeaderEntry({ ...rReqH, side: "Response" }).valid);

// Append stays request-only: the allowlist was verified for REQUEST headers,
// and reusing it for responses would assert a list nobody checked.
check("F021/side: append on a RESPONSE header is refused",
  !validateHeaderEntry({ name: "Accept", operation: "append", value: "x", side: "response" }).valid);
check("F021/side: append on an allowlisted REQUEST header still works",
  validateHeaderEntry({ name: "Accept", operation: "append", value: "x" }).valid);
check("F021/side: the request allowlist still bites on the request side",
  !validateHeaderEntry({ name: "X-Nope", operation: "append", value: "x" }).valid);

// --- the rule builder
const reqOnlyRule = profileToRule({ id: 1, headers: [rReqH] }, ["a.test"]);
check("F021/side: a request-only profile emits requestHeaders and NO responseHeaders",
  reqOnlyRule.action.requestHeaders?.length === 1 &&
  reqOnlyRule.action.responseHeaders === undefined);

const respOnlyRule = profileToRule({ id: 2, headers: [rRespH] }, ["a.test"]);
// OPTIONAL CHAINING IS DELIBERATE. A check that THROWS on a missing array is
// worse than one that fails: mutate-collisions.py counts "^FAIL:" lines, so a
// crashing check scores zero failures and the mutant is reported as UNCOVERED
// when it was in fact caught. Found by running the harness, not by reading.
check("F021/side: a response entry lands in responseHeaders, never requestHeaders",
  respOnlyRule.action.responseHeaders?.length === 1 &&
  respOnlyRule.action.responseHeaders?.[0].header === "X-H" &&
  respOnlyRule.action.requestHeaders === undefined);

const bothRule = profileToRule({ id: 3, headers: [rReqH, rRespH] }, ["a.test"]);
check("F021/side: a mixed profile emits both arrays, each with only its own side",
  bothRule.action.requestHeaders?.length === 1 &&
  bothRule.action.responseHeaders?.length === 1);
check("F021/side: a profile whose only entries are invalid still returns null",
  profileToRule({ id: 4, headers: [{ name: "bad header", operation: "set", value: "1" }] },
    ["a.test"]) === null);

// --- v0.2.0: SIDE. A request header and a response header of the same name
// are two different writes at two different moments. DNR puts them in
// separate arrays and they cannot contend for one value, so refusing them
// would be a fail-closed FALSE POSITIVE on a configuration that is fine.

const respH = (name, value = "1") => ({ name, operation: "set", value, side: "response" });

// The upgrade path. Every 0.1.x profile has entries with no `side` at all.
check("F021/side: a missing side reads as request",
  sideOf({ name: "X-H", operation: "set", value: "1" }) === "request");
check("F021/side: an unrecognised side reads as request, not a third bucket",
  sideOf({ name: "X-H", side: "trailer" }) === "request" &&
  sideOf({ name: "X-H", side: "RESPONSE" }) === "request");
check("F021/side: an explicit response side is preserved",
  sideOf(respH("X-H")) === "response");

check("F021/side: the key carries the side, the name does not",
  headerKeysFor(cProf(1, "p", ["a.test"], [respH("X-Api-Key")]), validEntry)
    .has("response\u0000x-api-key") &&
  headerNamesFor(cProf(1, "p", ["a.test"], [respH("X-Api-Key")]), validEntry)
    .has("x-api-key"));

// THE POINT OF THE WHOLE CHANGE.
check("F021/side: same name on DIFFERENT sides does NOT collide",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [setH("X-H", "A")]),
    cProf(2, "Beta", ["example.com"], [respH("X-H", "B")]),
  ], validEntry).length === 0);
check("F021/side: same name on the RESPONSE side still collides",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [respH("X-H", "A")]),
    cProf(2, "Beta", ["example.com"], [respH("X-H", "B")]),
  ], validEntry).length === 1);
check("F021/side: a legacy (sideless) profile collides with an explicit request one",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [{ name: "X-H", operation: "set", value: "A" }]),
    cProf(2, "Beta", ["example.com"], [{ name: "X-H", operation: "set", value: "B", side: "request" }]),
  ], validEntry).length === 1);

const bothSides = findCollisions([
  cProf(1, "Alpha", ["example.com"], [setH("X-H", "A"), respH("X-H", "A")]),
  cProf(2, "Beta", ["example.com"], [setH("X-H", "B"), respH("X-H", "B")]),
], validEntry);
check("F021/side: one name colliding on BOTH sides is TWO collisions",
  bothSides.length === 2 &&
  bothSides.every((c) => c.header === "x-h") &&
  bothSides.map((c) => c.side).join(",") === "request,response");
// 9d: pins the PROPERTY (order follows the values) rather than the current
// output. Entries are deliberately declared response-first so that bucket
// insertion order disagrees with the required output order.
const sideOrder = findCollisions([
  cProf(1, "Alpha", ["example.com"], [respH("X-H", "A"), setH("X-H", "A")]),
  cProf(2, "Beta", ["example.com"], [respH("X-H", "B"), setH("X-H", "B")]),
], validEntry);
check("F021/side: collision order does not depend on header order within a profile",
  sideOrder.map((c) => c.side).join(",") === "request,response");
check("F021/side: the record carries the bare name, never the internal key",
  bothSides.every((c) => !c.header.includes("\u0000")));

// Prose. The old sentence said "on the same request" unconditionally, which
// is false for a response-side collision — 9f: state the property.
const respOnly = findCollisions([
  cProf(1, "Alpha", ["example.com"], [respH("X-H", "A")]),
  cProf(2, "Beta", ["example.com"], [respH("X-H", "B")]),
], validEntry);
const respMsg = describeCollisions(respOnly, 1, (id) => ({ 1: "Alpha", 2: "Beta" })[id]);
check("F021/side: a response collision says response, not request",
  respMsg.includes("the same response") && !respMsg.includes("the same request"));
check("F021/side: a request collision still says request",
  describeCollisions(found, 1, () => "Alpha").includes("the same request"));

const mixedMsg = describeCollisions(bothSides, 1, (id) => ({ 1: "Alpha", 2: "Beta" })[id]);
check("F021/side: a mixed collision claims no single moment",
  mixedMsg.includes("the same exchange") &&
  !mixedMsg.includes("the same request") && !mixedMsg.includes("the same response"));
check("F021/side: a mixed collision labels each side so the pair is distinguishable",
  mixedMsg.includes('"x-h" (request)') && mixedMsg.includes('"x-h" (response)'));
// Noise control: the single-sided common case must NOT be labelled.
check("F021/side: a single-sided collision is not labelled with its side",
  !describeCollisions(found, 1, () => "Alpha").includes("(request)"));
check("F021/side: the save refusal is side-aware too",
  describeSaveRefusal(respOnly, 1, (id) => "X").includes("the same response"));
check("F021/side: the import refusal is side-aware too",
  describeImportRefusal(respOnly, (id) => "X").includes("the same response"));

// STRICT, by decision 2026-09-01. Both of these have an order-independent
// outcome and are refused anyway, because "two profiles disagree about this
// header" is a rule that fits in the popup and stays honest. If the false
// positive is ever reported, THESE are the two checks that change.
check("F021 (strict): two REMOVES of the same header collide",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [rmH("X-H")]),
    cProf(2, "Beta", ["example.com"], [rmH("X-H")]),
  ], validEntry).length === 1);
check("F021 (strict): IDENTICAL set values still collide",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [setH("X-H", "same")]),
    cProf(2, "Beta", ["example.com"], [setH("X-H", "same")]),
  ], validEntry).length === 1);

// One profile may name a header twice — set-then-append is supported and
// canonical.js freezes header order to preserve it. Within one profile the
// entries land in one rule's ordered array, so DNR applies them
// deterministically and there is nothing ambiguous to refuse.
check("F021: a repeat WITHIN one profile is not a collision",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [setH("X-H", "a"), setH("X-H", "b")]),
  ], validEntry).length === 0);

// ADDED BECAUSE A MUTATION PASS FOUND IT UNPINNED. Removing the `a.id === b.id`
// guard in findCollisions() failed ZERO checks, which first read as an
// equivalent mutant: headerNamesFor() returns a SET, so a profile enters each
// bucket at most once and the guard is unreachable for well-formed input.
// Probing it directly showed that reading was wrong — the guard DOES change
// behaviour when the caller passes a duplicate id, and nothing exercised that
// path. parseProfilesFile() rejects duplicate ids, so this is storage-shaped
// input, which A2 says to treat as untrusted. A profile must never be refused
// for colliding with itself.
check("F021: a duplicate id does not collide with itself",
  findCollisions([
    cProf(1, "Alpha", ["example.com"], [setH("X-H", "a")]),
    cProf(1, "Alpha again", ["example.com"], [setH("X-H", "b")]),
  ], validEntry).length === 0);

// THE TWO-INPUTS PROPERTY (the FINDING-020 lesson, applied ahead of time).
// The same profiles asked about GRANTED domains rather than configured ones
// produce no collision, because no rule would register. Collapsing the two
// questions into one is what this pins.
check("F021: the same pair does not collide when the granted set is empty",
  findCollisions(collidingPair.map((p) => ({ ...p, domains: [] })), validEntry)
    .length === 0);

const multi = findCollisions([
  cProf(2, "Beta", ["example.com"], [setH("X-B"), setH("X-A")]),
  cProf(1, "Alpha", ["example.com"], [setH("X-A"), setH("X-B")]),
], validEntry);
check("F021: collisions are sorted deterministically by header then id",
  multi.length === 2 && multi[0].header === "x-a" && multi[1].header === "x-b" &&
  multi[0].profileIds[0] === 1);

// --- the sentence the user reads

const sentence = describeCollisions(found, 1, (id) => ({ 1: "Alpha", 2: "Beta" })[id]);
// Anchored on what was DECIDED — the header and the other profile's name are
// what make the state actionable. FINDING-006's lesson: do not freeze prose
// nobody chose on purpose.
check("F021: the marker names the header", sentence.includes('"x-h"'));
check("F021: the marker names the OTHER profile", sentence.includes('"Beta"'));
check("F021: the marker says the profile is not applying",
  sentence.toLowerCase().includes("not applying"));
check("F021: an unresolvable name falls back to the id, never 'undefined'",
  describeCollisions(found, 1, () => null).includes("profile 2"));
check("F021: a profile in no collision gets no marker",
  describeCollisions([], 1, () => "Alpha") === "");

// --- the import refusal

const collidingDoc = validDoc([
  { id: 1, name: "Alpha", domains: ["example.com"], headers: [setH("X-H", "A")] },
  { id: 2, name: "Beta", domains: ["api.example.com"], headers: [setH("X-H", "B")] },
]);
checkThrows("F021: a colliding import is REFUSED", () =>
  parseProfilesFile(collidingDoc), "overlapping domains");
checkThrows("F021: the import refusal names the header", () =>
  parseProfilesFile(collidingDoc), '"x-h"');
check("F021: a non-colliding import is still accepted",
  attempt(() => parseProfilesFile(validDoc([
    { id: 1, name: "Alpha", domains: ["example.com"], headers: [setH("X-A")] },
    { id: 2, name: "Beta", domains: ["example.com"], headers: [setH("X-B")] },
  ])).length) === 2);
// Unnormalized case would miss its own overlap if the check ran on raw input.
checkThrows("F021: the import check normalizes case before comparing", () =>
  parseProfilesFile(validDoc([
    { id: 1, name: "Alpha", domains: ["EXAMPLE.com"], headers: [setH("X-H", "A")] },
    { id: 2, name: "Beta", domains: ["example.com"], headers: [setH("x-h", "B")] },
  ])), "overlapping domains");

// REASON PRECEDENCE. A file with a malformed header should be rejected for the
// malformed header, and an over-cap file for the cap — not for a collision
// computed from either. Same ordering the cap refusal already follows.
checkThrows("F021: a malformed header outranks a collision as the reason", () =>
  parseProfilesFile(validDoc([
    { id: 1, name: "Alpha", domains: ["example.com"], headers: [setH("X-H", "A")] },
    { id: 2, name: "Beta", domains: ["example.com"], headers: [{ name: "bad name", operation: "set", value: "B" }] },
  ])), "header name");
checkThrows("F021: the cap outranks a collision as the reason", () =>
  parseProfilesFile(validDoc([
    ...bulk(MAX_UNSAFE_DYNAMIC_RULES + 1),
    { id: 99991, name: "Alpha", domains: ["example.com"], headers: [setH("X-H", "A")] },
    { id: 99992, name: "Beta", domains: ["example.com"], headers: [setH("X-H", "B")] },
  ])), "The most that can be applied");

// --- FINDING-026: the write-path refusals are their own sentences
//
// The card marker was reused verbatim on two surfaces it was not written for.
// Every word of it is true on the card and two of its claims are false on the
// write paths: nothing was saved, and nothing was imported. THE FACTS ARE
// SHARED, THE SENTENCE IS NOT.
//
// WHAT IS PINNED HERE IS THE DECIDED PART, per FINDING-006. The two facts that
// make a refusal actionable — which header, which other profile — plus the
// three defects OBS-D3 and OBS-D8 recorded: a false claim about application,
// the problem stated twice, and punctuation the caller supplies again. Prose
// beyond that is free to change.

const names2 = (id) => ({ 1: "Alpha", 2: "Beta" })[id];
const saveMsg = describeSaveRefusal(found, 1, names2);

check("F026: the save refusal names the header", saveMsg.includes('"x-h"'));
check("F026: the save refusal names the OTHER profile", saveMsg.includes('"Beta"'));
// The finding itself. On this surface either the profile does not exist yet or
// the STORED version is unchanged and still applying, so any claim about
// application is false whichever way it points.
check("F026: the save refusal makes NO claim about applying",
  !/appl(y|ies|ying|ied)/i.test(saveMsg));
check("F026: the save refusal says it did not save",
  /not saved/i.test(saveMsg));
check("F026: the save refusal names the way out",
  /change the/i.test(saveMsg));
check("F026: the save refusal is NOT the card marker",
  saveMsg !== describeCollisions(found, 1, names2));
check("F026: an unresolvable name falls back to the id in the save refusal",
  describeSaveRefusal(found, 1, () => null).includes("profile 2"));
check("F026: a profile in no collision gets no save refusal",
  describeSaveRefusal([], 1, names2) === "");
// Grammar is in scope here rather than being fussiness: two of the three
// defects this finding records ARE grammar, produced by composing a new
// sentence around a helper written for a different surface.
const savePlural = describeSaveRefusal(multi, 1, (id) => ({ 1: "A", 2: "B" })[id]);
check("F026: the save refusal agrees in number with two headers",
  savePlural.includes("headers") && savePlural.includes(" are "));

const importMsg = describeImportRefusal(found, names2);

check("F026: the import refusal names the header", importMsg.includes('"x-h"'));
check("F026: the import refusal names BOTH profiles",
  importMsg.includes('"Alpha"') && importMsg.includes('"Beta"'));
check("F026: the import refusal makes NO claim about applying",
  !/appl(y|ies|ying|ied)/i.test(importMsg));
// popup.js renders every parse failure as `Import failed: ${err.message}.`, so
// a message that terminates itself produces the observed "..".
check("F026: the import refusal does not terminate itself",
  !/[.!?]$/.test(importMsg));
// The duplication defect, made decidable: the old message paired a wrapper
// sentence with the card marker and said "overlapping domain(s)" in both.
check("F026: the import refusal states the overlap ONCE",
  (importMsg.match(/overlapping domain/g) || []).length === 1);
check("F026: unresolvable names fall back to ids in the import refusal",
  describeImportRefusal(found, () => null).includes("profile 1") &&
  describeImportRefusal(found, () => null).includes("profile 2"));
check("F026: no collisions produce no import refusal",
  describeImportRefusal([], names2) === "");
// One pair is named and the rest are counted. Listing every pair is what the
// 360px popup cannot hold; saying nothing about them would overstate what the
// message covers.
const importMulti = describeImportRefusal(multi, (id) => ({ 1: "A", 2: "B" })[id]);
check("F026: further collisions are counted, not silently dropped",
  /1 further collision\b/.test(importMulti) && !/further collisions/.test(importMulti));

// End to end through the real throw site, which is where the defect was seen.
let importThrew = "";
try { parseProfilesFile(collidingDoc); } catch (err) { importThrew = err.message; }
check("F026: the THROWN import message makes no claim about applying",
  importThrew !== "" && !/appl(y|ies|ying|ied)/i.test(importThrew));
check("F026: the THROWN import message does not terminate itself",
  importThrew !== "" && !/[.!?]$/.test(importThrew));
// The duplication defect at the REAL throw site. The helper being clean does
// not stop canonical.js pairing it with a wrapper sentence again, which is
// exactly how the defect arose the first time.
check("F026: the THROWN import message states the overlap ONCE",
  (importThrew.match(/overlapping domain/g) || []).length === 1);
// OBS-D8 verbatim ended "...one of them..". Rendered the way popup.js renders
// it, the message must end in exactly one full stop.
check("F026: rendered as popup.js renders it, there is one terminal period",
  /[^.]\.$/.test(`Import failed: ${importThrew}.`));

// --- AR-16 (s5 commit 6, ruled S5-D1). Checks 50–62 of
// test/PREDICTIONS-2026-10-09-s5.md, in order.
//
// EXPORT REFUSES ANY SET IMPORT WOULD REFUSE. It used to write a colliding
// pair, two profiles sharing an id, and 5,001 profiles, and the importer then
// refused the file it had written (FINDING-027). The refusals follow the
// importer's precedence: the cap, then each profile, then a duplicated id,
// then a collision. Every negative check first requires that the set it
// starts from is refused at all.
const exportRefusal = (set) => {
  try { serializeProfiles(set); return null; } catch (err) { return err.message; }
};
const exportPair = [
  { id: 1, name: "Alpha", domains: ["example.com"], headers: [setH("X-H", "A")] },
  { id: 2, name: "Beta", domains: ["api.example.com"], headers: [setH("X-H", "B")] },
];
const exportDup = [
  { id: 1, name: "Alpha", domains: ["a.com"], headers: [setH("X-A", "1")] },
  { id: 1, name: "Alpha again", domains: ["b.com"], headers: [setH("X-B", "2")] },
];
const NOT_REIMPORTABLE = "refusing to export a set that cannot be re-imported";
const pairRefusal = exportRefusal(exportPair);
check("AR-16: a colliding set is refused on export", pairRefusal !== null);
check("AR-16: the collision refusal is exactly the ruled clause",
  pairRefusal === `"Alpha" and "Beta" both write header "x-h" on overlapping domains — ${NOT_REIMPORTABLE}. Change the header or the domains in one of them, then export`);
const twoCollisions = exportRefusal([...exportPair,
  { id: 3, name: "Gamma", domains: ["example.com"], headers: [setH("X-G", "C")] },
  { id: 4, name: "Delta", domains: ["example.com"], headers: [setH("X-G", "D")] }]);
check("AR-16: with two collisions, the refusal counts the one not listed",
  twoCollisions !== null && twoCollisions.includes(`; 1 further collision is not listed — refusing`));
const responseRefusal = exportRefusal(exportPair.map((p) =>
  ({ ...p, headers: [{ ...p.headers[0], side: "response" }] })));
check("AR-16: a response-side collision's refusal says on the response",
  responseRefusal !== null && responseRefusal.includes(`"x-h" on the response on overlapping domains`));
check("AR-16: a duplicated id is refused, naming the first pair in stored order",
  exportRefusal(exportDup) === `"Alpha" and "Alpha again" share id 1 — ${NOT_REIMPORTABLE}. Delete one of them and add it again, then export`);
const capRefusal = exportRefusal(bulk(MAX_UNSAFE_DYNAMIC_RULES + 1));
check("AR-16: 5,001 profiles are refused with the ruled clause, and 5,003 ask for 3 to go",
  capRefusal === `you have 5001 profiles and a file can hold 5000 — ${NOT_REIMPORTABLE}. Delete at least 1 profile, then export` &&
  (exportRefusal(bulk(MAX_UNSAFE_DYNAMIC_RULES + 3)) || "").endsWith("Delete at least 3 profiles, then export"));
const atCap = attempt(() => serializeProfiles(bulk(MAX_UNSAFE_DYNAMIC_RULES)));
check("AR-16: exactly 5,000 profiles export, and the file imports",
  typeof atCap === "string" &&
  attempt(() => parseProfilesFile(atCap).length) === MAX_UNSAFE_DYNAMIC_RULES);
const malformed = { id: 99990, name: "Bad", domains: ["bad.com"],
  headers: [{ name: "bad name", operation: "set", value: "x" }] };
const overAndBad = exportRefusal([...bulk(MAX_UNSAFE_DYNAMIC_RULES + 1), malformed]);
const overAndPair = exportRefusal([...bulk(MAX_UNSAFE_DYNAMIC_RULES + 1),
  { ...exportPair[0], id: 99991 }, { ...exportPair[1], id: 99992 }]);
check("AR-16: the cap outranks a malformed profile and a collision",
  overAndBad !== null && overAndBad.startsWith("you have") &&
  overAndPair !== null && overAndPair.startsWith("you have"));
const badBeta = exportRefusal([exportPair[0],
  { ...exportPair[1], headers: [setH("X-H", "B"), { name: "bad name", operation: "set", value: "x" }] }]);
check("AR-16: a malformed profile outranks a collision",
  badBeta !== null && badBeta.includes("header name") && !badBeta.includes("both write header"));
const dupAndPair = exportRefusal([...exportDup,
  { id: 2, name: "Beta", domains: ["a.com"], headers: [setH("X-A", "B")] }]);
check("AR-16: a duplicated id outranks a collision",
  dupAndPair !== null && dupAndPair.includes("share id 1"));
// Sets the importer accepts, which a too-eager refusal would wrongly stop.
const mustPass = [
  [{ id: 1, name: "both sides", domains: ["example.com"],
    headers: [setH("X-H", "req"), { name: "X-H", operation: "set", value: "resp", side: "response" }] }],
  [{ id: 1, name: "one", domains: ["a.example.com"], headers: [setH("X-H", "1")] },
   { id: 2, name: "two", domains: ["b.example.com"], headers: [setH("X-H", "2")] }],
  [{ id: 1, name: "plain", domains: ["example.com"], headers: [setH("X-H", "1")] },
   { id: 2, name: "confusable", domains: ["badexample.com"], headers: [setH("X-H", "2")] }],
  [{ id: 1, name: "set then append", domains: ["example.com"],
    headers: [setH("X-Forwarded-For", "alpha"), { name: "X-Forwarded-For", operation: "append", value: "bravo" }] }],
];
check("AR-16: Export and Import agree on four sets that must pass, byte for byte",
  mustPass.every((set) => {
    const once = attempt(() => serializeProfiles(set));
    if (typeof once !== "string") return false;
    const back = attempt(() => parseProfilesFile(once));
    return Array.isArray(back) && attempt(() => serializeProfiles(back)) === once;
  }));
const threeRefusals = [pairRefusal, exportRefusal(exportDup), capRefusal];
check("AR-16: none of the three refusals ends in punctuation, and each renders with one full stop",
  threeRefusals.every((m) => m !== null && !/[.!?]$/.test(m) &&
    /[^.]\.$/.test(`Export failed: ${m}.`)));
// Read here, before the popup section below declares popupJs; line comments
// dropped so a comment cannot satisfy the check.
const exportBody = (() => {
  const src = readFileSync(new URL("../extension/popup/popup.js", import.meta.url), "utf8")
    .split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");
  const start = src.indexOf("async function exportProfiles(");
  const end = start < 0 ? -1 : src.indexOf("\n}\n", start);
  return start < 0 || end < 0 ? "" : src.slice(start, end + 2).replace(/\s+/g, " ");
})();
const exportCatch = exportBody.indexOf("} catch (err) { showIoMsg(`Export failed: ${err.message}.`); return; }");
check("AR-16: exportProfiles shows a refusal and returns before any file is made",
  exportCatch >= 0 && exportCatch < exportBody.indexOf("URL.createObjectURL("));

// --- F-045 (s5 commit 7, ruled S5-D8). Checks 63–64 of
// test/PREDICTIONS-2026-10-09-s5.md. SMOKE.md row 15.5 reads a response
// `remove` of X-HW-Removable in the oracle's CORS case, which did not send it,
// so the row was marked NOT OBSERVABLE. The fixture now sends it in both
// cases, and the row expects the removal.
const oracleServer = readFileSync(new URL("./oracle/server.mjs", import.meta.url), "utf8");
const oracleCase = (name) =>
  (oracleServer.match(new RegExp(`\\n  ${name}: \\[([\\s\\S]*?)\\n  \\],`)) || ["", ""])[1];
check("F-045: both oracle cases send [\"X-HW-Removable\", \"present\"]",
  ["cors", "plain"].every((name) => oracleCase(name).includes('["X-HW-Removable", "present"]')));
const smokeRow155 = (readFileSync(new URL("./SMOKE.md", import.meta.url), "utf8")
  .split("\n").find((line) => line.startsWith("| 15.5 |")) || "");
check("F-045: SMOKE.md row 15.5 expects 1 changed, 1 removed and no longer says NOT OBSERVABLE",
  smokeRow155.includes("`1 changed, 1 removed`") && !smokeRow155.includes("NOT OBSERVABLE"));

// ------------------------------- static popup wiring (finding 10 motivated)
// The suite cannot execute popup.js — it needs chrome.* — but it CAN read it.
// $("some-id") resolving to null is a silent failure: the listener is never
// attached, the button does nothing, and no error is raised anywhere. Finding
// 10 adds four new element ids across two files, which is exactly the shape
// that goes wrong when one file is committed and the other is not.
//
// This is the cheap end of the static architecture check still owed from the
// claim -> evidence table, and it is the first check here that reaches
// popup.js at all.

const popupJsRaw = readFileSync(new URL("../extension/popup/popup.js", import.meta.url), "utf8");
const popupHtmlRaw = readFileSync(new URL("../extension/popup/popup.html", import.meta.url), "utf8");

// A PATTERN MATCH CANNOT TELL A USE FROM A MENTION, and every scan below is a
// pattern match over source text. Comments are stripped first, at the point of
// reading, so no individual check has to remember to. Two mutants, both taken
// on the shipped v0.1.6 tree, are why:
//   - documenting the rejected `min(600px, 100vh)` form verbatim in the CSS
//     comment above the body rule turned "the body cap uses NO viewport unit"
//     RED with the stylesheet unchanged. A guard firing on its own explanation.
//   - deleting `overflow-y: auto` and `min-height: 0` from `main` while a
//     comment named them kept the suite at 273/273 GREEN. That is FINDING-022
//     reinstated behind a passing tripwire, which is the direction that costs
//     something.
// Strings are NOT stripped: popup.js's element ids and class names live in
// string literals and are the thing being scanned.
const stripJsComments = (src) => {
  let out = "";
  for (let i = 0; i < src.length; ) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += src[i++];
      while (i < src.length) {
        if (src[i] === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i]; if (src[i++] === q) break;
      }
      continue;
    }
    out += src[i++];
  }
  return out;
};
const popupJs = stripJsComments(popupJsRaw);
const popupHtml = popupHtmlRaw.replace(/<!--[\s\S]*?-->/g, "");

// FINDING-042. Source scans, so they live with the other popup text checks
// rather than beside the pure draft checks above — popupJs is not read until
// here. Both controls are load-bearing: without the session store the draft
// never survives the popup closing, and without the revert control a draft is
// the only reachable state once one exists.
// BOUND TO THE CALL SITES, NOT THE BARE NAME. The first version of this check
// asked only whether `chrome.storage.session` appeared anywhere in popup.js,
// and a mutant that switched the draft READ to storage.local survived it —
// the other two call sites still carried the string. Session is the whole
// point: a draft that outlives the browser is stale confusion rather than
// rescued work. Caught by mutating this fix's own code, minutes after the
// identical weakness was fixed in the readForm side scan above.
check("F042: the draft store is session, and never local",
  /chrome\.storage\.session\.get\(STORAGE_KEY_DRAFTS\)/.test(popupJs) &&
  /chrome\.storage\.session\.set\(\{ \[STORAGE_KEY_DRAFTS\]/.test(popupJs) &&
  !/storage\.local\.\w+\([^)]*STORAGE_KEY_DRAFTS/.test(popupJs) &&
  /hw:drafts/.test(popupJs));
check("F042: the popup exposes a revert-to-saved control",
  /draft-revert/.test(popupJs) && /draft-revert/.test(popupHtml));

// FINDING-040 / FINDING-043 readback. Checks 16–19 of
// test/PREDICTIONS-2026-09-21-readback.md. BOUND TO THE STATEMENTS THAT DO THE
// THING: a bare `describeReadback(` or `getDynamicRules` substring would be
// satisfied by the import, a definition or a comment-free mention elsewhere,
// which is the weakness this project found seven times in one session.
const renderCardBody = (popupJs.match(
  /function renderProfileCard\([^)]*\) \{[\s\S]*?\n\}\n/) || [""])[0];
const renderListBody = (popupJs.match(
  /async function renderListNow\(\) \{[\s\S]*?\n\}\n/) || [""])[0];
check("RB: renderProfileCard calls describeReadback on the registered rule",
  /\? describeReadback\(\{\s*syncState: registration\.syncState,\s*rule: registration\.registeredById\.get\(profile\.id\) \?\? null,\s*\}\)/
    .test(renderCardBody));
check("RB: renderListNow reads the REGISTERED rules, not storage",
  /const registered = await chrome\.declarativeNetRequest\.getDynamicRules\(\);/
    .test(renderListBody) &&
  /registeredById = new Map\(registered\.map\(\(rule\) => \[rule\.id, rule\]\)\);/
    .test(renderListBody));
const readbackCss = (popupHtml.match(/\.profile \.readback-line \{([^}]*)\}/) || ["", ""])[1];
check("RB: readback lines wrap and never clip",
  /overflow-wrap:\s*anywhere/.test(readbackCss) &&
  /white-space:\s*normal/.test(readbackCss) &&
  !/nowrap|text-overflow|overflow:\s*hidden/.test(readbackCss));
check("RB: readback lines are written with textContent, never innerHTML",
  /lineEl\.className = "readback-line";\s*lineEl\.textContent = formatReadbackLine\(line\);/
    .test(renderCardBody) &&
  // AN ASSIGNMENT, NOT A MENTION. The first version was !/innerHTML/, which
  // the existing "textContent, never innerHTML" COMMENT in this function
  // satisfies once the comment strip is gone — mutate-scans' pre-FINDING-032
  // row went 0 -> 1 on it. A guard that forbids a word forbids its own
  // explanation; this one forbids the statement.
  !/\.innerHTML\s*\+?=/.test(renderCardBody));

// FINDING-041. preflight.mjs is not a gate — it needs running servers and a
// hosts file — so nothing else would notice if its extension block were
// dropped. This pins the one thing the operator carries into Chrome.
// Bound to the statements, not to bare substrings: see the two scans this
// project silently weakened on 2026-09-20 by adding a second occurrence
// elsewhere in the same file.
const preflightJs = readFileSync(
  new URL("./preflight.mjs", import.meta.url), "utf8"
);
// BOUND TO THE CALL, NOT THE NAME. The first version matched
// /reportExtensionExpectation\(\)/, which the FUNCTION DEFINITION satisfies —
// deleting the call site left the check passing. Third instance of this exact
// weakness on 2026-09-20; see the readForm side scan and the storage.session
// draft scan. A scan that pins behaviour must match the line that DOES the
// thing, not a line that merely names it.
check("F041: preflight reports the manifest name the card should show",
  /manifest\.name/.test(preflightJs) &&
  /\n\s+reportExtensionExpectation\(\);/.test(preflightJs));
check("F041: preflight warns against Remove, which destroys storage.local",
  /Do NOT press Remove/.test(preflightJs));

// ------------------------------------------------- release consistency (R15)
//
// FOUR INSTANCES FOUND BY ACCIDENT BEFORE THIS EXISTED — SCOPE.md, the
// manifest copy, README.md, and manifest.version which nothing read. All four
// were FORGETTINGS: someone updated one artifact and did not think of the
// next. Per-artifact assertions catch those four and nothing about the fifth
// artifact nobody thinks of, which is the mechanism itself. The tripwires
// below are the actual deliverable.
const r15Facts = deriveFacts();
check("R15: the derived facts describe a response-capable build",
  r15Facts.emitsResponseHeaders === true &&
  r15Facts.appendRefusedOnResponse === true &&
  r15Facts.appendAllowedOnRequest === true);
check("R15: an export carrying a response entry declares format version 2",
  r15Facts.exportVersionWithResponse === 2 &&
  r15Facts.exportVersionRequestOnly === 1);

const r15Failures = checkArtifacts(new URL("../", import.meta.url), r15Facts);
check("R15: every registered artifact agrees with the code",
  r15Failures.length === 0, r15Failures.join("; "));

// COVERAGE TRIPWIRE — the point of the whole exercise. A new user-facing file
// must be registered, even when the honest answer is "makes no capability
// claims": stating that is a decision, leaving it out is a forgetting, and
// nothing downstream can tell them apart.
//
// THE COST IS REAL AND WAS ACCEPTED: a CONTRIBUTING.md fails this until
// someone adds it with claims:false. Same shape as EXPECTED_CHECKS and
// EXPECTED_ROWS, both of which caught drift on 2026-09-20.
const rootDocs = readdirSync(new URL("../", import.meta.url))
  .filter((f) => f.endsWith(".md"));
const unregisteredRootDocs = rootDocs.filter((f) => !REGISTERED_PATHS.includes(f));
check("R15: every root .md is registered in the artifact list",
  unregisteredRootDocs.length === 0,
  `unregistered: ${unregisteredRootDocs.join(", ")} — add to ARTIFACTS in ` +
  "test/release-consistency.mjs, with claims:false if it makes no capability claims");

// A NEW CAPABILITY MUST BE REGISTERED TOO. Adding a derived fact without
// deciding which artifacts must reflect it recreates the gap one level up.
check("R15: the derived-fact count is pinned",
  Object.keys(r15Facts).length === 5,
  `deriveFacts() returns ${Object.keys(r15Facts).length} facts, expected 5 — ` +
  "if a capability was added, register which artifacts must state it");
// 6 -> 7 on 2026-09-24: LEDGER.md registered with claims:false. It landed at
// the repo root without registration and the coverage tripwire above caught
// it, which left main red until this commit.
check("R15: the artifact count is pinned",
  ARTIFACTS.length === 7,
  `${ARTIFACTS.length} artifacts registered, expected 7`);
check("R15: manifest.version is pinned and read by the suite",
  JSON.parse(
    readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8")
  ).version === PINNED_MANIFEST_VERSION);

const referencedIds = [...popupJs.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
const declaredIds = new Set(
  [...popupHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
);
const danglingIds = [...new Set(referencedIds)].filter((id) => !declaredIds.has(id));

check("popup.js references at least a dozen element ids (the scan works)",
  new Set(referencedIds).size >= 12);
check(`every element id popup.js references exists in popup.html${
  danglingIds.length ? " — dangling: " + danglingIds.join(", ") : ""}`,
  danglingIds.length === 0);

// Named explicitly so the finding 10 wiring fails loudly rather than as part
// of a generic list, and in BOTH files — a confirm whose buttons exist only in
// the markup is a dialog that cannot be dismissed.
for (const id of ["delete-confirm", "delete-confirm-text", "delete-cancel", "delete-proceed"]) {
  check(`finding 10: #${id} is declared in popup.html`, declaredIds.has(id));
  check(`finding 10: #${id} is referenced by popup.js`, referencedIds.includes(id));
}

// Same hazard one level down, and the export notice is what surfaced it: a
// class toggled from JS but never defined in the stylesheet fails SILENTLY.
// The element gets the class, nothing looks different, and no error is raised
// — so a message intended to read as neutral would have shipped in the error
// colour, or in no colour at all. Only literal class names are scanned;
// anything computed is out of reach here and belongs in the smoke test.
const toggledClasses = [
  ...new Set([...popupJs.matchAll(/classList\.(?:add|remove|toggle)\("([^"]+)"/g)]
    .map((m) => m[1])),
];
const styleBlock = ((popupHtml.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1]).replace(/\/\*[\s\S]*?\*\//g, "");
const definedClasses = new Set(
  [...styleBlock.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])
);
const undefinedClasses = toggledClasses.filter((c) => !definedClasses.has(c));

check("popup.js toggles at least four classes (the scan works)",
  toggledClasses.length >= 4);
check(`every class popup.js toggles is defined in popup.html${
  undefinedClasses.length ? " — undefined: " + undefinedClasses.join(", ") : ""}`,
  undefinedClasses.length === 0);

// ------------------------------- the chip recovery path (FINDING-002 / 028)
//
// v0.1.7 MADE THIS LOAD-BEARING AND THAT IS WHY IT IS PINNED HERE. Before the
// FINDING-028 narrowing, a denied or legacy domain had two ways back: the chip,
// and an unrelated Edit -> Save re-firing request() for everything ungranted.
// The second was the defect. The chip is now the ONLY in-app recovery, so it
// stops being a convenience and becomes the thing that keeps FINDING-002
// fixed. If a tidying pass ever makes the ungranted chip a plain span, a
// denied domain becomes a dead end again and nothing else in this suite would
// notice.
//
// STATED HONESTLY, THE SAME WAY THE F022 CHECKS ARE: these read popup.js as
// text. They prove the button and the request call are present in the source.
// They do NOT prove a dialog appears — that is a browser question, it is the
// v0.1.7 runbook's first row, and sitting C's "a denied origin still prompts
// on the next request" is the banked half of it.
check("F002: the ungranted domain chip is a BUTTON, not a span",
  /createElement\(granted \? "span" : "button"\)/.test(popupJs));
// --------------------------------------- buildRules duplicate ids (R10)
//
// Source scan for the same reason the popup checks are: sw.js imports chrome.*
// and cannot be imported here. Duplicate ids fail the atomic update by a
// different mechanism than an invalid id — "Rule with id 3 does not have a
// unique ID", the error that produced queue.js — and the queue cannot help
// when both profiles sit inside ONE run.
const swJs = stripJsComments(
  readFileSync(new URL("../extension/background/sw.js", import.meta.url), "utf8")
);
check("R10: buildRules computes a duplicate-id set",
  /const duplicateIds = new Set\(/.test(swJs));
check("R10: duplicate-id profiles are skipped, not registered",
  /if \(!isValidRuleId\(profile\.id\) \|\| duplicateIds\.has\(profile\.id\)\) \{\s*ineligible\.add\(profile\);\s*skippedProfileIds\.push\(profile\.id\);/
    .test(swJs));
// THE ORDERING IS THE INVARIANT, and nothing pinned it before v0.2.0.
// findCollisions() was fed every resolved profile, so a profile with an id
// Chrome rejects collided with a valid one and BOTH were skipped — a junk
// record in storage suppressed a working rule, and the refusal protected
// against nothing because the junk profile could never register. Feeding
// `resolved` here again restores that defect, and it is invisible: the
// extension loads, the popup renders, and the only symptom is a rule that
// quietly does not apply.
check("R10: collisions are computed over ELIGIBLE profiles, not all resolved",
  /const collisions = findCollisions\(\s*eligible\.map\(/.test(swJs) &&
  !/const collisions = findCollisions\(\s*resolved\.map\(/.test(swJs));
check("R10: the build loop iterates eligible, not resolved",
  /for \(const \{ profile, grantedDomains \} of eligible\) \{/.test(swJs));
// Ineligible profiles must be ABSENT FROM THE COLLISION INPUT but PRESENT in
// the accounting — removing them from the input is correct, dropping them from
// skippedProfileIds would hide them entirely.
check("R10: ineligible profiles are still counted as skipped",
  /ineligible\.add\(profile\);\s*skippedProfileIds\.push\(profile\.id\);/.test(swJs));
// THE THRESHOLD IS THE POLICY. `count > 1` means every profile holding a
// repeated id is skipped; `count > 2` would let an ordinary pair through while
// still looking like duplicate detection. A mutant scoring zero against the
// check above is what exposed the gap — the scan pinned the skip and left the
// definition of "duplicate" free.
check("R10: a repeated id means BOTH holders skipped, not the later one",
  /filter\(\(\[, count\]\) => count > 1\)/.test(swJs));

// ------------------------------ scope language honesty (HW-V6-01 interim)
//
// THE GREEN DOT REPORTS A GRANT, NOT AN EFFECT, and the tooltip used to say
// "headers apply" without qualification. Chrome needs host permission for the
// request URL AND its INITIATOR for everything except navigations, and
// HeaderWright grants only the target — so a profile on api.example.com does
// nothing when app.example.com calls it, while this tooltip asserted it did.
//
// These pin WORDING, which is unusual for this suite and deliberate. The
// interim fix for HW-V6-01 is entirely a claims fix: no code behaviour
// changes, `RESOURCE_TYPES` is untouched, and the only thing that could
// regress is the text quietly going back to the confident version.
const readmeText = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const scopeText = readFileSync(new URL("../SCOPE.md", import.meta.url), "utf8");

// The exact false claim, so it cannot return by copy-paste.
check("HW-V6-01: the tooltip no longer claims headers simply apply",
  !/permission granted, headers apply/.test(popupJs));
check("HW-V6-01: the granted tooltip names the initiator condition",
  /another granted domain/.test(popupJs));
// Same-origin subresources DO work — sitting G observed /favicon.ico. Wording
// that implied otherwise would be a different false claim, not a fix.
check("HW-V6-01: the tooltip still credits page loads on this domain",
  /page loads here/.test(popupJs));
check("HW-V6-01: README documents the initiator requirement",
  /initiator/.test(readmeText) && /A second exception/.test(readmeText));
check("HW-V6-01: SCOPE states the constraint and its consequence",
  /second constraint/i.test(scopeText) && /initiator/.test(scopeText) &&
  /api\.example\.com/.test(scopeText));
// THE TWO TRAPS, DOCUMENTED SO THEY ARE NOT TAKEN QUIETLY. Adding
// initiatorDomains to the current rule is not a grant and would break
// navigations; putting the initiator in the target list would send
// Authorization and Cookie values to the initiator site.
// THE HEADING IS PART OF THE WARNING, not decoration around it. A mutant that
// replaced "Not fixable by widening the rule." with "Note." scored ZERO
// against a check that only read the body — the trap stayed documented and
// stopped being findable, which for a warning is most of its value.
check("HW-V6-01: SCOPE records why widening the rule is not the fix",
  /\*\*Not fixable by widening the rule\.\*\*/.test(scopeText) &&
  /does not grant anything/.test(scopeText) &&
  /Authorization, Cookie/.test(scopeText));
// RESOURCE_TYPES MUST NOT BE NARROWED as part of this. Same-origin
// subresources work today; dropping types would remove them.
check("HW-V6-01: the interim did not narrow RESOURCE_TYPES",
  RESOURCE_TYPES.includes("xmlhttprequest") &&
  RESOURCE_TYPES.includes("image") &&
  RESOURCE_TYPES.includes("main_frame"));

// THE POPUP MUST NOT KEEP ITS OWN DECODER. It read storage directly with
// `(stored[KEY] || []).map(...)`, so it could list and offer to edit a profile
// the worker had already dropped.
// PIN WHAT IS RETURNED, not merely that the decoder is called. The first
// version matched the call site, so a mutant that called the decoder and then
// returned raw storage anyway scored ZERO — the check watched the wrong half
// of the function.
// A DROPPED RECORD MUST LEAVE A DURABLE TRACE. console.warn dies with the
// worker; hw:sync is what the popup can read. Persisting is not the same as
// rendering — the badge and status line still cannot say "partial", which is
// HW-V7-04 and is out of this slice on purpose.
// The persisted record is now the v2 reconciliation result, so this pins the
// field inside it rather than the old two-boolean shape. HW-V7-04 also made
// `dropped` RENDERED rather than merely stored — see the partial checks above.
check("HW-V7-01: dropped-profile reasons are persisted, not console-only",
  /dropped = state\.problems;/.test(swJs) &&
  /schemaVersion: SYNC_SCHEMA_VERSION/.test(swJs) &&
  // ANCHORED TO THE PERSISTED RECORD, not to `dropped,` anywhere. The first
  // version matched a second occurrence in the badge call, so a mutant that
  // removed the field from the STORED record scored zero — the check watched
  // the wrong one of two identical-looking lines.
  /dropped,\s*\n\s*error,/.test(swJs));

// ---- HW-V7-04, worker half. Source scans because sw.js calls chrome.* at
// module scope and cannot be imported. Each pins a line whose removal makes
// the status claim something it cannot support — and none of them breaks a
// rule on the wire, which is exactly why only a check will catch it.
check("HW-V7-04: skipped profile ids reach the status record",
  /skipped = plan\.skippedProfileIds\.map\(\(profileId\) => \(\{ profileId \}\)\);/
    .test(swJs));
// THE LINE THAT KEEPS THE FAILURE HONEST. A failed atomic update changes
// nothing, so the last revision that actually reached the wire is still live.
// Overwriting it erases the only record of what is really applying.
check("HW-V7-04: a failed sync preserves the last applied revision",
  /appliedRevision: syncOk \? desiredRevision : previousApplied/.test(swJs) &&
  /activeRuleCount: syncOk \? activeRuleCount : previousRuleCount/.test(swJs));
check("HW-V7-04: the worker ties its result to a configuration revision",
  /desiredRevision = configRevision\(state\.profiles, enabled\);/.test(swJs));

check("HW-V7-01: the popup decodes storage through the shared module",
  /decodeStoredState\(stored, \{/.test(popupJs) &&
  /return state\.profiles;/.test(popupJs) &&
  !/\(stored\[STORAGE_KEY_PROFILES\] \|\| \[\]\)\.map/.test(popupJs));
check("HW-V7-01: validation is defined once, not re-declared per consumer", (() => {
  const canonicalJs = readFileSync(
    new URL("../extension/lib/canonical.js", import.meta.url), "utf8"
  );
  const storedJs = readFileSync(
    new URL("../extension/lib/stored.js", import.meta.url), "utf8"
  );
  // Neither consumer may hold its own copy of the key sets or its own
  // per-profile checks. Both must import the shared validator.
  return !/const PROFILE_KEYS = new Set/.test(canonicalJs) &&
    /from "\.\/profile\.js"/.test(canonicalJs) &&
    /validateProfile/.test(storedJs);
})());

check("F002: the chip's click handler requests THAT DOMAIN only",
  /permissions\.request\(\{\s*origins: originsForDomain\(domain\),?\s*\}\)/.test(popupJs));

// ------------------------------------------- platform floor (AR-11, AR-23)
//
// THE FLOOR NAMED ONE CAPABILITY, AND THE EXTENSION USED MORE. The manifest
// said "101" because requestDomains is Chrome 101. Nothing compared that with
// optional_host_permissions (102) or with a request append, which registers
// on no Chrome below 108 and, until 143, only under its allowlist's lowercase
// spelling: one append typed "X-Forwarded-For" failed the whole sync and kept
// every later change from registering (FINDING-049). The floor is now
// DERIVED. Everything the extension asks of Chrome must be in
// test/platform-floor.mjs with the version that provides it, and the manifest
// must EQUAL the highest of them. Checks 1–14 of
// test/PREDICTIONS-2026-10-09-s5.md, in order.
//
// THE API SCAN READS THE FILES ITSELF: every .js under extension/, comments
// stripped, so a chrome.* call added anywhere is collected, not only in the
// files the scans above happen to read. A hand walk rather than readdirSync's
// `recursive` option, which Node releases before 18.17 ignore silently.
const extensionJsFiles = [];
const walkExtension = (dir) => {
  for (const entry of readdirSync(new URL(`../extension/${dir}`, import.meta.url))) {
    const rel = `${dir}${entry}`;
    if (statSync(new URL(`../extension/${rel}`, import.meta.url)).isDirectory()) {
      walkExtension(`${rel}/`);
    } else if (rel.endsWith(".js")) {
      extensionJsFiles.push(rel);
    }
  }
};
walkExtension("");
const apisInUse = [
  ...new Set(
    extensionJsFiles.flatMap((rel) =>
      platformFloor.apiPaths?.(
        stripJsComments(readFileSync(new URL(`../extension/${rel}`, import.meta.url), "utf8"))
      ) ?? []
    )
  ),
].sort();
const isRegistered = (kind, name) => Boolean(platformFloor.requirementFor?.(kind, name));
// A probe with every operation the product can emit, on both sides.
const floorProbeRule = profileToRule({
  id: 1, name: "probe", domains: ["example.com"],
  headers: [
    { name: "X-Probe-Set", operation: "set", value: "1" },
    { name: "x-forwarded-for", operation: "append", value: "203.0.113.7" },
    { name: "X-Probe-Remove", operation: "remove" },
    { name: "X-Probe-Response", operation: "set", value: "1", side: "response" },
    { name: "Server", operation: "remove", side: "response" },
  ],
}, ["example.com"]);
const manifestKeysInUse = platformFloor.manifestKeys?.(manifest) ?? [];
const permissionsInUse = platformFloor.manifestPermissions?.(manifest) ?? [];
const rulePartsInUse = platformFloor.ruleParts?.(floorProbeRule) ?? [];
const derivedFloor = platformFloor.floorOf?.([
  ...apisInUse.map((name) => ({ kind: "api", name })),
  ...manifestKeysInUse.map((name) => ({ kind: "manifest", name })),
  ...permissionsInUse.map((name) => ({ kind: "permission", name })),
  ...rulePartsInUse.map((name) => ({ kind: "rule", name })),
  ...[...APPENDABLE_REQUEST_HEADERS].map((name) => ({ kind: "append", name })),
]) ?? { floor: 0, setBy: [], unregistered: [] };

// 1
check("AR-11: every platform requirement has a kind, a unique name, a Chrome version, a basis and a source", (() => {
  const requirements = platformFloor.REQUIREMENTS;
  if (!Array.isArray(requirements) || requirements.length === 0) return false;
  const seen = new Set();
  for (const r of requirements) {
    if (!platformFloor.KINDS?.has(r?.kind) || !platformFloor.BASES?.has(r?.basis)) return false;
    if (typeof r.name !== "string" || r.name === "") return false;
    if (!Number.isInteger(r.chrome) || r.chrome < 1) return false;
    if (typeof r.source !== "string" || !/^(chromium-source|chrome-docs): \S/.test(r.source)) return false;
    if (seen.has(`${r.kind} ${r.name}`)) return false;
    seen.add(`${r.kind} ${r.name}`);
  }
  return true;
})());
// 2. The scan's positive control: without it, checks 3 and 8 could pass on a
// scan that found nothing.
check("AR-11: the scan finds the chrome.* APIs the extension calls: at least twelve, including chrome.storage.session and chrome.declarativeNetRequest.updateDynamicRules",
  apisInUse.length >= 12 &&
  apisInUse.includes("chrome.storage.session") &&
  apisInUse.includes("chrome.declarativeNetRequest.updateDynamicRules"));
// 3–7. A capability the table lacks cannot raise the derived floor, so each
// kind is required to be registered in full.
check("AR-11: every chrome.* API the extension calls is registered",
  apisInUse.length > 0 && apisInUse.every((name) => isRegistered("api", name)));
check("AR-11: every manifest key is registered",
  manifestKeysInUse.length > 0 && manifestKeysInUse.every((name) => isRegistered("manifest", name)));
check("AR-11: every permission the manifest requests is registered",
  permissionsInUse.length > 0 && permissionsInUse.every((name) => isRegistered("permission", name)));
check("AR-11: every part of the rule the builder emits is registered (request set, append and remove; response set and remove)",
  floorProbeRule?.action?.requestHeaders?.length === 3 &&
  floorProbeRule?.action?.responseHeaders?.length === 2 &&
  rulePartsInUse.length > 0 &&
  rulePartsInUse.every((name) => isRegistered("rule", name)));
check("AR-23: every header name a request may append is registered",
  APPENDABLE_REQUEST_HEADERS.size > 0 &&
  [...APPENDABLE_REQUEST_HEADERS].every((name) => isRegistered("append", name)));
// 8. EQUALITY, NOT "AT LEAST". Below the derived floor the extension installs
// where it cannot work; above it, it refuses users it could serve. Both are a
// wrong number, and either way the fix is a deliberate edit.
check("AR-11: manifest.minimum_chrome_version equals the highest requirement in use",
  derivedFloor.floor > 0 &&
  manifest.minimum_chrome_version === String(derivedFloor.floor));
// 9. The README is where a user reads the floor before installing.
check("AR-11: README's Install section reads `Requires Chrome N or later.`, with N the manifest's floor", (() => {
  const install = readmeText.match(/^## Install\n([\s\S]*?)(?=^## )/m)?.[1] ?? "";
  const stated = install.match(/Requires Chrome (\d+) or later\./);
  return typeof manifest.minimum_chrome_version === "string" &&
    stated !== null && stated[1] === manifest.minimum_chrome_version;
})());
// 10–13. AR-23: what reaches Chrome is the allowlist's spelling for an append,
// and the typed name for everything else.
const typedAppendRule = profileToRule({
  id: 7, name: "append typed", domains: ["example.com"],
  headers: [{ name: "X-Forwarded-For", operation: "append", value: "v" }],
}, ["example.com"]);
check("AR-23: an append typed X-Forwarded-For is registered as x-forwarded-for",
  typedAppendRule?.action?.requestHeaders?.length === 1 &&
  typedAppendRule.action.requestHeaders[0].operation === "append" &&
  typedAppendRule.action.requestHeaders[0].header === "x-forwarded-for");
check("AR-23: each of the 21 appendable names, typed in capitals, is registered in its allowlist spelling", (() => {
  const names = [...APPENDABLE_REQUEST_HEADERS];
  return names.length > 0 && names.every((name) => {
    const built = profileToRule({
      id: 8, name: "capitals", domains: ["example.com"],
      headers: [{ name: name.toUpperCase(), operation: "append", value: "v" }],
    }, ["example.com"]);
    return built?.action?.requestHeaders?.[0]?.header === name;
  });
})());
const typedOtherRule = profileToRule({
  id: 9, name: "typed", domains: ["example.com"],
  headers: [
    { name: "X-Debug", operation: "set", value: "1" },
    { name: "X-Strip", operation: "remove" },
    { name: "X-Resp", operation: "set", value: "1", side: "response" },
    { name: "Server", operation: "remove", side: "response" },
  ],
}, ["example.com"]);
check("AR-23: a set and a remove, on either side, keep their names as typed",
  JSON.stringify(typedOtherRule?.action?.requestHeaders?.map((h) => h.header)) ===
    JSON.stringify(["X-Debug", "X-Strip"]) &&
  JSON.stringify(typedOtherRule?.action?.responseHeaders?.map((h) => h.header)) ===
    JSON.stringify(["X-Resp", "Server"]));
// The card renders what Chrome registered, so the lowercase name is what it
// shows; a set still reads as typed (check 12).
check("AR-23: the card reads that append back as `req · append · x-forwarded-for → \"v\"`", (() => {
  const readback = describeReadback({ syncState: "applied", rule: typedAppendRule });
  return readback.kind === "entries" && readback.lines.length === 1 &&
    formatReadbackLine(readback.lines[0]) === 'req · append · x-forwarded-for → "v"';
})());
// 14. ONLY WHAT IS SENT CHANGES. The stored form keeps the name as typed, so
// no stored profile, export, profileDigest or configRevision moves.
check("AR-23: the stored form keeps the typed name: the export and configRevisionText keep X-Forwarded-For, and the entry is valid", (() => {
  const profile = {
    id: 14, name: "p14", domains: ["example.com"],
    headers: [{ name: "X-Forwarded-For", operation: "append", value: "v" }],
  };
  let exported = "";
  try { exported = serializeProfiles([profile]); } catch { return false; }
  return validateHeaderEntry(profile.headers[0]).valid === true &&
    exported.includes('"name": "X-Forwarded-For"') &&
    (statusLib.configRevisionText?.([profile], true) ?? "").includes('"X-Forwarded-For"');
})());

// ------------------------------------------------ popup side control (0.2.0)
//
// WHAT THESE ARE, STATED THE SAME WAY AS THE F002 AND F022 BLOCKS ABOVE: they
// read popup.js and popup.html as text. They prove the control is wired in the
// source. They do NOT prove a response header reaches the wire — that is the
// oracle's job at test/oracle/, same-origin, and no check in this file can
// stand in for it.
//
// They earn their place because every failure mode below is SILENT. A side
// select that reads entry.side directly still works for new profiles and
// quietly reclassifies old ones. A readForm() that writes side unconditionally
// still saves correctly and changes every existing user's export. Neither
// throws, neither shows on any surface, and the suite is the only thing that
// would notice before a user did.

check("0.2.0: the header row carries a side select",
  /className = "h-side"/.test(popupJs));
check("0.2.0: sideOf is IMPORTED, not reimplemented in the popup",
  /sideOf,?\s*\n?\s*\}\s*from\s*"\.\.\/lib\/collisions\.js"/.test(popupJs) &&
  !/function sideOf/.test(popupJs));
// The default rule is the one that decides what a 0.1.x profile MEANS on open.
// Reading entry.side directly would land a sideless entry on whichever option
// happens to be first in the loop.
check("0.2.0: the selected side comes from sideOf(entry), not entry.side",
  /side === sideOf\(entry\)/.test(popupJs));
// BOUND TO THE STATEMENT, NOT THE SUBSTRING — tightened 2026-09-20.
// This read `/querySelector\("\.h-side"\)/` until FINDING-042's fix added
// readFormRaw(), which contains the same substring. The mutant that blanks
// readForm's side read then stopped failing anything: the string was still
// present, in the other function. `mutate-collisions.py` caught it as a
// ZERO-FAIL mutation on the first run after the change.
//
// THE LESSON IS GENERAL. A bare substring scan is weakened by any new
// occurrence anywhere in the file, and the weakening is silent — the check
// keeps passing, which is exactly what it looks like when it is working.
// Scans that pin behaviour should match the statement they mean.
check("0.2.0: readForm reads the side control",
  /const side = row\.querySelector\("\.h-side"\)\.value;/.test(popupJs));
check("F042: readFormRaw reads the side control too",
  /side: row\.querySelector\("\.h-side"\)\.value,/.test(popupJs));
// THE REQUEST SIDE IS ABSENCE. This is the check that pins the format claim:
// an unconditional `entry.side = side` would rewrite every existing profile on
// its first save with no behaviour change to show for it.
check("0.2.0: request is written as absence, never as side: \"request\"",
  /if \(side === "response"\) entry\.side = side;/.test(popupJs));
check("0.2.0: the side select is appended BEFORE the operation select",
  /row\.append\(nameInput, sideSelect, opSelect, valueInput, removeBtn\)/
    .test(popupJs));
// UI-03 (s5 commit 4, ruled S5-D3): the row is two lines, and every control is
// PLACED BY ITS CLASS'S grid-area, not by DOM order. The check that pinned the
// five-column track list is gone with the layout it pinned; check 26 below
// is what now keeps each control in its place. Checks 25–28 of
// test/PREDICTIONS-2026-10-09-s5.md.
// 25
check("UI-03: the .hrow rule has grid-template-columns: 56px 82px 1fr 24px and grid-template-areas: \"name name name remove\" \"side op value value\"",
  /\.hrow \{[^}]*grid-template-columns: 56px 82px 1fr 24px;[^}]*grid-template-areas: "name name name remove" "side op value value";/
    .test(popupHtml));
// 26. A grid-area on a class popup.js never assigns places nothing, and an
// area nobody takes leaves a hole. Both fail silently in the browser.
const hrowAreaRules = [...popupHtml.matchAll(/\.hrow \.([a-z-]+) \{ grid-area: ([a-z]+); \}/g)]
  .map((m) => ({ cls: m[1], area: m[2] }));
const hrowTemplateAreas = new Set(
  (popupHtml.match(/\.hrow \{[^}]*grid-template-areas:((?:\s*"[^"]*")+);/)?.[1] ?? "")
    .replaceAll('"', " ").trim().split(/\s+/).filter(Boolean)
);
const popupAssignedClasses = new Set(
  [...popupJs.matchAll(/className = "([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/))
);
check("UI-03: every .hrow grid-area rule names a class popup.js assigns, each area of the template is given to exactly one class, and no class is given an area the template lacks",
  hrowAreaRules.length >= 5 &&
  hrowTemplateAreas.size >= 5 &&
  hrowAreaRules.every(({ cls }) => popupAssignedClasses.has(cls)) &&
  [...hrowTemplateAreas].every((area) => hrowAreaRules.filter((r) => r.area === area).length === 1) &&
  hrowAreaRules.every(({ area }) => hrowTemplateAreas.has(area)));
// 27. The compact padding is what keeps three header rows inside 600 px.
check("UI-03: the compact rule .hrow input[type=\"text\"], .hrow select, .hrow .h-side { padding-top: 3px; padding-bottom: 3px; } is there",
  popupHtml.includes('.hrow input[type="text"], .hrow select, .hrow .h-side { padding-top: 3px; padding-bottom: 3px; }'));
// 28. The width is UI-05a's to change (S5-D14, S5-D15), not this commit's.
check("UI-03: the popup is still 380 px wide",
  /body \{[^}]*width: 380px;/.test(popupHtml));
// A fixed width on `.hrow select` would overflow the narrower column, which is
// why the rule that used to set 82px no longer does.
check("0.2.0: .hrow select takes its width from the grid, not a fixed rule",
  !/\.hrow select \{[^}]*width:/.test(popupHtml));

// THE RENAME MUTANT EXPOSED A GAP, which is what mutants are for. Checking
// that `className = "h-side"` appears proves the class is ASSIGNED. It does
// not prove readForm queries the same string — rename one side and the row
// still builds, the select still renders, and readForm's querySelector
// silently returns null. So check the two sides AGREE, for every .h-* hook
// rather than just this one, since the next control added will have the same
// failure available to it.
const assignedHooks = new Set(
  [...popupJs.matchAll(/className = "(?:mono )?(h-[a-z-]+)"/g)].map((m) => m[1])
);
const queriedHooks = new Set(
  [...popupJs.matchAll(/querySelector\("\.(h-[a-z-]+)"\)/g)].map((m) => m[1])
);
check("0.2.0: the row-hook scan found something (the check works)",
  assignedHooks.size >= 4 && queriedHooks.size >= 3);
for (const hook of [...queriedHooks].sort()) {
  check(`0.2.0: .${hook} is queried and is assigned by the same file`,
    assignedHooks.has(hook));
}

// ------------------------------------------------- oracle page (test/oracle)
//
// THE ONLY CHECKS IN THIS FILE THAT READ A TEST ARTIFACT RATHER THAN SHIPPED
// CODE, and they are here because nothing else looks at that page at all.
// selfcheck.mjs exercises the server and the diff; it never opens index.html.
// So the page could go back to rendering a pass as a failure and every green
// signal in the project would stay green.
//
// What they pin is a SEMANTIC, not a colour preference. "UNMODIFIED" is the
// expected result in the control phase and a rule that did not fire in the
// feature phase. A fixed pass/fail colour is therefore wrong in one of the two
// phases no matter which way round it is set, which is why the fix was to stop
// colouring the verdict rather than to swap the two values.

// The page is now HTML plus an external module, so both are read. The split
// exists for the syntax gate and for injection safety (HW-V7-07): an inline
// module is invisible to verify.mjs, and measured header values reaching
// innerHTML let the subject of the experiment write DOM into its own
// certificate.
const oracleHtml = readFileSync(
  new URL("../test/oracle/index.html", import.meta.url), "utf8"
) + readFileSync(
  new URL("../test/oracle/index.mjs", import.meta.url), "utf8"
);
const initiatorJs = readFileSync(
  new URL("../test/initiator/index.mjs", import.meta.url), "utf8"
);

// NO MEASURED DATA MAY REACH innerHTML on either page. Clearing a container
// with "" is permitted and is not a sink; anything with an interpolation in it
// is. Checked on both pages so the safe one cannot regress to match the other.
// COMMENTS STRIPPED FIRST. The first version of this check failed on its own
// documentation: the module's header comment names innerHTML and
// insertAdjacentHTML while explaining why they are banned. A check that a file
// cannot describe its own rule is a check that punishes writing the rule down.
for (const [label, src] of [["response", oracleHtml], ["initiator", initiatorJs]]) {
  const code = stripJsComments(src);
  check(`HW-V7-07: the ${label} oracle never interpolates into innerHTML`,
    !/innerHTML\s*=\s*`[^`]*\$\{/.test(code) &&
    !/insertAdjacentHTML/.test(code));
}
check("HW-V7-07: the response oracle builds its rows with textContent",
  /textContent/.test(oracleHtml) && /createElement\("td"\)|el\("td"/.test(oracleHtml));
// Inline modules are outside the syntax gate, which walks .js and .mjs only.
for (const [label, file] of [["response", "oracle"], ["initiator", "initiator"]]) {
  const html = readFileSync(
    new URL(`../test/${file}/index.html`, import.meta.url), "utf8"
  );
  check(`HW-V7-07: the ${label} oracle has no inline module script`,
    !/<script type="module">/.test(html) &&
    /<script type="module" src="\.\/index\.mjs">/.test(html));
}

// PIN THE CLASS STRINGS, NOT ONLY THE STYLESHEET. The first version checked
// that `.unmodified` and `.modified` rules were absent from the CSS — but the
// verdict class is now chosen in JS, so a mutant that reintroduced
// `verdict unmodified` there changed no CSS and scored ZERO. Colour must not
// encode the verdict at the point the verdict is decided.
check("oracle: the verdict box carries no pass/fail colour class",
  !/class="verdict \$\{/.test(oracleHtml) &&
  !/verdict (un)?modified/.test(oracleHtml) &&
  !/\.unmodified\s*\{/.test(oracleHtml) &&
  !/\.modified\s*\{/.test(oracleHtml));
// The failure path used to reuse the UNMODIFIED class, so an instrument that
// threw and an instrument that measured agreement rendered identically.
// The class now reaches the DOM through el(..., "verdict failed") rather than
// an HTML attribute, so match the class string itself and its stylesheet rule.
check("oracle: MEASUREMENT FAILED renders in its own class",
  /"verdict failed"/.test(oracleHtml) && /\.failed\s*\{/.test(oracleHtml));
check("oracle: the page states that UNMODIFIED inverts between phases",
  /UNMODIFIED.{0,40}not a verdict on its own/s.test(oracleHtml));

// ------------------------------------------- popup containment (FINDING-022)
//
// WHAT THESE CHECKS ARE, STATED PLAINLY SO NOBODY MISTAKES THEM FOR THE
// EVIDENCE. They read the stylesheet as text. They prove the declarations are
// present; they do NOT prove the popup lays out correctly, because nothing
// here renders anything. The oracle for FINDING-022 is visual and lives in
// SMOKE.md Part 14 — toggle and status line visible at a profile count well
// past the OBS-D12 threshold of three.
//
// They earn their place as a TRIPWIRE. The narrow fix is four declarations
// spread across three rules, and any one of them going missing reinstates the
// bug silently: the popup still renders, still works, and simply scrolls its
// header away again at some profile count nobody is currently looking at.
// min-height: 0 is the most fragile of the four — it looks redundant, it is
// the one a tidying pass would delete, and without it overflow-y never
// engages at all.

check("F022: the popup body is height-bounded",
  /body\s*\{[^}]*max-height:/.test(styleBlock));
// OBS-E1. The cap was `min(600px, 100vh)` and collapsed the popup to 107px at
// ZERO profiles, clipping Add profile — because `vh` resolves against a
// viewport this popup derives from its own content height, and `min()` takes
// the smaller term. A cap that feeds on its own output is not a cap.
//
// STATED HONESTLY: this check exists because a browser said so. Nothing in
// the suite could have predicted it, the six declaration checks below all
// passed against the broken build, and they were right to — they read the
// stylesheet as text. What this pins is the specific defect, so it cannot
// return silently.
check("F022: the body cap uses NO viewport unit",
  !/body\s*\{[^}]*max-height:[^;]*\b\d*\.?\d*v(h|w|min|max)\b/.test(styleBlock));
check("F022: the popup body is a flex COLUMN",
  /body\s*\{[^}]*flex-direction:\s*column/.test(styleBlock));
check("F022: main is the scrolling region",
  /(?:^|[\s}])main\s*\{[^}]*overflow-y:\s*auto/.test(styleBlock));
check("F022: main can shrink below its content (min-height: 0)",
  /(?:^|[\s}])main\s*\{[^}]*min-height:\s*0/.test(styleBlock));
check("F022: the header does not shrink",
  /(?:^|[\s}])header\s*\{[^}]*flex:\s*none/.test(styleBlock));
check("F022: the status line does not shrink",
  /(?:^|[\s}])footer\s*\{[^}]*flex:\s*none/.test(styleBlock));
// Structural, not stylistic: pinning works because these two are SIBLINGS of
// the scrolling region. A footer moved inside <main> scrolls with the list and
// every declaration above stays true while the fix stops working.
check("F022: the toggle and the status line sit OUTSIDE the scrolling region",
  /<header[\s\S]*<main[\s\S]*<\/main>[\s\S]*<footer/.test(popupHtml));

// ------------------------------------------- migration wording (FINDING-023)
//
// The chip's `title` carries the only explanation of why a chip is gray under
// migration, and it does not render on hover — so that explanation was
// reachable through DevTools and nowhere else. The fix moves the distinction
// into the notice, which names the visual marker.
//
// THE TWO HALVES MUST AGREE, and this is the whole reason it is checked here
// rather than left to the browser row: the notice's word is only true while
// `.migrating` is the thing carrying an underline. Change the stylesheet and
// the sentence becomes a wrong instruction with nothing to catch it.
check("F023: the migration notice names the visual marker",
  /underlined domain/.test(popupJs));
check("F023: .migrating is what carries the underline the notice names",
  /\.migrating\s*\{[^}]*text-decoration:\s*underline/.test(styleBlock));
// An ordinary ungranted chip must NOT be underlined, or "underlined" stops
// picking out the migrating ones and the notice over-counts.
check("F023: a plain ungranted chip is marked by its BORDER, not an underline",
  /button\.domain\s*\{[^}]*border-style:\s*dashed/.test(styleBlock) &&
  !/button\.domain\s*\{[^}]*text-decoration/.test(styleBlock));

// -------------------------- status honesty (finding 4 A5, then HW-V7-04)
//
// THE v0.1.1 CLAIMS ARE ALL STILL HERE, rewritten for the record shape rather
// than deleted. Each one was a false assertion the badge used to make, and a
// check that stops being expressible when the API changes is a guarantee
// quietly dropped. The 2026-09-14 additions sit below them.
//
// The old note said activeRuleCount and the four-state scheme were "NOT here
// on purpose" and belonged in their own minor. This is that minor.

const REC = (o) => ({ ...DEFAULT_SYNC_STATE, desiredRevision: "r", ...o });
const applied = (o = {}) => REC({ state: "applied", activeRuleCount: 1, ...o });
const failedRec = (o = {}) => REC({ state: "failed", error: "boom", ...o });
const at = (enabled, record) => ({ enabled, desiredRevision: "r", record });

check("enabled + successful sync shows ON",
  computeBadge(at(true, applied())) === BADGE_ON);
check("disabled + successful sync shows OFF",
  computeBadge(at(false, REC({ state: "paused" }))) === BADGE_OFF);
check("enabled + FAILED sync does not show ON",
  computeBadge(at(true, failedRec())) !== BADGE_ON);
check("enabled + FAILED sync shows the failure badge",
  computeBadge(at(true, failedRec())) === BADGE_FAILED);
// FAILURE OUTRANKS THE TOGGLE. When the toggle goes off, the sync that runs is
// the one CLEARING the rules; if that failed, OFF is as false as ON.
check("DISABLED + failed sync does not show OFF either (clear may have failed)",
  computeBadge(at(false, failedRec())) === BADGE_FAILED);
check("badge text fits Chrome's badge (<= 4 chars) in every state",
  [BADGE_ON, BADGE_OFF, BADGE_FAILED, BADGE_PARTIAL, BADGE_STALE]
    .every((b) => b.text.length <= 4));
check("every badge state carries a colour",
  [BADGE_ON, BADGE_OFF, BADGE_FAILED, BADGE_PARTIAL, BADGE_STALE]
    .every((b) => /^#[0-9a-f]{6}$/i.test(b.color)));

// UI-04 (s5, ruled 2026-09-28, R1-R3): the count is of rules Chrome has
// REGISTERED. "applying" claimed traffic was being modified, which two
// colliding profiles or a cross-site initiator can make false.
check("status line says registered when enabled and synced",
  describeSync(at(true, applied())) === "registered 1");
check("status line says paused when disabled and synced",
  describeSync(at(false, REC({ state: "paused" }))) === "paused");
// THE POSITIVE CONTROL IS PART OF THE CHECK. Testing only that the failed
// line does not start with a word would pass vacuously on any wording change.
check("status line does not claim registered after a failed sync",
  describeSync(at(true, applied())).startsWith("registered") &&
  !describeSync(at(true, failedRec())).startsWith("registered"));
check("status line does not claim paused after a failed sync",
  describeSync(at(false, failedRec())) !== "paused");
check("failed-sync text names the failure rather than a stale good state",
  describeSync(at(true, failedRec())).includes("failed"));
check("missing sync state defaults to ok, not to a claimed failure",
  DEFAULT_SYNC_STATE.state !== "failed" &&
  computeBadge({ enabled: true, desiredRevision: null, record: null }) === BADGE_ON);

// ---- HW-V7-04. Two claims the two-boolean model made that were FALSE.
//
// 1. "not applying" after a failed atomic update. Chrome documents that a
//    failed updateDynamicRules() changes NOTHING, so the previous rules are
//    still registered and still modifying traffic. Telling a user nothing is
//    applying, when something may be, is the more dangerous of the two errors.
check("HW-V7-04: a failed sync never claims rules are not applying",
  !/not applying/.test(describeSync(at(true, failedRec()))) &&
  !/not applying/.test(describeSync(at(false, failedRec()))));
check("HW-V7-04: a failed sync says the previous rules may still be live",
  /previous rules may still be applying/.test(describeSync(at(true, failedRec()))));

// 2. "applying" after a successful update that registered nothing, or that
//    skipped profiles. buildRules() computed skippedProfileIds and runSync()
//    discarded it, so every reason a profile did not apply was known and
//    thrown away.
check("HW-V7-04: a successful zero-rule sync reads nothing registered",
  describeSync(at(true, applied({ activeRuleCount: 0 }))) === "nothing registered");
check("HW-V7-04: skipped profiles produce partial, not applied",
  classify(at(true, applied({ skipped: [{ profileId: 9 }] }))) === "partial" &&
  computeBadge(at(true, applied({ skipped: [{ profileId: 9 }] }))) === BADGE_PARTIAL);
check("HW-V7-04: partial says how many registered AND how many did not",
  describeSync(at(true, applied({ activeRuleCount: 2, skipped: [{ profileId: 9 }] })))
    === "registered 2 \u00b7 1 not registered");
// Dropped malformed records count too. They were persisted but invisible.
check("HW-V7-04: dropped records also make the result partial",
  classify(at(true, applied({ dropped: ["profile 2 dropped: bad"] }))) === "partial");

// 3. A result that does not describe the CURRENT configuration claims nothing.
//    The popup can render from a storage change before the worker reconciles.
check("HW-V7-04: a record for a different configuration reads as stale",
  classify({ enabled: true, desiredRevision: "new", record: applied() }) === "stale" &&
  /registered/.test(describeSync(at(true, applied()))) &&
  !/registered/.test(describeSync({ enabled: true, desiredRevision: "new", record: applied() })));
// But a KNOWN FAILURE beats "we do not know" — it describes reality better.
check("HW-V7-04: failure outranks staleness",
  classify({ enabled: true, desiredRevision: "new", record: failedRec() }) === "failed");

// 4. v0.1.x records must still be readable. An upgrading install holds
//    {ok, error} and the worker may not rewrite it until something changes.
check("HW-V7-04: a v0.1.x {ok:false} record still reads as failed",
  readSyncRecord({ ok: false, error: "old" }).state === "failed" &&
  readSyncRecord({ ok: false, error: "old" }).error === "old");
check("HW-V7-04: a v0.1.x {ok:true} record does not invent an applied count",
  readSyncRecord({ ok: true, error: null }).activeRuleCount === 0 &&
  readSyncRecord({ ok: true, error: null }).appliedRevision === null);
check("HW-V7-04: garbage in the status key does not claim a failure",
  readSyncRecord(null).state !== "failed" &&
  readSyncRecord("nonsense").state !== "failed" &&
  readSyncRecord([]).state !== "failed");

// 5. The revision must actually distinguish configurations, or staleness is
//    undetectable and every check above passes vacuously.
const pA = [{ id: 1, name: "n", domains: ["a.com"],
  headers: [{ name: "x", operation: "set", value: "v" }] }];
const pB = [{ id: 1, name: "n", domains: ["a.com"],
  headers: [{ name: "x", operation: "set", value: "CHANGED" }] }];
check("HW-V7-04: configRevision is stable for the same configuration",
  configRevision(pA, true) === configRevision(pA, true));
check("HW-V7-04: configRevision changes when a header value changes",
  configRevision(pA, true) !== configRevision(pB, true));
check("HW-V7-04: configRevision changes when the toggle changes",
  configRevision(pA, true) !== configRevision(pA, false));

// ---- AR-01. The three checks above test stability and change, never
// INJECTIVITY, and that was the gap: the text fed to the hash joined fields
// with ":", ",", "|", ";" and "\u0000", and every one of those is legal INSIDE
// some field. Two different configurations produced the same text, so the
// same revision, so a status record for one read as current for the other.
// Checks 1–12 of test/PREDICTIONS-2026-09-27-s2.md, in that order.
//
// Each pair below is built from values the validators accept, so each is a
// configuration a user can actually store — not a synthetic string.
const ar01Base = { id: 1, name: "n", domains: ["a.com"] };
// EVERY FIXTURE IS STORABLE, and checks 1–4 assert it as a precondition: a
// collision between configurations no user can store proves nothing. Added
// after two predicted fixtures turned out to be invalid (see check 3).
const ar01Storable = (profiles) =>
  profiles.every((p) => validateProfile(p, { version: FILE_VERSION }).valid);
// 1. A header VALUE containing the entry and field separators.
const ar01ValueOne = [{ ...ar01Base,
  headers: [{ name: "x-a", operation: "set", value: "v;request|x-b|set|w" }] }];
const ar01ValueTwo = [{ ...ar01Base,
  headers: [{ name: "x-a", operation: "set", value: "v" },
            { name: "x-b", operation: "set", value: "w" }] }];
check("AR-01: a header value containing separators does not collide with two headers",
  ar01Storable(ar01ValueOne) && ar01Storable(ar01ValueTwo) &&
  configRevision(ar01ValueOne, true) !== configRevision(ar01ValueTwo, true));
// 2. A profile NAME containing the profile separator swallows a second profile.
const ar01NameOne = [{ id: 1,
  name: "a:a.com:request|x|set|v\u00002:b", domains: ["b.com"],
  headers: [{ name: "y", operation: "set", value: "w" }] }];
const ar01NameTwo = [
  { id: 1, name: "a", domains: ["a.com"],
    headers: [{ name: "x", operation: "set", value: "v" }] },
  { id: 2, name: "b", domains: ["b.com"],
    headers: [{ name: "y", operation: "set", value: "w" }] },
];
check("AR-01: a profile name containing NUL does not collide with two profiles",
  ar01Storable(ar01NameOne) && ar01Storable(ar01NameTwo) &&
  configRevision(ar01NameOne, true) !== configRevision(ar01NameTwo, true));
// 3. A header NAME containing "|" (a legal token character) moves the boundary
//    between name and value. The predicted fixture spelled out two headers,
//    but that needs a ";" in the name, and ";" is NOT a token character, so it
//    was not storable. Caught by validating the fixtures before trusting the
//    red run. This pair is valid and collides on the pre-AR-01 encoding.
const ar01HNameOne = [{ ...ar01Base,
  headers: [{ name: "x|set|v", operation: "set", value: "w" }] }];
const ar01HNameTwo = [{ ...ar01Base,
  headers: [{ name: "x", operation: "set", value: "v|set|w" }] }];
check("AR-01: a header name containing | does not collide with a different name/value split",
  ar01Storable(ar01HNameOne) && ar01Storable(ar01HNameTwo) &&
  configRevision(ar01HNameOne, true) !== configRevision(ar01HNameTwo, true));

// 4. INJECTIVE BECAUSE DECODABLE. If the exact projection can be read back out
//    of the text, no two different projections can share a text. The expected
//    projection is built HERE, independently of status.js, from the fields the
//    revision has always read: side (absent means request), name, operation,
//    value (absent means ""), in storage order. One fixture has headers out of
//    name order, so a sorting encoder cannot pass.
const ar01Projection = (profiles, enabled) => [
  enabled ? "on" : "off",
  profiles.map((p) => [p.id, p.name, p.domains,
    p.headers.map((h) => [h.side ?? "request", h.name, h.operation, h.value ?? ""])]),
];
const ar01Fixtures = [
  [ar01ValueOne, true], [ar01ValueTwo, false], [ar01NameOne, true],
  [ar01NameTwo, true], [ar01HNameOne, false],
  [[{ id: 9, name: "z\"\\,:;|\u0000", domains: ["b.com", "a.com"],
      headers: [{ name: "x-b", operation: "remove", side: "response" },
                { name: "x-a", operation: "set", value: "\"\\,:;|" }] }], true],
];
check("AR-01: configRevisionText decodes back to exactly the projection it encodes",
  typeof statusLib.configRevisionText === "function" &&
  ar01Fixtures.every(([profiles, enabled]) => {
    if (!ar01Storable(profiles)) return false;
    const text = attempt(() => statusLib.configRevisionText(profiles, enabled));
    if (typeof text !== "string") return false;
    const back = attempt(() => JSON.parse(text));
    return back !== THREW &&
      JSON.stringify(back) === JSON.stringify(ar01Projection(profiles, enabled));
  }));

// 5–11. Every field the revision reads still changes it. The encoding changed;
//       these pin that no field fell out of it on the way.
const ar01Ref = [{ id: 1, name: "n", domains: ["a.com", "b.com"],
  headers: [{ name: "x-a", operation: "set", value: "v" },
            { name: "x-b", operation: "remove" }] }];
const ar01With = (edit) => {
  const copy = JSON.parse(JSON.stringify(ar01Ref));
  edit(copy[0]);
  return copy;
};
const ar01Rev = configRevision(ar01Ref, true);
check("AR-01: configRevision changes when the id changes",
  configRevision(ar01With((p) => { p.id = 2; }), true) !== ar01Rev);
check("AR-01: configRevision changes when the name changes",
  configRevision(ar01With((p) => { p.name = "m"; }), true) !== ar01Rev);
check("AR-01: configRevision changes when a domain changes",
  configRevision(ar01With((p) => { p.domains[1] = "c.com"; }), true) !== ar01Rev);
check("AR-01: configRevision changes when a header name changes",
  configRevision(ar01With((p) => { p.headers[0].name = "x-c"; }), true) !== ar01Rev);
check("AR-01: configRevision changes when an operation changes",
  configRevision(ar01With((p) => { p.headers[0].operation = "append"; }), true) !== ar01Rev);
check("AR-01: configRevision changes when a side changes",
  configRevision(ar01With((p) => { p.headers[1].side = "response"; }), true) !== ar01Rev);
check("AR-01: configRevision changes when header order changes",
  configRevision(ar01With((p) => { p.headers.reverse(); }), true) !== ar01Rev);
// 12. The legacy default is part of the projection, not an encoding accident.
check("AR-01: an absent side and side \"request\" give the same revision",
  configRevision(ar01Ref, true) ===
    configRevision(ar01With((p) => { p.headers[0].side = "request"; }), true));

// ------------------------------ truth language (UI-04, AR-17; s5 commit 3)
//
// TWO SURFACES SAID MORE THAN THE PRODUCT KNOWS. The status line counted
// rules Chrome had REGISTERED and called them "applying" (UI-04, ruled
// 2026-09-28, R1-R3). PRIVACY.md said "No data leaves your device" while
// the headers a user configures are sent to the sites they are configured
// for, named one storage area of two, and left the service-worker limits to
// nobody (AR-17). Checks 15–24 of test/PREDICTIONS-2026-10-09-s5.md.
const collapse = (text) => text.replace(/\s+/g, " ");
const privacyText = readFileSync(new URL("../PRIVACY.md", import.meta.url), "utf8");
const smokeText = readFileSync(new URL("./SMOKE.md", import.meta.url), "utf8");
const readmeSection = (heading) =>
  readmeText.match(new RegExp(`^${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"))?.[1] ?? "";
const statusLines = {
  applied: describeSync(at(true, applied())),
  zero: describeSync(at(true, applied({ activeRuleCount: 0 }))),
  partial: describeSync(at(true, applied({ activeRuleCount: 2, skipped: [{ profileId: 9 }] }))),
};
// 15
check("UI-04: none of the applied, zero and partial lines says \"appl\", and each says \"registered\"",
  Object.values(statusLines).every((line) => !/appl/i.test(line) && /registered/.test(line)));
// 16. A template literal, so the scan does not read inside a quoted string.
check("UI-04: the footer's hover text is `Not registered: ${`, and popup.js no longer holds \"Not applied:\"",
  popupJs.includes("`Not registered: ${") && !popupJs.includes("Not applied:"));
// 17. README quotes what the product PRINTS for its own example, derived
// here rather than typed twice.
const twoCollidingRecord = applied({
  activeRuleCount: 0, skipped: [{ profileId: 1 }, { profileId: 2 }],
});
const twoCollidingLine = describeSync(at(true, twoCollidingRecord));
const twoCollidingBadge = computeBadge(at(true, twoCollidingRecord)).text;
check("UI-04: README shows, in backticks, the line the product prints for two colliding profiles and nothing else, that record's badge is `!`, and README no longer says the status line \"still reads \"applying\"\"",
  readmeText.includes(`\`${twoCollidingLine}\``) &&
  twoCollidingBadge === "!" &&
  readmeText.includes(`the badge shows \`${twoCollidingBadge}\``) &&
  !/still reads "applying"/.test(readmeText));
// 18. SMOKE.md quoted a failure string dead since v0.2.0.
const failedLine = describeSync(at(true, failedRec()));
check("UI-04: SMOKE.md, whitespace collapsed, quotes the failed line exactly as describeSync returns it, and holds neither \"not applying — last sync failed\" nor a quoted \"applying\"",
  collapse(smokeText).includes(failedLine) &&
  !collapse(smokeText).includes("not applying — last sync failed") &&
  !smokeText.includes('"applying"'));
// 19. The storage areas come from the code, through commit 2's API scan.
const storageAreasInUse = apisInUse
  .map((name) => name.match(/^chrome\.storage\.(local|session|sync|managed)$/)?.[1])
  .filter(Boolean);
check("AR-17: PRIVACY.md names, as chrome.storage.<area>, every storage area the extension's code uses (at least two found)",
  storageAreasInUse.length >= 2 &&
  storageAreasInUse.every((area) => privacyText.includes(`chrome.storage.${area}`)));
// 20
check("AR-17: PRIVACY.md says request headers you configure are set, appended or removed by Chrome on requests to the domains you configured them for, and does not say no data leaves your device",
  collapse(privacyText).includes(
    "Request headers you configure are set, appended or removed by Chrome on requests to the domains you configured them for") &&
  !/no data leaves your device/i.test(collapse(privacyText)));
// 21. What PRIVACY.md calls "verifiable from the manifest" is verified here.
check("AR-17: the manifest has no webRequest permission and no content_scripts, and PRIVACY.md says both",
  ![...(manifest.permissions || []), ...(manifest.optional_permissions || [])]
    .some((permission) => /^webRequest/.test(permission)) &&
  manifest.content_scripts === undefined &&
  collapse(privacyText).includes("does not request the `webRequest` permission") &&
  collapse(privacyText).includes("has no content scripts"));
// 22. "The extension's own code makes no network requests of any kind."
const networkCalls = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\b|\bimportScripts\b/;
check("AR-17: no extension code calls fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon or importScripts, and popup.html loads nothing from http: or https:",
  extensionJsFiles.length > 0 &&
  extensionJsFiles.every((rel) => !networkCalls.test(
    stripJsComments(readFileSync(new URL(`../extension/${rel}`, import.meta.url), "utf8")))) &&
  !/(src|href)\s*=\s*["']?\s*https?:/i.test(popupHtml));
// 23
const serviceWorkerSection = readmeSection("## Pages with a service worker");
const serviceWorkerRows = [...serviceWorkerSection.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)]
  .map((m) => [m[1], m[2]]);
const serviceWorkerVerdict = (pattern) => serviceWorkerRows.find(([source]) => pattern.test(source))?.[1];
check("AR-17: README's `## Pages with a service worker` lists the cache and the worker's own response under \"do not apply\" and the network under \"apply\", and names FINDING-050",
  serviceWorkerVerdict(/^the network$/) === "apply" &&
  serviceWorkerVerdict(/cache/) === "do not apply" &&
  serviceWorkerVerdict(/builds itself/) === "do not apply" &&
  /FINDING-050/.test(serviceWorkerSection));
// 24. Every badge a user can see, from status.js. BADGE_STALE is left out on
// purpose: the worker paints the badge with the record's own revision, so
// classify() never returns "stale" there (s5 predictions, section 0).
const visibleBadges = [...new Set([BADGE_ON, BADGE_OFF, BADGE_FAILED, BADGE_PARTIAL].map((b) => b.text))];
const whatItDoes = readmeSection("## What it does");
check("AR-17: README's `## What it does` names every badge a user can see: `ON`, `OFF` and `!`",
  visibleBadges.length >= 3 &&
  visibleBadges.every((text) => (/^\w+$/.test(text)
    ? new RegExp(`\\b${text}\\b`).test(whatItDoes)
    : whatItDoes.includes(`\`${text}\``))));

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
  // AR-05: these awaits were only safe BECAUSE the queue swallowed the
  // rejection. Once the caller receives the task's outcome, an uncaught
  // rejection here aborts the run before any FAIL line prints. The second is
  // caught too: a fix that poisons the chain makes q2(false) reject, and that
  // must reach the check below as ran === 1, not crash the suite. Observed on
  // 2026-09-24 against a drop-the-catch mutant, before this was caught.
  await q2(true).catch(() => {});
  await q2(false).catch(() => {});
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
  // Caught for the same AR-05 reason as q2 above.
  await q4().catch(() => {});
  check("omitting onError is safe", true);

  // AR-05: the caller receives the TASK's outcome, not the chain's. enqueue
  // returned the chain's tail, which had already caught the rejection, so a
  // failed task resolved undefined to its caller: failure reported as success.
  // The docstring on createSerialQueue promised the opposite. What each check
  // distinguishes, from mutants run on 2026-09-24:
  //   first   the defect itself, and a fix that rethrows a wrapped error
  //   second  a fix that drops the tail's catch and so poisons the chain
  //   third   pins value delivery with no failure before it, so a fix that
  //           drops values fails second AND third, while a poisoned chain
  //           fails second alone. The pair says which one happened.
  const ar05 = new Error("ar05");
  const q5 = createSerialQueue(async (x) => {
    if (x === "fail") throw ar05;
    return x;
  }, () => {});
  const settle = (p) => p.then((value) => ({ value }), (error) => ({ error }));
  const okRun = await settle(q5("ok"));
  const failRun = await settle(q5("fail"));
  const afterRun = await settle(q5("after"));
  check("AR-05: a failed task rejects to its caller with the task's own error",
    failRun.error === ar05);
  check("AR-05: a call queued after a failure still runs and resolves with its value",
    afterRun.value === "after");
  check("AR-05: a successful task's value reaches its caller",
    okRun.value === "ok");
}

// ------------------------------------ run then always (AR-05 guard)
// The popup's delete, save and import handlers write profiles, render, then
// reconcile grants. Until AR-05 was fixed, the queue swallowed a render
// failure, so reconcileGrants still ran. Fixing the queue alone would let a
// render failure stop the handler before the revoke, leaving a host grant no
// profile uses until the worker's startup sweep: finding 1's symptom, the
// silent one. runThenAlways makes "reconcile runs whatever render did" a
// property of a tested function instead of an accident of a defect.
//
// Ordering is pinned because reconcileGrants must still run AFTER render:
// permissions.request() can destroy the popup's context, so nothing after it
// may be load-bearing.

async function runThenAlwaysChecks() {
  const settle = (p) => p.then((value) => ({ value }), (error) => ({ error }));
  const tick = () => new Promise((res) => setTimeout(res, 1));

  // first rejects, then succeeds: the render-failed-after-delete case.
  const renderErr = new Error("render");
  let firstDone = false;
  let thenRan = false;
  let thenSawFirstDone = null;
  const failFirst = await settle(runThenAlways(
    async () => { await tick(); firstDone = true; throw renderErr; },
    async () => { thenRan = true; thenSawFirstDone = firstDone; },
  ));
  check("runThenAlways: then runs when first rejects", thenRan);
  check("runThenAlways: then starts only after a rejecting first has settled",
    thenSawFirstDone === true);
  check("runThenAlways: first's own error reaches the caller when only first fails",
    failFirst.error === renderErr);

  // Both succeed: the ordinary path must keep its order.
  let okFirstDone = false;
  let okThenSaw = null;
  const bothOk = await settle(runThenAlways(
    async () => { await tick(); okFirstDone = true; },
    async () => { okThenSaw = okFirstDone; },
  ));
  check("runThenAlways: then starts only after a succeeding first has settled",
    okThenSaw === true);
  check("runThenAlways: when both succeed, the caller resolves",
    !("error" in bothOk));

  // first succeeds, then rejects: a failed revoke must not be swallowed.
  const reconcileErr = new Error("reconcile");
  const failThen = await settle(runThenAlways(
    async () => {},
    async () => { throw reconcileErr; },
  ));
  check("runThenAlways: then's own error reaches the caller when only then fails",
    failThen.error === reconcileErr);

  // Both reject: neither failure may be lost. A plain try/finally keeps only
  // the second, which is the wrong fix this check exists to catch.
  const e1 = new Error("render");
  const e2 = new Error("reconcile");
  const failBoth = await settle(runThenAlways(
    async () => { throw e1; },
    async () => { throw e2; },
  ));
  check("runThenAlways: when both fail, the caller gets an AggregateError holding both, first's first",
    failBoth.error instanceof AggregateError &&
    failBoth.error.errors.length === 2 &&
    failBoth.error.errors[0] === e1 &&
    failBoth.error.errors[1] === e2);
}

// ------------------------------------------------ action gate (AR-07a)
// No mutating control in the popup was ever disabled while its work ran, so
// two clicks gave two overlapping read-modify-write transactions in one
// popup. The interim mutation contract in LEDGER.md says one popup UI mutation
// at a time, across all controls, so the popup holds ONE gate shared by Save,
// Delete, Import, the master toggle, the grant chip, Cancel and Revert.
//
// REFUSE, NOT QUEUE, ruled 2026-09-24. A queued second click would still run
// its read-modify-write once the first finished, so a double-click would do
// the action twice; and a queued grant-chip click would reach
// permissions.request() after an await, outside the click's gesture.
//
// The action must start INSIDE run(), with no await before it, for the same
// gesture reason: the grant chip calls permissions.request() as its first act.

async function actionGateChecks() {
  const tick = () => new Promise((res) => setTimeout(res, 1));
  const settle = (p) => p.then((value) => ({ value }), (error) => ({ error }));
  const deferred = () => {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
  };

  // Refusal. The second call is made while the first is still in flight, and
  // is checked only after the first has settled, so a gate that QUEUES the
  // second call fails here as surely as one that lets it through.
  const runRefuse = createActionGate();
  const firstHold = deferred();
  const firstCall = runRefuse(() => firstHold.promise);
  let secondStarted = false;
  const secondCall = settle(runRefuse(async () => {
    secondStarted = true;
    return "second";
  }));
  firstHold.resolve("first");
  await settle(firstCall);
  const second = await secondCall;
  await tick();
  check("action gate: a call made while an action is in flight never starts its action",
    !secondStarted);
  check("action gate: a refused call resolves to ACTION_REFUSED, not success",
    second.value === ACTION_REFUSED);

  // Synchronous start: checked before anything is awaited.
  const runSync = createActionGate();
  let startedSync = false;
  const syncCall = runSync(async () => { startedSync = true; });
  check("action gate: the action starts inside run(), with no await before it",
    startedSync);
  await syncCall;

  // Reopening, on both outcomes, measured by a call made the moment the
  // caller resumes. A gate that reopens later than that refuses this call.
  const runReopen = createActionGate();
  await runReopen(async () => "ok");
  const afterOk = await settle(runReopen(async () => "next"));
  check("action gate: the gate is open again when the caller resumes after a success",
    afterOk.value === "next");
  await settle(runReopen(async () => { throw new Error("save failed"); }));
  const afterFail = await settle(runReopen(async () => "next"));
  check("action gate: the gate is open again when the caller resumes after a failure",
    afterFail.value === "next");

  // Outcome: AR-05's lesson, carried forward.
  const runOutcome = createActionGate();
  const okOutcome = await settle(runOutcome(async () => "value"));
  check("action gate: the action's own value reaches the caller",
    okOutcome.value === "value");
  const gateErr = new Error("action");
  const errOutcome = await settle(runOutcome(async () => { throw gateErr; }));
  check("action gate: the action's own error reaches the caller",
    errOutcome.error === gateErr);

  // Busy signal: this is what the popup uses to disable and re-enable the
  // controls. "idle" must come after the action ENDS, and only once.
  const log = [];
  const runSignal = createActionGate((busy) => log.push(busy ? "busy" : "idle"));
  await runSignal(async () => { log.push("start"); await tick(); log.push("end"); });
  check("action gate: onBusyChange(true) fires before the action starts",
    log.indexOf("busy") === 0 && log.indexOf("start") === 1);
  check("action gate: onBusyChange(false) fires once, after a successful action settles",
    log.filter((e) => e === "idle").length === 1 &&
    log.indexOf("idle") === log.length - 1 &&
    log.indexOf("idle") > log.indexOf("end"));
  log.length = 0;
  await settle(runSignal(async () => {
    log.push("start");
    await tick();
    log.push("end");
    throw new Error("delete failed");
  }));
  check("action gate: onBusyChange(false) fires once, after a failed action settles",
    log.filter((e) => e === "idle").length === 1 &&
    log.indexOf("idle") === log.length - 1 &&
    log.indexOf("idle") > log.indexOf("end"));

  // A refused call must not touch the signal. Signalling idle on refusal
  // would re-enable every control while the first action is still running.
  //
  // The refused call is NOT awaited while the hold is in place. Awaiting it
  // deadlocked the suite under a queueing gate on 2026-09-24: the queued call
  // waited for the held action, the held action waited for a resolve that came
  // after the await, and Node exited 13 with no summary line. Ticks instead.
  const signals = [];
  const runQuiet = createActionGate((busy) => signals.push(busy));
  const quietHold = deferred();
  const held = runQuiet(() => quietHold.promise);
  await tick();
  const signalsBefore = signals.join(",");
  const refusedCall = settle(runQuiet(async () => {}));
  await tick();
  const signalsDuring = signals.join(",");
  quietHold.resolve();
  await settle(held);
  await refusedCall;
  check("action gate: a refused call leaves the busy signal alone",
    signalsBefore === signalsDuring);
}

// --------------------------------------------- debounce (finding 8)
// Rate control for the popup's storage listener. renderList costs one
// permissions.contains() per chip, so coalescing a burst is load-bearing.

// ---- AR-01b. Checks 13–42 of test/PREDICTIONS-2026-09-27-s2.md, in order.
//
// A per-profile digest binds an edit to the version of the profile the user
// was shown, so a save can tell "still the profile I opened" from "changed or
// deleted since". configRevision cannot do this: it is a 32-bit status hint
// over the WHOLE configuration.
//
// NO CHECK HERE MAY PASS ON TWO FAILURES. Every comparison first requires a
// real "sha256:profile-v1:" digest or a real result object. Without that,
// THREW === THREW would pass every equivalence check, and "rejects" would pass
// vacuously, while the functions did not exist at all.
async function profileDigestChecks() {
  const lib = canonicalLib;
  const hasDigest = typeof lib.profileDigest === "function";
  const hasCheck = typeof lib.checkEditBase === "function";
  const digestOf = async (profile) => {
    if (!hasDigest) return THREW;
    try { return await lib.profileDigest(profile); } catch { return THREW; }
  };
  const checkOf = async (profiles, id, base) => {
    if (!hasCheck) return THREW;
    try { return await lib.checkEditBase(profiles, id, base); } catch { return THREW; }
  };
  const isDigest = (d) =>
    typeof d === "string" && /^sha256:profile-v1:[0-9a-f]{64}$/.test(d);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // The known answer from §0 of the predictions file, computed from the
  // definition with pre-s2 code and cross-checked in Python before any of
  // this existed. It is the frozen meaning of "profile-v1".
  const kat = { id: 7, name: "Staging API", domains: ["api.example.com"],
    headers: [{ name: "X-Env", operation: "set", value: "staging" },
              { name: "Server", operation: "remove", side: "response" }] };
  const ref = { id: 3, name: "r", domains: ["a.com", "b.com"],
    headers: [{ name: "x-a", operation: "set", value: "v" },
              { name: "x-b", operation: "remove" }] };
  const variant = (edit) => { const c = clone(ref); edit(c); return c; };

  // 13–15. Shape, an independent implementation, and the pinned answer.
  const dKat = await digestOf(kat);
  check("AR-01b: profileDigest returns sha256:profile-v1: and 64 lowercase hex",
    isDigest(dKat));
  const dRef = await digestOf(ref);
  const independent = "sha256:profile-v1:" + createHash("sha256")
    .update(stableStringify(canonicalizeProfiles([ref])[0]), "utf8").digest("hex");
  check("AR-01b: profileDigest equals node:crypto SHA-256 of the canonical text",
    isDigest(dRef) && dRef === independent);
  check("AR-01b: profileDigest matches the pinned profile-v1 known answer",
    dKat === "sha256:profile-v1:" +
      "01dda2ccd1c1d721b1d2efdd37e7d5996906e66b864a9a6cbf30cfe9fbfc82b9");

  // 16–17. Lossless differences are the same profile.
  const dCased = await digestOf(variant((p) => { p.domains = ["B.com", "a.com", "a.com"]; }));
  check("AR-01b: domain case, order and duplicates give the same digest",
    isDigest(dRef) && dCased === dRef);
  const dExplicit = await digestOf(variant((p) => { p.headers[0].side = "request"; }));
  check("AR-01b: an explicit request side gives the same digest as an absent one",
    isDigest(dRef) && dExplicit === dRef);

  // 18–25. Every meaningful field changes the digest.
  const differs = async (label, edit) => {
    const d = await digestOf(variant(edit));
    check(`AR-01b: the digest changes when ${label} changes`,
      isDigest(dRef) && isDigest(d) && d !== dRef);
  };
  await differs("the id", (p) => { p.id = 4; });
  await differs("the name", (p) => { p.name = "s"; });
  await differs("a domain", (p) => { p.domains[1] = "c.com"; });
  await differs("a header name", (p) => { p.headers[0].name = "x-c"; });
  await differs("an operation", (p) => { p.headers[0] = { name: "x-a", operation: "remove" }; });
  await differs("a value", (p) => { p.headers[0].value = "w"; });
  await differs("a side", (p) => { p.headers[1].side = "response"; });
  await differs("header order", (p) => { p.headers.reverse(); });

  // 26–27. Invalid input rejects; valid input is left alone.
  check("AR-01b: profileDigest rejects an invalid profile",
    hasDigest && (await digestOf(variant((p) => { p.id = 0; }))) === THREW);
  const untouched = variant((p) => { p.domains = ["B.com", "a.com"]; });
  const before = JSON.stringify(untouched);
  const dUntouched = await digestOf(untouched);
  check("AR-01b: profileDigest does not mutate its input",
    isDigest(dUntouched) && JSON.stringify(untouched) === before);

  // 28–35. checkEditBase. The TARGET IS SECOND in every fixture, so an
  // implementation that compares profiles[0] fails rather than passing by luck.
  const other = { id: 1, name: "o", domains: ["o.com"],
    headers: [{ name: "x-o", operation: "set", value: "o" }] };
  const target = clone(ref);
  const base = await digestOf(target);
  const okResult = (r) => r !== THREW && r !== null && typeof r === "object" &&
    r.ok === true;
  const refused = (r, reason) => r !== THREW && r !== null &&
    typeof r === "object" && r.ok === false && r.reason === reason;
  check("AR-01b: an unchanged target passes the edit base check",
    isDigest(base) && okResult(await checkOf([clone(other), clone(target)], 3, base)));
  check("AR-01b: a changed target is refused as changed",
    isDigest(base) && refused(await checkOf(
      [clone(other), variant((p) => { p.headers[0].value = "w"; })], 3, base), "changed"));
  check("AR-01b: a deleted target is refused as vanished",
    isDigest(base) && refused(await checkOf([clone(other)], 3, base), "vanished"));
  check("AR-01b: a change to a different profile does not refuse the edit",
    isDigest(base) && okResult(await checkOf(
      [{ ...clone(other), name: "o2" }, clone(target)], 3, base)));
  check("AR-01b: a change in storage order does not refuse the edit",
    isDigest(base) && okResult(await checkOf([clone(target), clone(other)], 3, base)));
  check("AR-01b: a lossless difference in the stored target does not refuse the edit",
    isDigest(base) && okResult(await checkOf(
      [clone(other), variant((p) => { p.domains = ["B.com", "A.com"]; })], 3, base)));
  check("AR-01b: an edit with no base digest is refused as changed",
    refused(await checkOf([clone(other), clone(target)], 3, null), "changed"));
  check("AR-01b: an invalid stored target is refused as changed, not thrown",
    isDigest(base) && refused(await checkOf(
      [clone(other), variant((p) => { p.headers = []; })], 3, base), "changed"));

  // 36–37. The refusal says what happened and where the way back is.
  const describe = (reason) => typeof lib.describeEditRefusal === "function"
    ? attempt(() => lib.describeEditRefusal(reason)) : THREW;
  const changedMsg = describe("changed");
  check("AR-01b: the changed refusal says Not saved and names Revert to saved",
    typeof changedMsg === "string" && changedMsg.startsWith("Not saved:") &&
    changedMsg.includes("Revert to saved"));
  const vanishedMsg = describe("vanished");
  check("AR-01b: the vanished refusal says Not saved and that the profile was deleted",
    typeof vanishedMsg === "string" && vanishedMsg.startsWith("Not saved:") &&
    vanishedMsg.includes("deleted"));

  // 38–42. The wiring. popup.js calls chrome.* at module scope and cannot be
  // imported, so these are source scans on the comment-stripped text, the
  // same method as the HW-V7-04 worker scans. Each function body is cut at its
  // closing brace in column 0.
  const bodyOf = (name) => {
    const start = popupJs.indexOf(`async function ${name}(`);
    if (start < 0) return "";
    const end = popupJs.indexOf("\n}\n", start);
    return end < 0 ? "" : popupJs.slice(start, end + 2);
  };
  const canonicalImports = [...popupJs.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*"\.\.\/lib\/canonical\.js"/g)]
    .map((m) => m[1]).join(",");
  check("AR-01b: popup.js imports profileDigest, checkEditBase and describeEditRefusal",
    ["profileDigest", "checkEditBase", "describeEditRefusal"].every((n) =>
      new RegExp(`\\b${n}\\b`).test(canonicalImports)));
  const capture = /editingBaseDigest = profile \? await profileDigest\(profile\) : null;/;
  const openBody = bodyOf("openEditor");
  // CHANGED IN s3 (AR-02): openEditor takes its base from baseForEditor, which
  // returns a restored draft's own base and otherwise the profile's digest.
  // Still required before the form is shown.
  const openCapture = openBody.search(
    /editingBaseDigest = await baseForEditor\(restored, profile, profileDigest\);/);
  check("AR-01b: openEditor captures the base digest before the form is shown",
    openCapture >= 0 && openCapture < openBody.indexOf('showView("edit")'));
  const revertBody = bodyOf("revertToSaved");
  const revertCapture = revertBody.search(capture);
  check("AR-01b: revertToSaved recaptures the base from the profile it re-read",
    revertCapture >= 0 &&
    revertBody.indexOf("const profile = profiles.find(") >= 0 &&
    revertBody.indexOf("const profile = profiles.find(") < revertCapture);
  const saveBody = bodyOf("saveProfile");
  const baseCall = saveBody.search(
    /const base = await checkEditBase\(previousProfiles, editingProfileId, editingBaseDigest\);/);
  const refusal = (saveBody.match(/if \(!base\.ok\) \{[^{}]*\}/) || [""])[0];
  check("AR-01b: saveProfile checks the edit base before any write, and a refusal returns",
    baseCall >= 0 &&
    baseCall < saveBody.indexOf("nextProfiles = previousProfiles.map(") &&
    baseCall < saveBody.indexOf("await setProfiles(nextProfiles)") &&
    refusal.includes("showFormError(describeEditRefusal(base.reason));") &&
    /return;\s*\}$/.test(refusal));
  check("AR-01b: a changed refusal shows the notice that holds Revert to saved",
    refusal.includes('if (base.reason === "changed") setRestoredNotice(true);'));
  // 43. NOT PREDICTED: added during the build. Once a refusal routinely sends
  // the user to Revert to saved, a revert that leaves the refusal on screen is
  // a message telling them to do what they just did.
  check("AR-01b: revertToSaved clears the form error",
    /\n\s*hideFormError\(\);\n/.test(revertBody));
}

// ---- AR-02 (s3). Checks 1–50 of test/PREDICTIONS-2026-09-29-s3.md, in order.
//
// A draft carries the base it was written against (AR-01b's draft half), is
// used only by the editor its key and its own id agree on, and every draft
// read and write goes through one queue. The pure rules are exercised
// directly, the queue included, against a fake storage that interleaves
// whatever is not serialized. popup.js is scanned, as for AR-01b.
//
// NO CHECK HERE MAY PASS ON TWO FAILURES. The new symbols come through the
// draftLib and rulesLib namespaces, so a missing export reads as FAIL lines,
// and every negative check first requires its positive control.
async function ar02Checks() {
  const d = draftLib;
  const has = (name) => typeof d[name] === "function";
  const call = async (fn) => {
    try { return await fn(); } catch { return THREW; }
  };
  // Calls a method NOW, not a microtask later: the ordering checks below
  // depend on the order in which calls are issued.
  const invoke = (target, method, ...args) => {
    try {
      return target !== null && typeof target === "object" &&
        typeof target[method] === "function"
        ? Promise.resolve(target[method](...args))
        : Promise.reject(new Error(`no ${method}`));
    } catch (err) {
      return Promise.reject(err);
    }
  };
  const settle = (p) => Promise.resolve(p).then(() => "fulfilled", () => "rejected");
  const isObj = (v) => v !== null && typeof v === "object";
  const keysOf = (v) => (isObj(v) ? Object.keys(v).sort().join(",") : "");
  const B = (c) => "sha256:profile-v1:" + c.repeat(64);
  const row = (side, operation) => ({ name: "X-A", side, operation, value: "1" });
  const draftOf = (id, base, rows = [row("request", "set")]) =>
    formToDraft({ editingProfileId: id, baseDigest: base, name: "p", domains: "a.com", rows });
  const valid = (x) => attempt(() => isValidDraft(x)) === true;
  const refused = (x) => attempt(() => isValidDraft(x)) === false;

  const d3 = draftOf(3, B("3"));
  const d5 = draftOf(5, B("5"));
  const dNew = formToDraft({ editingProfileId: null, name: "", domains: "",
    rows: [row("request", "set")] });

  // 1–9. Format and validity.
  check("AR-02: DRAFT_VERSION is 2", DRAFT_VERSION === 2);
  const f3 = attempt(() => draftToForm(d3));
  check("AR-02: a profile draft carries its base through draftToForm",
    isObj(f3) && f3.baseDigest === B("3"));
  check("AR-02: a new-profile draft records a null base and is valid",
    dNew.baseDigest === null && valid(dNew));
  check("AR-02: a profile draft with no base is refused",
    valid(d3) && refused({ ...d3, baseDigest: null }));
  check("AR-02: a new-profile draft carrying a base is refused",
    valid(dNew) && refused({ ...dNew, baseDigest: B("n") }));
  check("AR-02: a version 1 draft is refused",
    valid(d3) && refused({ ...d3, version: 1 }));
  check("AR-02: a row whose side is not request or response is refused",
    valid(d3) && refused({ ...d3, rows: [row("sideways", "set")] }));
  check("AR-02: a row whose operation is not set, append or remove is refused",
    valid(d3) && refused({ ...d3, rows: [row("request", "delete")] }));
  check("AR-02: every side and operation the form offers is accepted",
    valid(draftOf(3, B("3"), ["request", "response"].flatMap((side) =>
      ["set", "append", "remove"].map((operation) => row(side, operation))))));

  // 10–14. Identity: the key is a slot, and the draft must name the profile.
  check("AR-02: draftKeyFor keys a new profile \"new\" and a profile by its id",
    has("draftKeyFor") && attempt(() => d.draftKeyFor(null)) === "new" &&
    attempt(() => d.draftKeyFor(undefined)) === "new" &&
    attempt(() => d.draftKeyFor(3)) === "3");
  const findDraft = (map, id) => (has("draftFor") ? attempt(() => d.draftFor(map, id)) : THREW);
  check("AR-02: draftFor finds a profile's draft, and nothing for a profile without one",
    findDraft({ 3: d3 }, 3) === d3 && findDraft({ 3: d3 }, 4) === null);
  check("AR-02: draftFor refuses a draft that names a different profile than its key",
    findDraft({ 5: d5 }, 5) === d5 && findDraft({ 3: d5 }, 3) === null);
  check("AR-02: draftFor refuses an invalid draft under the right key",
    findDraft({ 3: d3 }, 3) === d3 && findDraft({ 3: { ...d3, version: 1 } }, 3) === null);
  check("AR-02: draftFor finds the new-profile draft",
    findDraft({ new: dNew }, null) === dNew);

  // 15–18. Binding. Real profile-v1 digests from here on.
  const digest = canonicalLib.profileDigest;
  const isDigest = (v) => typeof v === "string" && /^sha256:profile-v1:[0-9a-f]{64}$/.test(v);
  const old2 = { id: 2, name: "staging", domains: ["a.com"],
    headers: [{ name: "X-Env", operation: "set", value: "staging" }] };
  const new2 = { id: 2, name: "prod", domains: ["b.com"],
    headers: [{ name: "X-Env", operation: "set", value: "prod" }] };
  const dOld2 = await call(() => digest(old2));
  const dNew2 = await call(() => digest(new2));
  const stale = formToDraft({ editingProfileId: 2, baseDigest: dOld2, name: "staging",
    domains: "a.com",
    rows: [{ name: "X-Env", side: "request", operation: "set", value: "staging-EDITED" }] });
  const baseFor = (restored, profile) => (has("baseForEditor")
    ? call(() => d.baseForEditor(restored, profile, digest)) : THREW);
  const staleBase = await baseFor(attempt(() => draftToForm(stale)), new2);
  check("AR-02: a restored draft binds to its own base, not to the profile shown",
    isDigest(dOld2) && isDigest(dNew2) && dOld2 !== dNew2 && staleBase === dOld2);
  const staleCheck = await call(() => canonicalLib.checkEditBase([new2], 2, staleBase));
  check("AR-02: a stale restored draft is refused at Save as changed",
    isDigest(staleBase) && isObj(staleCheck) && staleCheck.ok === false &&
    staleCheck.reason === "changed");
  check("AR-02: an editor opened without a draft binds to the profile shown",
    isDigest(dNew2) && (await baseFor(null, new2)) === dNew2);
  check("AR-02: a new profile's editor has no base, with or without a draft",
    (await baseFor(null, null)) === null &&
    (await baseFor(attempt(() => draftToForm(dNew)), null)) === null);

  // 19–25. Rebase on import. Every fixture profile is storable (§0).
  const P2 = { id: 2, name: "two", domains: ["two.com"],
    headers: [{ name: "X-Two", operation: "set", value: "2" }] };
  const P4old = { id: 4, name: "four", domains: ["four.com"],
    headers: [{ name: "X-Four", operation: "set", value: "old" }] };
  const P4new = { id: 4, name: "four", domains: ["four.com"],
    headers: [{ name: "X-Four", operation: "set", value: "new" }] };
  const P6 = { id: 6, name: "six", domains: ["six.com"],
    headers: [{ name: "X-Six", operation: "remove" }] };
  const P7 = { id: 7, name: "seven", domains: ["seven.com"],
    headers: [{ name: "X-Seven", side: "response", operation: "set", value: "7" }] };
  const [dP2, dP4old, dP4new, dP6, dP7] = await Promise.all(
    [P2, P4old, P4new, P6, P7].map((p) => call(() => digest(p))));
  const drafts = {
    2: draftOf(2, dP2),
    4: draftOf(4, dP4old),
    6: draftOf(6, dP6),
    new: dNew,
    7: draftOf(7, dP7, [row("response", "delete")]),
    8: draftOf(2, dP2),
  };
  const before = JSON.stringify(drafts);
  const retain = (map, profiles, digestOf = digest) => (has("retainDraftsFor")
    ? call(() => d.retainDraftsFor(map, profiles, digestOf)) : THREW);
  const kept = await retain(drafts, [P2, P4new, P7]);
  check("AR-02: rebase keeps a draft whose profile the import holds unchanged",
    isObj(kept) && kept["2"] === drafts["2"]);
  check("AR-02: rebase drops a draft whose profile the import changed",
    isObj(kept) && "2" in kept && !("4" in kept));
  check("AR-02: rebase drops a draft whose profile the import lacks",
    isObj(kept) && "2" in kept && !("6" in kept));
  check("AR-02: rebase keeps the new-profile draft",
    isObj(kept) && kept.new === dNew);
  check("AR-02: rebase drops an invalid draft and one stored under another profile's key",
    isObj(kept) && "2" in kept && !("7" in kept) && !("8" in kept));
  const failing = (p) => (p.id === 2 ? Promise.reject(new Error("no digest")) : digest(p));
  const kept2 = await retain({ 2: draftOf(2, dP2), 4: draftOf(4, dP4new) }, [P2, P4new], failing);
  check("AR-02: rebase drops a draft whose profile cannot be digested, and does not throw",
    isObj(kept2) && "4" in kept2 && !("2" in kept2));
  check("AR-02: rebase does not mutate the drafts it is given",
    isObj(kept) && JSON.stringify(drafts) === before);

  // 26–32. The store. The fake takes its snapshot when a read is CALLED and
  // answers after that call's delay, so a store that does not serialize its
  // read-modify-writes interleaves them, as chrome.storage would allow.
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const fakeStorage = ({ initial, readDelays = [], failRead = false, failWrite = false } = {}) => {
    const fake = { data: clone(initial), reads: 0, writes: 0 };
    fake.read = async () => {
      const i = fake.reads++;
      const snapshot = clone(fake.data);
      await sleep(readDelays[i] ?? 0);
      if (failRead && i === 0) throw new Error("read failed");
      return snapshot;
    };
    fake.write = async (value) => {
      const i = fake.writes++;
      await sleep(0);
      if (failWrite && i === 0) throw new Error("write failed");
      fake.data = clone(value);
    };
    return fake;
  };
  const storeOn = (fake) => (has("createDraftStore")
    ? attempt(() => d.createDraftStore({ read: fake.read, write: fake.write })) : THREW);
  {
    const fake = fakeStorage({ readDelays: [10, 0] });
    const store = storeOn(fake);
    await Promise.all([settle(invoke(store, "put", "3", d3)),
      settle(invoke(store, "put", "new", dNew))]);
    check("AR-02: two overlapping puts for different keys both land",
      isObj(store) && keysOf(fake.data) === "3,new");
  }
  {
    const fake = fakeStorage({ readDelays: [10, 0] });
    const store = storeOn(fake);
    await Promise.all([settle(invoke(store, "put", "3", d3)), settle(invoke(store, "drop", "3"))]);
    check("AR-02: a put issued before a drop lands before it",
      isObj(store) && fake.writes > 0 && isObj(fake.data) && !("3" in fake.data));
  }
  {
    const fake = fakeStorage({ readDelays: [10, 0] });
    const store = storeOn(fake);
    const [, seen] = await Promise.all([settle(invoke(store, "put", "3", d3)),
      call(() => invoke(store, "read"))]);
    check("AR-02: a read issued after a put sees it",
      isObj(store) && isObj(seen) && "3" in seen);
  }
  {
    const fake = fakeStorage({ failWrite: true });
    const store = storeOn(fake);
    const first = await settle(invoke(store, "put", "3", d3));
    const second = await settle(invoke(store, "put", "new", dNew));
    check("AR-02: a failed write rejects its own call and does not block the next",
      isObj(store) && first === "rejected" && second === "fulfilled" &&
      keysOf(fake.data) === "new");
  }
  {
    const fake = fakeStorage({ initial: { 2: draftOf(2, dP2) }, failRead: true });
    const store = storeOn(fake);
    const result = await settle(invoke(store, "put", "3", d3));
    check("AR-02: a failed read writes nothing, so other drafts survive",
      isObj(store) && result === "rejected" && fake.writes === 0 && keysOf(fake.data) === "2");
  }
  {
    const fake = fakeStorage({ initial: { 2: draftOf(2, dP2) } });
    const store = storeOn(fake);
    const result = await settle(invoke(store, "drop", "3"));
    check("AR-02: dropping an absent key writes nothing",
      isObj(store) && result === "fulfilled" && fake.writes === 0);
  }
  {
    const fake = fakeStorage({ initial: { 2: draftOf(2, dP2), 4: draftOf(4, dP4old) } });
    const store = storeOn(fake);
    const removed = await call(() => invoke(store, "rebase", [P2, P4new], digest));
    check("AR-02: store rebase removes the dropped drafts from storage and names them",
      Array.isArray(removed) && removed.join(",") === "4" && keysOf(fake.data) === "2");
  }

  // 33–36. The session: a write after it ends is not made, and the end is
  // ordered after every write issued before it.
  const sessionOn = (store) => (has("createDraftSession") && isObj(store)
    ? attempt(() => d.createDraftSession(store)) : THREW);
  {
    const fake = fakeStorage();
    const session = sessionOn(storeOn(fake));
    attempt(() => session.open(3));
    const wrote = await call(() => invoke(session, "put", d3));
    check("AR-02: an open session writes under its profile's key",
      isObj(session) && wrote === true && keysOf(fake.data) === "3");
  }
  {
    const fake = fakeStorage();
    const session = sessionOn(storeOn(fake));
    attempt(() => session.open(null));
    await settle(invoke(session, "put", dNew));
    check("AR-02: a new profile's session writes under \"new\"",
      isObj(session) && keysOf(fake.data) === "new");
  }
  {
    const fake = fakeStorage();
    const session = sessionOn(storeOn(fake));
    attempt(() => session.open(3));
    const ended = settle(invoke(session, "end"));
    const wrote = call(() => invoke(session, "put", d3));
    const [, result] = await Promise.all([ended, wrote]);
    check("AR-02: a write after the session ends is not made",
      isObj(session) && result === false && !(isObj(fake.data) && "3" in fake.data));
  }
  {
    const fake = fakeStorage();
    const session = sessionOn(storeOn(fake));
    attempt(() => session.open(3));
    const wrote = settle(invoke(session, "put", d3));
    const ended = settle(invoke(session, "end"));
    await Promise.all([wrote, ended]);
    check("AR-02: a write issued before the session ends lands, then its drop removes it",
      isObj(session) && fake.writes === 2 && isObj(fake.data) && !("3" in fake.data));
  }

  // 37–38. One definition of the sets.
  const sides = rulesLib.VALID_SIDES;
  const operations = rulesLib.VALID_OPERATIONS;
  check("AR-02: rules.js exports the side and operation sets",
    sides instanceof Set && [...sides].sort().join(",") === "request,response" &&
    operations instanceof Set && [...operations].sort().join(",") === "append,remove,set");
  const draftJs = stripJsComments(
    readFileSync(new URL("../extension/lib/draft.js", import.meta.url), "utf8"));
  const fromRules = (name) => new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*"\\./rules\\.js"`).test(draftJs);
  check("AR-02: draft.js takes both sets from rules.js and declares neither",
    fromRules("VALID_SIDES") && fromRules("VALID_OPERATIONS") &&
    !/\b(?:const|let|var)\s+VALID_(?:SIDES|OPERATIONS)\b/.test(draftJs));

  // 39–50. The wiring, on comment-stripped popup.js. No pattern here reads
  // inside a double-quoted string, so mutate-scans.py's string-blanking row
  // does not move. Each function body is cut at its closing brace in column 0.
  const bodyOf = (signature) => {
    const start = popupJs.indexOf(signature);
    if (start < 0) return "";
    const end = popupJs.indexOf("\n}\n", start);
    return end < 0 ? "" : popupJs.slice(start, end + 2);
  };
  const draftImports = [...popupJs.matchAll(/import\s*\{([^}]*)\}/g)]
    .map((m) => m[1]).find((names) => /\bformToDraft\b/.test(names)) || "";
  check("AR-02: popup.js imports draftKeyFor, draftFor, baseForEditor, createDraftStore and createDraftSession",
    ["draftKeyFor", "draftFor", "baseForEditor", "createDraftStore", "createDraftSession"]
      .every((name) => new RegExp(`\\b${name}\\b`).test(draftImports)));
  const openBody = bodyOf("async function openEditor(");
  check("AR-02: openEditor restores only through draftFor",
    openBody.includes("const restored = draftToForm(draftFor(drafts, editingProfileId));"));
  const opened = openBody.indexOf("draftSession.open(editingProfileId);");
  check("AR-02: openEditor opens the draft session before the form is shown",
    opened >= 0 && opened < openBody.indexOf("showView("));
  check("AR-02: persistDraft writes through the session, with the editor's base",
    bodyOf("async function persistDraft(").includes(
      "await draftSession.put(formToDraft({ ...readFormRaw(), baseDigest: editingBaseDigest }));"));
  const saveBody = bodyOf("async function saveProfile(");
  const saveWrite = saveBody.indexOf("await setProfiles(nextProfiles)");
  const saveEnd = saveBody.indexOf("await draftSession.end();");
  check("AR-02: saveProfile ends the session after the profile write, before leaving the editor",
    saveWrite >= 0 && saveWrite < saveEnd && saveEnd < saveBody.indexOf("showView("));
  check("AR-02: Cancel ends the draft session",
    /await draftSession\.end\(\);\s*setRestoredNotice\(false\);\s*showView\(/.test(popupJs));
  const revertBody = bodyOf("async function revertToSaved(");
  const revertEnd = revertBody.indexOf("await draftSession.end();");
  const revertFind = revertBody.indexOf("const profile = profiles.find(");
  const revertCapture = revertBody.search(
    /editingBaseDigest = profile \? await profileDigest\(profile\) : null;/);
  const revertOpen = revertBody.indexOf("draftSession.open(editingProfileId);");
  check("AR-02: revertToSaved ends the session before re-reading, and reopens it on the new base",
    revertEnd >= 0 && revertEnd < revertFind && revertFind < revertCapture &&
    revertCapture < revertOpen);
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The statement alone in a try whose catch only logs; it comes after the
  // profile write and before reconciliation; and it is the only such call.
  const guardedCall = (body, statement, method) => {
    const block = body.match(new RegExp("try \\{\\s*" + escapeRe(statement) +
      "\\s*\\} catch \\(err\\) \\{\\s*console\\.error\\([^;]*\\);\\s*\\}"));
    const write = body.indexOf("await setProfiles(nextProfiles);");
    const calls = body.split(`draftStore.${method}(`).length - 1;
    return block !== null && calls === 1 && write >= 0 && write < block.index &&
      block.index < body.indexOf("await runThenAlways(");
  };
  check("AR-02: deleteProfile purges the deleted profile's draft after the write, and a failed purge is logged, not thrown",
    guardedCall(bodyOf("async function deleteProfile("),
      "await draftStore.drop(draftKeyFor(id));", "drop"));
  check("AR-02: applyImport re-checks drafts against the import after the write, and a failed re-check is logged, not thrown",
    guardedCall(bodyOf("async function applyImport("),
      "await draftStore.rebase(nextProfiles, profileDigest);", "rebase"));
  const cardBody = (popupJs.match(/function renderProfileCard\([^)]*\) \{[\s\S]*?\n\}\n/) || [""])[0];
  check("AR-02: the card finds its draft through draftFor",
    cardBody.includes("const draft = draftFor(drafts, profile.id);"));
  check("AR-02: getDrafts reads through the draft store",
    bodyOf("async function getDrafts(").includes("return await draftStore.read();"));
  check("AR-02: the session and every other draft call share one store",
    (popupJs.match(/\bcreateDraftStore\(/g) || []).length === 1 &&
    popupJs.includes("const draftSession = createDraftSession(draftStore);"));
}

// ---- DR-02 (s5 commit 5). Checks 29–49 of test/PREDICTIONS-2026-10-09-s5.md,
// in order.
//
// What HeaderWright stores is bounded by budgets of its own, counted as Chrome
// counts (ruled S5-D2): 4 MiB of hw:profiles, and 128 KiB of the drafts map's
// JSON. budget.js comes in through a dynamic import caught to {}, so a missing
// file or export reads as FAIL lines, and every check first requires what it
// reads. The store checks use a fake drafts budget of 600 characters of JSON,
// with fixtures sized so that the budget decides each outcome, and the sizes
// are checked too. The wiring is read from comment-stripped popup.js, with
// whitespace collapsed; no pattern here reads inside a double-quoted string.
async function dr02Checks() {
  const b = budgetLib;
  const d = draftLib;
  const fn = (name) => typeof b[name] === "function";
  const KEY = "hw:profiles";
  const isObj = (v) => v !== null && typeof v === "object";
  const call = async (f) => {
    try { return await f(); } catch { return THREW; }
  };

  // 29
  check("DR-02: the budgets are 4,194,304 bytes of profiles and 131,072 bytes of drafts",
    b.PROFILES_BUDGET_BYTES === 4194304 && b.DRAFTS_BUDGET_BYTES === 131072);

  // 30. The fixtures of section 0, as frozen, each with the count Chromium 141's
  // getBytesInUse returned for it under the key "hw:profiles".
  const small = (id = 1) => ({ id, name: "p", domains: ["a.com"],
    headers: [{ name: "X-A", operation: "set", value: "1" }] });
  const typical = (id = 1) => ({ id, name: `Staging API ${id}`,
    domains: ["api.example.com", "example.com"],
    headers: [
      { name: "Authorization", operation: "set", value: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" },
      { name: "X-Forwarded-For", operation: "append", value: "203.0.113.7" },
      { name: "Cookie", operation: "append", value: "session=8f14e45fceea167a5a36dedd4bea2543; theme=dark" },
      { name: "X-Debug", operation: "remove", value: "" },
      { name: "Access-Control-Allow-Origin", operation: "set", value: "https://app.example.com", side: "response" },
      { name: "Content-Security-Policy", operation: "set", value: "default-src 'self'; img-src 'self' data: https://cdn.example.com; script-src 'self' 'unsafe-inline'", side: "response" },
      { name: "Server", operation: "remove", value: "", side: "response" },
    ] });
  const one = (id, name, header, value = "v", operation = "set") =>
    ({ id, name, domains: ["a.com"], headers: [{ name: header, operation, value }] });
  const KATS = [                                      // key "hw:profiles"
    ["the empty set", [], 13],
    ["one small profile", [small()], 109],
    ["one typical profile", [typical()], 897],
    ["two profiles", [small(1), typical(2)], 994],
    ["angle brackets, quotes and backslashes",
      [one(4, "<b>x</b> \"q\" \\ & > '", "X-T", "<script>alert(\"x\")</script> \\\\ </b>")], 194],
    ["non-ASCII and astral characters",
      [one(5, "café 中文 😀", "X-U", "naïve ☃ 👍🏽")], 143],
    ["U+2028 and U+2029", [one(6, "line sep para", "X-S")], 131],
    ["control characters in a name",
      [one(7, "nul\u0000 soh\u0001 bs\b ff\f nl\n cr\r tab\t esc\u001b del\u007f", "X-C")], 168],
    ["lone surrogates in a name", [one(8, "lone \ud83d high and \ude00 low", "X-L")], 133],
    ["noncharacters in a name", [one(9, "bmp ￿ ﷐ astral 🿿", "X-N")], 131],
    ["the largest id and a remove", [one(2147483647, "max", "X-M", "", "remove")], 122],
    ["one hundred typical profiles",
      Array.from({ length: 100 }, (_, i) => typical(i + 1)), 88696],
  ];
  const stored = (value) => (fn("storedBytes") ? attempt(() => b.storedBytes(KEY, value)) : THREW);
  check("DR-02: storedBytes(\"hw:profiles\", …) equals Chrome's count for all twelve fixtures of section 0",
    KATS.length === 12 && KATS.every(([, value, bytes]) => stored(value) === bytes));

  // 31. L: the small profile measures 109 bytes with its one-character value,
  // so a small profile whose value is L characters is exactly at the budget.
  const L = 4194304 - 108;
  const smallWith = (n, c = "x") =>
    [{ ...small(), headers: [{ name: "X-A", operation: "set", value: c.repeat(n) }] }];
  const budgetFor = (previous, next) => (fn("checkProfilesBudget")
    ? attempt(() => b.checkProfilesBudget(KEY, previous, next)) : THREW);
  const atBudget = budgetFor([], smallWith(L));
  const oneOver = budgetFor([], smallWith(L + 1));
  check("DR-02: a set at exactly the budget is accepted, and one byte over is refused with overBy 1",
    stored(smallWith(L)) === 4194304 &&
    isObj(atBudget) && atBudget.ok === true &&
    isObj(oneOver) && oneOver.ok === false && oneOver.overBy === 1);

  // 32. A write that does not make hw:profiles larger is never refused, so there
  // is always a way back under the budget.
  const overNow = smallWith(L + 5000);
  const shrink = budgetFor(overNow, smallWith(L + 4999));
  const same = budgetFor(overNow, smallWith(L + 5000, "y"));
  const grow = budgetFor(overNow, smallWith(L + 5001));
  check("DR-02: over the budget by 5,000 bytes already, a write 1 byte smaller is accepted, one the same size is accepted, and one 1 byte larger is refused",
    isObj(shrink) && shrink.ok === true && isObj(same) && same.ok === true &&
    isObj(grow) && grow.ok === false);

  // 33
  const FORMATS = [[1, "1 KB"], [1024, "1 KB"], [1025, "2 KB"], [12288, "12 KB"],
    [1022976, "999 KB"], [1022977, "1.0 MB"], [1363148, "1.3 MB"], [1363149, "1.4 MB"],
    [1572864, "1.5 MB"]];
  check("DR-02: formatOverage: 1 → 1 KB, 1,024 → 1 KB, 1,025 → 2 KB, 12,288 → 12 KB, 1,022,976 → 999 KB, 1,022,977 → 1.0 MB, 1,363,148 → 1.3 MB, 1,363,149 → 1.4 MB, 1,572,864 → 1.5 MB",
    fn("formatOverage") && FORMATS.every(([bytes, text]) => attempt(() => b.formatOverage(bytes)) === text));

  // 34–36. The ruled copy, word for word (section 1).
  check("DR-02: the save refusal for 12,288 bytes is the ruled sentence, with 12 KB",
    fn("describeSaveBudgetRefusal") && attempt(() => b.describeSaveBudgetRefusal(12288)) ===
      "Not saved: your profiles would be 12 KB over HeaderWright's 4 MB storage limit. Shorten a header value or delete a profile, then save.");
  const importClause = fn("describeImportBudgetRefusal")
    ? attempt(() => b.describeImportBudgetRefusal(1572864)) : THREW;
  check("DR-02: the import refusal for 1,572,864 bytes is the ruled clause with 1.5 MB, unterminated, and renders as Import failed: ….",
    importClause === "this file's profiles are 1.5 MB over HeaderWright's 4 MB storage limit. Remove profiles or shorten header values in the file and try again" &&
    `Import failed: ${importClause}.` ===
      "Import failed: this file's profiles are 1.5 MB over HeaderWright's 4 MB storage limit. Remove profiles or shorten header values in the file and try again.");
  check("DR-02: DRAFT_NOT_KEPT_NOTICE is the ruled sentence",
    b.DRAFT_NOT_KEPT_NOTICE ===
      "These edits are too large to keep if the popup closes. Save the profile to keep them.");

  // 37. {"x":"…"} is n + 8 bytes of JSON.
  const accented = { new: "é" };
  const mapOf = (n) => ({ x: "a".repeat(n) });
  check("DR-02: draftsBytes counts UTF-8 bytes, a map of exactly 131,072 bytes fits, and one byte more does not",
    fn("draftsBytes") && fn("fitsDraftsBudget") &&
    attempt(() => b.draftsBytes(accented)) === JSON.stringify(accented).length + 1 &&
    attempt(() => b.draftsBytes(mapOf(131064))) === 131072 &&
    attempt(() => b.fitsDraftsBudget(mapOf(131064))) === true &&
    attempt(() => b.fitsDraftsBudget(mapOf(131065))) === false);

  // 38–43. The store, against a small fake storage and a fake budget.
  const NOT_KEPT = d.DRAFT_NOT_KEPT;
  const hasNotKept = NOT_KEPT !== undefined && NOT_KEPT !== true && NOT_KEPT !== false;
  const fakeFits = (map) => JSON.stringify(map).length <= 600;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const fakeStorage = (initial) => {
    const fake = { data: clone(initial), writes: 0 };
    fake.read = async () => clone(fake.data);
    fake.write = async (value) => { fake.writes += 1; fake.data = clone(value); };
    return fake;
  };
  const storeOn = (fake, budgeted = true) => (typeof d.createDraftStore === "function"
    ? attempt(() => d.createDraftStore(budgeted
      ? { read: fake.read, write: fake.write, fits: fakeFits }
      : { read: fake.read, write: fake.write }))
    : THREW);
  const put = (store, key, draft) => call(() => store.put(key, draft));
  const draftWith = (id, n) => formToDraft({ editingProfileId: id,
    baseDigest: id === null ? null : "sha256:profile-v1:" + "a".repeat(64),
    name: "p", domains: "a.com",
    rows: [{ name: "X-A", side: "request", operation: "set", value: "v".repeat(n) }] });
  const same3 = (fake, draft) => JSON.stringify(fake.data) === JSON.stringify({ 3: draft });
  const fits3 = draftWith(3, 10);
  const fits3b = draftWith(3, 20);
  const over3 = draftWith(3, 500);
  const near5 = draftWith(5, 330);
  const tinyNew = draftWith(null, 10);
  const sized = fakeFits({ 3: fits3 }) && fakeFits({ 3: fits3b }) && !fakeFits({ 3: over3 }) &&
    fakeFits({ 5: near5 }) && fakeFits({ new: tinyNew }) && !fakeFits({ 5: near5, new: tinyNew });
  {
    const fake = fakeStorage({ 3: fits3 });
    const result = await put(storeOn(fake), "3", over3);
    check("DR-02: a draft that pushes the map over the budget is not written, resolves DRAFT_NOT_KEPT, and the stored draft is still the earlier one",
      hasNotKept && sized && result === NOT_KEPT && fake.writes === 0 && same3(fake, fits3));
  }
  {
    const fake = fakeStorage();
    const result = await put(storeOn(fake), "3", fits3);
    check("DR-02: a draft that fits is written and resolves true",
      sized && result === true && fake.writes === 1 && same3(fake, fits3));
  }
  {
    const fake = fakeStorage({ 3: fits3 });
    const store = storeOn(fake);
    const first = await put(store, "3", over3);
    const second = await put(store, "3", fits3b);
    check("DR-02: after a refused draft, the next one that fits is written",
      hasNotKept && sized && first === NOT_KEPT && second === true && same3(fake, fits3b));
  }
  {
    const fake = fakeStorage();
    const store = storeOn(fake);
    const session = typeof d.createDraftSession === "function" && isObj(store)
      ? attempt(() => d.createDraftSession(store)) : THREW;
    attempt(() => session.open(3));
    const refusedPut = await call(() => session.put(over3));
    await call(() => session.end());
    const afterEnd = await call(() => session.put(fits3));
    check("DR-02: the session passes DRAFT_NOT_KEPT on, and still resolves false once ended",
      hasNotKept && sized && isObj(session) && refusedPut === NOT_KEPT && afterEnd === false &&
      fake.writes === 0);
  }
  {
    const fake = fakeStorage({ 5: near5 });
    const result = await put(storeOn(fake), "new", tinyNew);
    check("DR-02: another profile's stored draft counts toward the budget: with it near the limit, a small draft under a new key is refused and nothing is written",
      hasNotKept && sized && result === NOT_KEPT && fake.writes === 0 &&
      JSON.stringify(fake.data) === JSON.stringify({ 5: near5 }));
  }
  {
    const fake = fakeStorage();
    const huge = draftWith(3, 200000);
    const result = await put(storeOn(fake, false), "3", huge);
    check("DR-02: a store given no budget writes a draft of any size and resolves true",
      result === true && fake.writes === 1 && same3(fake, huge));
  }

  // 44–49. The wiring. Each function body is cut at its closing brace in
  // column 0, and its whitespace collapsed.
  const flat = (s) => s.replace(/\s+/g, " ");
  const bodyOf = (signature) => {
    const start = popupJs.indexOf(signature);
    if (start < 0) return "";
    const end = popupJs.indexOf("\n}\n", start);
    return end < 0 ? "" : flat(popupJs.slice(start, end + 2));
  };
  const at = (body, text) => body.indexOf(text);
  const inOrder = (...positions) => positions.every((p) => p >= 0) &&
    positions.every((p, i) => i === 0 || positions[i - 1] < p);
  const saveBody = bodyOf("async function saveProfile(");
  check("DR-02: saveProfile checks the profiles budget after the collision refusal and before the write, and its refusal shows describeSaveBudgetRefusal(budget.overBy) and returns",
    inOrder(at(saveBody, "if (savedProfileCollision) {"),
      at(saveBody, "const budget = checkProfilesBudget(STORAGE_KEY_PROFILES, previousProfiles, nextProfiles);"),
      at(saveBody, "if (!budget.ok) { showFormError(describeSaveBudgetRefusal(budget.overBy)); return; }"),
      at(saveBody, "await setProfiles(nextProfiles)")));
  const chosenBody = bodyOf("async function onImportFileChosen(");
  check("DR-02: onImportFileChosen checks fileBudget after the parse and before pendingImport is set, and its refusal shows the import message and returns",
    inOrder(at(chosenBody, "profiles = parseProfilesFile("),
      at(chosenBody, "const fileBudget = checkProfilesBudget(STORAGE_KEY_PROFILES, stored, profiles);"),
      at(chosenBody, "if (!fileBudget.ok) { showIoMsg(`Import failed: ${describeImportBudgetRefusal(fileBudget.overBy)}.`); return; }"),
      at(chosenBody, "pendingImport = profiles;")));
  const applyBody = bodyOf("async function applyImport(");
  check("DR-02: applyImport checks replaceBudget before the write, with the same refusal and a return",
    inOrder(at(applyBody, "const replaceBudget = checkProfilesBudget(STORAGE_KEY_PROFILES, previousProfiles, nextProfiles);"),
      at(applyBody, "if (!replaceBudget.ok) { hideIoUi(); showIoMsg(`Import failed: ${describeImportBudgetRefusal(replaceBudget.overBy)}.`); return; }"),
      at(applyBody, "await setProfiles(nextProfiles);")));
  const storeCall = flat((popupJs.match(/createDraftStore\(\{[\s\S]*?\n\}\);/) || [""])[0]);
  check("DR-02: the one draft store is created with fits: fitsDraftsBudget",
    (popupJs.match(/\bcreateDraftStore\(/g) || []).length === 1 &&
    storeCall.includes("fits: fitsDraftsBudget"));
  const persistBody = bodyOf("async function persistDraft(");
  check("DR-02: persistDraft starts from let kept = DRAFT_NOT_KEPT; and ends with setDraftNotKeptNotice(kept === DRAFT_NOT_KEPT);",
    persistBody.startsWith("async function persistDraft() { let kept = DRAFT_NOT_KEPT; try {") &&
    persistBody.endsWith(" setDraftNotKeptNotice(kept === DRAFT_NOT_KEPT); }"));
  const form = (popupHtml.match(/<form id="profile-form">[\s\S]*?<\/form>/) || [""])[0];
  check("DR-02: openEditor and revertToSaved call setDraftNotKeptNotice(false), and popup.html declares #draft-not-kept hidden, as a .notice, inside the form",
    bodyOf("async function openEditor(").includes("setDraftNotKeptNotice(false);") &&
    bodyOf("async function revertToSaved(").includes("setDraftNotKeptNotice(false);") &&
    form.includes('<div id="draft-not-kept" class="notice hidden"></div>'));
}

async function debounceChecks() {
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  let runs = 0;
  const d1 = createDebounced(() => { runs++; }, 5);
  d1(); d1(); d1(); d1(); d1();
  check("a burst has not run yet at schedule time", runs === 0);
  await sleep(30);
  check("a burst of five collapses into ONE run", runs === 1);

  // Trailing edge with the LAST arguments — a leading-edge implementation
  // would render the state mid-burst with nothing scheduled to correct it.
  let seen = null;
  const d2 = createDebounced((v) => { seen = v; }, 5);
  d2("first"); d2("second"); d2("last");
  await sleep(30);
  check("the trailing run uses the LAST arguments", seen === "last");

  // Calls separated by more than the window are distinct runs, or the listener
  // would coalesce unrelated events indefinitely under steady traffic.
  let spaced = 0;
  const d3 = createDebounced(() => { spaced++; }, 5);
  d3();
  await sleep(30);
  d3();
  await sleep(30);
  check("calls outside the window run separately", spaced === 2);

  // A rejected async task must reach onError rather than becoming an unhandled
  // rejection: nothing awaits a task scheduled from a timer.
  let caught = null;
  const d4 = createDebounced(async () => { throw new Error("boom"); }, 5,
    (err) => { caught = err.message; });
  d4();
  await sleep(30);
  check("an async rejection is surfaced to onError", caught === "boom");

  // A synchronous throw must not escape the timer callback either.
  let syncCaught = null;
  const d5 = createDebounced(() => { throw new Error("sync"); }, 5,
    (err) => { syncCaught = err.message; });
  d5();
  await sleep(30);
  check("a synchronous throw is surfaced to onError", syncCaught === "sync");

  // Omitting onError must be safe, matching createSerialQueue's contract.
  const d6 = createDebounced(async () => { throw new Error("quiet"); }, 5);
  d6();
  await sleep(30);
  check("omitting onError is safe for the debouncer too", true);

  // Scheduling again AFTER a run has fired must still work — a debouncer that
  // fails to reset its timer handle fires once and then goes deaf, which in
  // the popup would look exactly like finding 8 never having been fixed.
  let revived = 0;
  const d7 = createDebounced(() => { revived++; }, 5);
  d7();
  await sleep(30);
  d7();
  await sleep(30);
  check("the debouncer still fires after an earlier run completed",
    revived === 2);
}

await queueChecks();
await runThenAlwaysChecks();
await actionGateChecks();
await debounceChecks();
await profileDigestChecks();
await ar02Checks();
await dr02Checks();

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
