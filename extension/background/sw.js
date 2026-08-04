// sw.js — HeaderWright service worker.
// Owns declarativeNetRequest dynamic rule sync. Reacts to storage changes
// rather than being told what to do by popup.js directly: chrome.storage
// is the single source of truth, so any context (popup, future options
// page) only ever needs to write to storage, never message this worker.

import { profileToRule } from "../lib/rules.js";
import { originFor } from "../lib/grants.js";

const STORAGE_KEY_PROFILES = "hw:profiles";
const STORAGE_KEY_ENABLED = "hw:enabled";

// modifyHeaders rules are not in DNR's "safe" action set (block, allow,
// allowAllRequests, upgradeScheme only) — confirmed on Chrome's
// declarativeNetRequest reference, 2026-07-30 — so every rule here counts
// against the 5,000 unsafe-rule cap, not the 30,000 headline figure. This
// resolves the UNVERIFIED note in PROTOCOL.md's Phase 1 findings.
const MAX_UNSAFE_DYNAMIC_RULES = 5000;

async function getStoredState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEY_PROFILES,
    STORAGE_KEY_ENABLED,
  ]);
  return {
    profiles: stored[STORAGE_KEY_PROFILES] || [],
    enabled: stored[STORAGE_KEY_ENABLED] === true,
  };
}

// A profile's domain is only used in a rule if currently granted —
// registering a rule for an ungranted domain would match in
// testMatchOutcome but silently no-op on real traffic (the spike's Phase 1
// finding). Checked per-domain via chrome.permissions.contains rather than
// hand-rolling origin-pattern matching against chrome.permissions.getAll().
async function grantedDomainsFor(domains) {
  const checks = await Promise.all(
    (domains || []).map(async (domain) => {
      const granted = await chrome.permissions.contains({
        origins: [originFor(domain)],
      });
      return granted ? domain : null;
    })
  );
  return checks.filter((d) => d !== null);
}

async function buildRules(profiles) {
  const rules = [];
  const skippedProfileIds = [];

  for (const profile of profiles) {
    const grantedDomains = await grantedDomainsFor(profile.domains);
    const rule = profileToRule(profile, grantedDomains);
    if (rule) {
      rules.push(rule);
    } else {
      skippedProfileIds.push(profile.id);
    }
  }

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

async function updateBadge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#1a7f37" : "#6e7781",
  });
}

async function syncRules() {
  const { profiles, enabled } = await getStoredState();

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

  await updateBadge(enabled);
}

// Rebuild on install/update and on every browser startup. Dynamic rules
// are documented to persist across sessions and extension updates, but
// the spike's finding (rules absent after a full remove + reload) was
// specifically an uninstall scenario, where chrome.storage.local is wiped
// too — nothing survives that regardless, rebuild or not. Rebuilding here
// is cheap and idempotent either way, so it costs nothing to always do it
// rather than trust persistence in any one case.
chrome.runtime.onInstalled.addListener(syncRules);
chrome.runtime.onStartup.addListener(syncRules);

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
