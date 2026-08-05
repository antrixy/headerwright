// queue.js
// Pure: serialize async calls so a later one never overlaps an earlier one.
// No chrome.* — sw.js supplies the task.
//
// Why this file exists (finding 5, v0.1.1): syncRules() is reachable from
// onInstalled, onStartup, storage.onChanged, permissions.onAdded and
// permissions.onRemoved, and nothing stopped two runs overlapping. Each run
// snapshots the existing dynamic rules, then clears and replaces them with
// its own view. Two overlapping runs therefore compute removeRuleIds from the
// SAME snapshot, and the second tries to add a rule id the first already
// added — observed on 2026-08-04 on the shipped v0.1.0 build as
// "Rule with id 3 does not have a unique ID" during an ordinary profile save.
//
// SCOPE OF THE OBSERVED PROBLEM, recorded honestly: because
// updateDynamicRules() is atomic, the losing run failed ENTIRELY and changed
// nothing, and the winning run had already registered the correct state. The
// header applied correctly on the wire. So what was observed is a spurious
// failure, not a misapplication. The theorised worse case — an older snapshot
// SUCCEEDING last and reinstating stale rules — has NOT been reproduced.
//
// It is worth fixing anyway, and the reason is v0.1.1 specific: the new
// failure badge only earns trust if it lights up when something is genuinely
// wrong. A known-benign race that trips it devalues the signal immediately.

/**
 * Returns a function that runs `task` such that calls never overlap. Each
 * call waits for all previously queued calls to settle, in order.
 *
 * Failures do not poison the chain: a rejected run is caught here so the next
 * queued call still runs. The caller's own error handling is unaffected —
 * the returned promise still settles with the task's outcome.
 */
export function createSerialQueue(task, onError) {
  let tail = Promise.resolve();

  return function enqueue(...args) {
    const run = tail.then(() => task(...args));
    // Keep the chain alive regardless of how this run ends.
    tail = run.catch((err) => {
      if (onError) onError(err);
    });
    return tail;
  };
}
