# Smoke evidence

Completed browser-level smoke results, newest first. The selftest suite proves
rule CONSTRUCTION; this file is the record of what was observed on the WIRE.

A run is only evidence if it names the build and the browser. "Tested on
Chrome" is a claim. The tables below are the format: environment, procedure
reference, per-step observation, and the raw timestamps the observation came
from.

---

# Sitting G — v0.1.7 candidate, FINDING-028 / FINDING-024 (2026-09-07)

Predictions pre-registered in `test/RUNBOOK-2026-09-06-v017.md`, committed
2026-09-06 before Chrome opened. Seven of eight rows run; Part C (P6/P7)
deliberately not run — see "Not run" below.

### Environment

| | |
|---|---|
| Build | `0b23bf35c08019b587c5549e4726954a8e17c123`, unpacked |
| Extension ID | `ddgomchkggjoehcoeibmmnfaakjanmce` (unpacked-dev, NOT the store ID) |
| Profile | `hw-test` |
| Chrome | **151.0.0.0**, macOS |
| Manifest version string | `0.1.6` — deliberately un-bumped |

**The version string could not discriminate the build under test**, because
v0.1.7 carries no bump and the store build is also 0.1.6. The standing
instruction to read the version off `chrome://extensions` is therefore
insufficient for this release and was replaced by reading the loaded bytes:

    fetch(chrome.runtime.getURL('lib/grants.js'))
      .then(r => r.text())
      .then(t => console.log('v0.1.7 candidate:', t.includes('!before.has(d) && !granted.has(d)')));
    → v0.1.7 candidate: true

Grant state read with `chrome.permissions.getAll()` in the service worker
console throughout, never the Details panel (O-2).

### Fixture

`g1.test`–`g8.test`, none reused from sittings A–F, none resolving. `httpbin.org`
for P8 only. Baseline before P1: `origins: []`.

---

### P1 — the chip re-fires `request()` after a denial — **PASS**

Profile on `g1.test`, dialog denied at save, `getAll().origins` → `[]`. The
`g1.test` chip rendered gray with the dashed affordance. Clicking it produced a
permission dialog.

**This was the load-bearing row of the sitting.** The option A ruling in
`decisions.md` was recorded conditional on it: had no dialog appeared, a denied
domain would have had no in-app recovery under v0.1.7 — FINDING-002
reintroduced by this release's own fix — and the ruling reverted to option B.
**The condition is discharged; option A stands.**

**RUNBOOK DEFECT, recorded because it is the runbook's own failure.** P1 says
"click the gray chip" and does not say what to do with the resulting dialog. The
operator asked, correctly, whether to allow or deny. For P1's verdict it does
not matter — the dialog appearing IS the row — but the answer determines whether
`g1.test` enters Chrome's approval cache and therefore whether later rows can
use it. Denied on this run, so the cache stayed clean. **A row whose procedure
leaves the operator guessing is underspecified even when its verdict is
unambiguous.**

### P2 — approving one chip grants that domain only — **PASS, twice**

Baseline `before: []`, status `3 profiles · 0/3 domains granted`. Profiles on
`g2.test` and `g3.test` added and denied. Clicked the `g1.test` chip, allowed.

    after: ['*://*.g1.test/*', '*://g1.test/*']
    status: 3 profiles · 1/3 domains granted

Exactly two patterns, both `g1.test`. No `g2` or `g3` pattern. Chip colour
agreed: `g1` green, `g2`/`g3` gray.

**Independently re-confirmed at the call site during P5c**, where the wrapper on
`chrome.permissions.request` logged
`["*://g2.test/*","*://*.g2.test/*"]` — one call, one domain — for a chip click.
The granted-set reading and the call-site reading are separate surfaces and
agree.

This closes the OBS-F2 question for the chip path: one approval, one domain.

### P3 — a delete requests nothing — **PASS**

OBS-E5's exact shape. Five profiles `g4.test`–`g8.test`, all five dialogs
denied. Eight profiles total, status `8 profiles · 1/8`.

    before: ['*://*.g1.test/*', '*://g1.test/*']
    [delete Test4 / g4.test, confirmed]
    NO DIALOG APPEARED
    after:  ['*://*.g1.test/*', '*://g1.test/*']

Identical arrays. Profile list confirms `g4.test` gone.

**This is the release's central claim, on the shape the defect was observed on.**
Under v0.1.6 this delete offered the four remaining ungranted domains and one
approval took all of them.

### P4 — the status line does not move on that delete — **PASS**

    before: 8 profiles · 1/8 domains granted · paused
    after:  7 profiles · 1/7 domains granted · paused

Denominator fell, numerator held at 1. Recorded as a separate row from P3
because OBS-F2's signature was a numerator jump (`0/5` → `2/5`) from a single
approval, and the status line is a different surface from `getAll()`. Two
independent surfaces, same verdict.

### P5 — an unrelated save does not re-request another profile's domain — **PASS**

Edited Test1 (`g1.test`, granted), changed the header value only, saved.

    no dialog
    p5: ['*://*.g1.test/*', '*://g1.test/*']
    status: 7 profiles · 1/7

FINDING-024's shape closed on the save path.

**An unexplained observation was recorded rather than dismissed: the operator
noticed a flicker on save.** Two candidate explanations, and P5 as written could
not separate them — (a) the storage-change re-render, benign; (b) `request()`
firing for `g1.test`, which is already cached and would resolve with no dialog.
The domain being edited cannot produce a visible signal precisely because it is
granted. P5b was added to settle it.

### P5b — no `request()` at the call site on an unrelated save — **PASS**

**NOT PRE-REGISTERED. Invented mid-sitting in response to the flicker**, and its
provenance is recorded here rather than folded into P5. It has no falsification
clause written before the fact; what it has is a positive control taken
immediately before it.

Method: wrap `chrome.permissions.request` in the POPUP context, click Edit on
Test1, change the header value, save.

    [edit + save, instrumentation live]
    → nothing logged

`reconcileGrants()` called `request()` **zero times** for a mutation where every
domain was already in the previous set. The flicker is the re-render.
FINDING-024 is closed at the call site, not merely at the granted set — which is
stronger than P5 alone, since the approval cache would have hidden a wrong call.

### P5c — positive control for P5b — **PASS**

    [click gray g2.test chip]
    REQUEST FIRED: ["*://g2.test/*","*://*.g2.test/*"]
    [dialog appeared, denied]

Run in the same popup context, minutes before P5b, with no reload between.
**P5b's null result means something only because of this row.**

### THE INSTRUMENT FAILED FIRST, AND THE FAILURE IS THE POINT

The first attempt at P5b logged nothing, which read as a clean pass. It was not.

The snippet was run twice in the same popup context. The second run captured
`_req` from an already-patched `chrome.permissions.request`, so the wrapper
called itself:

    REQUEST FIRED: (2) [empty × 2]      ×20
    Uncaught (in promise) RangeError: Maximum call stack size exceeded
        at chrome.permissions.request
        at chrome.permissions.request
        ...

`request()` never reached Chrome, which is why no dialog appeared on the
`g2.test` chip click. **Nothing about `g2.test` was tested by that attempt, and
its silence was indistinguishable from a genuine pass.** Two defects in one
snippet: no re-application guard, and the origins array logged by reference
(`[empty × 2]`) instead of snapshotted.

Fixed by closing the popup to discard the context, then re-arming with an
`__hwPatched` sentinel and `JSON.stringify` on the log.

**This was already written down.** `test/EVIDENCE.md` "Resume", from sitting B:

> Wrap `chrome.permissions.remove` in the POPUP context, not just the service
> worker (...). Re-arm after any popup close — the context is destroyed with it,
> and a wrapper that died silently reads identically to a genuine failure.

The prior sitting recorded the exact failure mode and it was not read before
instrumenting. Lesson 5 — check every component that touches the artifact,
including the one doing the checking — and lesson 4 — a green suite is not
evidence for a claim the suite does not test. **A null result from an
uncontrolled instrument is not a null result.**

The one thing the broken attempt did establish: the wrapper was genuinely in the
call path, since the chip click reached it. Interception works; that
implementation of it did not.

### P8 — headers still reach the wire — **PASS**

Master toggle ON, status line `8 profiles · 2/8 domains granted · applying`.
Profile on `httpbin.org`, `X-HW-Test: p8`, allowed. `https://httpbin.org/headers`
returned:

    "X-Hw-Test": "p8"

**The only row in the sitting where passing required something to happen rather
than not happen.** Every other row confirms an absence, and a build that had
quietly stopped applying headers would have passed all of them.

Granted count moved `1/7 → 2/8` correctly across the httpbin add.

---

## Not run

**Part C (P6, P7) — the legacy path.** Requires a v0.1.3 install in `hw-clean`,
granted under the pre-FINDING-018 origin set, then upgraded.

**FINDING-024's legacy half is therefore NOT browser-verified.** P5 and P5b
closed the general save path, which is the same code line, but a user upgrading
from a v0.1.3-era grant is the case the migration notice speaks to and no row in
this sitting touched it. Recorded here as unclosed rather than folded into
Part B — sitting E's Phase C precondition check (C0) is the precedent for what
happens when a legacy row runs without establishing that a legacy grant exists:
it records as passed against a fix that does nothing.

**Part E (`test/SMOKE.md`) — not yet run.** Standing pre-submission suite; Parts
2, 11 and 12 touch grants and are what this change can break in ways the runbook
did not think to ask about. **The release does not ship before it runs.**

---

## FINDING-030 reproduced, unprompted

Hit cold during P3, by an operator who was not looking for it, which is better
evidence than a scripted row. Operator's wording, kept:

> when I delete the delete confirm button remains hidden. So to a user it will
> look like nothing happened.

Structural cause, from `popup.html` at this commit: `header` and
`footer#status-line` are `flex: none` siblings of `main`, so both are pinned.
Everything else — the profile list, the Add profile / Export / Import row at
line 312, and `#delete-confirm` at line 326 — lives inside `main`, which is
`flex: 1 1 auto; overflow-y: auto`. With eight profiles the confirmation renders
below the fold.

The operator proposed pinning the whole bottom action row the way the status row
is pinned. **Recorded as a proposal, not adopted.** It is a real improvement and
structurally the same one-line move that fixed FINDING-022, but it does not fix
FINDING-030: `#delete-confirm` sits below the list inside `main`, so pinning the
action row leaves the confirmation exactly where it is. There are two candidate
fixes and they are not the same change.

**Not fixed in this sitting.** A UI change mid-sitting invalidates the build
every prior row was scored against. Roadmap item 4 already says the ruling on
whether FINDING-030 belongs in 0.1.7 or the v0.2.0 card redesign is itself the
first step; that ruling now has a fresh observation to be made against.

---

## Row status

| Row | Verdict |
|---|---|
| P1 chip recovery path | PASS — ruling condition discharged |
| P2 chip grants one domain only | PASS, two surfaces |
| P3 delete requests nothing | PASS |
| P4 status line holds | PASS |
| P5 unrelated save does not re-request | PASS |
| P5b no `request()` at the call site | PASS (not pre-registered; controlled) |
| P5c positive control | PASS |
| P6/P7 legacy path | NOT RUN |
| P8 headers reach the wire | PASS |
| Part E SMOKE.md | RUN IN FULL — see the Part E section below |

## Corrections owed to the runbook and to standing practice

Both belong in the next runbook, not silently in this one.

- **P1 must say what to do with the dialog.** Its verdict does not depend on the
  answer; the fixture state of every later row does.
- **"Read the version off `chrome://extensions`" is insufficient for any release
  that does not bump the manifest.** Replace with a byte check against a string
  unique to the candidate. This applies to every future in-progress sitting, not
  just this one.


---

## Part E — `test/SMOKE.md`, run in full (2026-09-07)

Same build, same rig, same session as P1–P8 above. All fifteen parts reached.
Twelve pass, three partial, two deferred entire. **Every deferral traces to one
of two missing fixtures, named at the foot of this section.**

Run, not read. Where a step's written procedure could not be followed as
printed, the deviation and its reason are recorded at the step.

### Part 0 — revocation baseline — PASS

| Reading | Observed |
| --- | --- |
| `granted` | 6 origins incl. `*://example.com/*`, `*://*.example.com/*` |
| `after delete` | 4 — both `example.com` patterns GONE |
| `after reload` | 4 — unchanged |
| status | `9 profiles · 3/9` → `8 profiles · 2/8` |

**`remove()` revokes PROMPTLY in Chrome 151.** Part 2's revocation rows
therefore apply as written, with no downgrade to DOCUMENTED.

Read with `permissions.getAll()`, not the Details panel (O-2). Deliberate
deviation from the printed procedure.

**Step 6 corollary, and it is WRONG AS WRITTEN.** Re-adding `example.com`
produced no prompt, which the step says means the grant never dropped. It had
dropped — the arrays above are direct evidence, twice. The origin was in
Chrome's approval cache from step 1, so `request()` resolved silently and
`getAll()` returned to 6 patterns with the chip green. The corollary predates
sitting C's discovery that the cache is populated by ACCEPTANCE only. **First of
six procedure defects.**

### Part 1 — core application — PASS

| Step | Observed |
| --- | --- |
| 1 positive apply | `"X-Hw-Test": "p8"` present at `httpbin.org/headers` |
| 2 negative control | header ABSENT after hard reload; `"Cache-Control": "max-age=0"` in the echo confirms the request went to the network, not the cache; badge OFF, status `paused` |
| 3 per-domain scoping | both directions checked: `X-Hw-Scope` absent from httpbin, `X-Hw-Test` absent from postman-echo |
| 4 deny path | profile saved, chip GRAY, `11 profiles · 4/11` — denominator up, numerator held |
| 5 export → import → export | `diff export-1.json export-3.json` empty |
| 6 import rejection | refused, config untouched at `11 profiles · 4/11` |

Step 3 used `postman-echo.com` as the second echo; no local server available.
Deviation recorded. **The cross-ABSENCE was checked in both directions, which is
the row's actual claim** — a build applying every profile to every domain passes
a presence-only check.

Step 4's DevTools half is UNRUNNABLE with a non-resolving fixture: `g9.test`
issues no request to inspect. The gray chip and the count are the evidence held.

Import refusal, verbatim:

> Import failed: profile 1, header 1: missing or empty header name.

Names position and reason, interpolates no value. The errors-as-data property
holding at a live refusal.

Import confirmation, verbatim:

> Replace your 11 profiles with 11 profiles from "export-1.json"?

**Step 5 was initially UNSCOREABLE and the reason generalises.** The first run
never clicked Replace — the confirmation renders below the fold (see
FINDING-030 below). The subsequent export was therefore taken from an unchanged
config, so the diff was empty by construction whether or not import works at
all. The profile count cannot rescue it either: replacing 11 profiles with the
same 11 leaves 11. **A round-trip check with no step confirming the round trip
occurred is vacuous.** Re-run with Replace actually clicked; the PASS above is
the re-run.

### Part 2 — permission lifecycle — PASS (2c fails as written, correctly)

**The part's stated purpose is discharged: all three `reconcileGrants()` call
sites are now browser-verified.** Delete (P3, 2e), save (P5/P5b, 2a, 2b, 2c,
2d), import (2e). The suite proves the set arithmetic; these rows prove the
wiring.

**2a — shared-domain retention — PASS, ON A REPAIRED FIXTURE.**

| Reading | Observed |
| --- | --- |
| base2 | 4 patterns — `s2a.test` ×2, `other2a.test` ×2 |
| after A (`s2a.test` → `localhost` in profile A) | 6 — **both `s2a.test` patterns RETAINED**, plus `other2a.test` ×2, `localhost` ×2 |
| after B (profile B → `localhost`) | 2 — `localhost` only; all four `2a` patterns revoked |
| dialogs | fired at the two adds; **NONE** when B added an already-held `localhost` |
| status | `6/13` → `7/14` → `5/12` |

**The printed fixture cannot test what the row claims, and this is the most
consequential procedure defect found.** SMOKE.md specifies `example.com` and
`api.example.com`. Granting the apex yields `*://*.example.com/*`, which
SUBSUMES the subdomain — sitting B's wildcard-subsumption finding. Retention
would then be explained by the wildcard rather than by the second profile's
reference, and **the row passes on a build where retention is completely
broken**. Confirmed live: with both profiles referencing `s2a.test` and
`api.s2a.test`, `getAll()` returned only two patterns while the
`api.s2a.test` chip rendered GREEN — the chip correctly reporting EFFECTIVE
access derived from the wildcard. Repaired by substituting two unrelated
domains, neither subsuming the other.

**The printed fixture is also unsavable.** Step 2 says "any header" for both
profiles on an overlapping domain. FINDING-021's collision refusal, shipped in
v0.1.5, refuses the second save. Header names must differ.

The no-dialog reading at the second edit is the grant-intersection property —
the one that only acquired a selftest check because a mutant survived the first
pass. It now holds in the browser as well as the suite.

**2b — no churn on an unchanged granted save — PASS.** No dialog, status
unchanged. **2b's stated RATIONALE is inverted**: it says a dialog would mean
requests are diffed against membership instead of grant state, and v0.1.7 diffs
against membership deliberately. Expectation right, reason obsolete.

**2c — FAILS AS WRITTEN, AND THE FAILURE IS CORRECT.** Unchanged-and-denied
save produced no dialog. SMOKE.md expects one. That behaviour is precisely what
option A removed. **Pre-registered before the run**, with the falsification
clause that a dialog appearing would mean `reconcileGrants()` was not wired to
the narrowed diff at the save call site and P5b was wrong. It did not fire.

2c also carries **the same false claim as `grants.js` asymmetry 2**, in a third
file: "Until then it is the only recovery a denied domain has." FINDING-002
shipped the chip in v0.1.1. P1 and 2f both exercised it today.

**2d — ordering survives a real dialog — PASS.** One save dropped `g9.test` and
added `d2.test`; the dialog fired and `getAll()` returned the `d2.test` patterns
with no `g9.test`. **The `reconcileGrants()` code comment states this ordering
as an unverified belief — it is now verified on Chrome 151 and the comment can
be updated.** Stated failure mode (`remove()` destroying the popup's JS context
before `request()` runs) did not occur.

**2e — delete and import — PASS.** Delete of a GRANTED domain revoked
`d2.test` and left `httpbin.org` untouched; P3 covered only denied domains, so
this is new coverage. Import of a hand-edited export produced **one dialog,
naming `imp2e.test` only**; `example.com` and `postman-echo.com` were revoked as
now-unreferenced, and `g1.test`, `g2.test`, `httpbin.org` and `localhost` were
all retained WITHOUT re-prompting. Final: 10 patterns over 5 domains,
`11 profiles · 5/10`.

**2f — grant affordance — PASS, INCLUDING THE KEYBOARD.** Dashed border present;
**Tab reached the chip and Enter fired the dialog**; after allowing, dot green,
border solid, chip inert, count `5/12` → `6/12`. Granted chips are not
clickable — grant-only is deliberate. SMOKE.md flags keyboard reachability as
"should be free — verify rather than assume"; **this is the first sitting in
which it was actually verified**, and it matters more now than it did, because
option A makes the chip the only in-app recovery path.

### Part 3 — badge honesty — PASS

| Step | Observed |
| --- | --- |
| 1 truthful states | ON → badge ON, `applying`; OFF → badge OFF, `paused` |
| 2 injected failure | badge red `!`; status `not applying — last sync failed` in red; `HeaderWright: rule sync failed — SMOKE Part 3 injected failure` at `sw.js:201`, a HANDLED `console.error`, not an unhandled rejection |
| 2 tooltip | `Chrome rejected the last rule registration: SMOKE Part 3 injected failure` |
| 3 failure outranks toggle | toggle read OFF, badge still `!` — does not assert a teardown that may not have happened |
| 4 recovery | badge ON, `applying`, red cleared |

**A WRONG CLAIM WAS MADE AND CORRECTED BY MEASUREMENT.** The tooltip was first
asserted to be unimplemented, on the grounds that `popup.js` reads only
`sync.ok` and never `sync.error`. That grep found nothing and was treated as
proof of absence. The tooltip exists and renders correctly. **A grep that finds
nothing is not a proof of absence** — the same failure shape as the instrument
nulls elsewhere in this sitting, but stated as fact rather than as a prediction
to test. Caught only because the measurement was run anyway.

### Part 3b — sync serialization — PASS

Five profile saves on fresh domains (`r1.test`–`r5.test`, all denied) plus rapid
master toggling. **No `Rule with id N does not have a unique ID` at any point**,
badge never entered the failure state, final `16 profiles · 5/15 · applying`.
Preserve log confirmed ON before the saves began.

**SMOKE.md points at the wrong console.** It says "Popup console open, Preserve
log ticked". `syncRules` is created and called entirely in `sw.js`; every entry
point and the queue's `onError` handler at `sw.js:218` live there. **The
unique-ID error surfaces in the SERVICE WORKER console.** Following the printed
instruction means watching a console where the error cannot appear and reporting
a clean run — a FALSE PASS, unlike the other five defects.

**Limit of what this row establishes.** Denying all five dialogs meant no
`permissions.onAdded` / `onRemoved` events fired, so those two entry points were
not exercised here. 2a and 2e produced many grant and revoke events with no
unique-ID errors, but the row as run covers the storage path only.

### Part 4 — validator bounds — PASS, both rows settled

**4a — `MAX_RULE_ID` = 2147483647 CONFIRMED, no longer inferred.**

    2147483647 → ACCEPTED
    2147483648 → REJECTED: "Invalid type: expected integer, found number."
    4294967295 → REJECTED: same

Signed 32-bit. The rejection message shows Chrome's type coercion failing before
any range check, which is WHY the bound is what it is, not merely that it is.

**4b — HTAB is our CHOICE, not a platform limit.** Chrome accepted `a\tb` as a
header value. `isValidHeaderValue()` refusing HTAB is HeaderWright being
stricter than both RFC 9110 and the platform. Decision 2026-08-04 stands; the
comment in `lib/rules.js` should now say so with sitting G as evidence.

Both probes cleaned up; status remained `applying`.

### Part 5 — generated rule ids — PASS

Fixture `hw-fixture-id-ceiling.json` built with the repo's own
`serializeProfiles()` at this commit and round-tripped through the committed
`parseProfilesFile()` before use. sha256
`270e9e85f17d64c22394dabf35a3e838831098ec94bd97ff9afba8ac4ceca6d4`.

| Step | Observed |
| --- | --- |
| 1 ceiling imports | 1 profile, id 2147483647 |
| 2 next id | **`id: 1`** — lowest-free allocation; a v0.1.1 build yields 2147483648 and latches |
| 3 both register | `rules: 2 [1, 2147483647]`, `sync: {error: null, ok: true}` |
| 4 id reuse | id 1 freed by delete and REALLOCATED to the next profile; both rules register |

**Step 3 is wrong as written.** It expects 2 rules, but step 2 never says to
grant the new profile's domain. Denied, the first reading was `rules: 1
[2147483647]` with `sync: {ok: true}` — which reads as a silent shortfall.
`runSync()` builds rules only for profiles whose domains are granted, so one
rule for two profiles was correct. Granting took it to 2. **Step 2 must say to
allow the dialog, or step 3 must expect 1 and say why.**

Step 4 confirms in a browser the claim the code comment makes: reuse is safe
because every sync rebuilds the whole rule set.

5b not run — it recreates by hand a latch the generator can no longer reach, and
deliberately corrupts storage. Deliberate skip, not a deferral.

### Part 6 — over-cap import refusal — PASS

Fixtures generated with `serializeProfiles()` and pre-verified against the
committed parser. Varying header names per profile (FINDING-021), shared
`postman-echo.com` domain, so **5000 profiles imported with ZERO permission
dialogs**.

    hw-fixture-cap-5000.json  sha256 dcaacec46e41fc91b83faf7fd344b332f529cb18ac7dfea89b933263e57b6466
    hw-fixture-cap-5001.json  sha256 1d1d0a81c7fcd496032be239d64e8101953d440dd30194cfd6cd221abf8d332d

| Step | Observed |
| --- | --- |
| 1 at the cap | `profiles: 5000`, `rules: 5000`, `sync: {ok: true}`, **no truncation warning** |
| 2 over the cap | refused, config untouched |
| 3 A4 regression | `5000 / 5000 / {ok: true}` — **identical to step 1** |

Refusal verbatim, naming both numbers as specified:

> Import failed: this file has 5001 profiles. The most that can be applied is
> 5000. Remove at least 1 profile from the file and try again.

The truncation branch in `sw.js` stayed silent, which is correct — it is
retained as defence in depth and its firing would mean something wrote to
storage outside import and the form.

The popup rendered 5000 profiles and scrolled to `p5000` without reported
difficulty on Chrome 151.

### Part 7 — domain dedup and count agreement — PASS

| Step | Observed |
| --- | --- |
| 1–2 dedup on save | input `example.com, EXAMPLE.com, example.com` → **ONE chip**, status `2 profiles · 2/2` — chips and count agree |
| 3 export | `"domains": ["example.com"]`, single entry |
| 4 idempotence | `diff` empty |
| 5 **legacy storage** | duplicates written directly to `hw:profiles`, bypassing both validators; popup closed and reopened; **still ONE chip**, status still `2/2` |

**Step 5 is the one that matters.** Normalization runs on READ, so a user
upgrading from v0.1.1 with duplicate domains in storage sees the corrected
display immediately without re-saving anything. Finding 7's failure — two counts
of the same thing disagreeing in one view — does not reproduce.

### Part 8 — live state while the popup is open — PARTIAL

**Steps 2–3 — PASS, and this is the row carrying finding 8.** Popup open
throughout, failure injected from the service worker console, status line
updated **IN PLACE** to `not applying — last sync failed` with the tooltip
carrying Chrome's message. No reopen. A v0.1.1 build shows `applying` beside
green dots while the badge goes red.

Consistent with Part 3 step 3: the status read `not applying` while the toggle
read OFF, failure correctly outranking the toggle.

**Step 5 — PASS.** Grant revoked from the Details panel with the popup open;
the count moved `2/2` → `1/2` without a reopen.

**Step 7 — PASS, and it is the harder half.** Editor open with unsaved text in
the header value field; a storage change fired from the console; the form kept
its contents and the view did not switch back to the list. Re-render touched the
list and status line only.

**Step 4 — NOT RUN. The instrument was destroyed four times, and every one was
the same defect.** A wrapper on `chrome.declarativeNetRequest.updateDynamicRules`
does not survive its context, and each attempted restore was a guess that made
the state worse: a saved reference lost to a service-worker restart; a
`Object.getPrototypeOf(...)` guess that set the method to `undefined`; a
`delete` that removed the property entirely, turning "injected failure" into "is
not a function"; and a bind on an already-undefined reference. Recovered only by
reloading the extension, which closes the popup and therefore forecloses the
row.

**This lesson was already in this file.** Sitting B's Resume section:

> Re-arm after any popup close — the context is destroyed with it, and a wrapper
> that died silently reads identically to a genuine failure.

It was transcribed into the sitting G notes earlier the same day and then
violated four times within the hour. **Capture and restore must be in ONE paste,
and a stub that cannot be restored must be cleared by reloading rather than by
guessing at the API surface.**

Step 6 (debounce) skipped: a "no perceptible lag" judgement, meaningful only at
5000 profiles.

### Part 9 — delete confirmation — PASS, all seven steps

Confirmation verbatim:

> Delete "Test1" and its 1 domain? This cannot be undone.

| Step | Observed |
| --- | --- |
| 1 appears, nothing deleted | PASS — names profile and domain count, singular agreement correct |
| 2 Cancel is safe | PASS |
| 3 confirm deletes and revokes | PASS — `example.com` released, no surviving reference |
| 4 no native dialog | PASS — popup never closed by itself |
| 5 retraction | PASS — withdrew when the profile vanished via a storage write from another context |
| 6 view change abandons it | PASS |
| 7 import closes it | PASS — never two confirmations at once |

Steps 5–7 are the substantive ones: a confirmation that stays honest when the
world changes underneath it. A stale confirmation naming a deleted profile, or
two armed at once, are the shippable failures and neither occurred.

One reading needed decomposition. `getAll()` returned `[]` after the step 3
delete, where `postman-echo.com` was expected to survive. Resolved from the
setup screenshot: `postman-echo.com` was already gray BEFORE the delete, revoked
by hand from the Details panel during Part 8 step 5. `example.com` was revoked
by the delete, correctly. Confirmed by re-grant and a control delete:
`retain: ['*://*.postman-echo.com/*', '*://postman-echo.com/*']`.

### Part 10 — export plaintext-secrets notice — PASS, all six steps

Notice verbatim:

> Exported to headerwright-profiles.json. Header values are saved in plain text
> — if any are tokens or cookies, treat the file as a secret.

| Step | Observed |
| --- | --- |
| 1 notice appears | PASS — names the file and states the risk |
| 2 reads NEUTRAL, not as an error | PASS — soft gray, clearly distinct from the danger colour on the same element |
| 3 both themes | PASS — checked in dark and light; `--ink-soft` and `--line` resolve correctly across the dark-block redefinition |
| 4 channel still carries errors | PASS — notice REPLACED by `Import failed: profile 1, header 1: missing or empty header name.` in the error colour |
| 5 no confirmation before export | PASS |
| 6 export closes a pending delete | PASS — confirmation withdrew, notice appeared in its place, never both |

**Steps 2–4 are the rows the suite structurally cannot do.** The suite proves
the `.notice` class is DEFINED; it cannot see what colour anything renders.
Step 4 is the stronger half: a one-way class toggle would make every future
import rejection read as a success, which is worse than the defect v0.1.2 fixed.

### Part 11 — subdomain application and upgrade path — PARTIAL (step 5 only)

**Step 5 — PASS.** Native dialog for a fresh domain, verbatim:

> "HeaderWright — Modify HTTP Request Headers" has requested additional
> permissions.
>
> **It could:**
>
> Read and change your data on all p11.test sites and p11.test

It does name the site and its subdomains. Recorded because **this is the
user-visible cost of the FINDING-018 fix and it had never been written down.**
Two observations attach to it. Chrome renders the wildcard as "all X sites" and
the apex as bare "X", so the domain appears twice with no evident distinction —
Chrome composes this string, HeaderWright supplies only the two patterns.
And Chrome's fixed wording says **"Read and change"** although HeaderWright has
no `webRequest` and no code path observes traffic; the store description ("No
webRequest — this extension cannot read your traffic") is the only thing
correcting that. Inherent to the architecture, and an argument for the
description's wording rather than a defect.

**Steps 1–4 — NOT RUN. FIXTURE UNAVAILABLE.** They require an echo endpoint
reachable at BOTH an apex and a subdomain. `sub.postman-echo.com`,
`a.b.postman-echo.com` and `sub.httpbin.org` were each tried and none resolve;
no host with a wildcard DNS record was available.

**This is the part SMOKE.md states the selftest structurally cannot do.** The
suite proves the permission set and the DNR host set cover the same hosts, but
that is two string oracles agreeing with each other; only Chrome can say the
header reaches the wire on a subdomain, and through v0.1.3 the construction was
right, the oracle said yes, and the wire said nothing. **v0.1.4's central claim
has no browser evidence in this sitting**, and neither does step 4, the
over-application check that a suffix confusable receives NO header — which
SMOKE.md calls a worse bug than the one being fixed.

Not a v0.1.7 gap: this release touched `grants.js` only and left pattern
construction alone. It is a standing gap in the suite's coverage.

**Step 6 onward — DEFERRED.** See the fixtures section.

### Part 12 — revocation under migration — DEFERRED ENTIRE

Both preconditions fail. SMOKE.md states Part 12 continues from Part 11 step 6
with a domain still gray, and its own PRECONDITION requires a Chrome profile
with no approval history for the hostnames used. `hw-test` accumulated approvals
for ten hosts over this sitting. Recorded as one deferral with one reason rather
than as separately considered rows.

### Part 13 — collision refusal — PARTIAL (form rows only)

**Step 3 — PASS, and SMOKE.md names it the row that cannot be skipped.** Two
profiles, `c1.test` and `notc1.test`, both writing `X-Collide`. **Both saved.**
`"notc1.test".endsWith("c1.test")` is true, so a string-suffix test would refuse
two configurations covering disjoint hosts. It did not.

**Step 1 (form half) — PASS.** `sub.c1.test` against `c1.test` is a real overlap
and became one only in v0.1.4. Refused, verbatim:

> Not saved: header "x-collide" is also written by "C1" on an overlapping
> domain. Two profiles cannot write the same header on the same request. Change
> the header or the domains, then save.

**Step 2 — the STRICT decision — PASS.** Both profiles set `X-Collide` to the
SAME value, so the outcome no longer depends on order. Refused anyway, same
message. This is the deliberate choice in `decisions.md`, confirmed at the
surface a user is most likely to report as wrong.

The collision MARKER wording (Part 14, where two markers were on screen) is
distinct from the form refusal — "Not applying … so neither applies" versus
"Not saved … then save". FINDING-026's fix working: written for the surface it
appears on, not reused.

**Wire rows, step 4 storage before-state, steps 5 and 6 — NOT RUN.** They
require an echo server at `127.0.0.1` with `c1.test`, `sub.c1.test` and
`notc1.test` resolving to it. The claim that a refused pair applies NEITHER
header remains without browser evidence in this sitting; OBS-C10 banks only the
v0.1.4 before-state.

### Part 14 — popup containment — PASS (step 4 NOT REACHED)

| Step | Observed |
| --- | --- |
| 1 long list, 8 profiles | master toggle visible without scrolling; status line visible without scrolling; list scrolls independently and reaches the eighth; **scrollbar confined to the list** |
| 2 OBS-D12 configuration | 3 profiles, two collision markers on screen: **Add profile reachable by scrolling, and the master toggle never leaves view** |
| 3 confirmation row | OBSERVATION: at 8 profiles the confirmation is NOT visible without scrolling, and nothing indicates the popup continues below |
| 4 small display | **NOT REACHED** |

Step 2 is the direct comparison against OBS-D12, which recorded Add profile
pushed below the fold at exactly three profiles on v0.1.5. Containment holds at
the worst realistic case — three profiles with two full-height markers.

Collision marker verbatim, both cards carrying one, neither silently the loser:

> Not applying: header "x-same" also written by "Test3" on an overlapping
> domain. Two profiles cannot write the same header on the same request, so
> neither applies. Change the header or the domains in one of them.

Step 4: Chrome was resized well below the popup's height and **the popup
rendered at full size, overflowing past the window edge** — Chrome does not
clamp it to the window. Sub-600px containment has no evidence either way.
Recorded as NOT REACHED, not as a pass, per the step's own instruction.

Step 3 is recorded as an observation per SMOKE.md and nothing was fixed during
the run.

---

## FINDING-030 — five independent sightings, and the finding is MIS-SCOPED

The operator hit this five times across the sitting, four of them unprompted and
while doing something else:

1. **Delete confirmation**, during P3. Operator's wording, kept: *"when I delete
   the delete confirm button remains hidden. So to a user it will look like
   nothing happened."*
2. **Import confirmation**, Part 1 step 5 — and it made the round-trip check
   VACUOUS, because Replace was never clicked and the diff was empty by
   construction.
3. **Import result message**, Part 6.
4. **Part 9 step 3**, the formal row, at 8 profiles.
5. **Part 14 step 3**, at a stated profile count with two collision markers.

Structural cause, read off `popup.html` at this commit: `header` and
`footer#status-line` are `flex: none` siblings of `main` and are pinned.
Everything else — the profile list, the Add profile / Export / Import row, and
BOTH `#import-confirm` and `#delete-confirm` — lives inside `main`, which is
`flex: 1 1 auto; overflow-y: auto`.

**The finding as filed says "the delete confirmation lands below the fold". The
evidence says every transient message renders inside the scrolling region, and
the only pinned surface is the status bar.** Rescoped in `FINDINGS.md` on this
evidence.

The operator proposed pinning the bottom action row as the status row is pinned.
Recorded as a proposal: it is a real improvement and structurally the same move
that fixed FINDING-022, but it does NOT close the finding, because both
confirmations sit below the list inside `main` and would stay there. **Two
candidate fixes, not one.**

Ruled for the next release, not this one. A UI change mid-sitting invalidates
the build every prior row was scored against.

## FINDING-029 — three sightings

The canonical-form echo appeared three times: the Part 13 form refusal
(`"x-collide"` for a field reading `X-Collide`), the Part 14 collision markers
(`"x-same"` for `X-Same`), twice on screen at once. Open, roadmap item 3, and
the shape of the fix is still unruled.

## Six procedure defects in SMOKE.md

All found by running the document rather than reading it. Five are stale —
a step whose meaning stopped being true when something else shipped, and nobody
re-read it. **One would have produced a FALSE PASS.**

| # | Where | Defect |
| --- | --- | --- |
| 1 | Part 0 step 6 | "No prompt means the grant never dropped" — falsified by sitting C's approval cache |
| 2 | Part 2a setup | "any header" on overlapping domains is UNSAVABLE since FINDING-021 shipped in v0.1.5 |
| 3 | **Part 2a fixture** | `example.com` + `api.example.com` — the wildcard subsumes the subdomain, so **the row passes on a build where retention is broken** |
| 4 | Part 2c | Expectation inverted by the v0.1.7 ruling; also carries the same false "only recovery" claim as `grants.js` |
| 5 | Part 2b | Rationale backwards — expectation still correct |
| 6 | **Part 3b** | Points at the POPUP console; `syncRules` runs entirely in `sw.js`, so the error cannot appear there — **a false pass, not a false alarm** |

Two further corrections are owed for reasons outside SMOKE.md's own text: Part 5
step 3 does not say to grant the new profile's domain, and Part 1 step 5 has no
step confirming the import was applied.

## The two missing fixtures

Every deferral in this section traces to one of these. Both are cheap to acquire
and neither is a v0.1.7 gap.

1. **A domain with a wildcard DNS record and an echo endpoint.** Blocks Part 11
   steps 1–4 and Part 13's wire rows — including the part SMOKE.md says the
   selftest structurally cannot cover.
2. **A v0.1.3 install plus a Chrome profile with no approval history for the
   test hostnames.** Blocks Part 11 step 6 onward, Part 12 entire, and the
   runbook's Part C (P6/P7).

## Part E row status

| Part | Verdict |
| --- | --- |
| 0 revocation baseline | PASS |
| 1 core application | PASS |
| 2 permission lifecycle | PASS (2c fails as written, correctly) |
| 3 badge honesty | PASS |
| 3b sync serialization | PASS |
| 4 validator bounds | PASS — two constants now measured |
| 5 generated rule ids | PASS |
| 6 over-cap import refusal | PASS |
| 7 domain dedup | PASS |
| 8 live state | PARTIAL — step 4 NOT RUN (instrument) |
| 9 delete confirmation | PASS |
| 10 export notice | PASS |
| 11 subdomain and upgrade | PARTIAL — step 5 only |
| 12 revocation under migration | DEFERRED ENTIRE |
| 13 collision refusal | PARTIAL — form rows only |
| 14 popup containment | PASS (step 4 NOT REACHED) |

**Nothing in Part E blocks v0.1.7.** Every deferral is a standing gap in the
suite's fixtures, not a gap in this release, which touched `lib/grants.js` only.


# Sitting F — the store-CRX row, v0.1.5 -> v0.1.6

**2026-09-04, after publication.** One row, run on the STORE-INSTALLED copy
(`ooapgilielelobkkcdlnkenkflbnnmhi`) and updated by Chrome itself.

**This closes a question carried since before v0.1.5.** Every layout reading in
sitting E was taken on unpacked builds swapped by hand. This is the path a real
user takes: Chrome replacing the code underneath a live install that already
holds its own storage and grants. OBS-D13 closed the equivalent question for
the collision refusal; nothing had closed it for containment.

**The row was time-limited and nearly lost.** Chrome auto-updates on its own
schedule, so the "before" reading exists only until it does. The install was
found still on 0.1.5 and the baseline was taken before touching Update.

---

## OBS-F1 — FINDING-022 measured on a published build, before and after

**Setup.** Store-installed v0.1.5, five profiles, one header each, on
`sub.f1.test`, `f2.test`, `f3.test`, `f4.test`, `f5.test`. No collisions. Two
profiles happen to share the display name `Test2`; duplicate names are
permitted and are not part of this row.

**Baseline, v0.1.5:**

    version 0.1.5   origins []   rules 0
    status line: "5 profiles · 0/5 domains granted · applying"

    innerHeight 600   docScrollH 681   mainCanScroll false   headerTop 0
    after scrolling the DOCUMENT to its end:
    docScrollTop 81   headerTop -81   footerBottom 600.27

**After Chrome's own Update, v0.1.6:**

    innerHeight 600   docScrollH 600   mainCanScroll true    headerTop 0
    (measured with `main` scrolled to its end)

**All three indicators flip:**

| | v0.1.5 | v0.1.6 |
| --- | --- | --- |
| `docScrollH` vs `innerHeight` | 681 vs 600 — the DOCUMENT scrolls | 600 vs 600 — it does not |
| `mainCanScroll` | false — `main` is not a scroll container | true |
| `headerTop` after scrolling | **-81**, the toggle is off-screen | **0**, pinned |

`headerTop: -81` is the numeric form of the defect FINDING-022 describes, and
it is the first time it was measured rather than observed. The status line was
simultaneously pushed past the viewport bottom.

**The update preserved everything it should.** Extension ID unchanged, storage
intact, all five profiles present, grants unchanged by the update itself. No
removal, no unpacked reload — Chrome's Update button and nothing else.

**THE v0.1.5 THRESHOLD IS NOW MEASURED.** Six profiles with no collision
markers overflowed a 600px popup by 81px. FINDING-022's original text estimated
six; OBS-D12 measured three WITH two collision markers. The two numbers are
consistent — the markers cost roughly the ~110px each that was estimated — and
both now rest on readings rather than one on an estimate.

---

## OBS-F2 — one approval granted two domains, on a store build

Before the update, a permission dialog was approved by mistake. The status line
moved from `0/5` to `2/5` domains granted — **one approval, two domains.**

That is FINDING-028's signature (`reconcileGrants()` requesting the full
ungranted set rather than the domain acted upon), and this is the first time it
has been seen on a STORE build rather than an unpacked one. Recorded as
corroboration for that finding, not as a new one: the action that triggered the
dialog was not recorded, so this does not establish which path requested.

**What it does establish** is that the behaviour is not an artifact of unpacked
loading, which was a live alternative explanation for OBS-E5.

---

## Correction found while running this row

`handoffs/headerwright/NEXT.md` (planning repo) states the store fixture "holds
one granted profile". At the start of this row it held one UNGRANTED profile
(`origins: []`), and it now holds five with two granted. The fixture's purpose —
the 0.1.2 re-prompt test — was discharged long ago, so this is bookkeeping
rather than a problem.

**It is a lesson 11 instance inside the file that carries lesson 11**, recorded
on the same day that lesson was promoted. A file stating a fixture's contents
needs a re-read when the fixture changes, and nothing prompted one.

---

# Sitting E — v0.1.6 popup pass — COMPLETE

**2026-09-04.** Procedure: `test/SMOKE.md` Part 14. Predictions pre-registered
in `test/RUNBOOK-2026-09-04-v016.md`, frozen before the browser opened.

**THIS SITTING TOUCHED NO WIRE, AND THE RECORD SHOULD NOT BE READ AS IF IT
DID.** Every reading below is about what the popup displays. No rule was built
differently, no grant was requested differently, no header changed. The oracle
is the screen, which is the weakest one this project has used — so every row is
recorded with the measurement that produced it rather than a verdict alone.

## Environment

    Build under test    antrixy/headerwright, initially 7e138f1 (v0.1.6)
                        AMENDED MID-SITTING — see OBS-E1
    Extension           unpacked, Developer mode
    Profiles            TWO Chrome profiles (deviation — see below)
                        "clean"  : v0.1.6 only, no approval history
                        "legacy" : v0.1.3 first, upgraded in place to v0.1.6
    Hostnames           p1.test - p9.test, none reused from sittings A-D
                        None resolve. No echo server, no /etc/hosts.

**DEVIATION 1 — two profiles, not one.** The runbook's section 2 says one
profile suffices, written when Phase C was assumed unreachable. C became
reachable once the v0.1.3 tag was found to be fetchable, and a legacy grant
makes the migration notice render inside the scrolling region on every popup
open — which would have changed the layout P1-P3 were frozen against. A second
profile keeps Phase A answering the question it was written to answer. No row's
conditions were altered.

**DEVIATION 2 — rows reordered.** A2 was run last rather than second, to avoid
deleting five profiles and rebuilding them. A2's colliding configuration is
what B2 imports, so running them adjacently is also cheaper. No row's
conditions were altered.

**DEVIATION 3 — the build was amended mid-sitting.** Unavoidable; see OBS-E1.
Rows P1-P12 were all taken AFTER the amendment. Nothing was measured against
the broken build except OBS-E1 itself.

---

## OBS-E1 — THE FIX BROKE THE POPUP. Found on first open, before any row.

**The most important observation of the sitting, and it falsifies a design
choice rather than a line of code.**

v0.1.6 capped the popup with `max-height: min(600px, 100vh)`. On first open, at
ZERO profiles, the popup rendered as a header, a footer, and a two-pixel sliver
between them — the top border of the empty-state box. **Add profile was
entirely clipped. The extension could not be used at all.**

Measured in the popup console:

    innerHeight       107
    bodyMaxHeight     "107px"
    bodyHeight        107
    mainHeight         22
    mainScrollHeight  141

**Cause: `vh` IS CIRCULAR IN A POPUP THAT SIZES TO ITS CONTENT.** Chrome
derives the popup viewport from the body height; the body height was capped by
`100vh`; `min()` takes the SMALLER term. A small viewport produced a smaller
cap, which produced a smaller viewport. It settled at 107px.

**The source comment defending the choice was wrong, and wrong in a specific
way worth recording.** It claimed that if `100vh` were dishonest, "600px still
binds". That is false for `min()`, which selects the smaller operand — a
dishonest small `100vh` binds TIGHTER, not looser. The claim was reasoned, not
measured, and it was propagated into the FINDINGS entry and the session handoff
before a browser ever saw it.

**Fix applied mid-sitting: `max-height: 600px`.** Re-verified 273/273 with 31
mutants killed, including a new mutant that reinstates the exact broken line.

**What the suite did and did not do.** The selftest passed 272/272 against the
broken build and all six FINDING-022 declaration checks passed. THEY WERE RIGHT
TO. They read the stylesheet as text and prove the declarations exist; the
source comment and SMOKE Part 14 both say so explicitly. A new check —
`F022: the body cap uses NO viewport unit` — now pins the defect, but it exists
only because a browser said so. Nothing in the suite could have predicted it.

**This is the argument for browser sittings, stated in one observation.** A
release that was code-complete, selftest-green, mutation-clean and committed
was unusable on first open.

---

## Layout containment — P1, P2, P3 CONFIRMED

Eight profiles, one header each, all grants denied.

    innerHeight   600     mainH        514.06
    mainScrollH   925     canScroll    true
    docScrollH    600

After scrolling `main` to its end (`scrollTop 411`):

    headerTop     0       footerBottom 600

**`docScrollH == innerHeight` is the reading that proves the mechanism** rather
than the appearance: the document itself does not scroll. The list scrolls
between a fixed header and a fixed footer, and the toggle and status line
remain at the viewport extremes with the list fully scrolled.

---

## OBS-E2 / P6 CONFIRMED — the direct OBS-D12 comparison

**This is the row the release exists for.** Three profiles, two of them
colliding (`p2.test` and `sub.p2.test`, both writing `X-Test`), seeded from the
service worker console because the write path refuses it. Two collision markers
on screen — the exact configuration OBS-D12 measured on v0.1.5.

    before   scrollTop 62    addTop 529.75   visibleNow true
    after    addBottom 558.59   headerTop 0   footerBottom 600

**OBS-D12 recorded Add profile pushed below the fold with the toggle scrolled
away at exactly this configuration.** It is now reachable with both pinned
elements held. FINDING-022's narrow fix does what it was scoped to do.

Minor: the popup opened at `scrollTop 62` rather than 0. Not a defect; recorded
because it was measured.

---

## OBS-E3 / P7 CONFIRMED — the delete confirmation lands below the fold

Eight profiles, Delete clicked on the FIRST, list at top:

    visible true    scrollTop 0    confirmTop 978
    viewportH 600   offscreenBy 378.47

The confirmation renders at the bottom of the list view, below all eight
profiles and the Add profile bar. Nothing auto-scrolled. Nothing on screen
indicated the popup continued below.

**NOT A REGRESSION, and the distinction matters for whoever fixes it.** Before
v0.1.6 the popup grew to Chrome's 600px ceiling and then scrolled bodily, so a
confirmation this far down was also off-screen. What v0.1.6 changes is that the
pinned footer now sits flush at the bottom, which READS as the end of the
popup when it is not. **The defect is the missing cue, not the position.**

Raised as FINDING-030. Not fixed — the runbook says record and leave, and the
one-line remedy (`scrollIntoView()`) is new behaviour under the patch policy.

---

## P8 CONFIRMED — the editor scrolls, with the threshold recorded

Two readings, because the first did not exercise the prediction:

    6 header rows    mainScrollH 521   overflowed —      reachable true
    10 header rows   mainScrollH 665   overflowed true   reachable true
                     headerTop 0       footerBottom 600

**At six rows the form never overflowed**, so the scrolling half of P8 was not
tested; the runbook's estimate of six was wrong. At ten it overflowed and the
form scrolled inside `main` with Save and Cancel reachable and both pinned
elements held. Both readings are recorded because the threshold is more useful
than the pass.

---

## P5 CONFIRMED — the cap releases when it should

One profile:

    innerHeight 246    bodyH 246.41    mainScrollH 160

The popup sized to its content, nowhere near the cap. This is the other half of
containment: a cap that never released would mean a mostly-empty 600px popup
for the common single-profile case.

---

## OBS-E4 / P9, P10 CONFIRMED — the FINDING-026 write-path messages

**P9, the save refusal, verbatim:**

> Not saved: header "x-test" is also written by "Test2", "Test3" on an
> overlapping domain. Two profiles cannot write the same header on the same
> request. Change the header or the domains, then save.

No "not applying". Names the header. Names BOTH other profiles. States the way
out. Fits the error area at 380px without overflow — sitting D's P8 predicted
the v0.1.5 message would overflow and was wrong, so this was a real test rather
than a reused assumption.

**P10, the import refusal, verbatim** (exporting the colliding configuration
and re-importing it):

> Import failed: "Test2" and "Test3" both write header "x-test" on overlapping
> domains, and two profiles cannot write the same header on the same request.

**The problem stated ONCE. One full stop.** OBS-D8 stated it twice and ended in
two — `...one of them..`. All three defects closed.

**The screenshot of P10 is the best evidence of why the finding mattered:** the
import refusal appears directly beneath two card markers that legitimately read
"Not applying:", and no longer echoes them. That contrast was the argument.

FINDING-027 reproduced as expected — HeaderWright refused a file HeaderWright
wrote. Known, open, unchanged, and the runbook says not to treat it as a
regression.

---

## OBS-E5 — a DELETE path issued a permission REQUEST

**Not predicted. Not in the runbook. The most substantive new defect found.**

With all eight profiles' grants denied (`0/8 domains granted`), deleting
profiles produced a host-permission REQUEST dialog. One approval granted the
full v0.1.6 origin set for every surviving profile:

    *://*.p1.test/*  *://*.p2.test/*  *://*.p3.test/*  *://*.p4.test/*
    *://p1.test/*    *://p2.test/*    *://p3.test/*    *://p4.test/*

Four domains the user never approved during setup, granted from a delete
confirmation.

**The revoke direction is CORRECT**, which narrows the diagnosis considerably.
Later in the sitting the service worker logged:

    HeaderWright: revoking 4 host grant(s) no profile references —
    *://*.p3.test/*, *://*.p4.test/*, *://p3.test/*, *://p4.test/*

So grants do not leak. `reconcileGrants()` appears to compute `toRequest` from
every ungranted domain in the SURVIVING set on any mutation, rather than only
on the paths where a request is warranted. Deleting should only ever revoke.

**Not a status-line defect.** `0/8` was accurate before the grant and `4/4`
accurate after; the honesty surface tracked correctly throughout. The defect is
that the request was offered at all.

Adjacent to FINDING-024, which describes the same mechanism for LEGACY domains
specifically. This is the broader case. Raised as FINDING-028.

---

## OBS-E6 — popup flicker during a delete

Observed during one delete, not reproduced deliberately. Recorded because it
was seen, not because it is understood. Possibly the popup re-laying out as the
list shrank, which is new surface area from the containment change. No
measurement taken.

---

## OBS-E7 — the header name is echoed in canonical form, not as typed

Two instances, both visible in single screenshots:

- The card marker for a profile seeded with `X-Test` reads `"x-test"`.
- The SAVE REFUSAL reads `"x-test"` while the form field directly above it
  still shows `X-Test` as the user typed it.

Lowercasing for COMPARISON is correct and is why collisions are detected at
all. Echoing the canonical form back to the user is the defect: a message
quoting a header they did not write is harder to match against their own
configuration. Raised as FINDING-029.

---

## P11 CONFIRMED — the migration path, end to end

Legacy profile: v0.1.3 installed, one profile `Legacy` on `p9.test`, grant
APPROVED under v0.1.3. Verified narrow before upgrading:

    origins: ["*://p9.test/*"]        <- one pattern, no wildcard sibling

**C0 caught a setup error and is the reason this row exists.** The first
attempt found `origins: []` and no `hw:profiles` — the Chrome profile had
v0.1.3 loaded but no HeaderWright profile had ever been created, so no grant
existed. Without the precondition check the upgrade would have shown no
migration notice and P11 would have been recorded as FAILED on a fix that is
fine.

Upgraded by swapping the folder contents at the SAME path and reloading, so the
extension ID was preserved (`bkhpnhlpfhjhahjkgaobkckpbjpkkmbh`). Notice
verbatim:

> HeaderWright now requests access to subdomains, so headers set for
> example.com also apply on api.example.com. 1 domain granted under an earlier
> version does not cover this yet, and its headers will not apply until
> re-approved. Click any underlined domain below to re-approve it.

Singular agreement throughout — "1 domain", "does not cover", "its headers" —
a branch never previously exercised. The chip is visibly underlined; the notice
names that marker.

**The honesty surface holds across migration.** Status line read `0/1 domain
granted` while Chrome still held the narrow grant. It counts COVERAGE, not
permissions.

**The grant was NOT silently widened.** After upgrade, before clicking:

    origins: ["*://p9.test/*"]        <- unchanged

After clicking the chip and approving:

    origins: ["*://*.p9.test/*", "*://p9.test/*"]

Notice gone, dot green, `1/1 domain granted`. Migration stays user-approved,
which is FINDING-018's principle intact.

---

## P14 FALSIFIED — the tooltips render. FINDING-023 is NOT REPRODUCIBLE.

**The prediction was that no tooltip would appear anywhere in the popup, at low
confidence. It was wrong.** Both tooltips rendered on hover:

- Master toggle: *Apply all profiles on or off*
- The MIGRATING chip: *p9.test: this domain was granted under an older version
  that did not cover subdomains. Headers will not apply until you click to
  re-approve.*

FINDING-023 is filed as "the domain chip's tooltip never renders", and its
stated harm is that the migration explanation is reachable only through
DevTools. **The chip tooltip rendered, on the migration state specifically —
the exact case the finding is about.** Sitting D's observation was wrong or
environment-specific.

**Consequence: FINDING-023 is withdrawn as not reproducible.** The entry
written for v0.1.6 asserted the cause was "not established" and the text
"reachable only through DevTools". Both claims are now false and were corrected
before tagging.

**What survives.** The migration notice's wording and its three selftest checks
stay. Naming the underline is still worth having — it is simply not repairing a
defect, so the justification changes from "the only channel is unreachable" to
"a second channel is cheap, and the notice and the stylesheet should agree".

**Open and NOT guessed at in the entry:** what sitting D actually observed.
Candidates include a granted `<span>` rather than a `<button>`, DevTools
holding focus, or too short a hover. Unresolved.

---

## P12 CONFIRMED — no errors

Console filtered to Errors only, both contexts: nothing. Issues panel reports
**0 errors, 0 warnings, 1 informational**.

The informational item is *"No label associated with a form field"* — the
`.toggle` `<label>` wraps its `<input>` without a `for` attribute, so a screen
reader may not announce the master toggle. **Not a v0.1.6 defect and not a
regression**; static markup advice. Carried as an accessibility item for
v0.1.7 rather than dropped.

The issue COUNT rose from 1 to 19 to 31 during the sitting, which was
initially read as errors accumulating. It is the same single informational item
repeating per added header row. Recorded because the wrong reading was acted on
before the filter was applied.

---

## P4 — CONFIRMED at 600px; THE SUB-600 CASE NOT REACHED

    innerHeight 600   bodyMaxH "600px"   bodyH 600
    docScrollH  600   headerTop 0        footerBottom 600

`bodyMaxH` reads `600px`, confirming the circular cap is gone. `docScrollH ==
innerHeight` with both elements pinned.

**But the prediction's actual condition was never produced.** P4 asked what
happens when Chrome sizes the popup BELOW 600px. The Chrome window was reduced
to roughly 380px tall and the popup viewport still reported 600 — **Chrome
sizes an action popup independently of the parent window**, as an overlay
rather than a constrained child.

**So the known limit documented in `popup.html` — that a viewport shorter than
the cap would let the body scroll bodily — is not merely unfixed. It is
UNOBSERVABLE on this hardware, and may require an actual short display.** The
source comment was revised after this sitting: claiming a known limit that
nobody can reproduce overstates what is known.

The original P4, as written, was superseded by OBS-E1 — which was the same
failure mode arriving universally rather than on small displays.

---

## Row status

    P1  toggle pinned at 8 profiles            CONFIRMED
    P2  status line pinned at 8 profiles       CONFIRMED
    P3  list scrolls independently to p8       CONFIRMED
    P4  pinned below 600px viewport            CONFIRMED at 600; sub-600 NOT REACHED
    P5  popup sizes to content at 1 profile    CONFIRMED
    P6  Add profile reachable (OBS-D12 cfg)    CONFIRMED
    P7  delete confirmation below the fold     CONFIRMED — 378px
    P8  editor scrolls, Save reachable         CONFIRMED at 10 rows
    P9  save refusal, no "not applying"        CONFIRMED
    P10 import refusal, one statement/one stop CONFIRMED
    P11 notice names the marker, chip underlined CONFIRMED
    P12 no new console errors                  CONFIRMED
    P14 no tooltip anywhere                    FALSIFIED — tooltips render

    OBS-E1  circular vh cap; popup unusable    FIXED mid-sitting
    OBS-E5  delete path issues a request       -> FINDING-028
    OBS-E6  popup flicker during delete        recorded, not diagnosed
    OBS-E7  header echoed in canonical form    -> FINDING-029
    P7      confirmation visibility            -> FINDING-030

## Corrections applied after this run, before it was finalised

- **`extension/popup/popup.html`** — the cap changed to `600px` and its comment
  rewritten around the measurement. A second revision removed the overclaim
  about the sub-600 limit, which P4 showed is unobservable here.
- **`test/selftest.mjs`** — added `F022: the body cap uses NO viewport unit`.
  272 -> 273.
- **`test/mutate-collisions.py`** — added a mutant reinstating the circular cap.
  30 -> 31, all killed.
- **`FINDINGS.md`** — FINDING-023 rewritten as WITHDRAWN, not reproducible.
  FINDING-022's "which term binds is not established" paragraph replaced with
  the measurement. FINDING-028, 029, 030 raised.
- **`test/RUNBOOK-2026-09-04-v016.md`** — two errors of mine, left in place as
  the historical record and corrected here rather than edited: section 2 says
  "on the tagged tree" when the release sequence tags AFTER the sitting, and
  its preflight number is 272, now 273. The prediction table was NOT edited.

---

## OBS-D13 — the refusal reaches an install CHROME UPDATED — post-publish row

**2026-09-02, the day after sitting D.** Taken after v0.1.5 was published to
the Chrome Web Store, on a real store install that Chrome updated itself. This
is the row the whole "store CRX" question reduced to, and it is the only
observation of the build-path refusal on Chrome's own update mechanism rather
than a manual reload.

**Provenance, stated plainly because it differs from the runbook.** The clean
`hw-fixture` profile built in sitting D phase A was deleted before this could
be run. The row was recovered on a WORKING Chrome profile — real everyday
extensions installed, not a clean one — which still had HeaderWright 0.1.4 from
the store, ID `ooapgilielelobkkcdlnkenkflbnnmhi`. The window existed only
because 0.1.5 had just published and this install had not yet auto-updated: on
0.1.4 a colliding pair can still be created, and on 0.1.5 it cannot.

**Before, on 0.1.4, re-established on this profile immediately prior:**

```
sub.f1.test:8080   -> x-fix: B
```

Same pair as OBS-D1 (Test1 `f1.test` X-Fix=A, Test2 `sub.f1.test` X-Fix=B),
reproducing the second-profile-wins result on a second independent install.

**Updated via `chrome://extensions` -> Update.** Card flipped 0.1.4 -> 0.1.5,
ID unchanged. No uninstall, no reload of an unpacked folder, no storage
editing — Chrome's own update path.

**After:**

```
popup      2 profiles · 2/2 domains granted · applying     badge ON
           both cards marked, both dots GREEN
           NO migration notice (expected — v0.1.5 adds no permissions)
wire       f1.test:8080       -> (no x-fix)
           sub.f1.test:8080   -> (no x-fix)
```

**BOTH SIDES SKIPPED.** Test1 was applying correctly and had no part in the
change; it stopped applying too. Registered prediction was that this would be
identical to OBS-D4's storage-written case in every respect — **right**.

**What it settles.** OBS-D4 established the build-path refusal reaching an
install where no write occurred, but reached that state by editing storage from
the service worker console. Whether Chrome's real update path behaved the same
was an assumption. It no longer is. The two paths produce identical popup state
and identical wire results.

**A note on how this row was managed, worth keeping.** It was carried as a ship
BLOCKER across several sessions under the description "the smoke tests ran
against an unpacked build rather than the store artifact." That description was
overspecified. On inspection the only thing it could falsify was Chrome's
auto-update mechanism versus a manual reload-in-place — the extension id does
not enter any code path, and sitting C had deliberately preserved the id by
reusing the folder. It was then argued to be permanently unrunnable, on the
grounds that the store serves only the current version. That was also wrong:
the release ZIPs are in the repo, and in the end the row was runnable on
Chrome's update path for the cost of ten minutes on the day of publish. A
requirement described by what it REPRESENTS rather than what it TESTS will
outlive its usefulness and block work it was never protecting.

---

# Sitting D — v0.1.5 collision refusal — COMPLETE

**2026-09-01.** Runbook: `test/RUNBOOK-2026-09-01-v015.md`, predictions frozen
before Chrome opened. **13 of 15 predictions right, 2 wrong.** Both wrong ones
are recorded below with their original text.

**OBS-D13 above was taken 2026-09-02, after publish** — the post-publish row
this sitting's phase A was built to enable. It carried its own registered
prediction, which was right.

## Environment

- Chrome 151.0.0.0, macOS 10.15.7 (UA string).
- Two Chrome profiles, never both active — store 0.1.4 and unpacked 0.1.5 would
  each register DNR rules and make every wire reading uninterpretable.
  - `hw-fixture` — HeaderWright 0.1.4 **from the Chrome Web Store**, id
    `ooapgilielelobkkcdlnkenkflbnnmhi` confirmed before use.
  - `hw-13` — 0.1.5 unpacked from the tagged tree, id
    `ddgomchkggjoehcoeibmmnfaakjanmce` (path-derived, expected).
- Fresh hostnames, none reused from sittings A–C: `f1.test sub.f1.test`,
  `c1.test sub.c1.test`, `n1.test notn1.test`, `s1.test sub.s1.test`,
  `e1.test`. All nine confirmed resolving to 127.0.0.1 before Chrome opened.
- Echo server on `:8080`. Every wire reading taken by browsing in Chrome, never
  by curl — curl does not carry the extension.

## Prediction results

| # | Result | Note |
| --- | --- | --- |
| P1 single winner on 0.1.4 | RIGHT | OBS-D1 |
| P2 winner is the first-created profile | **WRONG** | OBS-D1 — B won. The most useful result in the sitting. |
| P3 no header on the wire for a colliding pair | RIGHT | OBS-D4 |
| P4 both cards marked | RIGHT | OBS-D4 |
| P5 chips green, badge ON, count unchanged | RIGHT | OBS-D7 |
| P6 one warning per sync, not per pair | RIGHT | OBS-D11 |
| P7 identical-value save refused | RIGHT | arrived early, OBS-D3 |
| P8 message overflows the form at 360px | **WRONG** | OBS-D3 — renders in four lines, legible |
| P9 confusables both apply | RIGHT | OBS-D6 |
| P10 storage-written pair stops applying | RIGHT | OBS-D4 |
| P11 unrelated profile still saves | RIGHT | OBS-D10 |
| P12 collision can be edited away | RIGHT | OBS-D10 |
| P13 cap outranks collision as the reason | RIGHT | OBS-D9 |
| P14 marker survives popup reopen | RIGHT (incidental) | held across ~12 opens; not a designed check |
| P15 colliding export cannot be re-imported | RIGHT | OBS-D8 — new finding |

---

## OBS-D1 — the winner on 0.1.4 is NOT order-based — P2 WRONG

Phase A, store 0.1.4, profile `hw-fixture`. Two profiles created in this order:

```
id 1  Test1  f1.test       X-Fix set "A"    (created first)
id 2  Test2  sub.f1.test   X-Fix set "B"
```

Creation order, id order and storage order all coincide, deliberately — the
same non-discriminating shape as OBS-C10.

```
f1.test:8080       -> x-fix: A      (control: only Test1 matches. Rules registered.)
sub.f1.test:8080   -> x-fix: B      (both match. ONE value.)
```

**P1 right:** one winner, no concatenation, no duplicate header.

**P2 wrong.** The registered prediction was that the first-created profile
wins. It did not. All three order-based candidates favoured Test1 and all
three are ruled out for this configuration.

**THIS CONTRADICTS OBS-C10 ON DIRECTION, and the difference is diagnostic.**

| | domains | first-created | winner |
| --- | --- | --- | --- |
| OBS-C10 | `shared1.test` / `shared1.test` — identical | Test = A | **A** — first wins |
| OBS-D1 | `f1.test` / `sub.f1.test` — apex vs exact | Test1 = A | **B** — second wins |

Same extension version, same creation order, same id order, same storage
order, opposite outcome. **No single order-based rule explains both cells.**
The one differing variable is the domain relationship, which makes specificity
the leading hypothesis — when both rules match the host equally, something
order-like decides; when one matches exactly and the other by subdomain, the
exact match wins. Two cells is not a mechanism, and this is not a resolution.

**Why it matters beyond the record.** The v0.1.5 roadmap originally planned to
assign DNR priorities by list order and mutation-test the result by reordering
profiles. OBS-C10 was described there as the banked before-state. Had that
plan gone ahead, the mutation test would have been anchored to a baseline that
points the WRONG WAY in the apex/subdomain case — which is precisely the case
FINDING-018 made common. The oracle was not merely non-discriminating, as was
argued when refusal was chosen; on this evidence it was misleading.

The release does not depend on resolving it. Both configurations are refused
by v0.1.5, so the mechanism never needs to be known. See FINDING-021.

**Fixture preserved.** `hw-fixture` was closed after this reading and is not to
be touched until 0.1.5 is live and Chrome updates it — see the post-publish row
in the private handoff. A colliding pair cannot be created on 0.1.5, so this
fixture cannot be rebuilt after publish.

---

## OBS-D2 — an apex grant silently covers subdomains for later profiles

In `hw-13`, granting Test1 on `c1.test` and then adding Test2 on
`sub.c1.test` produced **no permission dialog** for Test2; the footer went
straight to `2/2 domains granted`.

Cause: `originsForDomain("c1.test")` emits `*://*.c1.test/*`, and Chrome's
`*.` form covers the apex and every subdomain. Chrome had nothing new to ask
for. This is the same fact recorded from the extension's side in the
FINDING-025 material (`*://*.hw.test/*` genuinely IS the whole grant), now
observed from the user's side.

**The contrast in the same session is what makes this solid.** Test4 on
`notn1.test` DID produce a dialog, because `*://*.n1.test/*` does not cover it.
Silent where coverage exists, prompting where it does not.

This retires the UNCONFIRMED note from phase A, where the reporter was unsure
whether Test2 prompted. Same shape, clean profile, unambiguous answer.

---

## OBS-D3 — the write path refuses at the form — P7 early, P8 WRONG

Attempting to save a second profile on `sub.c1.test` writing the same header
name as an existing profile on `c1.test` was refused in the form. Verbatim:

```
Not applying: header "x-collide" also written by "Test1" on an overlapping
domain. Two profiles cannot write the same header on the same request, so
neither applies. Change the header or the domains in one of them.
```

**P8 wrong.** The registered prediction was that the ~50-word message would
overflow the form error area at 360px. It renders in four lines, fully
legible, form usable underneath.

**Consequence for SMOKE Part 13 step 1.** The step as written — create two
colliding profiles through the UI, grant both, observe the wire — is
UNREACHABLE on 0.1.5, because the write path refuses the second save. Steps 1
and 4 collapse into the storage-write procedure. The document needs correcting.

**Defect found by rendering it.** See FINDING-026: "Not applying" is false
here, since nothing was saved.

---

## OBS-D4 — the build path refuses on the wire — P3, P4, P10 RIGHT

The reachable route to a colliding pair on 0.1.5 is to create it non-colliding,
grant it, then change one field in storage. Same profiles, same grants,
one header name renamed from `X-Collide-2` to `X-Collide` from the service
worker console:

```
BEFORE    c1.test:8080      -> x-collide: A
          sub.c1.test:8080  -> x-collide-2: B, x-collide: A
DURING    c1.test:8080      -> (nothing)
          sub.c1.test:8080  -> (nothing)
AFTER     c1.test:8080      -> x-collide: A
          sub.c1.test:8080  -> x-collide-2: B, x-collide: A
```

All readings hard-reloaded; `Cache-Control: no-cache` / `Pragma: no-cache`
present on the DURING readings, confirming they are not repaints. One stale
reading was discarded during the run and retaken.

**BOTH SIDES SKIPPED, NOT ONE.** Test1 was applying correctly and had no part
in the change — Test2 moved underneath it — and Test1 stopped applying too.
This is the assertion that distinguishes refusal from silently picking a
winner, and `c1.test` showing nothing is what proves it.

This exercises the BUILD path, not the write path: the storage write bypassed
`saveProfile()` entirely. It is therefore the browser evidence for the half of
the fix that reaches an install FINDING-018 pushed into a collision, where no
write is happening and no write-time check can see it.

---

## OBS-D5 — the refusal is scoped to the colliding pair

With Test1/Test2 marked and skipped, Test3 (`n1.test`), Test4 (`notn1.test`)
and Test5 (`e1.test`) applied normally in the same profile set. A collision
does not leak into unrelated profiles.

---

## OBS-D6 — suffix confusables are not a collision — P9 RIGHT

Two profiles both writing `X-Confuse`, on `n1.test` and `notn1.test`:

```
n1.test:8080      -> x-confuse: A
notn1.test:8080   -> x-confuse: B
```

Both saved, both granted, both applied, no markers on either card.

`"notn1.test".endsWith("n1.test")` is TRUE, so a string-suffix test in
`domainsOverlap()` would have refused this pair. The leading dot in
`` a.endsWith(`.${b}`) `` is the whole difference, and this is its wire control.

---

## OBS-D7 — the honesty exception, observed — P5 RIGHT

With both profiles colliding and applying nothing, the popup read:

```
2 profiles · 2/2 domains granted · applying          badge: ON
```

Both domain dots GREEN. The per-profile marker was the only surface telling
the truth.

**This is sharper than the README correction drafted before the run.** That
draft covered the green dot and the granted count. The status line literally
reads **`applying`**, and the badge reads **ON**. The README's "What you see is
what's true" bullet needs to cover all four, not two.

The behaviour is deliberate and consistent — `status.js` defers
`activeRuleCount` and `skippedProfileIds` to a future minor on the grounds that
new signal is a feature — but the README does not yet say so.

---

## OBS-D8 — a colliding configuration exports but will not re-import — P15 RIGHT

Export of the colliding state SUCCEEDED and produced a file. Importing that
same file was refused:

```
Import failed: this file has profiles that would write the same header on
overlapping domains, which has no defined winner. Not applying: header
"x-collide" also written by "Test2" on an overlapping domain. Two profiles
cannot write the same header on the same request, so neither applies. Change
the header or the domains in one of them..
```

`serializeProfiles()` does not validate; `parseProfilesFile()` now does. So
v0.1.5 can produce a file it will not accept. See FINDING-027.

---

## OBS-D9 — reason precedence holds at scale — P13 RIGHT

Imported a generated fixture of 5001 profiles (1.2 MB) containing a deliberate
`X-Both` collision between `example.com` and `api.example.com`. Refused:

```
Import failed: this file has 5001 profiles. The most that can be applied is
5000. Remove at least 1 profile from the file and try again.
```

The cap won; the collision was not mentioned. A file is rejected for the first
thing wrong with it, and the cap is both cheaper to explain and cheaper to fix.

**No perceptible delay** parsing 1.2 MB and running the collision scan over
4999 distinct header names in the popup. This is the first Chrome-side data
point against the cost note in `collisions.js`, whose 3 ms / 319 ms figures are
Node's. The 319 ms worst case (one shared header name across distinct domains)
was NOT exercised here.

Profile list survived intact at `4 profiles · 4/4 domains granted` — a refused
import changes nothing, because `parseProfilesFile()` throws before
`setProfiles()` runs.

---

## OBS-D10 — the editing exemption works — P11, P12 RIGHT

**Unrelated save, with a collision outstanding.** Test5 on `e1.test` saved
normally while Test1/Test2 were still colliding. Without this an upgraded user
would be locked out of every save with delete as the only exit — FINDING-015's
reasoning, one release on.

**The collision can be edited away.** Editing Test2's header name to
`X-Collide-2` saved successfully — the fix path is not refused — and BOTH
markers cleared, Test1's included. Storage confirmed the edit landed before the
wire was read.

---

## OBS-D11 — the warning fires per sync and has no dedupe — P6 RIGHT

```
HeaderWright: 2 profiles not applied — overlapping domains write the same
header with no defined winner (FINDING-021): x-collide [1, 2]
```

One line per sync, listing all collisions with both profile ids — not one line
per pair, as registered.

**No dedupe.** Six or seven identical lines accumulated across the run, one per
storage write while the collision persisted (adding Test3, Test4, Test5 and
their grants). Not a defect — the service worker console is developer-facing —
but a long session with a standing collision produces a wall of identical
lines.

**It releases correctly.** After the collision was edited away, the console was
cleared and a sync forced by toggling the master switch off and on. No warning.
Nothing is keyed on stale state.

---

## OBS-D12 — v0.1.5 makes FINDING-022 fire sooner

The Add profile button was pushed below the fold at **three profiles**, where
FINDING-022 records six. Two collision markers at roughly 110px each cost about
a profile and a half of vertical space, and the marker appears exactly when the
user needs to reach Edit.

Not a blocker — the list scrolls — but it raises the priority of the v0.1.6 UI
pass and changes FINDING-022's trigger threshold.

---

---

# v0.1.4 — COMPLETE

**STATUS: CLEARED TO SHIP.** The five rows sitting B left BLOCKED, and the four
it left unrun, were completed in sitting C (2026-08-29) in a fresh Chrome
profile with no approval history — the precondition sitting B's "Resume"
section named. The DO-NOT-SHIP condition is lifted. Sitting C is recorded
first, below; sittings A and B follow unchanged.

Run across three sittings. Sitting A (2026-08-15) covered v0.1.4's own
behavior; sitting B (2026-08-15) covered the v0.1.3 -> v0.1.4 upgrade path but
hit a Chrome approval-cache behavior that blocked five rows; sitting C
(2026-08-29) cleared them.

---

## Sitting C — clearing the blocked rows (newest)

Run in one sitting, 2026-08-29. Sitting C exists to clear the five rows sitting
B left BLOCKED and the four it left unrun. It was run in a NEW Chrome profile
`hw-clean` with hostnames never approved anywhere, which is exactly the
precondition sitting B's "Resume" section named. Every wire claim rests on the
echo server's own log read while browsing in Chrome, never on `curl`.

## Row status — sitting C

| Row | Status | Sitting |
| --- | --- | --- |
| Part 11 step 6 — last bullet (re-grant, wire check) | **PASS** | C |
| Part 11 step 6b — notice self-expires | **PASS** | C |
| Part 11 step 6c — fresh-install false positive | **PASS** | C |
| Part 11 step 6d — shared-domain render | **PASS** | C |
| Part 11 step 9 — "On all sites" survives reload | **N/A by design** | C |
| Part 11 step 10 — IP literal | **PASS** | C |
| Part 12 step 2 — edit releases | **PASS** | C |
| Part 12 step 3 — import releases | **PASS** | C |
| Part 12 step 5 — re-grant works after | **PASS** | C |
| Part 12 steps 6–7 — sweep provenance | **recorded** | C |

With these, every row in the v0.1.4 table above is now pass, documented, N/A,
or recorded. The DO-NOT-SHIP condition is lifted.

## Environment — sitting C (re-verified, not carried forward)

| Field | Value |
| --- | --- |
| Build under test | v0.1.4 (`~/hw/fresh`), upgraded in place from v0.1.3 (`~/hw/upgrade`) |
| v0.1.3 source | GitHub `v0.1.3` release ZIP, restored into `~/hw/upgrade` before load |
| `~/hw/upgrade` manifest | no `"key"` field — unpacked id is path-derived; the step-8 overwrite reused the same path |
| Chrome | 151.0.7922.174 (Official Build) (arm64) — newer than sittings A/B (`.138`); Chrome auto-updated in the two-week gap |
| OS | macOS 26.5.2 (Build 25F84) — same as sittings A/B |
| Extension id — `~/hw/upgrade` (hw-clean) | `ngdghcfocifikljohnikblmaepohecjo` (unpacked; path-derived; differs from A/B, new profile+path) |
| Launch flags | empty `--flag-switches-begin`/`--flag-switches-end` pair (no `chrome://flags` overrides), `--origin-trial-disabled-features=CanvasTextNg|WebAssemblyCustomDescriptors` — identical to sittings A/B |
| Profile | NEW dedicated `hw-clean` (Chrome "Profile 9"), created this sitting, NOT signed in |
| Fixture hosts | all fresh, none reused from A/B: `up1.test`, `sub.up1.test`, `up2.test`, `ed1.test`, `ed1b.test`, `im1.test`, `fresh1.test`, `shared1.test`, `prov1.test`, `probe1.test`, `127.0.0.1` -> `127.0.0.1` |
| Echo server | `:8080`, reflects request headers as JSON. Ports 5000/7000 avoided — held by macOS Control Center (AirPlay) |
| Date | 2026-08-29 |

The new profile is the whole point: in a primed profile a silent re-grant reads
identically to a legitimate dialog-less pass, which is why sitting B could not
produce these rows. `hw-clean` was proven clean before use (see Probe).

## Probe — the fixture is valid, and a denial does not prime

Before any row, `probe1.test` was granted in `hw-clean`: **the dialog appeared**,
confirming the profile carries no approval history. The probe grant/profile was
then removed.

A denial sub-check was run in the same breath: after denying `probe1.test`,
clicking the chip re-fired the dialog rather than granting silently. **Chrome's
approval cache records accepted grants only, not decisions.** This sharpens
sitting B's central finding: the cache is populated by acceptance, so a denied
origin stays clean. It is also why step 6c (below) is trustworthy on a denied
host.

---

## Part 11 step 6 — migration re-grant, on the wire — PASS

The row sitting B could not reach. v0.1.3 loaded from `~/hw/upgrade`, `up1.test`
and `up2.test` each granted under it (both dialogs fired; 2/2 granted). Baseline
captured on the OLD build:

```
up1.test:8080/       -> xheader: True      (apex applies on v0.1.3)
sub.up1.test:8080/   -> (no xheader)        (finding-18 subdomain failure, on the v0.1.3 RELEASE ZIP loaded unpacked — NOT the store CRX; see the correction below)
```

### CORRECTION 2026-09-01 — this row was not run on the store build

As originally written this block said the subdomain failure was observed
"live on the store build." It was not. The environment table three sections
up records the v0.1.3 source as the GitHub `v0.1.3` release ZIP restored into
`~/hw/upgrade` and loaded unpacked, with a path-derived id — which is why the
step-8 overwrite had to reuse the same folder path. The store CRX was never
installed in `hw-clean`.

The error was authored at observation time, not introduced in transcription:
the sitting-C session notes carry the same phrase in OBS-C3's heading, three
lines below the environment block that contradicts it. The build was named by
what it REPRESENTED rather than by where it came from. Both records are
corrected; the session notes need the same edit.

What this does and does not change. The FINDING-018 reproduction itself stands
— the release ZIP is the v0.1.3 source and the subdomain failure is a property
of that code, not of the packaging. What is NOT established is that the store
CRX behaves identically on the upgrade path, because a store install has a
stable extension id and an unpacked one has a path-derived id, and the
approval cache is keyed per origin per extension. The genuine-upgrade and
host-approval rows therefore remain OWED against a real store install:
install 0.1.3 from the Chrome Web Store into `hw-clean`, upgrade to 0.1.4, and
re-run only those two rows. Nothing else in sitting C depends on it.

`~/hw/upgrade` then overwritten in place with v0.1.4 (same path, id preserved);
extension reloaded. Post-upgrade popup: both dots GRAY, `0/2 domains granted`,
migration notice present and PLURAL (2 domains). Reload preserved the install —
grants recognised, not wiped — confirming the path-derived id held across the
overwrite.

**P-CACHE — registered prediction was WRONG.** Before clicking, the prediction
on record was that the chip click would grant SILENTLY (per-host cache),
because the earlier follow-up had seen a wildcard granted silently for an
apex-approved host. Observed instead: clicking the gray `up1.test` chip
produced a **dialog**. Accepting it turned the dot green.

```
up1.test:8080/       -> xheader: True
sub.up1.test:8080/   -> xheader: True       (THE FIX, on the wire)
```

**Conclusion.** On the genuine legacy-upgrade path, Chrome's approval cache is
per-PATTERN, not per-host: the v0.1.4 request carries the never-approved
`*://*.up1.test/*` wildcard, so Chrome prompts. The migration notice is
therefore truthful — it tells the user to re-approve and a re-approval dialog
genuinely appears. The earlier silent-widening observation (sitting B) came
from a contaminated profile where the wildcard forms had likely been approved
before; it does not generalise to a clean upgrade. This is the pass/fail the
release turns on, and it passes.

## Part 11 step 6b — notice self-expires on the last re-grant — PASS

After `up1.test` went green the notice tracked the count down: text became
SINGULAR ("1 domain ... its headers"). Re-granting the LAST gray domain
(`up2.test`, dialog fired, 2/2) made the migration notice **vanish in the same
render**. It stayed gone across popup close+reopen AND a full extension reload.
Migration state is cleared and persisted, not merely hidden.

## Part 11 step 6c — fresh-install false positive — PASS

A profile for `fresh1.test` was added in a fresh v0.1.4 install (`~/hw/fresh`,
never ran v0.1.3) and the permission dialog was DENIED. Resulting chip: gray
dot, **no** migration notice, **no** dashed underline (plain text). This is the
distinguishing test finding-18/O-2 shape motivated: a never-granted domain is
visually distinct from a legacy-needs-reapproval domain (gray + dashed
underline + notice). The never-granted state does not false-positive as
migrating.

## Part 11 step 6d — shared-domain render — PASS

Two profiles ("Test", "Test2") both scoped to `shared1.test`, granted once.
Both chips render green, both cards clean, and the status line reads
`1/1 domain granted` — the unique domain counted once, not once per profile.
Grant accounting dedupes by domain across profiles. (A transient first-render
flicker was suspected but could not be reproduced on demand; recorded as
unconfirmed, not a defect.)

## OBS-C10 — overlapping profiles resolve to ONE winner — banked, not a v0.1.4 row

**Not a v0.1.4 row.** Recorded in sitting C because the fixture was already
standing, and transcribed here on 2026-09-01 as the before-state v0.1.5's
FINDING-021 fix is measured against. It gated nothing in v0.1.4.

Two profiles on `shared1.test` — the same "Test"/"Test2" pair as step 6d —
both setting header `xheader`, Test to `A` and Test2 to `B`, master toggle ON.

```
shared1.test:8080/   -> xheader: A        (one value only)
```

One winner. No concatenation, no duplicate header, no error, nothing in the
popup indicating that a second profile wanted a different value — both chips
green, both cards clean.

**WHAT THIS DOES NOT ESTABLISH, and the limit is structural rather than a gap
in the run.** Why `A` won is not determined by this observation. It is equally
consistent with profile-slot order, creation order, DNR rule-id tie-break (all
rules carry `priority: 1`), and storage order. In this configuration all four
predict `A`: the profiles were created in the order Test, Test2, so
`nextRuleId()` gave them ids 1 and 2, `saveProfile()` appended them in that
order, and the id order and the insertion order coincide. The observation has
no discriminating power BY CONSTRUCTION, and separating the four would need a
matrix varying one factor at a time.

**Why it was nevertheless sufficient.** It is enough to justify refusal, which
only needs "one silent winner" to be true, and not enough to justify a
precedence rule, which would need the mechanism. That asymmetry is part of why
v0.1.5 took refusal — see FINDING-021.

**A note on how this was nearly lost.** OBS-C10 was the one observation in the
sitting-C notes that never reached version control, because it was not a
v0.1.4 row. In the interval, the v0.1.5 planning notes described it as
"already banked" and as the anchor for v0.1.5 "the same way
the 0.1.3 subdomain failure anchored 0.1.4" — a comparison the observation does
not support, since the subdomain failure WAS discriminating and this is one
cell. A record referenced confidently from a planning file and absent from the
repo is the shape worth watching for.

## Part 11 step 10 — IP literal — PASS

Profile scoped to `127.0.0.1`, granted (dialog appeared), header confirmed at
`127.0.0.1:8080/`. Exercises the `originsForDomain()` IP branch: an IP literal
emits only the exact pattern, no `*://*.<host>/*` wildcard. The absent wildcard
does not break the grant or the wire match.

## Part 11 step 9 — "On all sites" survives reload — N/A by design

Chrome's Details -> Site access offers HeaderWright no on-click/specific/all-
sites radio. Because `*://*/*` is declared only as an OPTIONAL host permission
and hosts are requested individually, Chrome renders the per-domain
"Automatically allow access on the following sites" list instead. The row as
written targets a control this permission model deliberately does not expose;
the minimal-permission design is the reason it is absent. Recorded N/A with
cause rather than skipped.

## Part 12 steps 6–7 — sweep provenance — recorded

The open question from `grants.js` (what pattern shape Chrome actually stores
for a user-visible grant) is now answered by observation. Chrome's Site access
list showed the granted patterns verbatim:

```
*://*.up1.test/*   *://*.shared1.test/*   *://*.ed1b.test/*   ...   *://127.0.0.1/*
```

The wildcard-subdomain form, scheme-agnostic (`*://`), exactly what
`originsForDomain()` emits — NOT scheme-specific (`https://...`). These patterns
MATCH `isManagedOrigin()`, so they are inside the sweep and reconciliation acts
on them; and they are not the all-hosts `*://*/*`, so the "On all sites"
carve-out is untouched. For user-visible grants of this shape the "shape
confined" guarantee holds.

## Part 12 step 2 — edit releases — PASS

Run from a virgin host to keep dialogs interpretable. `ed1b.test` granted
(dialog, header confirmed at `ed1b.test:8080/`), then the profile EDITED to
point away. After the edit:

```
ed1b.test:8080/   -> (no xheader)     (released, verified twice)
```

Chrome's Site-access list retains a `*://*.ed1b.test/*` ROW in an inactive
state rather than deleting it — a Chrome UI artifact, not a live stale grant.
The wire is authoritative: released. Cross-check that inactive-looking rows in
that list were merely dim, not revoked: `shared1.test:8080/` still returned
`xheader: A` throughout, confirming still-granted domains stayed active.

## Part 12 step 3 — import releases — PASS

`im1.test` granted and applying. An exported config with `im1.test` OMITTED was
imported. Import showed a confirm dialog ("Replace your 5 profiles with 4
profiles from ...?" — counts both sides before replacing). After Replace:
`im1.test` gone from the popup, status dropped `4/4 -> 3/3 domains granted`
(orphan reconciled away), and on the wire `im1.test:8080/` showed no xheader.
Import-path reconciliation matches the edit path.

## Part 12 step 5 — re-grant works after release — PASS, silent

The original 5-profile export was re-imported (re-adds `im1.test`). Replace
confirm dialog appeared; **no permission prompt** for `im1.test`. Wire:
`im1.test:8080/` shows `xheader: True` again. The reconciled-away grant is
re-established SILENTLY, because `im1.test` is a primed origin (approved earlier
this sitting; the approval cache persists across the step-3 revoke). Round trip
proven: grant -> release via import (step 3) -> re-grant via import (step 5).

---

## Silent re-grant confirmed on a SECOND path (delete/re-add)

Independently of step 5, a delete-then-re-add of `ed1.test` (approved earlier
this sitting) re-granted with **no dialog**. Two independent routes — import
(step 5) and delete/re-add — reach the same silent re-grant, which confirms the
cause is Chrome's per-origin approval cache and not a path-specific quirk. The
user-facing consequence: a user cannot fully "revoke" a same-session-approved
origin by removing or re-importing it; access returns without a prompt. Raised
in FINDINGS.md (finding 24 neighbourhood).

## Stray registered pattern — `ed2.test`

`*://*.ed2.test/*` appeared in the Site-access list although `ed2.test` is not
in `/etc/hosts` and no exported profile references it (the round-trip export in
step 3 confirms no `ed2` profile exists). Almost certainly registered during
delete/re-add experimentation. Harmless — the host does not resolve — but a
registered pattern with no referencing profile is residue worth a cleanup pass;
possibly F024-adjacent (mutation churn leaving patterns behind). Recorded, not
yet a finding.

## O-1 / approval-cache, restated for the clean profile

Sitting B concluded Chrome caches approval per origin and that a `request()`
for a previously-approved origin is silent. Sitting C both confirms this (steps
5, delete/re-add) AND bounds it: on a CLEAN origin the request prompts (probe,
step 6c, step 6, step 10 all fired dialogs), and the cache is populated by
ACCEPTANCE only (denials do not prime). The refined statement: release works;
re-acquisition of a previously-accepted origin is silent; a never-accepted
origin always prompts.


## Row status

| Row | Status | Sitting |
| --- | --- | --- |
| Part 11 steps 1–5 | PASS / recorded | A |
| Part 11 step 6 — non-consuming bullets | PASS | B |
| Part 11 step 6 — last bullet (re-grant, wire check) | **BLOCKED** | — |
| Part 11 step 6b — notice self-expires | **BLOCKED** | — |
| Part 11 step 6c — fresh-install false positive | not run | — |
| Part 11 step 6d — shared-domain render | not run | — |
| Part 11 step 7 — legacy grants retained | PASS | B |
| Part 11 step 8 — orphaned grant swept | PASS | B |
| Part 11 step 9 — "On all sites" survives reload | not run | — |
| Part 11 step 10 — IP literal | not run | — |
| Part 12 step 1 — delete releases legacy grant | PASS | B |
| Part 12 step 2 — edit releases | **BLOCKED** | — |
| Part 12 step 3 — import releases | **BLOCKED** | — |
| Part 12 step 4 — shared domain retained | PASS (contaminated) | B |
| Part 12 step 5 — re-grant works after | **BLOCKED** | — |
| Part 12 steps 6–7 — sweep provenance | not run | — |

Nothing in sitting B was observed on the wire. Sitting B evidence is
permission-state and UI observation only; the wire check for the migration
path lives in step 6's last bullet, which is blocked.

## Environment

Re-verified at the start of sitting B rather than carried forward. No drift:
identical Chrome build, OS build, profile, and extension set. The v0.1.4
record is therefore a single environment, not two.

| Field | Value |
| --- | --- |
| Build | v0.1.4 |
| Extension id — `~/hw/fresh` | `ddgomchkggjoehcoeibmmnfaakjanmce` (unpacked; path-derived) |
| Extension id — `~/hw/upgrade` | `hgpjoejhkalmdljiiicimonmokljpgn` (unpacked; path-derived) |
| Chrome | 151.0.7922.138 (Official Build) (arm64) |
| OS | macOS 26.5.2 (Build 25F84) |
| Profile | dedicated `hw-test` profile, NOT signed in |
| Other extensions | Google Docs Offline 1.109.1 (Chrome default; no DNR rules, no header modification) |
| Launch flags | `--origin-trial-disabled-features=CanvasTextNg|WebAssemblyCustomDescriptors`, with an EMPTY `--flag-switches-begin`/`--flag-switches-end` pair — confirming no `chrome://flags` overrides are active at all |
| Date | 2026-08-15 |

The two extension ids differ because the id is path-derived. That is what
makes the upgrade test valid: `~/hw/upgrade` has its own storage and its own
grant store, independent of the `~/hw/fresh` copy used in sitting A.

Profile isolation held throughout. In sitting B it was confirmed a second way:
the v0.1.3 card carried Chrome's "Unpacked extension" marker, which a synced
Web Store install would not, and only one HeaderWright copy was ever enabled.

## Fixture

Local echo endpoint on `:8080`. `/etc/hosts` maps `hw.test`, `sub.hw.test`,
`a.b.hw.test`, `nothw.test` (sitting A) and `alt.test`, `sub.alt.test`,
`orphan.test`, `keep.test` (sitting B) to `127.0.0.1`. Server sends
`no-store`; a cached 200 could otherwise let a stale header survive a
configuration change and read as a pass. `.test` is IANA-reserved, so nothing
resolves off-machine.

All five hosts were confirmed reachable (`200` from each) before sitting B
began, since the endpoint had to survive the break between sittings.

Sitting A profile: name `hw-test`, domain `hw.test`, header
`X-HW-Smoke: v014` (set), master toggle ON.

Sitting B legacy fixture, created and granted under **v0.1.3** in
`~/hw/upgrade`, sized so no domain would need rebuilding mid-run:

| Profile | Domain | Purpose |
| --- | --- | --- |
| L1a, L1b, L1c | `hw.test` | shared-domain retention (12.4), render cost (6d) |
| L2 | `alt.test` | the delete/edit/import cycle (12.1–12.3) |
| L3 | `orphan.test` | orphaned in storage pre-upgrade, for the step 8 sweep |
| L4 | `keep.test` | retention control for step 7, held untouched |

L1a's header value is `V014`; the rest are `v014`. Deliberate, left as-is.
Header values are case-sensitive on the wire, so this is a fixture property,
not a discrepancy.

---

## Sitting A — Part 11 steps 1–5

| # | Step | Result | Evidence |
| --- | --- | --- | --- |
| — | Baseline, zero profiles | control | `22:14:47 hw.test:8080/ -> (no injected headers)` |
| 1 | Apex applies | **PASS** | `22:28:11 hw.test:8080/ -> x-hw-smoke: v014` |
| 2 | Subdomain applies — THE FIX | **PASS** | `22:29:25 sub.hw.test:8080/ -> x-hw-smoke: v014` |
| 3 | Deep subdomain applies | **PASS** | `22:30:11 a.b.hw.test:8080/ -> x-hw-smoke: v014` |
| 4 | Confusable suffix does NOT apply | **PASS** | `22:31:10 nothw.test:8080/ -> (no injected headers)` |
| 5 | Dialog wording | recorded | see below |

Step 2 is the finding-18 case. The same request under v0.1.3 returns no
header while the popup shows a green dot. The baseline at 22:14:47 and the
pass at 22:28:11 are the same URL in the same terminal session with one
variable changed, so the header is attributable to the profile and nothing
ambient.

Step 4 is the over-application control and matters as much as step 2.
`nothw.test` ends with the same letters as `hw.test` but is not a subdomain of
it. Chrome matched on label boundary, not string suffix, in both the
`main_frame` and `image` request types.

Header application was observed on `main_frame` and on `image`
(`/favicon.ico`), so `RESOURCE_TYPES` is applying across types rather than
navigations only.

**Step 5 — permission dialog, verbatim:**

> "HeaderWright — Modify HTTP Request Headers" has requested additional
> permissions.
>
> It could:
>
> Read and change your data on all hw.test sites and hw.test

Chrome names both patterns — "all hw.test sites" for `*://*.hw.test/*` and
"hw.test" for `*://hw.test/*`. This is the user-visible cost of finding 18:
under v0.1.3 the dialog named only the apex.

---

## Sitting B — the upgrade path

### Pre-upgrade ground truth (v0.1.3)

Granted set under v0.1.3, read from the extension's own service worker:

```
4 ["*://alt.test/*","*://hw.test/*","*://keep.test/*","*://orphan.test/*"]
```

**Four apex patterns, zero `*://*.` wildcards.** This is what makes the
migration real rather than a fresh install wearing a version number, and it is
the "before" half the sweep is measured against. The v0.1.3 dialogs matched:
each named only the bare domain ("Read and change your data on hw.test"), with
no "and its subdomains" — the direct contrast to sitting A's step 5.

L3 was then orphaned by dropping every reference to `orphan.test` from
storage, leaving `5 L1a,L1b,L1c,L2,L4` and the grant count still at 4. A held
grant that no profile references is invisible to `diffDomainGrants()`, because
it never appeared in a profile-set change — precisely the condition step 8
exists to sweep.

The upgrade was an in-place overwrite of `~/hw/upgrade`
(`cp -R ~/hw/fresh/ ~/hw/upgrade/`), preserving the path and therefore the
extension id, storage, and grants. Both cards read 0.1.4 afterwards.

### Step 8 — orphaned grant swept — PASS

Captured at install time with the service worker console already open and
Preserve log enabled. Verbatim:

```
HeaderWright: revoking 1 host grant(s) no profile references — *://orphan.test/*   sw.js:202
```

Count 1, singular agreement correct, and the pattern is the orphan and only
the orphan.

### Step 7 — legacy grants retained — PASS

```
3 ["*://alt.test/*","*://hw.test/*","*://keep.test/*"]
```

Both halves of one sweep: `orphan.test` taken because nothing references it,
the other three retained because they are inside v0.1.4's wanted set. Still
apex-only — nothing had been re-granted yet. Observing swept and retained in
the same pass is stronger than either alone. Had the retained three been
dropped, every upgrading user would have silently lost their grants.

### Step 6 — migration surface — PASS (non-consuming bullets)

| Check | Observed |
| --- | --- |
| Profiles survived | 5 (L1a, L1b, L1c, L2, L4) |
| Dots | all GRAY |
| Chips | dashed underline, clickable |
| Notice | present, above the list, counts **3** domains, plural agreement correct |
| Status line | `5 profiles · 0/3 domains granted · applying` |
| Tooltip | correct (see below) |

**Migration notice, verbatim:**

> HeaderWright now requests access to subdomains, so headers set for
> example.com also apply on api.example.com. 3 domains granted under an
> earlier version do not cover this yet, and their headers will not apply
> until re-approved. Click any gray domain below to re-approve it.

**Tooltip, read from the DOM** (`document.querySelector('.domain.migrating').title`):

> hw.test: this domain was granted under an older version that did not cover
> subdomains. Headers will not apply until you click to re-approve.

Distinct from the never-granted string, which is what step 6c is meant to
prove cannot false-positive.

The status line is the finding-18 row. Master toggle ON, `applying`, and yet
`0/3 granted` with three gray dots. Under v0.1.3 this same state showed green.
Three independent surfaces agree on the count — notice says 3, status says
0/3, `getAll()` returned 3 — and `orphan.test` appears in none of them.

### Part 12 step 1 — delete releases the legacy grant — PASS

`chrome.permissions.remove` was wrapped in BOTH the service worker and the
popup context before acting. The revoke runs in `popup.js`, so the service
worker wrapper alone would have caught nothing.

Deleting L2 while `alt.test` was legacy-gray:

```
REMOVE CALLED ["*://alt.test/*"]    VM152:3
REMOVE RESULT true                  VM152:4
```

**Exactly one pattern, apex shape** — `heldOrigins` returned what was actually
held. The failure this step exists to catch (calling `remove()` with
`*://*.alt.test/*`, which succeeds vacuously while the real legacy grant stays
behind) did not occur. `*://alt.test/*` was absent from `getAll()` afterwards.

**Verdict is PASS, not DOCUMENTED. O-1 does not reproduce as a retention
failure.** See "O-1 resolved" below.

### Part 12 step 4 — shared legacy domain retained — PASS (contaminated)

Deleting L1a left `*://hw.test/*` held, with L1b and L1c still referencing it.
Finding 1b's invariant holds under migration.

**Contamination:** by the time this ran, `hw.test` and `keep.test` had been
re-granted to the full v0.1.4 pattern set — once by an accepted dialog, once
silently. The narrow claim (a shared domain is not released when one of
several referencing profiles is deleted) is unaffected, but the row was not
observed against a clean legacy-only state.

---

## The central finding of sitting B: Chrome caches permission approval

Discovered while trying to restore legacy-gray state, and it is the reason
five rows are blocked.

**Observed sequence.** After the wildcards were removed and the apex
re-granted (`2 ["*://hw.test/*","*://keep.test/*"]`, legacy-only), deleting
profile L1a — with **no dialog shown and no user interaction** — produced:

```
4 ["*://*.hw.test/*","*://*.keep.test/*","*://hw.test/*","*://keep.test/*"]
```

The extension's host access silently widened from apex-only to
apex-plus-all-subdomains during a delete.

**Discriminating test.** A profile was created on `novel.test`, a host never
approved in this Chrome profile. The dialog **did** appear:

> Read and change your data on all novel.test sites and novel.test

Denied. `getAll()` afterwards showed no `novel.test` residue in any form, and
deleting the test profile prompted nothing — `remove()` does not prompt, and
nothing unapproved remained to request.

**Conclusion.** Chrome caches permission approval per origin, per browser
profile, and that cache survives `permissions.remove()`. A subsequent
`request()` for a previously-approved origin is granted silently, with no
prompt. A never-approved origin still prompts normally. This is Chrome
behavior, not a HeaderWright defect.

### O-1 resolved

O-1 recorded that a host grant appeared to SURVIVE profile deletion, and that
re-creating the profile produced no dialog. Both observations are explained,
and the first was wrong about the mechanism.

The grant **is** released on delete. Step 1 verified it directly: `remove()`
called with the correct single pattern, result `true`, origin gone from
`getAll()`. What survives is Chrome's record that the user once approved that
origin. Re-creating the profile fires `request()`, which is granted silently —
so the end state is indistinguishable from a grant that never went away.

**Part 0's revocation rows resolve as DOCUMENTED**, with the sharper
description: release works; re-acquisition is silent.

### O-2 resolved — and O-2 was wrong

O-2's full text was dropped when this file was restructured for v0.1.4; it is
restored here with its resolution. As originally recorded:

> **O-2. The `chrome://extensions` Details panel UNDER-REPORTS the granted
> set.** With both patterns held, Site access listed only `*://*.hw.test/*`.
> Ground truth from the extension's own service worker returned
> `["*://*.hw.test/*", "*://hw.test/*"]`, length 2. Chrome appears to collapse
> the display, showing the broader pattern because `*.hw.test` covers the
> apex. [...] **Verify granted sets with `permissions.getAll()` in the service
> worker console, not by reading the Details panel.**

**The panel was correct.** It was not collapsing a display or under-reporting.
`*://*.hw.test/*` genuinely IS the whole grant — the apex pattern adds no
coverage, so there is no second thing to show. O-2 guessed the right mechanism
("`*.hw.test` covers the apex") and then drew the wrong conclusion from it.

The operational advice survives anyway, for a different reason:
`permissions.getAll()` reports the literal held set while the panel reports
effective access, and this run needed the literal set to distinguish legacy
from current grants. Use `getAll()` because it answers a different question,
not because the panel lies.

---

## Follow-up: wildcard subsumption CONFIRMED

Run after sitting B to settle candidate finding 4. Predictions were registered
before testing: if `*://*.host/*` covers the apex, then `contains()` on the
apex returns true, no dialog fires when a profile is created on the apex, and
the header applies on the wire.

Method: `wild.test` and `sub.wild.test` added to `/etc/hosts` — hosts never
approved in this Chrome profile, so the approval cache could not contaminate
the result. Only the wildcard was granted, via a direct `request()` that
bypassed `originsForDomain()`.

| Check | Result |
| --- | --- |
| Dialog for a wildcard-only request | "Read and change your data on all wild.test sites" — one clause, no apex clause |
| Granted set | `['*://*.wild.test/*']` — one pattern |
| `contains()` apex / sub / wildcard | `true` / `true` / `true` |
| Profile created on `wild.test` | **no dialog** — `reconcileGrants()` found nothing to request |
| Wire, apex | `[02:23:12] wild.test:8080/ -> x-hw-smoke: wild` |
| Wire, subdomain | `[02:23:53] sub.wild.test:8080/ -> x-hw-smoke: wild` |

Both also applied on `favicon.ico`. The server log carries its own control:
the same URL returned no injected header at `02:16:57`, `02:19:16` and
`02:22:12`, before the profile existed.

**Conclusion.** `*://*.host/*` subsumes `*://host/*` at every layer —
`contains()`, `reconcileGrants()`, and the DNR matcher. The apex pattern
`originsForDomain()` requests is redundant. It is not harmful: coverage is
correct either way, so v0.1.4 is right, just wordier than it needs to be. The
visible cost is one extra clause in the permission dialog.

**Not established:** whether subsumption runs the other direction. Nothing here
tests an apex-only grant against a subdomain request, and finding 18 implies it
does not. Do not read this as "the two patterns are interchangeable."

**Method error worth recording.** The first two attempts at the wire check used
`curl`, which produced no header and briefly read as a falsification. `curl`
does not route through Chrome, so `declarativeNetRequest` rules cannot apply to
it. The echo server's own log, read while browsing in Chrome, is the oracle —
as it was in sitting A. Any wire claim in this file rests on that log, never on
`curl`.

---

## Findings raised (candidates — belong in FINDINGS.md, not here)

Four observations about the product rather than about this run. Two were seen
on v0.1.3 code paths and are therefore pre-existing, not v0.1.4 regressions.

1. **Popup header and footer scroll out of view.** With six profiles, the
   master toggle and the status line both leave the viewport. The toggle is
   the primary control and the status line is the honesty surface findings 3
   and 8 exist to protect. Seen on v0.1.3. Not covered by SCOPE.md; the
   closest entry is a v0.2 note that a second header list "needs a layout
   answer that does not turn the popup into a form."
2. **Native tooltip never renders on hover.** The `title` attribute is
   constructed correctly — confirmed via the DOM — but no tooltip appeared on
   hover in this environment, so the text is reachable only through DevTools.
   Same shape as finding 18 and O-2: a surface asserting something the user
   cannot actually get at.
3. **Any profile mutation re-requests every remaining legacy domain.**
   Deleting L2 prompted for `hw.test` and `keep.test`, domains unrelated to
   the deleted profile. This is `reconcileGrants()` working as designed — a
   legacy-only domain is wanted-but-not-fully-granted, so it lands in
   `toRequest` by construction, and the FINDING 20 comment shows the tracking
   is deliberate. The unexamined consequence is that it contradicts the
   notice's own framing ("Click any gray domain below to re-approve it"),
   which implies a per-domain deliberate act. Combined with the approval cache
   above, the prompt may not appear at all, and the broadening is then
   invisible.
4. **A wildcard pattern subsumes the apex pattern. CONFIRMED.**
   `*://*.host/*` covers `*://host/*` at every layer, verified on the wire —
   see "Follow-up" above. `originsForDomain()` therefore requests a redundant
   pattern, which costs an extra clause in the permission dialog for no
   coverage gain. Not a correctness bug; a simplification for v0.1.5. Also
   resolves O-2.

---

## Blocked

These five rows cannot produce clean evidence in the `hw-test` Chrome profile,
because every test host now carries a cached approval.

| Row | Requires | Why blocked |
| --- | --- | --- |
| 11 step 6, last bullet | a gray domain, a dialog on chip click, and a wire check | previously-approved domains re-grant silently; the dialog will not fire |
| 11 step 6b | notice self-expiring after the LAST re-grant | needs held gray state; any mutation can silently restore the full grant |
| 12 step 2 | a legacy-gray domain to edit | same |
| 12 step 3 | a legacy-gray domain to import over | same; `alt.test` is also gone entirely, L2 having been deleted at step 1 |
| 12 step 5 | re-grant working after a release | needs an observable grant prompt |

The synthetic re-gray used during this sitting (remove wildcards, re-request
apex) reproduces legacy-only state but does **not** hold it: the state was
observed reverting to a full grant on the next unrelated mutation. It is not a
substitute for the precondition.

---

## Resume

**The blocked rows need a Chrome profile that has never approved these
hosts.** That is a new environment, not a continuation — a fresh profile means
re-establishing the launch flags and the extension load, and the evidence for
those rows must carry its own environment block.

Two ways to get there, either acceptable if recorded:

- A new dedicated Chrome profile, or
- The same profile with hostnames never approved in it (e.g. `hw2.test`,
  `alt2.test`), which is cheaper but leaves the old approval cache in place
  and should be noted as such.

Setup carried over from sitting B, still valid:

- `~/hw/upgrade` currently holds v0.1.4. Rebuilding a legacy fixture means
  restoring v0.1.3 there FIRST, granting under it, then overwriting that same
  directory again. The path must not change or the extension id changes with
  it and both storage and grant are discarded.
- Step 6c needs an extension that never ran v0.1.3. Use a third directory
  (`~/hw/clean`); `~/hw/fresh` and `~/hw/upgrade` both carry history.
- Only ONE HeaderWright copy enabled at a time.
- Wrap `chrome.permissions.remove` in the POPUP context, not just the service
  worker, before any Part 12 step. Re-arm after any popup close — the context
  is destroyed with it, and a wrapper that died silently reads identically to
  a genuine failure.
- Deny the re-request prompt (finding 3) unless the step calls for granting.

Environment must be re-verified rather than assumed, particularly the Chrome
version.

## Corrections applied to SMOKE.md

Both committed after this run, before this record was finalised.

- **Part 12 step 2's re-gray method was wrong as written.** Removing only the
  wildcard yields `0 []`, not legacy-only state, because the wildcard subsumes
  the apex (now confirmed — see "Follow-up"). Corrected to remove-then-request.
- **Part 12 gained a stated PRECONDITION**: it requires a Chrome profile with
  no approval history for the test hosts. Without it the gray state cannot be
  held and re-grant dialogs will not fire, which is what blocked five rows in
  this run. Cross-referenced from Part 11, which hits the same constraint at
  step 6.
