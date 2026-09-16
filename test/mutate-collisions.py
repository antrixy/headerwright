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
RDM = ROOT / "README.md"
SCP = ROOT / "SCOPE.md"
MAN = ROOT / "extension/manifest.json"
ORC = ROOT / "test/oracle/index.html"
ORM = ROOT / "test/oracle/index.mjs"
MC  = ROOT / "test/mutate-scans.py"
STO = ROOT / "extension/lib/stored.js"

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
    ("a v1 envelope carrying side is accepted (0.1.x would misapply it)", CAN,
     '        const allowed = doc.version >= 2 ? ENTRY_KEYS_V2 : ENTRY_KEYS_V1;',
     '        const allowed = ENTRY_KEYS_V2;'),
    ("unknown fields are dropped in silence again", CAN,
     '          if (!allowed.has(key)) {',
     '          if (false) {'),

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
    ("canonicalizeProfiles drops unknown ENTRY fields in silence again", CAN,
     '            if (!ENTRY_KEYS_V2.has(key)) {',
     '            if (false) {'),
    # ---- HW-V6-05. Removing the value check restores a codec that writes a
    # typo out as a request header and re-imports it as one.
    ("the export path stops validating known field VALUES", CAN,
     '          const verdict = validateHeaderEntry(entry);\n          if (!verdict.valid) {',
     '          const verdict = { valid: true };\n          if (!verdict.valid) {'),

    ("canonicalizeProfiles drops unknown PROFILE fields in silence again", CAN,
     '        if (!PROFILE_KEYS.has(key)) {',
     '        if (false) {'),

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
     '      problems.push(`profile ${index + 1} is not an object`);\n      return;',
     '      throw new Error("bad profile");'),
    ("enabled is read from the profiles value, coupling the two", STO,
     'enabled: stored[keys.enabled] === true,',
     'enabled: stored[keys.enabled] === true && profiles.length > 0,'),
    ("problems stop naming which profile failed", STO,
     '`profile ${index + 1} is not an object`',
     '"a profile is not an object"'),

    ("the digest stops deciding whether a harness fails", MC,
     'if bad or DIGEST_AFTER != DIGEST_BEFORE:',
     'if bad:'),
    ("only the LATER duplicate is skipped (a winner is picked)", SW,
     '    [...idCounts].filter(([, count]) => count > 1).map(([id]) => id)',
     '    [...idCounts].filter(([, count]) => count > 2).map(([id]) => id)'),
    ("minimum_chrome_version is dropped from the manifest", MAN,
     '  "minimum_chrome_version": "101",\n',
     ''),
    ("minimum_chrome_version drifts below requestDomains' floor", MAN,
     '"minimum_chrome_version": "101"',
     '"minimum_chrome_version": "88"'),
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
