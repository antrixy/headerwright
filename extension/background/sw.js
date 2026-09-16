// sw.js — HeaderWright service worker.
// Owns declarativeNetRequest dynamic rule sync. Reacts to storage changes
// rather than being told what to do by popup.js directly: chrome.storage
// is the single source of truth, so any context (popup, future options
// page) only ever needs to write to storage, never message this worker.

import {
  profileToRule,
  normalizeDomains,
  validateHeaderEntry,
  isValidRuleId,
  MAX_UNSAFE_DYNAMIC_RULES,
} from "../lib/rules.js";
import {
  originsForDomain,
  staleManagedOrigins,
} from "../lib/grants.js";
import {
  findCollisions,
  collidingProfileIds,
} from "../lib/collisions.js";
import {
  computeBadge,
  configRevision,
  readSyncRecord,
  SYNC_SCHEMA_VERSION,
} from "../lib/status.js";
import { createSerialQueue } from "../lib/queue.js";
import { decodeStoredState } from "../lib/stored.js";

const STORAGE_KEY_PROFILES = "hw:profiles";
const STORAGE_KEY_ENABLED = "hw:enabled";
const STORAGE_KEY_SYNC = "hw:sync";

// Domains are normalized on read here for the same reason popup.js does it:
// profiles written by v0.1.1 and earlier can hold duplicates (finding 7), and
// an unnormalized list reaches DNR's requestDomains verbatim and is also
// checked once per duplicate by grantedDomainsFor(). Both write paths store a
// normalized set now, so this only covers what is already on disk.
// decodeStoredState lives in lib/stored.js so the suite can exercise it with
// real malformed inputs instead of scanning this file for its shape.
async function getStoredState() {
  return decodeStoredState(
    await chrome.storage.local.get([STORAGE_KEY_PROFILES, STORAGE_KEY_ENABLED]),
    { profiles: STORAGE_KEY_PROFILES, enabled: STORAGE_KEY_ENABLED }
  );
}

// A profile's domain is only used in a rule if currently granted — a rule
// registered for an ungranted domain matches in testMatchOutcome and then
// silently no-ops on real traffic, which is the worst combination: the
// oracle says yes and the wire says nothing. Checked per-domain via
// chrome.permissions.contains rather than hand-rolling origin-pattern
// matching against chrome.permissions.getAll().
//
// contains() is ALL-of, and originsForDomain() now returns the apex pattern
// AND the subdomain pattern (finding 18). That strictness is the fix: a
// domain holding only the v0.1.3-era apex grant reports ungranted, its rule
// is skipped, and the popup chip renders as a grant button. The alternative
// — treating the apex grant as good enough — is what shipped for three
// releases and is exactly the state where DNR matches api.example.com and
// the wire shows nothing.
async function grantedDomainsFor(domains) {
  const checks = await Promise.all(
    (domains || []).map(async (domain) => {
      const granted = await chrome.permissions.contains({
        origins: originsForDomain(domain),
      });
      return granted ? domain : null;
    })
  );
  return checks.filter((d) => d !== null);
}

async function buildRules(profiles) {
  const rules = [];
  const skippedProfileIds = [];

  // Grant state is resolved for every profile FIRST, because the collision
  // question at this call site is "would two rules actually both register",
  // which is a question about GRANTED domains rather than configured ones.
  // popup.js asks the other question with the same predicate — see the
  // two-inputs note in lib/collisions.js.
  const resolved = [];
  for (const profile of profiles) {
    resolved.push({
      profile,
      grantedDomains: await grantedDomainsFor(profile.domains),
    });
  }

  // ELIGIBILITY IS DECIDED BEFORE COLLISIONS, AND THE ORDER IS THE POINT.
  // Until v0.2.0 findCollisions() was fed every resolved profile, including
  // ones that could never register. A profile with an id Chrome rejects, or an
  // id shared with another profile, would collide with a perfectly valid
  // profile and BOTH would be skipped — so a junk record in storage silently
  // suppressed a working rule, and the refusal it triggered protected against
  // nothing, because the junk profile was never going to register anyway.
  // Reproduced 2026-09-13 from external review; a profile with id "junk"
  // knocked out profile 1.
  //
  // The v0.2.0 rule-id fix made this SHARPER rather than causing it: before
  // that fix the junk profile did register, and took the whole atomic update
  // down instead. Both outcomes are wrong; this ordering is what makes the
  // collision question mean "would two rules ACTUALLY both register", which is
  // what the note in lib/collisions.js already claimed it meant.
  //
  // Ineligible profiles are still SKIPPED and still reported — they are absent
  // from the collision input, not from the accounting.
  // DUPLICATE IDS FAIL THE ATOMIC CALL THE SAME WAY AN INVALID ONE DOES, by a
  // different mechanism: two rules sharing an id is the exact error observed
  // on 2026-08-04 that produced queue.js — "Rule with id 3 does not have a
  // unique ID". There the cause was two overlapping SYNC RUNS; here it is two
  // profiles inside ONE run, which the queue cannot help with.
  //
  // Only reachable through direct storage manipulation — parseProfilesFile()
  // refuses duplicate ids on import and nextProfileId() cannot generate one —
  // which is the same untrusted-storage argument that keeps the over-cap
  // branch below rather than deleting it as unreachable.
  const idCounts = new Map();
  for (const { profile } of resolved) {
    idCounts.set(profile.id, (idCounts.get(profile.id) || 0) + 1);
  }
  const duplicateIds = new Set(
    [...idCounts].filter(([, count]) => count > 1).map(([id]) => id)
  );
  if (duplicateIds.size > 0) {
    console.warn(
      `HeaderWright: ${duplicateIds.size} profile id(s) used more than once — ` +
        `all profiles holding them are not applied: ` +
        [...duplicateIds].join(", ")
    );
  }

  const ineligible = new Set();
  for (const { profile } of resolved) {
    if (!isValidRuleId(profile.id) || duplicateIds.has(profile.id)) {
      ineligible.add(profile);
      skippedProfileIds.push(profile.id);
    }
  }
  const eligible = resolved.filter(({ profile }) => !ineligible.has(profile));

  // FINDING-021. This half is the one that reaches an EXISTING install, and it
  // is why the write-path refusals in popup.js and canonical.js are not
  // sufficient on their own. FINDING-018 enlarged the collision surface —
  // profiles on example.com and api.example.com did not overlap before
  // subdomain matching and do now — so there are v0.1.4 installs already
  // holding a colliding pair, created by a fix that shipped. No write is
  // happening in those installs, so no write-time check can see them.
  const collisions = findCollisions(
    eligible.map(({ profile, grantedDomains }) => ({
      id: profile.id,
      domains: grantedDomains,
      headers: profile.headers,
    })),
    (entry) => validateHeaderEntry(entry).valid
  );
  const colliding = collidingProfileIds(collisions);

  if (colliding.size > 0) {
    // The popup carries the user-facing account of this, per profile. This
    // line exists for the same reason the truncation warning does: if it ever
    // appears without the popup showing markers, the two surfaces disagree and
    // that is worth knowing.
    console.warn(
      `HeaderWright: ${colliding.size} profile${colliding.size === 1 ? "" : "s"} ` +
        `not applied — overlapping domains write the same header with no ` +
        `defined winner (FINDING-021): ` +
        collisions
          .map((c) => `${c.header} [${c.profileIds.join(", ")}]`)
          .join("; ")
    );
  }

  for (const { profile, grantedDomains } of eligible) {
    // Ineligible profiles were skipped and accounted for above, before the
    // collision input was built.
    // BOTH sides are skipped, never one. Registering either would be picking a
    // winner by another name, which is the thing this release refuses to do.
    if (colliding.has(profile.id)) {
      skippedProfileIds.push(profile.id);
      continue;
    }
    const rule = profileToRule(profile, grantedDomains);
    if (rule) {
      rules.push(rule);
    } else {
      skippedProfileIds.push(profile.id);
    }
  }

  // RETAINED DELIBERATELY, AND NOW UNREACHABLE THROUGH THE UI. As of v0.1.2
  // parseProfilesFile() refuses an over-cap import outright (finding 6), and
  // the form adds one profile at a time, so nothing the user can do should
  // reach this branch. It stays because storage is untrusted input — the same
  // reasoning as acceptance criterion A2, and the same shape as finding 3's
  // validator, whose defence-in-depth defeated the first attempt to inject a
  // failure for finding 4. If this warning ever appears in the service worker
  // console, something wrote to storage that did not come through import or
  // the form, and that is worth knowing rather than silently surviving.
  if (rules.length > MAX_UNSAFE_DYNAMIC_RULES) {
    console.warn(
      `HeaderWright: ${rules.length} profiles would produce more rules ` +
        `than the ${MAX_UNSAFE_DYNAMIC_RULES}-rule unsafe dynamic rule ` +
        `cap. Truncating to the first ${MAX_UNSAFE_DYNAMIC_RULES}.`
    );
    rules.length = MAX_UNSAFE_DYNAMIC_RULES;
  }

  return { rules, skippedProfileIds };
}

// Badge text and colour are decided in lib/status.js so the honesty rule is
// testable without a browser. This function is only the chrome.* call, and it
// swallows its own errors: a failure to paint the badge must not become
// another unhandled rejection.
async function updateBadge(state) {
  const { text, color } = computeBadge(state);
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch (err) {
    console.error("HeaderWright: could not update the badge —", err);
  }
}

async function runSync() {
  // READ INSIDE THE TRANSACTION. This was outside the try, so a storage read
  // or decode failure skipped the DNR update, the status write AND the badge
  // in one go — the extension went quiet rather than reporting. Anything that
  // can fail belongs where the failure is caught.
  let enabled = false;
  let syncOk = true;
  let error = null;
  // Read before the transaction so a failure can carry forward what is
  // actually registered rather than claiming nothing is.
  let previousApplied = null;
  let previousRuleCount = 0;
  try {
    const prior = readSyncRecord(
      (await chrome.storage.local.get(STORAGE_KEY_SYNC))[STORAGE_KEY_SYNC]
    );
    previousApplied = prior.appliedRevision;
    previousRuleCount = prior.activeRuleCount;
  } catch {
    // A status read failing must not stop the reconciliation it describes.
  }
  // DROPPED RECORDS MUST OUTLIVE THE CONSOLE. Previously the decoder's
  // problems went only to console.warn, so a reconciliation that silently
  // discarded a profile still wrote {ok:true}, showed a green badge and read
  // "applying". The user's configuration was partly gone with nothing durable
  // saying so.
  //
  // THIS IS NOT THE STATUS MODEL. It persists the diagnostic; it does not yet
  // make the badge or the status line distinguish applied from partial. That
  // is HW-V7-04 and is deliberately not attempted here — this slice converges
  // decoders, and widening it is how the last three reviews' defects were
  // created.
  let dropped = [];
  // THE RECONCILIATION RESULT, not two booleans. Reviewed finding HW-V7-04:
  // {ok, error} could not distinguish "applied", "applied but three profiles
  // were skipped", "failed with the PREVIOUS rules still live", or "no result
  // for this configuration yet" — and it rendered two of those as their
  // opposite.
  let skipped = [];
  let activeRuleCount = 0;
  let desiredRevision = null;

  try {
    const state = await getStoredState();
    enabled = state.enabled;

    if (state.problems.length > 0) {
      // Reported, not thrown. A corrupt record must not be able to stop the
      // rest of the reconciliation — least of all a disable.
      dropped = state.problems;
      console.warn(
        `HeaderWright: ${state.problems.length} stored configuration ` +
          `problem(s), those profiles are not applied: ` +
          state.problems.join("; ")
      );
    }

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((rule) => rule.id);

    // DISABLE CLEARS UNCONDITIONALLY. When enabled is false the profiles are
    // never consulted, so no amount of corruption in them can keep old rules
    // registered. buildRules() is only reached on the enabled path.
    // REVISION TIES THE RESULT TO THE CONFIGURATION IT DESCRIBES. Without it
    // the popup can pair new profiles with an old successful record and render
    // a stale success as current. Computed from the DECODED profiles, which is
    // the same input the popup decodes through the same module — so both
    // compute the same value without coordinating.
    desiredRevision = configRevision(state.profiles, enabled);

    const plan = enabled
      ? await buildRules(state.profiles)
      : { rules: [], skippedProfileIds: [] };
    const addRules = plan.rules;
    // skippedProfileIds was COMPUTED AND THEN DISCARDED here. Every reason a
    // profile does not apply — ungranted, invalid id, duplicate id, colliding
    // — was known at this point and thrown away, which is why a successful
    // zero-rule update could report "applying".
    skipped = plan.skippedProfileIds.map((profileId) => ({ profileId }));
    activeRuleCount = addRules.length;

    // Single atomic call — per Chrome's docs, either all specified rules are
    // added and removed, or an error is returned and nothing changes. Rule
    // validity is filtered out in buildRules()/profileToRule() before this
    // point, on purpose: one bad profile must not be able to take every other
    // profile's rules down with it.
    //
    // WHAT IS FILTERED, NAMED IN FULL, because this comment previously listed
    // three things and the list was the bug. It said append allowlist,
    // non-empty values and granted domains — and the RULE ID was not among
    // them, so an out-of-range or non-integer id in storage passed straight
    // through and failed the whole update, which is the one outcome the
    // sentence above promises cannot happen. A comment that states a guarantee
    // must enumerate what delivers it, or the gap hides behind the promise.
    // Now: append allowlist, non-empty values, granted domains, VALID RULE ID
    // (profileToRule), DUPLICATE IDS and collisions (buildRules).
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules,
    });
  } catch (err) {
    // Before v0.1.1 this rejection was unhandled: the worker logged, the
    // popup never learned, and the badge went on claiming ON with nothing
    // registered. Catching it is the fix; the state below is what lets any
    // other context find out.
    syncOk = false;
    error = err && err.message ? err.message : String(err);
    console.error("HeaderWright: rule sync failed —", error);
  }

  // Writing this key does NOT re-enter syncRules: the storage listener below
  // reacts to the profiles and enabled keys only. Worth stating plainly,
  // because a listener that matched every key would loop here forever.
  // SETTLED SEPARATELY, because they are separate reporting channels and one
  // failing must not silence the other. Previously a rejected status write
  // skipped the badge update, leaving the toolbar asserting a state nothing
  // had confirmed.
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY_SYNC]: {
        schemaVersion: SYNC_SCHEMA_VERSION,
        state: syncOk ? (enabled ? "applied" : "paused") : "failed",
        desiredRevision,
        // APPLIED REVISION IS UNCHANGED ON FAILURE, and that is the point.
        // Chrome leaves the previous rules registered when an atomic update
        // fails, so the last revision that actually reached the wire is still
        // the one that is live. Overwriting it would erase the only record of
        // what is really applying.
        appliedRevision: syncOk ? desiredRevision : previousApplied,
        activeRuleCount: syncOk ? activeRuleCount : previousRuleCount,
        skipped,
        dropped,
        error,
      },
    });
  } catch (err) {
    console.error("HeaderWright: could not record sync status —", err);
  }

  try {
    await updateBadge({
      enabled,
      desiredRevision,
      record: {
        state: syncOk ? (enabled ? "applied" : "paused") : "failed",
        desiredRevision,
        activeRuleCount,
        skipped,
        dropped,
      },
    });
  } catch (err) {
    console.error("HeaderWright: could not update the badge —", err);
  }
}

// Every entry point goes through this, never runSync directly. Overlapping
// runs compute removeRuleIds from the same snapshot and then collide on a
// rule id — see lib/queue.js for the observed case. Serializing is cheap
// insurance; it does not by itself prove the ordering hazard is gone.
const syncRules = createSerialQueue(runSync, (err) => {
  console.error("HeaderWright: queued sync threw —", err);
});

// Rebuild on install/update and on every browser startup. Dynamic rules
// are documented to persist across sessions and extension updates. The one
// case where rules were observed absent afterwards was a full remove and
// reload — an uninstall, which wipes chrome.storage.local too, so nothing
// survives it regardless of what we do here. Rebuilding is cheap and
// idempotent, so it costs nothing to always do it rather than trust
// persistence in any one case.
// Finding 19: sweep host grants no current profile asks for.
//
// diffDomainGrants() reconciles a CHANGE — it can only revoke a domain that
// was in previousProfiles. A grant left by an older release, or by an
// upgrade that changed the pattern shape, is invisible to it forever. This
// runs the same invariant against ground truth (permissions.getAll) instead
// of against a diff, so the extension establishes the invariant rather than
// merely preserving it.
//
// REVOKE ONLY, and that is not a design shortcut. permissions.request()
// requires a user gesture and there is none in a service worker, so the
// upgrade path for the new subdomain pattern CANNOT be silent: an existing
// install's domains go gray until the user clicks a chip. That is the
// honest state — those domains genuinely lack subdomain access — and the
// chip button added in finding 2 is already the recovery path.
//
// Scoped by isManagedOrigin(): a host the user granted through
// chrome://extensions -> Site access, or "*://*/*" from
// optional_host_permissions, is not this function's to take away.
async function reconcileHostGrants() {
  try {
    const { profiles } = await getStoredState();
    const { origins } = await chrome.permissions.getAll();
    const stale = staleManagedOrigins(profiles, origins);
    if (stale.length === 0) return;

    // Logged, not silent. A revoke the user did not ask for should leave a
    // trace somewhere they can find it.
    console.info(
      `HeaderWright: revoking ${stale.length} host grant(s) no profile ` +
        `references — ${stale.join(", ")}`
    );
    await chrome.permissions.remove({ origins: stale });
    // No syncRules() call needed: permissions.onRemoved fires below.
  } catch (err) {
    // A failed sweep must not take the sync with it. The invariant stays
    // broken until the next startup, which is strictly better than an
    // extension that will not start.
    console.error("HeaderWright: grant reconciliation failed —", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  reconcileHostGrants();
  syncRules();
});
chrome.runtime.onStartup.addListener(() => {
  reconcileHostGrants();
  syncRules();
});

// Single source of truth: any write to profiles or the master toggle,
// from any context, re-syncs automatically. No message passing needed
// between popup.js and this worker.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (STORAGE_KEY_PROFILES in changes || STORAGE_KEY_ENABLED in changes) {
    syncRules();
  }
});

// Symmetric pair: a newly granted permission should activate a
// previously-skipped profile's rule immediately, and a revoked one
// (e.g. via chrome://extensions → Site access, outside the extension's
// own UI) should drop its rule immediately. Storage alone doesn't cover
// this — permission grants aren't stored there.
chrome.permissions.onAdded.addListener(syncRules);
chrome.permissions.onRemoved.addListener(syncRules);
