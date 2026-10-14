# PREDICTIONS — UI-05a code: v0.3.0, the header rules table in a 480 px popup — 2026-10-13

> **FROZEN ON COMMIT.** Written against `f5d94ffb466899d0da21d459d4799164b9f85c10`
> before any line of the change exists, test or product. Nothing below may be
> edited after the code runs. Outcomes are recorded UNDER each prediction, and
> a wrong prediction keeps its original wording.
>
> Rulings: UA1–UA10, ruled by Ash on 2026-10-13 at 20:33 CT (2026-10-14 01:33
> UTC), "As recommended", before this file was written. §1 records them, with
> the copy they fix word for word. They go into `antrixy/project-planning`
> `decisions.md` in the commit after this one. Four points fixed here beyond
> the rulings' words are listed at the end of §1; they were put to Ash before
> the freeze. No version bump, no tag, no package, no store upload, no listing
> edit, no browser sitting and no launch activity in this session. Not in
> scope: FEAT-3 (the On column), UI-05 (step 2: collapsible cards, chips,
> badges, masked secrets), AR-14.

## 0. Baseline, measured before this file was written

**Inputs**, SHA-pinned archives attached 2026-10-13, each checked before
anything was read:

- headerwright: archive sha256
  `f3f96fb705b779d6efd1484c074ed77cb7c995dd573d233116aa4e0e80235292`
  (635,340 bytes). Embedded commit `f5d94ffb466899d0da21d459d4799164b9f85c10`,
  tree `02d9c06df9fffe73170732e0c9953d80c0de7a1e` (72 files); `LEDGER.md`,
  `SCOPE.md` and `FINDINGS.md` sha256 `7569d155…`, `e88b5f30…`, `ba9ee75d…`.
  All match the pinned values.
- project-planning: archive sha256
  `a1fa1022e5cce107e4f17d7b9a5dca936f530e4e7e062dcc58e3f655faa48770`
  (1,475,618 bytes). Embedded commit `3e630e605fa19bd896362e7e19f51e4a8982881c`,
  tree `c851e7a4e019e5103a19bb00456ae8a98b0fdf0f` (83 files);
  `handoffs/headerwright/NEXT.md` sha256 `893d6496…`, `decisions.md` sha256
  `633ee2a8…`. All match.
- Over git, read 2026-10-13: `main` is `f5d94ff`. Tag `v0.2.3` is annotated
  `ff0f68e` and peels to `0faede2`; `v0.2.4` is annotated `394805f` and peels
  to `f86f18b`. `main`'s `extension/` is tree `b2964d38…`, `f86f18b`'s, and no
  commit after `f86f18b` touches it.

**Gates.** `node test/verify.mjs` at `f5d94ff`, in a fresh clone: all 7
gates pass, 668 checks, 239 mutation scenarios (mutate-collisions 224,
mutate-scans 8, mutate-grants 7), the syntax gate over 26 files, in 223 s
(container: Node 22.22.0, Python 3.13.16).

**The browser used below** is headless Chromium `141.0.7390.37`
(Playwright's build), loading a copy of `extension/` unpacked, its manifest
given `host_permissions` for `*://localhost/*` and `*://*.localhost/*` so that
the profiles below register without a prompt; the product code is
unchanged. Profiles are written to `chrome.storage.local` from an extension
page, and the popup page is read after the worker's sync record lands. The
probes are container scratch, not committed; their outputs are quoted here.
Where a measurement needs the ruled layout, the ruled CSS (§2, commits 2 and
3) is injected into the unchanged page, and for the table a probe script
rebuilds each card's readback lines as UA2's table from the lines' own text.

**Fonts and scrollbars, which most numbers below depend on.** In the
container `ui-monospace` falls back to DejaVu Sans Mono, 6.92 px per
character at 11.5 px and 6.62 at 11 px; `system-ui` is Inter. On the Mac they
are SF Mono and the system font. Pixel widths and heights below are this
container's; widths stated in characters of a monospace font should hold
within a character on the Mac, and the column labels' widths do not. Headless
Chromium draws overlay scrollbars (0 px); launched without
`--hide-scrollbars` it draws classic ones, 15 px. The Mac shows overlay
scrollbars unless System Settings says to always show them.

### The frame, the editor and the footer (UA1, UA6)

| | 380 px (today) | 480 px (UA1 injected) |
| --- | ---: | ---: |
| card content width | 346 px | 446 px |
| editor name field / value field | 293 / 174 px | 393 / 274 px |
| `X-Forwarded-For`, `Access-Control-Allow-Origin`, `Content-Security-Policy` fit their field | all three | all three |
| footer `0 profiles · 0/0 domains granted · nothing registered` (53 characters) | two lines, 46.9 px | one line, 30.9 px |
| editor with three header rows, toggle on, no profiles | popup 600, form scrolls 8 px (506 in 498) | popup 592, form does not scroll (506 in 506) |
| the same with four rows | 600, scrolls | 600, scrolls (573 in 514) |

With classic scrollbars the editor's fields are 15 px narrower at either
width (278 / 159 at 380, 378 / 259 at 480).

**The footer at 480 px:** one line up to 65 characters and two from 70:
`1 profile · 1/1 domain granted · registered 1` (45), the 53-character line
above, and `2 profiles · 1/1 domain granted · registered 0 · 2 not
registered` (65) take one line (30.9 px); `12 profiles · 10/14 domains granted ·
registered 10 · 2 not registered` (70), the failed line (83) and the checking
line (87) take two (46.9 px). At 380 px only the 45-character line takes one.
The footer is 448 px of `ui-monospace` 11 px at 480, about 67 characters.

### The card today, and as UA2's table (UA2, UA5, UA6)

The mock's open card (`design/headerwright/`, without its On column), stored
as profile "Billing sandbox" on `localhost`: request `Authorization` set
`Bearer eyJhbGciOiJIUzI1NiJ9.dXJl`, request `X-Forwarded-For` append
`203.0.113.7`, request `Cookie` remove, response `Cache-Control` set
`no-store, max-age=0`, response `X-Frame-Options` remove. Chrome registered
the append's name as `x-forwarded-for` (AR-23).

| | lines at 380 | lines at 480 | UA2's table at 480 |
| --- | ---: | ---: | ---: |
| card height | 217.3 px | 201.2 px | 251.3 px |
| one entry | 16.1 px a line; 32.2 when it wraps | 16.1 / 32.2 | a row of 21.1 px |

The table: 422 px wide; columns Type 37.4, Action 52.5, Header 114.9 and
Value 216.2 px (215 px inside the cell, about 31 characters). Only the
`Authorization` value is longer than its column: `scrollWidth` 245 against
`clientWidth` 215. The caption and the column heads add about 41 px to the
card; each row adds 5 px over a one-line entry.

Three more cards, as tables at 480:

| card | Header | Value | row | Value cut |
| --- | ---: | ---: | ---: | --- |
| "CSP": response `Content-Security-Policy` set `default-src 'self'` | 170.3 | 167.9 | 21.1 | no (167 in 167) |
| "Long name": request `X-HeaderWright-A-Very-Long-Custom-Header-Name-For-Testing` (57 characters) set `v` | 211.0 (200 px of text) | 127.1 | 53.3, the name on three lines, whole | no |
| "Spaces": request `X-Pad` set `  padded  `, request `X-Gap` set `a  b` | 49.9 (its label) | 288.3 | 21.1 | no |

The Header column is never narrower than its label `Header` (49.9 px here,
in the label's font) and holds at most 200 px of name; a longer name wraps at
any character inside it.

**With classic scrollbars** and eight profiles, so the list scrolls: the
table is 407 px and the mock card's Value column 201.2 px (200 inside). A
value whose shown text is 29 to 31 characters fits without the scrollbar and
is cut with it.

### FINDING-054, found while measuring

On the "Spaces" card today, `getDynamicRules()` returns the values exactly
(`"  padded  "`, `"a  b"`), and so does each line's `textContent`. What is
painted is not: the lines' `innerText` reads `req · set · X-Pad → " padded "`
and `req · set · X-Gap → "a b"`. The line's CSS is `white-space: normal`,
which collapses a run of spaces when painting. The quotes FINDING-040's fix
added so that edge whitespace is visible show it collapsed. Values with runs
of spaces pass the validator, and `readForm` does not trim values. In UA2's
table with `white-space: pre` on the Value cell, `innerText` equals
`textContent` for both. Raised here as FINDING-054 and row UI-09 (§1, end).

### DevTools Issues (AR-19, UA7)

Read through the protocol's Audits domain, not the panel, as in s5. On the
unchanged product the list view raises only
`FormLabelHasNeitherForNorNestedInput` issues, and opening the editor with
three header rows adds `FormEmptyIdAndNameAttributesForInputError`, four per
row. With UA2's table built into the page, no issue of a new kind appeared.
Counts through this domain repeat across reloads, so kinds are compared here
and the panel's counts stay the sitting's.

### Hashes at `f5d94ff` of the files this change touches, for the outcomes

`extension/lib/readback.js` `98063349…`, `extension/popup/popup.js`
`5cce0344…`, `extension/popup/popup.html` `692c7de2…`, `README.md`
`443e5b7e…`, `test/SMOKE.md` `ae89b969…`, `test/selftest.mjs` `94a8374f…`,
`test/mutate-collisions.py` `b0813487…`, `test/mutate-scans.py` `6be29b41…`,
`LEDGER.md` `7569d155…`, `FINDINGS.md` `ba9ee75d…`.

## 1. Rulings, as ruled

- **UA1, the frame.** `body` goes from 380 to 480 px wide. The 600 px max
  height and everything else in the frame stay as they are.
- **UA2, the columns.** One real `<table>` per card, captioned "Header
  rules", with the columns Type (`req` / `res`), Action, Header and Value.
  Cells use the readback's font, `ui-monospace` 11.5 px. Type and Action
  shrink to their content. Header is sized by CSS to the card's longest name:
  at least its label, at most 200 px of text (about 28 characters); a longer
  name wraps at any character and is never cut. Value takes the rest, shown
  as `JSON.stringify(value)`, quotes included, as today. A remove, or an
  entry with no value, shows `—` (U+2014).
- **UA3, what "cut" means.** A value is cut when the Value cell's
  `scrollWidth > clientWidth`, measured once the card is in the DOM. The cut
  shows a visible `…`. A `ResizeObserver` measures again when the width
  changes without a render, as when a confirm box makes the scrollbar appear.
- **UA4, the full value.** One shared popover in the top layer, placed by
  `popup.js` below the cell, or above it when there is no room (the last
  row). It shows exactly the cell's string, wraps, and scrolls if the value
  is taller than the space. It stays open while the pointer is over the cell
  or the popover. Only a cut cell gets `tabindex="0"`, removed again if a
  re-measure finds the value fits. The popover's text is predicted, and in
  a sitting compared with the cell's by its bytes in the console.
  Rejected: `title` (no keyboard, and declined for FINDING-043 on
  2026-09-21) and expanding the cell in place (the rows move).
- **UA5, the table is the readback.** It is still the registered rule, with
  every note unchanged: checking, off, previous, none, unreadable. A profile
  whose headers are stored but not registered (ungranted, colliding or
  skipped) keeps `No rule registered for this profile`, with no table. A
  dated amendment to constraint 1 of the 2026-09-21 ruling limits it to
  names: a value may be cut, but only with a visible `…`, and always opens in
  full. AR-14 stays open: the popover still shows a secret whole.
- **UA6, what the frame moves.** Measured here (§0), not built: the editor's
  fields widen by 100 px; most footer lines fit on one line; the add bar,
  markers, confirm boxes and chips only widen, with no CSS change.
  FINDING-030 is reached sooner, since a table row is taller than a line;
  recorded, not fixed.
- **UA7, accessibility.** `<caption>` and `<th scope="col">`. A screen
  reader is expected to read a cut value whole, since the ellipsis is painted
  and the cell's text is whole; that rests on the specification, and no
  screen reader has run in any sitting. The popover is `aria-hidden`, since it
  repeats the cell. The Issues are predicted not to change (§0 for the kinds).
- **UA8, commits and checks.** (1) This file, alone, then the rulings into
  project-planning; (2) the frame; (3) the table; (4) cut values: the
  measurement, the tab stop, the observer and the popover, with UI-05a to
  `fixed-unverified`. Each commit runs red in the container with its
  predicted count before its code, then the Chromium 141 runs of §6.
- **UA9, step 2's timing.** After FEAT-1 (v0.5.0). The UI-05 row already
  says so. "After v0.4.0" in S5-D14 and in the redesign entry's amendment was
  written on 2026-10-06, before S5-D15 renumbered FEAT-1 from v0.4.0 to
  v0.5.0; a dated note under each, in project-planning's rulings commit; the
  dated text stays as written.
- **UA10, the name.** UA.

### The copy, word for word

**The table (`lib/readback.js`):** caption `Header rules`; column heads
`Type`, `Action`, `Header`, `Value`; Type `req` or `res`; Action as
registered; Header the registered name, whole; Value `JSON.stringify(value)`,
or `—` (U+2014) for a remove or an entry with no value. The notes are
`READBACK_NOTES`, unchanged.

**README** (commit 3), replacing the paragraph that begins "**As of v0.2.0,
each profile card also shows the rule Chrome has actually registered**":

      **Each profile card also shows the rule Chrome has actually
      registered**, as a table under "Header rules", one row per header: Type
      (`req` for the request, `res` for the response), Action (`set`,
      `append` or `remove`), Header, the full name, and Value, in quotes, or
      `—` for a remove. It is read from Chrome each time the popup draws, not
      from what was saved, so if it differs from what you meant, the card is
      right and the form was wrong. While a change is still being registered
      the card says so rather than showing the previous rule. The card has
      shown this since v0.2.0, as a table since v0.3.0.

Commit 4 adds, after "or `—` for a remove.": `A value too long for its
column ends in `…`; point at it, or tab to it, to see it in full.`

**`test/SMOKE.md`, Part 16** (commit 3), a paragraph after "**Added
2026-09-21, UNVERIFIED until a sitting runs it.** …":

    **Amended for v0.3.0 (UI-05a, ruled UA2–UA5 on 2026-10-13).** The card
    shows the registered rule as a table captioned "Header rules", one row
    per entry, with the columns Type, Action, Header and Value, not as lines.
    Read each predicted line below as the row with the same four parts:
    `res · set · X-HW-Oracle → "rewritten"` is Type `res`, Action `set`,
    Header `X-HW-Oracle` and Value `"rewritten"`; a line with no arrow has
    `—` in Value. The notes (`Off — nothing registered`, `Checking what
    Chrome has registered…`) are unchanged and show no table. A header name
    is never cut; a value longer than its column ends in `…`.

Row 16.5's prediction becomes: `the full name in the Header column, wrapped
if it must be; the name is never cut; a value longer than its column ends in
… (amended for v0.3.0)`, and its record line `16.5 name in full, never cut
= ?`. Commit 4 adds two rows and their record lines:

    | 16.9 | add request `X-HW-Long` / `set` / `abcdefghijklmnopqrstuvwxyz0123456789abcdefghij` (46 characters) | the value ends in `…`; pointing at it, and tabbing to it, each show it whole; in the popup's console, `document.getElementById("value-popover").textContent`, then the line `` $_ === String.raw`"abcdefghijklmnopqrstuvwxyz0123456789abcdefghij"` ``, reads `true` |
    | 16.10 | from the card's Delete button, press Tab | focus stops on the cut value and on no value that fits, then leaves the table |

    16.9 popover equals the cell, by bytes = ?
    16.10 tab stops on cut values only     = ?

**`FINDINGS.md`** (commit 3): **FINDING-054 — the card's readback line
showed a run of spaces in a value as one space.** Symptom, cause and
measurement as §0 above; fix: the Value cell is `white-space: pre`, which
keeps every space on one line, and the popover is `pre-wrap`; evidence:
check 14 and C7; the lesson: "A check that reads a text node proves what was
written, not what is painted."

### Beyond the rulings' words, put to Ash before the freeze

1. **FINDING-054 and row UI-09** (low, `v0.3.0`, prior FINDING-054, evidence
   `reproduced`), raised by this file and fixed by commit 3's Value cell,
   which is UI-05a's to style. UI-09 moves to `fixed-unverified` in commit 3.
   Target summary `v0.3.0` 1 → 2, total 61 → 62.
2. **"Room" for the popover is the list's visible area**, `main`'s top and
   bottom edges, not the window's, so it opens above a cell near the add bar
   and never covers the footer.
3. **The popover shows the value only.** The design's name and append notes
   are step 2's.
4. **The table sits where the lines sat**, between the header count and the
   domain chips; `formatReadbackLine` stays in `lib/readback.js`, and check 7
   ties every row to it, so the table and the line wording the runbooks quote
   cannot disagree.

## 2. Design, fixed before the build

Each commit is built in the container in three steps: its checks and mutants
first, run RED against the tree before it (§3); then its product change,
green (§4) with its mutants (§5); then its browser runs (§6). Each lands from
a fresh clone on the Mac through a guarded command. New `lib/` symbols reach
`selftest.mjs` through a namespace import, `import * as readbackLib`, so a
missing export reads as FAIL lines, never a crash; every call into them goes
through `attempt()`. No check passes on two failures: each requires what it
reads first. No comment in `popup.js` quotes a statement §3 scans for, and
none contains an `innerHTML` assignment. Pixel numbers in §6 are this
container's (§0).

### Commit 2: the frame (UA1)

**`extension/popup/popup.html`:** in the `body` rule, `width: 380px;` →
`width: 480px;`. A comment line above the rule: "480 px wide since v0.3.0
(UI-05a, UA1): the header rules table needs the width. Chrome allows an
action popup up to 800 px wide and 600 px high." It does not contain the
text the check reads (`body {` followed by a width declaration). Nothing
else changes.

**`test/selftest.mjs`:** s5's check 28, "UI-03: the popup is still 380 px
wide", becomes "UA1: the popup is 480 px wide", `/body \{[^}]*width:
480px;/`. `EXPECTED_CHECKS` stays 668.

**`test/mutate-collisions.py`:** "s5 H5 the popup is widened to 480 px
(UI-05a arrives early)" is rewritten as "ua W1 the popup goes back to 380 px"
(anchor `  body {\n    width: 480px;`). Mutation scenarios stay 239.

**Records.** None: UI-05a moves at commit 4.

### Commit 3: the table (UA2, UA5, UA7)

**`extension/lib/readback.js`**, added after `formatReadbackLine`, which is
unchanged:

    export const READBACK_CAPTION = "Header rules";
    export const READBACK_COLUMNS = Object.freeze(["Type", "Action", "Header", "Value"]);
    export const READBACK_NO_VALUE = "—";

    export function readbackCells(line) {
      const noValue = line.operation === "remove" || line.value === undefined;
      return {
        type: line.side,
        action: line.operation,
        header: line.header,
        value: noValue ? READBACK_NO_VALUE : JSON.stringify(line.value),
      };
    }

with a comment citing UA2 and FINDING-043: the name is never shortened; the
value is the line's value, so a cell and a line cannot disagree.

**`extension/popup/popup.js`:** the import from `../lib/readback.js` becomes
`describeReadback, readbackCells, READBACK_CAPTION, READBACK_COLUMNS,
READBACK_NOTES` (`formatReadbackLine` is no longer used here). In
`renderProfileCard` the loop over `readback.lines` that wrote one
`.readback-line` per entry is replaced by

      if (readback.lines.length > 0) {
        readbackBox.appendChild(renderReadbackTable(readback.lines));
      }

after the note, which is written as before. A new function after
`renderProfileCard`:

    function renderReadbackTable(lines) {
      const table = document.createElement("table");
      table.className = "rules";
      const caption = document.createElement("caption");
      caption.textContent = READBACK_CAPTION;
      const head = document.createElement("tr");
      for (const label of READBACK_COLUMNS) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = label;
        head.appendChild(th);
      }
      const thead = document.createElement("thead");
      thead.appendChild(head);
      const tbody = document.createElement("tbody");
      for (const line of lines) {
        const cells = readbackCells(line);
        const row = document.createElement("tr");
        const type = document.createElement("td");
        type.className = "rb-type";
        type.textContent = cells.type;
        const action = document.createElement("td");
        action.className = "rb-action";
        action.textContent = cells.action;
        const header = document.createElement("td");
        header.className = "rb-header";
        const name = document.createElement("div");
        name.className = "rb-name";
        name.textContent = cells.header;
        header.appendChild(name);
        const value = document.createElement("td");
        value.className = "rb-value";
        value.textContent = cells.value;
        row.append(type, action, header, value);
        tbody.appendChild(row);
      }
      table.append(caption, thead, tbody);
      return table;
    }

The card's order is unchanged: name and buttons, the header count, the
readback box (note, then table), the chips, then the markers.

**`extension/popup/popup.html`:** the `.profile .readback-line` rule and its
comment are replaced by the rules below and a comment that cites UA2, UA5
and the 2026-09-21 constraint as amended (names never cut; a value cut only
with `…`, and always reachable whole):

      .profile .rules {
        width: 100%; border-collapse: collapse; margin-top: 2px;
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 11.5px; line-height: 1.4;
      }
      .profile .rules caption {
        caption-side: top; text-align: left; padding: 0 0 3px;
        font: 600 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .profile .rules th, .profile .rules td {
        border: 1px solid var(--line); padding: 2px 5px;
        text-align: left; vertical-align: top;
      }
      .profile .rules th {
        font: 600 11px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
        color: var(--ink-soft);
      }
      .profile .rules .rb-type, .profile .rules .rb-action { white-space: nowrap; }
      .profile .rules .rb-name { width: max-content; max-width: 200px; overflow-wrap: anywhere; }
      .profile .rules .rb-value {
        width: 100%; max-width: 0;
        overflow: hidden; text-overflow: ellipsis; white-space: pre;
      }

`.profile .readback` and `.profile .readback-note` are kept.

**README and `test/SMOKE.md`:** as §1 gives them.

**`test/selftest.mjs`:** checks 1–8 after the readback section's last check
(rb15), through `readbackLib`; checks 9–17 beside the readback source scans.
The check "RB: readback lines wrap and never clip" is removed: the rule it
read is gone, and checks 13 and 14 hold its ground. The check "RB: readback
lines are written with textContent, never innerHTML" is rewritten for the
cells (§3). `EXPECTED_CHECKS` 668 → 684.

**`test/mutate-collisions.py`:** fourteen mutants, T1–T14 (§5).
**`test/mutate-scans.py`:** M11 and M12 rewritten for the table, each with
its expect (§5); "the comment stripper also eats string literals" 20 → 21.

**Records.** `FINDINGS.md`: FINDING-054 (§1). `LEDGER.md`: UI-09 new,
`fixed-unverified`, low, `v0.3.0`, prior `FINDING-054`, evidence
`reproduced`; target summary `v0.3.0` 1 → 2, total 61 → 62; the Last amended
line. LEDGER's contract checks 1–8 are run by a script before the commit.

### Commit 4: cut values (UA3, UA4, UA7)

**`extension/lib/readback.js`**, added:

    export function valueIsCut(scrollWidth, clientWidth) {
      return Number.isFinite(scrollWidth) && Number.isFinite(clientWidth) &&
        scrollWidth > clientWidth;
    }

    export function placeValuePopover({ cell, bounds, viewportHeight, height }) {
      const below = bounds.bottom - cell.bottom;
      const above = cell.top - bounds.top;
      const openBelow = height <= below || below >= above;
      return {
        top: openBelow ? cell.bottom : null,
        bottom: openBelow ? null : viewportHeight - cell.top,
        maxHeight: Math.max(0, openBelow ? below : above),
      };
    }

`cell` and `bounds` are rectangles in viewport pixels; `bounds` is the list's
visible area; `height` is the popover's height before it is limited. It
opens below when it fits there, above when it does not and there is more
room above, and otherwise below; it is never taller than the room on its
side.

**`extension/popup/popup.html`:** one element after `</main>`, before the
footer, outside `#profile-list`, which every render clears:

      <div id="value-popover" class="value-popover" popover="manual" aria-hidden="true"></div>

with a comment citing UA4 and UA7. Two rules:

      .profile .rules .rb-value.cut:focus-visible { outline: 2px solid var(--on); outline-offset: -2px; }
      .value-popover {
        position: fixed; inset: auto; margin: 0;
        overflow-y: auto; padding: 5px 7px;
        border: 1px solid var(--line); border-radius: 6px;
        background: var(--surface); color: var(--ink);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: 11.5px; line-height: 1.4;
        white-space: pre-wrap; overflow-wrap: anywhere;
      }

**`extension/popup/popup.js`:** the readback import adds `valueIsCut` and
`placeValuePopover`. New, after `renderReadbackTable`:

    const valuePopover = $("value-popover");
    let valuePopoverCell = null;

    function measureValueCell(cell) {
      const cut = valueIsCut(cell.scrollWidth, cell.clientWidth);
      cell.classList.toggle("cut", cut);
      if (cut) cell.tabIndex = 0;
      else cell.removeAttribute("tabindex");
    }

    const valueCellObserver = new ResizeObserver((entries) => {
      for (const entry of entries) measureValueCell(entry.target);
    });

    function showValuePopover(cell) {
      valuePopoverCell = cell;
      valuePopover.textContent = cell.textContent;
      const table = cell.closest("table").getBoundingClientRect();
      valuePopover.style.left = `${table.left}px`;
      valuePopover.style.maxWidth = `${table.width}px`;
      valuePopover.style.maxHeight = "";
      valuePopover.style.top = "";
      valuePopover.style.bottom = "";
      if (!valuePopover.matches(":popover-open")) valuePopover.showPopover();
      const main = document.querySelector("main").getBoundingClientRect();
      const place = placeValuePopover({
        cell: cell.getBoundingClientRect(),
        bounds: { top: main.top, bottom: main.bottom },
        viewportHeight: window.innerHeight,
        height: valuePopover.offsetHeight,
      });
      valuePopover.style.maxHeight = `${place.maxHeight}px`;
      if (place.top !== null) valuePopover.style.top = `${place.top}px`;
      else valuePopover.style.bottom = `${place.bottom}px`;
    }

    function hideValuePopover() {
      valuePopoverCell = null;
      if (valuePopover.matches(":popover-open")) valuePopover.hidePopover();
    }

The listeners, registered once where the popup's other listeners are:

    const profileList = $("profile-list");
    profileList.addEventListener("mouseover", (event) => {
      const cell = event.target.closest(".rb-value.cut");
      if (cell && cell !== valuePopoverCell) showValuePopover(cell);
    });
    profileList.addEventListener("mouseout", (event) => {
      const cell = event.target.closest(".rb-value.cut");
      if (cell && !valuePopover.contains(event.relatedTarget)) hideValuePopover();
    });
    profileList.addEventListener("focusin", (event) => {
      if (event.target.matches(".rb-value.cut")) showValuePopover(event.target);
    });
    profileList.addEventListener("focusout", (event) => {
      if (event.target.matches(".rb-value.cut")) hideValuePopover();
    });
    valuePopover.addEventListener("mouseleave", (event) => {
      if (!(valuePopoverCell && valuePopoverCell.contains(event.relatedTarget))) hideValuePopover();
    });
    document.querySelector("main").addEventListener("scroll", hideValuePopover, { passive: true });

**`renderListNow`:** right after `list.textContent = "";`,

      valueCellObserver.disconnect();
      hideValuePopover();

and right after the loop that appends the cards,

      for (const cell of list.querySelectorAll(".rb-value")) {
        measureValueCell(cell);
        valueCellObserver.observe(cell);
      }

A list rendered while the editor is showing measures every cell as not cut
(both widths 0); when the list shows again the observer measures it.

**README and `test/SMOKE.md`:** as §1 gives them.

**`test/selftest.mjs`:** checks 18–21 after check 8, through `readbackLib`;
checks 22–33 after check 17. `EXPECTED_CHECKS` 684 → 700.
**`test/mutate-collisions.py`:** seventeen mutants, V1–V17 (§5).
**`test/mutate-scans.py`:** "the comment stripper also eats string literals"
21 → 25.

**Records.** `LEDGER.md`: UI-05a → `fixed-unverified`, evidence `design` →
`reproduced` (§0 and §6), its cell recording the commits, the container runs
and that the sitting is owed; the Last amended line. LEDGER's contract checks
1–8 by a script before the commit.

### Known limits, stated

- **Fonts and scrollbars.** Every pixel figure is the container's. On the
  Mac the label widths differ, the monospace widths differ by about a
  character or less, and classic scrollbars, if shown, take 15 px from the
  table.
- **A cut under one pixel.** `scrollWidth` and `clientWidth` are whole
  pixels. A value that overflows by a fraction of a pixel may paint `…` and
  not be measured as cut: no tab stop and no popover for it.
- **No screen reader has run.** UA7's reading is the specification's.
- **Escape.** In an action popup Escape closes the popup; the popover has no
  key of its own to dismiss it, so it stays until the pointer or the focus
  leaves.
- **Web platform features are not in `test/platform-floor.mjs`.** The
  popover (Chrome 114) and `ResizeObserver` (Chrome 64) are below the 116
  floor; the registry tracks `chrome.*` APIs, manifest keys, permissions and
  rule parts, not web APIs. Recorded, not raised.
- **FINDING-030 is reached sooner.** The mock card is 50 px taller as a
  table than as lines at 480 px (§0). Not fixed here.
- **AR-14** stays open: the cell cuts a long secret and the popover shows it
  whole.

## 3. Checks, numbered, with the predicted red result

Each commit's checks run red against the tree before its product change:
the checks and the mutants exist; the product, README and `SMOKE.md` do not
change yet.

### Commit 2, the frame: one check changed

| Check | Red |
| --- | --- |
| s5's 28, "UI-03: the popup is still 380 px wide", becomes "UA1: the popup is 480 px wide" | FAIL |

**Red run: `selftest: 1 of 668 checks FAILED`,** the rewritten check.

**Other gates on the red tree: 4 of 7 fail.** selftest; mutate-collisions
(`PATCH DID NOT APPLY` for exactly ua W1); mutate-grants and mutate-scans
(every count 1 higher). module-syntax (26 files), oracle-selfcheck and
initiator-selfcheck pass.

> **Outcome (red, 2026-10-14 in UTC and CT alike): as predicted, `selftest:
> 1 of 668 checks FAILED`,** the one failure read by name: "UA1: the popup is
> 480 px wide". No crash.
>
> **Outcome (red tree, all gates): 4 of 7 failed, as predicted, and for the
> predicted reasons.** selftest; mutate-collisions (`PATCH DID NOT APPLY`
> for exactly ua W1, read in a full run of the harness); mutate-grants and
> mutate-scans (`MUTANTS NOT MATCHING EXPECT`, every count 1 higher, read row
> by row). module-syntax (26 files), oracle-selfcheck and initiator-selfcheck
> passed.

### Commit 3, the table: checks 1–17, one removed, one changed

Fixtures are the readback section's: `rb4` (request set `X-HW-Probe`
`present`, request append `X-HW-Second` `b`, response set `X-HW-Oracle`
`rewritten`), `rb6` (response remove `X-HW-Removable`), `rb7` (empty value),
`rb8` (the 57-character name), `rb9` (response set `X-HW-Removable`
`present`), `rb10` (the X-Forwarded pair), `rb13` (`  padded  `).

| # | Check | Red |
| --- | --- | --- |
| 1 | UA2: `readbackCells` is a function, `READBACK_CAPTION` is `Header rules`, `READBACK_COLUMNS` is `Type, Action, Header, Value`, and `READBACK_NO_VALUE` is U+2014 | FAIL |
| 2 | UA2: a request set's cells are `req`, `set`, `X-HW-Probe` and `"present"` (rb4's first line) | FAIL |
| 3 | UA2: an entry from `responseHeaders` has Type `res` and one from `requestHeaders` `req` (rb4's third and first lines) | FAIL |
| 4 | UA2: a remove's Value cell is `—`, one character (rb6) | FAIL |
| 5 | UA2: an empty value is `""` and edge whitespace survives inside the quotes (rb7, rb13) | FAIL |
| 6 | UA2: a 40+ character name is whole in its Header cell (rb8) | FAIL |
| 7 | UA2: for every line of rb4, rb6, rb7, rb8, rb9, rb10 and rb13 (ten), the cells joined as `type · action · header`, plus ` → value` unless Value is `—`, equal `formatReadbackLine(line)` | FAIL |
| 8 | UA2: F040's invisible variant reads `set` and `"present"`, and no cell says `remove` (rb9) | FAIL |
| 9 | UA5: `renderProfileCard` writes the note as before and then, only when `readback.lines.length > 0`, appends `renderReadbackTable(readback.lines)` | FAIL |
| 10 | UA2/UA7: `renderReadbackTable` gives the table a caption from `READBACK_CAPTION`, a `th` with `scope = "col"` for each of `READBACK_COLUMNS` in a `thead`, and appends caption, thead and tbody | FAIL |
| 11 | UA2: each row's cells come from `readbackCells(line)`, are written with `textContent`, and are appended in the order Type, Action, Header, Value | FAIL |
| 12 | UA2: the cells' classes are `rb-type`, `rb-action`, `rb-header` (the name in `rb-name`) and `rb-value`, and `rb-type`, `rb-action`, `rb-name` and `rb-value` each have a rule in the stylesheet | FAIL |
| 13 | UA2/UA5: a name is never cut: `.rb-name` is `width: max-content`, `max-width: 200px`, `overflow-wrap: anywhere`, and no rule on `.rb-name` or `.rb-header` hides overflow, adds `text-overflow`, or sets `nowrap` or `pre` | FAIL |
| 14 | UA2/UA3, FINDING-054: the Value cell takes the remaining width (`width: 100%; max-width: 0`) and cuts on one line with a visible ellipsis, keeping its spaces (`overflow: hidden`, `text-overflow: ellipsis`, `white-space: pre`) | FAIL |
| 15 | UA2: the table is full width, borders collapsed, in `ui-monospace` 11.5 px | FAIL |
| 16 | UA2: README's paragraph holding `"Header rules"` (the caption, from `readbackLib`) names the four columns, and README no longer says "one line per header" | FAIL |
| 17 | UA2: `SMOKE.md` Part 16 carries the amendment (`UI-05a`, the caption in quotes, the four columns), and row 16.5 says "never cut" and no longer "no `…` anywhere" | FAIL |

**Removed:** "RB: readback lines wrap and never clip". **Changed:** "RB:
readback lines are written with textContent, never innerHTML" becomes "RB:
readback cells are written with textContent, never innerHTML": it requires
`renderReadbackTable` to be found and to call `readbackCells(line)`, and
neither it nor `renderProfileCard` to assign `innerHTML`. Red: **FAIL**. Its
pattern no longer reads a double-quoted string; checks 10 and 12 do.

**Red run: `selftest: 18 of 684 checks FAILED`:** checks 1–17 and the
changed check. No crash.

**Other gates on the red tree: 4 of 7 fail.** selftest; mutate-collisions
(`PATCH DID NOT APPLY` for exactly T1–T14); mutate-scans (M11 and M12 do not
apply; five of the other six read 18 higher, and "the comment stripper also
eats string literals" 16 higher, 37 against its new 21, since checks 10, 12
and the changed RB check are among the 18); mutate-grants (every count 18
higher). module-syntax (26 files), oracle-selfcheck and initiator-selfcheck
pass.

> **Outcome (red, 2026-10-14 in UTC and CT alike): as predicted, `selftest:
> 18 of 684 checks FAILED`:** checks 1–17 and the changed RB check, each read
> by name. No crash.
>
> **Outcome (red tree, all gates): 4 of 7 failed, as predicted, and for the
> predicted reasons.** selftest; mutate-collisions (`PATCH DID NOT APPLY` for
> exactly T1–T14); mutate-scans (M11 and M12 did not apply; the F022, vh,
> strip-removed, M9 and M10 rows read 18 higher, and the string-literals row
> 37 against its 21); mutate-grants (every count 18 higher). module-syntax
> (26 files), oracle-selfcheck and initiator-selfcheck passed.

### Commit 4, cut values: checks 18–33

| # | Check | Red |
| --- | --- | --- |
| 18 | UA3: `valueIsCut` is true for (216, 215) and false for (215, 215), (100, 215), (NaN, 1) and (undefined, 1) | FAIL |
| 19 | UA4: `placeValuePopover` opens below when the popover fits below: cell 100–121, list 50–564, height 40 → top 121, bottom null, maxHeight 443 | FAIL |
| 20 | UA4: it opens above when it does not fit below and there is more room above (the last row): cell 530–551, the same list, height 40, viewport 600 → top null, bottom 70, maxHeight 480 | FAIL |
| 21 | UA4: it stays below, limited to the room there, when it fits on neither side and below has more: cell 60–81, height 900 → top 81, maxHeight 483 | FAIL |
| 22 | UA4: `showValuePopover` sets the popover's left to the table's left and its max width to the table's width, before it is measured and placed | FAIL |
| 23 | UA3: `measureValueCell` takes `cut` from `valueIsCut(cell.scrollWidth, cell.clientWidth)`, toggles the class `cut` by it, sets `tabIndex = 0` only when cut, and otherwise removes `tabindex` | FAIL |
| 24 | UA3: `renderListNow` disconnects the observer and closes the popover right after clearing the list, and after appending the cards measures and observes every `.rb-value` cell | FAIL |
| 25 | UA3: the `ResizeObserver`'s callback calls `measureValueCell` on each entry's target | FAIL |
| 26 | UA4: on `#profile-list`, `mouseover` and `focusin` on a `.rb-value.cut` cell open the popover and `mouseout` and `focusout` close it; leaving the popover closes it unless the pointer went back to its cell; scrolling the list closes it | FAIL |
| 27 | UA4: the popover's text is the cell's, `valuePopover.textContent = cell.textContent;`, and `showValuePopover` assigns no `innerHTML` | FAIL |
| 28 | UA4: the popover is placed by `placeValuePopover`, with `bounds` from `main`'s rectangle and its own `offsetHeight` | FAIL |
| 29 | UA4/UA7: `popup.html` holds exactly one `<div id="value-popover" class="value-popover" popover="manual" aria-hidden="true"></div>`, after `</main>`, and `popup.js` takes it by that id | FAIL |
| 30 | UA4: `.value-popover` is `position: fixed`, `overflow-y: auto`, `white-space: pre-wrap`, `overflow-wrap: anywhere`, in 11.5 px | FAIL |
| 31 | UA3: a cut cell has a focus ring (`.profile .rules .rb-value.cut:focus-visible` with an `outline`) | FAIL |
| 32 | UA4: README says a value too long for its column ends in `…` and that pointing at it or tabbing to it shows it in full | FAIL |
| 33 | UA4: `SMOKE.md` Part 16 has row 16.9 (the popover's text read by id and compared with a `$_ ===` line) and row 16.10 (Tab) | FAIL |

**Red run: `selftest: 16 of 700 checks FAILED`,** checks 18–33. No crash.

**Other gates on the red tree: 4 of 7 fail.** selftest; mutate-collisions
(`PATCH DID NOT APPLY` for exactly V1–V17); mutate-grants (every count 16
higher); mutate-scans (seven rows 16 higher, and "the comment stripper also
eats string literals" 12 higher, 37 against its new 25, since checks 23, 24,
26 and 29 are among the 16). module-syntax (26 files), oracle-selfcheck and
initiator-selfcheck pass.

> **Outcome (red, 2026-10-14 in UTC and CT alike): as predicted, `selftest:
> 16 of 700 checks FAILED`,** checks 18–33, each read by name. No crash.
>
> **Outcome (red tree, all gates): 4 of 7 failed, as predicted.** selftest;
> mutate-collisions (`PATCH DID NOT APPLY` for exactly V1–V17); mutate-grants
> (every count 16 higher); mutate-scans (seven rows 16 higher, the
> string-literals row 37 against its 25). module-syntax (26 files),
> oracle-selfcheck and initiator-selfcheck passed.

## 4. Green, predicted

| After commit | Checks | Mutation scenarios | Syntax gate | Gates |
| --- | ---: | ---: | ---: | --- |
| 2 | 668 | 239 | 26 files | 7 pass |
| 3 | 684 | 253 | 26 files | 7 pass |
| 4 | 700 | 270 | 26 files | 7 pass |

The mutation figure is mutate-collisions plus mutate-scans plus
mutate-grants: 224 + 8 + 7 = 239 after commit 2; 238 + 8 + 7 = 253 after
commit 3; 255 + 8 + 7 = 270 after commit 4.

- **mutate-scans: one row moves, twice.** "The comment stripper also eats
  string literals" goes 20 → 21 at commit 3 (checks 10 and 12 read
  double-quoted strings in `popup.js`, and the changed RB check stops
  reading one) and 21 → 25 at commit 4 (checks 23, 24, 26 and 29). "The
  comment strip is removed" stays 0. M9, M10 and the two F022 rows do not
  move. M11 and M12 keep their names and take new anchors and expects (§5).
- **mutate-grants: no row moves.**
- `configRevision([], false)` is `69709b56` after every commit;
  `lib/status.js` is unchanged throughout.
- `extension/` stays 19 files: no file is added.
- No existing check changes beyond §3's lists.

> **Outcome (commit 2, green, 2026-10-14 in UTC and CT alike): as
> predicted.** `selftest: 668/668 checks passed`. `verify.mjs`: all 7 gates
> pass, `tree: 668 checks, 239 mutation scenarios, 7 gates`, module-syntax
> over 26 files, in 331 s in the container. mutate-scans: all 8 rows matched
> their expects, the string-literals row 20; mutate-grants: all 7 rows
> unchanged. `configRevision([], false)` and `lib/status.js` unchanged;
> `extension/` 19 files.

> **Outcome (commit 3, green, 2026-10-14 in UTC and CT alike): as
> predicted.** `selftest: 684/684 checks passed`. `verify.mjs`: all 7 gates
> pass, `tree: 684 checks, 253 mutation scenarios, 7 gates`, module-syntax
> over 26 files, in 353 s in the container. mutate-scans: all 8 rows matched,
> the string-literals row 21, M11 1 and M12 2; mutate-grants: all 7 rows
> unchanged. `configRevision([], false)` and `lib/status.js` unchanged;
> `extension/` 19 files. LEDGER's contract checks 1–8, run by a script before
> the commit: no problem (62 rows; it was checked against planted faults).

> **Outcome (commit 4, green, 2026-10-14 in UTC and CT alike): as predicted,
> after two corrections, both stated.** `selftest: 700/700 checks passed`.
> `verify.mjs`: all 7 gates pass, `tree: 700 checks, 270 mutation scenarios,
> 7 gates`, module-syntax over 26 files, in 354 s in the container.
> mutate-scans: all 8 rows matched, the string-literals row 25; mutate-grants:
> all 7 rows unchanged. `configRevision([], false)` and `lib/status.js`
> unchanged; `extension/` 19 files. LEDGER's contract checks 1–8: no problem.
> **Built differently, and stated:** the popover element sits after the
> footer, not between `</main>` and the footer as §2 said. The first full
> run failed mutate-collisions on an existing mutant, "the status line moves
> INSIDE the scrolling region", whose anchor is `</main>` followed by the
> footer; with the element after the footer that anchor holds and the mutant
> fails its one check, F022's, as before. Check 29 asks only that the element
> come after `</main>`. **Corrected before the green run:** V10's anchor was
> written with four spaces of indent where the listener has two, so it did
> not apply; its text is otherwise as §5 gives it.

## 5. Mutants, with predicted fails

Each mutant in `test/mutate-collisions.py` must fail at least one check;
the counts and check numbers are predictions, read by name. None applies on
its commit's red tree, and none crashes.

### Commit 2: 1 rewritten (224 → 224)

| M | Mutant | Predicted fails |
| --- | --- | --- |
| W1 | rewritten from s5 H5: the popup goes back to 380 px (`width: 480px;` → `380px`) | 1 (UA1's check) |

> **Outcome (mutants, 2026-10-14 in UTC and CT alike): as predicted.** W1
> applied on the green tree and failed exactly "UA1: the popup is 480 px
> wide", read by name; it did not apply on the red tree. Every one of the
> 224 mutants' counts was compared by name on the `f5d94ff` and commit 2
> trees: none moved, and s5 H5's row is W1's. Mutation scenarios: 239.

### Commit 3: 14 added (224 → 238); 2 rewritten in mutate-scans

| M | Mutant | Predicted fails |
| --- | --- | --- |
| T1 | every row's Type is `req` (`type: line.side` → `type: "req"`) | 2 (3, 7) |
| T2 | a remove's Value cell is empty (`noValue ? READBACK_NO_VALUE` → `noValue ? ""`) | 2 (4, 7) |
| T3 | the value is shown without quotes (`JSON.stringify(line.value)` → `line.value`) | 4 (2, 5, 7, 8) |
| T4 | the Header cell is cut to 24 characters | 2 (6, 7) |
| T5 | the table is built even with no lines (`if (readback.lines.length > 0) {` → `if (true) {`) | 1 (9) |
| T6 | the column heads lose `scope` | 1 (10) |
| T7 | the caption is not appended | 1 (10) |
| T8 | Header and Value are appended in swapped order | 1 (11) |
| T9 | the Value cell's class is renamed in `popup.js` only (`rb-val`) | 1 (12) |
| T10 | the Value column wraps instead of cutting (`overflow: hidden; text-overflow: ellipsis; white-space: pre;` → `white-space: normal; overflow-wrap: anywhere;`) | 1 (14) |
| T11 | the Value cell collapses runs of spaces again (`white-space: pre` → `nowrap`; FINDING-054 returns) | 1 (14) |
| T12 | the table leaves the readback's size (11.5 px → 13 px) | 1 (15) |
| T13 | README goes back to "one line per header" | 1 (16) |
| T14 | `SMOKE.md` row 16.5 goes back to "no `…` anywhere" | 1 (17) |

**Existing mutants whose counts move**, each read by name on the commit 2
and commit 3 trees: "M3 response entries labelled req" 3 → 4 (check 3);
"M4 header name cut to 8 characters" 5 → 6 (check 7); "M5 value dropped from
set lines" 6 → 7 (check 7); "M6 response lines emitted before request lines"
2 → 4 (checks 2 and 3). No other existing mutant moves.

**mutate-scans, rewritten:** "M11 readback lines clip with an ellipsis
(FINDING-043 reinstated)" takes the anchor `.profile .rules .rb-name {
width: max-content; max-width: 200px; overflow-wrap: anywhere; }`, which it
turns into `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
in place of `overflow-wrap: anywhere;`: expect 1 (13). "M12 readback lines
written with innerHTML" takes the anchor `    value.textContent =
cells.value;` → `    value.innerHTML = cells.value;`: expect 2 (11 and the
changed RB check). Their names keep their M-numbers.

> **Outcome (mutants, 2026-10-14 in UTC and CT alike): every prediction
> held, counts and checks exactly,** each mutant applied to a throwaway copy
> and its failures read by name: T1 3 and 7; T2 4 and 7; T3 2, 5, 7 and 8; T4
> 6 and 7; T5 9; T6 and T7 10; T8 11; T9 12; T10 and T11 14; T12 15; T13 16;
> T14 17. None applied on the red tree, and none crashed. The four existing
> mutants moved as predicted, compared by name on the commit 2 and commit 3
> trees: M3 3 → 4 (check 3), M4 5 → 6 (7), M5 6 → 7 (7), M6 2 → 4 (2 and 3);
> no other of the 224 moved. mutate-scans: M11 failed check 13, and M12 check
> 11 and the changed RB check. Mutation scenarios: 239 → 253.

### Commit 4: 17 added (238 → 255)

| M | Mutant | Predicted fails |
| --- | --- | --- |
| V1 | `valueIsCut` uses `>=` | 1 (18) |
| V2 | the popover always opens below (`const openBelow = true;`) | 1 (20) |
| V3 | it opens above whenever it does not fit below (`|| below >= above` dropped) | 1 (21) |
| V4 | the popover is not limited to its room (`maxHeight: null`) | 3 (19, 20, 21) |
| V5 | the popover may be wider than the table (`table.width + 40`) | 1 (22) |
| V6 | every value cell is a tab stop (`if (cut) cell.tabIndex = 0;` → `if (true) cell.tabIndex = 0;`) | 1 (23) |
| V7 | the observer is never disconnected | 1 (24) |
| V8 | cells are measured and never observed | 1 (24) |
| V9 | the observer's callback measures nothing | 1 (25) |
| V10 | focus does not open the popover (the `focusin` call becomes `if (false)`) | 1 (26) |
| V11 | the popover writes the value as HTML | 1 (27) |
| V12 | the popover is placed against the window, not the list (`bounds: { top: 0, bottom: window.innerHeight }`) | 1 (28) |
| V13 | the popover element loses `aria-hidden` | 1 (29) |
| V14 | the popover stops keeping spaces (`pre-wrap` → `normal`) | 1 (30) |
| V15 | a cut cell loses its focus ring (the rule is dropped) | 2 (31; "every class popup.js toggles is defined in popup.html", since `cut` is then defined nowhere) |
| V16 | README drops the sentence on long values | 1 (32) |
| V17 | `SMOKE.md` row 16.9 loses its comparison line | 1 (33) |

No existing mutant moves at commit 4.

> **Outcome (mutants, 2026-10-14 in UTC and CT alike): every prediction
> held, counts and checks exactly,** read by name on throwaway copies: V1 18;
> V2 20; V3 21; V4 19, 20 and 21; V5 22; V6 23; V7 and V8 24; V9 25; V10 26
> (after its anchor was corrected, above); V11 27; V12 28; V13 29; V14 30;
> V15 31 and "every class popup.js toggles is defined in popup.html —
> undefined: cut"; V16 32; V17 33. None applied on the red tree, and none
> crashed. No existing mutant moved, compared by name on the commit 3 and
> commit 4 trees. Mutation scenarios: 253 → 270.

## 6. Browser runs in the container, predicted

Headless Chromium 141.0.7390.37 with the commit's own `extension/` copied,
its manifest given host access to `localhost`, as in §0; run after the
commit's gates are green and before it is handed over. They add evidence;
they do not replace the sitting on Chrome 154. Each run also predicts no page
errors.

| # | After commit | Run | Predicted |
| --- | --- | --- | --- |
| C1 | 2 | the popup with the mock card | 480 px wide; the five readback lines' text unchanged; the card 201.2 px high |
| C2 | 2 | the editor with three header rows (§0's names), toggle on, no profiles | name 393 px, value 274 px, the three names fit; the footer `0 profiles · 0/0 domains granted · nothing registered` on one line; the popup 592 px, the form not scrolling; with a 4th row, 600 px and scrolling |
| C3 | 2 | §0's six footer lines | 45, 53 and 65 characters one line (30.9 px); 70, 83 and 87 two lines (46.9 px) |
| C4 | 3 | the mock card | caption `Header rules`; heads `Type`, `Action`, `Header`, `Value`, each `th` with scope `col`; rows `req set Authorization "Bearer eyJhbGciOiJIUzI1NiJ9.dXJl"`, `req append x-forwarded-for "203.0.113.7"`, `req remove Cookie —`, `res set Cache-Control "no-store, max-age=0"`, `res remove X-Frame-Options —`; columns 37.4, 52.5, 114.9, 216.2 px; only Authorization's value overflows (245 > 215) and paints `…`; the card 251.3 px |
| C5 | 3 | the CSP card | Header 170.3 px, Value 167.9, not cut |
| C6 | 3 | the 57-character name | Header 211 px, the name on three lines and whole (`textContent` equals the name, `scrollWidth` not over `clientWidth` in its `div`), the row 53.3 px |
| C7 | 3 | the Spaces card (FINDING-054) | each Value cell's `innerText` equals its `textContent`: `"  padded  "` and `"a  b"` |
| C8 | 3 | the toggle off, then on; a profile on a domain without host access; two profiles writing one header on one domain | off: every card `Off — nothing registered` and no table; on: the tables return without reopening; the ungranted and the two colliding cards: `No rule registered for this profile` and no table, the collision marker on each colliding card |
| C9 | 3 | Issues with the list showing | no issue kind beyond §0's (recorded) |
| C10 | 4 | the mock card | Authorization's cell has class `cut` and `tabindex` `0`; the other four Value cells have neither |
| C11 | 4 | Tab from the mock card's Delete button | focus goes to Authorization's Value cell; the next Tab leaves the table |
| C12 | 4 | that focus | the popover is open (`:popover-open`), its `textContent` equals the cell's byte for byte (`"Bearer eyJhbGciOiJIUzI1NiJ9.dXJl"`), its top at the cell's bottom and its left at the table's, each within 1 px; Tab away closes it |
| C13 | 4 | the pointer on Authorization's value, then onto the popover, then away from both; then on Cache-Control's value | open, still open, closed; Cache-Control's value opens nothing |
| C14 | 4 | a cut value scrolled so its bottom is within 20 px of the list's bottom edge, focused | the popover (one line, about 28 px) opens above: its bottom edge at the cell's top, within 1 px |
| C15 | 4 | classic scrollbars; the mock card with Authorization's value replaced by `abcdefghijklmnopqrstuvwxyz01` (30 characters shown), and few enough cards that the list does not scroll; then Delete on another card, so the confirm box makes the list scroll | before: not cut, no `tabindex`; with the confirm open: the same element (a marker attribute set on it beforehand survives, so no render replaced it) is cut with `tabindex` `0`; after Cancel: not cut, no `tabindex` |
| C16 | 4 | a 2,000-character value, focused | the popover's height is the room on its side, it scrolls (`scrollHeight > clientHeight`), and its text equals the cell's |
| C17 | 4 | Issues with the list showing and a popover open | no issue kind beyond §0's (recorded) |

> **Outcome (commit 2, Chromium 141.0.7390.37, 2026-10-14 in UTC and CT
> alike): C1–C3 as predicted,** with the commit's own `extension/`. C1: the
> popup 480 px wide; the five readback lines' text unchanged, the append's
> name as `x-forwarded-for`; the card 201.2 px; the footer `1 profile · 1/1
> domain granted · registered 1`. C2: name 393 px, value 274 px, the three
> names fit; the footer `0 profiles · 0/0 domains granted · nothing
> registered` on one line (30.9 px); with three rows the popup 592.3 px and
> the form not scrolling (506 in 506); with four, 600 px and scrolling (573
> in 514). C3: the 45, 53 and 65-character lines one line (30.9 px), the 70,
> 83 and 87-character lines two (46.9 px). No page errors.

> **Outcome (commit 3, Chromium 141.0.7390.37, 2026-10-14 in UTC and CT
> alike): C4–C9 as predicted,** with the commit's own `extension/`. C4: the
> caption `Header rules`; four `th` with scope `col`; the five rows exactly as
> predicted, the removes' Value `—`; columns 37.4, 52.5, 114.9 and 216.2 px;
> only Authorization's value over its cell (245 > 215), painted with `…`; the
> card 251.3 px; no `.readback-line` left. C5: Header 170.3, Value 167.9, not
> cut. C6: Header 211 px, the name whole in its 200 px `div` (200 in 200), the
> row 53.3 px. C7: `"  padded  "` and `"a  b"` painted with their spaces,
> `innerText` equal to `textContent`. C8: toggle off, all four cards `Off —
> nothing registered` with no table; on, the four tables back without
> reopening; the card on `example.com` (no host access) and the colliding
> "Alpha" and "Beta" `No rule registered for this profile` with no table,
> each colliding card with its `Not applying:` marker; the footer `4 profiles ·
> 2/3 domains granted · registered 1 · 3 not registered`. C9: one issue kind,
> `FormLabelHasNeitherForNorNestedInput`, as at §0. No page errors.

> **Outcome (commit 4, Chromium 141.0.7390.37, 2026-10-14 in UTC and CT
> alike), with the commit's own `extension/`: C10–C14, C16 and C17 as
> predicted; C15 wrong in its fixture.** C10: Authorization's cell has class
> `cut` and `tabindex` `0`; the other four have neither. C11: Tab from the
> card's Delete button focused Authorization's Value cell; the next Tab went
> to the next card's Edit button, outside the table. C12: on that focus the
> popover was open, its `textContent` equal to the cell's byte for byte
> (`"Bearer eyJhbGciOiJIUzI1NiJ9.dXJl"`), its top at the cell's bottom and
> its left at the table's (0 px each); Tab away closed it. C13: the pointer
> on the cut value opened it, onto the popover kept it open, away from both
> closed it, and on Cache-Control's value opened nothing. C14: a cut value
> 10.3 px above the list's bottom edge, focused: the popover (28.1 px) opened
> above, its bottom at the cell's top (0 px). The first probe for C14 found
> no cell to place, its scroll positioning waiting on animation frames inside
> the page; the second set the scroll directly. C16: a 2,000-character value
> (2,002 shown): the popover 175.1 px, its room exactly, scrolling, its text
> equal to the cell's. C17: one issue kind, as at §0. No page errors.
>
> **C15, wrong as written.** The predicted value, 30 characters shown, was
> already cut before the confirm (`scrollWidth` 218 against `clientWidth`
> 215), so it could not show the change. §0 is wrong in the same place: the
> cell's `clientWidth` includes its 10 px of padding, so the mock card's
> Value cell holds 205 px of text, about 29 characters, not 31, and with a
> classic scrollbar 190 px, about 27; a value of 28 or 29 characters shown
> fits without the scrollbar and is cut with it. §0's sentences are left as
> written. **Run again with 28 characters shown (`"abcdefghijklmnopqrstuvwxyz"`),
> recorded, not counted:** before the confirm, not cut and no `tabindex`
> (215 in 215); with the confirm open, the list scrolling and a 15 px
> scrollbar, the same element (its marker attribute still there, so no
> render) cut with `tabindex` `0` (204 in 200); after Cancel, not cut and no
> `tabindex`. The observer re-measured without a render, as UA3 ruled.

## 7. What UI-05a leaves for later

**The sitting**, on Chrome 154 or later, its runbook frozen first. `git
pull`, then **Reload** in `chrome://extensions` (Reload clears drafts). Rows
to propose there: the frame at 480 px; the mock card's table, columns and
rows; one cut value, its `…`, hover and Tab, the popover's text compared by
its bytes in the console (FINDING-053), never from a screenshot; a value that
fits is no tab stop; the 57-character name whole; FINDING-054's two values
painted with their spaces; the off and not-registered notes with no table;
the Issues panel read once (recorded); whether the Mac shows classic
scrollbars (recorded). UI-05a and UI-09 stay `fixed-unverified` until then.

**The release session (v0.3.0):** the bump, the tag and the package; the
listing's Description against the new card (it describes the readback, read
on the dashboard before submission); then the v0.3.0 gate, a new row after it
publishes.

**Not here, and not moved:** FEAT-3, UI-05, AR-14, F-030, AR-19, UI-08.

## 8. Outcomes

(Recorded under each prediction above, after the code runs.)
