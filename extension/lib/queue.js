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
 * Each call's returned promise settles with ITS OWN task's outcome: it
 * resolves with the task's value or rejects with the task's error.
 *
 * Failures do not poison the chain: the rejection is also caught on the
 * internal chain, so the next queued call still runs, and onError observes
 * every rejection whether or not the caller handles it. That catch is attached
 * to the promise the caller receives, so a call nobody awaits raises no
 * unhandled rejection; a caller that awaits it and does not handle the error
 * does. Both measured 2026-09-24.
 *
 * AR-05, fixed 2026-09-24: enqueue used to return the chain's tail, which had
 * already caught the rejection, so a failed task resolved undefined to its
 * caller. Failure was reported as success, contradicting this comment. The
 * popup's delete, save and import handlers depended on that to reach
 * reconcileGrants after a failed render; runThenAlways below replaces the
 * dependency (FINDING-046).
 */
export function createSerialQueue(task, onError) {
  let tail = Promise.resolve();

  return function enqueue(...args) {
    const run = tail.then(() => task(...args));
    // Keep the chain alive regardless of how this run ends.
    tail = run.catch((err) => {
      if (onError) onError(err);
    });
    return run;
  };
}

/**
 * Runs `first`, then runs `then` once `first` has settled, whatever `first`
 * did. Neither failure is lost: if only one step fails, the returned promise
 * rejects with that step's own error; if both fail, it rejects with an
 * AggregateError holding both, first's first.
 *
 * `then` never starts before `first` settles. In the popup, `then` is
 * reconcileGrants, which can call permissions.request(), and that can destroy
 * the popup's context, so nothing after it may be load-bearing.
 *
 * Why this exists (FINDING-046, 2026-09-24): the popup's delete, save and
 * import handlers render and then reconcile grants. While AR-05 stood, the
 * queue swallowed a render failure and reconciliation still ran. Fixing the
 * queue alone would have let a failed render skip the revoke, leaving a host
 * grant no profile uses until the worker's startup sweep.
 */
export async function runThenAlways(first, then) {
  let firstFailed = false;
  let firstError;
  try {
    await first();
  } catch (err) {
    firstFailed = true;
    firstError = err;
  }

  let thenFailed = false;
  let thenError;
  try {
    await then();
  } catch (err) {
    thenFailed = true;
    thenError = err;
  }

  if (firstFailed && thenFailed) {
    throw new AggregateError([firstError, thenError], "both steps failed");
  }
  if (firstFailed) throw firstError;
  if (thenFailed) throw thenError;
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
