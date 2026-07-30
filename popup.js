// popup.js — HeaderWright popup.
// Writes to chrome.storage.local only; sw.js owns rule sync and reacts to
// storage changes, so no messaging between the two is needed.
//
// The one thing that MUST live here and not in sw.js:
// chrome.permissions.request() requires a direct user gesture, so it is
// called inside the Save button's click handler (recorded as a build
// constraint in the permission-posture decision, PROTOCOL.md 2026-07-30).

import { validateHeaderEntry } from "./rules.js";

const STORAGE_KEY_PROFILES = "hw:profiles";
const STORAGE_KEY_ENABLED = "hw:enabled";

const $ = (id) => document.getElementById(id);

let editingProfileId = null; // null = creating a new profile

// ---------------------------------------------------------------- storage

async function getProfiles() {
  const stored = await chrome.storage.local.get(STORAGE_KEY_PROFILES);
  return stored[STORAGE_KEY_PROFILES] || [];
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

// ------------------------------------------------------------ list view

async function renderList() {
  const profiles = await getProfiles();
  const list = $("profile-list");
  list.textContent = "";
  $("empty").classList.toggle("hidden", profiles.length > 0);

  for (const profile of profiles) {
    list.appendChild(await renderProfileCard(profile));
  }
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
  const chip = document.createElement("span");
  chip.className = "domain mono";

  const dot = document.createElement("span");
  dot.className = "dot";
  const granted = await chrome.permissions.contains({
    origins: [`*://${domain}/*`],
  });
  if (granted) dot.classList.add("granted");
  chip.title = granted
    ? `${domain}: permission granted, headers apply`
    : `${domain}: permission not granted, headers will not apply`;

  chip.append(dot, document.createTextNode(domain));
  return chip;
}

async function deleteProfile(id) {
  const profiles = await getProfiles();
  const remaining = profiles.filter((p) => p.id !== id);
  const removed = profiles.find((p) => p.id === id);
  await setProfiles(remaining);

  // Revoke each removed domain's permission only if no remaining profile
  // still references it — two profiles on one domain must not fight over
  // the grant (recorded in the permission-posture decision).
  if (removed) {
    const stillReferenced = new Set(remaining.flatMap((p) => p.domains || []));
    const toRevoke = (removed.domains || []).filter(
      (d) => !stillReferenced.has(d)
    );
    if (toRevoke.length > 0) {
      await chrome.permissions.remove({
        origins: toRevoke.map((d) => `*://${d}/*`),
      });
    }
  }

  renderList();
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
  const domains = $("f-domains")
    .value.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d !== "");

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
    // origin pattern, not here.
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
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

  // Permission request — must stay inside this click handler
  // (user-gesture requirement). Requesting is idempotent for
  // already-granted origins; Chrome only prompts for new ones.
  const granted = await chrome.permissions.request({
    origins: data.domains.map((d) => `*://${d}/*`),
  });
  if (!granted) {
    showFormError(
      "Permission was not granted. The profile is saved, but headers " +
        "won't apply on ungranted domains until you edit and re-save it."
    );
    // Deliberate: still save. The profile is the user's data; the grant
    // is browser state. sw.js already skips ungranted domains safely.
  }

  const profiles = await getProfiles();
  if (editingProfileId === null) {
    const nextId =
      profiles.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    profiles.push({ id: nextId, ...data });
  } else {
    const index = profiles.findIndex((p) => p.id === editingProfileId);
    if (index !== -1) {
      profiles[index] = { id: editingProfileId, ...data };
    }
  }
  await setProfiles(profiles);

  showView("list");
  renderList();
}

// ---------------------------------------------------------------- wiring

$("master-toggle").addEventListener("change", async (event) => {
  await setEnabled(event.target.checked);
  $("toggle-state").textContent = event.target.checked ? "On" : "Off";
});

$("add-profile").addEventListener("click", () => openEditor(null));
$("add-header-row").addEventListener("click", () => addHeaderRow());
$("f-cancel").addEventListener("click", () => showView("list"));
$("f-save").addEventListener("click", saveProfile);
$("profile-form").addEventListener("submit", (e) => e.preventDefault());

// ------------------------------------------------------------------ init

(async function init() {
  const enabled = await getEnabled();
  $("master-toggle").checked = enabled;
  $("toggle-state").textContent = enabled ? "On" : "Off";
  await renderList();
})();
