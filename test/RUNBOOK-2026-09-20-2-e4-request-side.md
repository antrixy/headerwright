# Runbook — E4 and the request-side pair, 2026-09-20 (second sitting of the day)

**COMMIT THIS FILE BEFORE CHROME OPENS.** Every row carries a prediction
written in advance, per mechanism where the mechanisms disagree.

**Counts are NOT written here.** `node test/verify.mjs` prints a `tree:` line.
Quote that line into the results.

> **SITTING RUN 2026-09-20 afternoon. E4 FAILED ITS PREDICTION AND FINDING-035
> IS WITHDRAWN.** Response-side `remove` was never broken. E5, added
> mid-sitting and registered with its prediction before the press, reproduced
> C8's entire verdict line from a mis-built entry. The real defect is
> FINDING-040. **R1 and R2 were NOT RUN** — the stop gate written into E4 held,
> and their predictions were written against a mechanism that no longer exists.

## Why this sitting exists

Two open questions, one instrument, one sitting.

**E4 closes a hole in FINDING-035's evidence.** The mechanism established on
2026-09-20 — an earlier `set` in a rule's `responseHeaders` array suppresses
every later `remove`, including on a different header — was formulated
MID-SITTING, after M1, M2 and M3 had all fallen. Two of the three rows that
established it matched no registered prediction. By this project's own standard
that is believed, not established. E4 is C8's exact shape with the prediction
committed here, in advance, before Chrome opens.

**The request-side pair asks whether FINDING-036 is the same mechanism.**
036's single sighting is `append` then `set` on ONE header, request side, with
the `set` discarded. That shape is covered by Chrome's documented
cross-rule precedence and proves nothing about scope. The question the response
side already answered — **is the suppression per-header or per-rule?** — has
never been asked on the request side, and it is the question that decides
whether 035 and 036 merge.

**Do not merge the findings before these rows are read.** A family resemblance
is not a mechanism.

## Instrument

`test/oracle/server.mjs` on 8787, for all three rows.

- **Response rows (E4):** the Measure — plain case button, as in E1/E2/E3.
- **Request rows (R1, R2):** NAVIGATE to `http://hw.test:8787/echo?case=plain`
  and read `requestHeaders` in the JSON body — `req.rawHeaders`, every header
  Chrome sent. **Not** the Measure button; no client reads that field. Same
  instrument and same ruling C9 used
  (`decisions-entry-c9-instrument-and-header.md`).

**Headers, and why each.** `X-Forwarded-For` is in
`APPENDABLE_REQUEST_HEADERS` and absent by default, so an `append` cannot be
confounded by a browser default — C9's ruling, unchanged. `X-HW-Probe` is the
existing probe row and takes `set` on any name. `Accept-Language` is sent by
Chrome on every request, which is what makes a request-side `remove`
observable at all: removing a header that was never sent is a no-op and
indistinguishable from a suppressed removal.

## Before Chrome

Each check precedes the thing it qualifies.

- [x] `cd ~/headerwright && git pull --ff-only`, then
      `git log -1 --format='%H %ad'`. Record the sha AND its date.
      **Done.** `7e0280ec4d930f53faebad92c3af55e753e27d75`, Sun Sep 20
      12:22:22 2026 -0500. Pull range `67035ae..7e0280e` — four commits behind,
      so this clone had not seen the FINDING-037 fix, the FINDING-039 work or
      this runbook until the pull.
- [x] `node test/verify.mjs` → seven PASS. Quote the `tree:` line. Expect
      `447 checks`; `440` or `445` means this runbook's tree is not the one
      running.
      **Done.** Seven PASS. `tree: 447 checks, 104 mutation scenarios, 7
      gates`.
- [x] **Restart both instrument servers after the pull.** FINDING-037:
      `server.mjs` is evaluated once at startup. Before killing anything,
      capture provenance — `ps -o pid,lstart,command -p <PID>` and
      `lsof -p <PID> -d cwd`. Two sittings have now lost this.
      **Servers restarted: oracle pid 19402, initiator pid 19404.
      PROVENANCE NOT CAPTURED — THIRD SITTING RUNNING.** The commands were
      given and not run before the kill. Nothing here depends on it, but the
      checklist item has now failed three times and should be treated as a
      checklist that does not work rather than as an operator lapse.
- [x] **`node test/preflight.mjs` → PREFLIGHT PASSES.** This replaces the curl
      step used in the previous runbook. It checks what is RUNNING, not what is
      on disk: digests, each selfcheck against its own live process, and the
      hostnames the browser will type. **A failure here means do not open
      Chrome.**
      **PREFLIGHT PASSES**, first use of the command. Oracle pid 19402, build
      `bbf78ddbddf8`, selfcheck 13/13 against that process, `hw.test:8787`
      resolving to it. Initiator pid 19404, build `1e6dc8fd662c`, 12/12, both
      `hw.test:8790` and `nothw.test:8790` resolving. The `000` curl that
      opened the morning sitting had no equivalent here: the race and the
      hosts-file question are both inside the command now.
- [x] Extension ID recorded. Expect `khjeofpciphjaclledledepfppaiicnf`.
      **The name will now read `HeaderWright — Modify HTTP Headers`** — that is
      FINDING-039's fix landing, not a different extension.
      **ID correct. THE NAME DID NOT CHANGE** — the card still read
      `HeaderWright — Modify HTTP Request Headers` with the pre-039
      description. Chrome does not reload an unpacked extension when its files
      change on disk, so the loaded build predated the pull. Raised as
      FINDING-041.
      **Checked rather than assumed that this was harmless:**
      `git diff 58889bb HEAD -- extension/` returns `manifest.json` alone,
      changed only in `name` and `description`. Every behavioural file —
      `rules.js`, `popup.js`, `sw.js`, `collisions.js`, `queue.js` — is
      byte-identical to the v0.2.0 candidate C8 and C9 were read on. **The
      loaded binary IS sitting 2's binary**, which makes every row below the
      strongest available comparison to C8 rather than a weaker one. The
      extension was deliberately NOT reloaded during the sitting.
- [~] Service Workers panel on `http://hw.test:8787/` — no registration.
      Record that you checked.
      **NOT separately checked this sitting; discharged by the reads instead.**
      Every row below shows `x-hw-oracle` changing on the wire, so DNR
      demonstrably acted on those responses — the one thing a stray service
      worker could have prevented. Recorded as discharged-by-observation, not
      as checked.
- [x] Chrome version and OS. Expect 153.0.8010.48 / macOS 26.5.2. **If a Chrome
      update has been taken since the last sitting, say so loudly** — every
      result below becomes incomparable to C8, C9 and E1/E2/E3, and the sitting
      is measuring a different browser.
      **Identical: Chrome 153.0.8010.48 (Official Build) (arm64), macOS 26.5.2
      (Build 25F84), V8 15.3.76.12, `Profile 15`, same command line.** The
      pending update was again not taken.
- [~] **Export the profile state and commit it** to
      `test/fixtures/2026-09-20-pre-e4-state.json`, with its sha256 recorded in
      the results. The sitting-2 export was declined and is now unrecoverable;
      do not make that two.
      **STRUCK, deliberately, after checking.** This item was written by
      inheritance and does not survive inspection.
      `test/fixtures/c5-v2-export.json` is already a browser-produced v2 export
      of this exact profile set, carrying `side: "response"` on the response
      entry and absent on both request entries — the precise property the lost
      sitting-2 export was valued for. The state at the start of this sitting
      was E3's array, already recorded verbatim from `getDynamicRules()` in the
      morning runbook, which is a better record than an export because it is
      what Chrome held rather than what the popup wrote.
      **Noted while checking: nothing in the tree reads either committed
      fixture.** No selftest, no mutation harness, no gate — they are cited
      only in prose in the 09-13 runbook. Wiring them into a round-trip check
      is worth more than adding a third.

---

## E4 — C8's shape, predicted in advance

Profile `probe`, target `hw.test`. Keep the `X-HW-Probe` request row. Response
entries, exactly two, in this order:

1. `X-HW-Oracle` / `res` / `set` / `rewritten`
2. `X-HW-Removable` / `res` / `remove`

**Before pressing Measure**, `chrome.declarativeNetRequest.getDynamicRules()`
in the SERVICE WORKER console — full namespace; a bare `getDynamicRules()`
throws `ReferenceError` and the first E1 attempt was pressed without a
verification because of it. Confirm `responseHeaders` length 2, set at index 0,
remove at index 1, and that the remove entry has **no `value` key**. Record
verbatim.

Then **Measure — plain case**.

**Predicted:** `x-hw-oracle` = `rewritten`, `x-hw-removable` = `present`.
`1 changed, 0 removed, 0 added`. Identical to C8.

Anything else falsifies the 2026-09-20 mechanism and FINDING-035 reopens.

**Observed: PREDICTION FAILED. M1′ FALSIFIED.**

Pre-read ran and passed: `responseHeaders` length 2, `{X-HW-Oracle, set,
rewritten}` at index 0, `{X-HW-Removable, remove}` at index 1 — two keys, no
`value`. `X-HW-Probe` request row intact, rule 1 response-free.

Plain case. **MODIFIED — 1 changed, 1 removed, 0 added.**

| header | server sent | browser received |
| --- | --- | --- |
| `x-hw-oracle` | `baseline` | `rewritten` |
| `x-hw-removable` | `present` | `—` |
| `x-hw-second` | `two` | `two` |

The `remove` applied in the set-then-remove order that failed twice in sitting
2, on the same Chrome build, the same profile, the same fixture and an
extension binary byte-identical to sitting 2's.

**Measure pressed several more times, nothing changed between presses,
identical result each time.** So the behaviour is deterministic on this state
and the difference lies between SITTINGS, not between requests. That killed the
non-determinism branch immediately and left two candidates: something about how
the rule was registered, or C8's record being wrong.

---

## E4b — C8's build path, unregistered, run mid-sitting

**DECLARED AS AN IMPROVISATION.** Not registered before Chrome opened. It was
run because E4's failure left a specific, cheap question: C8 and E4 have
identical final rules but got there by different routes. C8 added a `remove`
row to a profile that already held the `set`; E4 was built by editing E3's
reversed array in place. `getDynamicRules()` shows the final state and cannot
show the sequence of `updateDynamicRules()` calls that produced it.

Build: delete both response rows, save. Add `X-HW-Oracle` / `res` / `set` /
`rewritten`, save. Add `X-HW-Removable` / `res` / `remove`, save. Three
separate saves, matching C8's assembly.

**FIRST ATTEMPT VOIDED — MIS-BUILT AS A `set`, FOR THE SECOND TIME TODAY.** The
operation dropdown was left on its `set` default and `remove` typed into the
VALUE field. **The pre-read caught it this time**: `getDynamicRules()` returned
`{header: "X-HW-Removable", operation: "set", value: "remove"}`. Pressed anyway
to record what it does, and the wire confirmed it — `2 changed`, with
`x-hw-removable` reading `present` → **`remove`**. Not evidence about `remove`
in either direction.

The morning runbook's E1 records the identical error, caught only afterwards
because a bare `getDynamicRules()` threw `ReferenceError` and the press went
ahead. **Twice in one day, both times when the intent was `remove`.** Raised as
FINDING-040.

**Second attempt, built with the dropdown:** verified
`{X-HW-Removable, remove}` at index 1, two keys, no `value`. Plain case.
**MODIFIED — 1 changed, 1 removed, 0 added**, `x-hw-removable` → `—`.

**The build path is not the variable.** C8's shape has now been measured three
ways — edit-in-place swap, repeated presses, and C8's own three-save assembly —
and the `remove` applied every time. That left C8's record as the only
remaining suspect.

---

## E5 — reproduce C8 from a mis-built entry, prediction committed first

**Registered mid-sitting, prediction written before the press**, which is what
distinguishes it from E4b. The hypothesis: C8's entry was not a `remove` at all
but a `set` whose value happened to match what the fixture already sends, which
is invisible on the wire.

Build: `X-HW-Removable` / `res` / **`set`** / `present`, at index 1 behind
`{X-HW-Oracle, set, rewritten}`.

**Before pressing**, `getDynamicRules()` → confirmed `{header:
"X-HW-Removable", operation: "set", value: "present"}` at index 1. The full
header name was read from the console rather than the popup, which truncates —
the name field displayed `movable` at the time, scrolled to the end of its
text.

**Predicted:** `1 changed, 0 removed, 0 added`. `x-hw-oracle` baseline →
`rewritten`, `x-hw-removable` `present` → `present`. Byte-identical to C8's
reported verdict line and table.

**Observed: PREDICTION MATCHED EXACTLY.**

Plain case. **MODIFIED — 1 changed, 0 removed, 0 added.**

| header | server sent | browser received |
| --- | --- | --- |
| `x-hw-oracle` | `baseline` | `rewritten` |
| `x-hw-removable` | `present` | `present` |
| `x-hw-second` | `two` | `two` |

C8's verdict line and all three of its table rows, reproduced from a legal,
silently-wrong entry. A `set` writing the value the fixture already sends is
indistinguishable on the wire from a removal that did not happen: the header
arrives as `present`, the diff reports no change, and the counter reads 1
because only `x-hw-oracle` moved.

---

## R1 — request side: is the suppression per-header or per-rule?

**This is the row that decides whether 035 and 036 merge.** It is C8's question
asked on the request side: an earlier entry, a later entry, DIFFERENT headers.

Profile `probe`, target `hw.test`. Delete the response entries from E4 —
response and request arrays are independent, but a response `set` left in place
adds a variable this row does not need. Request entries, exactly two, in this
order:

1. `X-Forwarded-For` / `req` / `append` / `bravo`
2. `X-HW-Probe` / `req` / `set` / `present`

**Before navigating**, `getDynamicRules()` → confirm `requestHeaders` length 2,
append at index 0, set at index 1, and NO `responseHeaders` key on the rule.
Record verbatim. The popup has no reorder control; verify the result, not the
intent.

Then navigate to `http://hw.test:8787/echo?case=plain` and read
`requestHeaders` in the body.

**Predicted if the suppression is PER-RULE** (the response side's behaviour,
C8): `x-forwarded-for: bravo` present, **`x-hw-probe` ABSENT** — the later
`set` on a different header discarded. 035 and 036 are one mechanism and it
spans both sides.

**Predicted if the suppression is PER-HEADER** (Chrome's documentation): BOTH
present — `x-forwarded-for: bravo` and `x-hw-probe: present`. 036 is the
documented same-header rule and is NOT 035's mechanism; the two stay separate
and only the response side diverges from the docs.

**NOT RUN.** E4's stop gate held. There is no longer a response-side
suppression for this row to be compared against, so neither branch above means
what it says. **Do not run this row as written** — rewrite it first. What the
request side actually needs now is a plain reproduction of C9 sequence 2 with
the stored array verified before the press, because 036's sighting was built in
the same sitting, in the same popup, by the same hand that produced C8, and an
`append` row mis-built as a `set` with `alpha` in the value field is
indistinguishable in the result from a `set` that was suppressed.

---

## R2 — request side: does the 035 operation pair fail here too?

The direct request-side twin of C8: `set` first, `remove` second, different
headers.

Profile `probe`, target `hw.test`. Request entries, exactly two, in this order:

1. `X-HW-Probe` / `req` / `set` / `present`
2. `Accept-Language` / `req` / `remove`

**Before navigating**, `getDynamicRules()` → confirm `requestHeaders` length 2,
set at index 0, remove at index 1, no `value` on the remove. Record verbatim.

**Establish the baseline in the SAME sitting, not from memory.** Before
building this row, navigate to `http://hw.test:8787/echo?case=plain` with the
`Accept-Language` entry absent and record that Chrome sends it. A removal row
against a header the browser did not send is vacuous, and nothing here has ever
confirmed Chrome sends it on this fixture.

Then navigate and read `requestHeaders`.

**Predicted if the request side behaves like the response side:**
`x-hw-probe: present`, **`accept-language` STILL PRESENT** — the later `remove`
suppressed by the earlier `set`. The mechanism is one thing across both sides.

**Predicted if the request side does NOT share it:** `x-hw-probe: present` and
`accept-language` ABSENT. The suppression is response-side only, and 035 stays
its own finding regardless of what R1 says.

**NOT RUN.** Same reason as R1. The row is still worth running on its own
merits — a request-side `remove` has never been measured at all, and the
`Accept-Language` baseline step is sound — but its predictions are written
against a dead mechanism and must be rewritten before it is registered again.

---

## Reading the three together

**The table that stood here is void.** It mapped R1 and R2 outcomes onto a
response-side mechanism that E4 falsified before either row was run. Kept in
git history rather than reproduced here, because reading it now would suggest
conclusions that nothing supports.

## What the sitting established

| read | rule shape | result |
| --- | --- | --- |
| E4 | `set` A, `remove` B — C8's shape | **both applied**; prediction failed |
| E4b void | `set` A, `set` B with value `remove` | mis-build; `2 changed` |
| E4b | C8's three-save build path, correct `remove` | **both applied** |
| E5 | `set` A, `set` B with value `present` | **C8's verdict line exactly** |

**Response-side `remove` works, in every position tested, on the binary that
produced C8.** FINDING-035 is withdrawn. Its two sightings are believed to be
mis-built entries of the kind reproduced deliberately in E5 and accidentally
twice in one day. FINDING-040 is the real defect and it is a HeaderWright
defect, not a Chrome one.

**No Chromium bug report should be filed.** The divergence-from-documentation
claim written into FINDINGS.md this morning rested entirely on C8 and is
withdrawn with it.

**A preregistered prediction killed a hypothesis that three reads supported.**
E1, E2 and E3 were all consistent with M1′; E4 was the first row whose
prediction was committed before Chrome opened, and it took one press. That is
the argument for the whole practice, and it is worth keeping in view the next
time registering rows feels like overhead.

## After

- [x] Every Observed block filled, including matches. **E4, E4b and E5 filled.
      R1 and R2 marked NOT RUN with the reason.**
- [x] FINDING-035 updated: **withdrawn**, both titles kept, E5 recorded as the
      reproduction.
- [x] FINDING-036 updated: the shared-mechanism suspicion withdrawn, and the
      entry flagged for re-verification since it shares C8's provenance.
- [x] FINDING-040 raised — the popup defect.
- [x] FINDING-041 raised — a pull cannot reach the loaded extension.
- [ ] `decisions.md` entry for FINDING-040. Three candidate directions, none
      of which addresses the invisible variant (`set` with a value the server
      already sends). **No patch before the ruling.**
- [ ] The pre-read is the entire defence against FINDING-040 and it is a habit,
      not a mechanism. It was skipped once and honoured twice on 2026-09-20.
      Nothing enforces it.
- [ ] The PID provenance step has now failed in three consecutive sittings.
      Treat it as a checklist that does not work.

## Disposition — where v0.2.0 stands

**FINDING-035 no longer blocks the tag.** Response headers work, in both
operations, in any order.

**FINDING-040 blocks it**, and it is the more serious finding: a legal entry
that silently does the wrong thing and produces output that reads as a platform
failure. It cost two sittings, was written into FINDINGS.md twice under two
different mechanisms, and nearly produced a false upstream bug report.

**FINDING-036 needs re-verification before the tag**, not because it is
believed wrong, but because its single sighting shares provenance with C8 and
nothing has re-read it since.

The reorder-in-`buildRules()` candidate and its collision with the array-order
claim are both moot. Nothing needs reordering.
