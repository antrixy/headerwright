import subprocess, shutil, pathlib, sys, re

# Repo root, derived from this file so the script runs anywhere. It was
# committed with a hardcoded container path, which meant it could not run
# for anyone — defeating the point of committing it.
ROOT = pathlib.Path(__file__).resolve().parent.parent
COL = ROOT / "extension/lib/collisions.js"
CAN = ROOT / "extension/lib/canonical.js"
POP = ROOT / "extension/popup/popup.js"
HTML = ROOT / "extension/popup/popup.html"

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
     'names.add(entry.name.toLowerCase());',
     'names.add(entry.name);'),
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
     '  const facts = collisionFacts(collisions, profileId, nameFor);\n  if (!facts) return "";\n  const { headers, others, headerList } = facts;\n  const one = headers.length === 1;',
     '  return describeCollisions(collisions, profileId, nameFor);\n  const facts = collisionFacts(collisions, profileId, nameFor);\n  if (!facts) return "";\n  const { headers, others, headerList } = facts;\n  const one = headers.length === 1;'),
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
     '`profiles cannot write the same header on the same request. Change the ` +\n    `header or the domains, then save.`',
     '`profiles cannot write the same header on the same request.`'),
    ("import refusal terminates itself (the double-period defect)", COL,
     '`the same header on the same request` +',
     '`the same header on the same request.` +'),
    ("import refusal omits the header name", COL,
     '`"${first.header}" on overlapping domains, and two profiles cannot write ` +',
     '`on overlapping domains, and two profiles cannot write ` +'),
    ("import refusal names only ONE side", COL,
     '`${nameOf(idA, nameFor)} and ${nameOf(idB, nameFor)} both write header ` +',
     '`${nameOf(idA, nameFor)} writes header ` +'),
    ("import refusal drops the further-collisions count", COL,
     '    (remaining > 0',
     '    (false'),
    ("import throw re-adds the duplicated wrapper sentence", CAN,
     '    throw new Error(describeImportRefusal(collisions, (id) => nameById.get(id)));',
     '    throw new Error("this file has profiles that would write the same header on overlapping domains, which has no defined winner. " + describeImportRefusal(collisions, (id) => nameById.get(id)));'),

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
     '    max-height: min(600px, 100vh);\n',
     ''),
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
        results.append((name, False, None))
        continue
    f.write_text(src.replace(old, new, 1))
    r = subprocess.run(["node", "test/selftest.mjs"], cwd=ROOT,
                       capture_output=True, text=True)
    out = r.stdout + r.stderr
    fails = len(re.findall(r"^FAIL:", out, re.M))
    tripwire = "count tripwire" in out
    crashed = "SyntaxError" in out or "ReferenceError" in out or "TypeError" in out
    label = f"{fails}" + (" +tw" if tripwire else "") + (" CRASH" if crashed else "")
    print(f"{name:62s} {'yes':>8s} {label:>6s}")
    results.append((name, True, fails))

restore()
r = subprocess.run(["node", "test/selftest.mjs"], cwd=ROOT, capture_output=True, text=True)
print("-" * 80)
print("restored:", r.stdout.strip())
zero = [n for n, a, f in results if a and f == 0]
if zero:
    print("ZERO-FAIL MUTATIONS (uncovered):", zero)
