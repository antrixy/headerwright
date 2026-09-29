# PREDICTIONS — s3 code: AR-02, with AR-01b's draft half — 2026-09-29

> **FROZEN ON COMMIT.** Written against `4b7d9b15135f2c1d65f5233b9994855eec01ed69`
> before any line of the change exists, test or product. Nothing below may be
> edited after the code runs. Outcomes are recorded UNDER each prediction, and
> a wrong prediction keeps its original wording.
>
> Rulings: S3-D1–D6, ruled by Ash on 2026-09-29 at 09:56 CT (14:56 UTC), "as
> recommended", before this file was written. §1 records them. They go into
> `antrixy/project-planning` `decisions.md` in the commit after this one. No
> version bump, no packaging, no browser sitting, and no UI-04, UI-05 or
> FEAT-3 work in this session.

## 0. Baseline, measured before this file was written

**Inputs**, SHA-pinned archives attached 2026-09-29, each checked before
anything was read:

- headerwright: archive sha256
  `bbf9bf1be7322c7ff530f844f975050f2ce5372fef9f7f64addd55d4ad05ece0`
  (408,680 bytes). Embedded commit `4b7d9b15135f2c1d65f5233b9994855eec01ed69`,
  tree `e2cea3f165b8f2418b4803430a8dbaf70d9496e1` (rebuilt with
  `git write-tree`, 64 files), `LEDGER.md` sha256
  `09ec36cccbde1da7acbedeaacaf6b9501c1805f8946816fadee1d0723c344f06`. All
  match the pinned values.
- project-planning: archive sha256
  `d2a8f98f267efa70918b5b5a272f27f2d85be9d6dfbc69f14b85e1202a33fbb5`
  (976,081 bytes). Embedded commit `4c9a89c3e32db35010ce9f40f6703232a04c51fe`,
  tree `a8302b6dfc4253965c1fe23f104d80c3b8c9edd0` (76 files),
  `handoffs/headerwright/NEXT.md` sha256
  `83a2e4265ae774c3b28eed4444cf89587c4a275e77cfe5e89bf2022a058951c3`. All
  match.

**Gates.** `node test/verify.mjs` on the headerwright archive: all 7 gates
pass, 556 checks, 131 mutation scenarios (container: Node 22.22.2, Python
3.11.15).

**AR-02 reproduced, clause by clause.** `lib/` was imported directly.
`popup.js`'s own `getDrafts`, `putDraft` and `dropDraft` were cut out by name
and run unchanged against a fake `chrome.storage.session` whose calls resolve
in call order.

- **Identity.** `nextRuleId([{ id: 1 }, { id: 3 }])` returns 2: ids are
  reused, lowest free first, and the draft key is the id. A v1 draft carries
  `version, editingProfileId, name, domains, rows`, and no base. Take a draft
  left by a deleted profile 2 (`staging`) and a new profile 2 (`prod`):
  `draftDiffersFromProfile` returns true, so the new card is marked, and
  `checkEditBase([new2], 2, digest(new2))` returns `{ ok: true }`, because
  `openEditor` takes the base from the profile shown. Save would write the
  old draft over the new profile. With `digest(old2)` as the base, the same
  call returns `{ ok: false, reason: "changed" }`.
- **Purge on delete, rebase on import.** From the source: `deleteProfile`
  and `applyImport` make no draft call. Drafts are dropped only by
  `saveProfile`, `revertToSaved` and the Cancel handler.
- **Write ordering.** Two overlapping `putDraft` calls for keys `3` and
  `new` leave only `new` stored. A `putDraft` issued while a `dropDraft` is
  running leaves the dropped key stored.
- **Enum validation.** `isValidDraft` accepts a row with side `sideways` and
  operation `delete`, and `draftToForm` returns both unchanged. The form has
  no such options. From the source, `addHeaderRow` would show `req` (through
  `sideOf`) and `set` (the first option).

**Session storage lifetime**, from Chrome's `chrome.storage` reference, read
2026-09-29: "Session storage holds data in memory while an extension is
loaded. The storage is cleared if the extension is disabled, reloaded,
updated, and when the browser restarts." The page says nothing about the
order in which storage calls are applied. Evidence class: `chrome-docs`.

**Fixtures.** Every profile below passes `validateProfile` on the pinned
code, and their seven `profile-v1` digests are distinct:

    old2   {id: 2, name: "staging", domains: ["a.com"],     headers: [{name: "X-Env",   operation: "set", value: "staging"}]}
    new2   {id: 2, name: "prod",    domains: ["b.com"],     headers: [{name: "X-Env",   operation: "set", value: "prod"}]}
    P2     {id: 2, name: "two",     domains: ["two.com"],   headers: [{name: "X-Two",   operation: "set", value: "2"}]}
    P4old  {id: 4, name: "four",    domains: ["four.com"],  headers: [{name: "X-Four",  operation: "set", value: "old"}]}
    P4new  {id: 4, name: "four",    domains: ["four.com"],  headers: [{name: "X-Four",  operation: "set", value: "new"}]}
    P6     {id: 6, name: "six",     domains: ["six.com"],   headers: [{name: "X-Six",   operation: "remove"}]}
    P7     {id: 7, name: "seven",   domains: ["seven.com"], headers: [{name: "X-Seven", side: "response", operation: "set", value: "7"}]}

The reproduction script and the fixture check are container scratch, not
committed. Their outputs are quoted above.

## 1. Rulings, as ruled

- **S3-D1, draft identity and AR-01b's draft half.** `DRAFT_VERSION` goes
  1 → 2.
  - A draft stores `baseDigest`, the base its editor was bound to when the
    draft was written (null for a new profile).
  - The id stays the storage key, but only as a slot. A draft is used only
    if its key, its `editingProfileId` and the opened profile all agree.
  - A restored draft binds to its own base, not to whatever is stored when
    the editor opens. If the profile changed since, Save refuses the draft
    as `changed` through s2's D4 path. The draft notice, with Revert to
    saved, is already on screen. No new copy.
  - v1 drafts are refused, not migrated: session storage is cleared on
    update and reload (§0).
  - Stated limits: s3 makes a mismatched draft harmless, not impossible.
    Only FEAT-1's durable profileUid closes that. For a restored draft,
    "changed after you opened it" has to be read as "changed since this edit
    began".
- **S3-D2, purge on delete.** A confirmed Delete drops that profile's
  draft, and only that one, after the profile write succeeds. A failed purge
  is logged and does not fail the delete; S3-D1 keeps any leftover draft
  harmless. The confirmation text is unchanged.
- **S3-D3, rebase on import.** After Replace's profile write succeeds, every
  draft is checked again against the imported set. A draft survives only if
  the file holds its profile unchanged: same id, and a digest equal to the
  draft's base. The other drafts are dropped. The new-profile draft survives.
- **S3-D4, write ordering.**
  - Every read and write of `hw:drafts` goes through one first-in-first-out
    queue: lib code, with the storage calls passed in.
  - Draft writes belong to an edit session. Save (after its profile write
    succeeds), Cancel and Revert to saved end the session synchronously,
    before issuing their drop. A write issued after that is not made; one
    issued before it lands before the drop.
  - A draft operation follows the profile write it depends on, and comes
    before grant reconciliation.
  - Known limit: keystrokes typed while a Save is writing are not kept.
- **S3-D5, enum validation.** A row whose side is not request or response,
  or whose operation is not set, append or remove, makes the whole draft
  invalid: not restored, and no card marker. The two sets are exported from
  `rules.js` and imported by `draft.js`, not declared twice. The paragraph in
  `draft.js` on why `sideOf` is injected is rewritten, and its wrong file
  name with it (it says `canonical.js`; `sideOf` is in `collisions.js`).
- **S3-D6, records.** AR-02's write-up is a new FINDING-048. AR-02's prior
  column becomes `FINDING-042, FINDING-048`, and FINDING-042 stays unedited.
  Two new low rows, target `slice:scope`, are raised in the AR-02 code commit
  and not fixed in s3:
  - the editor shows its "unsaved changes" notice for a draft identical to
    the saved profile, while the card marker stays silent for it;
  - `addHeaderRow`'s option lists (`popup.js:831`, `:845`) are a third copy
    of the side and operation sets, and nothing pins them to the
    validator's.

## 2. Design, fixed before the build

### `extension/lib/rules.js` (S3-D5)

- `VALID_OPERATIONS` and `VALID_SIDES` gain `export`. Nothing else changes,
  and `validateHeaderEntry` keeps using them.

### `extension/lib/draft.js` (S3-D1 to S3-D5)

It imports `{ VALID_OPERATIONS, VALID_SIDES }` from `./rules.js` and
`{ createSerialQueue }` from `./queue.js`. It still makes no `chrome.*` call.

- `DRAFT_VERSION = 2`.
- `draftKeyFor(profileId)`: `"new"` for null or undefined, otherwise
  `String(profileId)`. Moved here from `popup.js`, which imports it.
- `formToDraft({ editingProfileId, baseDigest, name, domains, rows })`: as
  today, plus `baseDigest: baseDigest ?? null`.
- `isValidDraft(draft)`: as today, plus three rules.
  - A draft whose `editingProfileId` is null must have a null `baseDigest`.
  - A draft whose `editingProfileId` is a number must have a string
    `baseDigest`.
  - Every row's `side` must be in `VALID_SIDES`, and its `operation` in
    `VALID_OPERATIONS`.

  The digest's format is not checked here. `checkEditBase` fails closed on
  anything that is not an exact match.
- `draftToForm(draft)`: as today, plus `baseDigest`.
- `draftFor(drafts, profileId)`: the draft stored under
  `draftKeyFor(profileId)`, if it is valid and its `editingProfileId` equals
  `profileId ?? null`; otherwise null. A missing or non-object map gives
  null.
- `async baseForEditor(restored, profile, digestOf)`: the restored form's
  `baseDigest` when there is a restored form; otherwise `digestOf(profile)`
  for a profile, or null. `digestOf` is passed in (`profileDigest` from
  `canonical.js`), so `draft.js` does not import the canonical chain.
- `async retainDraftsFor(drafts, profiles, digestOf)`: a new map holding
  only
  - the valid new-profile draft under `"new"`, and
  - each valid draft whose key equals `draftKeyFor(draft.editingProfileId)`,
    whose profile is in `profiles` by id, and for which `digestOf(profile)`
    equals its `baseDigest`.

  A `digestOf` rejection drops that draft: it fails closed, and never
  throws. The map passed in is not mutated.
- `createDraftStore({ read, write })` returns `read()`, `put(key, draft)`,
  `drop(key)` and `rebase(profiles, digestOf)`.
  - Every call runs through one `createSerialQueue`, so no call overlaps
    another and each one sees the calls before it.
  - Each read-modify-write reads the stored map, changes it and writes it.
    A missing or non-object stored value reads as `{}`. A read that REJECTS
    rejects the call, and nothing is written.
  - `drop` writes nothing when the key is absent, and resolves whether it
    wrote.
  - `rebase` applies `retainDraftsFor`, writes only when something was
    removed, and resolves the removed keys.
  - Each call's promise settles with its own outcome. A failure does not
    block the next call.
- `createDraftSession(store)` returns `open(profileId)`, `put(draft)` and
  `end()`.
  - `open` keys the session by `draftKeyFor(profileId)`.
  - `put` writes through `store.put` under that key and resolves true. On a
    closed session it resolves false without touching the store.
  - `end` closes the session synchronously, THEN issues `store.drop(key)`
    and returns it. On a closed session it resolves false.

`sideOf` stays injected, unchanged. The paragraph explaining the injection
is rewritten, because `draft.js` now imports `rules.js`, and its pointer to
`canonical.js` becomes `collisions.js`.

### `extension/popup/popup.js`, the wiring

- It imports `draftKeyFor`, `draftFor`, `baseForEditor`, `createDraftStore`
  and `createDraftSession` from `../lib/draft.js`. Its own `draftKeyFor`,
  `putDraft` and `dropDraft` are removed.
- One store, and one session on it:

      const draftStore = createDraftStore({
        read: async () =>
          (await chrome.storage.session.get(STORAGE_KEY_DRAFTS))?.[STORAGE_KEY_DRAFTS],
        write: (drafts) => chrome.storage.session.set({ [STORAGE_KEY_DRAFTS]: drafts }),
      });
      const draftSession = createDraftSession(draftStore);

- `getDrafts()`: `return await draftStore.read();`, inside today's catch (a
  failed read logs and returns `{}`).
- `renderProfileCard`: `const draft = draftFor(drafts, profile.id);`.
- `openEditor`: `const restored = draftToForm(draftFor(drafts, editingProfileId));`,
  then later `editingBaseDigest = await baseForEditor(restored, profile, profileDigest);`,
  then `draftSession.open(editingProfileId);`, then `showView("edit");`.
- `persistDraft`:
  `await draftSession.put(formToDraft({ ...readFormRaw(), baseDigest: editingBaseDigest }));`,
  inside today's try/catch. Today's edit-view check is removed: a closed
  session is the rule now.
- `saveProfile`: `await draftSession.end();` where `dropDraft` was, after
  `await setProfiles(nextProfiles)` and before `showView("list")`.
- Cancel: `await draftSession.end();` where `dropDraft` was.
- `revertToSaved`: it begins with `await draftSession.end();`. After the base
  is recaptured, the form repainted and the error hidden, it calls
  `draftSession.open(editingProfileId);`, before `await renderList();`.
- `deleteProfile`: after `await setProfiles(nextProfiles);`, and before
  `runThenAlways`:

      try {
        await draftStore.drop(draftKeyFor(id));
      } catch (err) {
        console.error(…);
      }

- `applyImport`: the same shape with
  `await draftStore.rebase(nextProfiles, profileDigest);`, after
  `await setProfiles(nextProfiles);` and before `hideIoUi()` and
  `runThenAlways`.
- No comment goes inside those `try` blocks, and no comment quotes a
  statement §3 scans for. So the scans read the same with and without the
  comment strip.

### What does not change

- **The failure behaviour of Save, Cancel and Revert.** If their draft drop
  fails, the error propagates, as `dropDraft`'s did. The view does not
  switch, and on Save grant reconciliation is skipped. That is
  FINDING-046's class and it predates s3. It was found while designing this
  file and is proposed as a new row (ruling pending), not changed here.
- No user-facing copy. `sw.js` and `popup.html` are untouched. No new
  shipped file: `extension/` stays at 18 files, and the module-syntax gate at
  24.
- FINDING-042's own limit stands: a write dispatched as the popup closes may
  not land.

### Known limits, stated

- Keystrokes typed while a Save is writing are not kept.
- A draft orphaned by another writer's delete is not purged. If its id is
  reused, it restores into the new profile's editor, and Save refuses it.
  FEAT-1's durable profileUid closes this; s3 does not.
- The popup can close between a profile write and its draft cleanup. S3-D1's
  binding catches the leftover draft.
- For a restored draft, "changed after you opened it" means "changed since
  this edit began".

### Commits and method

- This file is the first s3 commit, on its own. The project-planning commit
  after it records the rulings in `decisions.md` and edits NEXT.md's FIRST
  ACTIONS item 4.
- Then, in the container:
  1. the checks and mutants below are written and run RED against the
     unchanged product, and the red run is recorded under §3;
  2. then the product code;
  3. then green and the mutants, recorded under §4 and §5.
- One AR-02 code commit carries: `draft.js`, `rules.js`, `popup.js`,
  `selftest.mjs`, `mutate-collisions.py`, this file's outcomes, `LEDGER.md`
  and `FINDINGS.md` (FINDING-048). In `LEDGER.md`:
  - AR-02 → `fixed-unverified`, prior `FINDING-042, FINDING-048`, evidence
    stays `reproduced`;
  - the two S3-D6 rows;
  - the target summary goes 48 → 50.
- Browser evidence comes from a later s3 sitting, on Chrome 154, with its
  own runbook frozen before Chrome opens.
- New `lib/` symbols reach `selftest.mjs` through namespace imports
  (`import * as draftLib`, `import * as rulesLib`). A missing export then
  reads as FAIL lines, not a link-time crash.
- No check may pass on two failures. Each negative check first requires its
  positive control to hold: the valid draft, the draft rebase keeps, a real
  digest.
- Every fixture is checked storable before the red run is trusted.

## 3. Checks, numbered, with the predicted red result

Checks 1–50 are new. They run in one `async function ar02Checks()`, called
after `profileDigestChecks()`. `EXPECTED_CHECKS` goes 556 → 606.

Shorthand:
- `B(c)` is `"sha256:profile-v1:" + c.repeat(64)`, a well-formed stand-in,
  not a real digest.
- `d3` is `formToDraft` of a one-row form for profile 3, with base `B("3")`.
  `d5` is the same for profile 5, with base `B("5")`.
- `dNew` is `formToDraft` of a one-row form for a new profile, base omitted.

### Format and validity (S3-D1, S3-D5): 9 checks

| # | Check | Red |
| --- | --- | --- |
| 1 | `DRAFT_VERSION` is 2 | FAIL |
| 2 | `draftToForm(d3).baseDigest` is `B("3")` | FAIL |
| 3 | `dNew.baseDigest` is null, and `dNew` is valid | FAIL |
| 4 | `d3` is valid, and `d3` with a null base is refused | FAIL |
| 5 | `dNew` is valid, and `dNew` with base `B("n")` is refused | FAIL |
| 6 | `d3` is valid, and `d3` with `version: 1` is refused | FAIL |
| 7 | `d3` is valid, and `d3` with a row whose side is `sideways` is refused | FAIL |
| 8 | `d3` is valid, and `d3` with a row whose operation is `delete` is refused | FAIL |
| 9 | a draft for profile 3 holding all six side and operation pairs the form offers is valid | pass |

### Identity (S3-D1): 5 checks

| # | Check | Red |
| --- | --- | --- |
| 10 | `draftKeyFor` gives `"new"` for null and for undefined, and `"3"` for 3 | FAIL |
| 11 | `draftFor({3: d3}, 3)` is `d3`, and `draftFor({3: d3}, 4)` is null | FAIL |
| 12 | `draftFor({5: d5}, 5)` is `d5`, and `draftFor({3: d5}, 3)` is null | FAIL |
| 13 | `draftFor({3: d3}, 3)` is `d3`, and `draftFor` over `d3` with `version: 1` under key 3 is null | FAIL |
| 14 | `draftFor({new: dNew}, null)` is `dNew` | FAIL |

### Binding (S3-D1): 4 checks

Real digests of `old2` and `new2`. `stale` is a draft for profile 2 with
base `digest(old2)` and value `staging-EDITED`.

| # | Check | Red |
| --- | --- | --- |
| 15 | `baseForEditor(draftToForm(stale), new2, profileDigest)` is `digest(old2)`, which differs from `digest(new2)` | FAIL |
| 16 | with that base, `checkEditBase([new2], 2, base)` is refused as `changed`: §0's overwrite no longer happens | FAIL |
| 17 | `baseForEditor(null, new2, profileDigest)` is `digest(new2)` | FAIL |
| 18 | `baseForEditor(null, null, …)` and `baseForEditor(draftToForm(dNew), null, …)` are both null | FAIL |

### Import rebase (S3-D3): 7 checks

The imported set is `[P2, P4new, P7]`. The drafts:
- `2`, base `digest(P2)`;
- `4`, base `digest(P4old)`;
- `6`, base `digest(P6)`;
- `new`, which is `dNew`;
- `7`, base `digest(P7)`, with one row whose operation is `delete`;
- under key `8`, a draft naming profile 2, base `digest(P2)`.

| # | Check | Red |
| --- | --- | --- |
| 19 | `2` is kept, as the same object | FAIL |
| 20 | `2` is kept and `4` is dropped (its profile changed) | FAIL |
| 21 | `2` is kept and `6` is dropped (its profile is not imported) | FAIL |
| 22 | `new` is kept | FAIL |
| 23 | `2` is kept, and `7` (invalid) and `8` (wrong key) are dropped | FAIL |
| 24 | with a `digestOf` that rejects for profile 2 only, over drafts `2` and `4` (base `digest(P4new)`) and the set `[P2, P4new]`: `4` is kept, `2` is dropped, and nothing throws | FAIL |
| 25 | the drafts map passed in is unchanged afterwards, and a map came back | FAIL |

### Store ordering (S3-D4): 7 checks

A fake storage takes its snapshot when a read is called, answers after a
per-call delay, and counts writes. "Delays [10, 0]" means the first read
answers after 10 ms and the second at once.

| # | Check | Red |
| --- | --- | --- |
| 26 | delays [10, 0]: `put("3")` and `put("new")` issued together leave both stored | FAIL |
| 27 | delays [10, 0]: `put("3")` then `drop("3")`, issued together, leave no `3` | FAIL |
| 28 | delays [10, 0]: `put("3")` then `read()`, issued together: the read sees `3` | FAIL |
| 29 | the first write fails: `put("3")` rejects, a following `put("new")` lands, and `3` is not stored | FAIL |
| 30 | with `{2}` stored and the first read failing: `put("3")` rejects, nothing is written, and storage still holds exactly `{2}` | FAIL |
| 31 | with `{2}` stored: `drop("3")` writes nothing | FAIL |
| 32 | with `{2, 4}` stored (bases `digest(P2)` and `digest(P4old)`): `rebase([P2, P4new], profileDigest)` resolves `["4"]`, and storage then holds only `2` | FAIL |

### Session (S3-D4): 4 checks

| # | Check | Red |
| --- | --- | --- |
| 33 | `open(3)` then `put(d3)`: resolves true, and `3` is stored | FAIL |
| 34 | `open(null)` then `put(dNew)`: `new` is stored | FAIL |
| 35 | `open(3)`, `end()`, then `put(d3)` straight after: the put resolves false, and `3` is never stored | FAIL |
| 36 | `open(3)`, `put(d3)`, then `end()` straight after: storage was written, and holds no `3` | FAIL |

### One definition of the sets (S3-D5): 2 checks

| # | Check | Red |
| --- | --- | --- |
| 37 | `rules.js` exports `VALID_SIDES` as {request, response} and `VALID_OPERATIONS` as {set, append, remove} | FAIL |
| 38 | comment-stripped `draft.js` imports both sets from `./rules.js` and declares neither | FAIL |

### Wiring, scanned on comment-stripped `popup.js`: 12 checks

| # | Check | Red |
| --- | --- | --- |
| 39 | the import block that brings `formToDraft` also brings `draftKeyFor`, `draftFor`, `baseForEditor`, `createDraftStore` and `createDraftSession` | FAIL |
| 40 | `openEditor` holds `const restored = draftToForm(draftFor(drafts, editingProfileId));` | FAIL |
| 41 | in `openEditor`, `draftSession.open(editingProfileId);` comes before `showView(` | FAIL |
| 42 | `persistDraft` holds `await draftSession.put(formToDraft({ ...readFormRaw(), baseDigest: editingBaseDigest }));` | FAIL |
| 43 | in `saveProfile`: `await setProfiles(nextProfiles)`, then `await draftSession.end();`, then `showView(` | FAIL |
| 44 | Cancel: `await draftSession.end();` directly before `setRestoredNotice(false);` and `showView(` | FAIL |
| 45 | in `revertToSaved`: `await draftSession.end();`, then `const profile = profiles.find(`, then the base recapture, then `draftSession.open(editingProfileId);` | FAIL |
| 46 | in `deleteProfile`: `await setProfiles(nextProfiles);`, then a `try` holding only `await draftStore.drop(draftKeyFor(id));` whose `catch` only logs, then `await runThenAlways(` | FAIL |
| 47 | in `applyImport`: the same shape with `await draftStore.rebase(nextProfiles, profileDigest);` | FAIL |
| 48 | `renderProfileCard` holds `const draft = draftFor(drafts, profile.id);` | FAIL |
| 49 | `getDrafts` holds `return await draftStore.read();` | FAIL |
| 50 | exactly one `createDraftStore(` call, and `const draftSession = createDraftSession(draftStore);` | FAIL |

None of checks 39–50 depends on the contents of a double-quoted string in
`popup.js`.

### Existing checks that change

- **s2 check 39**, "AR-01b: openEditor captures the base digest before the
  form is shown". Its pattern becomes
  `editingBaseDigest = await baseForEditor(restored, profile, profileDigest);`,
  still required before `showView("edit")`. Red: **FAIL**.
- **The F042 fixtures** `rawForm`, `untouched` and `edited` gain a
  `baseDigest` (a `B(…)` stand-in). No check's meaning changes. Red: pass.
- **The five F042 round-trip checks** gain `roundTripped !== null &&`.
  Without it, an unrestorable draft throws at top level and crashes the
  suite, so several s3 mutants would read as CRASHING instead of being
  counted. The standing rule applies: a check must FAIL, never THROW. Red:
  pass.
- **"F042: a draft matching the saved profile is not marked unsaved"** gains
  `isValidDraft(untouched) &&`, so an invalid draft cannot pass it
  vacuously. Red: pass.

**Red run: `selftest: 50 of 606 checks FAILED`.** That is checks 1–8 and
10–50, plus s2 check 39. No crash.

**Other gates on the red tree: 4 of 7 fail.**
- selftest.
- mutate-collisions: PATCH DID NOT APPLY for every s3 mutant, and for s2
  M13's rewritten anchor, because their code does not exist yet.
- mutate-grants and mutate-scans: their pinned counts shift by the red
  baseline.

module-syntax, oracle-selfcheck and initiator-selfcheck pass.

> **Outcome (red, 2026-09-29): as predicted, `selftest: 50 of 606 checks
> FAILED`.** The failures were checks 1–8 and 10–50, plus s2 check 39, each
> read by name. Check 9 passed. No crash.
>
> **Outcome (red tree, all gates): 4 of 7 failed, as predicted, and for the
> predicted reasons.** selftest (`checks FAILED`); mutate-collisions
> (`PATCH DID NOT APPLY`); mutate-grants and mutate-scans (`MUTANTS NOT
> MATCHING EXPECT`). module-syntax (24 files), oracle-selfcheck and
> initiator-selfcheck passed.
>
> **WRONG in one clause:** "PATCH DID NOT APPLY for every s3 mutant". 38 of
> the 40 did not apply, and neither did s2 M13's rewritten anchor, but **M33
> and M39 did.** Each anchors on a profile write that exists before s3
> (`saveProfile`'s and `applyImport`'s) and inserts a draft call ahead of it,
> so its anchor was never s3 code. On the red tree both failed checks, like
> every other mutant, because of the red baseline.

## 4. Green, predicted

- `selftest: 606/606 checks passed`. `verify.mjs`: all 7 gates, 606 checks,
  171 mutation scenarios.
- **mutate-scans: no row moves.** "the comment stripper also eats string
  literals" stays at 19, because no new check reads inside a double-quoted
  string. "the comment strip is removed" stays at 0.
- **mutate-grants: no row moves.**
- No existing check changes beyond §3's list.

> **Outcome (green, 2026-09-29): as predicted.** `selftest: 606/606 checks
> passed`. `verify.mjs`: all 7 gates pass, `tree: 606 checks, 171 mutation
> scenarios, 7 gates`. mutate-scans: all 8 rows matched their pinned
> expects; "the comment stripper also eats string literals" read 19, and
> "the comment strip is removed" read 0. mutate-grants: all 7 rows
> unchanged. No existing check changed beyond §3's list.

## 5. Mutants, added to `test/mutate-collisions.py`, with predicted fails

Each mutant must fail at least one check; that is the harness's verdict. The
counts and check numbers are predictions. Mutation scenarios go 131 → 171.

**`draft.js`**

| M | Mutant | Predicted fails |
| --- | --- | --- |
| 1 | `DRAFT_VERSION` stays 1 | 3 (1, 6, 13) |
| 2 | `formToDraft` drops the base | 28 (2–9, 11–16, 19–24, 32, and seven F042 checks: the five round-trip checks and the two marker checks) |
| 3 | `draftToForm` drops the base | 4 (2, 15, 16, 18) |
| 4 | `isValidDraft` ignores the side set | 1 (7) |
| 5 | `isValidDraft` ignores the operation set | 2 (8, 23) |
| 6 | `isValidDraft` accepts a profile draft with no base | 1 (4) |
| 7 | `isValidDraft` accepts a new-profile draft carrying a base | 1 (5) |
| 8 | `draftFor` ignores which profile the draft names | 1 (12) |
| 9 | `draftFor` skips validation | 2 (11, by a throw on the absent key; 13) |
| 10 | `baseForEditor` binds a restored draft to the profile shown (the s2 gap) | 2 (15, 16) |
| 11 | rebase keeps a draft whose profile the import changed | 2 (20, 32) |
| 12 | rebase keeps a draft whose profile the import lacks | 1 (21) |
| 13 | rebase drops the new-profile draft | 1 (22) |
| 14 | rebase throws when a digest fails | 1 (24) |
| 15 | rebase keeps a draft stored under another profile's key | 1 (23) |
| 16 | the store runs its calls without the queue | 4 (26, 27, 28, 36) |
| 17 | the store reads a failed read as empty (today's `getDrafts`) | 1 (30) |
| 18 | `drop` writes when its key is absent | 1 (31) |
| 19 | `put` swallows a failed write | 1 (29) |
| 20 | store `rebase` never writes its result | 1 (32) |
| 21 | the session accepts writes after it ends | 1 (35) |
| 22 | the session closes only after its drop lands | 1 (35) |
| 23 | ending the session does not drop its draft | 1 (36) |
| 24 | a new profile's session is keyed `"null"` | 1 (34) |
| 25 | `draft.js` declares its own sets instead of importing them | 1 (38) |

**`popup.js`**

| M | Mutant | Predicted fails |
| --- | --- | --- |
| 26 | `getDrafts` reads storage directly, outside the queue | 1 (49) |
| 27 | the session is given a store of its own | 1 (50) |
| 28 | `openEditor` restores by key, bypassing `draftFor` | 1 (40) |
| 29 | `openEditor` binds to the profile shown (the s2 line, restored verbatim) | 1 (s2 check 39) |
| 30 | `openEditor` never opens the session | 1 (41) |
| 31 | `persistDraft` writes without the base | 1 (42) |
| 32 | `persistDraft` writes to the store directly, bypassing the session | 1 (42) |
| 33 | `saveProfile` ends the session before the profile write | 1 (43) |
| 34 | Cancel leaves the session open | 1 (44) |
| 35 | `revertToSaved` never reopens the session | 1 (45) |
| 36 | `deleteProfile` does not purge | 1 (46) |
| 37 | a failed purge is rethrown and fails the delete | 1 (46) |
| 38 | `applyImport` does not check drafts again | 1 (47) |
| 39 | `applyImport` checks drafts again before the profile write | 1 (47) |
| 40 | the card reads its draft by key, bypassing `draftFor` | 1 (48) |

**Changed:** s2 M13, "openEditor captures the base after the form is shown".
Its anchor is rewritten to the new capture line, and it still moves the
capture after `showView("edit")`. Predicted: 1 (s2 check 39), as in s2.

No mutant crashes.

> **Outcome (mutants, 2026-09-29): every prediction held, counts and checks
> exactly.** All 40 s3 mutants and s2 M13 applied, each failed at least one
> check, and none crashed. Every failing check was read by name: a scratch
> runner applied each mutant to a throwaway copy and printed its failures by
> check number. M2's seven F042 failures are the five round-trip checks and
> the two marker checks. Mutation scenarios: 131 → 171.

## 6. Outcomes

(Recorded under each prediction above, after the code runs.)
