// status.js
// Pure: sync state -> what the badge and status line should say. No chrome.*
// calls, so the honesty logic is Node-testable and the chrome.action call
// stays a thin wrapper around it.
//
// Why this file exists (finding 4, NARROW half, v0.1.1): syncRules() awaited
// updateDynamicRules() with no catch. On failure the promise rejected
// unhandled, the popup never learned, and the badge kept showing ON while
// nothing was registered. That is a false assertion, and REMOVING a false
// assertion is a fix.
//
// What is deliberately NOT here, because it is new signal and new signal is a
// feature that belongs in its own minor: activeRuleCount, skippedProfileIds,
// syncedAt, and the four-state paused / enabled-no-active-rules / active /
// failed scheme. This file knows two things only: is the toggle on, and did
// the last registration succeed.

// WHAT CHANGED IN v0.2.0 (HW-V7-04). The note above said the four-state scheme
// was "new signal ... that belongs in its own minor". This is that minor, and
// external review established that two booleans were not merely thin but
// actively FALSE in two directions:
//
//   1. After a failed atomic update, "not applying" is wrong. Chrome documents
//      that a failed updateDynamicRules() changes nothing, so the PREVIOUS
//      rules are still registered and still applying. The instrument reported
//      the opposite of the truth in the case where a user most needs it.
//
//   2. After a SUCCESSFUL update, "applying" overstates the result whenever
//      profiles were skipped — ungranted, invalid id, duplicate id, colliding,
//      or empty after header filtering. A successful zero-rule update produced
//      {ok:true}, badge ON, and "applying".
//
// Five states is the smallest model that can make truthful claims. More signal
// is the cost; being able to say what is actually true is what it buys.

export const BADGE_ON = { text: "ON", color: "#1a7f37" };
export const BADGE_OFF = { text: "OFF", color: "#6e7781" };
export const BADGE_FAILED = { text: "!", color: "#b3261e" };
export const BADGE_PARTIAL = { text: "!", color: "#9a6700" };
export const BADGE_STALE = { text: "\u2026", color: "#6e7781" };

export const SYNC_SCHEMA_VERSION = 2;

/**
 * Default when nothing has been persisted yet — a fresh install before the
 * first sync has run. Absence of a result is not a failure, so this must not
 * claim one; the first real sync overwrites it either way.
 */
export const DEFAULT_SYNC_STATE = {
  schemaVersion: SYNC_SCHEMA_VERSION,
  state: "paused",
  desiredRevision: null,
  appliedRevision: null,
  activeRuleCount: 0,
  skipped: [],
  dropped: [],
  error: null,
};

/**
 * Read a persisted record written by ANY shipped version.
 *
 * v0.1.x wrote `{ok, error}` and installs upgrading to v0.2.0 still hold one.
 * Reading it as a v2 record would report `state: undefined` and render
 * nothing, so the shape is migrated ON READ — there is no migration moment for
 * a record the worker may not rewrite until something changes.
 *
 * THE MIGRATED RECORD IS DELIBERATELY UNAMBITIOUS. An old {ok:true} says the
 * last call succeeded and nothing else: not how many rules are live, not
 * whether anything was skipped. Inventing an activeRuleCount would be the
 * class of defect this change exists to remove, so it stays 0 and the revision
 * stays null — which reads as "stale" until the next real sync, and that is
 * the honest answer.
 */
export function readSyncRecord(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_SYNC_STATE };
  }
  if (raw.schemaVersion === SYNC_SCHEMA_VERSION) {
    return {
      ...DEFAULT_SYNC_STATE,
      ...raw,
      skipped: Array.isArray(raw.skipped) ? raw.skipped : [],
      dropped: Array.isArray(raw.dropped) ? raw.dropped : [],
    };
  }
  return {
    ...DEFAULT_SYNC_STATE,
    state: raw.ok === false ? "failed" : "paused",
    error: typeof raw.error === "string" ? raw.error : null,
  };
}

/**
 * Classify a reconciliation result.
 *
 * `desiredRevision` is what the caller wants applied RIGHT NOW, computed from
 * the configuration it just read. `record.desiredRevision` is what the worker
 * last tried. When they disagree, no persisted result describes the current
 * configuration, and the only honest answer is that we do not know yet.
 *
 *   stale    no result corresponds to the current configuration
 *   failed   the attempt did not apply; PREVIOUS rules may still be live
 *   paused   the toggle is off and the clear succeeded
 *   partial  the update succeeded and some profiles did not make it
 *   applied  the update succeeded and everything configured is live
 */
export function classify({ enabled, desiredRevision, record }) {
  const r = record ?? DEFAULT_SYNC_STATE;

  // FAILURE OUTRANKS THE TOGGLE, and this precedence predates v0.2.0. When the
  // toggle is switched off, the sync that runs is the one CLEARING the rules.
  // If that call failed, the previous rules may still be applying, so OFF is
  // exactly as false a statement as ON would be.
  if (r.state === "failed") return "failed";

  // Checked AFTER failure: a known failure describes reality better than "we
  // do not know", even when the configuration has since changed.
  if (
    desiredRevision !== null &&
    desiredRevision !== undefined &&
    r.desiredRevision !== desiredRevision
  ) {
    return "stale";
  }

  if (!enabled) return "paused";
  if ((r.skipped?.length ?? 0) > 0 || (r.dropped?.length ?? 0) > 0) {
    return "partial";
  }
  return "applied";
}

export function computeBadge({ enabled, desiredRevision, record }) {
  switch (classify({ enabled, desiredRevision, record })) {
    case "failed": return BADGE_FAILED;
    case "stale": return BADGE_STALE;
    case "partial": return BADGE_PARTIAL;
    case "paused": return BADGE_OFF;
    default: return BADGE_ON;
  }
}

/**
 * The status line's third segment. Phrased so it never presents a stale
 * last-known-good state as current, and never claims a scope it cannot
 * support.
 */
export function describeSync({ enabled, desiredRevision, record }) {
  const r = record ?? DEFAULT_SYNC_STATE;
  const state = classify({ enabled, desiredRevision, record });

  if (state === "failed") {
    // NOT "not applying". Chrome leaves the previous rules registered when an
    // atomic update fails, so rules from before the failure may still be
    // modifying traffic. Telling a user nothing is applying, when something
    // may be, is the more dangerous of the two errors.
    return "sync failed \u2014 previous rules may still be applying";
  }
  if (state === "stale") {
    return "checking \u2014 no result yet for the current configuration";
  }
  if (state === "paused") return "paused";

  const notApplied = (r.skipped?.length ?? 0) + (r.dropped?.length ?? 0);
  if (state === "partial") {
    return `applying ${r.activeRuleCount ?? 0} \u00b7 ${notApplied} not applied`;
  }
  // A successful update with nothing to register is not "applying". There is
  // nothing to apply, and saying otherwise is the overstatement review found.
  if ((r.activeRuleCount ?? 0) === 0) return "nothing to apply";
  return `applying ${r.activeRuleCount}`;
}

/**
 * Stable identity for a configuration, so a status record can be tied to the
 * configuration it describes.
 *
 * NOT A STORAGE MIGRATION, deliberately. The reviewed proposal was a single
 * hw:config envelope carrying a revision counter — cleaner, and a larger change
 * than this slice should make. A content hash needs no writer coordination and
 * no migration: the worker and the popup decode the same storage through the
 * same module, so they compute the same value without agreeing on anything
 * else. That is a direct dividend of the HW-V7-01 convergence.
 *
 * FNV-1a over profile identity and the toggle. A collision would mean a stale
 * record read as current; the cost is a status line that lags by one sync, not
 * a wrong rule on the wire.
 */
export function configRevision(profiles, enabled) {
  const parts = [enabled ? "on" : "off"];
  for (const profile of profiles ?? []) {
    parts.push(
      `${profile.id}:${profile.name}:${(profile.domains ?? []).join(",")}:` +
        (profile.headers ?? [])
          .map((h) => `${h.side ?? "request"}|${h.name}|${h.operation}|${h.value ?? ""}`)
          .join(";")
    );
  }
  const text = parts.join("\u0000");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
