import subprocess, pathlib, sys, re

# FINDING-028 / FINDING-024, v0.1.7. Mutants for the toRequest narrowing in
# lib/grants.js and for the chip recovery path in popup.js that the narrowing
# now leans on.
#
# Same expect-column shape as mutate-scans.py: a row PASSES when the observed
# failure count equals what the suite SHOULD say about a tree in that state.
# Every mutant here is a planted product defect, so every expect is non-zero —
# a zero would mean the defect is uncovered.
#
# THE FIRST MUTANT IS THE FINDING ITSELF. It restores the v0.1.6 line verbatim.
# Anything that does not kill it is not testing FINDING-028.
ROOT = pathlib.Path(__file__).resolve().parent.parent
GRANTS = ROOT / "extension/lib/grants.js"
POP = ROOT / "extension/popup/popup.js"

CURRENT = "  const toRequest = [...after].filter((d) => !before.has(d) && !granted.has(d));"

MUTATIONS = [
    # ---- the defect, restored exactly as v0.1.6 shipped it
    ("FINDING-028 reintroduced: toRequest reads grant state only", GRANTS, 6,
     CURRENT,
     "  const toRequest = [...after].filter((d) => !granted.has(d));"),

    # ---- the opposite error: membership only, grant intersection dropped.
    # Every added domain is requested even when it is already fully granted,
    # which is permission churn on an ordinary save.
    ("the grant intersection is dropped (churn on an already-granted add)", GRANTS, 1,
     CURRENT,
     "  const toRequest = [...after].filter((d) => !before.has(d));"),

    # ---- requests nothing at all. Passes every FINDING-028 row above, because
    # those rows assert emptiness; only the two positive rows catch it. Planted
    # to prove those two are doing work.
    ("nothing is ever requested", GRANTS, 6,
     CURRENT,
     "  const toRequest = [];"),

    # ---- the strict/permissive swap finding 20 was written about. A legacy
    # domain the change ADDS reads as held, so the upgrade never completes.
    ("toRequest reads the PERMISSIVE set (finding 20's swap)", GRANTS, 1,
     CURRENT,
     "  const toRequest = [...after].filter((d) => !before.has(d) && !held.has(d));"),

    # ---- membership diffed the wrong way round. Reads plausibly and is empty
    # for every real input.
    ("membership diffed against the wrong side", GRANTS, 6,
     CURRENT,
     "  const toRequest = [...after].filter((d) => !after.has(d) && !granted.has(d));"),

    # ---- the recovery path FINDING-002 shipped and v0.1.7 now depends on.
    # A tidying pass that makes the chip a span turns a denied domain back into
    # a dead end, and before v0.1.7 nothing in the suite looked at it.
    ("the ungranted chip becomes a span (FINDING-002 dead end returns)", POP, 1,
     'const chip = document.createElement(granted ? "span" : "button");',
     'const chip = document.createElement("span");'),

    # ---- the chip requests more than its own domain, which is FINDING-028's
    # breadth reappearing on the one surface that is supposed to be per-domain.
    ("the chip requests every domain, not its own", POP, 1,
     "      const ok = await chrome.permissions.request({\n        origins: originsForDomain(domain),\n      });",
     "      const ok = await chrome.permissions.request({\n        origins: originsFor(profile.domains),\n      });"),
]

backup = {}
for _, f, _, _, _ in MUTATIONS:
    backup[f] = f.read_text()

def restore():
    for f, t in backup.items():
        f.write_text(t)

print(f"{'mutation':62s} {'applied':>8s} {'fails':>6s} {'expect':>7s} {'':>5s}")
print("-" * 96)
verdicts = []
for name, f, expect, old, new in MUTATIONS:
    restore()
    src = f.read_text()
    if old not in src:
        print(f"{name:62s} {'NO':>8s} {'--':>6s} {expect:>7d}   <-- PATCH DID NOT APPLY")
        verdicts.append((name, False))
        continue
    f.write_text(src.replace(old, new, 1))
    r = subprocess.run(["node", "test/selftest.mjs"], cwd=ROOT,
                       capture_output=True, text=True)
    out = r.stdout + r.stderr
    fails = len(re.findall(r"^FAIL:", out, re.M))
    tripwire = "count tripwire" in out
    crashed = "SyntaxError" in out or "ReferenceError" in out or "TypeError" in out
    ok = (fails == expect) and not tripwire and not crashed
    label = f"{fails}" + (" +tw" if tripwire else "") + (" CRASH" if crashed else "")
    print(f"{name:62s} {'yes':>8s} {label:>6s} {expect:>7d} {'PASS' if ok else 'FAIL':>5s}")
    verdicts.append((name, ok))

restore()
r = subprocess.run(["node", "test/selftest.mjs"], cwd=ROOT, capture_output=True, text=True)
print("-" * 96)
print("restored:", r.stdout.strip())
bad = [n for n, ok in verdicts if not ok]
if bad:
    print("MUTANTS NOT MATCHING EXPECT:", bad)
    sys.exit(1)
print(f"all {len(verdicts)} mutants matched expect")
