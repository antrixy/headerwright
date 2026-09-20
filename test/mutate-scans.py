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
    # 7 -> 12 on 2026-09-13: the v0.2.0 side-control checks and the three
    # oracle-page checks all read source as text.
    # NOT MOVED by the two FINDING-041 checks added the same evening: they
    # read preflight.mjs raw, so the stripper never touches them — the same
    # reason the FINDING-039 manifest checks left this number alone. Predicted
    # 17, measured 15; the harness was right and the prediction was not.
    # 12 -> 15 on 2026-09-20: the two FINDING-042 checks that read popup.js and
    # popup.html as text for the draft store and the revert control, plus the
    # readFormRaw side-control scan added when FINDING-042's fix silently
    # weakened the readForm one by introducing a second occurrence of its
    # substring. The
    # FINDING-039 manifest checks did NOT move it — they read manifest.json
    # separately and the stripper never touches them.
    # HOW THE DRIFT WAS FOUND IS THE PART WORTH KEEPING. It was not found here.
    # Two sessions added checks, ran mutate-collisions.py because FIRST ACTIONS
    # named that one, reported the tree green, and never ran this file — which
    # had been sitting red the whole time. An external review found it. There
    # are THREE harnesses and no single command runs them all; until there is,
    # "the tree is green" means "the harness someone remembered is green".
    # (`node test/verify.mjs` is now that command, added 2026-09-13.)
    ("the comment stripper also eats string literals", TEST, 15,
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
    # CRASH IS DETECTED BY ABSENCE OF A TERMINAL LINE, not by error name — the
    # same fix mutate-collisions.py received on 2026-09-13 and which was not
    # carried across at the time. String-matching three error names only catches
    # the throws someone thought to enumerate: a RangeError or a bare Error read
    # as a completed run, and if the partial FAIL count happened to equal the
    # expected count the row would report PASS on a suite that died partway.
    finished = ("checks passed" in out or "checks FAILED" in out
                or "count tripwire" in out)
    crashed = not finished
    ok = (fails == expect) and not tripwire and not crashed
    label = f"{fails}" + (" +tw" if tripwire else "") + (" CRASH" if crashed else "")
    print(f"{name:58s} {'yes':>8s} {label:>6s} {expect:>7d} {'PASS' if ok else 'FAIL':>5s}")
    verdicts.append((name, ok))

restore()
r = subprocess.run(["node", "test/selftest.mjs"], cwd=ROOT, capture_output=True, text=True)
print("-" * 92)
print("restored:", r.stdout.strip())
bad = [n for n, ok in verdicts if not ok]
# The source-untouched assertion is evidence, not defence — mutants land in a
# throwaway copy, so this can only fail if that stopped being true.
DIGEST_AFTER = tree_digest(SOURCE_ROOT)
if DIGEST_AFTER != DIGEST_BEFORE:
    print("SOURCE TREE MODIFIED BY A MUTATION RUN — this must never happen")
if bad:
    print("MUTANTS NOT MATCHING EXPECT:", bad)
if bad or DIGEST_AFTER != DIGEST_BEFORE:
    sys.exit(1)
print(f"all {len(verdicts)} mutants matched expect; source tree untouched")
