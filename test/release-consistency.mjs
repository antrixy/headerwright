// release-consistency.mjs
// R15. What the CODE can do, and whether every user-facing artifact agrees.
//
// FOUR INSTANCES BEFORE THIS EXISTED, ALL FOUND BY ACCIDENT:
//   - `SCOPE.md` promising response-side `append` the validator refuses
//     (2026-09-19, found by a human reading two files side by side)
//   - the manifest's name and description describing a request-only extension
//     on the response-header release (FINDING-039, found in a screenshot taken
//     for an unrelated precondition)
//   - `README.md` with the identical defect in the identical cycle
//     (FINDING-044, found while adding an unrelated section to the file)
//   - `manifest.version`, which NOTHING reads even now
//
// EVERY ONE WAS A FORGETTING, NOT A FALSEHOOD. Nobody wrote something untrue
// on purpose. Someone updated one artifact and did not think of the next.
//
// SO THE DELIVERABLE IS THE REGISTRY, NOT THE ASSERTIONS. Per-artifact text
// scans catch the four known cases and nothing about the fifth artifact nobody
// thought of — which is exactly the mechanism that produced all four. The
// registry below enumerates every user-facing artifact and every derived fact,
// and `selftest.mjs` pins both counts. A new root `.md`, or a new capability,
// fails the suite until someone registers it — even when the honest answer is
// "this file makes no capability claims", which must then be SAID rather than
// assumed. Forgetting becomes an error.
//
// THE COST, STATED: a `CONTRIBUTING.md` would fail the suite until registered
// as claim-free. That is friction on a file with nothing to do with releases,
// and it is the price of the property being bought. Same shape as
// EXPECTED_CHECKS and EXPECTED_ROWS, both of which caught real drift on
// 2026-09-20.
//
// WHAT THIS CANNOT DO. R15's wording — "manifest version, README capabilities,
// export format version, visible popup features and smoke-test version must
// all describe the same release" — reads as though versions can be
// cross-checked. They cannot: there is no second version string in the
// repository to compare `manifest.version` against. It is PINNED here instead,
// which catches a value left at `0.1.7` through a tag and a `0.20` typo, and
// which is weaker than the wording suggests. Said plainly rather than papered
// over.

import { readFileSync } from "node:fs";

/**
 * The body of one markdown section, heading exclusive, up to the next heading
 * at the same or higher level. Returns "" when the heading is absent, so a
 * renamed section fails its rule rather than passing vacuously.
 *
 * WHY THIS EXISTS. Prose scans that read a whole file are satisfied by any
 * passing mention of the word they look for, which makes them pass on exactly
 * the edit they are meant to catch. Five checks in this repository were
 * weakened that way on 2026-09-20 alone. Reading the section that MAKES the
 * claim is the least-bad available discipline.
 *
 * IT IS STILL BEST-EFFORT, and that is the honest limit of the per-artifact
 * half of R15: you cannot reliably assert "this document does not claim X"
 * about prose, because documents legitimately discuss X while not claiming it.
 * The REGISTRY and its tripwires are the load-bearing part.
 */
function section(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return "";
  const level = heading.match(/^#+/)[0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#+)\s/);
    return m && m[1].length <= level;
  });
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}
import { profileToRule, validateHeaderEntry } from "../extension/lib/rules.js";
import { versionFor } from "../extension/lib/canonical.js";

/**
 * Capability facts, DERIVED FROM THE CODE rather than declared.
 *
 * Deriving matters: a declared list is one more artifact that can drift, and
 * an artifact that drifts silently is the entire problem. If the product stops
 * emitting response headers, `emitsResponseHeaders` goes false and every
 * assertion conditioned on it relaxes with it, instead of going stale.
 */
export function deriveFacts() {
  const responseRule = profileToRule(
    {
      id: 1, name: "P", domains: ["a.com"],
      headers: [{ name: "X-R", side: "response", operation: "set", value: "v" }],
    },
    ["a.com"]
  );
  return {
    emitsResponseHeaders: Boolean(responseRule?.action?.responseHeaders?.length),
    appendRefusedOnResponse:
      validateHeaderEntry({
        name: "Accept", side: "response", operation: "append", value: "v",
      }).valid === false,
    appendAllowedOnRequest:
      validateHeaderEntry({
        name: "X-Forwarded-For", side: "request", operation: "append", value: "v",
      }).valid === true,
    // An export carrying a response entry must declare version 2, or a v0.1.x
    // build will read it and silently drop the side.
    exportVersionWithResponse: versionFor([
      { headers: [{ name: "X-R", side: "response", operation: "set", value: "v" }] },
    ]),
    exportVersionRequestOnly: versionFor([
      { headers: [{ name: "X-R", operation: "set", value: "v" }] },
    ]),
  };
}

/** The version the manifest must carry. Pinned; see the note above. */
export const PINNED_MANIFEST_VERSION = "0.2.0";

/**
 * Every user-facing artifact, and what it must be consistent with.
 *
 * `claims: false` means "this file makes no capability claims" and is a
 * REGISTRATION, not an omission — the difference between a considered decision
 * and a forgetting is whether it is written down.
 */
export const ARTIFACTS = [
  {
    path: "README.md",
    claims: true,
    // FINDING-044. Said "No response header modification — a later version"
    // on the response-header release.
    rules: [
      {
        fact: "emitsResponseHeaders",
        why:
          "the README's capability list must name response headers " +
          "(a bare file-wide /response/ scan passes on any passing mention)",
        // STRUCTURAL, NOT FILE-WIDE. The first version asked whether the word
        // "response" appeared anywhere in README.md, and a mutant reverting
        // the intro to "HTTP request headers" survived it — the word was still
        // present further down. Fourth instance of that weakness on
        // 2026-09-20. A prose scan must read the LINE that makes the claim.
        test: (text) => {
          const list = section(text, "## What it does");
          return /response/i.test(list);
        },
      },
      {
        fact: "appendRefusedOnResponse",
        why: "the README must not offer append without scoping it to requests",
        test: (text) =>
          !/append/i.test(text) ||
          /append[^.;\n]*request|request[^.;\n]*append/i.test(text),
      },
    ],
  },
  {
    path: "SCOPE.md",
    claims: true,
    // The 2026-09-19 instance: SCOPE promised response-side `append` that
    // validateHeaderEntry() refuses. Fixed in 07d9763 by moving it to v0.2.1.
    rules: [
      {
        fact: "appendRefusedOnResponse",
        why: "SCOPE's v0.2.0 bullet must not promise response append",
        // STRUCTURAL, for the same reason. The first version asked whether
        // v0.2.1 and append appeared on one line anywhere — which the sentence
        // "Append moved from v0.2.0 to v0.2.1 on 2026-09-13" satisfies, so a
        // mutant moving the bullet back to v0.2.0 survived. Read the bullet
        // that makes the promise.
        test: (text) => {
          const bullets = text
            .split("\n")
            .filter((line) => /^\s*-\s+\*\*v0\.2\.0\b/.test(line));
          return bullets.length > 0 && !bullets.some((b) => /append/i.test(b));
        },
      },
    ],
  },
  {
    path: "extension/manifest.json",
    claims: true,
    // FINDING-039.
    rules: [
      {
        fact: "emitsResponseHeaders",
        why: "the shipped name and description must not say request-only",
        test: (text) => {
          const m = JSON.parse(text);
          const copy = `${m.name} ${m.description}`;
          return !/request/i.test(copy) || /response/i.test(copy);
        },
      },
      {
        fact: null,
        why: `manifest.version must read ${PINNED_MANIFEST_VERSION}`,
        test: (text) => JSON.parse(text).version === PINNED_MANIFEST_VERSION,
      },
    ],
  },
  {
    path: "test/SMOKE.md",
    claims: true,
    rules: [
      {
        fact: "emitsResponseHeaders",
        why: "SMOKE.md must carry a Part whose heading names response headers",
        // STRUCTURAL. A file-wide /response header/ scan passed a mutant that
        // renamed the Part heading, because the body still discussed the
        // subject. Requiring a NAMED Part means a part that is deleted,
        // repurposed or renamed away from its subject fails — which is what
        // "the script exercises this capability" actually means. Third rule in
        // this file to be tightened the same way.
        test: (text) =>
          text
            .split("\n")
            .some((line) => /^##\s+Part\b.*response/i.test(line)),
      },
    ],
  },
  {
    path: "PRIVACY.md",
    claims: false,
    why: "states what is not collected; names no header-modification capability",
    rules: [],
  },
  {
    path: "FINDINGS.md",
    claims: false,
    why:
      "an engineering record, not release copy. It describes capabilities at " +
      "the moment each finding was raised, including ones since withdrawn, and " +
      "asserting present-tense consistency against it would force the history " +
      "to be rewritten every release — which is the opposite of what it is for.",
    rules: [],
  },
  {
    path: "LEDGER.md",
    claims: false,
    why:
      "the present-tense status index, not release copy. It names open defects " +
      "and planned work, including capabilities not yet built (FEAT-2, response " +
      "append), so a capability scan would read a planned row as a claim. Its " +
      "own consistency belongs to the ledger gate in its Validator contract, " +
      "which is AR-20's work, not R15's.",
    rules: [],
  },
];

/** Root-level and doc artifacts the registry must account for. */
export const REGISTERED_PATHS = ARTIFACTS.map((a) => a.path);

/**
 * Evaluate the registry. Returns a list of failures, each naming the artifact,
 * the fact and why it matters — a failure that does not say what to fix is a
 * failure someone silences.
 */
export function checkArtifacts(root, facts) {
  const failures = [];
  for (const artifact of ARTIFACTS) {
    let text;
    try {
      text = readFileSync(new URL(artifact.path, root), "utf8");
    } catch {
      failures.push(`${artifact.path}: registered but missing from the tree`);
      continue;
    }
    for (const rule of artifact.rules) {
      // A rule conditioned on a fact relaxes when the fact goes false: if the
      // product stops emitting response headers, prose that omits them is
      // correct rather than stale.
      if (rule.fact && !facts[rule.fact]) continue;
      if (!rule.test(text)) {
        failures.push(`${artifact.path}: ${rule.why}`);
      }
    }
  }
  return failures;
}
