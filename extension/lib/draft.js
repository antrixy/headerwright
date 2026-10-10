// draft.js
// Pure: the edit form's RAW contents as a storable draft and back, which
// stored draft belongs to which editor, and the one ordered path every draft
// read and write takes. No chrome.* — popup.js supplies the DOM reads and the
// chrome.storage.session calls.
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
//
// AR-02 (s3, v0.2.3), FINDING-048. A draft was keyed by its profile's id, and
// a profile's id is its DNR rule id: reused lowest-free, and rewritten by
// every import. rules.js says it plainly — ids are identity within one profile
// set and one export file, nothing wider — and drafts outlive the set. They
// survived Delete and Replace and attached to whatever next held the id, and a
// restored draft bound its editor to the profile stored at that moment, so it
// could be saved over a profile it was never written for. Now a draft carries
// the digest of the version it was written against (AR-01b's draft half), is
// used only by the editor its key and its own id agree on, and binds that
// editor to its own base. Delete purges a profile's draft, Replace keeps only
// the drafts whose profile it imports unchanged, and every draft read and
// write goes through one queue.
//
// DR-02 (s5, v0.2.4), FINDING-051. The drafts map has a budget (budget.js),
// and a draft over it is not written: the stored one stays, and the store
// says so, so the editor can show it. A write the browser refused used to
// leave nothing on screen.

import { VALID_OPERATIONS, VALID_SIDES } from "./rules.js";
import { createSerialQueue } from "./queue.js";

/**
 * Bumped only if the stored shape changes incompatibly. 2 adds `baseDigest`
 * (AR-02). A version 1 draft is refused, not migrated: session storage is
 * cleared when the extension is updated or reloaded, so none can reach this
 * build.
 */
export const DRAFT_VERSION = 2;

/**
 * What a draft write resolves when the draft was NOT stored because the map
 * would go over its budget (DR-02). A symbol, so no stored value or boolean
 * can be mistaken for it. The popup treats a write the browser rejected the
 * same way: either way the edit on screen is not kept.
 */
export const DRAFT_NOT_KEPT = Symbol("draft not kept");

/**
 * The storage key of a profile's draft: the id as a string, or "new" for a
 * profile not saved yet.
 *
 * KEYED BY PROFILE, NOT ONE AT A TIME. The first design kept a single draft
 * and prompted when the user opened a different profile — which makes the
 * popup ask a question in order to throw work away, which is the defect
 * wearing a hat. A map has no destructive case at all, costs a few bytes of
 * session storage, and removes the prompt rather than writing one.
 *
 * THE KEY IS A SLOT, NOT AN IDENTITY (AR-02). Ids are reused, so a draft is
 * used only when its own editingProfileId agrees with its key and with the
 * profile being opened: see draftFor().
 *
 * A "new" draft gets no card marker because there is no card yet; it is
 * restored when the user next presses Add profile. A known limit, stated
 * rather than solved: a marker for a profile that does not exist would have to
 * live in the list header, a bigger change than FINDING-042 warranted.
 */
export function draftKeyFor(profileId) {
  return profileId === null || profileId === undefined ? "new" : String(profileId);
}

/**
 * Snapshot raw form state.
 *
 * @param {object} form
 * @param {number|null} form.editingProfileId  null for a new profile
 * @param {string|null} form.baseDigest        the digest the editor is bound
 *        to: the profile version this edit started from (AR-02). null for a
 *        new profile.
 * @param {string} form.name                   raw, untrimmed
 * @param {string} form.domains                raw comma-separated string
 * @param {Array<{name: string, side: string, operation: string, value: string}>} form.rows
 *        every row as it stands, blanks included
 * @returns {object} draft
 */
export function formToDraft({ editingProfileId, baseDigest, name, domains, rows }) {
  return {
    version: DRAFT_VERSION,
    editingProfileId: editingProfileId ?? null,
    baseDigest: baseDigest ?? null,
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
 *
 * AR-02. A draft for a saved profile must carry the base it was written
 * against, and a new-profile draft must carry none. Every row's side and
 * operation must be one the form can show: the validator's own sets, imported
 * rather than copied. A row outside them used to be accepted and then painted
 * as whichever option came first — "set" for an operation it did not know —
 * which is FINDING-040's shape arriving from storage instead of from typing.
 * The digest's format is not checked here: checkEditBase() fails closed on
 * anything that is not an exact match.
 */
export function isValidDraft(draft) {
  if (!draft || typeof draft !== "object") return false;
  if (draft.version !== DRAFT_VERSION) return false;
  if (typeof draft.name !== "string") return false;
  if (typeof draft.domains !== "string") return false;
  if (draft.editingProfileId === null) {
    if (draft.baseDigest !== null) return false;
  } else {
    if (typeof draft.editingProfileId !== "number") return false;
    if (typeof draft.baseDigest !== "string") return false;
  }
  if (!Array.isArray(draft.rows)) return false;
  return draft.rows.every(
    (r) =>
      r &&
      typeof r === "object" &&
      typeof r.name === "string" &&
      VALID_SIDES.has(r.side) &&
      VALID_OPERATIONS.has(r.operation) &&
      typeof r.value === "string"
  );
}

/**
 * The form state to paint back, with the base the editor binds to. Returns
 * null for anything unrestorable, so callers have one branch rather than two.
 */
export function draftToForm(draft) {
  if (!isValidDraft(draft)) return null;
  return {
    editingProfileId: draft.editingProfileId,
    baseDigest: draft.baseDigest,
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
 * The draft that belongs to the editor for `profileId` (null for a new
 * profile), or null.
 *
 * AR-02. The key finds the slot; the draft must also be valid and name the
 * same profile itself. A draft stored under another profile's key is not this
 * profile's work, whatever the key says.
 */
export function draftFor(drafts, profileId) {
  const id = profileId ?? null;
  const draft = drafts && typeof drafts === "object" ? drafts[draftKeyFor(id)] : undefined;
  if (!isValidDraft(draft)) return null;
  return draft.editingProfileId === id ? draft : null;
}

/**
 * The base an editor binds to when it opens: the digest a Save must still
 * find stored (AR-01b).
 *
 * A RESTORED DRAFT BRINGS ITS OWN BASE (AR-02, AR-01b's draft half): the
 * version it was written against, not the profile as stored now. A draft that
 * outlived another writer's edit, or an id reused by a new profile, is then
 * refused at Save as "changed" instead of being saved over something it was
 * never written for. With no draft, the base is the profile shown. `digestOf`
 * is passed in (canonical.js's profileDigest), so this module stays off the
 * canonical chain.
 */
export async function baseForEditor(restored, profile, digestOf) {
  if (restored) return restored.baseDigest;
  return profile ? digestOf(profile) : null;
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
 * `sideOf` is INJECTED rather than imported so that the sideless-means-request
 * rule has exactly one definition, sideOf() in lib/collisions.js, and every
 * caller shows that it depends on it. A second copy here would be a second
 * place for it to drift, and it would drift in the direction of changing what
 * a user's saved configuration means — the same reasoning addHeaderRow()
 * already carries. (Since AR-02 this module imports the side and operation
 * sets from rules.js, which itself imports collisions.js, so the injection is
 * no longer what keeps this module off that chain. It stays, deliberately,
 * because it makes the dependency visible at each call.)
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

/**
 * The drafts that survive an import (AR-02, ruled S3-D3): a new map holding
 * only
 *   - the valid new-profile draft, and
 *   - each valid draft stored under its own key whose profile the imported
 *     set holds UNCHANGED: same id, and a digest equal to the draft's base.
 *
 * Replace is a confirmed choice to swap the whole configuration, so a draft
 * written against a profile the file replaced has nothing left to be saved
 * into. A draft whose profile came through unchanged is still exactly the
 * edit it was, and keeps its marker. FAILS CLOSED: a profile that cannot be
 * digested drops its draft, and nothing throws. The map passed in is not
 * mutated.
 */
export async function retainDraftsFor(drafts, profiles, digestOf) {
  const byId = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const kept = {};
  for (const [key, draft] of Object.entries(drafts || {})) {
    if (!isValidDraft(draft) || key !== draftKeyFor(draft.editingProfileId)) continue;
    if (draft.editingProfileId === null) {
      kept[key] = draft;
      continue;
    }
    const profile = byId.get(draft.editingProfileId);
    if (!profile) continue;
    let digest;
    try {
      digest = await digestOf(profile);
    } catch {
      continue;
    }
    if (digest === draft.baseDigest) kept[key] = draft;
  }
  return kept;
}

/**
 * The one path to the stored drafts map (AR-02, ruled S3-D4). `read` returns
 * whatever is stored under the drafts key; `write` stores a whole map; `fits`,
 * optional, says whether a whole map may be stored (DR-02).
 *
 * EVERY CALL GOES THROUGH ONE QUEUE. A draft write is a read-modify-write of
 * the whole map, and the popup issues them from input events without waiting.
 * Unserialized, two of them read the same map and the second write loses the
 * first, and a write issued while a drop was running wrote the dropped draft
 * back — both reproduced against the code this replaced. Queued, no call
 * overlaps another and each sees the ones before it, whatever order the
 * platform answers in; chrome.storage documents no ordering of its own.
 *
 * A READ THAT FAILS FAILS THE CALL, and nothing is written. The old write path
 * treated a failed read as an empty map and wrote that back, which would have
 * erased every other profile's draft. Each call's promise settles with its own
 * outcome, and a failure does not block the next call.
 *
 * THE WHOLE MAP IS BUDGETED, NOT THE DRAFT BEING WRITTEN (DR-02). put() sets
 * the draft into the map it read and asks `fits` about that map, so other
 * profiles' drafts count. A map that does not fit is not written, the stored
 * draft stays as it was, and put() resolves DRAFT_NOT_KEPT; one that fits is
 * written and put() resolves true. Without `fits`, every draft is written.
 */
export function createDraftStore({ read, write, fits }) {
  const run = createSerialQueue((operation) => operation());
  const load = async () => {
    const stored = await read();
    return stored && typeof stored === "object" && !Array.isArray(stored) ? { ...stored } : {};
  };
  return {
    read() {
      return run(load);
    },
    put(key, draft) {
      return run(async () => {
        const drafts = await load();
        drafts[key] = draft;
        if (fits && !fits(drafts)) return DRAFT_NOT_KEPT;
        await write(drafts);
        return true;
      });
    },
    // Resolves whether it wrote. Dropping a draft that is not there writes
    // nothing, so Cancel on an untouched editor costs no storage write.
    drop(key) {
      return run(async () => {
        const drafts = await load();
        if (!(key in drafts)) return false;
        delete drafts[key];
        await write(drafts);
        return true;
      });
    },
    // Applies retainDraftsFor() inside the queue and resolves the keys it
    // removed. Writes only when something was removed.
    rebase(profiles, digestOf) {
      return run(async () => {
        const drafts = await load();
        const kept = await retainDraftsFor(drafts, profiles, digestOf);
        const removed = Object.keys(drafts).filter((key) => !(key in kept));
        if (removed.length === 0) return removed;
        await write(kept);
        return removed;
      });
    },
  };
}

/**
 * The editor's writes to one draft (AR-02, ruled S3-D4).
 *
 * open() binds the session to a profile's key. put() writes through the store
 * while it is open and resolves what the store resolved (true, or
 * DRAFT_NOT_KEPT for a draft over the budget), and resolves false, touching
 * nothing, once it has ended.
 * end() CLOSES THE SESSION SYNCHRONOUSLY, then issues the drop. Save, Cancel
 * and Revert to saved end it, so a keystroke that arrives while the drop is in
 * flight is refused rather than written back, and every write issued before
 * the end is already queued ahead of the drop, so the drop is last.
 */
export function createDraftSession(store) {
  let key = null;
  return {
    open(profileId) {
      key = draftKeyFor(profileId);
    },
    put(draft) {
      if (key === null) return Promise.resolve(false);
      return store.put(key, draft);
    },
    end() {
      const ending = key;
      key = null;
      return ending === null ? Promise.resolve(false) : store.drop(ending);
    },
  };
}
