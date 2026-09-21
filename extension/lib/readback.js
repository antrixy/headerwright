// readback.js
// Pure: (sync state, registered DNR rule) -> what a profile card says Chrome
// has registered. No chrome.* calls — popup.js reads getDynamicRules() and
// hands the result in, the same split as status.js and draft.js, so every
// state below is Node-testable.
//
// WHY THIS FILE EXISTS. FINDING-040 and FINDING-043 are one defect with two
// entrances: the popup accepts something legal, the stored rule differs from
// what the operator believes, and the wire result is plausible rather than
// broken. Every instance on record was caught by reading getDynamicRules() in
// the service worker console before the press — a habit, not a mechanism.
// This module is that read, rendered on the card. Ruling:
// antrixy/project-planning decisions.md, "HeaderWright v0.2.0 — FINDING-040
// and FINDING-043 — ruled 2026-09-21". Design frozen in
// test/PREDICTIONS-2026-09-21-readback.md before this file existed.
//
// THE SOURCE IS THE REGISTERED RULE, NEVER STORAGE. Storage is what the popup
// wrote; the registered rule is what Chrome will act on, and the gap between
// them is where FINDING-042 lived. A readback that summarised storage would
// be a summary, and this project verifies against artifacts, not summaries.

export const READBACK_NOTES = {
  checking: "Checking what Chrome has registered\u2026",
  off: "Off \u2014 nothing registered",
  previous: "Last registration failed \u2014 this is the rule still registered",
  none: "No rule registered for this profile",
  unreadable: "Registered rule could not be read",
};

// A registered header list is readable when it is absent or an array of
// objects carrying a string header and a string operation. Anything else is
// reported as unreadable rather than guessed at — a readback that invents a
// plausible line is the defect this module exists to prevent.
function readableList(list) {
  if (list === undefined) return true;
  if (!Array.isArray(list)) return false;
  return list.every(
    (e) =>
      e !== null &&
      typeof e === "object" &&
      typeof e.header === "string" &&
      typeof e.operation === "string" &&
      (e.value === undefined || typeof e.value === "string")
  );
}

/**
 * @param {{syncState: string, rule: object|null}} input
 *   syncState: classify()'s output from lib/status.js.
 *   rule: what getDynamicRules() returned for this profile's id, or null.
 * @returns {{kind: string, note: string|null, lines: Array<{side: string,
 *   operation: string, header: string, value: string|undefined}>}}
 */
export function describeReadback({ syncState, rule }) {
  // STALE SHOWS NOTHING, EVEN WITH A RULE PRESENT. The popup re-renders on the
  // profiles write BEFORE the worker has re-registered, so at that instant the
  // registered rule is the PREVIOUS one. Rendering it would answer "what did I
  // just save?" with the pre-save rule — a new false reading on the surface
  // built to end them. The hw:sync write that ends staleness re-renders.
  if (syncState === "stale") {
    return { kind: "checking", note: READBACK_NOTES.checking, lines: [] };
  }
  // PAUSED CLEARS UNCONDITIONALLY in sw.js, so nothing should be registered;
  // whatever the read returned, the truthful card is "off".
  if (syncState === "paused") {
    return { kind: "off", note: READBACK_NOTES.off, lines: [] };
  }
  if (rule === null || rule === undefined) {
    return { kind: "none", note: READBACK_NOTES.none, lines: [] };
  }

  const action = rule && typeof rule === "object" ? rule.action : undefined;
  if (
    !action ||
    typeof action !== "object" ||
    !readableList(action.requestHeaders) ||
    !readableList(action.responseHeaders)
  ) {
    return { kind: "unreadable", note: READBACK_NOTES.unreadable, lines: [] };
  }

  // SIDE COMES FROM WHICH ARRAY THE ENTRY IS IN, and from nothing else. That
  // is where Chrome applies it; a label computed any other way could disagree
  // with the wire.
  const lines = [];
  for (const e of action.requestHeaders || []) {
    lines.push({ side: "req", operation: e.operation, header: e.header, value: e.value });
  }
  for (const e of action.responseHeaders || []) {
    lines.push({ side: "res", operation: e.operation, header: e.header, value: e.value });
  }

  if (lines.length === 0) {
    return { kind: "none", note: READBACK_NOTES.none, lines: [] };
  }

  // FAILED KEEPS THE LINES. Chrome documents that a failed atomic update
  // changes nothing, so the previous rule is still registered and still
  // applying — hiding it would claim the opposite, the exact error HW-V7-04
  // removed from the status line.
  if (syncState === "failed") {
    return { kind: "previous", note: READBACK_NOTES.previous, lines };
  }
  return { kind: "entries", note: null, lines };
}

/**
 * One line, e.g. `res · set · X-HW-Removable → "present"`.
 *
 * THE NAME IS NEVER SHORTENED — FINDING-043 is a clipped name, and a readback
 * that clipped would be that finding again on the surface built to cure it.
 * THE VALUE IS QUOTED so an empty value and edge whitespace are visible.
 * A remove carries no value and gets no arrow.
 */
export function formatReadbackLine(line) {
  const head = `${line.side} \u00b7 ${line.operation} \u00b7 ${line.header}`;
  if (line.operation === "remove" || line.value === undefined) return head;
  return `${head} \u2192 ${JSON.stringify(line.value)}`;
}
