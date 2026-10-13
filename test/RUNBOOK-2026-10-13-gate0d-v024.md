# Runbook — GATE-0d on the published v0.2.4, clean profile, 2026-10-13

**COMMIT THIS FILE BEFORE CHROME OPENS.** Every prediction below is frozen on
commit. Outcomes are recorded in the Outcomes section at the end, keyed by
prediction id, and a wrong prediction keeps its original wording. Results go
to `test/EVIDENCE.md`. The GATE-0d row changes in `LEDGER.md` in the same
commit as the evidence.

Written against `b8f0dd3422e4bc42618fd90a169cc76c31db3877` (main). **The
build under test is the v0.2.4 package the Chrome Web Store serves**, whose
`extension/` is byte-identical to tag `v0.2.4` = `f86f18b`. Main's
`extension/` is ALSO byte-identical to the tag: the four commits after it
(`9c4e583`, `5e66e38`, `9b4e945`, `b8f0dd3`) touch only `LEDGER.md`,
`FINDINGS.md` and `SCOPE.md`. So bytes cannot tell an unpacked main from the
store build; the ID can (S-P1). Main supplies only the instruments
(`test/oracle/`, `test/initiator/`, `test/preflight.mjs`): oracle build
`c098c223e3b1` (moved at `bcebae3`, F-045), initiator build `1e6dc8fd662c`.

Shape copied from `test/RUNBOOK-2026-10-05-gate0-v023.md`. What changed from
it, and why, is listed after the decisions.

**Chrome.** Written for Chrome `154.0.8037.98` (Official Build) (arm64),
revision `b859317bf11f6be47f9b7799ec690a0a42a1fb33-refs/branch-heads/8037@{#1674}`,
read on `chrome://version` in the `Default` profile in a message sent at
10:15 CT (15:15 UTC) on 2026-10-13, before this file was written. The s5
sitting ran on the same build; GATE-0c ran on `154.0.8037.95`.

## The row

`LEDGER.md` GATE-0d, added 2026-10-13 at `b8f0dd3`, content as GATE-0's:

    clean profile, store install
    store id ooapgilielelobkkcdlnkenkflbnnmhi and version 0.2.4
    save / grant / apply, one readback line
    one request and one response wire case
    initiator negative control

## Nine decisions, ruled 2026-10-13 before any prediction was written

Ash ruled M1–M9 "as recommended" at 10:15 CT (15:15 UTC). **M1–M9 name these
decisions only.** The rows are S (setup), A, B, C, D and Z. Q1–Q5 and Q4a are
GATE-0c's decisions; V1–V6 are GATE-0b's; the ones that carry over are named
below.

- **M1. The row.** GATE-0d, a new row and not a retarget (G1), `open`,
  target `v0.2.4`, content as GATE-0's. It landed at `b8f0dd3`, its own
  commit, before this file.
- **M2. The clean profile** is a brand-new Chrome profile made for this
  sitting, `hw-gate0-v024`, signed out. V1 carries over: Google Docs
  Offline is removed as a setup step (S-1); PC2 reads "no user-installed
  extensions"; Developer mode is switched on only so the popup can be
  inspected. **The profile and `~/hw-gate0d-logs/` are deleted after the
  evidence commit is pushed and read back.** That is not a step in this
  sitting (Q2's precedent).
- **M3. The Chrome version** is read on `chrome://version`, never on the
  About page, which starts an update check. It was read before this file
  was frozen (above) and is read again in the new profile at S-1. A
  different build of 154 is recorded and the sitting continues. **A
  different major version stops it for a ruling** (K3).
- **M4. Identity.** The 14 code files by bytes (S-P4, counted); the 4 icons
  by pixels (S-P4c, counted) against the tag's icons fetched from GitHub at
  `f86f18b` and hash-checked, their bytes predicted to differ (S-P4d,
  recorded); the installed manifest by content (Q4a) against the tag's
  manifest fetched from GitHub at `f86f18b` and hash-checked: S-P4m and
  S-P4n, recorded, a mismatch under S-P4m stopping the sitting;
  `minimum_chrome_version` read, predicted `"116"`, recorded and not
  counted (S-P4f, S5-D4).
- **M5. The install revision** `69709b56` is recorded, not counted
  (S-P6b): v0.2.3 writes the same value.
- **M6. The status strings are re-read from the v0.2.4 source** (UI-04):
  A-P6 reads `registered 1` where GATE-0c's read `applying 1`. No
  prediction names the footer's line count or height: `nothing registered`
  wraps to two lines in the 380 px footer on the Mac. UI-03 also changes
  A-P0d: the header names show whole in 293 px fields.
- **M7. The row stays exactly GATE-0c's.** Nothing from the s5 sitting is
  added (no field-width measurement, no export refusal). The only changes
  are those the v0.2.4 source forces, and the console reads of on-screen
  text below (S-P9b, A-P6b), which are recorded and not counted.
- **M8. Where the sitting can pause.** See "Pauses", below.
- **M9. The name.** M is used by no earlier ruling set and no row of this
  file.

**What changed from the v0.2.3 runbook, and why:**
- S-4's fourteen hashes are v0.2.4's. `lib/budget.js` is new, and seven
  others differ from v0.2.3's: `lib/canonical.js`, `lib/collisions.js`,
  `lib/draft.js`, `lib/rules.js`, `lib/status.js`, `popup/popup.html` and
  `popup/popup.js`. A file the extension does not have prints as `MISSING`
  instead of throwing, so OLD reads as a list.
- S-4m and S-4b fetch the tag at `f86f18b`. The manifest's reference hash is
  `bc2eeb59…`. S-4m prints a fifth element, `minimum_chrome_version`
  (S-P4f). The icons' bytes are the same as v0.2.3's.
- **S-P6b and A-P0a no longer fail on OLD.** `configRevision([], false)` is
  `69709b56` in v0.2.3 and v0.2.4 (`lib/status.js` changed only in its
  strings and comments), and both write drafts of `version` 2. OLD is told
  apart by S-P3, S-P4 (eight code files), S-P4m (`version` and
  `minimum_chrome_version`, `"101"` in v0.2.3) and S-P4f, and by the
  footer's wording (A-P6, A-P6b); only S-P3 and S-P4 are counted.
- A-1b's line also prints `performance.timeOrigin` (M8).
- A-P0d: the names show whole (UI-03).
- A-P6: `registered 1` (UI-04).
- S-P9b and A-P6b are new: the list, the footer, its hover text and the
  toggle label read from the console, so the strings are read by their
  bytes as well as by eye (FINDING-053's lesson). Recorded, not counted.
- The instruments' logs go in `~/hw-gate0d-logs/`.

## Facts the predictions depend on, read from the v0.2.4 source

- **A fresh install starts with the master toggle OFF.** `hw:enabled` is
  read as `=== true` (`popup.js:178`, `stored.js:72`), and a new install has
  no such key. So a fresh install reads `paused`, and "apply" in this row
  includes switching the toggle ON (`#master-toggle`). The label
  `#toggle-state` holds `Off` or `On`; CSS shows it in capitals.
- **`configRevision([], false)` is `69709b56` in v0.2.4.** Computed in Node
  from the tag's `lib/status.js` (`9bf7540b…`), and read back from `hw:sync`
  after loading the tag's `extension/` in Chromium 141 (below).
- **The status strings** (`describeSync`, `lib/status.js:157–181`):
  `paused`; `nothing registered` when the toggle is ON and nothing is
  registered; `registered N`; `registered N · M not registered`; the
  failure and checking lines are unchanged from v0.2.3. The footer's hover
  text is `""` unless the last sync failed or profiles were not registered,
  when it reads `Not registered: …` (`popup.js:551–560`). The card's
  `Off — nothing registered` is unchanged (`lib/readback.js:24`).
- **A draft for a profile not saved yet is stored under the key `new`, and
  has no card.** `init()` always shows the list, so a reopened popup shows
  the empty list with no marker. The draft is restored only when **Add
  profile** is pressed: `openEditor(null)` reads `draftFor(drafts, null)`
  and shows *Showing unsaved changes.* (`popup.js:892–930`). Its `version`
  is 2 and its `baseDigest` is `null`.
- **Save on a new profile** takes no base check (`editingProfileId ===
  null`), passes the collision check and DR-02's budget check (a two-entry
  profile is far below it), writes `hw:profiles`, ends the draft session,
  which drops the `new` draft, and then requests the grant (`saveProfile`,
  `popup.js:1088–1240`).
- **UI-03:** the editor's header row is on two lines, the name field 293 px
  wide on the Mac (s5 sitting), so `X-HW-Probe` and `X-HW-Oracle` show
  whole.
- **Chrome rewrites `manifest.json` at install and adds `key`** (GATE-0c:
  `[200,true,[],["key","update_url"]]`), and **re-encodes the icons**
  (GATE-0, GATE-0b, GATE-0c). So the manifest is compared by content and the
  icons by pixels.

## How the snippets were checked before this file was committed

Every console block in this file, block G included, was run verbatim and in
order in Chromium 141.0.7390.37 (headless), in the popup page (block G in the
service worker) of the unpacked builds below, through `Runtime.evaluate`
with `replMode`, the console's own mode. The blocks were taken from this
file's text by a script, so what ran is what is printed here. The form was
filled by setting each field and firing its `input` or `change` event; the
popup ran as a tab, so "close and reopen" was closing the tab and opening a
new one.

| build | S-4 | S-4m | S-4b |
| --- | --- | --- | --- |
| the tag as is (`git archive v0.2.4 extension`) | `"0.2.4",14,[]` | `[200,true,[],[],"116"]` | each icon `200 true true true 0 0` |
| the tag with `update_url` and a `key` added to its manifest, re-serialized (a stand-in for a store install) | `"0.2.4",14,[]` | `[200,true,[],["key","update_url"],"116"]` | as the tag |
| every icon re-encoded without `bKGD` (what Chrome's sanitizer does) | `"0.2.4",14,[]` | `[200,true,[],[],"116"]` | each icon `200 true false true 0 0` |
| one pixel of `icon48.png` changed by 7 in red | `"0.2.4",14,[]` | `[200,true,[],[],"116"]` | `icon48.png` `200 true false true 1 7`, the others `… 0 0` |
| one newline appended to `lib/rules.js` | `"0.2.4",14,["lib/rules.js"]` | `[200,true,[],[],"116"]` | as the tag |
| v0.2.3 (`git archive v0.2.3 extension`), which is OLD | `"0.2.3",14,["lib/budget.js","lib/canonical.js","lib/collisions.js","lib/draft.js","lib/rules.js","lib/status.js","popup/popup.html","popup/popup.js"]` | `[200,true,["version","minimum_chrome_version"],[],"101"]` | as the tag |

S-4m and S-4b fetched the tag's files from `raw.githubusercontent.com` at
`f86f18b` in every run, with status 200. The unpacked IDs are expected there
and are not predictions. In v0.2.3, `lib/budget.js` does not exist and S-4
printed it as a mismatch without throwing.

On the tag as is, the rest ran in order:
- **S-5:** `["paused",0,"69709b56","69709b56",["hw:sync"]]`, `[]`, `[]`, and
  S-P9b's line exactly.
- **A-1 and A-1b:** the form check read as written; the draft read A-P0a's
  line with a load time, and the same line, time included, when run a
  second time on the same page. Both name fields were 293 px wide and showed
  their names whole (`scrollWidth <= clientWidth`).
- **Block G,** in the service worker after the page was closed: the line
  the Pauses section gives.
- **A-1c and A-1d:** a new page showed the list: no cards, the empty-list
  text, the footer `0 profiles · 0/0 domains granted · paused`, no marker.
  After **Add profile**: *New profile*, *Showing unsaved changes.* with
  **Revert to saved**, and the form check's four values.
- **Save,** with `chrome.permissions.request` replaced by a refusal, because
  a headless browser cannot answer the permission dialog: the profile was
  stored, one card read `probe`, `2 headers`, `Off — nothing registered`,
  and A-4's drafts block read `{}` (A-P10).
- **The A-4 and Z blocks,** against a rule of the predicted shape
  registered directly with `updateDynamicRules`, printed what A-P7 and Z-P1
  are written against. The tag's `RESOURCE_TYPES` has 15 entries.

**A stand-in for the grant.** The tag with `host_permissions` for
`*://*.hw.test/*` and `*://hw.test/*` added to its manifest, so the grant is
held without a dialog. With the container's instruments running from
`b8f0dd3` (PREFLIGHT PASSES: oracle 15/15 `c098c223e3b1`, initiator 12/12
`1e6dc8fd662c`), the whole row ran end to end: Save, the card, the toggle,
`getDynamicRules()`, and A-P6b's line exactly,
`[["req · set · X-HW-Probe → \"present\"","res · set · X-HW-Oracle → \"rewritten\""],"1 profile · 1/1 domain granted · registered 1","","On"]`.
Row B read `SAME-ORIGIN — page on hw.test:8790, target hw.test, initiator
origin (none sent — same origin).` with `x-hw-probe: "present"`; row C read
`MODIFIED — 1 changed, 0 removed, 0 added.` with `x-hw-oracle` `baseline` →
`rewritten` and the other two unchanged; row D read `CROSS-ORIGIN — page on
nothw.test:8790, target hw.test, initiator origin http://nothw.test:8790.`
with `x-hw-probe: ABSENT` and `servedBy` `hw.test`. v0.2.3 with the same
stand-in read `applying 1` in A-P6b's place.

On v0.2.3 without the stand-in, S-5, A-1b (version 2), block G, the reopen
and the restore read as on the tag.

**What this does not show.** The popup ran as a tab, so nothing here is
evidence of how a real popup closes or reopens on Chrome 154, of the
permission dialog, of Chrome's own grant, or of what Chrome does to the
manifest and the icons at install. The sitting remains the evidence.

## What each row can and cannot tell apart

| name | what it is |
| --- | --- |
| OLD | the store still serving v0.2.3 bytes, or an install that did not take the current package |
| DEV | any unpacked build, including main (whose `extension/` equals the tag's) |
| DRIFT | store bytes that differ from the tag (a pipeline defect) |
| NO-APPLY | the extension registers nothing, or Chrome ignores it |
| BROAD | the extension holds a grant covering `nothw.test` (`*://*/*`, or `nothw.test` itself) |
| NO-RES | response entries not applied |

- S-P1 fails on DEV. S-P3 fails on OLD. S-P4 fails on OLD (eight code
  files differ from v0.2.3, one of them absent there) and DRIFT, but NOT on
  DEV. S-P4c fails on DRIFT in an icon. S-P4m's first list fails on DRIFT in
  the manifest and on OLD (`version` and `minimum_chrome_version`), and
  S-P4f on OLD (`"101"`). A-P6 and A-P6b fail on OLD (`applying 1`).
- B fails on NO-APPLY, and it is the only row that tells NO-APPLY apart from
  a correct D.
- C fails on NO-APPLY and NO-RES.
- D fails on BROAD.

## Pauses (M8)

- **The sitting can pause** before S-1; between S-1 and S-2; after S-5;
  after A-4; between rows B, C and D; and before the close-out. Chrome may
  be left running or not.
- **After any pause, before the next step:** `node test/preflight.mjs` again
  (the same two pids and builds), and `chrome://version` in `hw-gate0-v024`
  (M3).
- **It cannot pause from A-1's first keystroke to Allow at A-P1**, about ten
  minutes. The draft lives in session storage, and a Chrome relaunch clears
  it. This stretch is announced before it starts.
- **If a gap falls inside it anyway:**
  - **Before A-1c** (the popup still open and inspected): run A-1b's block
    again. The same `performance.timeOrigin` and the same draft mean the
    same page, with the session intact. Go on.
  - **From A-1c to Save** (the popup reopened and not inspected): close the
    popup by clicking on the page. Open the service worker's console
    (`chrome://extensions` → the HeaderWright card → **service worker**),
    and run block G:

    ```js
    const g = (await chrome.storage.session.get("hw:drafts"))["hw:drafts"] ?? {};
    JSON.stringify([Object.keys(g), g.new?.version ?? null, g.new?.name ?? null, g.new?.domains ?? null, (g.new?.rows ?? []).map(r => [r.name, r.side, r.operation, r.value])]);
    ```

    It must read
    `[["new"],2,"probe","hw.test",[["X-HW-Probe","request","set","present"],["X-HW-Oracle","response","set","rewritten"]]]`.
    Close that DevTools window, then go on from A-1c's reopen. If it reads
    anything else, stop for a ruling.

## Before Chrome

- [ ] In `~/headerwright`: `git fetch origin && git log --oneline -2 origin/main`
      → the top line is this file's commit, and the second is `b8f0dd3`.
      Then `git pull --ff-only`, and `git rev-parse HEAD` equals
      `origin/main`.
- [ ] `node test/verify.mjs` → the line `tree: 668 checks, 239 mutation
      scenarios, 7 gates`, and a line beginning `ALL AUTOMATED GATES PASS`.
- [ ] `lsof -nP -iTCP:8787 -iTCP:8790 -sTCP:LISTEN` → no output, exit 1. If
      either port is held, stop that process first (FINDING-037: a running
      server never sees a pull), checking its command line before `kill`.
- [ ] **Start both instruments in the background from `~/headerwright`**
      (L2): `nohup node test/oracle/server.mjs 8787` with its output in
      `~/hw-gate0d-logs/oracle.log`, and `nohup node
      test/initiator/server.mjs 8790` with its output in
      `~/hw-gate0d-logs/initiator.log`. Record both pids.
- [ ] `node test/preflight.mjs` → **PREFLIGHT PASSES**: oracle 15/15, build
      `c098c223e3b1`; initiator 12/12, build `1e6dc8fd662c`; `hw.test:8787`,
      `hw.test:8790` and `nothw.test:8790` resolve to those processes; its
      extension line names `0.2.4`. A red preflight means Chrome does not
      open.

## In Chrome, before any row

**S-1. Make the clean profile.** Chrome's profile menu → **Add** →
**Continue without an account**. Name it `hw-gate0-v024`. In the new window,
open `chrome://version` and record the first line and **Profile Path**. **If
the major version is not 154, stop** (M3). A build other than
`154.0.8037.98` is recorded and the sitting continues. Open
`chrome://extensions` and record every extension listed, verbatim. **If
Google Docs Offline is listed, remove it** (its card → **Remove** →
confirm), and record the time. Record the list again afterwards.

**Preconditions. If any fails, stop and record it.**

- **PC1.** The window's profile is `hw-gate0-v024`, and it is signed out.
- **PC2.** After S-1, `chrome://extensions` lists no user-installed
  extensions. Anything still listed is recorded with its name and ID, and
  the sitting stops for a ruling.

**S-2. Install from the public listing.** Open
`https://chromewebstore.google.com/detail/ooapgilielelobkkcdlnkenkflbnnmhi`.
Record the Version, Updated and Size lines the listing shows. Click **Add to
Chrome**, and record the install dialog's text verbatim. **Read the dialog
before confirming.** Then confirm.

| # | prediction | confidence |
| --- | --- | --- |
| S-P0 | listing: Version `0.2.4`; Updated October 13, 2026; Size `98.69KiB` (= 101,059 bytes, the v0.2.4 draft CRX's size, and as read on 2026-10-13); the dialog reads `Add "HeaderWright — Modify HTTP Headers"?` with no permission warnings | high; recorded, not counted |

**S-3. Read the card.** On `chrome://extensions`, switch **Developer mode**
ON. On the HeaderWright card, record the name, the version and the ID. Open
**Details** and record **Site access** verbatim. Check that **Pin to
toolbar** is ON (Chrome 154 pins a new extension by itself); if it is not,
switch it on, so the badge is visible.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| S-P1 | ID → `ooapgilielelobkkcdlnkenkflbnnmhi` | DEV | high |
| S-P2 | name → `HeaderWright — Modify HTTP Headers` | DEV (only if its manifest name differs) | high |
| S-P3 | version → `0.2.4` | OLD | high |
| S-P5 | Site access does NOT read "On all sites" (v0.2.3 on Chrome 154 read *This extension can read and change your data on sites. You can control which sites the extension can access.*, with *Automatically allow access on the following sites* ON and no sites listed) | BROAD | high |

**S-4. Build identity by bytes, from inside the extension.** Click the
toolbar icon to open the popup. Right-click inside it → **Inspect**. **Check
the DevTools title bar ends in `kenkflbnnmhi/popup/popup.html` before
trusting any reading** (Chrome elides the middle of the ID; S-4's first
element prints it in full). Console, one block:

```js
const want = {
  "background/sw.js": "2513b163157abf703e2d9fbe4dbdc8b62cefdc865b82587457330bd25edf1797",
  "lib/budget.js": "1f0fcf61013d1c566d94eb3cc46485ace4697f26fe8feee87b0c82bfa348ec2b",
  "lib/canonical.js": "9221943c2fdf828c1fa5357f7281aaabec048c343afed5cb4cba91ea5d1e338a",
  "lib/collisions.js": "c522b5fa763273dcd717dc3e0b12e0e5575fc74188e446595624fa56824a4c78",
  "lib/draft.js": "14cbde777a31f0d4e76f3130147ef369b0635d284d9aeb6f4b22146bbc2be1e5",
  "lib/grants.js": "851bfc7ce75f117c7badd8566727a6150cb97c34d350757ceaeb61a6b08c7101",
  "lib/profile.js": "7b72856b505832db6839edaa391722b617a29dd40e6c3be043e2c6987482a8b3",
  "lib/queue.js": "4a1795b42311c769305c680de6df60ce449658f3b96571a0fea4ef0e5b1c10b2",
  "lib/readback.js": "980633498ebf326cd99a8e156267439af4289806791d41285aa6db84d56e809b",
  "lib/rules.js": "04ca98c2380e4d934ccc586b4087ecf42e017018da2b24bafa76907a5a6b2fd2",
  "lib/status.js": "9bf7540b6aea81b5819aa5381b29185caa1cbbaa49930353125fe881c3aa3c91",
  "lib/stored.js": "c60bd3db57349090fbd33522d00682fb00b947fe9b8202c01c0e3104716b3e5d",
  "popup/popup.html": "692c7de2aa08d02ff80e5630ed04550a923d49f28b3c3ed4cb847c62bee79978",
  "popup/popup.js": "5cce034431157fe5d92a03b5f9531b932ca8f239b31be6f7e91d67ec2d37caa5"
};
const got = {};
for (const p of Object.keys(want)) {
  try {
    const res = await fetch(chrome.runtime.getURL(p));
    got[p] = res.ok ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", await res.arrayBuffer()))].map(x => x.toString(16).padStart(2, "0")).join("") : "MISSING";
  } catch {
    got[p] = "MISSING";
  }
}
JSON.stringify([chrome.runtime.id, chrome.runtime.getManifest().version, Object.keys(got).length, Object.keys(want).filter(p => got[p] !== want[p])]);
```

The fourteen hashes are the tag's non-image, non-manifest files, from
NEXT.md's v0.2.4 release artifacts, re-checked against `git archive v0.2.4
extension`. The manifest is S-4m's and the icons are S-4b's.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| S-P4 | `["ooapgilielelobkkcdlnkenkflbnnmhi","0.2.4",14,[]]` | OLD, DRIFT | high |

**Run the block once.** To run it again, close and reopen the popup and
inspect it again. **If the fourth element is not `[]`, stop.** The bytes
Chrome runs are not the tag's, and every row below would test something
unknown.

**S-4m. The installed manifest, by content.** Same console, one block. It
fetches the tag's `manifest.json` from GitHub at `f86f18b`, checks its bytes
against the tag's hash, and compares it key by key with what Chrome reports:

```js
const MTAG = "f86f18b4bbb0f16aa2af4e70601afe754e7c2b20";
const mres = await fetch(`https://raw.githubusercontent.com/antrixy/headerwright/${MTAG}/extension/manifest.json`, { cache: "no-store" });
const mbytes = await mres.arrayBuffer();
const mhash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", mbytes))].map(x => x.toString(16).padStart(2, "0")).join("");
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const mtag = JSON.parse(new TextDecoder().decode(mbytes));
const minst = chrome.runtime.getManifest();
JSON.stringify([mres.status, mhash === "bc2eeb594478bf803daba84928abae70d7cb1ea0cdb92ae4b60e61c071d900b2", Object.keys(mtag).filter(k => !same(minst[k], mtag[k])), Object.keys(minst).filter(k => !(k in mtag)).sort(), minst.minimum_chrome_version ?? null]);
```

The line reads: GitHub's HTTP status, the fetched bytes match the tag's
hash, the tag's keys whose installed value differs, the installed keys the
tag does not have, and the installed `minimum_chrome_version`.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| S-P4m | the first three → `200,true,[]`: every key of the tag's manifest has the same value in the installed one, permissions and `minimum_chrome_version` included | OLD, DRIFT in the manifest | high; recorded, not counted |
| S-P4n | the fourth → `["key","update_url"]`: the store adds `update_url` and Chrome adds `key` at install (both seen in GATE-0c) | — | high; recorded, not counted |
| S-P4f | the fifth → `"116"` (S5-D4) | OLD (v0.2.3 reads `"101"`) | high; recorded, not counted |

**If the first is not 200 or the second is not `true`, S-P4m is NOT RUN**,
not failed: the reference was not the tag's. Record it and go on to S-4b.
**If the third element is not `[]`, stop for a ruling.**

**S-4b. Build identity of the icons, by pixels.** Same console, one block.
It fetches the tag's four icons from GitHub at `f86f18b`, checks their bytes
against the tag's hashes, and compares them pixel by pixel with the
installed icons:

```js
const TAG = "f86f18b4bbb0f16aa2af4e70601afe754e7c2b20";
const icons = {
  "icons/icon16.png": "21d306174ccdc81483a0b0ceefec1a20e9f829a43119b24ed76f054978f6f0c5",
  "icons/icon32.png": "1bd281347760ed4cbd9a79b5938b7fbfc7f43b260427d8043983979d4a82301b",
  "icons/icon48.png": "291b700b61d1f32297f6a309f4c62cd27ba644d3dc8acd30cb980225d9001fa7",
  "icons/icon128.png": "854432c73861dd49b5bb73b5b88fb397122e0465baf670126200dc607c7dbf7f"
};
const sha = async b => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map(x => x.toString(16).padStart(2, "0")).join("");
const pixels = async b => {
  const bm = await createImageBitmap(new Blob([b], { type: "image/png" }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const c = new OffscreenCanvas(bm.width, bm.height);
  const g = c.getContext("2d");
  g.drawImage(bm, 0, 0);
  return g.getImageData(0, 0, bm.width, bm.height);
};
const rows = [];
for (const [p, h] of Object.entries(icons)) {
  const r = await fetch(`https://raw.githubusercontent.com/antrixy/headerwright/${TAG}/extension/${p}`, { cache: "no-store" });
  const tagBytes = await r.arrayBuffer();
  const instBytes = await (await fetch(chrome.runtime.getURL(p))).arrayBuffer();
  const a = await pixels(tagBytes), b = await pixels(instBytes);
  const sameSize = a.width === b.width && a.height === b.height;
  let differing = 0, maxDelta = 0;
  if (sameSize) for (let i = 0; i < a.data.length; i += 4) {
    let d = 0;
    for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a.data[i + k] - b.data[i + k]));
    if (d) differing++;
    maxDelta = Math.max(maxDelta, d);
  }
  rows.push([p, r.status, (await sha(tagBytes)) === h, (await sha(instBytes)) === h, sameSize, differing, maxDelta]);
}
rows.map(r => r.join(" ")).join(" | ");
```

Each part reads: path, GitHub's HTTP status, the fetched tag bytes match the
tag's hash, the INSTALLED bytes match the tag's hash, sizes equal, differing
pixels, the largest channel difference.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| S-P4c | all four parts read `<path> 200 true <either> true 0 0` | DRIFT in an icon | high |
| S-P4d | the fourth field is `false` on all four: Chrome re-encoded the icons at install, as it did for v0.2.1, v0.2.2 and v0.2.3 | — | high; recorded, not counted |

**If the second field is not 200 or the third is not `true`, S-P4c is NOT
RUN**, not failed: the reference was not the tag's. Record it and stop for a
ruling. **If any part shows a non-zero differing-pixel count, stop.**

**S-5. Starting state, no mutation.** Same console, each block on its own:

```js
const s = (await chrome.storage.local.get(null))["hw:sync"];
JSON.stringify([s?.state, s?.activeRuleCount, s?.desiredRevision, s?.appliedRevision, Object.keys(await chrome.storage.local.get(null))]);
```

```js
JSON.stringify((await chrome.permissions.getAll()).origins);
```

```js
JSON.stringify(await chrome.declarativeNetRequest.getDynamicRules());
```

```js
JSON.stringify([document.querySelectorAll("#profile-list .profile").length, document.getElementById("empty").classList.contains("hidden") ? null : document.getElementById("empty").textContent.trim(), document.getElementById("status-line").textContent, document.getElementById("status-line").title, document.getElementById("toggle-state").textContent]);
```

Read the popup's footer line, the empty-list text and the badge by eye too.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| S-P6 | `["paused",0,"69709b56","69709b56",["hw:sync"]]`: storage holds `hw:sync` only, state `paused`, no active rules | — | high |
| S-P6b | both revisions are `69709b56` (also v0.2.3's, so this does not fail on OLD) | — | high; recorded, not counted |
| S-P7 | origins → `[]` | — | high |
| S-P8 | rules → `[]` | — | high |
| S-P9 | no cards; *No profiles yet. Add one to start setting headers on a site.*; footer `0 profiles · 0/0 domains granted · paused`; toggle label `OFF`; badge `OFF` | — | high |
| S-P9b | the fourth block → `[0,"No profiles yet. Add one to start setting headers on a site.","0 profiles · 0/0 domains granted · paused","","Off"]` (the label's text is `Off`; CSS shows it as `OFF`) | — | high; recorded, not counted |

**Close the popup:** close its DevTools, then click on the page.

## Row A — save, grant, apply

**From A-1's first keystroke to Allow at A-P1, the sitting cannot pause**
(M8). About ten minutes.

**A-1. Fill the form.** Open the popup. **Add profile**. Name `probe`,
domains `hw.test`. Header row 1: side `request`, operation `set`, name
`X-HW-Probe`, value `present`. **+ Add header**. Row 2: side `response`,
operation `set`, name `X-HW-Oracle`, value `rewritten`.

**Check the form.** Read it from the popup's console, not by eye.
Right-click → **Inspect**, check the title bar ID, and run:

```js
JSON.stringify([document.getElementById("f-name").value, document.getElementById("f-domains").value, ...[...document.querySelectorAll("#header-rows .hrow")].map(r => [r.querySelector(".h-name").value, r.querySelector(".h-side").value, r.querySelector(".h-op").value, r.querySelector(".h-value").value])]);
```

It must read
`["probe","hw.test",["X-HW-Probe","request","set","present"],["X-HW-Oracle","response","set","rewritten"]]`.
This is a check on the form, not a prediction: if it differs, fix the form
and run it again.

**A-1b. Read the stored draft** (Q1), same console:

```js
const dr = (await chrome.storage.session.get("hw:drafts"))["hw:drafts"] ?? {};
JSON.stringify([Object.keys(dr), dr.new?.version ?? null, dr.new?.editingProfileId ?? null, dr.new?.baseDigest ?? null, dr.new?.name ?? null, dr.new?.domains ?? null, (dr.new?.rows ?? []).map(r => [r.name, r.side, r.operation, r.value]), performance.timeOrigin]);
```

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| A-P0a | `[["new"],2,null,null,"probe","hw.test",[["X-HW-Probe","request","set","present"],["X-HW-Oracle","response","set","rewritten"]],<t>]`: one draft, under `new`, version 2, holding the form as checked; `<t>` is this page's load time, recorded | — (v0.2.3 also writes version 2) | high; recorded, not counted |

**If the second to seventh elements do not match the form check, stop for a
ruling:** the draft is what A-1d restores, and nothing after this can read
the form from a console.

**A-1c. Close and reopen** (Q1). Close the popup's DevTools. Look at the
popup. Then click on the page to close it, and reopen it from the toolbar
icon. **Do not inspect it.**

| # | prediction | confidence |
| --- | --- | --- |
| A-P0b | with DevTools closed, the popup is still open, showing the form (Chrome 154: Sitting K, GATE-0c) | high; recorded, not counted |
| A-P0c | the reopened popup shows the list, not the editor: no cards, *No profiles yet. Add one to start setting headers on a site.*, footer `0 profiles · 0/0 domains granted · paused`, and no *Unsaved changes* marker anywhere | high; recorded, not counted |

**A-1d. Restore and save.** Press **Add profile**. Read the editor by eye.

| # | prediction | confidence |
| --- | --- | --- |
| A-P0d | the editor is titled *New profile* and shows *Showing unsaved changes.* with a **Revert to saved** button; name `probe`, domains `hw.test`; two header rows, each on two lines: `X-HW-Probe` shown whole above `request` / `set` / `present`, and `X-HW-Oracle` shown whole above `response` / `set` / `rewritten` | high; recorded, not counted |

**If the editor opens blank, or any visible field differs, stop for a
ruling.** Do not retype. **Type nothing in the form.** Then click **Save
profile** once, with the mouse.

| # | prediction | confidence |
| --- | --- | --- |
| A-P1 | Chrome's permission dialog opens, naming `hw.test` (v0.2.1 to v0.2.3: *"HeaderWright — Modify HTTP Headers" has requested additional permissions. It could: Read and change your data on all hw.test sites and hw.test*), and the popup closes | high |

**Read the dialog before clicking.** Then click **Allow**.

**A-2.** Reopen the popup. Read the card, the footer and the badge.

| # | prediction | confidence |
| --- | --- | --- |
| A-P2 | one card, `probe`, `2 headers`, with a green `hw.test` chip; the card reads `Off — nothing registered` and shows no lines and no *Unsaved changes* marker | high |
| A-P3 | footer → `1 profile · 1/1 domain granted · paused`; badge `OFF` | high |

**A-3. Apply.** Switch the master toggle ON. Do not reopen the popup.

| # | prediction | confidence |
| --- | --- | --- |
| A-P4 | toggle label `ON`; badge `ON` | high |
| A-P5 | the card shows exactly two lines, in this order: `req · set · X-HW-Probe → "present"` then `res · set · X-HW-Oracle → "rewritten"` | high |
| A-P6 | footer → `1 profile · 1/1 domain granted · registered 1` (UI-04; GATE-0c's read `applying 1`) | high |

**A-4. Console truth.** Right-click the popup → **Inspect**, check the
title bar ID, and run each block on its own:

```js
const [r] = await chrome.declarativeNetRequest.getDynamicRules();
JSON.stringify([(await chrome.declarativeNetRequest.getDynamicRules()).length, r.id, r.priority, r.condition.requestDomains, r.condition.resourceTypes.length, r.action.type]);
```

```js
JSON.stringify([r.action.requestHeaders, r.action.responseHeaders]);
```

```js
JSON.stringify((await chrome.permissions.getAll()).origins);
```

```js
JSON.stringify((await chrome.storage.session.get("hw:drafts"))["hw:drafts"] ?? null);
```

```js
JSON.stringify([[...document.querySelectorAll("#profile-list .readback-line")].map(e => e.textContent), document.getElementById("status-line").textContent, document.getElementById("status-line").title, document.getElementById("toggle-state").textContent]);
```

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| A-P7 | `[1,1,1,["hw.test"],15,"modifyHeaders"]`, then `[[{"header":"X-HW-Probe","operation":"set","value":"present"}],[{"header":"X-HW-Oracle","operation":"set","value":"rewritten"}]]` (key order inside each entry is not predicted) | DRIFT, NO-APPLY | high |
| A-P8 | origins → exactly `*://*.hw.test/*` and `*://hw.test/*`, in either order | BROAD | high |
| A-P9 | the card lines (A-P5) and A-P7 agree entry for entry | — | high |
| A-P10 | drafts → `{}`: Save dropped the `new` draft | — | high; recorded, not counted |
| A-P6b | the fifth block → `[["req · set · X-HW-Probe → \"present\"","res · set · X-HW-Oracle → \"rewritten\""],"1 profile · 1/1 domain granted · registered 1","","On"]`: A-P5's lines and A-P6's footer by their bytes, no hover text | OLD (`applying 1`) | high; recorded, not counted |

**This is the row's "one readback line".** A-P5 and A-P9 carry it.

**Close the popup:** close its DevTools, then click on the page.

## Row B — request wire case, same-origin (the control, FIRST)

Open a tab at `http://hw.test:8790/`. Press **Measure**.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| B-P1 | verdict `SAME-ORIGIN — page on hw.test:8790, target hw.test, …`; `x-hw-probe` → `"present"` | NO-APPLY | high |
| B-P2 | `x-hw-second` and `authorization` ABSENT | — | high |

**If B-P1 fails, stop.** Row D is then uninterpretable. Record the verdict box
verbatim.

## Row C — response wire case

Open a tab at `http://hw.test:8787/`, not `127.0.0.1`. **Precondition:**
DevTools → Application → Service workers shows no registration for this
origin (it cannot in a clean profile; record that it was checked). Press
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
JSON.stringify((await chrome.permissions.getAll()).origins);
```

Expect A-P8's two origins and nothing else. If `nothw.test` or `*://*/*`
appears, stop: the row cannot be run. **Close the popup:** close its
DevTools, then click on the page.

**D-2.** Open a tab at `http://nothw.test:8790/`. Press **Measure**.

| # | prediction | fails on | confidence |
| --- | --- | --- | --- |
| D-P1 | the fetch succeeds: the verdict box is not `MEASUREMENT FAILED`, and the body reports `servedBy` `hw.test` | — (an instrument check) | high |
| D-P2 | verdict `CROSS-ORIGIN — page on nothw.test:8790, target hw.test, initiator origin http://nothw.test:8790` | — | high |
| D-P3 | **`x-hw-probe` ABSENT**, and `allReceivedNames` has no `x-hw-probe` | BROAD | high: HW-V6-01, unpacked 2026-09-19, store v0.2.1 2026-09-27, v0.2.2 2026-09-28 and v0.2.3 2026-10-05 |

A failed fetch makes D-P3 NOT RUN, whatever the page shows.

## Close-out

Open the popup, right-click → **Inspect**, check the title bar ID, and run
each block on its own:

```js
const rules = await chrome.declarativeNetRequest.getDynamicRules();
JSON.stringify([rules.length, rules[0].id, [rules[0].action.requestHeaders, rules[0].action.responseHeaders]]);
```

```js
JSON.stringify((await chrome.permissions.getAll()).origins);
```

| # | prediction | confidence |
| --- | --- | --- |
| Z-P1 | `[1,1,…]` with A-P7's two entries, and A-P8's origins: nothing in rows B–D wrote anything | high |

If the console clips the first line, widen DevTools and read it again; do
not rerun the block in the same console.

Leave the profile as it is. M2 deletes it after the evidence commit is
pushed and read back. Stop both instruments: for each recorded pid, read
its command line (`ps -p <pid> -o pid=,command=`), and `kill` it only if it
is that instrument. Then `lsof` as before → no output.

## What moves in `LEDGER.md`

**GATE-0d → `verified`** if all of these hold: S-P1, S-P3, S-P4, S-P4c,
S-P5, A-P1, A-P5, A-P7, A-P8, A-P9, B-P1, C-P1, C-P2, D-P1, D-P3. The row's
five clauses each have a counted prediction: clean profile and store install
(PC1, PC2, S-P1), id and version (S-P1, S-P3, S-P4), save / grant / apply
with one readback line (A-P1, A-P5, A-P7, A-P8, A-P9), the two wire cases
(B-P1, C-P1, C-P2), the negative control (D-P1, D-P3).

- The evidence column becomes `reproduced`. The decision cell names this
  file and the Chrome version.
- S-P0, S-P2, S-P4m, S-P4n, S-P4f, S-P4d, S-P6 to S-P9b, A-P0a to A-P0d,
  A-P2 to A-P4, A-P6, A-P6b, A-P10, B-P2, D-P2 and Z-P1 are recorded, and
  not counted. A miss among them is a finding about the prediction or the
  popup, not about the store pipeline.
- GATE-0, GATE-0b and GATE-0c stay `verified` at `v0.2.1`, `v0.2.2` and
  `v0.2.3`, untouched. A GATE-0d pass on v0.2.4 says nothing about v0.3.0,
  which needs its own row.

## Outcomes

*Recorded here during the sitting, one entry per prediction id. Nothing above
this heading is edited after commit.*
