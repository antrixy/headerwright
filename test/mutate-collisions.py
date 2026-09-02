import subprocess, shutil, pathlib, sys, re

# Repo root, derived from this file so the script runs anywhere. It was
# committed with a hardcoded container path, which meant it could not run
# for anyone — defeating the point of committing it.
ROOT = pathlib.Path(__file__).resolve().parent.parent
COL = ROOT / "extension/lib/collisions.js"
CAN = ROOT / "extension/lib/canonical.js"

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
