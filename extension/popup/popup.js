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
} from "../lib/rules.js";
import { serializeProfiles, parseProfilesFile } from "../lib/canonical.js";
import {
  diffDomainGrants,
  referencedDomains,
  originFor,
  originsFor,
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

// Which of these domains Chrome currently grants. sw.js has its own copy
// of this shape; it cannot be shared because lib/ is chrome.*-free by
// construction and this needs chrome.permissions.contains().
async function grantedDomainsFor(domains) {
  const unique = [...new Set(domains)];
  const results = await Promise.all(
    unique.map(async (domain) =>
      (await chrome.permissions.contains({ origins: [originFor(domain)] }))
        ? domain
        : null
    )
  );
  return results.filter((d) => d !== null);
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

async function renderListNow() {
  const profiles = await getProfiles();
  const list = $("profile-list");
  list.textContent = "";
  $("empty").classList.toggle("hidden", profiles.length > 0);

  for (const profile of profiles) {
    list.appendChild(await renderProfileCard(profile));
  }
  await updateStatusLine(profiles);
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
async function updateStatusLine(profiles) {
  const enabled = await getEnabled();
  const sync = await getSyncState();
  const allDomains = referencedDomains(profiles);
  const grantedCount = (await grantedDomainsFor(allDomains)).length;
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

async function renderProfileCard(profile) {
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
  deleteBtn.addEventListener("click", () => deleteProfile(profile.id));

  actions.append(editBtn, deleteBtn);
  row1.append(name, actions);

  const meta = document.createElement("div");
  meta.className = "meta";
  const n = (profile.headers || []).length;
  meta.textContent = `${n} header${n === 1 ? "" : "s"}`;

  const domains = document.createElement("div");
  domains.className = "domains";
  for (const domain of profile.domains || []) {
    domains.appendChild(await renderDomainChip(domain));
  }

  card.append(row1, meta, domains);
  return card;
}

async function renderDomainChip(domain) {
  const granted = await chrome.permissions.contains({
    origins: [originFor(domain)],
  });

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

  chip.title = granted
    ? `${domain}: permission granted, headers apply`
    : `${domain}: permission not granted, headers will not apply. Click to grant access.`;

  if (!granted) {
    chip.type = "button";
    chip.addEventListener("click", async () => {
      // Nothing load-bearing may follow request(): the dialog destroys this
      // JS context. Nothing needs to — the profile is already stored, and
      // sw.js's permissions.onAdded listener re-syncs rules unaided. The
      // re-render below only matters when no dialog was shown.
      const ok = await chrome.permissions.request({
        origins: [originFor(domain)],
      });
      if (ok) await renderList();
    });
  }

  chip.append(dot, document.createTextNode(domain));
  return chip;
}

async function deleteProfile(id) {
  const previousProfiles = await getProfiles();
  const nextProfiles = previousProfiles.filter((p) => p.id !== id);
  await setProfiles(nextProfiles);
  await renderList();
  await reconcileGrants(previousProfiles, nextProfiles);
}

// ---------------------------------------------------------- editor view

function showView(which) {
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

function showIoMsg(message) {
  const el = $("io-msg");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideIoUi() {
  $("io-msg").classList.add("hidden");
  $("import-confirm").classList.add("hidden");
  pendingImport = null;
}

async function exportProfiles() {
  const profiles = await getProfiles();
  const text = serializeProfiles(profiles);
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  // Deterministic filename, no timestamp — the file contents are
  // byte-stable, so the name is too. The browser suffixes on collision.
  anchor.download = "headerwright-profiles.json";
  anchor.click();
  URL.revokeObjectURL(url);
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
  hideIoUi();
  $("import-file").click();
});
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
