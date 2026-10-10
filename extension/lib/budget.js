// budget.js
// Pure: how many bytes Chrome charges for what HeaderWright stores, the
// budgets HeaderWright keeps under, and the words that refuse a write over
// them. No chrome.* — popup.js reads storage, asks here, and decides.
//
// DR-02 (s5, v0.2.4), FINDING-051. Nothing bounded what HeaderWright stored,
// and a write the browser refused was silent: a Save over the quota left the
// editor open with nothing on screen and nothing stored, and a draft over the
// session quota was dropped with one console line. Ruled S5-D2: fixed budgets
// of HeaderWright's own, measured before any code and independent of what a
// given Chrome allows. At the Chrome 116 floor both storage areas allow
// 10 MiB; these budgets sit well under that, and under the 5 MB and 1 MB
// quotas older versions had, so the refusal a user sees is always this
// module's sentence and never the browser's silence.
//
// TWO BUDGETS, COUNTED TWO WAYS, because the two areas charge differently.
// storage.local charges the key plus the value written as JSON (Chromium's
// base::JSONWriter), so hw:profiles is counted exactly as Chrome counts it:
// storedBytes() reproduced Chromium 141's getBytesInUse for every fixture in
// test/PREDICTIONS-2026-10-09-s5.md, section 0. storage.session charges an
// estimate of memory instead, several times the JSON and not reproducible
// from it, so the drafts map is budgeted in its own JSON bytes: 128 KiB of it
// was charged at most 650,752 bytes, under even the 1 MiB session quota of
// Chrome 111 and earlier.

/** hw:profiles, in bytes as storage.local counts them (key included). */
export const PROFILES_BUDGET_BYTES = 4 * 1024 * 1024;

/** The drafts map, in UTF-8 bytes of its JSON. */
export const DRAFTS_BUDGET_BYTES = 128 * 1024;

const MIB = 1024 * 1024;
const PROFILES_LIMIT = `${PROFILES_BUDGET_BYTES / MIB} MB`;

// Printable ASCII but `"`, `\` and `<`: one byte each, and the common case for
// everything HeaderWright stores, so a set at the budget counts in
// milliseconds.
const PLAIN = /^[\x20\x21\x23-\x3b\x3d-\x5b\x5d-\x7e]*$/;

// Chromium's JSON string escaping, by UTF-16 code unit: `"` `\` and the five
// named controls take two bytes; `<`, U+2028, U+2029 and every other control
// below U+0020 take six (\uXXXX); a surrogate pair is one four-byte code
// point; a lone surrogate is written as U+FFFD, three bytes. DEL and
// noncharacters are not escaped.
function stringBytes(text) {
  if (PLAIN.test(text)) return text.length + 2;
  let bytes = 2;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit === 0x22 || unit === 0x5c || unit === 0x08 || unit === 0x0c ||
        unit === 0x0a || unit === 0x0d || unit === 0x09) bytes += 2;
    else if (unit < 0x20 || unit === 0x3c || unit === 0x2028 || unit === 0x2029) bytes += 6;
    else if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length &&
             (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * The bytes of `value` written as Chrome writes JSON: no whitespace, an
 * object's undefined members left out. Every number HeaderWright stores is a
 * rule id, a 32-bit integer, which Chrome writes as JavaScript does.
 */
export function chromeJsonBytes(value) {
  if (value === null) return 4;
  if (typeof value === "boolean") return value ? 4 : 5;
  if (typeof value === "number") return String(value).length;
  if (typeof value === "string") return stringBytes(value);
  if (Array.isArray(value)) {
    let bytes = value.length === 0 ? 2 : value.length + 1;
    for (const item of value) bytes += chromeJsonBytes(item);
    return bytes;
  }
  let bytes = 1;
  let members = 0;
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) continue;
    bytes += stringBytes(key) + 1 + chromeJsonBytes(value[key]) + 1;
    members += 1;
  }
  return members === 0 ? 2 : bytes;
}

/** What storage.local's getBytesInUse reports for `value` under `key`. */
export function storedBytes(key, value) {
  return new TextEncoder().encode(key).length + chromeJsonBytes(value);
}

/**
 * May `next` replace `previous` under `key`? `{ ok: true }` when it fits the
 * budget, or when it is no larger than what is stored now; otherwise
 * `{ ok: false, overBy }`, the bytes past the budget.
 *
 * A WRITE THAT DOES NOT GROW THE SET IS NEVER REFUSED. A set already over the
 * budget (written by an older build, or by hand) must still let its owner
 * delete, shorten and edit their way back under it; a guard that refused the
 * way out would be worse than the overrun, the reasoning FINDING-015's edit
 * exemption gives for the profile cap.
 */
export function checkProfilesBudget(key, previous, next) {
  const after = storedBytes(key, next);
  if (after <= PROFILES_BUDGET_BYTES) return { ok: true };
  if (after <= storedBytes(key, previous)) return { ok: true };
  return { ok: false, overBy: after - PROFILES_BUDGET_BYTES };
}

/** The UTF-8 bytes of the drafts map's JSON. */
export function draftsBytes(drafts) {
  return new TextEncoder().encode(JSON.stringify(drafts)).length;
}

/** Does the whole drafts map, as it would be written, fit its budget? */
export function fitsDraftsBudget(drafts) {
  return draftsBytes(drafts) <= DRAFTS_BUDGET_BYTES;
}

/**
 * An overage for a sentence, ROUNDED UP so it never reads 0 and never
 * understates: whole kilobytes below 1,000 KB, then megabytes to one decimal.
 * 1 KB is 1,024 bytes.
 */
export function formatOverage(bytes) {
  const kilobytes = Math.max(1, Math.ceil(bytes / 1024));
  if (kilobytes < 1000) return `${kilobytes} KB`;
  return `${(Math.ceil((bytes * 10) / MIB) / 10).toFixed(1)} MB`;
}

/** The form error for a Save over the budget (ruled S5-D2, the copy in S5-D11). */
export function describeSaveBudgetRefusal(overBy) {
  return `Not saved: your profiles would be ${formatOverage(overBy)} over ` +
    `HeaderWright's ${PROFILES_LIMIT} storage limit. Shorten a header value or ` +
    `delete a profile, then save.`;
}

/**
 * An import over the budget, as a clause: the popup renders every import
 * failure as `Import failed: <clause>.`, so the full stop is the popup's.
 */
export function describeImportBudgetRefusal(overBy) {
  return `this file's profiles are ${formatOverage(overBy)} over ` +
    `HeaderWright's ${PROFILES_LIMIT} storage limit. Remove profiles or shorten ` +
    `header values in the file and try again`;
}

/** Shown in the editor while its latest edits are not stored as a draft. */
export const DRAFT_NOT_KEPT_NOTICE =
  "These edits are too large to keep if the popup closes. Save the profile to keep them.";
