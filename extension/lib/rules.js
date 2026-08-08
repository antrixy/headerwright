// rules.js
// Pure functions: profile data -> declarativeNetRequest dynamic rule objects.
// No chrome.* calls in this file — permission checks and storage I/O live
// in sw.js. This split exists so a future selftest suite can exercise
// rule-building logic directly (Node-importable), the same pattern as
// ctxfold's profile()/validate() exports.
//
// Profile schema (source of truth):
// {
//   id: <integer >= 1>,        // also used directly as the DNR dynamic rule id
//   name: <string>,
//   domains: [<string>],       // e.g. ["example.com"]; DNR requestDomains
//                               // also matches subdomains automatically
//   headers: [
//     { name: <string>, operation: "set" | "append" | "remove", value?: <string> }
//   ]
// }

// Full ResourceType enum, declared explicitly. DNR's own default, when
// resourceTypes/excludedResourceTypes are both omitted, EXCLUDES
// main_frame — confirmed on Chrome's declarativeNetRequest reference
// (2026-07-30). A header editor that silently skipped the top-level page
// request would be a real, quiet correctness bug, not an edge case.
export const RESOURCE_TYPES = [
  "main_frame", "sub_frame", "stylesheet", "script", "image", "font",
  "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket",
  "webtransport", "webbundle", "other",
];

// The "append" operation is only supported for this specific set of
// request headers (Chrome's declarativeNetRequest reference, "Header
// modification" section, verified 2026-07-30). The allowlist is case
// sensitive per a known Chrome bug (449152902); compare in lowercase.
export const APPENDABLE_REQUEST_HEADERS = new Set([
  "accept", "accept-encoding", "accept-language",
  "access-control-request-headers", "cache-control", "connection",
  "content-language", "cookie", "forwarded", "if-match", "if-none-match",
  "keep-alive", "range", "te", "trailer", "transfer-encoding", "upgrade",
  "user-agent", "via", "want-digest", "x-forwarded-for",
]);

const VALID_OPERATIONS = new Set(["set", "append", "remove"]);

/**
 * HTTP field-name token characters, RFC 9110 section 5.6.2 (the "token"
 * production). Chromium implements the same set in
 * net::HttpUtil::IsValidHeaderName.
 *
 * PROVENANCE (v0.1.1, checked 2026-08-04): the Chrome declarativeNetRequest
 * reference documents ModifyHeaderInfo.header only as "The name of the header
 * to be modified" — it specifies NO character constraints. So this is grounded
 * in the RFC and Chromium's implementation of it, NOT in the extension docs.
 * The acceptance criterion asked us to verify the set against current docs;
 * the set is not in the docs, and that gap is the honest answer.
 *
 * Surrounding whitespace fails this pattern, which is deliberate: the popup
 * trims but the IMPORT path does not, and import accepts hand-edited JSON.
 */
export const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Upper bound on a DNR dynamic rule id.
 *
 * PROVENANCE: undocumented by Chrome, but VERIFIED EMPIRICALLY 2026-08-04.
 * The reference states only "Mandatory and should be >= 1" and gives no
 * maximum. Registering rules directly via updateDynamicRules() found the exact
 * boundary: id 2147483647 is ACCEPTED, id 2147483648 is REJECTED with
 * "Invalid type: expected integer, found number" — a 32-bit signed overflow
 * rather than a range check, consistent with the extensions IDL integer type.
 * No longer an inference.
 */
export const MAX_RULE_ID = 2147483647;

export function isValidHeaderName(name) {
  return typeof name === "string" && HEADER_NAME_PATTERN.test(name);
}

/**
 * Reject characters that cannot appear in a header value.
 *
 * NUL, CR, and LF are the hard cases: they are forbidden by the RFC, rejected
 * by Chromium, and are the header-injection vectors. The remaining C0 controls
 * and DEL are rejected as a DELIBERATE STRICTER-THAN-REQUIRED choice
 * (decision 2026-08-04).
 *
 * One knowing deviation from the standard: HTAB (0x09) is LEGAL in an RFC 9110
 * field-value, and we reject it anyway. This is lossy, and CONFIRMED lossy —
 * verified 2026-08-04 by registering a rule whose header value contained a tab
 * directly via updateDynamicRules(): Chrome ACCEPTED it. So the restriction is
 * ours, not the platform's. Recorded rather than hidden; revisit if a real
 * config ever needs a tab in a header value.
 */
export function isValidHeaderValue(value) {
  if (typeof value !== "string") return false;
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

/**
 * A profile id is used verbatim as the DNR dynamic rule id, so it must satisfy
 * whatever updateDynamicRules() accepts. One out-of-range id fails the whole
 * ATOMIC update, taking every other profile's rules down with it.
 */
export function isValidRuleId(id) {
  return Number.isInteger(id) && id >= 1 && id <= MAX_RULE_ID;
}

/**
 * Allocate the id for a NEW profile: the lowest positive integer not already
 * in use. Returns null only if the id space is exhausted, which cannot happen
 * below MAX_RULE_ID profiles and therefore cannot happen under the 5,000-rule
 * cap either.
 *
 * WHY NOT max(id)+1 — finding 9, confirmed at the wire 2026-08-05. The old
 * generator computed max(id)+1 and never checked the result against
 * isValidRuleId. Import accepts an id of exactly MAX_RULE_ID (legitimately —
 * that is the boundary SMOKE 4a established), so one imported ceiling profile
 * made the NEXT save generate 2147483648, which was written to storage
 * unchecked and then rejected by Chrome as a 32-bit overflow. The comment
 * above isValidRuleId states the invariant the generator was breaking: import
 * honoured the bound, the generator did not inherit it.
 *
 * Lowest-free rather than a guard-and-refuse, because a guard alone leaves the
 * user unable to create any profile with no in-app escape — the finding 2
 * shape. Here the ceiling profile simply does not poison the id space: the
 * gaps below it are all still free.
 *
 * Id REUSE is safe here and is not the "lowest-free reuse" nicety that was
 * deferred as cosmetic. Every sync rebuilds the whole dynamic rule set —
 * removeRuleIds is the full existing set, addRules is built fresh — so a
 * reused id never collides with a live rule from a deleted profile. Ids are
 * identity within one profile set and one export file, nothing wider.
 *
 * The loop terminates at the first gap, so it runs at most (profiles + 1)
 * times regardless of how large the ids themselves are.
 */
export function nextRuleId(profiles) {
  const used = new Set(
    (profiles || []).map((p) => (p ? p.id : undefined)).filter(Number.isInteger)
  );
  for (let id = 1; id <= MAX_RULE_ID; id++) {
    if (!used.has(id)) return id;
  }
  return null;
}

/**
 * Bare-hostname check, shared by the popup form and import validation.
 * Single-label hosts (e.g. "localhost") are deliberately allowed — a
 * developer header tool that rejects localhost would be strange. Ports
 * are not part of a domain here: DNR's requestDomains and origin match
 * patterns both ignore ports, so "localhost" covers localhost:3000 too.
 */
export function isValidDomain(domain) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(
    domain
  );
}

/**
 * Validate one header entry from a profile.
 * @returns {{valid: true} | {valid: false, reason: string}}
 */
export function validateHeaderEntry(entry) {
  if (!entry || typeof entry.name !== "string" || entry.name.trim() === "") {
    return { valid: false, reason: "missing or empty header name" };
  }
  if (!isValidHeaderName(entry.name)) {
    return {
      valid: false,
      reason:
        "header name must be an HTTP token (letters, digits, and !#$%&'*+-.^_`|~), with no spaces, colons, or surrounding whitespace",
    };
  }
  if (!VALID_OPERATIONS.has(entry.operation)) {
    return { valid: false, reason: `unknown operation "${entry.operation}"` };
  }
  if (entry.operation !== "remove") {
    if (typeof entry.value !== "string" || entry.value === "") {
      return {
        valid: false,
        reason: `operation "${entry.operation}" requires a non-empty value`,
      };
    }
    if (!isValidHeaderValue(entry.value)) {
      return {
        valid: false,
        reason: "header value contains a control character (NUL, CR, LF, other C0, or DEL)",
      };
    }
  }
  if (
    entry.operation === "append" &&
    !APPENDABLE_REQUEST_HEADERS.has(entry.name.toLowerCase())
  ) {
    return {
      valid: false,
      reason: `"${entry.name}" does not support append (Chrome allowlist)`,
    };
  }
  return { valid: true };
}

/**
 * Convert one profile header entry to a DNR ModifyHeaderInfo object.
 * Assumes the entry has already passed validateHeaderEntry.
 */
export function headerEntryToModifyHeaderInfo(entry) {
  const info = { header: entry.name, operation: entry.operation };
  if (entry.operation !== "remove") {
    info.value = entry.value;
  }
  return info;
}

/**
 * Build a DNR dynamic rule for a profile, scoped to a specific subset of
 * its domains. The caller (sw.js) decides that subset based on which
 * domains currently have granted host permissions — this function has no
 * way to check that itself and doesn't try to.
 *
 * Returns null if there is nothing valid to register: no granted domains,
 * or no valid header entries. A rule with an empty condition or empty
 * action would either match everything or do nothing, and neither is a
 * safe thing to register silently.
 */
export function profileToRule(profile, grantedDomains) {
  if (!grantedDomains || grantedDomains.length === 0) return null;

  const validHeaders = (profile.headers || [])
    .filter((entry) => validateHeaderEntry(entry).valid)
    .map(headerEntryToModifyHeaderInfo);

  if (validHeaders.length === 0) return null;

  return {
    id: profile.id,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: validHeaders,
    },
    condition: {
      requestDomains: grantedDomains,
      resourceTypes: RESOURCE_TYPES,
    },
  };
}
