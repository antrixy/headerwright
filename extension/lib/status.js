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

export const BADGE_ON = { text: "ON", color: "#1a7f37" };
export const BADGE_OFF = { text: "OFF", color: "#6e7781" };
export const BADGE_FAILED = { text: "!", color: "#b3261e" };

/**
 * Default when nothing has been persisted yet — a fresh install before the
 * first sync has run. Absence of a result is not a failure, so this must not
 * claim one; the first real sync overwrites it either way.
 */
export const DEFAULT_SYNC_STATE = { ok: true, error: null };

/**
 * FAILURE OUTRANKS THE TOGGLE. This is the non-obvious part.
 *
 * The tempting shape is "if the toggle is off, show OFF" with the failure
 * case handled only inside the enabled branch. That is wrong: when the toggle
 * is switched off, the sync that runs is the one CLEARING the dynamic rules.
 * If that call is what failed, the previous rules may still be registered and
 * still applying — so OFF is exactly as false a statement as ON would be.
 *
 * A failed sync means we do not know what is registered. Both directions get
 * the failure indicator, because the honest claim in both is "ask me again".
 */
export function computeBadge({ enabled, syncOk }) {
  if (!syncOk) return BADGE_FAILED;
  return enabled ? BADGE_ON : BADGE_OFF;
}

/**
 * The status line's third segment. Same precedence rule, same reason.
 *
 * Phrased so it never presents a stale last-known-good state as current: the
 * failure text says what is not true right now rather than what was true
 * before the failure.
 */
export function describeSync({ enabled, syncOk }) {
  if (!syncOk) return "not applying \u2014 last sync failed";
  return enabled ? "applying" : "paused";
}
