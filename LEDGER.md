# HeaderWright ledger — authoritative current state

**Seeded:** 2026-09-22 UTC
**Last amended:** 2026-09-24 UTC (AR-05 and AR-07a fixed on main, FINDING-046 and FINDING-047; browser evidence outstanding for both)
**Release state:** v0.2.0 published to the Chrome Web Store; clean-profile store-CRX verification outstanding

This file is the only present-tense answer to "what is open" in HeaderWright. `FINDINGS.md` stays the immutable narrative history — symptom, cause, evidence, decision, regression lesson — and is not a status index. Roadmap projections, release-gate counts and the current-work block in the planning handoff are generated from the rows here, not written by hand. When a row's status changes, this file changes in the same commit as the code.

Rows were seeded from the architecture review of 2026-09-22 and both rounds of its disposition, from the HW-V6/V7 review disposition of 2026-09-13, and from the `Open` section of `FINDINGS.md`.

## Schema

One row per line, pipe-delimited, no wrapping. Long lines are intentional: this file is parsed by `test/verify.mjs` before it is read by a person.

```text
id | title | status | pri | target | prior | evidence | decision
```

- **status** — exactly one of `open`, `in-progress`, `blocked`, `fixed-unverified`, `verified`, `shipped`, `accepted-risk`, `withdrawn`, `superseded`. No other value is valid. `fixed-unverified` means the code changed but no browser evidence exists yet; `verified` means evidence is recorded; `shipped` means it is in a published release with that evidence.
- **pri** — `high`, `medium`, `low`.
- **target** — a v0.2.1 slice (`v0.2.1/s1` … `v0.2.1/s5`), a later version, `main` (lands on `main`, ships nothing), a named hardening slice, `later`, `ongoing`, or `trigger:<condition>` for work gated on a future state rather than a date.
- **prior** — earlier identifiers for the same defect, so nothing is tracked twice. `FINDING-0xx` resolves in `FINDINGS.md`; `HW-V6-*`, `HW-V7-*`, `R12`, `R14`, `R15` are review identifiers from the private planning ledger and are traceability tokens only.
- **evidence** — `reproduced` (executed or read directly against `a269d8d` or the live listing), `source` (reachable code path), `chrome-docs`, `chromium-source`, `browser-needed`, `pending` (claimed but not yet independently confirmed), `design`.
- **decision** — `—`, a recorded ruling, or `DECIDE:` naming a ruling that must precede the work.

No `owner` column: single maintainer, so a constant-valued column is noise in a file meant to be scanned.

## v0.2.1 is five vertical slices, not one bundle

AR-18 is the method, not a preceding phase. Every row below arrives through a failing behaviour test at the nearest useful boundary, and the popup gets thinner per slice. A large testability extraction ahead of the one-line queue fix is explicitly not the plan.

```text
s1  queue and action outcomes
s2  canonical identity and stale writes
s3  drafts
s4  permission and platform result contract
s5  compatibility and truth language
```

## Rows

```text
AR-18  | Test oracles are incomplete: no adversarial properties, no use-case tests, no fault injection, no browser-contract evidence | open | high | ongoing | R14, R15, HW-V6-20 | source | method for every slice
AR-05  | Serial queue reports task failure as caller success; the suite's own await depends on the defect | fixed-unverified | high | v0.2.1/s1 | HW-V6-12, HW-V6-14, FINDING-046 | reproduced | runThenAlways guards reconcileGrants at delete, save and import
AR-07a | No action control is ever disabled during an async mutation; two clicks give two overlapping read-modify-write transactions in one popup | fixed-unverified | high | v0.2.1/s1 | FINDING-047 | reproduced | RULED 2026-09-24: refuse, not queue; one gate for all seven mutating controls
AR-01  | configRevision serialization is ambiguous; delimiters legal inside field values are unescaped | open | high | v0.2.1/s2 | — | reproduced | canonical FNV, stays a status hint
AR-01b | Stale-edit and draft binding need a per-profile SHA-256 digest, not the configuration revision | open | high | v0.2.1/s2 | — | design | sha256:profile-v1 prefix
AR-02  | Draft identity reuses DNR rule ids; no purge on delete, no rebase on import, no write ordering, no enum validation | open | high | v0.2.1/s3 | FINDING-042 | reproduced | —
AR-04  | permissions.request() runs after unbounded storage, render, collision and permission work inside one user gesture | open | high | v0.2.1/s4 | HW-V6-10 | source, chrome-docs | DECIDED 2026-09-22: explicit Grant control
AR-13a | permissions.remove() boolean result discarded at both call sites (popup.js:297, sw.js:431); no error surface | open | medium | v0.2.1/s4 | HW-V6-14 | reproduced | —
AR-11  | Manifest floor 101 but storage.session requires 102; the test pins the obsolete number instead of deriving it | open | high | v0.2.1/s5 | — | reproduced | —
DR-03  | Published listing states "Requires Chrome 101 or later"; storage.session needs 102, so the live claim is wrong today | open | high | v0.2.1/s5 | AR-11 | reproduced | copy fix ships without a package
DR-01  | Listing heading says "What you see is what's applied" and the badge "always shows whether headers are currently being applied" | open | high | v0.2.1/s5 | — | reproduced | body text is accurate; headings are not
DR-01b | Listing sells export as "share a setup" while export can produce a file the same build refuses to import | open | medium | v0.2.1/s5 | AR-16 | reproduced | interim: "keep a setup in git"
DR-02  | At a Chrome 102 floor, storage.session is 1 MB and storage.local 5 MB, not 10 MB; drafts write into the smaller area | open | medium | v0.2.1/s5 | — | chrome-docs | DECIDE: fixed product budgets independent of quota
AR-17  | Privacy wording imprecise; SW/CacheStorage limitation and stale README status language undocumented | open | medium | v0.2.1/s5 | HW-V6-15, HW-V6-17, HW-V6-20 | chrome-docs | —
HW-DESC| GitHub repository description field still says request headers only and predates v0.2.0 | open | medium | v0.2.1/s5 | FINDING-044 class | reproduced | —
F-045  | Smoke fixture and procedure disagree; one response remove row was never observed | open | medium | v0.2.1/s5 | FINDING-045 | source | —
AR-03  | Collision analysis materializes every pair; 1,000 profiles yields 499,500 records and 61.6 MiB | open | high | slice:scale | HW-V6-03, HW-V7-03 | reproduced | —
AR-08  | Grant resolution duplicated: sequential per profile in the worker, unbounded-parallel per domain in the popup | open | medium | slice:scale | R12, HW-V6-10 | source | —
AR-09  | renderListNow composes a view from seven sequential reads; cards and footer can disagree | open | medium | slice:scale | — | source | —
AR-10  | buildRules knows why each profile was skipped and returns only ids; pull forward if reconcileConfig is extracted earlier | open | medium | slice:scale | prior review | source | —
AR-15  | 5,000-profile cap is the only input budget; file, field, domain, header, value and render budgets are absent | open | medium | slice:scale | HW-V6-10 | source | pre-request budgets narrowed by AR-04 decision
AR-06  | Domain validator accepts com, co.uk, 256.1.1.1 and 64+ char labels; isIpLiteral ignores octet ranges | open | high | slice:scope | HW-V6-11 | reproduced | DECIDE: full dated PSL, warn-only
AR-06b | Chromium classifies *://*.com/* and *://*.co.uk/* as effectively all-host; whether the optional-permission path grants or rejects them is unproven | open | high | slice:scope | — | chromium-source, browser-needed | —
AR-12a | websocket: ws/wss not expressible in a * match pattern; host-grant mapping unobserved | open | medium | slice:scope | HW-V6-08, HW-V7-08 | chrome-docs, browser-needed | DECIDE: pin or remove
AR-12b | webtransport: HTTPS-only constructor makes the target expressible; DNR effect on the CONNECT handshake unproven | open | medium | slice:scope | — | chrome-docs, browser-needed | DECIDE: pin or remove
AR-12c | webbundle: outer fetch is an ordinary URL fetch; in-bundle subresource behaviour under DNR unproven | open | medium | slice:scope | — | chromium-source, browser-needed | DECIDE: pin or remove
AR-13b | Grant cleanup cannot prove ownership; isManagedOrigin is a shape test removing grants it may not have requested | open | medium | slice:scope | HW-V6-19 | source | —
AR-14  | Registered-rule readback prints full secret values on every card | open | medium | slice:scope | — | design | —
AR-16  | Export writes colliding configurations that the same build refuses to import; now also a published claim | open | medium | slice:scope | FINDING-027, HW-V6-13, DR-01b | reproduced | DECIDE: rescue vs portable
AR-19  | Toggle takes its accessible name from its state span; header row controls and the Headers group are unlabelled | open | medium | slice:scope | FINDING-031 | source, browser-needed | —
AR-21  | rules.js imports sideOf from collisions.js; compilation depends on analysis for a model default | open | low | slice:scope | HW-V7-01 | source | move when adjacent files are touched
F-029  | Header name echoed in canonical form, not as typed | open | medium | slice:scope | FINDING-029 | reproduced | DECIDE: product behaviour
F-030  | Transient messages and the add bar render inside the scrolling region | open | medium | slice:scope | FINDING-030 | source | fix as a class
UI-01  | Readback becomes a side/op/name/value layout | open | low | slice:scope | NEXT v0.2.1 list | design | compact grid, not a 4-col table
UI-02  | Focus the new header name field after "+ Add header" | open | low | slice:scope | NEXT v0.2.1 list | design | —
UI-03  | Widen the editor's header-name field | open | low | slice:scope | NEXT v0.2.1 list, FINDING-043 | design | —
R15    | Popup-surface item: rule on it or park it | blocked | low | slice:scope | R15 | design | DECIDE: rule or park
AR-22  | CI actions pinned to mutable tags; no tag-triggered packaging gate; ubuntu-latest is not reproducible | open | low | slice:release | — | source | —
GATE-0 | Store CRX in a clean profile: store id and version, save/grant/apply, one readback line, one request and one response wire case, initiator negative control | open | high | v0.2.0 | release gate | browser-needed | —
FEAT-1 | Target/initiator model with durable profileUid in schema v3 | open | high | v0.3.0 | decision 2026-09-13 | design | —
FEAT-2 | Response-side append | open | medium | later | SCOPE.md, ROADMAP.md | chrome-docs | DECIDE: version policy
F-025  | originsForDomain requests exact and wildcard patterns redundantly | accepted-risk | low | later | FINDING-025 | source | retained for migration
AR-07b | No mutation coordinator for concurrent writers | open | low | trigger:second-writing-surface | — | design | —
AR-20  | Planning artifacts preserve history but expose no current, enforceable state | in-progress | medium | ongoing | recurrence | source | this file
```

### AR-07b trigger, recorded precisely

> Before adding any second supported profile-writing surface — including an options page, side panel, direct popup-page mode, or external command — move mutations behind one serialized coordinator with revision and conflict semantics.

## Interim mutation contract

Until that coordinator exists, this is the supported contract, and slices 1 and 2 exist to make it true and tested:

```text
one popup UI mutation at a time
latest storage snapshot re-read inside the mutation
target profile base digest must still match for edits
no silent success when the target vanished
storage write success precedes UI success
permission expansion is a separate explicit result
```

## Decision record — AR-04, 2026-09-22

**Explicit Grant control. Automatic prompting from Save is not retained.**

Contract:

```text
Save commits configuration and never prompts
a mutation that expands site access leaves the profile visibly ungranted
an explicit Grant control names the scope it will request
that control calls permissions.request() with no preceding async work
declining leaves the profile ungranted, which is an existing representable state
the worker's permission listener performs reconciliation
```

Rationale: explicit Grant is correct by construction, whereas reordered auto-prompt is correct only by measurement — and that measurement decays silently the next time the save path grows. It also removes AR-04's dependency on AR-09, which is what justified deferring it, and it turns the existing persist-first inversion from a workaround into a design.

Consequences recorded elsewhere in this file: AR-04 moves to `v0.2.1/s4`; AR-15's pre-request budget work narrows to the Grant handler's own scope resolution; the first profile for a new domain becomes two clicks, while edits, renames, toggles and domain removals stay one.

## Store listing — confirmed state

Read directly from the Developer Dashboard on 2026-09-22.

Accurate and needing no change: the package-derived Title and Summary, both permission justification strings, the single-purpose description, and the Data usage declarations (nothing checked, consistent with no collection).

Needing change, all of it dashboard-editable and shippable without a package: the Description field only — DR-01 (heading and badge sentence), DR-03 (Chrome 101), DR-01b (share-a-setup). Title and Summary are marked *from package* and cannot be changed without a release; fortunately neither needs to be.

## Target summary

| Target | Count |
| --- | ---: |
| `v0.2.0` | 1 |
| `v0.2.1/s1` | 2 |
| `v0.2.1/s2` | 2 |
| `v0.2.1/s3` | 1 |
| `v0.2.1/s4` | 2 |
| `v0.2.1/s5` | 8 |
| `slice:scale` | 5 |
| `slice:scope` | 16 |
| `slice:release` | 1 |
| `v0.3.0` | 1 |
| `later` | 2 |
| `trigger:*` | 1 |
| `ongoing` | 2 |
| **Total** | **44** |

AR-03 is high priority and not in v0.2.1. That is deliberate: its remedy is bounded per-consumer APIs, which is scale work, and v0.2.1 is correctness only under the stated version policy.

`slice:scope` carries sixteen rows. That is too many for one sitting and is stated honestly rather than pre-split on guesswork.

## Amendments

Recorded so the reasoning survives without the disposition documents.

- **AR-18 reframed.** "No behaviour tests" was false — `test/selftest.mjs` has executable queue and `configRevision` suites. The real defect is oracle completeness: `await q2(true)` in the queue suite is only safe because the queue is broken, and `configRevision` is tested for stability and change but never for injectivity. AR-18 is a method row, not a phase.
- **AR-07 re-rated.** The earlier downgrade rested on two popups being impossible. That is true and irrelevant: one popup re-enters its own mutations because `.disabled` appears once in 1,318 lines of `popup.js`, on the header value input. AR-07a is v0.2.1/s1, high.
- **AR-01 split by role.** Status freshness keeps canonical-encoded FNV, synchronous. Draft and stale-edit binding gets a per-profile SHA-256 — not because a crafted collision is a security threat in a local single-user tool, but because exact canonical text is the simplest correct binding and DR-02's 1 MB session quota at the Chrome 102 floor rules it out.
- **AR-04 decided.** See the decision record above.
- **AR-06 remedy changed.** Full dated PSL used only for warnings, not a compact list: the failing-closed objection does not apply to warn-only, and a compact list misses exactly the unfamiliar suffixes users need warned about. Chromium excludes private registries by default, so multi-tenant suffixes need separate copy.
- **AR-12 split into three.** WebTransport is HTTPS-only by constructor and so *is* expressible by the existing patterns; WebBundle's outer fetch is an ordinary URL fetch. Only WebSocket has the scheme-expressibility problem.
- **AR-11 raised to high.** It stopped being manifest hygiene when DR-03 confirmed the published listing states a floor the build does not actually support.
- **5,000 cap closed.** `modifyHeaders` counts as an unsafe dynamic rule, and the 30,000 allowance applies to safe rules on Chrome 121+. The constant stands; its comment needs a dated refresh.

## Decisions blocking rows

Seven remain. None needs code.

1. **PSL policy** (AR-06) — full dated snapshot used for warnings is the recommendation; confirm.
2. **WebSocket / WebTransport / WebBundle** (AR-12a/b/c) — pin an observed mapping per protocol, or remove that resource type.
3. **Export contract** (AR-16) — faithful rescue backup, guaranteed-importable portable config, or two named artifacts. Now also gates restoring the sharing claim to the store listing.
4. **Header-name casing** (F-029) — echo as typed, or canonical with the behaviour documented.
5. **R15 popup surface** — rule on it, or park it with a trigger condition.
6. **Version policy** (FEAT-2) — keep "minor adds one feature, patch is fixes only", or change it explicitly in `README.md` before response append lands.
7. **Storage budgets** (DR-02) — fixed product limits set independently of browser quota.

## Validator contract

This file and `FINDINGS.md` are in the same repository, so the check runs in CI rather than by habit. Add a `ledger` gate to `test/verify.mjs` that fails on any of:

1. a `status` value outside the vocabulary above;
2. a row with an empty `target`, `pri`, `status` or `evidence` cell;
3. a `target` naming a version below `manifest.version`;
4. a `DECIDE:` decision on a row whose `target` is in the next release;
5. a duplicate `id`;
6. a `FINDING-0xx` appearing in the `Open` section of `FINDINGS.md` with no corresponding `prior` reference in this file;
7. a row count in the target summary disagreeing with the rows block;
8. a row with status `verified` or `shipped` whose `evidence` is `design`, `source` or `pending`.

Checks 6 and 8 are the ones that matter. Six guards against history and current state drifting apart, which is AR-20's recurrence. Eight guards against a row being marked proven on the strength of a source scan, which is AR-18's. Check 7 is not theoretical: the hand-written summary in this file has been wrong twice.
