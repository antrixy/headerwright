# PREDICTIONS — s2 code: AR-01 and AR-01b — 2026-09-27

> **FROZEN ON COMMIT.** Written against `6b4e04fb17f0d628a061bd666bb9e3e4aa6d6a16`
> before any line of the change exists, test or product. Nothing below may be
> edited after the code runs. Outcomes are recorded UNDER each prediction, and
> a wrong prediction keeps its original wording.
>
> Rulings: D1–D4, ruled by Ash on 2026-09-27 "as recommended", before this
> file was written. They go into `antrixy/project-planning` `decisions.md` at
> the end of the session. The order (s2 code before GATE-0) was ruled the same
> day. GATE-0 still closes before v0.2.2 is packaged, because of validator
> check 3. No version bump, no packaging, no s3 code in this session.

## 0. Baseline, measured before this file was written

- `node test/verify.mjs` on the attached archive of `6b4e04f`: all 7 gates
  pass, 513 checks, 116 mutation scenarios.
- AR-01 reproduced with LEGAL values against `lib/status.js` as shipped.
  Configuration A has one header `x-a` set to `v;request|x-b|set|w`, which
  passes `validateHeaderEntry`. Configuration B has two headers, `x-a` = `v`
  and `x-b` = `w`. Both give `configRevision(…, true)` = `2c9212ae`.
- `validateProfile` accepts a profile name containing `:`, `;` or `\u0000`.
  `isValidHeaderName` accepts `|`. Each field separator the current encoding
  uses can therefore appear inside a field.
- `profile-v1` known answer, computed from its definition with existing code
  only, and cross-checked with Python `hashlib`:
  - profile `{id: 7, name: "Staging API", domains: ["api.example.com"],
    headers: [{name: "X-Env", operation: "set", value: "staging"},
    {name: "Server", operation: "remove", side: "response"}]}`
  - canonical text: 277 bytes
  - SHA-256: `01dda2ccd1c1d721b1d2efdd37e7d5996906e66b864a9a6cbf30cfe9fbfc82b9`

## 1. Design, fixed before the build

### AR-01, `extension/lib/status.js` (D1)

- New export `configRevisionText(profiles, enabled)` returns `JSON.stringify`
  of `[enabled ? "on" : "off", [[id, name, domains, [[side ?? "request",
  name, operation, value ?? ""], …]], …]]`.
- **Only the encoding changes.** The fields, the defaults (`side ?? "request"`,
  `value ?? ""`) and storage order are exactly what the current function
  reads. There is no sorting and no normalization, and it cannot throw on
  decoded profiles.
- `configRevision` becomes FNV-1a over `configRevisionText`, with the same
  constants and the same 8-hex output. It stays a status hint. The 2026-09-14
  ruling (content hash, not counter; a collision costs a lagging line) stands.
- Injectivity follows from decodability. JSON is unambiguous for these value
  types, and ids are validated integers, so the `-0` and `NaN` edge cases of
  numbers cannot arise.
- Callers (`sw.js:296`, `popup.js:419`, `popup.js:512`) are unchanged.

### AR-01b, `extension/lib/canonical.js` (D2, D3)

- `PROFILE_DIGEST_PREFIX = "sha256:profile-v1:"`.
- `async profileDigest(profile)` returns `PROFILE_DIGEST_PREFIX` + lowercase
  hex SHA-256 (`crypto.subtle`) of the UTF-8 bytes of
  `stableStringify(canonicalizeProfiles([profile])[0])`.
  - The prefix labels the output. It is not part of the hashed input.
  - Invalid profiles reject, because the canonicalizer throws.
- `async checkEditBase(profiles, id, baseDigest)` returns `{ ok: true }` or
  `{ ok: false, reason }`:
  1. No profile with `id` in `profiles` → `"vanished"`.
  2. `baseDigest` is not a string → `"changed"`.
  3. Digest of the stored target differs from `baseDigest`, or computing it
     throws → `"changed"`.
  4. Otherwise ok.

  It compares the target only. Changes to other profiles, and to storage
  order, do not refuse the edit. This matches FINDING-021's scoping.
- `describeEditRefusal(reason)` returns a full sentence, the convention
  `describeSaveRefusal` uses:
  - `"vanished"`: `Not saved: this profile was deleted after you opened it. Your edits are still in the form; Cancel discards them and returns to the list.`
  - anything else: `Not saved: this profile was changed after you opened it. Your edits are still in the form. Use Revert to saved to load the current version.`

### AR-01b, `extension/popup/popup.js` wiring (D4)

- New module state `let editingBaseDigest = null;`.
- `openEditor` sets `editingBaseDigest = profile ? await profileDigest(profile) : null;`
  BEFORE `showView("edit")`, so the form cannot be saved before its base
  exists. The base is the profile the user was shown.
- `revertToSaved` sets `editingBaseDigest = profile ? await profileDigest(profile) : null;`
  from the profile it has just re-read. Without this, one refusal would make
  every later save refuse.
- `saveProfile`: the edit branch runs
  `const base = await checkEditBase(previousProfiles, editingProfileId, editingBaseDigest);`
  before `nextProfiles` is built. On `!base.ok` it calls
  `showFormError(describeEditRefusal(base.reason))`. On `"changed"` it also
  calls `setRestoredNotice(true)`, because Revert to saved lives in that
  notice and is otherwise hidden. Then it returns: no write, no draft drop,
  no reconciliation.
- **This also closes the silent success on a vanished target.** Today the
  edit branch's `map` changes nothing and still reports success. That is an
  interim-contract line s2 exists to make true.

### Out of scope, stated

- **Drafts do not carry the digest.** That changes the draft format
  (`DRAFT_VERSION`) and belongs to AR-02 (s3), per D2. Until then, a RESTORED
  draft is bound to the stored profile at the moment of opening, not to the
  profile the draft was written against. A draft that outlives an import or
  another edit can still overwrite silently. The LEDGER records this split.
- No new shipped file. `extension/` stays at 18 files, and the
  module-syntax gate stays at 24.
- `sw.js` is untouched.

### Commits and method

- Following s1's shape, there is one commit per row. AR-01 lands first, then
  AR-01b.
- Each row's checks are written and run RED in the container before any
  product code for that row exists. The red run is recorded below.
- The LEDGER row moves to `fixed-unverified` in the same commit as its code.
  AR-01b's evidence goes from `design` to `source`. Browser evidence is a
  later sitting.
- New `lib/` symbols are imported into `selftest.mjs` through namespace
  imports (`import * as …`). A missing export then reads as FAIL lines, not a
  link-time crash, both in the red run and under a mutant that deletes an
  export.
- Every check on the async functions requires a real `sha256:profile-v1:`
  string or a real result object before comparing. Without that,
  THREW === THREW would pass the equivalence checks, and "rejects" would pass
  vacuously, in the red run.

## 2. Checks, numbered, with the predicted red result

### AR-01 — 12 checks, `EXPECTED_CHECKS` 513 → 525

| # | Check | Red |
| --- | --- | --- |
| 1 | the delimiter-in-value pair from §0 gives different revisions | FAIL |
| 2 | one profile whose name contains `\u0000` and the text of a second profile, versus those two profiles, gives different revisions | FAIL |
| 3 | a header name containing `|` versus the two headers it spells out gives different revisions | FAIL |
| 4 | `configRevisionText` exists, and `JSON.parse` of its output deep-equals the projection built independently in the test, over a fixture set of delimiter-heavy configurations (one of them has unsorted headers) | FAIL |
| 5–11 | revision changes when each of these changes: id, name, one domain, header name, operation, side, header order | pass ×7 |
| 12 | an absent `side` and `side: "request"` give the same revision | pass |

**Red run: `selftest: 4 of 525 checks FAILED`.** No crash and no tripwire
line (failures exit before the count check).

> **Outcome (AR-01 red, 2026-09-27): as predicted, `selftest: 4 of 525 checks
> FAILED`, checks 1–4, no crash.** One deviation in the FIXTURE, not the
> result. Check 3's predicted pair spelled two headers through a header name,
> which needs a `;` in the name, and `;` is not an HTTP token character, so
> the pair was not storable. One check-4 fixture also had a NUL in a header
> value, which the validator refuses. Both were found by running every fixture
> through `validateProfile` before trusting the red run. Check 3 now uses a
> storable pair that collides on the old encoding (`7494f90f` for both): header
> name `x|set|v` with value `w`, versus name `x` with value `v|set|w`. Checks
> 1–4 now assert storability as a precondition, so the count stays 12. The red
> run was repeated after the fix: still 4 of 525, the same four checks.

### AR-01b — 30 checks, `EXPECTED_CHECKS` 525 → 555

**Digest (15):**

| # | Check | Red |
| --- | --- | --- |
| 13 | format matches `^sha256:profile-v1:[0-9a-f]{64}$` | FAIL |
| 14 | equals `sha256:profile-v1:` + `node:crypto` SHA-256 of the canonical text (an independent implementation) | FAIL |
| 15 | the §0 known answer, pinned as a literal | FAIL |
| 16 | domain case, order and duplicates give the same digest | FAIL |
| 17 | explicit `side: "request"` and an absent side give the same digest | FAIL |
| 18–25 | digest differs when each of these changes: id, name, domain, header name, operation, value, side, header order | FAIL ×8 |
| 26 | an invalid profile (id 0) rejects, asserted only when the function exists | FAIL |
| 27 | the input is not mutated, asserted only when a digest was produced | FAIL |

**`checkEditBase` (8):**

| # | Check | Red |
| --- | --- | --- |
| 28 | unchanged target → ok | FAIL |
| 29 | target value changed → `changed` | FAIL |
| 30 | target removed → `vanished` | FAIL |
| 31 | a different profile changed → ok | FAIL |
| 32 | storage order changed → ok | FAIL |
| 33 | a lossless difference in the stored target (domain case) → ok | FAIL |
| 34 | `baseDigest` null → `changed` | FAIL |
| 35 | invalid stored target → `changed`, not a throw | FAIL |

**Messages (2):**

| # | Check | Red |
| --- | --- | --- |
| 36 | `changed` starts `Not saved:` and names Revert to saved | FAIL |
| 37 | `vanished` starts `Not saved:` and says the profile was deleted | FAIL |

**Wiring scans on comment-stripped `popup.js` (5):**

| # | Check | Red |
| --- | --- | --- |
| 38 | `popup.js` imports `profileDigest`, `checkEditBase` and `describeEditRefusal` from `../lib/canonical.js` | FAIL |
| 39 | `openEditor` captures the base before `showView("edit")` | FAIL |
| 40 | `revertToSaved` recaptures the base | FAIL |
| 41 | in `saveProfile`, `checkEditBase` precedes `setProfiles`, and the refusal block returns | FAIL |
| 42 | the `changed` refusal calls `setRestoredNotice(true)` | FAIL |

**Red run (on top of green AR-01): `selftest: 30 of 555 checks FAILED`.** No
crash.

> **Outcome (AR-01b red, 2026-09-27): as predicted, `selftest: 30 of 555
> checks FAILED`, checks 13–42, no crash.** Every fixture was run through
> `validateProfile` before the red run was trusted. All were storable except
> the two meant to be invalid (id 0; no headers).
>
> **Addition, not predicted: check 43**, "revertToSaved clears the form
> error". It was found while reading the green wiring. After a "changed"
> refusal, Revert to saved loaded the current version but left the refusal on
> screen, still telling the user to use Revert to saved. `revertToSaved` never
> cleared form errors. That mattered little before s2, and now it is the
> refusal's normal path. The fix and the check were written together, NOT
> check-first. Red was confirmed afterwards by removing the one line:
> `1 of 556`, check 43. The count is now 556.

**Other gates on each red tree.** Run once per row with `verify.mjs`:
- selftest FAILS.
- mutate-scans FAILS, because its exact-count rows see the baseline failures
  added to every mutant.
- mutate-collisions and mutate-grants PASS VACUOUSLY: a red baseline gives
  every mutant at least one failure. Recorded as a property of the harnesses,
  not as coverage.

> **Outcome (AR-01 red tree): WRONG on two of four harnesses.** selftest and
> mutate-scans FAILED as predicted. mutate-collisions also FAILED: the new s2
> mutants' anchors do not exist in the pre-fix `status.js`, so M2 and M3
> reported PATCH DID NOT APPLY. That was foreseeable, because the mutants ship
> in the same commit as the fix. mutate-grants also FAILED: like mutate-scans,
> it pins an exact expected count per mutant, so the red baseline shifted
> every row. **No harness passes vacuously on a red tree of this shape**, and
> 4 of 7 gates were red. The premise that mutate-grants scores "at least one
> failure" was wrong. It was assumed, not read.

## 3. Green, predicted

- After AR-01: 525/525, 7 gates.

  > **Outcome: as predicted.** 525/525; `verify.mjs` all 7 gates pass, 119
  > mutation scenarios.
- After AR-01b: 555/555, 7 gates.
- No mutate-scans row changes its expected count.
- No existing check changes.

> **Outcome (green, both rows).** After AR-01: 525/525, as predicted. After
> AR-01b: **556/556** (555 predicted, plus check 43), `verify.mjs` all 7 gates,
> 131 mutation scenarios. **mutate-scans: WRONG.** "the comment stripper also
> eats string literals" went from 16 to 19. Checks 38, 39 and 42 match inside
> string literals (`"../lib/canonical.js"`, `showView("edit")`, `"changed"`).
> They were read by name, and the row's expect was updated with a dated note.
> The comment above that row already describes this exact error shape. No
> existing check changed.
>
> **AR-01b red tree, all gates:** the same four failed as for AR-01, and for
> the same reasons (selftest; mutate-collisions from unanchored s2 mutants;
> mutate-grants and mutate-scans from exact counts). selftest read
> `31 of 556`, because check 43 existed by then.

## 4. Mutants, added to `test/mutate-collisions.py`, predicted fail counts

Each must fail at least one check (the harness verdict). The counts are
predictions.

| M | Mutant | Predicted fails |
| --- | --- | --- |
| 1 | revision text reverted to a delimiter join | 4 (checks 1–4) |
| 2 | `side` dropped from the revision tuple | 2 (checks 4, 10) |
| 3 | headers sorted by name inside the revision tuple | 2 (checks 4, 11) |
| 4 | digest prefix `profile-v2` | 3 (checks 13–15) |
| 5 | digest over raw `JSON.stringify(profile)`, not canonical text | 5 (checks 14–17, 33) |
| 6 | `checkEditBase` returns ok whenever the target exists (base check, digest and compare all bypassed) | 3 (checks 29, 34, 35) |
| 7 | `checkEditBase` returns ok for a vanished target | 1 (check 30) |
| 8 | `checkEditBase` compares `profiles[0]`, not the target | ≥3 (fixtures put the target second) |
| 9 | `checkEditBase` try/catch removed | 1 (check 35) |
| 10 | the `checkEditBase` call removed from `saveProfile` | 1 (check 41) |
| 11 | refusal block without `return` | 1 (check 41) |
| 12 | `revertToSaved` does not recapture | 1 (check 40) |
| 13 | `openEditor` captures after `showView("edit")` | 1 (check 39) |
| 14 | `changed` refusal does not show the notice | 1 (check 42) |

Mutation scenarios go from 116 to 119 after AR-01 and to 130 after AR-01b.
No mutant crashes.

> **Outcome, M1–M3: as predicted, counts and checks exactly.** M1 fails checks
> 1–4, M2 fails checks 4 and 10, M3 fails checks 4 and 11. Each was read by
> name, not only counted.

> **Outcome, M4–M14, plus M15 (added with check 43).** All 15 s2 mutants
> applied, each failed at least one check, and none crashed. Every failing
> check was read by name.
>
> - **M4: WRONG, 21, not 3.** Every AR-01b check requires a `profile-v1`
>   digest before it compares anything (the §1 guard against THREW ===
>   THREW). A `profile-v2` prefix therefore fails 13–25, 27 and 28–33 and 35,
>   not only the three format checks. The guard was designed in this file and
>   then not counted.
> - **M5: WRONG, 6, not 5.** It also fails check 26: raw `JSON.stringify`
>   never validates, so an invalid profile no longer rejects.
> - **M8: 4, within the "≥3" prediction.** Checks 28, 30, 31 and 33.
>   `[other]` makes `profiles[0]` exist, so vanished is missed too.
> - **Exact, as predicted:** M6 (29, 34, 35), M7 (30), M9 (35), M10 (41),
>   M11 (41), M12 (40), M13 (39), M14 (42).
> - **M15:** revert leaves the refusal on screen → check 43.
>
> Mutation scenarios: 116 → 119 → **131** (130 predicted, plus M15).

## 5. Outcomes

(Recorded under each prediction above, after the code runs.)
