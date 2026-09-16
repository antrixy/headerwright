// Decoding stored configuration into something safe to interpret.
//
// THIS LIVES IN lib/ SO IT CAN BE TESTED DIRECTLY. sw.js calls chrome.* at
// module scope and cannot be imported by the suite, so everything in it is
// checked by reading the source as TEXT. A source scan proves the shape of a
// fix and not its behaviour — which is how a duplicate-id check passed while
// the threshold that defined "duplicate" was free to change. A total decoder
// is exactly the kind of function that should be exercised with real inputs.
//
// Storage keys are passed in rather than imported, so this module stays
// independent of the worker's constants and the dependency runs one way.

import { normalizeDomains } from "./rules.js";
import { validateProfile } from "./profile.js";

// TOTAL: accepts anything storage can hold and never throws. The previous
// version did `(stored[KEY] || []).map(...)`, which throws on a truthy
// non-array — an object, a string, a number. Reproduced 2026-09-13 by driving
// the real storage listener with `hw:profiles` set to an object: the throw
// escaped runSync before its try block, so updateDynamicRules never ran,
// hw:sync was never written, and the badge was never refreshed.
//
// THE CASE THAT MAKES THIS SERIOUS IS DISABLE. A user switching HeaderWright
// OFF with malformed profile data kept the old dynamic rules active, with no
// surface saying so. Headers went on being modified by an extension the user
// had turned off.
//
// Malformed entries are DROPPED WITH A REASON rather than repaired. Guessing
// what a corrupt record meant is how the wrong-side defects happened; the
// skipped list is where they become visible instead.
export function decodeStoredState(stored, keys) {
  const raw = stored[keys.profiles];
  const problems = [];
  let list = [];

  if (raw === undefined || raw === null) {
    list = [];
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    // Not a list at all. Enabled state is independent and still honoured,
    // which is what lets disable clear rules from a corrupt configuration.
    problems.push(`stored profiles are ${typeof raw}, expected an array`);
  }

  // EACH PROFILE IS JUDGED INDEPENDENTLY, against the SAME rules the importer
  // and the export writer use. The previous version checked only that each
  // entry was a non-array object and that its domains normalized — so
  // `headers: {}` passed here and then threw inside headerKeysFor() and
  // profileToRule(), and because updateDynamicRules() is atomic the failure
  // left the PREVIOUS rules registered while hw:sync reported a failure. One
  // malformed nested field disabled every valid profile, in a worker whose own
  // comment promised that could not happen.
  //
  // Validation is shared rather than reimplemented: see lib/profile.js for why
  // eight local definitions of "valid profile" were the actual defect.
  const profiles = [];
  list.forEach((profile, index) => {
    const verdict = validateProfile(profile);
    if (!verdict.valid) {
      // DROPPED WITH A REASON, NEVER REPAIRED. Guessing what a corrupt record
      // meant is how the wrong-side defects happened; the problems list is
      // where it becomes visible instead.
      problems.push(`profile ${index + 1} dropped: ${verdict.reason}`);
      return;
    }
    profiles.push({ ...profile, domains: normalizeDomains(profile.domains) });
  });

  return {
    profiles,
    enabled: stored[keys.enabled] === true,
    problems,
  };
}
