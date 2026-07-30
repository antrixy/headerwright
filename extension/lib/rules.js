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
