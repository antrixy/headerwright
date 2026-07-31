// selftest.mjs — HeaderWright selftest suite.
// Run: node test/selftest.mjs   (from the repo root; no dependencies)
// Exit code 0 iff every check passes AND the total equals EXPECTED_CHECKS.
//
// Scope: everything in extension/lib/ — the pure layer with no chrome.*
// calls, which is why lib/ exists as a separate directory. This suite
// verifies rule CONSTRUCTION and format STABILITY. It deliberately makes
// no claim about rule APPLICATION to real traffic: a rule can be built
// correctly, match in the oracle, and still no-op without a host
// permission grant (the spike's Phase 1 finding). Application evidence
// comes from the manual smoke test against httpbin.org, recorded in the
// project handoff — not from here.
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
} from "../extension/lib/rules.js";
import {
  canonicalizeProfiles,
  stableStringify,
  serializeProfiles,
  parseProfilesFile,
  FILE_FORMAT,
  FILE_VERSION,
} from "../extension/lib/canonical.js";

const EXPECTED_CHECKS = 47;

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
  s1 === serializeProfiles(parseProfilesFile(s1)));
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
  parseProfilesFile(validDoc([
    { id: 1, name: "a", domains: ["B.com", "a.com"], headers: [{ name: "x", operation: "set", value: "1" }] },
  ]))[0].domains.join(",") === "a.com,b.com");

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
