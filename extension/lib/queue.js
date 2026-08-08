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

/**
 * Returns a function that defers `task` by `waitMs`, restarting the timer on
 * every call, so a burst collapses into ONE trailing run with the last
 * arguments.
 *
 * Why this exists (finding 8, v0.1.2): the popup renders once on open and
 * never re-reads storage, so a sync failure arriving after the render leaves
 * the status line reading "applying" while the toolbar badge is already red.
 * The fix is a chrome.storage.onChanged listener that re-renders — but
 * renderList() calls chrome.permissions.contains() once PER CHIP, and at the
 * 5,000-profile ceiling that is ~5,000 permission checks per render (observed
 * 2026-08-05). A naive listener fires that burst on every storage write, and
 * an ordinary save writes hw:profiles and then hw:sync back to back. So
 * debouncing is load-bearing here rather than a nicety.
 *
 * Trailing edge, not leading: the point is to render the SETTLED state after a
 * burst, and a leading-edge call would render the state mid-burst and then
 * have nothing scheduled to correct it.
 *
 * Rejections are routed to onError for the same reason createSerialQueue does
 * it — an async task scheduled from a timer has no caller left to await it, so
 * an unhandled rejection is the default outcome otherwise.
 */
export function createDebounced(task, waitMs, onError) {
  let timer = null;

  return function schedule(...args) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        const result = task(...args);
        if (result && typeof result.then === "function") {
          result.catch((err) => {
            if (onError) onError(err);
          });
        }
      } catch (err) {
        if (onError) onError(err);
      }
    }, waitMs);
  };
}
