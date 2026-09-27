# Runbook — GATE-0 on the published v0.2.1, clean profile, 2026-09-27

**COMMIT THIS FILE BEFORE CHROME OPENS.** Every prediction below is frozen on
commit. Outcomes are recorded in the Outcomes section at the end, keyed by
prediction id, and a wrong prediction keeps its original wording. Results go
to `test/EVIDENCE.md`. The GATE-0 row changes in `LEDGER.md` in the same
commit as the evidence.

Written against `176faf462f61d8945df71ca4f84bc53dfcf47a27` (main). **The build
under test is NOT main.** It is the v0.2.1 package the Chrome Web Store
serves, whose `extension/` is byte-identical to tag `v0.2.1` = `bd4e5df`.
Main's `extension/` carries s2 (`dec61a3`) and is never loaded in this
sitting. Main supplies only the instruments (`test/oracle/`,
`test/initiator/`, `test/preflight.mjs`), which s2 did not change.

## The row

`LEDGER.md` GATE-0, re-scoped 2026-09-27, content unchanged:

    clean profile, store install
    store id ooapgilielelobkkcdlnkenkflbnnmhi and version 0.2.1
    save / grant / apply, one readback line
    one request and one response wire case
    initiator negative control

## Five decisions, ruled 2026-09-27 before any prediction was written

Ash ruled G1–G5 "as recommended". **G1–G5 name these decisions only.** The
rows are S (setup), A, B, C and D, so no id means two things.

- **G1. A clean profile** is a brand-new Chrome profile made for this sitting,
  signed out, with nothing installed except HeaderWright from the public
  listing. **Developer mode is switched on** only so the popup can be
  inspected. It does not change the installed extension. Step S-4 checks the
  installed bytes directly.
- **G2. The initiator negative control** is the v0.2.0 runbook's B1: a
  cross-origin Measure from `http://nothw.test:8790/` with only `hw.test`
  granted, which must show `x-hw-probe` ABSENT on a fetch that succeeded. Its
  positive control is the same-origin Measure from `http://hw.test:8790/`,
  which runs FIRST in the same profile (row B). **A failed fetch is not-run,
  never absent.**
- **G3. One profile carries every row.** `probe` on `hw.test`:
  - request `X-HW-Probe` / `set` / `present`;
  - response `X-HW-Oracle` / `set` / `rewritten`.

  One Save and one permission dialog, and two readback lines.
- **G4. GATE-0 alone.** The s2 rows (AR-01b, unpacked, `hw-test`) get their
  own runbook. A store install and an unpacked build never share a runbook.
- **G5. The clean profile is deleted** after the evidence is committed. It is
  not a step in this sitting.

## One fact the predictions depend on, read from the v0.2.1 source

**A fresh install starts with the master toggle OFF.** `getEnabled()` in
`popup.js` and the worker's decoder in `stored.js` both read
`hw:enabled === true`, and a new install has no such key. So a fresh install
reads `paused`, and "apply" in this row includes switching the toggle ON. The
toggle is a checkbox, `#master-toggle`, with a state label `#toggle-state`.

## What each row can and cannot tell apart

| name | what it is |
| --- | --- |
| OLD | the store still serving v0.2.0 bytes, or a pending update not yet applied |
| DEV | any unpacked build, including main with s2 |
| DRIFT | store bytes that differ from the tag (a pipeline defect) |
| NO-APPLY | the extension registers nothing, or Chrome ignores it |
| BROAD | the extension holds a grant covering `nothw.test` (`*://*/*`, or `nothw.test` itself) |
| NO-RES | response entries not applied |

- S-P1 and S-P2 fail on DEV. S-P3 fails on OLD. S-P4 fails on OLD, DEV
  (main's `popup.js` differs) and DRIFT.
- B fails on NO-APPLY, and it is the only row that tells NO-APPLY apart from
  a correct D.
- C fails on NO-APPLY and NO-RES.
- D fails on BROAD.

## Before Chrome

- [ ] In `~/headerwright`: `git fetch origin && git log --oneline -2 origin/main`
      → the top line is this file's commit, and the second is `176faf4`.
      `git rev-parse HEAD` equals `origin/main`.
- [ ] `node test/verify.mjs` → seven PASS, `tree: 556 checks, 131 mutation
      scenarios, 7 gates`. Quote the `tree:` line.
- [ ] **Start both instruments from this clone, fresh.** If either is already
      running from an earlier sitting, stop it first (FINDING-037: a running
      server never sees a pull).
      `node test/oracle/server.mjs 8787` and `node test/initiator/server.mjs 8790`,
      each in its own terminal.
- [ ] `node test/preflight.mjs` → **PREFLIGHT PASSES**. It checks both
      processes against this tree and resolves `hw.test` and `nothw.test`. A
      red preflight means Chrome does not open.

## In Chrome, before any row

**S-1. Make the clean profile.** Chrome's profile menu → **Add** →
**Continue without an account**. Name it `hw-gate0-v021`. In the new window,
open `chrome://version` and record **Profile Path** and the Chrome version.
Open `chrome://extensions` and record that the list is empty.

**Preconditions. If any fails, stop and record it.**

- **PC1.** The window's profile is `hw-gate0-v021`, and it is signed out.
- **PC2.** `chrome://extensions` lists no extension at all.

**S-2. Install from the public listing.** Open
`https://chromewebstore.google.com/detail/ooapgilielelobkkcdlnkenkflbnnmhi`.
Record the version the listing shows. Click **Add to Chrome**, and record the
install dialog's text verbatim (not predicted, not counted). Confirm.

**S-3. Read the card.** On `chrome://extensions`, switch **Developer mode**
ON. On the HeaderWright card, record the name, the version and the ID. Open
**Details** and record **Site access** verbatim. Pin the extension (puzzle
icon → pin) so the badge is visible.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| S-P1 | ID → `ooapgilielelobkkcdlnkenkflbnnmhi` | DEV | high |
| S-P2 | name → `HeaderWright — Modify HTTP Headers` | DEV (only if its manifest name differs) | high |
| S-P3 | version → `0.2.1` | OLD | high |
| S-P5 | Site access does NOT read "On all sites" | BROAD | high |

**S-4. Build identity, from inside the extension.** Click the toolbar icon
to open the popup. Right-click inside it → **Inspect**. **Check the DevTools
title bar shows `ooapgilielelobkkcdlnkenkflbnnmhi` before trusting any
reading.** Console, one block:

```js
const want = {
  "background/sw.js": "2513b163157abf703e2d9fbe4dbdc8b62cefdc865b82587457330bd25edf1797",
  "icons/icon128.png": "854432c73861dd49b5bb73b5b88fb397122e0465baf670126200dc607c7dbf7f",
  "icons/icon16.png": "21d306174ccdc81483a0b0ceefec1a20e9f829a43119b24ed76f054978f6f0c5",
  "icons/icon32.png": "1bd281347760ed4cbd9a79b5938b7fbfc7f43b260427d8043983979d4a82301b",
  "icons/icon48.png": "291b700b61d1f32297f6a309f4c62cd27ba644d3dc8acd30cb980225d9001fa7",
  "lib/canonical.js": "f3f35b2e2af2ae982440ff701f9676e8fb2557716c384d89e0c5732f857d498f",
  "lib/collisions.js": "8120cf52e78ebd90ef10c99e512b86d4056f8d445e6c1dc26f061f60e3bae2ef",
  "lib/draft.js": "2be305bfd071f3231ffceda8fd9d722a69c883aa83864aeaacbf1b6ba4828d23",
  "lib/grants.js": "851bfc7ce75f117c7badd8566727a6150cb97c34d350757ceaeb61a6b08c7101",
  "lib/profile.js": "7b72856b505832db6839edaa391722b617a29dd40e6c3be043e2c6987482a8b3",
  "lib/queue.js": "4a1795b42311c769305c680de6df60ce449658f3b96571a0fea4ef0e5b1c10b2",
  "lib/readback.js": "980633498ebf326cd99a8e156267439af4289806791d41285aa6db84d56e809b",
  "lib/rules.js": "1819c8261e93730ed9f920ea71ab12bfeef1c79480d13cdf0000a418c05de818",
  "lib/status.js": "d6377952b80639c2243fab385bd6ccb9fb13182eabd046de411f125bc894776d",
  "lib/stored.js": "c60bd3db57349090fbd33522d00682fb00b947fe9b8202c01c0e3104716b3e5d",
  "popup/popup.html": "5078d3acbd9523e24fbc903900f17279a91127809afdf316dfa1419c0818c282",
  "popup/popup.js": "4b98aa306e55cb209a4b517317d618413e4483b36e8d2a6f7ed5963073acfeb7"
};
const got = {};
for (const p of Object.keys(want)) {
  const b = await (await fetch(chrome.runtime.getURL(p))).arrayBuffer();
  got[p] = [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map(x => x.toString(16).padStart(2, "0")).join("");
}
[chrome.runtime.id, chrome.runtime.getManifest().version, Object.keys(got).length, Object.keys(want).filter(p => got[p] !== want[p]), "update_url" in chrome.runtime.getManifest()];
```

The seventeen hashes are the tag's non-manifest files, from NEXT.md's v0.2.1
release artifacts. They were re-checked against a git checkout of `bd4e5df`,
and the snippet's logic was run in Node against those files (`[]`, 17) before
this file was committed. `manifest.json` is left out because the store adds
`update_url` to it.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| S-P4 | the first four elements → `"ooapgilielelobkkcdlnkenkflbnnmhi", "0.2.1", 17, []` | OLD, DEV, DRIFT | high |
| S-P4b | the fifth → `true`: `getManifest()` shows the store's `update_url` | — | medium; recorded, not counted |

**Run the block once.** A second run in the same console fails on `const`;
close and reopen the popup to rerun it. If the fourth element is not `[]`,
**stop**. The bytes Chrome runs are not the
tag's, and every row below would test something unknown.

**S-5. Starting state, no mutation.** Same console:

```js
await chrome.storage.local.get(null);
```

then

```js
(await chrome.permissions.getAll()).origins;
```

then

```js
await chrome.declarativeNetRequest.getDynamicRules();
```

Read the popup's footer line and the badge.

| # | prediction | confidence |
| --- | --- | --- |
| S-P6 | storage holds at most `hw:sync`, with `state: "paused"`; no `hw:profiles`, no `hw:enabled` | medium-high: the worker's `onInstalled` sync writes the record |
| S-P7 | origins → `[]` | high |
| S-P8 | rules → `[]` | high |
| S-P9 | no cards; footer → `0 profiles · 0/0 domains granted · paused`; toggle label `Off`; badge `OFF` | medium-high |

Close the popup.

## Row A — save, grant, apply

**A-1.** Open the popup. **+ Add profile**. Name `probe`, domains
`hw.test`. Header row 1: side `request`, operation `set`, name `X-HW-Probe`,
value `present`. **+ Add header**. Row 2: side `response`, operation `set`,
name `X-HW-Oracle`, value `rewritten`. **Check every dropdown and field by eye
before pressing** (FINDING-040 and FINDING-043). Click **Save profile** once,
with the mouse.

| # | prediction | confidence |
| --- | --- | --- |
| A-P1 | Chrome's permission dialog opens, naming `hw.test`, and the popup closes | high |

Click **Allow**.

**A-2.** Reopen the popup, without DevTools. Read the card, the footer and
the badge.

| # | prediction | confidence |
| --- | --- | --- |
| A-P2 | one card, `probe`, with a green `hw.test` chip; the card reads `Off — nothing registered` and shows no lines | high |
| A-P3 | footer → `1 profile · 1/1 domain granted · paused`; badge `OFF` | high |

**A-3. Apply.** Switch the master toggle ON. Do not reopen the popup.

| # | prediction | confidence |
| --- | --- | --- |
| A-P4 | toggle label `On`; badge `ON` | high |
| A-P5 | the card shows exactly two lines, in this order: `req · set · X-HW-Probe → "present"` then `res · set · X-HW-Oracle → "rewritten"` | high: request lines precede response lines by design |
| A-P6 | footer → `1 profile · 1/1 domain granted · applying 1` | high |

**A-4. Console truth.** Right-click the popup → **Inspect**, check the title
bar ID, and run:

```js
JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules());
```

then

```js
(await chrome.permissions.getAll()).origins;
```

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| A-P7 | exactly one rule, `id` 1, `condition.requestDomains` `["hw.test"]`, `action.type` `"modifyHeaders"`, `requestHeaders` `[{"header":"X-HW-Probe","operation":"set","value":"present"}]`, `responseHeaders` `[{"header":"X-HW-Oracle","operation":"set","value":"rewritten"}]` | DRIFT, NO-APPLY | high (key order in the JSON is not predicted) |
| A-P8 | origins → exactly `*://*.hw.test/*` and `*://hw.test/*`, in either order | BROAD | high |
| A-P9 | the card lines (A-P5) and A-P7 agree entry for entry | — | high |

**This is the row's "one readback line".** A-P5 and A-P9 carry it.

Close the popup.

## Row B — request wire case, same-origin (the control, FIRST)

Open a tab at `http://hw.test:8790/`. Press **Measure**.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| B-P1 | verdict `SAME-ORIGIN — page on …hw.test…`; `x-hw-probe` → `"present"` | NO-APPLY | high |
| B-P2 | `x-hw-second` and `authorization` ABSENT | — | high |

**If B-P1 fails, stop.** Row D is then uninterpretable. Record the verdict box
verbatim.

## Row C — response wire case

Open a tab at `http://hw.test:8787/`, not `127.0.0.1`. **Precondition:**
DevTools → Application → Service workers shows no registration for this origin
(it cannot in a clean profile; record that it was checked). Press
**Measure — plain case**.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| C-P1 | verdict `MODIFIED — 1 changed, 0 removed, 0 added` | NO-APPLY, NO-RES | high |
| C-P2 | `x-hw-oracle` sent `baseline`, received `rewritten`; `x-hw-second` `two` → `two`; `x-hw-removable` `present` → `present` | NO-RES | high |

`UNMODIFIED` here is a FAILURE: this is a feature phase, not a control.

## Row D — the initiator negative control

**D-1.** Open the popup, right-click → **Inspect**, check the title bar ID,
and re-read the grants:

```js
(await chrome.permissions.getAll()).origins;
```

Expect A-P8's two origins and nothing else. If `nothw.test` or `*://*/*`
appears, stop: the row cannot be run.

**D-2.** Open a tab at `http://nothw.test:8790/`. Press **Measure**.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| D-P1 | the fetch succeeds: the verdict box is not `MEASUREMENT FAILED`, and the body reports `servedBy` `hw.test` | — (an instrument check) | high |
| D-P2 | verdict `CROSS-ORIGIN`, initiator origin `http://nothw.test:8790` | — | high |
| D-P3 | **`x-hw-probe` ABSENT**, and `allReceivedNames` has no `x-hw-probe` | BROAD | high: HW-V6-01, observed on the unpacked build 2026-09-19 |

A failed fetch makes D-P3 NOT RUN, whatever the page shows.

## Close-out

In the popup's console:

```js
JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules());
(await chrome.permissions.getAll()).origins;
```

| # | prediction | confidence |
| --- | --- | --- |
| Z-P1 | unchanged from A-P7 and A-P8: nothing in rows B–D wrote anything | high |

Leave the profile as it is. Decision G5 deletes it after the evidence is committed.
Stop both instrument servers.

## What moves in `LEDGER.md`

**GATE-0 → `verified`** if all of these hold: S-P1, S-P3, S-P4, S-P5,
A-P1, A-P5, A-P7, A-P8, A-P9, B-P1, C-P1, C-P2, D-P1, D-P3.

- The evidence cell becomes browser evidence. The decision cell names this
  file and the Chrome version.
- S-P2, S-P4b, S-P6 to S-P9, A-P2 to A-P4, A-P6, B-P2, D-P2 and Z-P1 are
  recorded, and not counted. A miss among them is a finding about the
  prediction or the popup, not about the store pipeline.
- A GATE-0 pass on v0.2.1 says nothing about v0.2.2. That release needs its
  own post-publish pass, per the re-scope record.

## Outcomes

*Recorded here during the sitting, one entry per prediction id. Nothing above
this heading is edited after commit.*

Recorded 2026-09-27, 16:10–18:35 CT. Sections above are unedited from
`5ecdd3d`. The full observations are in `test/EVIDENCE.md`, *GATE-0 — the
published v0.2.1 in a clean profile*.

**One counted prediction was wrong, and it was the prediction, not the
build: S-P4.** Two uncounted ones missed on wording. Everything else held.
The sitting stopped at S-P4 as the runbook required. Three rulings (E1–E3,
below) were made before it continued.

### Before Chrome

- 16:10: `origin/main` = `5ecdd3d`, parent `176faf4`, `HEAD` = `origin/main`.
- 16:20: `tree: 556 checks, 131 mutation scenarios, 7 gates`, ALL AUTOMATED
  GATES PASS. The first run was piped through `tail -4`, which cut the
  `tree:` line; it was rerun with `grep`.
- 16:22: nothing was listening on 8787 or 8790.
- 16:24: oracle from `~/headerwright` at `5ecdd3d`, pid 63946, build
  `bbf78ddbddf8`. The first attempt ran from `~` and failed with
  `MODULE_NOT_FOUND`; nothing started.
- 16:25: initiator, pid 63950, build `1e6dc8fd662c`.
- 16:27: **PREFLIGHT PASSES.** Oracle 13/13, initiator 12/12; `hw.test:8787`,
  `hw.test:8790` and `nothw.test:8790` resolve to those processes.

### In Chrome, before any row

- **S-1.** Chrome `153.0.8010.48` (Official Build) (arm64), macOS 26.5.2
  (25F84), Profile Path `…/Google/Chrome/Profile 16`.
- **PC1 — HELD.** `hw-gate0-v021`, not signed in.
- **PC2 — FAILED AS WRITTEN.** The list was not empty: **Google Docs
  Offline**, enabled, which Chrome installs by default in a new profile. This
  runbook was wrong to expect an empty list. Stopped. Ash ruled: remove it.
  Removed at 17:12; the list was then empty, and PC2 held.
- **S-2.** The listing read Version `0.2.1`, Updated September 27, 2026, Size
  `85.97KiB` (= 88,037 bytes, the v0.2.1 draft CRX's recorded size).
  The install dialog, verbatim: `Add "HeaderWright — Modify HTTP Headers"?`,
  with no permission warnings.
- **S-P1 — CORRECT.** `ooapgilielelobkkcdlnkenkflbnnmhi`.
- **S-P2 — CORRECT.** `HeaderWright — Modify HTTP Headers`.
- **S-P3 — CORRECT.** `0.2.1`.
- **S-P5 — CORRECT.** Site access read *This extension can read and change
  your data on sites. You can control which sites the extension can access.*,
  with *Automatically allow access on the following sites* ON and no sites
  listed. Chrome 153 shows a switch and a list here, not the dropdown
  `SMOKE.md` describes. "On all sites" appears nowhere.
- **S-P4 — WRONG.** `['ooapgilielelobkkcdlnkenkflbnnmhi', '0.2.1', 17,
  Array(4), true]`. The four mismatches were exactly the manifest's icons.
  Installed sha256:
  - `icons/icon16.png` `3a45f832fa7d7a27fd60b54697e84334dcbb4d8f0e154650a28fb227b2acc4a0`
  - `icons/icon32.png` `3c64e1070e35fb450467d4df28e236d21575ed293daf6eeefd2f403f428d725e`
  - `icons/icon48.png` `5006045f769e0122c1835ee2f39e2f81a0522bd0cfb9c93d6b4e0c87460fc5c3`
  - `icons/icon128.png` `5a1c583c089e9e08d26a0a6517d0e5cdc8235cd0821e1e52ec8ee6a978216610`

  All 13 other files matched the tag byte for byte. **Cause:** Chrome's
  install-time image sanitizer decodes every image and re-encodes it with
  `gfx::PNGCodec::EncodeBGRASkBitmap`, writing it back to the same path
  (`extensions/browser/image_sanitizer.cc`, reached from
  `sandboxed_unpacker.cc`). Unpacked loads skip it, which is why no earlier
  sitting saw this. The tag's icons are 8-bit RGBA with a `bKGD` chunk,
  which a re-encode drops. v0.2.1's release check had already found the icons
  byte-identical to the tag inside the draft CRX. **No correct store install
  could have produced `Array(0)`.**
- **S-P4b — CORRECT.** `true`.

### The stop at S-P4, and three rulings

Ash ruled E1–E3 "as recommended" at 17:50.

- **E1.** Continue. S-P4 is recorded wrong, with its cause.
- **E2.** Add one unplanned observation first: a pixel comparison of the four
  icons against the tag's, fetched from
  `raw.githubusercontent.com/antrixy/headerwright/bd4e5df…/extension/`. The
  prediction was stated before the snippet was written: equal sizes and 0
  differing pixels (medium confidence); any difference at most 1 per channel,
  and only on partly transparent pixels (high confidence).
  **Result, 17:52: all four `200, true`** (GitHub served the tag's exact
  bytes), **equal sizes, `0, 0, 0`.** Pixel-identical. The prediction held,
  including the medium half.
- **E3.** For GATE-0's verdict, S-P4 is replaced by: ID, version, the 13
  non-image files byte-identical, and the icons pixel-identical under E2.
  **Met.** This is a deviation from the frozen criterion, and it is stated
  as one. **Future GATE-0 runbooks compare manifest images by pixels, not by
  bytes.**

- **S-5.** Storage held only `hw:sync`: `state 'paused'`, `activeRuleCount
  0`, both revisions `'ab3a8a0a'`. **`ab3a8a0a` is v0.2.1's `configRevision`
  for no profiles with the toggle off.** Main's s2 encoding gives `69709b56`.
  So the running worker uses v0.2.1's encoding: an independent confirmation
  of the build, not predicted.
- **S-P6 — CORRECT.**
- **S-P7 — CORRECT.** `[]`.
- **S-P8 — CORRECT.** `[]`.
- **S-P9 — CORRECT, on wording.** No cards; footer `0 profiles · 0/0 domains
  granted · paused`; badge `OFF`. The label renders `OFF`, where `Off` was
  written. An empty-list text, *No profiles yet. Add one to start setting
  headers on a site.*, was not predicted.

### Row A

- **A-1.** The field clips both header names, so the form was read from the
  console before Save: `['X-HW-Probe','request','set','present']`,
  `['X-HW-Oracle','response','set','rewritten']`. The editor showed
  *Showing unsaved changes. Revert to saved.*: the popup had been closed and
  reopened while opening DevTools, and **Add profile** restored the draft
  (FINDING-042, as designed).
- **A-P1 — CORRECT.** *"HeaderWright — Modify HTTP Headers" has requested
  additional permissions. It could: Read and change your data on all hw.test
  sites and hw.test*. The popup closed. Allowed.
- **A-P2 — CORRECT.** `probe`, `2 headers`, `Off — nothing registered`, a
  green `hw.test` chip, no lines.
- **A-P3 — CORRECT.** `1 profile · 1/1 domain granted · paused`; badge `OFF`.
- **A-P4 — CORRECT, on wording.** The label renders `ON`, and the badge reads `ON`.
- **A-P5 — CORRECT.** `req · set · X-HW-Probe → "present"`, then
  `res · set · X-HW-Oracle → "rewritten"`, without reopening the popup.
- **A-P6 — CORRECT.** `1 profile · 1/1 domain granted · applying 1`.
- **A-P7 — CORRECT.** One rule: `id` 1, `priority` 1, condition keys
  `requestDomains` and `resourceTypes` (15 types), `requestDomains
  ["hw.test"]`, `modifyHeaders`, request `[{X-HW-Probe, set, present}]`,
  response `[{X-HW-Oracle, set, rewritten}]`. The first read was cut off in
  the console, and a clipboard copy failed to paste. The fields were
  read with a narrower expression instead.
- **A-P8 — CORRECT.** `['*://*.hw.test/*', '*://hw.test/*']`.
- **A-P9 — CORRECT.** The card and the registered rule agree entry for entry.

### Row B

- **B-P1 — CORRECT.** `SAME-ORIGIN — page on hw.test:8790, target hw.test,
  initiator origin (none sent — same origin).` `x-hw-probe: "present"`;
  `servedBy` `hw.test`.
- **B-P2 — CORRECT.** `x-hw-second` and `authorization` ABSENT.

### Row C

- Precondition: no service worker registered for `hw.test:8787`. Checked.
- **C-P1 — CORRECT.** `MODIFIED — 1 changed, 0 removed, 0 added.`
- **C-P2 — CORRECT.** `x-hw-oracle` `baseline` → `rewritten`;
  `x-hw-removable` `present` → `present`; `x-hw-second` `two` → `two`.

### Row D

- **D-1.** Origins `['*://*.hw.test/*', '*://hw.test/*']`. No `nothw.test`,
  no `*://*/*`.
- **D-P1 — CORRECT.** The fetch succeeded; `servedBy` `hw.test`.
- **D-P2 — CORRECT.** `CROSS-ORIGIN — page on nothw.test:8790, target
  hw.test, initiator origin http://nothw.test:8790.`
- **D-P3 — CORRECT.** `x-hw-probe` ABSENT. `allReceivedNames` lists
  `accept, accept-encoding, accept-language, cache-control, connection, host,
  origin, pragma, referer, user-agent`, with no `x-hw-probe`.

### Close-out

- **Z-P1 — CORRECT.** The same one rule and the same two origins.

### Ledger

**GATE-0 → `verified`.** Every counted prediction held except S-P4, which
was replaced under E3, and whose replacement was met.

- **Not closed by this sitting:**
  - GATE-0 for v0.2.2, which needs its own post-publish pass.
  - Deleting `hw-gate0-v021` (decision G5), which happens after this
    commit.
  - The DevTools Issues counts (9 in the popup; 1 error and 6 warnings on
    the oracle tab), which were not read.
