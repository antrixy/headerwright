"""Shared plumbing for the mutation harnesses.

WHY THIS EXISTS. All three harnesses used to write mutants directly into
extension/ and test/, restoring only after their loop completed normally. No
try/finally, no signal handling, no lock. Reproduced 2026-09-13 from external
review: SIGKILL mid-run left extension/lib/collisions.js carrying the "only ONE
side of a collision is marked" mutant — the FINDING-021 defect — and because
each harness captures its "original" text at startup, THE NEXT RUN WOULD HAVE
TREATED THE MUTANT AS THE BASELINE and reported green against a broken file.

A verification command that can leave the product broken, and then launder the
breakage into the next run's baseline, is worse than no verification.

THE FIX IS NOT BETTER CLEANUP. Cleanup cannot be made total — SIGKILL runs no
handler, and no amount of try/finally survives it. The fix is that the real
tree is never written to at all. Mutants are applied inside a throwaway copy;
the worst an interrupt can do is leave a directory in /tmp.
"""

import atexit
import hashlib
import pathlib
import shutil
import tempfile

# Only these are needed: selftest.mjs resolves ../extension/... relative to
# itself, and reads the manifest and the oracle page. Copying the whole repo
# would also copy .git, which is large and pointless here.
SUBTREES = ("extension", "test")

# ROOT-LEVEL FILES THE SUITE READS. Added 2026-09-13 when a mutant first
# targeted README.md and the run died with FileNotFoundError inside the copy.
# That was the revisit trigger written into the harness-safety ruling, and it
# fired exactly as described — SAFELY, because the missing file was in the
# throwaway tree and the real README was never touched. Under the old
# mutate-in-place harnesses the same mutant would have edited the real file
# and left it edited.
#
# ANY NEW MUTANT TARGETING A ROOT FILE MUST ADD IT HERE in the same commit.
ROOT_FILES = ("README.md", "SCOPE.md", "PRIVACY.md")


def disposable_root(source_root):
    """Copy the minimal tree to a temp dir and return it.

    Callers set ROOT to the result, so every path derived from ROOT — and the
    subprocess cwd — lands inside the copy with no further changes.

    Cleanup is best-effort BY DESIGN. atexit does not run on SIGKILL, and that
    is fine: a leaked temp directory is harmless, and the property being
    protected is that the SOURCE is never written, not that /tmp stays tidy.
    """
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="hw-mutate-"))
    atexit.register(shutil.rmtree, tmp, ignore_errors=True)
    for sub in SUBTREES:
        shutil.copytree(source_root / sub, tmp / sub)
    for name in ROOT_FILES:
        src = source_root / name
        if src.exists():
            shutil.copy2(src, tmp / name)
    return tmp


def tree_digest(root):
    """Stable digest of the subtrees, for the source-untouched assertion.

    The harnesses check this before and after. It is not defence — the copy
    already provides that — it is EVIDENCE, so the claim "mutation testing does
    not modify the source" is measured on every run rather than asserted once
    in a comment. Comments claiming guarantees they do not deliver are this
    project's most repeated defect.
    """
    h = hashlib.sha256()
    for name in ROOT_FILES:
        path = root / name
        if path.exists():
            h.update(name.encode())
            h.update(path.read_bytes())
    for sub in SUBTREES:
        base = root / sub
        # __pycache__ is created by importing THIS module, so including it
        # would make the digest depend on whether Python had cached the
        # bytecode yet — a check that fails for a reason unrelated to what it
        # measures is worse than no check.
        for path in sorted(
            p for p in base.rglob("*")
            if p.is_file() and "__pycache__" not in p.parts
        ):
            h.update(str(path.relative_to(root)).encode())
            h.update(path.read_bytes())
    return h.hexdigest()
