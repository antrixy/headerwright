// platform-floor.mjs — what HeaderWright asks of Chrome, and from which
// version Chrome provides it (AR-11, AR-23).
//
// WHY THIS EXISTS. The manifest's floor was pinned to ONE capability's
// version: `"101"`, because `requestDomains` is Chrome 101. Nothing compared
// it with anything else the extension uses, and two of those came later:
// `optional_host_permissions` is Chrome 102, and a request `append` registers
// on no Chrome below 108. From 108 to 142 Chrome also accepts an appended name
// only in its allowlist's lowercase spelling, so an append typed
// `X-Forwarded-For` failed the whole sync (FINDING-049). A pinned number
// cannot notice any of that. This table can: test/selftest.mjs collects what
// the extension uses, requires every item to be here, and requires
// `manifest.minimum_chrome_version` to EQUAL the highest version among them.
// Raising or lowering the floor is still a deliberate edit the suite checks;
// it is no longer a guess.
//
// Each requirement is { kind, name, chrome, basis, source }.
//   kind    "manifest" a manifest key (top level, or `background.*`)
//           "permission" a permission the manifest requests
//           "api"      a chrome.<namespace>.<member> the code reads
//           "rule"     a part of the rule rules.js builds
//           "append"   a request header name the allowlist lets a profile
//                      append, in the spelling sent to Chrome
//   basis   "first"      absent at the tag before, present from `chrome`
//           "documented" Chrome's reference gives the number; not read here
//           "present"    defined at 101.0.4951.41, the lowest tag read; when
//                        it first appeared was not established
//
// Sources are Chromium's tree at release tags, read on 2026-10-06 and again
// on 2026-10-09 through raw.githubusercontent.com/chromium/chromium/<tag>/.
// Design and counts: test/PREDICTIONS-2026-10-09-s5.md, commit 2.

const LOWEST = "101.0.4951.41";
const at = (path) => `chromium-source: ${path} at ${LOWEST}, the lowest tag read`;

const EXT_MANIFEST = "extensions/common/api/_manifest_features.json";
const CHROME_MANIFEST = "chrome/common/extensions/api/_manifest_features.json";
const EXT_PERMISSIONS = "extensions/common/api/_permission_features.json";
const DNR_IDL = "extensions/common/api/declarative_net_request.idl";
const ALLOWLIST =
  "extensions/browser/api/declarative_net_request/constants.h (kDNRRequestHeaderAppendAllowList)";

const manifest = (name, path) =>
  ({ kind: "manifest", name, chrome: 101, basis: "present", source: at(path) });
const permission = (name) =>
  ({ kind: "permission", name, chrome: 101, basis: "present", source: at(EXT_PERMISSIONS) });
const api = (name, path) =>
  ({ kind: "api", name, chrome: 101, basis: "present", source: at(path) });
const rule = (name) =>
  ({ kind: "rule", name, chrome: 101, basis: "present", source: at(DNR_IDL) });
const append108 = (name) => ({
  kind: "append", name, chrome: 108, basis: "first",
  source: `chromium-source: ${ALLOWLIST}, absent at 108.0.5359.40, a 20-name allowlist ` +
    "from 108.0.5359.50; compared as spelled, lowercase, until 143.0.7499.0",
});

export const REQUIREMENTS = [
  manifest("manifest_version", EXT_MANIFEST),
  manifest("name", EXT_MANIFEST),
  manifest("version", EXT_MANIFEST),
  manifest("description", EXT_MANIFEST),
  manifest("icons", EXT_MANIFEST),
  manifest("action", CHROME_MANIFEST),
  manifest("background", EXT_MANIFEST),
  manifest("background.service_worker", "extensions/common/manifest_constants.cc"),
  manifest("background.type", "extensions/common/manifest_handlers/background_info.cc"),
  manifest("minimum_chrome_version", CHROME_MANIFEST),
  manifest("permissions", EXT_MANIFEST),
  {
    kind: "manifest", name: "optional_host_permissions", chrome: 102, basis: "first",
    source: `chromium-source: ${EXT_MANIFEST}, absent at 101.0.4951.74 and 102.0.4952.0, ` +
      "present at 102.0.5005.61",
  },

  permission("declarativeNetRequestWithHostAccess"),
  permission("storage"),

  api("chrome.action.setBadgeBackgroundColor", "chrome/common/extensions/api/action.json"),
  api("chrome.action.setBadgeText", "chrome/common/extensions/api/action.json"),
  api("chrome.declarativeNetRequest.getDynamicRules", DNR_IDL),
  api("chrome.declarativeNetRequest.updateDynamicRules", DNR_IDL),
  api("chrome.permissions.contains", "chrome/common/extensions/api/permissions.json"),
  api("chrome.permissions.getAll", "chrome/common/extensions/api/permissions.json"),
  api("chrome.permissions.onAdded", "chrome/common/extensions/api/permissions.json"),
  api("chrome.permissions.onRemoved", "chrome/common/extensions/api/permissions.json"),
  api("chrome.permissions.remove", "chrome/common/extensions/api/permissions.json"),
  api("chrome.permissions.request", "chrome/common/extensions/api/permissions.json"),
  api("chrome.runtime.onInstalled", "extensions/common/api/runtime.json"),
  api("chrome.runtime.onStartup", "extensions/common/api/runtime.json"),
  api("chrome.storage.local", "extensions/common/api/storage.json"),
  api("chrome.storage.onChanged", "extensions/common/api/storage.json"),
  {
    kind: "api", name: "chrome.storage.session", chrome: 102, basis: "documented",
    source: "chrome-docs: developer.chrome.com/docs/extensions/reference/api/storage " +
      "marks it Chrome 102+. Chromium's _api_features.json already defines it at " +
      "100.0.4896.242 and 101.0.4951.41, where storage.json marks it nodoc, so 102 " +
      "is the documented number, not a boundary read",
  },

  {
    kind: "rule", name: "condition.requestDomains", chrome: 101, basis: "first",
    source: `chromium-source: ${DNR_IDL}, absent at 101.0.4897.0, present at 101.0.4951.41`,
  },
  rule("condition.resourceTypes"),
  ...[
    "main_frame", "sub_frame", "stylesheet", "script", "image", "font",
    "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket",
    "webtransport", "webbundle", "other",
  ].map((type) => rule(`resourceType.${type}`)),
  rule("action.modifyHeaders"),
  rule("requestHeaders.set"),
  rule("requestHeaders.remove"),
  rule("responseHeaders.set"),
  rule("responseHeaders.remove"),
  {
    kind: "rule", name: "requestHeaders.append", chrome: 108, basis: "first",
    source: "chromium-source: extensions/browser/api/declarative_net_request/indexed_rule.cc, " +
      "ERROR_APPEND_REQUEST_HEADER_UNSUPPORTED for every request header at 107.0.5304.150 " +
      "and 108.0.5359.40, an allowlist from 108.0.5359.50",
  },

  ...[
    "accept", "accept-encoding", "accept-language",
    "access-control-request-headers", "cache-control", "connection",
    "content-language", "cookie", "forwarded", "if-match", "if-none-match",
    "keep-alive", "range", "te", "trailer", "transfer-encoding", "upgrade",
    "via", "want-digest", "x-forwarded-for",
  ].map(append108),
  {
    kind: "append", name: "user-agent", chrome: 116, basis: "first",
    source: `chromium-source: ${ALLOWLIST}, absent at 116.0.5791.0, present at 116.0.5845.0`,
  },
];

export const KINDS = new Set(["manifest", "permission", "api", "rule", "append"]);
export const BASES = new Set(["first", "documented", "present"]);

/** Every `chrome.<namespace>.<member>` in source text, comments already stripped. */
export function apiPaths(text) {
  const found = new Set();
  for (const m of text.matchAll(/\bchrome\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)) {
    found.add(`chrome.${m[1]}.${m[2]}`);
  }
  return [...found].sort();
}

/** The manifest's top-level keys, and `background.*`. */
export function manifestKeys(manifestObject) {
  const keys = Object.keys(manifestObject || {});
  const background = manifestObject?.background;
  if (background && typeof background === "object") {
    for (const key of Object.keys(background)) keys.push(`background.${key}`);
  }
  return keys.sort();
}

/** The permissions the manifest requests, required and optional. */
export function manifestPermissions(manifestObject) {
  return [
    ...(manifestObject?.permissions || []),
    ...(manifestObject?.optional_permissions || []),
  ].sort();
}

/**
 * The parts of one built rule that Chrome must accept: the condition's keys,
 * each resource type, the action type, and each operation on each side.
 * Header NAMES are not parts: which names may be appended is the allowlist's
 * question, registered under kind "append".
 */
export function ruleParts(builtRule) {
  const names = new Set();
  const condition = builtRule?.condition || {};
  for (const key of Object.keys(condition)) names.add(`condition.${key}`);
  for (const type of condition.resourceTypes || []) names.add(`resourceType.${type}`);
  if (builtRule?.action?.type) names.add(`action.${builtRule.action.type}`);
  for (const side of ["requestHeaders", "responseHeaders"]) {
    for (const info of builtRule?.action?.[side] || []) names.add(`${side}.${info.operation}`);
  }
  return [...names].sort();
}

/** The requirement for one item, or undefined when the table lacks it. */
export function requirementFor(kind, name) {
  return REQUIREMENTS.find((r) => r.kind === kind && r.name === name);
}

/**
 * @param {Array<{kind: string, name: string}>} inUse
 * @returns {{floor: number, setBy: string[], unregistered: string[]}}
 *   floor: the highest Chrome version among the registered items in use;
 *   setBy: the items that set it; unregistered: the items the table lacks.
 */
export function floorOf(inUse) {
  let floor = 0;
  let setBy = [];
  const unregistered = [];
  for (const { kind, name } of inUse) {
    const requirement = requirementFor(kind, name);
    if (!requirement) {
      unregistered.push(`${kind} ${name}`);
      continue;
    }
    if (requirement.chrome > floor) {
      floor = requirement.chrome;
      setBy = [`${kind} ${name}`];
    } else if (requirement.chrome === floor) {
      setBy.push(`${kind} ${name}`);
    }
  }
  return { floor, setBy, unregistered };
}
