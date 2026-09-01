// sw.js — HeaderWright service worker.
// Owns declarativeNetRequest dynamic rule sync. Reacts to storage changes
// rather than being told what to do by popup.js directly: chrome.storage
// is the single source of truth, so any context (popup, future options
// page) only ever needs to write to storage, never message this worker.

import {
  profileToRule,
  normalizeDomains,
  validateHeaderEntry,
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
import { computeBadge } from "../lib/status.js";
import { createSerialQueue } from "../lib/queue.js";

const STORAGE_KEY_PROFILES = "hw:profiles";
const STORAGE_KEY_ENABLED = "hw:enabled";
const STORAGE_KEY_SYNC = "hw:sync";

// Domains are normalized on read here for the same reason popup.js does it:
// profiles written by v0.1.1 and earlier can hold duplicates (finding 7), and
// an unnormalized list reaches DNR's requestDomains verbatim and is also
// checked once per duplicate by grantedDomainsFor(). Both write paths store a
// normalized set now, so this only covers what is already on disk.
async function getStoredState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEY_PROFILES,
    STORAGE_KEY_ENABLED,
  ]);
  return {
    profiles: (stored[STORAGE_KEY_PROFILES] || []).map((profile) => ({
      ...profile,
      domains: normalizeDomains(profile.domains),
    })),
    enabled: stored[STORAGE_KEY_ENABLED] === true,
  };
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

  // FINDING-021. This half is the one that reaches an EXISTING install, and it
  // is why the write-path refusals in popup.js and canonical.js are not
  // sufficient on their own. FINDING-018 enlarged the collision surface —
  // profiles on example.com and api.example.com did not overlap before
  // subdomain matching and do now — so there are v0.1.4 installs already
  // holding a colliding pair, created by a fix that shipped. No write is
  // happening in those installs, so no write-time check can see them.
  const collisions = findCollisions(
    resolved.map(({ profile, grantedDomains }) => ({
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

  for (const { profile, grantedDomains } of resolved) {
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
  const { profiles, enabled } = await getStoredState();

  let syncOk = true;
  let error = null;

  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((rule) => rule.id);

    const addRules = enabled ? (await buildRules(profiles)).rules : [];

    // Single atomic call — per Chrome's docs, either all specified rules are
    // added and removed, or an error is returned and nothing changes. Rule
    // validity (append allowlist, non-empty values, granted domains) is
    // filtered out in buildRules()/profileToRule() before this point, on
    // purpose: one bad profile must not be able to take every other
    // profile's rules down with it.
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
  await chrome.storage.local.set({
    [STORAGE_KEY_SYNC]: { ok: syncOk, error },
  });

  await updateBadge({ enabled, syncOk });
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
