# Smoke evidence

Completed browser-level smoke results, newest first. The selftest suite proves
rule CONSTRUCTION; this file is the record of what was observed on the WIRE.

A run is only evidence if it names the build and the browser. "Tested on
Chrome" is a claim. The tables below are the format: environment, procedure
reference, per-step observation, and the raw timestamps the observation came
from.

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
v0.1.4 row. In the interval, `handoffs/headerwright/ROADMAP-v0.2plus.md`
described it as "already banked" and as the anchor for v0.1.5 "the same way
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
