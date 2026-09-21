# PREDICTIONS — readback card (FINDING-040 / FINDING-043) — 2026-09-21

> **FROZEN ON COMMIT.** Written against `28535728214ba53d686efa474565967e1126b9df`
> before any line of the change exists. Nothing below may be edited after the
> code runs. Outcomes are recorded UNDER each prediction, and a wrong
> prediction keeps its original wording.
>
> Ruling: `antrixy/project-planning` `decisions.md`, *HeaderWright v0.2.0 —
> FINDING-040 and FINDING-043 — ruled 2026-09-21*. This file carries
> predictions and the build's design choices. It does not restate the ruling's
> reasoning.

## 1. Design, fixed before the build

**Module.** New pure file `extension/lib/readback.js`. It makes no `chrome.*`
calls, the same split as `status.js` and `draft.js`. Exports:

- `describeReadback({ syncState, rule })` → `{ kind, note, lines }`
  - `syncState` is `classify()`'s output from `lib/status.js`.
  - `rule` is the object `getDynamicRules()` returned for this profile's id,
    or `null`.
- `formatReadbackLine(line)` → string.

**States, and what each card shows:**

| `syncState` | rule for this id | `kind` | lines shown | note |
| --- | --- | --- | --- | --- |
| `stale` | any | `checking` | **none** | "Checking what Chrome has registered…" |
| `paused` | any | `off` | **none** | "Off — nothing registered" |
| `failed` | present | `previous` | yes | "Last registration failed — this is the rule still registered" |
| `failed` | `null` | `none` | none | "No rule registered for this profile" |
| `applied` / `partial` | present | `entries` | yes | none |
| `applied` / `partial` | `null` | `none` | none | "No rule registered for this profile" |
| any | malformed | `unreadable` | none | "Registered rule could not be read" |

**Why `stale` shows nothing.** It closes a hole the ruling did not name. The
popup re-renders on the `hw:profiles` storage change BEFORE the worker has
re-registered. At that instant `getDynamicRules()` still returns the PREVIOUS
rule. Showing it would put the pre-save rule on screen as the answer to "what
did I just save", which is a new false reading. The `hw:sync` write that ends
`stale` is already in `WATCHED_KEYS`, so the card updates without user
action.

**Lines.** Registered order: every `requestHeaders` entry in array order,
then every `responseHeaders` entry in array order. The side comes from WHICH
ARRAY the entry is in, never from anything else. Format:

- `req · set · X-Forwarded-For → "alpha"`
- `res · remove · X-HW-Removable`

The value is `JSON.stringify`-quoted, so an empty value, a leading space, or a
trailing space is visible. The header name prints exactly as `getDynamicRules()`
returns it. Whether Chrome preserves its case is **UNMEASURED** and is a
sitting question, not a design one.

**Popup.**

- `renderListNow()` reads `chrome.declarativeNetRequest.getDynamicRules()`
  ONCE per render and joins it by profile id. It also computes `syncState`
  once, from the same inputs `updateStatusLine()` uses.
- A rejected `getDynamicRules()` does not break the render. Every card gets
  `kind: unreadable`.
- Each line is its own element, set via `textContent`, with class
  `readback-line`.
- CSS: `overflow-wrap: anywhere` and `white-space: normal`. No `nowrap`, no
  `text-overflow` on that class.
- The header count stays on the card.

**Blast radius.** `lib/readback.js` (new), `popup/popup.js`,
`popup/popup.html` (CSS and nothing else), `test/selftest.mjs`,
`test/mutate-collisions.py`, `test/mutate-scans.py`, `test/SMOKE.md` (new
part), `FINDINGS.md`. **No change** to `sw.js`, `rules.js`, `status.js`, or
`manifest.json`. No new permission: `declarativeNetRequest` is already
declared, and extension pages can call `getDynamicRules()`.

## 2. Predictions

**P1.** `node test/verify.mjs` → seven PASS. `module-syntax` 23 → **24**
files. Gates stay at **7**.

**P2.** Every one of the existing 473 checks passes with its assertion
unchanged. `EXPECTED_CHECKS` 473 → **492**: 15 pure checks on `readback.js`
and 4 source scans.

Pure (prefix `RB:`):

1. `applied`, no rule → `none`, zero lines
2. `stale` with a rule present → `checking`, zero lines
3. `paused` with a rule present → `off`, zero lines
4. `applied` with a rule → request lines before response lines, each in
   array order
5. an entry in `responseHeaders` is labelled `res`
6. a `remove` line carries no arrow and no value
7. a `set` with an empty value renders `→ ""`
8. a 40+ character header name appears in full
9. FINDING-040 invisible variant, `set X-HW-Removable present` → the line
   contains `set` and `"present"` and does NOT contain `remove`
10. FINDING-043 pair, `X-Forwarded` and `X-Forwarded-For` → two distinct lines
11. `failed` with a rule → `previous`, lines present, note present
12. `partial` with a rule → `entries`
13. a value with leading and trailing spaces survives inside the quotes
14. a rule whose `action.requestHeaders` is not an array → `unreadable`, no
    throw
15. a rule with neither array → `none`

Source scans. Each is bound to the statement that does the thing, not to a
substring that names it:

16. `renderProfileCard` CALLS `describeReadback(`
17. `renderListNow` CALLS `chrome.declarativeNetRequest.getDynamicRules()`
18. the `.readback-line` rule has `overflow-wrap: anywhere` and no `nowrap` or
    `text-overflow`
19. readback lines are written with `textContent`, never `innerHTML`

**P3.** The pinned stripper count in `mutate-scans.py` moves **15 → 19**,
because all four scans read `popup.js` or `popup.html` as text.

**P4.** Mutation scenarios 104 → **116**. All twelve new mutants are caught.

- In `mutate-collisions.py`, oracle ≥ 1 failure:
  - M1 `stale` renders lines
  - M2 `paused` renders lines
  - M3 side taken from the wrong array
  - M4 name cut to 8 characters
  - M5 value dropped from `set` lines
  - M6 response lines emitted before request lines
  - M7 `failed` hides the registered lines
  - M8 the malformed-rule guard removed
- In `mutate-scans.py`, pinned expect:
  - M9 the call site deleted with the import kept AND a comment naming
    `describeReadback(`
  - M10 `getDynamicRules()` replaced by a storage read
  - M11 `nowrap` plus `text-overflow: ellipsis` added to `.readback-line`
  - M12 `textContent` swapped for `innerHTML`

**P5.** `test/release-consistency.mjs` passes unchanged. **Lowest confidence
of the five.** Its coverage tripwires were built to catch drift that nobody
predicted, and a new user-visible surface is exactly the kind of fact it might
register.

## 3. Outcomes

Recorded 2026-09-21 on the change built against `e7fc1d5`, which is `2853572`
plus this file. Sections 1 and 2 above are unedited.

**P1 — CORRECT.** Seven PASS. `module-syntax` 24 files, 7 gates.

**P2 — CORRECT on the count, with one check rewritten before it was trusted.**
`EXPECTED_CHECKS` 492. All 473 pre-existing checks pass with their
assertions unchanged. Check 19's first form was `!/innerHTML/` over
`renderProfileCard`. `mutate-scans.py`'s pre-FINDING-032 row ("the comment
strip is removed", expect 0) went to 1 on it. The cause was the existing
comment *textContent, never innerHTML* in that same function: with comments
unstripped, the guard fired on its own explanation. It is now bound to the
ASSIGNMENT, `/\.innerHTML\s*\+?=/`, and that row is back to 0. This is the
use-versus-mention weakness again, found by mutation again, on a check written
to pin that exact property.

**P3 — WRONG. Original wording:** "The pinned stripper count in
`mutate-scans.py` moves **15 → 19**, because all four scans read `popup.js`
or `popup.html` as text." **Measured 16.** The stripper mutant blanks STRING
CONTENTS in `popupJs`. A scan moves the number only if it matches inside a
string literal, and only check 19 does (`"readback-line"`). Reading the file
as text is not enough. Same shape as the 17-vs-15 miss on 2026-09-13. The
reasoning was about what a scan reads, when the mutant is about what it
matches.

**P4 — CORRECT.** 104 → 116 scenarios, all twelve caught.

| mutant | harness | failures |
| --- | --- | --- |
| M1 | `mutate-collisions.py` | 1 |
| M2 | `mutate-collisions.py` | 1 |
| M3 | `mutate-collisions.py` | 3 |
| M4 | `mutate-collisions.py` | 4 |
| M5 | `mutate-collisions.py` | 5 |
| M6 | `mutate-collisions.py` | 2 |
| M7 | `mutate-collisions.py` | 1 |
| M8 | `mutate-collisions.py` | 1 |
| M9 | `mutate-scans.py` | 1 (expect 1) |
| M10 | `mutate-scans.py` | 1 (expect 1) |
| M11 | `mutate-scans.py` | 1 (expect 1) |
| M12 | `mutate-scans.py` | 1 (expect 1) |

**M6's first draft did not implement M6.** It emptied the request list
instead of reordering it, which is a different mutant that any line-count
check would catch. Found by reading the patch before any harness ran, and
rewritten to swap the two loops, which is what M6 says. Recorded because a
mutant that is easier to catch than its name claims inflates coverage
silently.

M1, M2 and M7 are each caught by exactly ONE check. Those are the constraints
the ruling calls non-negotiable (stale and paused show nothing, and failed
keeps the lines), and each rests on a single assertion. That is thin, but it
is not uncovered.

**P5 — PASSES, and the pass is hollow.** `release-consistency` is green.
It did not notice a new user-visible surface, because its registry enumerates
capabilities and artifacts, not popup surfaces. R15's own wording includes
"visible popup features", and this is the first one added since R15 existed.
`README.md`'s *What you see is what's true* section says nothing about the
readback, and nothing flagged that. **Open before the tag:** one README
sentence, and a decision on whether R15's registry should enumerate popup
surfaces.

**Outside the frozen design, stated rather than folded in:**

- The master toggle handler now calls `renderList()` instead of
  `updateStatusLine()`. Without it, every card would keep claiming its rule is
  registered for the moment between the toggle and the worker's sync write.
  Blast radius is unchanged (`popup.js`), but it is a behaviour change the
  design did not list.
- `updateStatusLine`'s comment described "the line 798 caller" that makes its
  own permission pass. That caller was the toggle handler, now gone, so the
  comment is corrected in the same change.

**Not yet exercised anywhere:** the card rendering itself. No gate renders
`popup.html`. The source scans pin the wiring, and `SMOKE.md` Part 16 is the
first place the card will actually be seen.
