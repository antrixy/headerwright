# Smoke evidence

Completed browser-level smoke results, newest first. The selftest suite proves
rule CONSTRUCTION; this file is the record of what was observed on the WIRE.

A run is only evidence if it names the build and the browser. "Tested on
Chrome" is a claim. The tables below are the format: environment, procedure
reference, per-step observation, and the raw timestamps the observation came
from.

---

## v0.1.4 — PARTIAL (Part 11 steps 1–5)

**STATUS: INCOMPLETE. Do not ship on this record alone.**
Part 11 steps 6–10 and all of Part 12 have not been run. See "Resume" below.

### Environment

| Field | Value |
| --- | --- |
| Build | v0.1.4, unpacked from `~/hw/fresh` |
| Extension id | `ddgomchkggjoehcoeibmmnfaakjanmce` (unpacked; path-derived) |
| Chrome | 151.0.7922.138 (Official Build) (arm64) |
| OS | macOS 26.5.2 (Build 25F84) |
| Profile | dedicated `hw-test` profile, NOT signed in |
| Other extensions | Google Docs Offline 1.109.1 (Chrome default; no DNR rules, no header modification) |
| Launch flags | `--origin-trial-disabled-features=CanvasTextNg|WebAssemblyCustomDescriptors` — non-stock launch, neither flag touches DNR or permissions |
| Date | 2026-08-15 |

Profile isolation was verified before starting: `chrome://extensions` in the
`hw-test` profile listed no HeaderWright, confirming the Web Store copy of
v0.1.3 in the main profile did not sync in. Two enabled copies would both
register DNR rules and no observation would be attributable.

### Fixture

Local echo endpoint on `:8080`, `/etc/hosts` mapping `hw.test`,
`sub.hw.test`, `a.b.hw.test` and `nothw.test` to `127.0.0.1`. Server sends
`no-store`; a cached 200 could otherwise let a stale header survive a
configuration change and read as a pass. `.test` is IANA-reserved, so nothing
resolves off-machine.

Profile under test: name `hw-test`, domain `hw.test`, one header
`X-HW-Smoke: v014` (set), master toggle ON.

### Results — Part 11 steps 1–5

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

### Unplanned observations

Both were found while verifying something else, and both change how later
parts must be read.

**O-1. A host grant SURVIVES profile deletion in Chrome 151.** This is SMOKE
Part 0's question, answered incidentally. A profile on `hw.test` was granted,
the profile was deleted, and a later re-create of the same profile produced
NO permission dialog — the corollary check in Part 0. Confirmed against
ground truth: after deletion and re-create,
`chrome.permissions.getAll().origins` returned both patterns.

Consequence: Part 12's revocation steps must be read against this. If Chrome
retains grants after a correct `remove()`, Part 12 rows become DOCUMENTED
rather than FAILED, exactly as the Part 0 table specifies. Not yet
distinguished from the alternative — that `remove()` was never called — which
Part 12 step 1 is designed to separate.

**O-2. The `chrome://extensions` Details panel UNDER-REPORTS the granted
set.** With both patterns held, Site access listed only `*://*.hw.test/*`.
Ground truth from the extension's own service worker:

```
chrome.permissions.getAll().then(p => console.log(p.origins))
["*://*.hw.test/*", "*://hw.test/*"]   // length 2
```

Chrome appears to collapse the display, showing the broader pattern because
`*.hw.test` covers the apex. The permission state is correct; the panel is a
summary.

This matters beyond cosmetics. Finding 18 existed because a UI surface
asserted something the wire did not support, and the Details panel is a UI
surface with the same failure mode. **Verify granted sets with
`permissions.getAll()` in the service worker console, not by reading the
Details panel.** Anyone debugging a permission question from that panel will
reach a wrong conclusion.

### Resume — what is left and what state it needs

Not yet run: **Part 11 steps 6, 6b, 6c, 6d, 7, 8, 9, 10** and **all of Part
12**.

The remaining steps are the upgrade path, and they need setup the completed
steps did not:

- `~/hw/upgrade` (v0.1.3) and `~/hw/fresh` (v0.1.4) are already unpacked and
  version-verified. Step 6 requires loading v0.1.3 from `~/hw/upgrade` FIRST,
  granting under it, and then overwriting that SAME DIRECTORY with v0.1.4 and
  reloading. Copying to a new folder changes the path, which changes the
  extension id, which discards both storage and the grant — and step 6 then
  silently tests nothing.
- Step 6c needs an extension that never ran v0.1.3. The currently loaded
  `~/hw/fresh` copy has an active `hw.test` grant, so it is NOT clean for
  that purpose. Remove it (which drops its permissions and storage) and
  re-add, or use a third directory.
- Only ONE HeaderWright copy should be enabled at a time. Two copies both
  register DNR rules and no result is attributable.
- Part 12 continues from Part 11 step 6 with a legacy-only domain still gray.
  Do not re-grant it before Part 12 step 1.

Environment above must be re-verified rather than assumed on resume —
particularly the Chrome version, since an auto-update between sittings would
split the record across two builds.
