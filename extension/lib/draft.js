// draft.js
// Pure: turn the edit form's RAW contents into a storable draft and back.
// No chrome.* — popup.js supplies the DOM reads and owns persistence.
//
// FINDING-042. The popup discards in-progress edits when it loses focus, with
// no warning and no restore. Chrome closing a popup on blur is standard; doing
// nothing about it was ours. The trigger is opening DevTools, which is the
// step every runbook in this project instructs before a measurement — so the
// procedure written to prevent bad data could silently change what was being
// measured.
//
// WHY A SEPARATE MODULE RATHER THAN A WARNING PROMPT. A confirm-on-close
// cannot be tested anywhere but a browser, and this project has spent three
// sittings on defects that only a browser could see. Snapshot and restore is
// ordinary data transformation, so selftest can hold it. That testability was
// the argument for this fix direction, and putting the logic here is what
// makes the argument true rather than merely stated.
//
// THE DRAFT IS THE RAW FORM, NOT readForm()'s OUTPUT. readForm() normalizes
// domains (lowercase, dedupe, sort) and drops blank rows, because it produces
// something fit to SAVE. A draft is a half-finished edit: someone typing
// "EXAMPLE.c" must get "EXAMPLE.c" back, not "example.c", and an empty row
// they just added must still be there. Restoring normalized text would rewrite
// the user's typing mid-edit — a smaller version of the same defect this file
// exists to fix.

/** Bumped only if the stored shape changes incompatibly. */
export const DRAFT_VERSION = 1;

/**
 * Snapshot raw form state.
 *
 * @param {object} form
 * @param {number|null} form.editingProfileId  null for a new profile
 * @param {string} form.name                   raw, untrimmed
 * @param {string} form.domains                raw comma-separated string
 * @param {Array<{name: string, side: string, operation: string, value: string}>} form.rows
 *        every row as it stands, blanks included
 * @returns {object} draft
 */
export function formToDraft({ editingProfileId, name, domains, rows }) {
  return {
    version: DRAFT_VERSION,
    editingProfileId: editingProfileId ?? null,
    name: String(name ?? ""),
    domains: String(domains ?? ""),
    rows: (rows || []).map((r) => ({
      name: String(r.name ?? ""),
      side: String(r.side ?? "request"),
      operation: String(r.operation ?? "set"),
      value: String(r.value ?? ""),
    })),
  };
}

/**
 * Is this object a draft this build can restore?
 *
 * REJECTS RATHER THAN REPAIRS. A draft that fails this check is discarded and
 * the user sees their saved profile — the state they would have had before
 * this feature existed. Half-restoring a malformed draft would put unexplained
 * text in a form the user is about to save, which is worse than the loss it
 * was meant to prevent.
 */
export function isValidDraft(draft) {
  if (!draft || typeof draft !== "object") return false;
  if (draft.version !== DRAFT_VERSION) return false;
  if (typeof draft.name !== "string") return false;
  if (typeof draft.domains !== "string") return false;
  if (draft.editingProfileId !== null && typeof draft.editingProfileId !== "number") {
    return false;
  }
  if (!Array.isArray(draft.rows)) return false;
  return draft.rows.every(
    (r) =>
      r &&
      typeof r === "object" &&
      typeof r.name === "string" &&
      typeof r.side === "string" &&
      typeof r.operation === "string" &&
      typeof r.value === "string"
  );
}

/**
 * The form state to paint back. Returns null for anything unrestorable, so
 * callers have one branch rather than two.
 */
export function draftToForm(draft) {
  if (!isValidDraft(draft)) return null;
  return {
    editingProfileId: draft.editingProfileId,
    name: draft.name,
    domains: draft.domains,
    rows: draft.rows.map((r) => ({
      name: r.name,
      side: r.side,
      operation: r.operation,
      value: r.value,
    })),
  };
}

/**
 * Does this draft differ from the saved profile it belongs to?
 *
 * Used to decide whether a card carries the unsaved marker. A draft that
 * matches what is already stored is not unsaved work and should not nag —
 * opening the editor and closing it again must not leave a marker behind.
 *
 * COMPARES THE FORM SHAPE, NOT THE STORED SHAPE. The saved profile is
 * projected into raw-form terms first, because that is the only way the two
 * are comparable: `domains` is an array in storage and a string in the form,
 * and the request side is written as ABSENCE in storage but always carries a
 * value in the form. Comparing the stored shapes directly would report a
 * difference for every profile the moment the editor opened.
 */
export function draftDiffersFromProfile(draft, profile, sideOf) {
  const form = draftToForm(draft);
  if (!form) return false;
  const saved = profileToFormShape(profile, sideOf);
  if (form.name !== saved.name) return true;
  if (form.domains !== saved.domains) return true;
  if (form.rows.length !== saved.rows.length) return true;
  return form.rows.some((r, i) => {
    const s = saved.rows[i];
    return (
      r.name !== s.name ||
      r.side !== s.side ||
      r.operation !== s.operation ||
      r.value !== s.value
    );
  });
}

/**
 * Project a stored profile into the raw-form shape openEditor() would paint.
 *
 * `sideOf` is INJECTED rather than imported so this module stays free of the
 * canonical/profile chain and so the sideless-means-request rule has exactly
 * one definition (lib/canonical.js). A second copy here would be a second
 * place for it to drift, and it would drift in the direction of changing what
 * a user's saved configuration means — the same reasoning addHeaderRow()
 * already carries.
 */
export function profileToFormShape(profile, sideOf) {
  if (!profile) {
    return { editingProfileId: null, name: "", domains: "", rows: [blankRow()] };
  }
  const headers = profile.headers?.length ? profile.headers : [null];
  return {
    editingProfileId: profile.id ?? null,
    name: profile.name ?? "",
    domains: (profile.domains || []).join(", "),
    rows: headers.map((entry) =>
      entry
        ? {
            name: entry.name ?? "",
            side: sideOf(entry),
            operation: entry.operation ?? "set",
            value: entry.value ?? "",
          }
        : blankRow()
    ),
  };
}

function blankRow() {
  return { name: "", side: "request", operation: "set", value: "" };
}
