import subprocess, shutil, pathlib, sys, re

# FINDING-032. The mutants for the source-text scans in selftest.mjs — the
# checks that read popup.js and popup.html as TEXT rather than executing them.
#
# WHY THIS IS A SEPARATE SCRIPT FROM mutate-collisions.py, AND WHY THE COLUMN
# IS "expect" RATHER THAN "fails". Every mutation in mutate-collisions.py is a
# planted product defect and the oracle is "at least one check fails". Half the
# mutations here are planted COMMENTS with the product unchanged, and for those
# the correct outcome is ZERO failures — a check that fires on prose describing
# it is a false alarm, and a false alarm is the defect being tested for. A
# runner whose only verdict is "did anything fail" cannot score this file.
#
# Read the expect column as: what the suite SHOULD say about a tree in this
# state. A row is PASS when the observed count matches.
ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / "extension/popup/popup.html"
TEST = ROOT / "test/selftest.mjs"

MUTATIONS = [
    # ---- The false PASS. This is the one that costs something: FINDING-022's
    # fix is REMOVED from the stylesheet and a comment names the two removed
    # declarations. Before the comment strip this scored 0 and the suite read
    # 273/273 with the popup no longer containing its list.
    ("F022 fix deleted, named only in a comment", HTML, 2,
     """  main {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px 10px;
    background: var(--surface);
  }""",
     """  /* FINDING-022: the scrolling region is main { overflow-y: auto; min-height: 0; } */
  main {
    flex: 1 1 auto;
    padding: 12px 16px 10px;
    background: var(--surface);
  }"""),

    # ---- The false ALARM, and the expect is 0 on purpose. The stylesheet is
    # untouched; the CSS comment above the body rule documents the rejected
    # form verbatim, which is a thing a future editor has every reason to do.
    # Before the comment strip this turned "the body cap uses NO viewport
    # unit" red — a guard firing on its own explanation.
    ("the rejected vh cap is quoted in a comment, not declared", HTML, 0,
     "     `vh` IS CIRCULAR IN A POPUP THAT SIZES TO ITS CONTENT.",
     "     The rejected form was, verbatim: body { max-height: min(600px, 100vh); }\n"
     "     `vh` IS CIRCULAR IN A POPUP THAT SIZES TO ITS CONTENT."),

    # ---- The instrument itself (lesson 5). An over-aggressive stripper that
    # also eats string literals would silently empty the id and class scans.
    # What catches it is the pair of "the scan works" floor checks, which is
    # what they are FOR — recorded here so they read as load-bearing rather
    # than as decoration a tidying pass could drop.
    # EXPECT MOVES WHEN A STRING-BASED SCAN IS ADDED, and that is the point of
    # pinning the number rather than "at least one". It went 6 -> 7 in v0.1.7
    # when the FINDING-002 chip check started reading popup.js as text.
    ("the comment stripper also eats string literals", TEST, 7,
     "const popupJs = stripJsComments(popupJsRaw);",
     'const popupJs = stripJsComments(popupJsRaw).replace(/"[^"]*"/g, \'""\');'),

    # ---- The strip removed entirely: the pre-FINDING-032 state. Scored
    # against the SAME two mutants above it would restore both defects, but on
    # a clean tree it changes nothing, which is precisely why the finding
    # survived three releases. Expect 0, and read that as the point.
    ("the comment strip is removed (pre-FINDING-032 state)", TEST, 0,
     "const popupJs = stripJsComments(popupJsRaw);",
     "const popupJs = popupJsRaw;"),
]

backup = {}
for _, f, _, _, _ in MUTATIONS:
    backup[f] = f.read_text()

def restore():
    for f, t in backup.items():
        f.write_text(t)

print(f"{'mutation':58s} {'applied':>8s} {'fails':>6s} {'expect':>7s} {'':>5s}")
print("-" * 92)
verdicts = []
for name, f, expect, old, new in MUTATIONS:
    restore()
    src = f.read_text()
    applied = old in src
    if not applied:
        print(f"{name:58s} {'NO':>8s} {'--':>6s} {expect:>7d}   <-- PATCH DID NOT APPLY")
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
    print(f"{name:58s} {'yes':>8s} {label:>6s} {expect:>7d} {'PASS' if ok else 'FAIL':>5s}")
    verdicts.append((name, ok))

restore()
r = subprocess.run(["node", "test/selftest.mjs"], cwd=ROOT, capture_output=True, text=True)
print("-" * 92)
print("restored:", r.stdout.strip())
bad = [n for n, ok in verdicts if not ok]
if bad:
    print("MUTANTS NOT MATCHING EXPECT:", bad)
    sys.exit(1)
print(f"all {len(verdicts)} mutants matched expect")
