# PREDICTIONS — s5 code: v0.2.4, compatibility and truth language — 2026-10-09

> **FROZEN ON COMMIT.** Written against `4d087f23d7fe6a52370e8c7d60b069a3c157911b`
> before any line of the change exists, test or product. Nothing below may be
> edited after the code runs. Outcomes are recorded UNDER each prediction, and
> a wrong prediction keeps its original wording.
>
> Rulings: S5-D1–D14, ruled by Ash on 2026-10-06 at 12:47 CT (17:47 UTC), "as
> recommended", and confirmed in the same words on 2026-10-09 at 16:11 CT
> (21:11 UTC), before this file was written. S5-D3 was ruled first, at 10:13
> CT (15:13 UTC). §1 records them, with the copy they fix word for word. They
> go into `antrixy/project-planning` `decisions.md` in the commit after this
> one. One ruling is still open, S5-D15, and is due before commit 4 (§1). No
> version bump, no tag, no packaging, no store upload, no listing edit, no
> browser sitting and no launch activity in this session.

## 0. Baseline, measured before this file was written

**Inputs**, SHA-pinned archives attached 2026-10-06, each checked before
anything was read:

- headerwright: archive sha256
  `b53cf3eb8340b805ecdbb437372fd16f8d58dbe9d3406d42bd1598a2b0869991`
  (516,840 bytes). Embedded commit `4d087f23d7fe6a52370e8c7d60b069a3c157911b`,
  tree `03e45dc9246895973aabf9afc311cbdf6862011d` (67 files), `LEDGER.md`
  sha256 `f9484207dde4466dfea923d4583e04d2126951bae4b49c5fa0cd466258b0115a`.
  All match the pinned values.
- project-planning: archive sha256
  `a315cc9fff9364123aeb6081b647117b18ea82c904b83354f72a650d02205cac`
  (1,428,140 bytes). Embedded commit `460c4d1ce5e7f22420fe8fccf7d84286e55dc909`,
  tree `bbeddb7de7197c04c697f3ebe92c07564a94e45d` (80 files),
  `handoffs/headerwright/NEXT.md` sha256
  `57d4543a99f3517dc7a6b079fb6e726679486aba9283205acfd5f5f198adfff5`,
  `decisions.md` sha256
  `19e63d16402607731a05a3d393a50d9f9ede1b269fc167e32db56434d1c3592e`. All
  match.
- Over git, read again on 2026-10-09: `main` is still `4d087f2`. Tag `v0.2.2`
  is annotated `2bc75de` and peels to `2ee97ae`; `v0.2.3` is annotated
  `ff0f68e` and peels to `0faede2`. `main`'s `extension/` is tree `6fc9adc`,
  the same as `v0.2.3`'s.

**Gates.** `node test/verify.mjs` at `4d087f2`, in a fresh clone: all 7 gates
pass, 606 checks, 171 mutation scenarios, the syntax gate over 24 files, in
2 minutes 0 seconds (container: Node 22.22.0, Python 3.13.16). One selftest
run takes 0.65 s.

**The browser used below** is headless Chromium `141.0.7390.37` (Playwright's
build), loading a copy of `extension/` unpacked. Where a run needed host
access, the copy's manifest also carries `host_permissions` for
`*://localhost/*` and `*://*.localhost/*`, so Save asks for nothing; the
product code is unchanged. Probes run against a local server. The probes are
container scratch, not committed; their outputs are quoted here.

### Where Chrome first accepts what the extension uses (AR-11, AR-23)

Read from Chromium's source at release tags (`raw.githubusercontent.com`,
`chromium/chromium/<tag>/…`), 2026-10-06 and again 2026-10-09:

| What | Absent at | Present at | File |
| --- | --- | --- | --- |
| rule condition `requestDomains` | `101.0.4897.0` | `101.0.4951.41` | `extensions/common/api/declarative_net_request.idl` |
| manifest key `optional_host_permissions` | `101.0.4951.74`, `102.0.4952.0` | `102.0.5005.61` | `extensions/common/api/_manifest_features.json` |
| request-header `append`, any name | `107.0.5304.150`, `108.0.5359.40` (`ERROR_APPEND_REQUEST_HEADER_UNSUPPORTED` for every request header) | `108.0.5359.50`, for a 20-name allowlist | `extensions/browser/api/declarative_net_request/indexed_rule.cc`, `constants.h` |
| `user-agent` in that allowlist | `116.0.5791.0` (20 names) | `116.0.5845.0` (21 names, the product's list exactly) | `constants.h` |
| an appended name in any letter case | `143.0.7445.0` (compared as written) | `143.0.7499.0` (lowercased first, `base::ToLowerASCII`) | `indexed_rule.cc` |

- Every 143 release-branch build read (`7499.0`, `.1`, `.40`, `.205`) has the
  lowercase comparison; `142.0.7444.273`, the last 142 tag, does not. From
  108 through 142, a request `append` registers only if its name is spelled
  exactly as Chrome's allowlist spells it, in lowercase.
- `chrome.storage.session`: Chrome's reference marks it "Chrome 102+"
  (`chrome-docs`). Chromium's sources already define it at `100.0.4896.242`
  and `101.0.4951.41` (`_api_features.json`, `storage.json`), so 102 is the
  documented number, not a boundary read here.
- Storage quotas, from `extensions/common/api/storage.json`: `local` is
  5,242,880 bytes at `114.0.5673.0` and 10,485,760 at `114.0.5735.90`;
  `session` is 1,048,576 at `112.0.5564.0` and 10,485,760 at `112.0.5615.49`.
  At a 116 floor both areas hold 10,485,760 bytes. Chromium 141 reports the
  same, through `QUOTA_BYTES` on both areas.
- Everything else the extension uses is defined at `101.0.4951.41`, the
  lowest tag read: its fourteen other `chrome.*` paths (`chrome.action` badge
  calls, `chrome.declarativeNetRequest.getDynamicRules` and
  `updateDynamicRules`, six `chrome.permissions` members, two
  `chrome.runtime` events, `chrome.storage.local` and `onChanged`), its eleven
  other manifest keys (`background.type` through the background handler, the
  rest through `_manifest_features.json`), both permissions, all fifteen
  resource types, `modifyHeaders`, and request and response `set` and
  `remove`. When each first appeared was not established.
- Headless Chromium 141 starts the worker of a copy whose manifest asks for
  116 or 141, and not one asking for 142 or 143 (2026-10-09), so the
  container could not run a 143 floor. 116 keeps the container runs below
  possible.

**AR-23, reproduced on the unchanged product in Chromium 141** (2026-10-09).
One profile setting `X-Debug: 1` on `localhost`, then a second profile
appending `X-Forwarded-For: 203.0.113.7`, typed with capitals as the field's
placeholder invites:

| Step | Footer | Badge | `hw:sync` | Wire (server saw) |
| --- | --- | --- | --- | --- |
| set `X-Debug` | `1 profile · 1/1 domain granted · applying 1` | `ON` | applied, 1 | `x-debug: 1` |
| add the append | `2 profiles · 1/1 domain granted · sync failed — previous rules may still be applying` | `!` | failed | `x-debug: 1` |
| change the OTHER profile's header to `X-Debug-Two` | the same | `!` | failed | `x-debug: 1` |
| retype the append's name as `x-forwarded-for` | `2 profiles · 1/1 domain granted · applying 2` | `ON` | applied, 2 | `x-forwarded-for: 203.0.113.7`, `x-debug-two: 1` |

The footer's hover text named Chrome's error: "Rule with id 2 specifies an
invalid request header to be appended. Only standard HTTP request headers that
can specify multiple values for a single entry are supported." The append's
card read *No rule registered for this profile*. The other card kept its old
line under *Last registration failed — this is the rule still registered*:
one append typed with capitals stops every later change from registering.
The card shows a `set` name as typed (`req · set · X-Debug → "1"`) while the
wire carries it in lowercase.

**FINDING-036's order rule with mixed spellings**, same setup (2026-10-09):
`set X-Forwarded-For alpha`, then `append x-forwarded-for bravo`, in one
profile, gave `x-forwarded-for: alpha, bravo` on the wire; `append forwarded
bravo`, then `set Forwarded alpha`, gave `forwarded: bravo`. Chrome treats the
two spellings as one header, so sending an append's name in lowercase does
not change README's table.

### Storage (DR-02)

**Chrome's count for `chrome.storage.local`**, read with `getBytesInUse` in
Chromium 141 (2026-10-09). A scratch copy of the rule reproduced every
fixture exactly. The rule: the key's UTF-8 bytes, plus the bytes of the
value written as JSON with no whitespace, in which `"`, `\`, backspace, form
feed, newline, carriage return and tab take two bytes; `<`, U+2028, U+2029
and every other code point below U+0020 take six (`\uXXXX`); a lone
surrogate takes three (U+FFFD); everything else takes its UTF-8 length.
`JSON.stringify` alone undercounts by the key, `<` and the separators.

    const small = (id = 1) => ({ id, name: "p", domains: ["a.com"],
      headers: [{ name: "X-A", operation: "set", value: "1" }] });
    const typical = (id = 1) => ({ id, name: `Staging API ${id}`,
      domains: ["api.example.com", "example.com"],
      headers: [
        { name: "Authorization", operation: "set", value: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c" },
        { name: "X-Forwarded-For", operation: "append", value: "203.0.113.7" },
        { name: "Cookie", operation: "append", value: "session=8f14e45fceea167a5a36dedd4bea2543; theme=dark" },
        { name: "X-Debug", operation: "remove", value: "" },
        { name: "Access-Control-Allow-Origin", operation: "set", value: "https://app.example.com", side: "response" },
        { name: "Content-Security-Policy", operation: "set", value: "default-src 'self'; img-src 'self' data: https://cdn.example.com; script-src 'self' 'unsafe-inline'", side: "response" },
        { name: "Server", operation: "remove", value: "", side: "response" },
      ] });
    const one = (id, name, header, value = "v", operation = "set") =>
      ({ id, name, domains: ["a.com"], headers: [{ name: header, operation, value }] });
    const KATS = [                                      // key "hw:profiles"
      ["the empty set", [], 13],
      ["one small profile", [small()], 109],
      ["one typical profile", [typical()], 897],
      ["two profiles", [small(1), typical(2)], 994],
      ["angle brackets, quotes and backslashes",
        [one(4, "<b>x</b> \"q\" \\ & > '", "X-T", "<script>alert(\"x\")</script> \\\\ </b>")], 194],
      ["non-ASCII and astral characters",
        [one(5, "caf\u00e9 \u4e2d\u6587 \ud83d\ude00", "X-U", "na\u00efve \u2603 \ud83d\udc4d\ud83c\udffd")], 143],
      ["U+2028 and U+2029", [one(6, "line\u2028sep\u2029para", "X-S")], 131],
      ["control characters in a name",
        [one(7, "nul\u0000 soh\u0001 bs\b ff\f nl\n cr\r tab\t esc\u001b del\u007f", "X-C")], 168],
      ["lone surrogates in a name", [one(8, "lone \ud83d high and \ude00 low", "X-L")], 133],
      ["noncharacters in a name", [one(9, "bmp \uffff \ufdd0 astral \ud83f\udfff", "X-N")], 131],
      ["the largest id and a remove", [one(2147483647, "max", "X-M", "", "remove")], 122],
      ["one hundred typical profiles",
        Array.from({ length: 100 }, (_, i) => typical(i + 1)), 88696],
    ];

Per profile, beyond the 13 bytes of an empty set: small 96, typical 884, and
a heavier one (14 headers, five domains, a 1 KB cookie) 2,925. 5,000 small
profiles take 498,905 bytes; 5,000 typical ones 4,452,798, over the 4 MiB
budget below (about 4,700 typical profiles fit).

**Drafts, against `chrome.storage.session`.** Session storage charges an
estimate of memory, not JSON (Chromium 141, `getBytesInUse`, 2026-10-09):

| Drafts map | JSON bytes | Session charge |
| --- | ---: | ---: |
| one draft of the small profile | 238 | 824 |
| one draft of the typical profile | 1,076 | 2,994 |
| one draft of the heavier profile | 3,148 | 6,658 |
| a new-profile draft, one blank row | 153 | 736 |
| a new-profile draft, 100 blank rows | 5,895 | 29,248 |
| blank rows, filled to 131,072 bytes of JSON | 131,059 | 650,752 |
| one-row drafts for 544 profiles, filled to the budget | 130,889 | 448,256 |
| typical drafts for 121 profiles, filled to the budget | 130,478 | 362,274 |

The worst shape at 131,072 bytes of JSON was charged 650,752 bytes, under
even the 1,048,576-byte session quota of Chrome 111 and earlier. 131,072
bytes hold 544 small, 121 typical or 41 heavier drafts.

**A write the browser refuses is silent** (unchanged product, Chromium 141,
2026-10-09):

- *Save.* With `hw:profiles` filled to 135 bytes under the local quota, a
  new profile was saved through the form. The editor stayed open, no form
  error and no message appeared, nothing was stored, and the only trace was
  the page error `Resource::kQuotaBytes quota exceeded`.
- *Draft.* With 1,000 bytes of session storage left, `1234567` typed into a
  new profile's value was stored. 412 characters typed over it were not:
  the stored draft kept the 7 characters, nothing on screen changed, and the
  console read `HeaderWright: could not persist the draft — Error: Session
  storage quota bytes exceeded. Values were not stored.`

### Service workers (AR-17)

Chromium 141, 2026-10-09. A page on `localhost` controlled by a service
worker; one profile setting request `X-HW-Probe: present` and response
`X-HW-Oracle: rewritten` on `localhost`; the server sends
`X-HW-Oracle: baseline`.

| Where the response came from | Profile on: request header reached the server | Profile on: page read `X-HW-Oracle` |
| --- | --- | --- |
| the network (the worker does not answer) | yes | `rewritten` |
| the worker, passing the request on with `fetch()` | yes | `rewritten` |
| the worker's cache, stored while the profile was off | no request | `baseline` |
| a response the worker built itself | no request | `baseline` |
| the worker's cache, stored while the profile was on | no request | `rewritten`, and still `rewritten` after the profile was turned off |

### UI-03, the editor's header row

The live popup at 380 px in Chromium 141, today's stylesheet and then the CSS
of S5-D3 injected into the same page (2026-10-09). The inputs render in
`system-ui` 13 px: `.mono` never reaches them (UI-08 below).

| | Name field | Value field | Row pitch | `X-Forwarded-For`, `Access-Control-Allow-Origin`, `Content-Security-Policy` fit | Popup with 3 header rows | Form scrolls from |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| today | 70 px | 70 px | 35.8 px | none | 500 px | the 6th row |
| S5-D3 | 293 px | 174 px | 66.7 px (57.7 plus a 9 px gap) | all three | 592 px | the 4th row |

The footer is `ui-monospace` 11 px and wraps between 51 and 53 characters in
this container's font: `0 profiles · 0/0 domains granted · nothing to apply`
(51) takes one line and `… · nothing registered` (53) takes two, 46.9 px
instead of 30.9.

**DevTools Issues**, read through the DevTools protocol's Audits domain, not
the panel (2026-10-09): the list view raises
`FormLabelHasNeitherForNorNestedInput` (the Headers group's `<label>`), and
each header row in the editor adds four `FormEmptyIdAndNameAttributesForInputError`
issues, one per input and select; the remove button adds none. That is
AR-19's ground, not an s5 row.

### UI-04, F-045 and AR-16, at lib level and from the source

- `describeSync` on `4d087f2` (`lib/status.js` sha256
  `b1df6027560995a4a07227d4896bd03854d78fcc1b15e877bd4ae186dcdfe728`):
  `applying 1`; `nothing to apply`; `applying 2 · 1 not applied`; with two
  colliding profiles and nothing else `applying 0 · 2 not applied`, badge
  `!`; `sync failed — previous rules may still be applying`; `checking — no
  result yet for the current configuration`; `paused`.
  `configRevision([], false)` is `69709b56` and `configRevision([], true)` is
  `b17c015a`.
- **The badge's `…` is never shown.** The worker paints the badge right
  after its own sync and passes the record's own revision, so `classify`
  cannot return `stale` there. Only the popup's footer can read stale.
- **F-045.** `test/oracle/server.mjs` lines 47–52: the CORS case sends the
  three `Access-Control-*` headers and `X-HW-Oracle`, and no
  `X-HW-Removable`. `test/oracle/selfcheck.mjs` has 13 rows. `SMOKE.md` row
  15.5 expects `1 changed, 0 removed` and marks the remove NOT OBSERVABLE.
- **AR-16.** `serializeProfiles` exports three sets that `parseProfilesFile`
  then refuses: a colliding pair ("Alpha" and "Beta" both write header
  "x-h" on overlapping domains…), two profiles sharing id 1 ("profile 2:
  duplicate id 1"), and 5,001 profiles ("this file has 5001 profiles…").
  Exactly 5,000 export and re-import. Exporting 5,000 profiles takes 98 ms
  and importing them 50 ms.

**Hashes at `4d087f2` of the files s5 changes**, for the outcomes:
`manifest.json` `7ec092cd…`, `lib/status.js` `b1df6027…`, `lib/rules.js`
`5b8754c6…`, `lib/canonical.js` `9183f682…`, `lib/collisions.js` `8120cf52…`,
`lib/draft.js` `ba6bd650…`, `popup/popup.js` `ca079b01…`, `popup/popup.html`
`5078d3ac…`, `README.md` `068f9d24…`, `PRIVACY.md` `bf20e9f1…`,
`test/SMOKE.md` `ca31f4fa…`, `test/oracle/server.mjs` `cb3f9510…`,
`test/oracle/selfcheck.mjs` `9e834728…`, `test/selftest.mjs` `4eae4913…`.

## 1. Rulings, as ruled

- **S5-D1, AR-16 and DR-01b.** AR-16 is decided as a portable config, and
  lands as s5's last product commit: Export refuses any set Import would
  refuse (a collision, a duplicated id, more than 5,000 profiles); Import is
  unchanged; there is no second artifact. DR-01b closes with v0.2.4. AR-16
  moves to `v0.2.4` with its `DECIDE:` replaced. "Decisions blocking rows"
  is corrected in the same commit: AR-16 out, FEAT-3 in. Rejected: a rescue
  backup, and two named artifacts.
- **S5-D2, DR-02's numbers.** `hw:profiles` gets a budget of 4,194,304
  bytes, counted as Chrome counts it (§0). `hw:drafts` gets 131,072 bytes of
  the drafts map's JSON. A write that does not make `hw:profiles` larger is
  never refused, so there is always a way back under the budget. Save
  refuses in the form error. Import refuses when the file is chosen, and
  again at Replace. An over-budget draft is not written, the stored one
  stays, and the editor shows a notice, also when the browser refuses the
  write. DR-02 stays its own row; AR-15 gains a cross-reference. Counted as
  a fix.
- **S5-D3, UI-03.** The two-line compact row, CSS in `popup.html` only, and
  `popup.js` untouched:

      .hrow {
        grid-template-columns: 56px 82px 1fr 24px;
        grid-template-areas: "name name name remove" "side op value value";
        gap: 4px 5px; margin-bottom: 9px;
      }
      .hrow .h-name { grid-area: name; }
      .hrow .h-side { grid-area: side; }
      .hrow .h-op { grid-area: op; }
      .hrow .h-value { grid-area: value; }
      .hrow .remove-row { grid-area: remove; }
      .hrow input[type="text"], .hrow select, .hrow .h-side { padding-top: 3px; padding-bottom: 3px; }

  Stated with the full list of rulings: with a two-line footer, three header
  rows are 8 px over the 600 px popup, and the form scrolls by that much.
- **S5-D4, AR-11 (option B).** The manifest floor becomes **116**. An
  appended header's name is sent in lowercase: new row **AR-23**, landing
  with AR-11. The pinned floor check becomes derived from a registry of
  platform requirements, each with its Chrome version and source; the floor
  is the highest requirement in use, the manifest must equal it, and any
  unregistered `chrome.*` API, manifest key or permission fails a tripwire.
  README gains `Requires Chrome 116 or later.` GATE-0d adds an uncounted read
  of `minimum_chrome_version`. The s5 sitting needs Reload after the pull,
  because the manifest moves, and Reload clears drafts. Rejected: option A,
  143, which drops Chrome 116–142 and which the container could not run. 102,
  recommended first, was withdrawn before the ruling: Chrome refuses every
  request append below 108.
- **S5-D5, UI-04.** The three strings and the footer's hover text change.
  With them: `status.js`'s comments, the selftest pins (`selftest.mjs` lines
  2801, 2831 and 2836), one mutant anchor, README line 113, and `SMOKE.md`
  lines 302, 562, 569 and 574. The checks at lines 2805 and 2847 are
  rewritten to test for "registered". `SMOKE.md`'s stale failure string
  (lines 310 and 572) is fixed against `describeSync`. Frozen and never
  rewritten for the new words: the runbooks that quote the old ones,
  `test/EVIDENCE.md`, and what `FINDINGS.md` already says.
- **S5-D6, AR-17.** `PRIVACY.md` is replaced, and README changes in four
  places, all as written below.
- **S5-D7, HW-DESC.** The repository's About text becomes the manifest's
  description. Ash changes it on the Mac (repository page → About gear →
  Description → Save). The row records the text, the date and the read-back,
  and moves to `shipped` on the read. A release-session line in NEXT.md:
  "the About text equals `manifest.description`".
- **S5-D8, F-045.** The oracle's CORS case gains `X-HW-Removable: present`;
  the selfcheck goes 13 → 15 rows; `SMOKE.md` 15.5 expects `1 changed,
  1 removed`. One browser observation is owed in the s5 sitting. The
  oracle's build stamp changes, so the instruments restart after the pull.
- **S5-D9, evidence.** AR-11, AR-17 and AR-23 close on lib-level and source
  evidence (AR-23 also on the Chromium 141 runs in §6), and AR-11's cell says
  which versions rest on a source read and which on runs. DR-02, UI-04,
  UI-03, F-045 and AR-16 go to `fixed-unverified` until the s5 sitting.
  HW-DESC closes on a GitHub read. The evidence column becomes `reproduced`
  for UI-03, UI-04 and F-045 (validator check 8).
- **S5-D10, commits, in order.** (1) this file, alone; (2) AR-11 with
  AR-23; (3) UI-04 with AR-17; (4) UI-03; (5) DR-02; (6) AR-16; (7) F-045.
  project-planning gets the rulings after commit 1 and the outcome at the
  end. Each row runs red in the container before its code.
- **S5-D11, copy the release session owes.** The status line and its hover
  text; the four refusal messages (Save, Import, draft, Export); the editor
  row; README in four places; `PRIVACY.md`; the GitHub About text; the
  listing's "Requires Chrome 102 or later" → 116 (new row **DR-03b**).
  Whether the listing quotes the status words needs a read on the Mac.
  Unchanged: the manifest's name and description.
- **S5-D12, the name.** S5-D.
- **S5-D13, new rows.** **AR-23** with FINDING-049 (append on Chrome before
  143); **DR-03b**; **UI-08** (low, `slice:scope`: `.mono` never reaches the
  editor's inputs); **AR-05c** (low, `slice:scope`: a write the browser
  refuses shows nothing). A note in AR-19's cell for the Issues reading
  (§0), and the line in §0 that the badge's `…` is never shown.
- **S5-D14, UI-05 becomes two rows.** **Step 1**: a 480 px frame and a
  "Header rules" table on each card (Type, Action, Header, Value; no On
  column, which is FEAT-3; a remove shows a dash; the Header column sized to
  the card's longest name, as in the accepted mock; a value longer than its
  column shows in full on hover or when tabbed to, and only a cut value is a
  tab stop, measured by `popup.js`), as its own release straight after s5.
  s5 leaves the card as it is. **Step 2**: the agreed cards from
  `design/headerwright/`, after v0.4.0. This amends N4. Row ids proposed
  here: step 1 is a new row **UI-05a**; UI-05 keeps the agreed design, now
  step 2.
- **S5-D15, OPEN: UI-05a's target.** "Its own release straight after s5"
  needs a version. v0.2.5 keeps the release plan's numbers but asks the
  versioning rule to read a layout change as a fix; v0.3.0 renumbers s4 to
  v0.4.0 and FEAT-1 to v0.5.0. To rule before commit 4, which raises the
  row.

### The copy, word for word

**Status line (UI-04).** `lib/status.js`: `applying <N> · <M> not applied` →
`registered <N> · <M> not registered`; `nothing to apply` → `nothing
registered`; `applying <N>` → `registered <N>`. Unchanged: `sync failed —
previous rules may still be applying`, `checking — no result yet for the
current configuration`, `paused`. The footer's hover text: `Not applied:
<list>` → `Not registered: <list>`. Unchanged on purpose: the card's `Not
applying:` collision marker, the chip tooltips, the migration notice, the cap
messages, the worker's console lines, and the stored state name `applied`.

**Budget refusals (DR-02).** `<N>` is the overage, rounded up, as `12 KB` or
`1.3 MB`:

    Save:    Not saved: your profiles would be <N> over HeaderWright's 4 MB storage limit. Shorten a header value or delete a profile, then save.
    Import:  Import failed: this file's profiles are <N> over HeaderWright's 4 MB storage limit. Remove profiles or shorten header values in the file and try again.
    Draft:   These edits are too large to keep if the popup closes. Save the profile to keep them.

**Export refusals (AR-16):**

    Export failed: "<A>" and "<B>" both write header "<name>" on overlapping domains — refusing to export a set that cannot be re-imported. Change the header or the domains in one of them, then export.
      (with "; <K> further collisions are not listed" before the dash when there are more)
    Export failed: "<A>" and "<B>" share id <id> — refusing to export a set that cannot be re-imported. Delete one of them and add it again, then export.
    Export failed: you have <N> profiles and a file can hold 5000 — refusing to export a set that cannot be re-imported. Delete at least <K> profiles, then export.

**README.** A new line under `## Install`, after the store link:
`Requires Chrome 116 or later.` The badge bullet under `## What it does`:

    - Master on/off toggle with a badge: ON or OFF for the toggle, and `!` when
      Chrome rejected the last registration or some profiles were not registered

The v0.1.5 paragraph (lines 109–118) becomes:

      **One exception, as of v0.1.5.** A green dot means the GRANT is held, which
      is not quite the same as the headers applying. If two profiles write the same
      header on overlapping domains, neither is registered, so neither applies — but
      the grant is still held, so the dots stay green and the domains are still
      counted in the "domains granted" total. Since v0.2.0 the status line and the
      badge report it: with two such profiles and nothing else, the status line
      ends `registered 0 · 2 not registered` and the badge shows `!`. The collision
      marker on each card says which header and which other profile, and it is
      what to read.

A new section after `## Repeated entries on one header`, with the finding
number this file assigns:

    ## Pages with a service worker

    A site's service worker can answer a request itself. When it does, there is
    no network request for Chrome to apply a header rule to, so what a profile
    does on such a site depends on where the response comes from:

    | the response comes from | your headers |
    | --- | --- |
    | the network | apply |
    | the service worker passing the request on with `fetch()` | apply |
    | the service worker's cache | do not apply |
    | a response the service worker builds itself | do not apply |

    A response the worker cached while a profile was on keeps the headers it
    was stored with, even after the profile is turned off. To see which case a
    request is in, open DevTools, Network: the Size column says when a response
    came from the service worker. Measured on Chromium 141; see `FINDINGS.md`,
    FINDING-050.

**`PRIVACY.md`, the whole file:**

    # Privacy Policy — HeaderWright

    HeaderWright collects nothing. No data about you or your browsing goes to
    its developer or to any third party.

    - **What is stored, and where.** Header profiles are stored in Chrome's
      local extension storage (`chrome.storage.local`) on your machine. Edits
      you have not saved yet are kept in Chrome's session storage
      (`chrome.storage.session`), in memory, until you save or cancel them;
      Chrome clears them when the browser restarts or the extension updates.
      There is no account, no sync, no backend, and no server operated by this
      extension.
    - **What is sent, and where.** Request headers you configure are set,
      appended or removed by Chrome on requests to the domains you configured
      them for, and their subdomains. That is the extension's purpose, and it
      is the only way anything you enter leaves your machine. Response headers
      you configure change what your browser receives; they are not sent
      anywhere. The extension's own code makes no network requests of any kind.
    - **No traffic observation.** HeaderWright uses only the
      `declarativeNetRequest` API: it hands rules to Chrome, and Chrome applies
      them. It does not request the `webRequest` permission and has no content
      scripts, so it receives no request, no response and no page content.
      This is verifiable from the extension's manifest.
    - **No telemetry or analytics.**
    - **Exports are user-initiated.** The export feature writes a JSON file to
      your device at your request. Note that header values you configure may
      include sensitive strings (such as tokens); they are stored in plaintext
      in the storage named above, as with comparable tools, and included in
      any file you choose to export.

    Questions: https://github.com/antrixy/headerwright/issues

**GitHub About text (HW-DESC):** `Set and remove HTTP request and response
headers by profile; append on request only. No webRequest — it cannot read
your traffic.`

## 2. Design, fixed before the build

Each commit is built in the container in three steps: its checks and
mutants first, run RED against the tree before it (§3); then its product
change, green (§4) with its mutants (§5); then, where §6 has rows, its
browser runs. Each lands from a fresh clone on the Mac through a guarded
command. New `lib/` symbols reach `selftest.mjs` through namespace imports,
and a new `lib/` file through a dynamic `import()` caught to `{}`, so a
missing export or file reads as FAIL lines, never a crash. No check may pass
on two failures: each negative check first requires its positive control.
Every fixture is checked before the red run is trusted. No comment in
`popup.js` quotes a statement §3 scans for, so the scans read the same with
and without the comment strip.

### Commit 2: AR-11 with AR-23

**`test/platform-floor.mjs`, new**, the registry. It exports `REQUIREMENTS`
and pure helpers: `apiPaths(text)` (every `chrome.<namespace>.<member>` in
comment-stripped source), `manifestKeys(manifest)` (the top-level keys and
`background.*`), `manifestPermissions(manifest)` (`permissions` and
`optional_permissions`), `ruleParts(rule)` (the condition's keys, each
resource type, the action type, and each operation per side) and
`floorOf(inUse)`, which returns the highest Chrome version among the
registered items in use, the names that set it, and the items in use that
are not registered. Each requirement is `{ kind, name, chrome, basis,
source }`. `basis` is `first` (absent in the tag before, present from this
one), `documented` (Chrome's reference gives the number) or `present`
(defined at the lowest tag read; first version not established).

| Kind | Names | Chrome | Basis |
| --- | --- | ---: | --- |
| manifest | `manifest_version`, `name`, `version`, `description`, `icons`, `action`, `background`, `background.service_worker`, `background.type`, `minimum_chrome_version`, `permissions` | 101 | present |
| manifest | `optional_host_permissions` | 102 | first |
| permission | `declarativeNetRequestWithHostAccess`, `storage` | 101 | present |
| api | `chrome.action.setBadgeBackgroundColor`, `chrome.action.setBadgeText`, `chrome.declarativeNetRequest.getDynamicRules`, `chrome.declarativeNetRequest.updateDynamicRules`, `chrome.permissions.contains`, `.getAll`, `.onAdded`, `.onRemoved`, `.remove`, `.request`, `chrome.runtime.onInstalled`, `chrome.runtime.onStartup`, `chrome.storage.local`, `chrome.storage.onChanged` | 101 | present |
| api | `chrome.storage.session` | 102 | documented |
| rule | `condition.requestDomains` | 101 | first |
| rule | `condition.resourceTypes`, the fifteen `resourceType.*` values, `action.modifyHeaders`, `requestHeaders.set`, `requestHeaders.remove`, `responseHeaders.set`, `responseHeaders.remove` | 101 | present |
| rule | `requestHeaders.append` | 108 | first |
| append | the twenty allowlisted names other than `user-agent`, in lowercase | 108 | first |
| append | `user-agent` | 116 | first |

73 requirements, all in use. The derived floor is **116**, set by `append
user-agent`. If `user-agent` left the product's allowlist, the floor would
derive to 108, and the manifest check would fail until the manifest
followed: equality, as ruled.

**`extension/manifest.json`:** `"minimum_chrome_version": "116"`. Nothing
else.

**`extension/lib/rules.js`:** `headerEntryToModifyHeaderInfo` sends an
append's name in lowercase and every other name as typed:

    const info = {
      header: entry.operation === "append" ? entry.name.toLowerCase() : entry.name,
      operation: entry.operation,
    };

The allowlist's comment is rewritten to cite FINDING-049 and the 143
boundary. What is stored, exported, digested and fed to `configRevision`
keeps the name as typed, so no stored profile, export, `profileDigest` or
revision moves. The card shows what Chrome registered, so an appended
header now reads in lowercase there, e.g. `req · append · x-forwarded-for
→ "203.0.113.7"`; a `set` still reads as typed.

**`README.md`:** the Install line (§1).

**`test/selftest.mjs`:** checks 1–14 (§3) in a section after the
scope-language checks, which reads the extension's `.js` files itself
(`readdirSync` with `recursive`) and strips their comments; the pinned
check "manifest minimum_chrome_version is 101 (requestDomains)" is removed,
its comment rewritten; `EXPECTED_CHECKS` 606 → 619.

**`test/mutate-collisions.py`:** two anchors rewritten and eleven mutants
added (§5); `PLF = ROOT / "test/platform-floor.mjs"`.

**Records.** `FINDINGS.md`: FINDING-049, "the manifest floor named one API's
version, and a request append failed on every Chrome before 143 unless its
name was typed in lowercase". `LEDGER.md`: AR-11 → `verified`, prior
`FINDING-049`, evidence `reproduced, chromium-source`, its cell naming which
versions rest on a source read (101, 102, 108, 116, 143) and which on runs
(Chromium 141); AR-23 new, `verified`, high, `v0.2.4`, prior `FINDING-049`,
evidence `reproduced, chromium-source`; DR-03b new, `open`, high, `v0.2.4`,
prior `AR-11, DR-03`, evidence `reproduced`. Target summary: `v0.2.4`
10 → 12, total 52 → 54.

> **Outcome (built, 2026-10-09): as designed.** 73 requirements, all in
> use; the derived floor is 116, set by `append user-agent`. Built
> differently, and stated: the API scan walks `extension/` by hand, as
> `verify.mjs` does, instead of using `readdirSync`'s `recursive` option,
> which Node releases before 18.17 ignore silently; and check 1 also requires
> each requirement's basis to be one of the three named. Check 14's "the
> profile's name" is the appended header's name as the profile stores it, and
> the check's name says so.

### Commit 3: UI-04 with AR-17

**`extension/lib/status.js`:** the three strings, and the comments that
quote them; the partial count's variable becomes `notRegistered`.
`configRevision` and its input are untouched, so `configRevision([], false)`
stays `69709b56`, while the file's sha256 moves.

**`extension/popup/popup.js`:** the hover text, with its variable renamed:

    : notRegistered.length > 0
      ? `Not registered: ${notRegistered.join("; ")}`

**`README.md`:** the badge bullet, the v0.1.5 paragraph and the new
service-worker section (§1). **`PRIVACY.md`:** the whole file (§1).

**`test/SMOKE.md`:** lines 302, 569 and 574 quote the line as
`registered N` where they quoted "applying"; line 562 tells finding 8's
history without quoting the old word; lines 310–311 and 572–573 quote `sync
failed — previous rules may still be applying`, the string `describeSync`
returns.

**`test/release-consistency.mjs`:** `PRIVACY.md` is re-registered with
`claims: true`. It was registered as making no capability claims ("names no
header-modification capability"); from s5 it says what configured headers
do on each side. Two rules, read on whitespace-collapsed text: if the tree
emits response headers, the file must name "response headers"; and if
response `append` is refused, every sentence naming `append` must name a
request and no response. `ARTIFACTS.length` stays 7.

**`test/selftest.mjs`:** checks 15–24, five existing checks changed (§3);
`EXPECTED_CHECKS` 619 → 629. **`test/mutate-collisions.py`:** one anchor
rewritten, thirteen mutants added; `PRV = ROOT / "PRIVACY.md"`,
`SMK = ROOT / "test/SMOKE.md"`.

**Records.** `FINDINGS.md`: FINDING-050, "a header rule does not apply to a
response a page's service worker serves from its cache or builds itself"
(§0's table). `LEDGER.md`: UI-04 → `fixed-unverified`, evidence
`reproduced`; AR-17 → `verified`, prior adds `FINDING-050`, evidence
`reproduced, chrome-docs`.

### Commit 4: UI-03

**`extension/popup/popup.html`, CSS only.** The `.hrow` rule becomes S5-D3's
two-line grid, with `grid-template-areas` on one line exactly as ruled, the
five `grid-area` rules, and the compact padding rule after `.hrow select {
padding: 5px 3px; }` and `.hrow .h-side { padding: 5px 2px; }`, both kept
verbatim. The comment above the rule is rewritten (no `https://` in it any
more). `popup.js` and the markup are untouched, so the Issues reading (§0)
does not move.

**`test/selftest.mjs`:** checks 25–28; the check "0.2.0: the row grid has five
columns with side ahead of operation" is removed; `EXPECTED_CHECKS` 629 →
632. **`test/mutate-collisions.py`:** one anchor rewritten, five mutants
added.

**Records.** `LEDGER.md`: UI-03 → `fixed-unverified`, evidence `reproduced`
(§0's 70 px); UI-08 new, low, `slice:scope`, evidence `reproduced`; UI-05
reworded as step 2 and **UI-05a** new as step 1 (S5-D14), its target per
S5-D15; AR-19's cell gains the Issues reading. Target summary:
`slice:scope` 18 → 19, UI-05a's bucket +1, total 54 → 56. `FINDINGS.md`: a
dated note under FINDING-043 that the editor field is widened.

### Commit 5: DR-02

**`extension/lib/budget.js`, new**, pure, no `chrome.*`:

- `PROFILES_BUDGET_BYTES = 4 * 1024 * 1024` and
  `DRAFTS_BUDGET_BYTES = 128 * 1024`.
- `chromeJsonBytes(value)` and `storedBytes(key, value)`: §0's rule. Linear,
  with a fast path for strings that need no escaping, so a set at the budget
  counts in milliseconds.
- `checkProfilesBudget(key, previous, next)`: `{ ok: true }` when `next`
  fits, or when it is not larger than `previous`; otherwise
  `{ ok: false, overBy }`, the bytes past the budget.
- `draftsBytes(drafts)`: the UTF-8 bytes of `JSON.stringify(drafts)`.
  `fitsDraftsBudget(drafts)`: `draftsBytes(drafts) <= DRAFTS_BUDGET_BYTES`.
- `formatOverage(bytes)`: whole kilobytes rounded up (`12 KB`) below 1,000
  KB, then megabytes to one decimal rounded up (`1.3 MB`); 1 KB = 1,024
  bytes, and it never reads 0.
- `describeSaveBudgetRefusal(overBy)`, `describeImportBudgetRefusal(overBy)`
  (an unterminated clause: the popup renders `Import failed: …` and its
  full stop, as for every import failure) and `DRAFT_NOT_KEPT_NOTICE`, the
  ruled copy. "4 MB" in the messages is derived from the constant.

**`extension/lib/draft.js`:** `DRAFT_NOT_KEPT`, a new export.
`createDraftStore({ read, write, fits })` takes an optional `fits`: `put`
sets the draft into the map it read, and if `fits` refuses the map it writes
nothing and resolves `DRAFT_NOT_KEPT`; otherwise it writes and resolves
`true`. Without `fits` it writes everything, as before. The whole map counts,
not only the draft being written. The session's `put` passes the store's
answer on (it used to resolve `true` itself), and still resolves `false`
once the session has ended.

**`extension/popup/popup.js`:**

- The draft store is created with `fits: fitsDraftsBudget`.
- `saveProfile`, after the collision refusal and before the write:
  `const budget = checkProfilesBudget(STORAGE_KEY_PROFILES, previousProfiles, nextProfiles);`
  and `if (!budget.ok) { showFormError(describeSaveBudgetRefusal(budget.overBy)); return; }`.
- `onImportFileChosen`, after the file parses and before `pendingImport` is
  set: `const fileBudget = checkProfilesBudget(STORAGE_KEY_PROFILES, stored, profiles);`,
  where `stored` is the profiles read once for the confirmation's count; a
  refusal shows `` `Import failed: ${describeImportBudgetRefusal(fileBudget.overBy)}.` ``
  and returns.
- `applyImport`, before the write: `const replaceBudget = …` against the
  profiles stored now, the same refusal, after `hideIoUi()`, and a return.
- `persistDraft`: `let kept = DRAFT_NOT_KEPT;`, then inside the try
  `kept = await draftSession.put(…)` (the statement s3's check 42 reads,
  unchanged after the assignment), and after the try and catch
  `setDraftNotKeptNotice(kept === DRAFT_NOT_KEPT);`. A write the browser
  rejects leaves `kept` at `DRAFT_NOT_KEPT`, so the notice shows then too.
- `setDraftNotKeptNotice(visible)` fills `#draft-not-kept` with
  `DRAFT_NOT_KEPT_NOTICE` and toggles `hidden`. `openEditor` and
  `revertToSaved` call it with `false`.

**`extension/popup/popup.html`:** `<div id="draft-not-kept" class="notice
hidden"></div>`, inside the form, after the draft notice.

**`extension/lib/canonical.js`:** the comment that cites "DR-02's 1 MB
session quota at the Chrome 102 floor" is brought up to date. Comment only.

`extension/` goes from 18 files to 19, and the syntax gate from 25 files to
26.

**`test/selftest.mjs`:** checks 29–49 in `async function dr02Checks()`,
called after `ar02Checks()`, with `budget.js` imported dynamically and the
store's own small fake storage; `EXPECTED_CHECKS` 632 → 653.
**`test/mutate-collisions.py`:** three s3 anchors rewritten (M19, M31, M32),
twenty-three mutants added; `BUD = ROOT / "extension/lib/budget.js"`.

**Records.** `FINDINGS.md`: FINDING-051, "a write the browser refused was
silent, and nothing bounded what HeaderWright stores" (§0). `LEDGER.md`:
DR-02 → `fixed-unverified`, prior `FINDING-051`, evidence `reproduced`, its
cell recording the budgets, the measurements and that at the 116 floor both
quotas are 10 MiB; AR-05c new, low, `slice:scope`, prior `FINDING-051`,
evidence `reproduced`; AR-15's cell names DR-02. Target summary:
`slice:scope` 19 → 20, total 56 → 57.

### Commit 6: AR-16

**`extension/lib/canonical.js`, `serializeProfiles`.** It refuses, in the
importer's order of precedence: more than 5,000 profiles (before anything
else); then each profile's own validity (as today, inside
`canonicalizeProfiles`); then a duplicated id, naming the first pair in
stored order; then a collision, through `describeExportRefusal`. Each
refusal is an unterminated clause, rendered by the popup's existing
`` `Export failed: ${err.message}.` ``. The new code uses its own names
(`exportCollisions`, `earlierById`), so no anchor of an existing import
mutant moves to it. `parseProfilesFile` is unchanged.

**`extension/lib/collisions.js`:** `describeExportRefusal(collisions,
nameFor)`, after `describeImportRefusal`, with its own variable names. It
names the first pair and the header, says "on the response" for a
response-side collision as the import refusal does, counts further
collisions ("; 1 further collision is not listed", "; 3 further collisions
are not listed") before the dash, and ends without punctuation.

**`popup.js` is unchanged:** `exportProfiles` already shows a thrown
message and returns before any file is made.

**`test/selftest.mjs`:** checks 50–62, after the FINDING-026 import-refusal
checks; `EXPECTED_CHECKS` 653 → 666. **`test/mutate-collisions.py`:**
fourteen mutants added.

**Records.** `LEDGER.md`: AR-16 → `fixed-unverified`, target `slice:scope`
→ `v0.2.4`, its `DECIDE:` replaced by S5-D1; DR-01b → `fixed-unverified`;
"Decisions blocking rows": AR-16 out, FEAT-3 in, still six. Target summary:
`v0.2.4` 12 → 13, `slice:scope` 20 → 19, total 57. `FINDINGS.md`: a dated
note under FINDING-027.

### Commit 7: F-045

**`test/oracle/server.mjs`:** the CORS case gains
`["X-HW-Removable", "present"]`, with a comment. **`test/oracle/selfcheck.mjs`:**
two rows, the CORS floor row and the CORS removal row, `EXPECTED_ROWS`
13 → 15. A tamper refused with 400 must read as a FAIL row, not abort the
run, so the removal row observes through a wrapper that returns null on a
refused request. **`test/SMOKE.md`:** row 15.5 expects `1 changed,
1 removed`, `x-hw-oracle` `baseline` → `rewritten`, `x-hw-removable` absent,
the CORS family unchanged; the note under it records the 2026-09-21 wording
and this change; the Record block adds "both applied = ?".

**`test/selftest.mjs`:** checks 63–64; `EXPECTED_CHECKS` 666 → 668.
**`test/mutate-collisions.py`:** two mutants added; `ORS = ROOT /
"test/oracle/server.mjs"`.

**Records.** `LEDGER.md`: F-045 → `fixed-unverified`, evidence `reproduced`;
HW-DESC → `shipped`, if Ash has changed and read the About text by then
(S5-D7), with the text, the date and the read-back. `FINDINGS.md`: a dated
note under FINDING-045.

### Known limits, stated

- The registry's numbers below 116 are evidence floors, not first versions:
  for anything marked `present`, the extension is known to work from 101,
  and nothing earlier was read.
- A user whose stored set already exceeds the budget can delete and shrink,
  never grow, until under it. Import of a smaller file than what is stored
  is allowed for the same reason.
- `checkProfilesBudget` compares against the profiles as decoded. A stored
  record the decoder drops is not counted, so the check can only be
  stricter than Chrome's.
- The drafts budget is on JSON bytes, not on what session storage charges;
  §0's worst shape is charged five times its JSON, still under 1 MB.
- Other writes the browser refuses — the master toggle, Delete, Replace's
  write — still fail with only a console error. That is AR-05c.
- An export that collides is refused with no file. The way out is the
  editor, as the message says; there is no rescue copy (S5-D1).

## 3. Checks, numbered, with the predicted red result

Each commit's checks run red against the tree before its product change:
the checks, the test helpers and the mutants exist; the product, README,
`PRIVACY.md`, `SMOKE.md` and the oracle fixture do not change yet.

### Commit 2, AR-11 and AR-23: checks 1–14

| # | Check | Red |
| --- | --- | --- |
| 1 | every platform requirement has a kind, a unique name, a Chrome version and a source | pass |
| 2 | the scan finds the `chrome.*` APIs the extension calls: at least twelve, including `chrome.storage.session` and `chrome.declarativeNetRequest.updateDynamicRules` | pass |
| 3 | every `chrome.*` API the extension calls is registered | pass |
| 4 | every manifest key is registered | pass |
| 5 | every permission the manifest requests is registered | pass |
| 6 | every part of the rule the builder emits is registered (a probe profile with request set, append and remove and response set and remove builds a rule with both header lists) | pass |
| 7 | every header name a request may append is registered | pass |
| 8 | `manifest.minimum_chrome_version` equals the highest requirement in use | FAIL |
| 9 | README's Install section reads `Requires Chrome N or later.`, with N the manifest's floor | FAIL |
| 10 | an append typed `X-Forwarded-For` is registered as `x-forwarded-for` | FAIL |
| 11 | each of the 21 appendable names, typed in capitals, is registered in its allowlist spelling | FAIL |
| 12 | a `set` and a `remove`, on either side, keep their names as typed | pass |
| 13 | the card reads that append back as `req · append · x-forwarded-for → "v"` | FAIL |
| 14 | the profile's name stays as typed in the export and in `configRevisionText`, and the entry is valid | pass |

Existing check removed: "manifest minimum_chrome_version is 101
(requestDomains)".

**Red run: `selftest: 5 of 619 checks FAILED`,** checks 8, 9, 10, 11 and 13.
No crash.

**Other gates on the red tree: 4 of 7 fail.** selftest; mutate-collisions
(PATCH DID NOT APPLY for R1, R2, M1, M3, M7, M8 and M10, §5); mutate-grants
and mutate-scans (their pinned counts shift by the red baseline).
module-syntax (25 files), oracle-selfcheck and initiator-selfcheck pass.

> **Outcome (red, 2026-10-09): as predicted, `selftest: 5 of 619 checks
> FAILED`.** The failures were checks 8, 9, 10, 11 and 13, each read by
> name. No crash. The fixtures were checked first: the scan read 12 files and
> found 15 APIs, the probe rule carried three request and two response
> entries, and 73 items were in use, every one registered.
>
> **Outcome (red tree, all gates): 4 of 7 failed, as predicted, and for the
> predicted reasons.** selftest (`checks FAILED`); mutate-collisions (`PATCH
> DID NOT APPLY` for exactly R1, R2, M1, M3, M7, M8 and M10, read in a full
> run of the harness); mutate-grants and mutate-scans (`MUTANTS NOT MATCHING
> EXPECT`, every count 5 higher). module-syntax (25 files), oracle-selfcheck
> and initiator-selfcheck passed.

### Commit 3, UI-04 and AR-17: checks 15–24, five changed

`applied`, `zero`, `partial` and `failed` below are the records the status
section already builds: one rule; no rules; two rules and one skipped
profile; a failed sync.

| # | Check | Red |
| --- | --- | --- |
| 15 | UI-04: none of the applied, zero and partial lines says "appl", and each says "registered" | FAIL |
| 16 | UI-04: the footer's hover text is `` `Not registered: ${ ``, and popup.js no longer holds "Not applied:" | FAIL |
| 17 | UI-04: README shows, in backticks, the line the product prints for two colliding profiles and nothing else, that record's badge is `!`, and README no longer says the status line "still reads "applying"" | FAIL |
| 18 | UI-04: `SMOKE.md`, whitespace collapsed, quotes the failed line exactly as `describeSync` returns it, and holds neither "not applying — last sync failed" nor a quoted `"applying"` | FAIL |
| 19 | AR-17: `PRIVACY.md` names, as `chrome.storage.<area>`, every storage area the extension's code uses (at least two found) | FAIL |
| 20 | AR-17: `PRIVACY.md` says request headers you configure are set, appended or removed by Chrome on requests to the domains you configured them for, and does not say no data leaves your device | FAIL |
| 21 | AR-17: the manifest has no `webRequest` permission and no `content_scripts`, and `PRIVACY.md` says both | FAIL |
| 22 | AR-17: no extension code calls `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` or `importScripts`, and `popup.html` loads nothing from `http:` or `https:` | pass |
| 23 | AR-17: README's `## Pages with a service worker` lists the cache and the worker's own response under "do not apply" and the network under "apply", and names FINDING-050 | FAIL |
| 24 | AR-17: README's `## What it does` names every badge a user can see: `ON`, `OFF` and `` `!` `` | FAIL |

**Existing checks that change**, each red against the unchanged product:

- "status line says applying when enabled and synced" becomes "…says
  registered…" and expects `registered 1`. Red: **FAIL**.
- "status line does not claim applying after a failed sync" becomes "…does
  not claim registered…": the applied line starts with "registered" (its
  positive control), and the failed line does not. Red: **FAIL**.
- "HW-V7-04: a successful zero-rule sync does not claim to be applying"
  becomes "…reads nothing registered" and expects `nothing registered`.
  Red: **FAIL**.
- "HW-V7-04: partial says how many applied AND how many did not" becomes
  "…how many registered…" and expects `registered 2 · 1 not registered`.
  Red: **FAIL**.
- "HW-V7-04: a record for a different configuration reads as stale": the
  applied line says "registered" (the positive control) and the stale line
  does not. Red: **FAIL**.
- "R15: every registered artifact agrees with the code", through
  `PRIVACY.md`'s new registration: the file as it stands never says
  "response headers". Red: **FAIL**.

**Red run: `selftest: 15 of 629 checks FAILED`:** checks 15–21, 23 and 24,
the five changed status checks, and R15. No crash.

**Other gates on the red tree: 4 of 7 fail,** the same four as commit 2's;
mutate-collisions has twelve mutants that do not apply (§5).

### Commit 4, UI-03: checks 25–28

| # | Check | Red |
| --- | --- | --- |
| 25 | the `.hrow` rule has `grid-template-columns: 56px 82px 1fr 24px` and `grid-template-areas: "name name name remove" "side op value value"` | FAIL |
| 26 | every `.hrow .<class> { grid-area: … }` names a class `popup.js` assigns, each area of the template is given to exactly one class, and no class is given an area the template lacks | FAIL |
| 27 | the compact rule `.hrow input[type="text"], .hrow select, .hrow .h-side { padding-top: 3px; padding-bottom: 3px; }` is there | FAIL |
| 28 | the popup is still 380 px wide | pass |

Existing check removed: "0.2.0: the row grid has five columns with side
ahead of operation". Kept: "0.2.0: .hrow select takes its width from the
grid, not a fixed rule".

**Red run: `selftest: 3 of 632 checks FAILED`,** checks 25, 26 and 27.

**Other gates on the red tree: 4 of 7 fail,** as before; four mutants do not
apply.

### Commit 5, DR-02: checks 29–49

`b` is `budget.js`, loaded dynamically; every check first requires the
function or constant it reads, so a missing one is a FAIL. `L` is
4,194,304 − 108: the small profile measures 109 bytes with its one-character
value (§0), so a small profile whose value is L `x` characters is exactly at
the budget. The store checks use a fake budget of 600 characters of JSON,
with fixtures sized so that each outcome is decided by it.

| # | Check | Red |
| --- | --- | --- |
| 29 | the budgets are 4,194,304 bytes of profiles and 131,072 bytes of drafts | FAIL |
| 30 | `storedBytes("hw:profiles", …)` equals Chrome's count for all twelve fixtures of §0 | FAIL |
| 31 | a set at exactly the budget is accepted, and one byte over is refused with `overBy` 1 | FAIL |
| 32 | over the budget by 5,000 bytes already: a write 1 byte smaller is accepted, one the same size is accepted, and one 1 byte larger is refused | FAIL |
| 33 | `formatOverage`: 1 → `1 KB`, 1,024 → `1 KB`, 1,025 → `2 KB`, 12,288 → `12 KB`, 1,022,976 → `999 KB`, 1,022,977 → `1.0 MB`, 1,363,148 → `1.3 MB`, 1,363,149 → `1.4 MB`, 1,572,864 → `1.5 MB` | FAIL |
| 34 | the save refusal for 12,288 bytes is the ruled sentence, with `12 KB` | FAIL |
| 35 | the import refusal for 1,572,864 bytes is the ruled clause with `1.5 MB`, unterminated, and renders as `Import failed: ….` with one full stop | FAIL |
| 36 | `DRAFT_NOT_KEPT_NOTICE` is the ruled sentence | FAIL |
| 37 | `draftsBytes` counts UTF-8 bytes (a map holding "é" counts more bytes than characters), a map of exactly 131,072 bytes fits, and one byte more does not | FAIL |
| 38 | a draft that pushes the map over the budget is not written, resolves `DRAFT_NOT_KEPT`, and the stored draft is still the earlier one | FAIL |
| 39 | a draft that fits is written and resolves `true` | FAIL |
| 40 | after a refused draft, the next one that fits is written | FAIL |
| 41 | the session passes `DRAFT_NOT_KEPT` on, and still resolves `false` once ended | FAIL |
| 42 | another profile's stored draft counts toward the budget: with it near the limit, a small draft under a new key is refused and nothing is written | FAIL |
| 43 | a store given no budget writes a draft of any size and resolves `true` | FAIL |
| 44 | `saveProfile` checks the profiles budget after the collision refusal and before `await setProfiles(nextProfiles)`, and its refusal shows `describeSaveBudgetRefusal(budget.overBy)` and returns | FAIL |
| 45 | `onImportFileChosen` checks `fileBudget` after the parse and before `pendingImport = profiles;`, and its refusal shows the import message and returns | FAIL |
| 46 | `applyImport` checks `replaceBudget` before `await setProfiles(nextProfiles);`, with the same refusal and a return | FAIL |
| 47 | the one draft store is created with `fits: fitsDraftsBudget` | FAIL |
| 48 | `persistDraft` starts from `let kept = DRAFT_NOT_KEPT;` and ends with `setDraftNotKeptNotice(kept === DRAFT_NOT_KEPT);` | FAIL |
| 49 | `openEditor` and `revertToSaved` call `setDraftNotKeptNotice(false);`, and `popup.html` declares `#draft-not-kept` hidden, as a `.notice`, inside the form | FAIL |

**Red run: `selftest: 21 of 653 checks FAILED`,** checks 29–49. Checks 38–43
fail on the unchanged store: it has no `DRAFT_NOT_KEPT`, writes every
draft and resolves `undefined`.

**Other gates on the red tree: 4 of 7 fail.** selftest; **mutate-collisions
stops before its first mutant,** with Python's `FileNotFoundError`, because
it reads every mutated file at start-up and `extension/lib/budget.js` does
not exist yet; mutate-grants and mutate-scans shift. module-syntax (25
files), oracle-selfcheck and initiator-selfcheck pass.

### Commit 6, AR-16: checks 50–62

`exportRefusal(set)` returns the thrown message, or null when the set
exports. `pair` is "Alpha" and "Beta" writing `X-H` on `example.com` and
`api.example.com`; `dup` is "Alpha" and "Alpha again", both id 1, with
different headers on different domains; `bulk(n)` is the existing cap
fixture.

| # | Check | Red |
| --- | --- | --- |
| 50 | a colliding set is refused on export | FAIL |
| 51 | its refusal is exactly `"Alpha" and "Beta" both write header "x-h" on overlapping domains — refusing to export a set that cannot be re-imported. Change the header or the domains in one of them, then export` | FAIL |
| 52 | with two collisions, the refusal holds `; 1 further collision is not listed — refusing` | FAIL |
| 53 | a response-side collision's refusal holds `"x-h" on the response on overlapping domains` | FAIL |
| 54 | `dup` is refused with exactly `"Alpha" and "Alpha again" share id 1 — refusing to export a set that cannot be re-imported. Delete one of them and add it again, then export` | FAIL |
| 55 | 5,001 profiles are refused with exactly `you have 5001 profiles and a file can hold 5000 — refusing to export a set that cannot be re-imported. Delete at least 1 profile, then export`, and 5,003 with `Delete at least 3 profiles, then export` | FAIL |
| 56 | exactly 5,000 profiles export, and the file imports | pass |
| 57 | the cap outranks a malformed profile and a collision: 5,001 plus a malformed profile, and 5,001 plus `pair` (ids 99991 and 99992), are each refused with a message starting `you have` | FAIL |
| 58 | a malformed profile outranks a collision: `pair` with a second, malformed header on "Beta" is refused for that header, not the collision | pass |
| 59 | a duplicated id outranks a collision: `dup` plus a profile 2 colliding with "Alpha" is refused with `share id 1` | FAIL |
| 60 | Export and Import agree on four sets that must pass: one header on both sides, sibling subdomains, suffix-confusable domains, and one profile setting then appending `X-Forwarded-For`; each exports, imports and exports to the same bytes | pass |
| 61 | none of the three refusals ends in punctuation, and each renders as `Export failed: ….` with one full stop | FAIL |
| 62 | `exportProfiles` catches a refusal, shows `` `Export failed: ${err.message}.` `` and returns before `URL.createObjectURL(` | pass |

**Red run: `selftest: 9 of 666 checks FAILED`,** checks 50–55, 57, 59 and 61.

**Other gates on the red tree: 4 of 7 fail;** twelve mutants do not apply.

### Commit 7, F-045: checks 63–64

| # | Check | Red |
| --- | --- | --- |
| 63 | both cases in `test/oracle/server.mjs`, read as text, send `["X-HW-Removable", "present"]` | FAIL |
| 64 | `SMOKE.md` row 15.5 expects `1 changed, 1 removed` and no longer says NOT OBSERVABLE | FAIL |

**Red run: `selftest: 2 of 668 checks FAILED`.** **oracle-selfcheck:
`13/15 rows passed`,** the two new rows failing, exit 1.

**Other gates on the red tree: 5 of 7 fail:** selftest, mutate-collisions
(two not applied), mutate-grants, mutate-scans, oracle-selfcheck.

## 4. Green, predicted

| After commit | Checks | Mutation scenarios | Syntax gate | Gates |
| --- | ---: | ---: | ---: | --- |
| 2 | 619 | 182 | 25 files | 7 pass |
| 3 | 629 | 195 | 25 files | 7 pass |
| 4 | 632 | 200 | 25 files | 7 pass |
| 5 | 653 | 223 | 26 files | 7 pass |
| 6 | 666 | 237 | 26 files | 7 pass |
| 7 | 668 | 239 | 26 files | 7 pass |

- **mutate-scans: one row moves, once.** "The comment stripper also eats
  string literals" goes 19 → 20 at commit 4: check 26 reads the class names
  `popup.js` assigns inside double-quoted strings. No other new check reads
  inside a double-quoted string in `popup.js`: the API, network and
  storage-area scans read the files themselves, and every other popup scan
  matches template literals or code. "The comment strip is removed" stays 0.
  The other six rows do not move.
- **mutate-grants: no row moves.**
- **oracle-selfcheck:** 15/15 rows from commit 7.
- `configRevision([], false)` is `69709b56` after every commit;
  `lib/status.js`'s sha256 moves at commit 3 and only there.
- **The gates take longer.** 68 more mutants and the new 5,000-profile and
  4 MiB fixtures: about three and a half to four minutes on the Mac after
  commit 7, against two today. Not counted.
- No existing check changes beyond §3's lists.

> **Outcome (commit 2, green, 2026-10-09): as predicted.** `selftest:
> 619/619 checks passed`. `verify.mjs`: all 7 gates pass, `tree: 619 checks,
> 182 mutation scenarios, 7 gates`, module-syntax over 25 files.
> mutate-scans: all 8 rows matched their pinned expects, 19 and 0
> unchanged; mutate-grants: all 7 rows unchanged. `configRevision([], false)`
> is `69709b56`, and `lib/status.js` is unchanged.

## 5. Mutants, added to `test/mutate-collisions.py`, with predicted fails

Each mutant must fail at least one check; that is the harness's verdict.
The counts and check numbers are predictions. "Red" says whether its anchor
exists before its commit's product change, judged per mutant from its
anchor.

### Commit 2: 11 added, 2 rewritten (171 → 182)

| M | Mutant | Predicted fails | Red |
| --- | --- | --- | --- |
| R1 | rewritten: `minimum_chrome_version` is dropped from the manifest (anchor `"116"`) | 3 ("manifest declares minimum_chrome_version", 8, 9) | does not apply |
| R2 | rewritten: `minimum_chrome_version` drifts below the derived floor (`"116"` → `"88"`) | 2 (8, 9) | does not apply |
| M1 | `minimum_chrome_version` is raised above the derived floor (`"120"`) | 2 (8, 9) | does not apply |
| M2 | the worker calls a `chrome.*` API nobody registered (`chrome.idle.onStateChanged`) | 1 (3) | applies |
| M3 | the manifest gains a key nobody registered (`"incognito": "split"`) | 1 (4) | does not apply |
| M4 | the manifest requests a permission nobody registered (`alarms`) | 1 (5) | applies |
| M5 | the rule builder emits a resource type nobody registered | 1 (6) | applies |
| M6 | the append allowlist gains a name nobody registered (`x-real-ip`) | 1 (7) | applies |
| M7 | an appended name is sent as typed again (AR-23 undone) | 3 (10, 11, 13) | does not apply |
| M8 | every header name is lowercased, not only an append's | 2 (12; "F021/side: a response entry lands in responseHeaders, never requestHeaders") | does not apply |
| M9 | the export lowercases an appended name (the stored form moves) | 1 (14) | applies |
| M10 | README states an older floor (`Requires Chrome 102 or later.`) | 1 (9) | does not apply |
| M11 | the registry records `append user-agent` as 108 | 1 (8) | applies |

> **Outcome (mutants, 2026-10-09): every prediction held, counts and checks
> exactly.** All thirteen applied on the green tree, each failed at least one
> check, and none crashed. Every failing check was read by name: a scratch
> runner applied each mutant to a throwaway copy and printed its failures.
> The red column held too: R1, R2, M1, M3, M7, M8 and M10 did not apply
> before the product change, and M2, M4, M5, M6, M9 and M11 did. Mutation
> scenarios: 171 → 182.

### Commit 3: 13 added, 1 rewritten (182 → 195)

| M | Mutant | Predicted fails | Red |
| --- | --- | --- | --- |
| Z1 | rewritten: a zero-rule success prints a registered count (`if (false) return "nothing registered";`) | 1 (the zero-rule pin) | does not apply |
| N1 | the status line says `applying N` again (UI-04 undone) | 4 (the `registered 1` pin, the two rewritten controls, 15) | does not apply |
| N2 | the partial line says `not applied` again | 3 (the partial pin, 15, 17) | does not apply |
| N3 | the zero-rule line says `nothing to apply` again | 2 (the zero-rule pin, 15) | does not apply |
| N4 | the footer's hover text says `Not applied:` again | 1 (16) | does not apply |
| N5 | README's example goes back to `applying 0 · 2 not applied` | 1 (17) | does not apply |
| N6 | `SMOKE.md` expects the dead failure string again (first occurrence) | 1 (18) | does not apply |
| N7 | `PRIVACY.md` says no data leaves your device again | 1 (20) | does not apply |
| N8 | `PRIVACY.md` stops naming `chrome.storage.session` | 1 (19) | does not apply |
| N9 | `PRIVACY.md` says response headers are appended | 1 (R15) | does not apply |
| N10 | the popup makes a network request of its own (`fetch` in `init`) | 1 (22) | applies |
| N11 | the manifest requests `webRequest` | 2 (21, 5) | applies |
| N12 | README's service-worker section is renamed | 1 (23) | does not apply |
| N13 | README's badge bullet stops naming `` `!` `` | 1 (24) | does not apply |

**An existing mutant whose count moves:** "a failed sync claims rules are not
applying" fails 2 today and 3 from commit 3 (check 18 compares `SMOKE.md` with
what `describeSync` returns). "Skipped profiles no longer make the result
partial" gains check 17.

### Commit 4: 5 added, 1 rewritten (195 → 200)

| M | Mutant | Predicted fails | Red |
| --- | --- | --- | --- |
| H1 | rewritten: the side area is dropped from the second line (`"op op value value"`) | 2 (25, 26) | does not apply |
| H2 | the row goes back onto one line (`1fr 56px 82px 1fr 24px`, one area row) | 1 (25) | does not apply |
| H3 | the name's area is renamed in the stylesheet only | 1 (26) | does not apply |
| H4 | the name field's class is renamed in `popup.js` only (`mono h-title`) | 2 (26; ".h-name is queried and is assigned by the same file") | applies |
| H5 | the popup is widened to 480 px (UI-05a arrives early) | 1 (28) | applies |
| H6 | the compact padding is dropped | 1 (27) | does not apply |

"A fixed select width returns" keeps its anchor and its 1. "The h-side hook
is renamed" gains check 26.

### Commit 5: 23 added, 3 rewritten (200 → 223)

| M | Mutant | Predicted fails |
| --- | --- | --- |
| D1 | the profiles budget is raised to Chrome's 10 MB | 5 (29, 31, 32, 34, 35) |
| D2 | the drafts budget is raised to 1 MB | 2 (29, 37) |
| D3 | `storedBytes` counts `<` as one byte | 1 (30) |
| D4 | `storedBytes` forgets the key | 2 (30, 31) |
| D5 | a write that shrinks an over-budget set is refused (no way back) | 1 (32) |
| D6 | once over the budget, any write is let through | 1 (32) |
| D7 | the overage is rounded down | 1 (33) |
| D8 | the save refusal loses its way out | 1 (34) |
| D9 | the import refusal ends itself with a full stop | 1 (35) |
| D10 | the drafts budget counts characters, not bytes | 1 (37) |
| D11 | the store writes a draft over the budget anyway | 4 (38, 40, 41, 42) |
| D12 | the budget is checked on the new draft alone | 1 (42) |
| D13 | the session reports a refused draft as written | 1 (41) |
| D14 | `put` no longer resolves `true` when it wrote | 4 (39, 40, 43; s3's 33) |
| D15 | `saveProfile` skips the budget (`const budget = { ok: true };`) | 1 (44) |
| D16 | a refused save falls through to the write | 1 (44) |
| D17 | Import does not check the budget when the file is chosen | 1 (45) |
| D18 | Replace does not check the budget again | 1 (46) |
| D19 | the draft store is created without the drafts budget | 1 (47) |
| D20 | `persistDraft` ignores a draft that was not kept | 1 (48) |
| D21 | a draft write that throws shows no notice (`let kept = true;`) | 1 (48) |
| D22 | `openEditor` no longer clears the notice | 1 (49) |
| D23 | the notice is visible from the start | 1 (49) |

**Changed:** s3 M19, M31 and M32. M19 is anchored on the store's new budget
line and the write after it, and still swallows the failed write: 1 (s3's
29). M31 and M32 are anchored on `kept = await draftSession.put(…)`: 1 each
(s3's 42), as in s3.

### Commit 6: 14 added (223 → 237)

| M | Mutant | Predicted fails |
| --- | --- | --- |
| X1 | the export stops refusing a colliding set (FINDING-027 returns) | 5 (50, 51, 52, 53, 61) |
| X2 | the export stops refusing a duplicated id | 3 (54, 59, 61) |
| X3 | the export stops refusing more than 5,000 profiles | 3 (55, 57, 61) |
| X4 | the export cap is off by one (5,000 refused) | 1 (56) |
| X5 | the export checks collisions before anything else | 3 (57, 58, 59) |
| X6 | the export checks collisions before duplicated ids | 1 (59) |
| X7 | the export checks each profile before the cap | 1 (57) |
| X8 | the refusal omits the header name | 2 (51, 53) |
| X9 | the refusal names one profile only | 1 (51) |
| X10 | the refusal drops the count of further collisions | 1 (52) |
| X11 | the refusal ends itself with a full stop | 2 (51, 61) |
| X12 | the refusal forgets the response side | 1 (53) |
| X13 | a refused export shows nothing | 1 (62) |
| X14 | a refused export still makes a file | 1 (62) |

On the red tree X13 and X14 apply, anchored on code that predates s5; the
other twelve do not.

### Commit 7: 2 added (237 → 239)

| M | Mutant | Predicted fails |
| --- | --- | --- |
| F1 | the CORS case stops sending `X-HW-Removable` | 1 (63) |
| F2 | row 15.5 goes back to `0 removed` | 1 (64) |

No mutant crashes, in any commit.

## 6. Browser runs in the container, predicted

Headless Chromium 141.0.7390.37 with the commit's own `extension/` copied
and host access to `localhost` added to the copy's manifest, as in §0. Run
after the commit's gates are green and before it is handed over. They add
evidence; they do not replace the s5 sitting on Chrome 154.

| # | After commit | Run | Predicted |
| --- | --- | --- | --- |
| C1 | 2 | the copy loads, its manifest asking for 116 | the worker starts |
| C2 | 2 | §0's AR-23 steps: `X-Debug` set, then an append typed `X-Forwarded-For` | footer `2 profiles · 1/1 domain granted · applying 2`, badge `ON`, no hover text |
| C3 | 2 | the append's card | `req · append · x-forwarded-for → "203.0.113.7"` |
| C4 | 2 | the wire | `x-forwarded-for: 203.0.113.7` and `x-debug: 1` |
| C5 | 2 | `set X-Forwarded-For alpha`, then `append X-Forwarded-For bravo`, both typed with capitals | wire `x-forwarded-for: alpha, bravo` |
| C6 | 3 | one profile registered | footer ends `registered 1` |
| C7 | 3 | two profiles colliding, nothing else | footer ends `registered 0 · 2 not registered`, hover `Not registered: profile 1; profile 2`, badge `!` |
| C8 | 3 | no profiles, toggle on | footer `0 profiles · 0/0 domains granted · nothing registered`, on two lines |
| C9 | 4 | the editor with §0's six names | name 293 px, value 174 px; the three long names fit; three rows give a 592 px popup; the form scrolls from the 4th row |
| C10 | 5 | stored profiles just under the budget; Save a profile that takes them over | the form shows the save refusal with the overage in KB, the editor stays open, `getBytesInUse("hw:profiles")` unchanged |
| C11 | 5 | choose a file whose profiles are over the budget | `Import failed: this file's profiles are … over HeaderWright's 4 MB storage limit. …`, no Replace offered, nothing stored |
| C12 | 5 | a value of 140,000 characters in the editor | the notice shows, and the stored draft is the one before |
| C13 | 5 | §0's session filler, then 412 characters | the notice shows: the browser's refusal is shown too |
| C14 | 6 | two colliding profiles stored ("Alpha", "Beta"), then Export | `Export failed: "Alpha" and "Beta" both write header "x-h" on overlapping domains — refusing to export a set that cannot be re-imported. Change the header or the domains in one of them, then export.`, and no download |

> **Outcome (commit 2, Chromium 141.0.7390.37, 2026-10-09): C1–C5 as
> predicted.** C1: the copy loaded with `minimum_chrome_version` 116, and its
> worker started. C2: `2 profiles · 1/1 domain granted · applying 2`, badge
> `ON`, no hover text. C3: `req · append · x-forwarded-for →
> "203.0.113.7"`, beside `req · set · X-Debug → "1"` on the other card. C4:
> the server received `x-forwarded-for: 203.0.113.7` and `x-debug: 1`. C5:
> `x-forwarded-for: alpha, bravo`, and the card read `req · set ·
> X-Forwarded-For → "alpha"` and `req · append · x-forwarded-for →
> "bravo"`. The stored profiles kept `X-Debug` and `X-Forwarded-For` as
> typed. No page errors.

## 7. What s5 leaves for later

**The s5 sitting**, Chrome 154 or later, its runbook frozen first.
`git pull`, then **Reload** in `chrome://extensions` (the manifest moves;
Reload clears drafts), then read `minimum_chrome_version` as 116. Rows: the
footer's words and hover text (UI-04); the editor's field widths and three
long names (UI-03); the save refusal, the import refusal and the draft
notice (DR-02); an export refusal and no file (AR-16, and DR-01b with it);
row 15.5 through the CORS case with the instruments restarted after the
pull, because the oracle's build stamp moves (F-045). Read DevTools' Issues
once with the editor open, since commit 5 adds an element (recorded, not
counted).

**The release session (v0.2.4):** the copy debts of S5-D11; the listing's
floor (DR-03b); a read of whether the listing quotes the status words;
NEXT.md's line that the About text equals `manifest.description`.

**GATE-0d:** `extension/` has 19 files, so identity is 14 files by bytes and
4 icons by pixels; the installed manifest by content, now with
`minimum_chrome_version` 116 read and not counted; A-P6 and every status
string re-read from the v0.2.4 source; the install revision predicted from
the tag, expected `69709b56`.

**Rows raised in s5 and not fixed in it:** DR-03b (the release session),
UI-08 and AR-05c (`slice:scope`), UI-05a (S5-D15).

## 8. Outcomes

(Recorded under each prediction above, after the code runs.)
