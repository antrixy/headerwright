# HeaderWright ledger — authoritative current state

**Seeded:** 2026-09-22 UTC
**Release state at seeding:** v0.2.0 published to the Chrome Web Store; store-CRX clean-profile verification outstanding

This file is the only present-tense answer to "what is open" in HeaderWright. `FINDINGS.md` stays the immutable narrative history — symptom, cause, evidence, decision, regression lesson — and is not a status index. Roadmap projections, release-gate counts and the current-work block in the planning handoff are generated from the rows here, not written by hand. When a row's status changes, this file changes in the same commit as the code.

Rows were seeded from the architecture review of 2026-09-22 and its disposition, from the HW-V6/V7 review disposition of 2026-09-13, and from the `Open` section of `FINDINGS.md`.

## Schema

One row per line, pipe-delimited, no wrapping. Long lines are intentional: this file is parsed by `test/verify.mjs` before it is read by a person.

```text
id | title | status | pri | target | prior | evidence | decision
```

- **status** — exactly one of `open`, `in-progress`, `blocked`, `fixed-unreleased`, `shipped`, `withdrawn`, `documented-limit`. No other value is valid.
- **pri** — `high`, `medium`, `low`.
- **target** — `harness` (lands on `main`, ships nothing), a version, `later`, `ongoing`, or `trigger:<condition>` for work gated on a future state rather than a date.
- **prior** — earlier identifiers for the same defect, so nothing is tracked twice. `FINDING-0xx` resolves in `FINDINGS.md`; `HW-V6-*`, `HW-V7-*`, `R12`, `R14`, `R15` are review identifiers from the private planning ledger and are traceability tokens only. `—` means new in the 2026-09-22 review.
- **evidence** — `reproduced` (executed against `a269d8d`), `source` (reachable code path), `chrome-docs`, `browser-needed`, `design`.
- **decision** — `—`, or `DECIDE:` naming a ruling that must precede the work.

No `owner` column: single maintainer, so a constant-valued column is noise in a file meant to be scanned.

## Rows

```text
AR-18  | Application use cases have no behaviour tests; gates are source scans over popup.js (1,318L) and sw.js (466L) | open | high | harness | R14, R15, HW-V6-20 | source | —
AR-22  | CI actions pinned to mutable tags; no tag-triggered packaging gate | open | low | harness | — | source | —
AR-05  | Serial queue reports task failure as caller success | open | high | v0.2.1 | HW-V6-12, HW-V6-14 | reproduced | —
AR-01  | configRevision serialization is ambiguous; delimiters legal inside field values are unescaped | open | high | v0.2.1 | — | reproduced | —
AR-02  | Draft identity reuses DNR rule ids; no purge on delete, no rebase on import, no write ordering | open | high | v0.2.1 | FINDING-042 | reproduced | —
AR-11  | Manifest floor 101 but storage.session requires 102; the test pins the obsolete number instead of deriving it | open | medium | v0.2.1 | — | reproduced | —
AR-13a | permissions.remove() boolean result discarded at both call sites (popup.js:297, sw.js:431) | open | medium | v0.2.1 | HW-V6-14 | reproduced | —
AR-17  | Privacy wording imprecise; SW/CacheStorage limitation and stale README status language undocumented | open | medium | v0.2.1 | HW-V6-15, HW-V6-17, HW-V6-20 | chrome-docs | —
F-045  | Smoke fixture and procedure disagree; one response remove row was never observed | open | medium | v0.2.1 | FINDING-045 | source | —
AR-04  | permissions.request() runs after unbounded storage, render, collision and permission work inside one user gesture | open | high | v0.2.2 | HW-V6-10 | source, chrome-docs | —
AR-03  | Collision analysis materializes every pair; 1,000 profiles yields 499,500 records and 61.6 MiB | open | high | v0.2.2 | HW-V6-03, HW-V7-03 | reproduced | —
AR-06  | Domain validator accepts com, co.uk, 256.1.1.1 and 64+ char labels; isIpLiteral ignores octet ranges | open | high | v0.2.2 | HW-V6-11 | reproduced | DECIDE: PSL policy
AR-07a | Stale editor can overwrite or silently no-op a profile that changed or vanished since the editor opened | open | medium | v0.2.2 | — | source | —
AR-08  | Grant resolution duplicated: sequential per profile in the worker, unbounded-parallel per domain in the popup | open | medium | v0.2.2 | R12, HW-V6-10 | source | —
AR-09  | renderListNow composes a view from seven sequential reads; cards and footer can disagree | open | medium | v0.2.2 | — | source | —
AR-10  | buildRules knows why each profile was skipped and returns only ids; the actionable cause is discarded | open | medium | v0.2.2 | prior review | source | —
AR-12  | websocket, webtransport and webbundle claimed in RESOURCE_TYPES with no expressible host-permission scope | open | medium | v0.2.2 | HW-V6-08, HW-V7-08 | chrome-docs, browser-needed | DECIDE: pin or remove
AR-14  | Registered-rule readback prints full secret values on every card | open | medium | v0.2.2 | — | design | —
AR-15  | 5,000-profile cap is the only input budget; file, field, domain, header, value and render budgets are absent | open | medium | v0.2.2 | HW-V6-10 | source | —
AR-16  | Export writes colliding configurations that the same build refuses to import | open | medium | v0.2.2 | FINDING-027, HW-V6-13 | reproduced | DECIDE: rescue vs portable
AR-19  | Toggle takes its accessible name from its state span; header row controls and the Headers group are unlabelled | open | medium | v0.2.2 | FINDING-031 | source, browser-needed | —
AR-21  | rules.js imports sideOf from collisions.js; compilation depends on analysis for a model default | open | low | v0.2.2 | HW-V7-01 | source | —
F-029  | Header name echoed in canonical form, not as typed | open | medium | v0.2.2 | FINDING-029 | reproduced | DECIDE: product behaviour
F-030  | Transient messages and the add bar render inside the scrolling region | open | medium | v0.2.2 | FINDING-030 | source | —
UI-01  | Readback becomes a side/op/name/value layout | open | low | v0.2.2 | NEXT v0.2.1 list | design | —
UI-02  | Focus the new header name field after "+ Add header" | open | low | v0.2.2 | NEXT v0.2.1 list | design | —
UI-03  | Widen the editor's header-name field | open | low | v0.2.2 | NEXT v0.2.1 list, FINDING-043 | design | —
R15    | Popup-surface item: rule on it or park it | blocked | low | v0.2.2 | R15 | design | DECIDE: rule or park
GATE-0 | Store CRX in a clean profile: title/version/store id, save/grant/apply, one readback line, one request and one response wire case | open | high | v0.2.0 | release gate | browser-needed | —
FEAT-1 | Target/initiator model | open | high | v0.3.0 | decision 2026-09-13 | design | —
AR-13b | Grant cleanup cannot prove ownership; isManagedOrigin is a shape test removing grants it may not have requested | open | medium | later | HW-V6-19 | source | —
F-025  | originsForDomain requests exact and wildcard patterns redundantly | documented-limit | low | later | FINDING-025 | source | retained for migration
FEAT-2 | Response-side append | open | medium | later | SCOPE.md, ROADMAP.md | chrome-docs | DECIDE: version policy
AR-07b | No mutation coordinator for concurrent writers | open | low | trigger:second-writing-surface | — | design | —
AR-20  | Planning artifacts preserve history but expose no current, enforceable state | open | medium | ongoing | recurrence | source | this file
```

## Target summary

| Target | Count | Contains |
| --- | ---: | --- |
| `v0.2.0` (open gate) | 1 | GATE-0 |
| `harness` (main only, ships nothing) | 2 | AR-18, AR-22 |
| `v0.2.1` (correctness only) | 7 | AR-05, AR-01, AR-02, AR-11, AR-13a, AR-17, F-045 |
| `v0.2.2` (scale and boundaries) | 19 | AR-03, AR-04, AR-06, AR-07a, AR-08, AR-09, AR-10, AR-12, AR-14, AR-15, AR-16, AR-19, AR-21, F-029, F-030, UI-01, UI-02, UI-03, R15 |
| `v0.3.0` | 1 | FEAT-1 |
| `later` | 3 | AR-13b, F-025, FEAT-2 |
| `trigger` | 1 | AR-07b |
| `ongoing` | 1 | AR-20 |

Two rows are high priority but deliberately not in the next release. **AR-04** and **AR-03** are both scale-dependent, and fixing either correctly depends on AR-08 and AR-09, which are v0.2.2 work. Reordering the save path before a coherent snapshot exists would reproduce the pattern this project's findings history documents repeatedly: every local module correct, the system contradicting itself.

`v0.2.2` carries nineteen rows. That is too many for one sitting and is stated honestly rather than pre-split on guesswork; slice it when the work starts.

## Scope changes from the review as accepted

Four rows differ from the 2026-09-22 review's own framing. Recorded here so the reasoning survives without the disposition document.

- **AR-01.** The review attributed part of the defect to a 32-bit birthday bound. That does not apply: `classify()` makes one equality test against the single revision in the last sync record, not a pairwise comparison across a population, so random collision is roughly 2⁻³² per edit. The real defect is the deterministic serialization collision, which needs no hash weakness and is fully reproducible. The fix is therefore to hash `stableStringify(canonicalizeProfiles(...))` with the existing FNV, reusing the frozen canonical contract, rather than making `configRevision()` async for SHA-256.
- **AR-06.** The review recommended rejecting all single-label hosts except `localhost`. Rejected: `gitlab`, `jenkins`, `grafana` and corporate short names are the real developer corpus. Warn and require a second confirmation instead, for single-label and recognised public-suffix scopes, with a scope preview showing the exact origin patterns. Full PSL enforcement is also declined on a new ground — a stale bundled snapshot fails *closed* against newly delegated suffixes; a warn-list fails open.
- **AR-07.** Split. Two extension popups cannot coexist (Chrome closes a popup on window blur) and there is no options page or side panel, so the shipped surface has one writer. The reachable half is the stale editor (AR-07a). The mutation coordinator (AR-07b) is gated on a second writing surface existing, not on a date.
- **AR-13.** Split. Discarding `permissions.remove()`'s boolean is a one-line edit (AR-13a, v0.2.1). The grant-ownership ledger is a design project (AR-13b, later).

Also carried: **AR-12** extends to `webtransport` and `webbundle`, which share `websocket`'s unexpressible scope. **AR-19** re-diagnoses FINDING-031 rather than withdrawing it — the wrapping `<label>` is a valid implicit association, but it takes its accessible name from the state span, so the toggle announces "Off, checkbox, not checked".

## Decisions blocking rows

None of these needs code. Each one, unresolved, stalls a row.

1. **PSL policy** (AR-06) — offline enforcement, a dated eTLD warn-list, or syntax only.
2. **WebSocket / WebTransport / WebBundle** (AR-12) — pin an observed permission mapping, or remove the resource types.
3. **Export contract** (AR-16) — faithful rescue backup, guaranteed-importable portable config, or two named artifacts.
4. **Header-name casing** (F-029) — echo as typed, or canonical with the behaviour documented.
5. **R15 popup surface** — rule on it, or park it with a trigger condition.
6. **Version policy** (FEAT-2) — keep "minor adds one feature, patch is fixes only", or change it explicitly in `README.md` before response append lands.

## Validator contract

This file and `FINDINGS.md` are now in the same repository, so the check runs in CI rather than by habit. Add a `ledger` gate to `test/verify.mjs` that fails on any of:

1. a `status` value outside the vocabulary above;
2. a row with an empty `target`, `pri`, `status` or `evidence` cell;
3. a `target` naming a version below `manifest.version`;
4. a `DECIDE:` decision on a row whose `target` is the next release;
5. a duplicate `id`;
6. a `FINDING-0xx` appearing in the `Open` section of `FINDINGS.md` with no corresponding `prior` reference in this file;
7. a row count in the target summary table disagreeing with the rows block.

Check 6 is the one that matters: it is the automated guard against the exact recurrence AR-20 records, where history and current state drift apart silently.
