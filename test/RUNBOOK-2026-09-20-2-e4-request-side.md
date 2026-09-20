# Runbook — E4 and the request-side pair, 2026-09-20 (second sitting of the day)

**COMMIT THIS FILE BEFORE CHROME OPENS.** Every row carries a prediction
written in advance, per mechanism where the mechanisms disagree.

**Counts are NOT written here.** `node test/verify.mjs` prints a `tree:` line.
Quote that line into the results.

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

- [ ] `cd ~/headerwright && git pull --ff-only`, then
      `git log -1 --format='%H %ad'`. Record the sha AND its date.
- [ ] `node test/verify.mjs` → seven PASS. Quote the `tree:` line. Expect
      `447 checks`; `440` or `445` means this runbook's tree is not the one
      running.
- [ ] **Restart both instrument servers after the pull.** FINDING-037:
      `server.mjs` is evaluated once at startup. Before killing anything,
      capture provenance — `ps -o pid,lstart,command -p <PID>` and
      `lsof -p <PID> -d cwd`. Two sittings have now lost this.
- [ ] **`node test/preflight.mjs` → PREFLIGHT PASSES.** This replaces the curl
      step used in the previous runbook. It checks what is RUNNING, not what is
      on disk: digests, each selfcheck against its own live process, and the
      hostnames the browser will type. **A failure here means do not open
      Chrome.**
- [ ] Extension ID recorded. Expect `khjeofpciphjaclledledepfppaiicnf`.
      **The name will now read `HeaderWright — Modify HTTP Headers`** — that is
      FINDING-039's fix landing, not a different extension.
- [ ] Service Workers panel on `http://hw.test:8787/` — no registration.
      Record that you checked.
- [ ] Chrome version and OS. Expect 153.0.8010.48 / macOS 26.5.2. **If a Chrome
      update has been taken since the last sitting, say so loudly** — every
      result below becomes incomparable to C8, C9 and E1/E2/E3, and the sitting
      is measuring a different browser.
- [ ] **Export the profile state and commit it** to
      `test/fixtures/2026-09-20-pre-e4-state.json`, with its sha256 recorded in
      the results. The sitting-2 export was declined and is now unrecoverable;
      do not make that two.

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

**Observed:**

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

**Observed:**

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

**Observed:**

---

## Reading the three together

| R1 | R2 | Reading |
| --- | --- | --- |
| probe absent | accept-language present | One mechanism, both sides, per-rule. 035 and 036 merge; the fix must cover both arrays. |
| probe present | accept-language absent | Request side follows the docs. 035 is response-side-only and 036 is the documented same-header rule. Keep them separate. |
| probe absent | accept-language absent | Suppression is operation-dependent, not positional — `append` poisons, `set` does not. Neither existing finding describes that; raise a new one. |
| probe present | accept-language present | `set` poisons, `append` does not, on the request side — the opposite of 036's own sighting. Re-run 036's original sequence before believing it. |

**If E4 disagrees with its prediction, stop and record. Do not run R1 or R2** —
their value is in what they say about a mechanism that E4 would have just
falsified.

## After

- [ ] Every Observed block filled, including matches.
- [ ] Fixture exported and committed with its sha256.
- [ ] FINDING-035 updated: mechanism confirmed by a preregistered row, or
      reopened.
- [ ] FINDING-036 updated with R1 and R2, and merged with 035 or explicitly
      kept separate with the reason.
- [ ] Only then the fix ruling in `decisions.md`. The reorder-in-`buildRules()`
      candidate collides with the project's own claim that array order is
      preserved on the wire; if R1/R2 put the request array in scope too, that
      collision doubles and the ruling covers both.
