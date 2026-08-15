// popup.js — HeaderWright popup.
// Writes to chrome.storage.local only; sw.js owns rule sync and reacts to
// storage changes, so no messaging between the two is needed.
//
// The one thing that MUST live here and not in sw.js:
// chrome.permissions.request() requires a direct user gesture, so it is
// called inside the Save button's click handler. A service worker has no
// gesture to inherit, so this cannot move to sw.js no matter how much
// tidier that would be.

import {
  validateHeaderEntry,
  isValidDomain,
  isValidRuleId,
  nextRuleId,
  normalizeDomains,
  MAX_UNSAFE_DYNAMIC_RULES,
} from "../lib/rules.js";
import { serializeProfiles, parseProfilesFile } from "../lib/canonical.js";
import {
  diffDomainGrants,
  referencedDomains,
  originsForDomain,
  originsFor,
  legacyOriginsForDomain,
  isLegacyOnlyGrant,
} from "../lib/grants.js";
import { describeSync, DEFAULT_SYNC_STATE } from "../lib/status.js";
import { createSerialQueue, createDebounced } from "../lib/queue.js";

const STORAGE_KEY_PROFILES = "hw:profiles";
const STORAGE_KEY_ENABLED = "hw:enabled";
const STORAGE_KEY_SYNC = "hw:sync";

const $ = (id) => document.getElementById(id);

let editingProfileId = null; // null = creating a new profile

// ---------------------------------------------------------------- storage

// Domains are normalized on the way OUT of storage, not only on the way in.
// Both write paths (form and import) already store a normalized set, so this
// is for profiles written by v0.1.1 and earlier, which could hold duplicates.
// Without it, finding 7's visible symptom would survive the upgrade for any
// existing profile until its owner happened to re-save it: the chip list
// renders profile.domains directly while the status line counts
// referencedDomains(), which has always deduplicated. Normalizing here is what
// makes those two counts agree BY CONSTRUCTION rather than by two call sites
// remembering to agree. Same posture as A2 — storage is untrusted input.
async function getProfiles() {
  const stored = await chrome.storage.local.get(STORAGE_KEY_PROFILES);
  return (stored[STORAGE_KEY_PROFILES] || []).map((profile) => ({
    ...profile,
    domains: normalizeDomains(profile.domains),
  }));
}

async function setProfiles(profiles) {
  await chrome.storage.local.set({ [STORAGE_KEY_PROFILES]: profiles });
}

async function getEnabled() {
  const stored = await chrome.storage.local.get(STORAGE_KEY_ENABLED);
  return stored[STORAGE_KEY_ENABLED] === true;
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ [STORAGE_KEY_ENABLED]: enabled });
}

// Written by sw.js after every rule registration attempt. Absent until the
// first sync has run, which is not a failure — see DEFAULT_SYNC_STATE.
async function getSyncState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY_SYNC);
  const state = stored[STORAGE_KEY_SYNC];
  if (!state || typeof state.ok !== "boolean") return DEFAULT_SYNC_STATE;
  return state;
}

// ------------------------------------------------------------- grants

/**
 * Grant state for every domain in one pass: granted, and if not, whether it
 * is carrying a pre-0.1.4 grant (finding 18's upgrade path).
 *
 * Replaces the per-chip contains() call. renderDomainChip() used to make one
 * per CHIP, so a domain referenced by three profiles was checked three times
 * — the cost the debouncer at the bottom of this file exists to contain.
 * This checks each UNIQUE domain once, which is the same dedup reasoning as
 * finding 7, and costs a second call only for domains that came back
 * ungranted.
 *
 * @returns {Promise<Map<string, {granted: boolean, legacyOnly: boolean}>>}
 */
async function grantStateFor(domains) {
  const unique = [...new Set(domains || [])];
  const entries = await Promise.all(
    unique.map(async (domain) => {
      const granted = await chrome.permissions.contains({
        origins: originsForDomain(domain),
      });
      // Only ask the follow-up question when the answer can matter.
      const legacyGranted = granted
        ? false
        : await chrome.permissions.contains({
            origins: legacyOriginsForDomain(domain),
          });
      return [
        domain,
        {
          granted,
          legacyOnly: isLegacyOnlyGrant(domain, {
            legacyGranted,
            currentGranted: granted,
          }),
        },
      ];
    })
  );
  return new Map(entries);
}

// Which of these domains Chrome currently grants. sw.js has its own copy
// of this shape; it cannot be shared because lib/ is chrome.*-free by
// construction and this needs chrome.permissions.contains().
async function grantedDomainsFor(domains) {
  const state = await grantStateFor(domains);
  return [...state].filter(([, s]) => s.granted).map(([d]) => d);
}

/**
 * The one grant-reconciliation path, shared by save, delete, and import.
 * Before v0.1.1 each of those had its own inline version of this reasoning
 * and the edit path had none at all — finding 1b. The set arithmetic is
 * pure and lives in lib/grants.js; this function is only the chrome.*
 * wiring around it.
 *
 * MUST be called AFTER the profile write and after renderList(). Ordering
 * rules, both load-bearing:
 *
 *  - Persist first (the v0.1.0 Bug record). chrome.permissions.request()
 *    opens a native dialog that closes the popup and destroys this JS
 *    context; nothing after it may be load-bearing. sw.js's
 *    permissions.onAdded/onRemoved listeners close the loop unaided.
 *
 *  - remove() BEFORE request(). request() is KNOWN to destroy the context;
 *    remove() is only believed not to (it should not open a dialog), and
 *    that belief is unverified as of 0.1.1. The known-dangerous call goes
 *    last. The consequences are asymmetric too: a lost request() is
 *    visible as a gray dot the user can retry, while a lost remove()
 *    leaves a stale grant behind silently, which is finding 1's symptom.
 */
async function reconcileGrants(previousProfiles, nextProfiles) {
  const grantedDomains = await grantedDomainsFor([
    ...referencedDomains(previousProfiles),
    ...referencedDomains(nextProfiles),
  ]);
  const { toRequest, toRevoke } = diffDomainGrants({
    previousProfiles,
    nextProfiles,
    grantedDomains,
  });

  if (toRevoke.length > 0) {
    await chrome.permissions.remove({ origins: originsFor(toRevoke) });
  }

  if (toRequest.length === 0) {
    if (toRevoke.length > 0) await renderList();
    return;
  }

  // User-gesture requirement still holds. Everything between the click and
  // this call is storage reads/writes and permissions.contains() checks —
  // sub-millisecond each, well inside the transient-activation window.
  const granted = await chrome.permissions.request({
    origins: originsFor(toRequest),
  });

  // Only reachable when no dialog was shown, or after it resolves with the
  // popup still alive. The domain dots and status line are the truth
  // display either way.
  if (granted) await renderList();
}

// ------------------------------------------------------------ list view

/**
 * The finding-18 upgrade notice.
 *
 * NOT A NEW FEATURE, and this is a deliberate reading of the patch policy
 * rather than a second recorded exception after finding 10. Finding 10 added
 * a capability the extension did not have. This adds no capability: v0.1.4
 * invalidates grants the user already made, and a fix that breaks working
 * configurations without saying why is an INCOMPLETE FIX. The migration
 * explanation is part of the remediation.
 *
 * There is also no other channel to say it in. No telemetry, no update page,
 * no content script, and store release notes are not read. If the popup does
 * not say it, nothing does — and a user whose extension quietly stopped
 * working does not file a bug, they uninstall.
 *
 * SELF-EXPIRING: driven entirely by isLegacyOnlyGrant(), which can only be
 * true on an install that granted under v0.1.3 and goes false permanently
 * once re-granted. No version constant, no cleanup task, nothing to remember
 * to delete. On a fresh install this branch is unreachable.
 *
 * Lives OUTSIDE #profile-list for finding 8's reason: renderListNow() clears
 * that container on every render, including renders arriving from storage
 * events mid-read.
 */
function renderMigrationNotice(grants) {
  const el = $("migration-notice");
  const n = [...grants.values()].filter((s) => s.legacyOnly).length;

  el.classList.toggle("hidden", n === 0);
  if (n === 0) return;

  // Describes what happened and what it costs. No apology, no reassurance,
  // no "click here" urgency — the chips are already the affordance, and the
  // notice's job is to explain the gray dots, not to sell the fix.
  el.textContent =
    `HeaderWright now requests access to subdomains, so headers set for ` +
    `example.com also apply on api.example.com. ${n} domain` +
    `${n === 1 ? "" : "s"} granted under an earlier version ` +
    `${n === 1 ? "does" : "do"} not cover this yet, and ` +
    `${n === 1 ? "its" : "their"} headers will not apply until re-approved. ` +
    `Click any gray domain below to re-approve it.`;
}

async function renderListNow() {
  const profiles = await getProfiles();
  const list = $("profile-list");
  list.textContent = "";
  $("empty").classList.toggle("hidden", profiles.length > 0);

  // One permission pass for the whole render, read from below rather than
  // per chip. Also the input to the migration notice, which has to be
  // decided BEFORE the chips are built so it can count them.
  const grants = await grantStateFor(referencedDomains(profiles));
  renderMigrationNotice(grants);

  for (const profile of profiles) {
    list.appendChild(renderProfileCard(profile, grants));
  }

  // Retract a pending question whose subject no longer exists. Reachable now
  // that finding 8's listener re-renders on storage events: the profile could
  // be removed by another context while the confirmation sits open, and a
  // confirm naming a profile that is already gone is worse than no confirm.
  if (pendingDeleteId !== null &&
      !profiles.some((p) => p.id === pendingDeleteId)) {
    hideDeleteConfirm();
  }

  await updateStatusLine(profiles, grants);
}

// SERIALIZED, and nothing calls renderListNow directly — the same wiring rule
// as sw.js's syncRules, and the one mistake that would silently void this.
//
// renderListNow clears the list and then awaits a permissions.contains() per
// chip before appending, so it yields repeatedly with the DOM half-built. Two
// overlapping runs therefore interleave: the second clears what the first has
// already appended, and the first keeps appending into a list the second is
// also filling. Until v0.1.2 every render was triggered by a popup action and
// awaited in sequence, so this was hard to reach. The storage listener below
// makes renders arrive independently of anything the user is doing, which is
// precisely what turns an unreachable race into a reachable one. Same family
// as finding 5, and the same primitive fixes it.
const renderList = createSerialQueue(renderListNow, (err) => {
  console.error("HeaderWright: popup render failed —", err);
});

// Editor-style status line: the one-glance truth about what is actually
// in effect right now. Domain counts are deduplicated across profiles.
// `grants` is optional: renderListNow has already made the permission pass
// and hands it down rather than paying for a second one. The line 798 caller
// has no render in flight, so it makes its own.
async function updateStatusLine(profiles, grants) {
  const enabled = await getEnabled();
  const sync = await getSyncState();
  const allDomains = referencedDomains(profiles);
  const state = grants || (await grantStateFor(allDomains));
  const grantedCount = allDomains.filter(
    (d) => state.get(d)?.granted
  ).length;
  const n = profiles.length;
  const parts = [
    `${n} profile${n === 1 ? "" : "s"}`,
    `${grantedCount}/${allDomains.length} domain${allDomains.length === 1 ? "" : "s"} granted`,
    describeSync({ enabled, syncOk: sync.ok }),
  ];
  const line = $("status-line");
  line.textContent = parts.join(" \u00b7 ");
  // The exact reason belongs somewhere reachable but not shouted: the third
  // segment already states that rules are not active, and this explains why
  // without the popup growing an error panel it does not otherwise need.
  line.title = sync.ok
    ? ""
    : `Chrome rejected the last rule registration: ${sync.error || "unknown error"}`;
  line.classList.toggle("sync-failed", !sync.ok);
}

function renderProfileCard(profile, grants) {
  const card = document.createElement("div");
  card.className = "profile";

  const row1 = document.createElement("div");
  row1.className = "row1";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = profile.name;

  const actions = document.createElement("span");
  actions.className = "actions";

  const editBtn = document.createElement("button");
  editBtn.className = "quiet";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => openEditor(profile));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "danger-quiet";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => requestDelete(profile));

  actions.append(editBtn, deleteBtn);
  row1.append(name, actions);

  const meta = document.createElement("div");
  meta.className = "meta";
  const n = (profile.headers || []).length;
  meta.textContent = `${n} header${n === 1 ? "" : "s"}`;

  const domains = document.createElement("div");
  domains.className = "domains";
  for (const domain of profile.domains || []) {
    domains.appendChild(renderDomainChip(domain, grants));
  }

  card.append(row1, meta, domains);
  return card;
}

function renderDomainChip(domain, grants) {
  // Default to ungranted for a domain the pass somehow missed: a gray dot on
  // a granted domain is a visible, correctable understatement, while a green
  // dot on an ungranted one is the exact lie finding 18 was.
  const { granted, legacyOnly } =
    grants.get(domain) || { granted: false, legacyOnly: false };

  // An UNGRANTED domain is rendered as a button, a granted one as plain text.
  // Finding 2, option 1: before v0.1.1 the only way to re-fire request() for
  // a domain whose dialog was denied was Edit then Save — which works, and
  // which nothing in the UI suggests, so a profile could sit permanently
  // non-functional with no in-app recovery.
  //
  // GRANT-ONLY, deliberately. Making the granted chip a revoke control is a
  // symmetric toggle, and a toggle over a SHARED domain has unresolved
  // meaning: revoking one profile's chip would silently break every other
  // profile referencing that host. That is design work, not a patch, and it
  // queues to its own version. This exposes an existing path and nothing more.
  const chip = document.createElement(granted ? "span" : "button");
  chip.className = granted ? "domain mono" : "domain mono grantable";

  const dot = document.createElement("span");
  dot.className = "dot";
  if (granted) dot.classList.add("granted");

  if (legacyOnly) chip.classList.add("migrating");

  chip.title = granted
    ? `${domain}: permission granted, headers apply`
    : legacyOnly
      ? `${domain}: this domain was granted under an older version that did ` +
        `not cover subdomains. Headers will not apply until you click to ` +
        `re-approve.`
      : `${domain}: permission not granted, headers will not apply. Click to grant access.`;

  if (!granted) {
    chip.type = "button";
    chip.addEventListener("click", async () => {
      // Nothing load-bearing may follow request(): the dialog destroys this
      // JS context. Nothing needs to — the profile is already stored, and
      // sw.js's permissions.onAdded listener re-syncs rules unaided. The
      // re-render below only matters when no dialog was shown.
      const ok = await chrome.permissions.request({
        origins: originsForDomain(domain),
      });
      if (ok) await renderList();
    });
  }

  chip.append(dot, document.createTextNode(domain));
  return chip;
}

// ------------------------------------------------------ delete (finding 10)

// FINDING 10, and this is a RECORDED DEVIATION from "patch = fixes only", not
// a reclassification. Adding a confirmation is NEW BEHAVIOUR, so by the patch
// policy it is a feature and should queue behind Rule Tester. It ships in
// 0.1.2 anyway, by decision. The deviation is written down — here and in the
// handoff — because that is what stops the policy eroding by accretion, which
// is how such rules actually fail: not by being repealed, but through a series
// of individually reasonable exceptions nobody recorded.
//
// The gap it closes: delete was the only destructive action in the extension
// with no confirmation, while IMPORT had one — and import is RECOVERABLE,
// since the file it read still exists on disk. Delete is not: profile,
// headers, and the host grant go with no undo. The weaker action guarded
// itself and the stronger one did not.
//
// NOT window.confirm(). A native modal is the exact hazard in the Bug record:
// chrome.permissions.request() opens one and it DESTROYS the popup's JS
// context, so nothing after the await runs. An inline confirm keeps the whole
// operation inside one context, and it matches the shape import already uses.
//
// The block lives OUTSIDE #profile-list deliberately. renderListNow() clears
// that container on every render, and as of finding 8 renders now arrive from
// storage events rather than only from user actions — a confirmation rendered
// into a profile row would be wiped mid-decision by an unrelated sync.
let pendingDeleteId = null;

function hideDeleteConfirm() {
  $("delete-confirm").classList.add("hidden");
  pendingDeleteId = null;
}

function requestDelete(profile) {
  hideIoUi(); // never show two confirmations at once
  pendingDeleteId = profile.id;
  const n = (profile.domains || []).length;
  $("delete-confirm-text").textContent =
    `Delete "${profile.name}" and its ${n} domain${n === 1 ? "" : "s"}? ` +
    `This cannot be undone.`;
  $("delete-confirm").classList.remove("hidden");
}

async function confirmDelete() {
  if (pendingDeleteId === null) return;
  const id = pendingDeleteId;
  hideDeleteConfirm();
  await deleteProfile(id);
}

async function deleteProfile(id) {
  const previousProfiles = await getProfiles();
  const nextProfiles = previousProfiles.filter((p) => p.id !== id);
  // Nothing to do if it is already gone — another context may have removed it
  // while the confirmation sat open.
  if (nextProfiles.length === previousProfiles.length) return;
  await setProfiles(nextProfiles);
  await renderList();
  await reconcileGrants(previousProfiles, nextProfiles);
}

// ---------------------------------------------------------- editor view

function showView(which) {
  // A pending delete is abandoned on any view change. Leaving it armed while
  // the user edits a different profile means returning to a confirmation they
  // have lost the context for.
  if (which !== "list") hideDeleteConfirm();
  $("list-view").classList.toggle("hidden", which !== "list");
  $("edit-view").classList.toggle("hidden", which !== "edit");
}

function addHeaderRow(entry = { name: "", operation: "set", value: "" }) {
  const row = document.createElement("div");
  row.className = "hrow";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "mono h-name";
  nameInput.placeholder = "Header name";
  nameInput.value = entry.name;

  const opSelect = document.createElement("select");
  opSelect.className = "h-op";
  for (const op of ["set", "append", "remove"]) {
    const option = document.createElement("option");
    option.value = op;
    option.textContent = op;
    if (op === entry.operation) option.selected = true;
    opSelect.appendChild(option);
  }

  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.className = "mono h-value";
  valueInput.placeholder = "Value";
  valueInput.value = entry.value || "";

  const syncValueState = () => {
    const isRemove = opSelect.value === "remove";
    valueInput.disabled = isRemove;
    valueInput.placeholder = isRemove ? "(not used)" : "Value";
  };
  opSelect.addEventListener("change", syncValueState);
  syncValueState();

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "remove-row";
  removeBtn.title = "Remove this header row";
  removeBtn.textContent = "\u00d7";
  removeBtn.addEventListener("click", () => row.remove());

  row.append(nameInput, opSelect, valueInput, removeBtn);
  $("header-rows").appendChild(row);
}

function openEditor(profile = null) {
  editingProfileId = profile ? profile.id : null;
  $("form-title").textContent = profile ? "Edit profile" : "New profile";
  $("f-name").value = profile ? profile.name : "";
  $("f-domains").value = profile ? (profile.domains || []).join(", ") : "";
  $("header-rows").textContent = "";
  const headers = profile && profile.headers?.length ? profile.headers : [null];
  for (const entry of headers) addHeaderRow(entry || undefined);
  hideFormError();
  showView("edit");
  $("f-name").focus();
}

function showFormError(message) {
  const el = $("form-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideFormError() {
  $("form-error").classList.add("hidden");
}

function readForm() {
  const name = $("f-name").value.trim();
  // normalizeDomains lowercases, deduplicates and sorts — finding 7. The form
  // accepts "example.com, EXAMPLE.com, example.com" and used to store all
  // three, which rendered as three identical chips beside a status line
  // reading "1/1 domain granted": two counts of the same thing in one view.
  const domains = normalizeDomains(
    $("f-domains").value.split(",").map((d) => d.trim()).filter((d) => d !== "")
  );

  const headers = [];
  for (const row of $("header-rows").querySelectorAll(".hrow")) {
    const entry = {
      name: row.querySelector(".h-name").value.trim(),
      operation: row.querySelector(".h-op").value,
      value: row.querySelector(".h-value").value,
    };
    // Fully blank rows are ignored rather than rejected
    if (entry.name === "" && entry.value === "") continue;
    headers.push(entry);
  }
  return { name, domains, headers };
}

function validateForm({ name, domains, headers }) {
  if (name === "") return "Give the profile a name.";
  if (domains.length === 0) return "Add at least one domain.";
  for (const domain of domains) {
    // Bare hostnames only — scheme/path/port belong to the generated
    // origin pattern, not here. Shared with import validation.
    if (!isValidDomain(domain)) {
      return `"${domain}" doesn't look like a domain. Use a bare hostname like example.com.`;
    }
  }
  if (headers.length === 0) return "Add at least one header.";
  for (const entry of headers) {
    const result = validateHeaderEntry(entry);
    if (!result.valid) return `Header "${entry.name || "(unnamed)"}": ${result.reason}.`;
  }
  return null;
}

async function saveProfile() {
  const data = readForm();
  const error = validateForm(data);
  if (error) {
    showFormError(error);
    return;
  }

  // Persist FIRST, touch permissions LAST — see reconcileGrants() for the
  // full ordering rationale and the v0.1.0 Bug record it comes from.
  //
  // previousProfiles must be a snapshot taken BEFORE the change: the edit
  // path diffs against it. Building nextProfiles as a new array rather
  // than mutating in place is what makes that snapshot meaningful.
  const previousProfiles = await getProfiles();
  let nextProfiles;
  if (editingProfileId === null) {
    // FINDING 15, found during the 0.1.2 smoke run. Import refuses an over-cap
    // file, but the ADD path had no count check at all — so importing 5,000
    // profiles and then adding one through the form reached exactly the state
    // finding 6 exists to prevent: 5001 in storage, 5000 on the wire, hw:sync
    // reporting {ok: true}, every dot green, and no surface anywhere saying one
    // profile is inert. Reproduced in a browser, not reasoned about.
    //
    // This was flagged and deliberately left out when finding 6 shipped, on the
    // grounds that nobody reaches 5,000 profiles by hand. That was the wrong
    // test: it took one click during an unrelated step to get there, and the
    // release claims to refuse over-cap configurations. A claim with a known
    // counterexample is the exact failure the claim -> evidence table exists to
    // stop.
    //
    // Counted the same way import counts, and deliberately conservative for the
    // same reason: a profile with no granted domain or no valid header consumes
    // no rule budget, but grant state is not knowable here without an async
    // permissions round trip per domain, and profile count is the sound upper
    // bound. Editing an existing profile is exempt — it cannot increase the
    // count, and blocking edits at the cap would trap a user with no way to fix
    // the configuration that got them there.
    if (previousProfiles.length >= MAX_UNSAFE_DYNAMIC_RULES) {
      showFormError(
        `You already have ${previousProfiles.length} profiles. The most that ` +
          `can be applied is ${MAX_UNSAFE_DYNAMIC_RULES}. Delete a profile ` +
          `before adding another.`
      );
      return;
    }

    const nextId = nextRuleId(previousProfiles);
    // Acceptance criterion A3, extended to the GENERATION path (finding 9).
    // A3 was written for import and satisfied there; nothing checked the id
    // this popup invents. nextRuleId() cannot return an out-of-range id at any
    // reachable profile count, so this branch is unreachable in practice — it
    // is here because an UNCHECKED write to storage is what made finding 9 a
    // silent latch, and the check is what makes that structurally impossible
    // rather than merely unlikely.
    if (!isValidRuleId(nextId)) {
      showFormError(
        "Cannot create another profile: no rule id is available. Delete an " +
          "existing profile and try again."
      );
      return;
    }
    nextProfiles = [...previousProfiles, { id: nextId, ...data }];
  } else {
    nextProfiles = previousProfiles.map((p) =>
      p.id === editingProfileId ? { id: editingProfileId, ...data } : p
    );
  }
  await setProfiles(nextProfiles);

  // Popup UI state, in case we survive the request (already granted, or
  // denied without a dialog). Set BEFORE the request for the same reason.
  showView("list");
  await renderList();

  await reconcileGrants(previousProfiles, nextProfiles);
}

// -------------------------------------------------------- export/import

let pendingImport = null; // parsed profiles awaiting Replace confirmation

// #io-msg is shared by import rejections and the export notice. The tone
// argument decides which styling applies; it defaults to "error" so the
// existing import call sites keep their behaviour unchanged.
function showIoMsg(message, tone = "error") {
  const el = $("io-msg");
  el.textContent = message;
  el.classList.toggle("error", tone === "error");
  el.classList.toggle("notice", tone === "notice");
  el.classList.remove("hidden");
}

function hideIoUi() {
  $("io-msg").classList.add("hidden");
  $("import-confirm").classList.add("hidden");
  pendingImport = null;
}

// Opening the import flow closes any pending delete, so the two confirmations
// can never sit on screen together asking about different things.
function hideAllConfirms() {
  hideIoUi();
  hideDeleteConfirm();
}

const EXPORT_FILENAME = "headerwright-profiles.json";

async function exportProfiles() {
  hideAllConfirms();
  const profiles = await getProfiles();
  const text = serializeProfiles(profiles);
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  // Deterministic filename, no timestamp — the file contents are
  // byte-stable, so the name is too. The browser suffixes on collision.
  anchor.download = EXPORT_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);

  // PLAINTEXT SECRETS NOTICE. Header values are written to the file exactly as
  // configured, and a header editor's most common real use is an Authorization
  // or Cookie value — so an export is frequently a secrets file, and nothing
  // said so. Deliberately shown AFTER the export rather than as a permanent
  // hint or a pre-export confirmation: this is the moment the fact becomes
  // actionable, because a file now exists on disk. A confirmation was rejected
  // — export is non-destructive and reversible, so gating it would add friction
  // to a safe action and dilute what a confirmation means everywhere else in
  // this popup.
  //
  // Names the file on purpose: the filename is deterministic, so the message
  // can always say precisely which artifact to be careful with.
  showIoMsg(
    `Exported to ${EXPORT_FILENAME}. Header values are saved in plain text — ` +
      `if any are tokens or cookies, treat the file as a secret.`,
    "notice"
  );
}

async function onImportFileChosen(event) {
  hideIoUi();
  const file = event.target.files[0];
  event.target.value = ""; // allow re-selecting the same file later
  if (!file) return;

  let profiles;
  try {
    profiles = parseProfilesFile(await file.text());
  } catch (err) {
    showIoMsg(`Import failed: ${err.message}.`);
    return;
  }

  pendingImport = profiles;
  const current = (await getProfiles()).length;
  const n = profiles.length;
  $("import-confirm-text").textContent =
    `Replace your ${current} profile${current === 1 ? "" : "s"} with ` +
    `${n} profile${n === 1 ? "" : "s"} from "${file.name}"?`;
  $("import-confirm").classList.remove("hidden");
}

async function applyImport() {
  if (pendingImport === null) return;
  const nextProfiles = pendingImport;
  const previousProfiles = await getProfiles();

  // Persist FIRST — same lesson as saveProfile.
  await setProfiles(nextProfiles);
  hideIoUi();
  await renderList();

  await reconcileGrants(previousProfiles, nextProfiles);
}

// ------------------------------------------------------- live state (f8)

// FINDING 8. The popup rendered once on open and never re-read storage, so a
// sync failure arriving AFTER the render left the status line reading
// "applying" beside two green dots while the toolbar badge was already red.
// Reproduced in both directions on a genuine failure, 2026-08-05: failure
// after render -> stale; render after failure -> correct. The state shown was
// STALE rather than false, and reopening the popup corrected it — which is why
// this is low severity and still worth removing. It is the same family as
// finding 4's badge and finding 1a's Details panel: a surface asserting
// something that stopped being true.
//
// SCOPED TO TWO KEYS ON PURPOSE. hw:sync is what sw.js writes after every
// registration attempt, and hw:profiles is what any other context could
// change. hw:enabled is deliberately absent: only this popup writes it, from
// the toggle handler below, which already updates the status line itself — and
// every toggle produces an hw:sync write anyway, so the state still lands.
// Listening to every key would re-render on our own writes twice over.
//
// DEBOUNCED because renderList costs one permissions.contains() PER CHIP. An
// ordinary save writes hw:profiles and then hw:sync back to back, which is two
// renders for one user action; at the 5,000-profile ceiling that is ~10,000
// permission checks where 5,000 will do. 100ms is below the threshold where a
// UI update reads as lag, and comfortably wider than the gap between those two
// writes.
const WATCHED_KEYS = [STORAGE_KEY_PROFILES, STORAGE_KEY_SYNC];

const scheduleRerender = createDebounced(renderList, 100, (err) => {
  console.error("HeaderWright: re-render after a storage change failed —", err);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (WATCHED_KEYS.some((key) => key in changes)) {
    // Safe while the editor is open: renderListNow only touches the list view
    // and the status line, never the form fields or which view is showing.
    scheduleRerender();
  }
});

// ---------------------------------------------------------------- wiring

$("master-toggle").addEventListener("change", async (event) => {
  await setEnabled(event.target.checked);
  $("toggle-state").textContent = event.target.checked ? "On" : "Off";
  await updateStatusLine(await getProfiles());
});

$("add-profile").addEventListener("click", () => openEditor(null));
$("add-header-row").addEventListener("click", () => addHeaderRow());
$("f-cancel").addEventListener("click", () => showView("list"));
$("f-save").addEventListener("click", saveProfile);
$("profile-form").addEventListener("submit", (e) => e.preventDefault());

$("export-profiles").addEventListener("click", exportProfiles);
$("import-profiles").addEventListener("click", () => {
  hideAllConfirms();
  $("import-file").click();
});
$("delete-cancel").addEventListener("click", hideDeleteConfirm);
$("delete-proceed").addEventListener("click", confirmDelete);
$("import-file").addEventListener("change", onImportFileChosen);
$("import-cancel").addEventListener("click", hideIoUi);
$("import-replace").addEventListener("click", applyImport);

// ------------------------------------------------------------------ init

(async function init() {
  const enabled = await getEnabled();
  $("master-toggle").checked = enabled;
  $("toggle-state").textContent = enabled ? "On" : "Off";
  await renderList();
})();
