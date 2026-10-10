import subprocess, shutil, pathlib, sys, re

# Repo root, derived from this file so the script runs anywhere. It was
# committed with a hardcoded container path, which meant it could not run
# for anyone — defeating the point of committing it.
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from mutate_common import disposable_root, tree_digest

# MUTANTS ARE APPLIED IN A THROWAWAY COPY, NEVER IN THE REAL TREE. See
# test/mutate_common.py for what happened when they were not. SOURCE_ROOT is
# read once for the copy and for the before/after digest; ROOT is the copy, so
# every path below and every subprocess cwd resolves inside it.
SOURCE_ROOT = pathlib.Path(__file__).resolve().parent.parent
DIGEST_BEFORE = tree_digest(SOURCE_ROOT)
ROOT = disposable_root(SOURCE_ROOT)
COL = ROOT / "extension/lib/collisions.js"
RUL = ROOT / "extension/lib/rules.js"
CAN = ROOT / "extension/lib/canonical.js"
POP = ROOT / "extension/popup/popup.js"
HTML = ROOT / "extension/popup/popup.html"
SW  = ROOT / "extension/background/sw.js"
STA = ROOT / "extension/lib/status.js"
RDM = ROOT / "README.md"
SCP = ROOT / "SCOPE.md"
MAN = ROOT / "extension/manifest.json"
ORC = ROOT / "test/oracle/index.html"
ORM = ROOT / "test/oracle/index.mjs"
MC  = ROOT / "test/mutate-scans.py"
STO = ROOT / "extension/lib/stored.js"
RBK = ROOT / "extension/lib/readback.js"
PRO = ROOT / "extension/lib/profile.js"
DRA = ROOT / "extension/lib/draft.js"
PLF = ROOT / "test/platform-floor.mjs"
PRV = ROOT / "PRIVACY.md"
SMK = ROOT / "test/SMOKE.md"

MUTATIONS = [
    ("drop the leading dot (suffix-confusable guard removed)", COL,
     'return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);',
     'return a.endsWith(b) || b.endsWith(a);'),
    ("exact-equality overlap only (subdomain matching ignored)", COL,
     'return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);',
     'return false;'),
    ("one-directional overlap (symmetry lost)", COL,
     'return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);',
     'return a.endsWith(`.${b}`);'),
    ("header names compared case-sensitively", COL,
     'keys.add(`${sideOf(entry)}\\u0000${entry.name.toLowerCase()}`);',
     'keys.add(`${sideOf(entry)}\\u0000${entry.name}`);'),
    ("invalid header entries counted toward collisions", COL,
     'if (isValidEntry && !isValidEntry(entry)) continue;',
     'if (false) continue;'),
    ("only ONE side of a collision is marked", COL,
     '    ids.add(collision.profileIds[0]);\n    ids.add(collision.profileIds[1]);',
     '    ids.add(collision.profileIds[0]);'),
    ("intra-profile repeats treated as collisions", COL,
     '        if (a.id === b.id) continue;',
     '        if (false) continue;'),
    ("collision sort dropped (non-deterministic order)", COL,
     '''  collisions.sort(
    (x, y) =>
      x.header.localeCompare(y.header) ||
      x.side.localeCompare(y.side) ||
      x.profileIds[0] - y.profileIds[0] ||
      x.profileIds[1] - y.profileIds[1]
  );
''', ''),
    ("marker omits the header name", COL,
     'return (\n    `Not applying: ${headers.length === 1 ? "header" : "headers"} ` +\n    `${headerList} also written by ${others.join(", ")} on an overlapping ` +',
     'return (\n    `Not applying: ${headers.length === 1 ? "header" : "headers"} ` +\n    `also written by ${others.join(", ")} on an overlapping ` +'),
    ("import refusal removed entirely", CAN,
     '  if (collisions.length > 0) {',
     '  if (false) {'),
    ("import collision check runs BEFORE per-profile validation", CAN,
     '  const seenIds = new Set();',
     '  if (findCollisions(doc.profiles.map((p) => ({ id: p.id, name: p.name, domains: normalizeDomains(p.domains || []), headers: p.headers })), (e) => validateHeaderEntry(e).valid).length > 0) { throw new Error("overlapping domains"); }\n  const seenIds = new Set();'),

    # ---- v0.1.6, FINDING-026: the write-path refusals are their own sentences.
    #
    # THE FIRST ONE IS THE FINDING ITSELF. If reusing the card marker on the
    # save path fails zero checks, then v0.1.6 has changed the prose without
    # pinning the thing that was wrong with it, and the defect can walk back in
    # on the next edit to either surface.
    ("save refusal falls back to the CARD MARKER (the FINDING-026 defect)", COL,
     '  const facts = collisionFacts(collisions, profileId, nameFor);\n  if (!facts) return "";\n  const { headers, others, headerList, moment } = facts;\n  const one = headers.length === 1;',
     '  return describeCollisions(collisions, profileId, nameFor);\n  const facts = collisionFacts(collisions, profileId, nameFor);\n  if (!facts) return "";\n  const { headers, others, headerList, moment } = facts;\n  const one = headers.length === 1;'),
    ("save refusal claims the profile is not applying", COL,
     '`Not saved: ${one ? "header" : "headers"} ${headerList} ${one ? "is" : "are"} ` +',
     '`Not applying: ${one ? "header" : "headers"} ${headerList} ${one ? "is" : "are"} ` +'),
    ("save refusal omits the header name", COL,
     '`Not saved: ${one ? "header" : "headers"} ${headerList} ${one ? "is" : "are"} ` +',
     '`Not saved: ${one ? "header" : "headers"} ${one ? "is" : "are"} ` +'),
    ("save refusal loses number agreement", COL,
     '`Not saved: ${one ? "header" : "headers"} ${headerList} ${one ? "is" : "are"} ` +',
     '`Not saved: ${one ? "header" : "headers"} ${headerList} is ` +'),
    ("save refusal omits the other profile", COL,
     '`also written by ${others.join(", ")} on an overlapping domain. Two ` +',
     '`also written by another profile on an overlapping domain. Two ` +'),
    ("save refusal omits the way out", COL,
     '`profiles cannot write the same header on ${moment}. Change the ` +\n    `header or the domains, then save.`',
     '`profiles cannot write the same header on ${moment}.`'),
    ("import refusal terminates itself (the double-period defect)", COL,
     '`${moment}` +',
     '`${moment}.` +'),
    ("import refusal omits the header name", COL,
     '`"${first.header}"${first.side === "response" ? " on the response" : ""} on ` +',
     '`${first.side === "response" ? " on the response" : ""} on ` +'),
    ("import refusal names only ONE side", COL,
     '`${nameOf(idA, nameFor)} and ${nameOf(idB, nameFor)} both write header ` +',
     '`${nameOf(idA, nameFor)} writes header ` +'),
    ("import refusal drops the further-collisions count", COL,
     '    (remaining > 0',
     '    (false'),
    ("import throw re-adds the duplicated wrapper sentence", CAN,
     '    throw new Error(describeImportRefusal(collisions, (id) => nameById.get(id)));',
     '    throw new Error("this file has profiles that would write the same header on overlapping domains, which has no defined winner. " + describeImportRefusal(collisions, (id) => nameById.get(id)));'),

    # ---- v0.2.0: SIDE. A request header and a response header of the same
    # name are different writes at different moments and must not collide.
    #
    # THE FIRST TWO ARE THE CHANGE ITSELF. If either fails zero checks, the
    # predicate has been extended without pinning what the extension is for,
    # and a later edit can collapse the sides again with nothing complaining.
    ("side ignored: everything buckets as a request header", COL,
     'keys.add(`${sideOf(entry)}\\u0000${entry.name.toLowerCase()}`);',
     'keys.add(`request\\u0000${entry.name.toLowerCase()}`);'),
    ("the legacy default flips: a sideless 0.1.x entry reads as response", COL,
     'return entry && entry.side === "response" ? "response" : "request";',
     'return entry && entry.side === "request" ? "request" : "response";'),
    # This one SURVIVED when first run, which is how a wrong justification in
    # the comment above it was found. It is pinned by an ordering check that
    # declares entries response-first, so bucket order disagrees with output.
    ("side dropped from the comparator (order follows input, not values)", COL,
     '      x.side.localeCompare(y.side) ||\n', ''),
    ("the moment is hardcoded back to \"request\" for mixed-side collisions", COL,
     '  const moment = mixed\n    ? "the same exchange"',
     '  const moment = mixed\n    ? "the same request"'),
    ("facts dedupe on name only, merging the two sides into one report", COL,
     '    const k = `${c.side}\\u0000${c.header}`;',
     '    const k = c.header;'),

    # ---- v0.2.0: the validator and the rule builder. These two changed
    # together because accepting a response entry while profileToRule() still
    # emitted one array would apply it on the WRONG SIDE, silently. The first
    # mutant here IS that defect.
    ("response entries are emitted as REQUEST headers (the wrong-side defect)", RUL,
     '  const requestHeaders = valid\n    .filter((entry) => sideOf(entry) === "request")\n    .map(headerEntryToModifyHeaderInfo);',
     '  const requestHeaders = valid\n    .map(headerEntryToModifyHeaderInfo);'),
    ("response headers are never emitted at all", RUL,
     '  if (responseHeaders.length > 0) action.responseHeaders = responseHeaders;\n', ''),
    ("an empty responseHeaders array is registered rather than omitted", RUL,
     '  if (responseHeaders.length > 0) action.responseHeaders = responseHeaders;',
     '  action.responseHeaders = responseHeaders;'),
    ("an unrecognised side is silently defaulted instead of refused", RUL,
     '  if (entry.side !== undefined && !VALID_SIDES.has(entry.side)) {\n    return { valid: false, reason: `unknown side "${entry.side}"` };\n  }', ''),
    ("append is allowed on response headers (asserting an unverified list)", RUL,
     '    if (sideOf(entry) === "response") {\n      return {\n        valid: false,\n        reason: `append is not supported on response headers in this release`,\n      };\n    }', ''),

    # ---- v0.1.6, FINDING-022: the popup containment tripwires.
    #
    # These mutants are the reason those checks exist. Each one leaves a popup
    # that renders, works, and silently scrolls its master toggle away again.
    # min-height is first because it is the declaration that looks redundant.
    ("main can no longer shrink (min-height: 0 removed)", HTML,
     '    min-height: 0;\n    overflow-y: auto;',
     '    overflow-y: auto;'),
    ("main no longer scrolls (overflow-y removed)", HTML,
     '    min-height: 0;\n    overflow-y: auto;',
     '    min-height: 0;'),
    ("the header becomes shrinkable again", HTML,
     '  header {\n    flex: none;',
     '  header {'),
    ("the status line becomes shrinkable again", HTML,
     '  footer {\n    flex: none;',
     '  footer {'),
    ("the popup body is no longer height-bounded", HTML,
     '    max-height: 600px;\n',
     ''),
    # OBS-E1 itself. The cap that fed on its own output collapsed the popup to
    # 107px at zero profiles, and every check below passed against it.
    ("the circular vh cap is reintroduced (OBS-E1)", HTML,
     '    max-height: 600px;',
     '    max-height: min(600px, 100vh);'),
    ("the status line moves INSIDE the scrolling region", HTML,
     '  </main>\n\n  <footer id="status-line">&nbsp;</footer>',
     '  <footer id="status-line">&nbsp;</footer>\n  </main>\n'),

    # ---- v0.1.6, FINDING-023: the notice and the stylesheet must agree.
    ("the migration notice stops naming the marker", POP,
     '`Click any underlined domain below to re-approve it.`',
     '`Click any gray domain below to re-approve it.`'),
    ("the underline the notice names is removed from .migrating", HTML,
     'text-decoration: underline dashed var(--ink-soft); text-underline-offset: 2px;',
     ''),

    # ---- popup side control, v0.2.0. Every one of these leaves a popup that
    # renders and saves. None throws. That is why they are here.
    ("the side select reads entry.side, so a 0.1.x entry reclassifies", POP,
     'if (side === sideOf(entry)) option.selected = true;',
     'if (side === entry.side) option.selected = true;'),
    ("readForm writes side unconditionally (every export changes)", POP,
     'if (side === "response") entry.side = side;',
     'entry.side = side;'),
    ("the side select is never read back (control is decorative)", POP,
     '    const side = row.querySelector(".h-side").value;\n',
     '    const side = "request";\n'),
    ("side and operation swap DOM order against the grid columns", POP,
     'row.append(nameInput, sideSelect, opSelect, valueInput, removeBtn);',
     'row.append(nameInput, opSelect, sideSelect, valueInput, removeBtn);'),
    ("the side column is dropped from the grid (five children, four tracks)", HTML,
     'grid-template-columns: 1fr 56px 82px 1fr 24px;',
     'grid-template-columns: 1fr 82px 1fr 24px;'),
    ("a fixed select width returns and overflows the 56px column", HTML,
     '  .hrow select { padding: 5px 3px; }',
     '  .hrow select { width: 82px; padding: 5px 3px; }'),
    ("the h-side hook is renamed, so readForm's querySelector finds nothing", POP,
     'sideSelect.className = "h-side";',
     'sideSelect.className = "h-which";'),

    # ---- oracle page. No other check in the project reads this file.
    ("the verdict goes back to pass/fail colour (pink reads as failure)", ORM,
     '      "verdict"',
     '      d.identical ? "verdict unmodified" : "verdict modified"'),
    ("MEASUREMENT FAILED shares a class with UNMODIFIED again", ORM,
     '"verdict failed"',
     '"verdict unmodified"'),
    # HW-V7-07. Measured header values reaching innerHTML let the profile under
    # test write DOM into the page certifying it.
    ("the results table goes back to innerHTML interpolation", ORM,
     '    row.appendChild(el("td", name));',
     '    row.innerHTML = `<td>${name}</td>`;'),
    ("the phase-inversion warning is dropped from the page", ORC,
     '<strong>\u201cUNMODIFIED\u201d is not a verdict on its own.</strong>',
     ''),

    # ---- codec / side, v0.2.0. The first of these IS the shipped defect that
    # review found: the codec rebuilt entries from a fixed field list.
    ("the codec drops side again (response exports as request)", CAN,
     '        if (entry.side === "response") out.side = "response";\n',
     ''),
    ("the codec emits side: \"request\" (every old export's bytes change)", CAN,
     'if (entry.side === "response") out.side = "response";',
     'out.side = entry.side === "response" ? "response" : "request";'),
    ("version is stamped from the build, not from what the file needs", CAN,
     '    version: versionFor(profiles),',
     '    version: FILE_VERSION,'),
    ("a v1 envelope carrying side is accepted (0.1.x would misapply it)", PRO,
     '  const allowed = entryKeysFor(version);',
     '  const allowed = ENTRY_KEYS_V2;'),
    ("unknown fields are dropped in silence again", PRO,
     '        if (!allowed.has(key)) {',
     '        if (false) {'),

    # ---- R10 / R6. Each of these leaves an extension that loads and a popup
    # that renders. The damage is a FAILED ATOMIC UPDATE: every profile's
    # rules vanish together, not just the bad one's.
    ("the rule id guard is removed (one bad id kills every rule)", RUL,
     '  if (!isValidRuleId(profile.id)) return null;',
     ''),
    ("the id guard accepts any truthy id (0 and NaN still slip)", RUL,
     'if (!isValidRuleId(profile.id)) return null;',
     'if (!profile.id) return null;'),
    ("duplicate ids are no longer detected", SW,
     ' || duplicateIds.has(profile.id)',
     ''),
    # THE ORDERING DEFECT ITSELF, reproduced as a mutant. This is the shipped
    # v0.2.0 bug external review found: collisions computed over every
    # resolved profile, so an ineligible one suppressed a valid rule.
    ("collisions are computed over ALL profiles again (junk suppresses valid)", SW,
     '  const collisions = findCollisions(\n    eligible.map(',
     '  const collisions = findCollisions(\n    resolved.map('),
    ("the build loop iterates every profile, eligible or not", SW,
     '  for (const { profile, grantedDomains } of eligible) {',
     '  for (const { profile, grantedDomains } of resolved) {'),
    ("ineligible profiles vanish from the skipped accounting", SW,
     '      ineligible.add(profile);\n      skippedProfileIds.push(profile.id);\n',
     '      ineligible.add(profile);\n'),
    # ---- export-side strictness (the R1 mitigation that was not implemented)
    # ---- HW-V6-05. Removing the value check restores a codec that writes a
    # typo out as a request header and re-imports it as one.
    # ---- HW-V7-02. Writer/reader symmetry. Each of these restores a build
    # that can write a file it cannot read.
    ("the writer stops validating the whole profile", CAN,
     '      const verdict = validateProfile(profile, { version: FILE_VERSION });',
     '      const verdict = { valid: true };'),
    ("the writer validates at the file version, not the model version", CAN,
     'const verdict = validateProfile(profile, { version: FILE_VERSION });',
     'const verdict = validateProfile(profile, { version: versionFor([profile]) });'),
    ("unknown envelope fields are accepted and dropped again", CAN,
     '    if (!DOC_KEYS.has(key)) {',
     '    if (false) {'),



    # ---- HW-V6-01 interim. The whole fix is a claims fix, so the only way it
    # can regress is the text going back to the confident version. Each of
    # these leaves an extension that works exactly as well as before and lies
    # about it again.
    ("the tooltip goes back to claiming headers simply apply", POP,
     '`${domain}: access granted. Headers apply to page loads here, and to ` +\n      `requests made by pages on this or another granted domain.`',
     '`${domain}: permission granted, headers apply`'),
    ("the initiator condition is dropped from the tooltip", POP,
     ', and to ` +\n      `requests made by pages on this or another granted domain.`',
     '.`'),
    ("README stops documenting the initiator requirement", RDM,
     '**A second exception, as of v0.2.0 — and this one has been true since\n  v0.1.0.**',
     '**A note.**'),
    ("SCOPE stops warning that widening the rule is not the fix", SCP,
     '**Not fixable by widening the rule.**',
     '**Note.**'),
    # NARROWING RESOURCE_TYPES WAS THE WRONG FIX and is mutated here so the
    # reasoning cannot be lost: same-origin subresources work today, and
    # dropping types would remove them.
    ("RESOURCE_TYPES is narrowed to navigations (removes working cases)", RUL,
     '  "main_frame", "sub_frame", "stylesheet", "script", "image", "font",',
     '  "main_frame", "sub_frame",\n  // removed:'),

    # ---- HW-V6-06. The harness safety property, mutated in the harness that
    # enforces it. Self-referential on purpose: these are the only mutants that
    # could, if the property regressed, damage the real tree. They are safe
    # precisely BECAUSE the property holds.
    ("a harness points ROOT back at the real source tree", MC,
     'ROOT = disposable_root(SOURCE_ROOT)',
     'ROOT = SOURCE_ROOT'),
    # ---- HW-V6-04. Each of these restores a worker that goes SILENT on
    # malformed storage: no rule update, no status, no badge — and on a
    # disable, stale rules left registered.
    ("the decoder throws on a non-array again (disable stops clearing)", STO,
     '  } else {\n    // Not a list at all. Enabled state is independent and still honoured,\n    // which is what lets disable clear rules from a corrupt configuration.\n    problems.push(`stored profiles are ${typeof raw}, expected an array`);\n  }',
     '  } else {\n    list = raw.map((x) => x);\n  }'),
    ("a malformed element aborts the whole set instead of being skipped", STO,
     '      problems.push(`profile ${index + 1} dropped: ${verdict.reason}`);\n      return;',
     '      throw new Error(verdict.reason);'),
    ("enabled is read from the profiles value, coupling the two", STO,
     'enabled: stored[keys.enabled] === true,',
     'enabled: stored[keys.enabled] === true && profiles.length > 0,'),
    ("problems stop naming which profile failed", STO,
     '`profile ${index + 1} dropped: ${verdict.reason}`',
     '"a profile was dropped"'),
    # ---- HW-V7-01. The convergence itself: one validator, two modes.
    ("dropped profiles vanish from the persisted status again", SW,
     '        skipped,\n        dropped,\n',
     '        skipped,\n'),
    # ---- HW-V7-04. Each restores a status that makes a claim it cannot
    # support. None of them breaks a rule on the wire; they break the only
    # surface telling the user what reached it.
    ("skipped profiles are discarded again (partial reads as applied)", SW,
     '    skipped = plan.skippedProfileIds.map((profileId) => ({ profileId }));',
     '    skipped = [];'),
    ("a failed sync overwrites the last applied revision", SW,
     '        appliedRevision: syncOk ? desiredRevision : previousApplied,',
     '        appliedRevision: desiredRevision,'),
    ("the status record loses its configuration revision", SW,
     '    desiredRevision = configRevision(state.profiles, enabled);',
     '    desiredRevision = null;'),
    ("a failed sync claims rules are not applying", STA,
     'return "sync failed \\u2014 previous rules may still be applying";',
     'return "not applying \\u2014 last sync failed";'),
    # s5 Z1: the anchor moved with UI-04's words. Disabling the zero-rule
    # line now prints a registered count of 0 instead of "nothing registered".
    ("a zero-rule success prints a registered count", STA,
     '  if ((r.activeRuleCount ?? 0) === 0) return "nothing registered";',
     '  if (false) return "nothing registered";'),
    ("skipped profiles no longer make the result partial", STA,
     '  if ((r.skipped?.length ?? 0) > 0 || (r.dropped?.length ?? 0) > 0) {',
     '  if (false) {'),
    ("staleness is never detected (old results read as current)", STA,
     '    r.desiredRevision !== desiredRevision\n  ) {',
     '    false\n  ) {'),
    ("v0.1.x status records are misread as successful", STA,
     '    state: raw.ok === false ? "failed" : "paused",',
     '    state: "paused",'),

    ("the stored decoder stops validating profiles (shallow check returns)", STO,
     '    const verdict = validateProfile(profile);',
     '    const verdict = { valid: true };'),
    ("headers is no longer required to be an array", PRO,
     '  if (!Array.isArray(profile.headers) || profile.headers.length === 0) {',
     '  if (false) {'),
    ("the importer stops using the shared validator", CAN,
     '    const verdict = validateProfile(profile, { version: doc.version });',
     '    const verdict = { valid: true };'),
    ("the popup reads storage directly again, bypassing the decoder", POP,
     '  return state.profiles;',
     '  return stored[STORAGE_KEY_PROFILES] || [];'),

    ("the digest stops deciding whether a harness fails", MC,
     'if bad or DIGEST_AFTER != DIGEST_BEFORE:',
     'if bad:'),
    ("only the LATER duplicate is skipped (a winner is picked)", SW,
     '    [...idCounts].filter(([, count]) => count > 1).map(([id]) => id)',
     '    [...idCounts].filter(([, count]) => count > 2).map(([id]) => id)'),
    # s5 R1 and R2: the anchors moved with the floor, 101 -> 116 (AR-11). The
    # floor is derived now, so "below" means below the derived floor.
    ("minimum_chrome_version is dropped from the manifest", MAN,
     '  "minimum_chrome_version": "116",\n',
     ''),
    ("minimum_chrome_version drifts below the derived floor", MAN,
     '"minimum_chrome_version": "116"',
     '"minimum_chrome_version": "88"'),

    # ---- FINDING-040 / FINDING-043 readback, M1-M8 of
    # test/PREDICTIONS-2026-09-21-readback.md. Every one is a way the card
    # could show a plausible line that is not what Chrome registered.
    ("M1 stale renders the registered lines (pre-save rule shown as current)", RBK,
     '  if (syncState === "stale") {',
     '  if (false) {'),
    ("M2 paused renders the registered lines", RBK,
     '  if (syncState === "paused") {',
     '  if (false) {'),
    ("M3 response entries labelled req (side from the wrong array)", RBK,
     '    lines.push({ side: "res", operation: e.operation, header: e.header, value: e.value });',
     '    lines.push({ side: "req", operation: e.operation, header: e.header, value: e.value });'),
    ("M4 header name cut to 8 characters (FINDING-043 reinstated)", RBK,
     '  const head = `${line.side} \\u00b7 ${line.operation} \\u00b7 ${line.header}`;',
     '  const head = `${line.side} \\u00b7 ${line.operation} \\u00b7 ${line.header.slice(0, 8)}`;'),
    ("M5 value dropped from set lines (invisible variant hidden again)", RBK,
     '  if (line.operation === "remove" || line.value === undefined) return head;',
     '  return head;'),
    ("M6 response lines emitted before request lines", RBK,
     '  for (const e of action.requestHeaders || []) {\n    lines.push({ side: "req", operation: e.operation, header: e.header, value: e.value });\n  }\n  for (const e of action.responseHeaders || []) {\n    lines.push({ side: "res", operation: e.operation, header: e.header, value: e.value });\n  }\n',
     '  for (const e of action.responseHeaders || []) {\n    lines.push({ side: "res", operation: e.operation, header: e.header, value: e.value });\n  }\n  for (const e of action.requestHeaders || []) {\n    lines.push({ side: "req", operation: e.operation, header: e.header, value: e.value });\n  }\n'),
    ("M7 failed hides the still-registered lines", RBK,
     '    return { kind: "previous", note: READBACK_NOTES.previous, lines };',
     '    return { kind: "previous", note: READBACK_NOTES.previous, lines: [] };'),
    ("M8 malformed-rule guard removed", RBK,
     '    !readableList(action.requestHeaders) ||\n    !readableList(action.responseHeaders)',
     '    false'),

    # ---- AR-01, M1-M3 of test/PREDICTIONS-2026-09-27-s2.md. The revision's
    # input must stay unambiguous and must keep every field it reads.
    ("s2 M1 revision text reverted to the delimiter join (AR-01 undone)", STA,
     '  return JSON.stringify([\n    enabled ? "on" : "off",\n    (profiles ?? []).map((profile) => [\n      profile.id,\n      profile.name,\n      profile.domains ?? [],\n      (profile.headers ?? []).map((h) => [\n        h.side ?? "request",\n        h.name,\n        h.operation,\n        h.value ?? "",\n      ]),\n    ]),\n  ]);',
     '  const parts = [enabled ? "on" : "off"];\n  for (const profile of profiles ?? []) {\n    parts.push(`${profile.id}:${profile.name}:${(profile.domains ?? []).join(",")}:` + (profile.headers ?? []).map((h) => `${h.side ?? "request"}|${h.name}|${h.operation}|${h.value ?? ""}`).join(";"));\n  }\n  return parts.join("\\u0000");'),
    ("s2 M2 side dropped from the revision tuple", STA,
     '        h.side ?? "request",\n',
     ''),
    ("s2 M3 headers sorted by name inside the revision tuple", STA,
     '      (profile.headers ?? []).map((h) => [',
     '      [...(profile.headers ?? [])].sort((a, b) => (a.name < b.name ? -1 : 1)).map((h) => ['),

    # ---- AR-01b, M4-M14 of the same file, plus M15 added during the build.
    # The digest must mean "this exact canonical profile", the edit check must
    # fail closed on the target alone, and the popup must actually consult it.
    ("s2 M4 digest prefix becomes profile-v2", CAN,
     'export const PROFILE_DIGEST_PREFIX = "sha256:profile-v1:";',
     'export const PROFILE_DIGEST_PREFIX = "sha256:profile-v2:";'),
    ("s2 M5 digest over raw JSON, not the canonical text", CAN,
     '  const text = stableStringify(canonicalizeProfiles([profile])[0]);',
     '  const text = JSON.stringify(profile);'),
    ("s2 M6 edit check passes whenever the target exists", CAN,
     '  if (typeof baseDigest !== "string") return { ok: false, reason: "changed" };',
     '  return { ok: true };'),
    ("s2 M7 a vanished target passes the edit check", CAN,
     '  if (!stored) return { ok: false, reason: "vanished" };',
     '  if (!stored) return { ok: true };'),
    ("s2 M8 edit check compares profiles[0], not the target", CAN,
     '  const stored = (profiles ?? []).find((profile) => profile && profile.id === id);',
     '  const stored = (profiles ?? [])[0];'),
    ("s2 M9 edit check throws on an undigestible target", CAN,
     '  try {\n    current = await profileDigest(stored);\n  } catch {\n    return { ok: false, reason: "changed" };\n  }',
     '  current = await profileDigest(stored);'),
    ("s2 M10 saveProfile no longer consults the edit check", POP,
     '    const base = await checkEditBase(previousProfiles, editingProfileId, editingBaseDigest);',
     '    const base = { ok: true };'),
    ("s2 M11 a refused edit falls through to the write", POP,
     '      if (base.reason === "changed") setRestoredNotice(true);\n      return;\n    }',
     '      if (base.reason === "changed") setRestoredNotice(true);\n    }'),
    ("s2 M12 revertToSaved keeps the stale base", POP,
     '  // the version the editor was first opened on.\n  editingBaseDigest = profile ? await profileDigest(profile) : null;\n',
     '  // the version the editor was first opened on.\n'),
    # ANCHOR REWRITTEN IN s3 (AR-02): openEditor now takes its base from
    # baseForEditor and opens the draft session before the form is shown. The
    # mutant still moves the capture after showView("edit").
    ("s2 M13 openEditor captures the base after the form is shown", POP,
     '  editingBaseDigest = await baseForEditor(restored, profile, profileDigest);\n  draftSession.open(editingProfileId);\n  showView("edit");',
     '  draftSession.open(editingProfileId);\n  showView("edit");\n  editingBaseDigest = await baseForEditor(restored, profile, profileDigest);'),
    ("s2 M14 a changed refusal hides Revert to saved", POP,
     '      if (base.reason === "changed") setRestoredNotice(true);\n',
     ''),
    ("s2 M15 revert leaves the refusal on screen", POP,
     '  // would still be telling the user to use Revert to saved.\n  hideFormError();\n',
     '  // would still be telling the user to use Revert to saved.\n'),
    # ---- AR-02, M1-M40 of test/PREDICTIONS-2026-09-29-s3.md. A draft must
    # carry its base and bind to it, belong only to the editor its key and its
    # own id agree on, reach storage through one queue and one session, and use
    # the validator's side and operation sets.
    ("s3 M1 DRAFT_VERSION stays 1", DRA,
     'export const DRAFT_VERSION = 2;',
     'export const DRAFT_VERSION = 1;'),
    ("s3 M2 formToDraft drops the base", DRA,
     '    baseDigest: baseDigest ?? null,\n',
     ''),
    ("s3 M3 draftToForm drops the base", DRA,
     '    baseDigest: draft.baseDigest,\n',
     ''),
    ("s3 M4 isValidDraft ignores the side set", DRA,
     '      VALID_SIDES.has(r.side) &&',
     '      typeof r.side === "string" &&'),
    ("s3 M5 isValidDraft ignores the operation set", DRA,
     '      VALID_OPERATIONS.has(r.operation) &&',
     '      typeof r.operation === "string" &&'),
    ("s3 M6 isValidDraft accepts a profile draft with no base", DRA,
     '    if (typeof draft.baseDigest !== "string") return false;\n',
     ''),
    ("s3 M7 isValidDraft accepts a new-profile draft carrying a base", DRA,
     '    if (draft.baseDigest !== null) return false;\n',
     ''),
    ("s3 M8 draftFor ignores which profile the draft names", DRA,
     '  return draft.editingProfileId === id ? draft : null;',
     '  return draft;'),
    ("s3 M9 draftFor skips validation", DRA,
     '  if (!isValidDraft(draft)) return null;\n  return draft.editingProfileId === id ? draft : null;',
     '  return draft.editingProfileId === id ? draft : null;'),
    ("s3 M10 a restored draft binds to the profile shown (the s2 gap)", DRA,
     '  if (restored) return restored.baseDigest;\n',
     ''),
    ("s3 M11 rebase keeps a draft whose profile the import changed", DRA,
     '    if (digest === draft.baseDigest) kept[key] = draft;',
     '    kept[key] = draft;'),
    ("s3 M12 rebase keeps a draft whose profile the import lacks", DRA,
     '    if (!profile) continue;',
     '    if (!profile) {\n      kept[key] = draft;\n      continue;\n    }'),
    ("s3 M13 rebase drops the new-profile draft", DRA,
     '    if (draft.editingProfileId === null) {\n      kept[key] = draft;\n      continue;\n    }',
     '    if (draft.editingProfileId === null) continue;'),
    ("s3 M14 rebase throws when a digest fails", DRA,
     '    let digest;\n    try {\n      digest = await digestOf(profile);\n    } catch {\n      continue;\n    }',
     '    const digest = await digestOf(profile);'),
    ("s3 M15 rebase keeps a draft stored under another profile's key", DRA,
     '    if (!isValidDraft(draft) || key !== draftKeyFor(draft.editingProfileId)) continue;',
     '    if (!isValidDraft(draft)) continue;'),
    ("s3 M16 the store runs its calls without the queue", DRA,
     '  const run = createSerialQueue((operation) => operation());',
     '  const run = (operation) => operation();'),
    ("s3 M17 the store reads a failed read as empty (the old getDrafts)", DRA,
     '    const stored = await read();',
     '    let stored;\n    try {\n      stored = await read();\n    } catch {\n      stored = {};\n    }'),
    ("s3 M18 drop writes when its key is absent", DRA,
     '        if (!(key in drafts)) return false;\n',
     ''),
    ("s3 M19 put swallows a failed write", DRA,
     '        drafts[key] = draft;\n        await write(drafts);',
     '        drafts[key] = draft;\n        await write(drafts).catch(() => {});'),
    ("s3 M20 store rebase never writes its result", DRA,
     '        if (removed.length === 0) return removed;\n        await write(kept);\n',
     '        if (removed.length === 0) return removed;\n'),
    ("s3 M21 the session accepts writes after it ends", DRA,
     '      if (key === null) return Promise.resolve(false);\n',
     ''),
    ("s3 M22 the session closes only after its drop lands", DRA,
     '      const ending = key;\n      key = null;\n      return ending === null ? Promise.resolve(false) : store.drop(ending);',
     '      const ending = key;\n      return ending === null\n        ? Promise.resolve(false)\n        : store.drop(ending).then((dropped) => {\n            key = null;\n            return dropped;\n          });'),
    ("s3 M23 ending the session does not drop its draft", DRA,
     '      return ending === null ? Promise.resolve(false) : store.drop(ending);',
     '      return Promise.resolve(false);'),
    ("s3 M24 a new profile's session is keyed null", DRA,
     '      key = draftKeyFor(profileId);',
     '      key = String(profileId);'),
    ("s3 M25 draft.js declares its own sets", DRA,
     'import { VALID_OPERATIONS, VALID_SIDES } from "./rules.js";',
     'const VALID_OPERATIONS = new Set(["set", "append", "remove"]);\nconst VALID_SIDES = new Set(["request", "response"]);'),
    ("s3 M26 getDrafts reads storage directly, outside the queue", POP,
     '    return await draftStore.read();',
     '    return (await chrome.storage.session.get(STORAGE_KEY_DRAFTS))?.[STORAGE_KEY_DRAFTS] ?? {};'),
    ("s3 M27 the session is given a store of its own", POP,
     'const draftSession = createDraftSession(draftStore);',
     'const draftSession = createDraftSession(createDraftStore({\n  read: async () =>\n    (await chrome.storage.session.get(STORAGE_KEY_DRAFTS))?.[STORAGE_KEY_DRAFTS],\n  write: (drafts) => chrome.storage.session.set({ [STORAGE_KEY_DRAFTS]: drafts }),\n}));'),
    ("s3 M28 openEditor restores by key, bypassing draftFor", POP,
     '  const restored = draftToForm(draftFor(drafts, editingProfileId));',
     '  const restored = draftToForm(drafts[draftKeyFor(editingProfileId)]);'),
    ("s3 M29 openEditor binds to the profile shown (the s2 line)", POP,
     '  editingBaseDigest = await baseForEditor(restored, profile, profileDigest);',
     '  editingBaseDigest = profile ? await profileDigest(profile) : null;'),
    ("s3 M30 openEditor never opens the draft session", POP,
     '  draftSession.open(editingProfileId);\n  showView("edit");',
     '  showView("edit");'),
    ("s3 M31 persistDraft writes without the base", POP,
     '    await draftSession.put(formToDraft({ ...readFormRaw(), baseDigest: editingBaseDigest }));',
     '    await draftSession.put(formToDraft(readFormRaw()));'),
    ("s3 M32 persistDraft writes to the store, bypassing the session", POP,
     '    await draftSession.put(formToDraft({ ...readFormRaw(), baseDigest: editingBaseDigest }));',
     '    await draftStore.put(draftKeyFor(editingProfileId), formToDraft({ ...readFormRaw(), baseDigest: editingBaseDigest }));'),
    ("s3 M33 saveProfile ends the session before the profile write", POP,
     '  await setProfiles(nextProfiles);\n\n  // FINDING-042: the draft has become the saved state',
     '  await draftSession.end();\n  await setProfiles(nextProfiles);\n\n  // FINDING-042: the draft has become the saved state'),
    ("s3 M34 Cancel leaves the draft session open", POP,
     '  await draftSession.end();\n  setRestoredNotice(false);\n  showView("list");',
     '  setRestoredNotice(false);\n  showView("list");'),
    ("s3 M35 revertToSaved never reopens the draft session", POP,
     '  hideFormError();\n  draftSession.open(editingProfileId);\n',
     '  hideFormError();\n'),
    ("s3 M36 deleteProfile does not purge the deleted profile's draft", POP,
     '  try {\n    await draftStore.drop(draftKeyFor(id));\n  } catch (err) {\n    console.error("HeaderWright: could not discard the deleted profile\'s draft —", err);\n  }\n',
     ''),
    ("s3 M37 a failed purge is rethrown and fails the delete", POP,
     '    console.error("HeaderWright: could not discard the deleted profile\'s draft —", err);\n',
     '    console.error("HeaderWright: could not discard the deleted profile\'s draft —", err);\n    throw err;\n'),
    ("s3 M38 applyImport does not check drafts again", POP,
     '  try {\n    await draftStore.rebase(nextProfiles, profileDigest);\n  } catch (err) {\n    console.error("HeaderWright: could not re-check drafts against the import —", err);\n  }\n',
     ''),
    ("s3 M39 applyImport checks drafts again before the profile write", POP,
     '  // Persist FIRST — same lesson as saveProfile.\n  await setProfiles(nextProfiles);\n',
     '  await draftStore.rebase(nextProfiles, profileDigest);\n  // Persist FIRST — same lesson as saveProfile.\n  await setProfiles(nextProfiles);\n'),
    ("s3 M40 the card reads its draft by key, bypassing draftFor", POP,
     '  const draft = draftFor(drafts, profile.id);',
     '  const draft = drafts ? drafts[draftKeyFor(profile.id)] : null;'),

    # ---- s5, AR-11 with AR-23: M1-M11 of test/PREDICTIONS-2026-10-09-s5.md
    # (commit 2). The floor is derived from test/platform-floor.mjs, so each
    # way it could drift from what the extension uses is a mutant: a floor
    # above or below the derived one, something in use the table lacks, a
    # table entry that is wrong, and AR-23's lowercase append undone or
    # overdone.
    ("s5 M1 minimum_chrome_version is raised above the derived floor", MAN,
     '"minimum_chrome_version": "116"',
     '"minimum_chrome_version": "120"'),
    ("s5 M2 the worker calls a chrome.* API nobody registered", SW,
     'chrome.runtime.onStartup.addListener(() => {',
     'chrome.idle.onStateChanged.addListener(() => {});\nchrome.runtime.onStartup.addListener(() => {'),
    ("s5 M3 the manifest gains a key nobody registered", MAN,
     '"minimum_chrome_version": "116",',
     '"minimum_chrome_version": "116",\n  "incognito": "split",'),
    ("s5 M4 the manifest requests a permission nobody registered", MAN,
     '    "storage"\n  ],',
     '    "storage",\n    "alarms"\n  ],'),
    ("s5 M5 the rule builder emits a resource type nobody registered", RUL,
     '"webtransport", "webbundle", "other",\n];',
     '"webtransport", "webbundle", "other", "speculative",\n];'),
    ("s5 M6 the append allowlist gains a name nobody registered", RUL,
     '"user-agent", "via", "want-digest", "x-forwarded-for",\n]);',
     '"user-agent", "via", "want-digest", "x-forwarded-for", "x-real-ip",\n]);'),
    ("s5 M7 an appended name is sent as typed again (AR-23 undone)", RUL,
     'header: entry.operation === "append" ? entry.name.toLowerCase() : entry.name,',
     'header: entry.name,'),
    ("s5 M8 every header name is lowercased, not only an append's", RUL,
     'header: entry.operation === "append" ? entry.name.toLowerCase() : entry.name,',
     'header: entry.name.toLowerCase(),'),
    ("s5 M9 the export lowercases an appended name", CAN,
     'const out = { name: entry.name, operation: entry.operation };',
     'const out = { name: entry.operation === "append" ? entry.name.toLowerCase() : entry.name, operation: entry.operation };'),
    ("s5 M10 README states an older floor", RDM,
     'Requires Chrome 116 or later.',
     'Requires Chrome 102 or later.'),
    ("s5 M11 the registry records append user-agent as 108", PLF,
     'kind: "append", name: "user-agent", chrome: 116,',
     'kind: "append", name: "user-agent", chrome: 108,'),

    # ---- s5, UI-04 with AR-17: N1-N13 of test/PREDICTIONS-2026-10-09-s5.md
    # (commit 3). Each puts back a word or a claim the commit removed, or
    # breaks a promise PRIVACY.md now makes about the manifest and the code.
    ("s5 N1 the status line says applying N again (UI-04 undone)", STA,
     '  return `registered ${r.activeRuleCount}`;',
     '  return `applying ${r.activeRuleCount}`;'),
    ("s5 N2 the partial line says not applied again", STA,
     '${notRegistered} not registered`;',
     '${notRegistered} not applied`;'),
    ("s5 N3 the zero-rule line says nothing to apply again", STA,
     '=== 0) return "nothing registered";',
     '=== 0) return "nothing to apply";'),
    ("s5 N4 the footer's hover text says Not applied again", POP,
     '? `Not registered: ${notRegistered.join("; ")}`',
     '? `Not applied: ${notRegistered.join("; ")}`'),
    ("s5 N5 README's example goes back to applying 0 · 2 not applied", RDM,
     'ends `registered 0 · 2 not registered`',
     'ends `applying 0 · 2 not applied`'),
    ("s5 N6 SMOKE.md expects the dead failure string again", SMK,
     'Status line reads `sync failed —\n   previous rules may still be applying`',
     'Status line reads "not applying —\n   last sync failed"'),
    ("s5 N7 PRIVACY.md says no data leaves your device again", PRV,
     'HeaderWright collects nothing.',
     'HeaderWright collects nothing. No data leaves your device.'),
    ("s5 N8 PRIVACY.md stops naming chrome.storage.session", PRV,
     '  (`chrome.storage.session`), in memory, until you save or cancel them;',
     '  in memory, until you save or cancel them;'),
    ("s5 N9 PRIVACY.md says response headers are appended", PRV,
     'you configure change what your browser receives;',
     'you configure are appended to what your browser receives;'),
    ("s5 N10 the popup makes a network request of its own", POP,
     '(async function init() {\n',
     '(async function init() {\n  fetch("https://example.com/");\n'),
    ("s5 N11 the manifest requests webRequest", MAN,
     '    "storage"\n  ],',
     '    "storage",\n    "webRequest"\n  ],'),
    ("s5 N12 README's service-worker section is renamed", RDM,
     '## Pages with a service worker',
     '## Service workers'),
    ("s5 N13 README's badge bullet stops naming the ! badge", RDM,
     'for the toggle, and `!` when',
     'for the toggle, and a warning mark when'),
]

backup = {}
for _, f, _, _ in MUTATIONS:
    backup[f] = f.read_text()

def restore():
    for f, t in backup.items():
        f.write_text(t)

print(f"{'mutation':62s} {'applied':>8s} {'fails':>6s}")
print("-" * 80)
results = []
for name, f, old, new in MUTATIONS:
    restore()
    src = f.read_text()
    applied = old in src
    if not applied:
        print(f"{name:62s} {'NO':>8s} {'--':>6s}   <-- PATCH DID NOT APPLY")
        # FOURTH FIELD KEPT IN SYNC WITH THE APPLIED BRANCH. The summary
        # lines below unpack four. A three-tuple here would make the harness
        # throw on exactly the run where an anchor went stale — the condition
        # this branch exists to report.
        results.append((name, False, None, False))
        continue
    f.write_text(src.replace(old, new, 1))
    r = subprocess.run(["node", "test/selftest.mjs"], cwd=ROOT,
                       capture_output=True, text=True)
    out = r.stdout + r.stderr
    fails = len(re.findall(r"^FAIL:", out, re.M))
    tripwire = "count tripwire" in out
    # CRASH IS DETECTED BY ABSENCE OF A TERMINAL LINE, not by error name.
    # The previous test string-matched SyntaxError/ReferenceError/TypeError,
    # which only catches the throws someone thought to enumerate — a RangeError
    # or a bare `throw new Error()` read as a clean run. A selftest that
    # REACHES ITS END always prints exactly one of three terminal lines. If
    # none is present the suite died partway, whatever it died of, and the
    # fail count below is a floor rather than a measurement.
    finished = ("checks passed" in out or "checks FAILED" in out
                or "count tripwire" in out)
    crashed = not finished
    label = f"{fails}" + (" +tw" if tripwire else "") + (" CRASH" if crashed else "")
    print(f"{name:62s} {'yes':>8s} {label:>6s}")
    results.append((name, True, fails, crashed))

restore()
r = subprocess.run(["node", "test/selftest.mjs"], cwd=ROOT, capture_output=True, text=True)
print("-" * 80)
print("restored:", r.stdout.strip())
zero = [n for n, a, f, c in results if a and f == 0]
if zero:
    print("ZERO-FAIL MUTATIONS (uncovered):", zero)
# A CRASHING MUTANT'S COUNT IS NOT A COVERAGE NUMBER. The suite aborts where
# it throws, so every check after that point never ran and the printed figure
# is whatever happened to execute first. The "legacy default flips" mutant
# read as 2 while its real coverage was 18 — the crash hid sixteen failures,
# and the annotation sat in the table where nobody totalled it. Zero-fail gets
# a summary line because it means UNCOVERED; crash needs one too, because it
# means UNMEASURED, and unmeasured silently reads as covered.
crashing = [n for n, a, f, c in results if a and c]
if crashing:
    print("CRASHING MUTATIONS (count is a floor, not coverage):", crashing)
notapplied = [n for n, a, f, c in results if not a]

# THE HARNESS NOW DECIDES ITS OWN VERDICT. It used to exit 0 unconditionally,
# printing its problems and leaving the reader to notice them. verify.mjs
# compensated by scanning output for failure phrases — a workaround for a tool
# that would not say whether it had passed. Both signals now exist and must
# agree; a harness that reports a problem and exits 0 is the shape that let a
# red mutate-scans sit unnoticed across two sessions.
DIGEST_AFTER = tree_digest(SOURCE_ROOT)
if DIGEST_AFTER != DIGEST_BEFORE:
    # Cannot happen while mutants land in the copy — which is exactly why it is
    # asserted rather than assumed. This is the check that would have fired on
    # the pre-2026-09-13 harness after any interrupted run.
    print("SOURCE TREE MODIFIED BY A MUTATION RUN — this must never happen")
if zero or crashing or notapplied or DIGEST_AFTER != DIGEST_BEFORE:
    sys.exit(1)
print(f"all {len(results)} mutants applied and covered; source tree untouched")
