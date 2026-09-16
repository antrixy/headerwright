// canonical.js
// Deterministic, byte-stable serialization of profiles — the export file
// format. Pure functions, no chrome.* calls, Node-importable by selftests.
//
// The contract, FROZEN at v0.1.0 — the file format became a public contract
// the moment anyone committed an exported file to git, so the rules below
// change only under a version bump in the envelope, never silently:
//   - keys sorted alphabetically at every level
//   - 2-space indent, one item per line (git-diffable)
//   - trailing newline
//   - identical profile sets always serialize to identical bytes
// A byte-stability selftest (serialize twice + round-trip through
// parseProfilesFile must be byte-identical) is part of the selftest
// suite. This layout is a public contract the moment anyone commits an
// exported file to git — changing it later breaks every existing file's
// byte layout, which is why it is designed in now, not retrofitted.
//
// Canonicalization rules and why:
//   - profiles sorted by id
//   - domains sorted, lowercased and DEDUPLICATED within each profile (set
//     semantics to DNR's requestDomains — reordering is lossless, and so is
//     dropping a duplicate). Dedup arrived in v0.1.2 as a CONFORMANCE FIX,
//     not a format change: the set semantics above were always stated, the
//     serializer just did not honour them. See normalizeDomains() in
//     rules.js for the full argument. Version stays 1.
//   - header order PRESERVED — operation order on the same header can be
//     semantically meaningful (set-then-append), and canonicalization
//     must never change meaning
//   - the master toggle is deliberately NOT part of the file: it is
//     local runtime state, not shareable configuration

import { validateProfile, PROFILE_KEYS, ENTRY_KEYS_V2 } from "./profile.js";
import {
  validateHeaderEntry,
  isValidDomain,
  isValidRuleId,
  normalizeDomains,
  MAX_RULE_ID,
  MAX_UNSAFE_DYNAMIC_RULES,
} from "./rules.js";
import { findCollisions, describeImportRefusal } from "./collisions.js";

export const FILE_FORMAT = "headerwright-profiles";
// THE HIGHEST VERSION THIS BUILD WRITES OR READS. v0.1.x wrote and read 1.
export const FILE_VERSION = 2;
export const READABLE_VERSIONS = [1, 2];

// Keys the envelope may carry. Same policy as PROFILE_KEYS and ENTRY_KEYS.
const DOC_KEYS = new Set(["format", "version", "profiles"]);

// Keys a document may carry, per level. ANYTHING ELSE IS REFUSED rather than
// dropped, and the reason is the defect that produced version 2: this file
// rebuilt each entry from a fixed field list, so `side` — added to the model
// in the same release — was discarded in silence, turning a response header
// into a request header on export. A rebuild that names its fields will always
// drop the field nobody remembered to add. Refusing unknown keys means the
// next field added elsewhere fails loudly here instead.
// Key sets live in lib/profile.js with the validator that uses them; they are
// imported rather than redeclared so a new field cannot be added to one list
// and forgotten in the other.

/**
 * The LOWEST version that can read this profile set without losing meaning.
 *
 * Not simply FILE_VERSION, deliberately. A request-only set means exactly what
 * it meant in v0.1.x, so stamping it 2 would make every existing user's export
 * unreadable by every shipped build for no gain. Version here answers "what
 * must a reader understand?", not "what wrote this?".
 *
 * The consequence worth knowing: the version line of an export changes when a
 * response entry is added or removed. That is accurate rather than unstable —
 * the file's requirements genuinely changed.
 */
export function versionFor(profiles) {
  const usesSide = profiles.some((profile) =>
    (profile.headers || []).some((entry) => entry && entry.side === "response")
  );
  return usesSide ? 2 : 1;
}

/**
 * Normalize a profile array into canonical form. Lossless: never changes
 * what the profiles mean, only how they are ordered and cased.
 *
 * THROWS ON UNKNOWN FIELDS, and the export path is the one that needed it.
 * v0.2.0 added refusal of unknown fields to parseProfilesFile() and recorded
 * that as the general fix for the class of bug that lost `side`. IT WAS NOT.
 * R1 was a WRITE-path defect: the popup stored a field, this function rebuilt
 * each entry from a fixed list, and the field never reached the file at all.
 * A strict reader cannot refuse a field it is never shown. The mitigation
 * guarded the one direction the bug did not travel.
 *
 * So the rebuild now asserts that the fixed list is complete. Adding a field
 * to the model and forgetting this file fails here, loudly, at the moment of
 * export — which is the moment the old bug was silent.
 */
export function canonicalizeProfiles(profiles) {
  return [...profiles]
    .sort((a, b) => a.id - b.id)
    .map((profile, index) => {
      // THE WRITER VALIDATES THE WHOLE PROFILE, using the same rules the
      // reader does. It used to check field NAMES here and header VALUES
      // further down, and nothing else — so this build could serialize a
      // profile its own importer rejected:
      //
      //     {id: 0, name: "", domains: []}  ->  serializes fine
      //                                     ->  parseProfilesFile: id rejected
      //
      // An export that cannot be re-imported by the build that wrote it is a
      // file the user believes they have and does not. The invariant is now
      // executable: everything serializeProfiles() accepts,
      // parseProfilesFile() accepts.
      //
      // POSITION FIRST, ID WHEN IT IS USABLE. Position matches
      // parseProfilesFile's messages, so a user correlating an export refusal
      // with an import refusal sees the same identifier in both. The id is
      // appended when it is valid because in a file of forty profiles the
      // position alone is a poor way to find the one at fault — but naming an
      // INVALID id reads absurdly for the case that most needs naming ("profile
      // 0: id must be an integer between 1 and ...").
      const label = isValidRuleId(profile?.id)
        ? `profile ${index + 1} (id ${profile.id})`
        : `profile ${index + 1}`;
      // VALIDATED AT THE FULL MODEL CAPABILITY, NOT AT THE FILE'S VERSION, and
      // the difference is not cosmetic. The first version of this passed
      // versionFor([profile]) — but versionFor only reports 2 when it sees a
      // side of exactly "response", so a MISSPELLED side made it report 1, and
      // the validator then blamed the version:
      //
      //   side: "respones"  ->  '"side" requires version 2'   (misleading)
      //   side: "respones"  ->  'unknown side "respones"'     (the actual fault)
      //
      // The two versions answer different questions. The writer validates
      // against what THIS BUILD can model; versionFor computes what a READER
      // must understand, and it runs on data already known to be valid.
      const verdict = validateProfile(profile, { version: FILE_VERSION });
      if (!verdict.valid) {
        throw new Error(
          `${label}: ${verdict.reason} — refusing to export a profile that ` +
            `cannot be re-imported faithfully`
        );
      }
      return {
        id: profile.id,
        name: profile.name,
        domains: normalizeDomains(profile.domains),
        headers: profile.headers.map((entry) => {
          // NO PER-ENTRY CHECKS HERE ANY MORE. validateProfile() above already
          // refuses unknown entry fields and invalid known values, so the
          // inline versions that used to live here were a second layer doing
          // the same job — and two mutants proved it by scoring ZERO when
          // disabled: the code was unreachable as a guard.
          //
          // Duplicated validation is not free belt-and-braces. It is a second
          // definition that can drift from the first, which is the exact
          // defect class this convergence exists to remove. `headers` is known
          // to be a non-empty array by this point, so the `|| []` fallback is
          // gone too — it could only have hidden a validator that stopped
          // working.
          const out = { name: entry.name, operation: entry.operation };
          if (entry.operation !== "remove") out.value = entry.value;
          // REQUEST IS WRITTEN AS ABSENCE, matching what the popup stores and
          // what every 0.1.x file already means. Emitting `side: "request"`
          // would change the bytes of every existing request-only profile for
          // no change in meaning, and would force those files to version 2.
          if (entry.side === "response") out.side = "response";
          return out;
        }),
      };
    });
}

/**
 * JSON serializer with alphabetically sorted object keys at every level.
 * JSON.stringify preserves insertion order, which is not a determinism
 * guarantee — this is.
 */
export function stableStringify(value, indentUnit = 2) {
  const pad = (depth) => " ".repeat(indentUnit * depth);

  function go(v, depth) {
    if (v === null || typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      const items = v.map((item) => pad(depth + 1) + go(item, depth + 1));
      return "[\n" + items.join(",\n") + "\n" + pad(depth) + "]";
    }
    const keys = Object.keys(v).sort();
    if (keys.length === 0) return "{}";
    const items = keys.map(
      (k) => pad(depth + 1) + JSON.stringify(k) + ": " + go(v[k], depth + 1)
    );
    return "{\n" + items.join(",\n") + "\n" + pad(depth) + "}";
  }

  return go(value, 0);
}

/**
 * Serialize profiles to the canonical export file text.
 */
export function serializeProfiles(profiles) {
  const doc = {
    format: FILE_FORMAT,
    version: versionFor(profiles),
    profiles: canonicalizeProfiles(profiles),
  };
  return stableStringify(doc) + "\n";
}

/**
 * Parse and validate an export file. Returns canonicalized profiles, or
 * throws an Error whose message names the first problem found. Every
 * profile in the file must be fully valid — a config file with a broken
 * entry is rejected whole rather than silently half-imported.
 */
export function parseProfilesFile(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error("file is not valid JSON");
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("top level must be an object");
  }
  if (doc.format !== FILE_FORMAT) {
    throw new Error(`"format" must be "${FILE_FORMAT}"`);
  }
  if (!READABLE_VERSIONS.includes(doc.version)) {
    throw new Error(
      `unsupported "version" (this build reads ${READABLE_VERSIONS.join(" and ")})`
    );
  }
  if (!Array.isArray(doc.profiles)) {
    throw new Error('"profiles" must be an array');
  }
  // THE ENVELOPE GETS THE SAME TREATMENT AS PROFILES AND HEADERS. This file
  // already refused unknown fields at those two levels and its own comment
  // claimed anything outside the known keys was refused — but the top level
  // was never checked, so `futureEnvelopeField` was accepted and silently
  // dropped. Same silent-forward-field-loss class the other two checks exist
  // to prevent, one level higher, in the file that names the rule.
  //
  // Version gating does NOT cover this: an unknown key inside a version this
  // build claims to read is precisely the case that slips through.
  for (const key of Object.keys(doc)) {
    if (!DOC_KEYS.has(key)) {
      throw new Error(`unknown top-level field "${key}"`);
    }
  }

  // FINDING 6 — refuse loudly rather than apply partially. Before v0.1.2 an
  // over-cap import was accepted whole, and sw.js then truncated the rule list
  // to the cap with only a console.warn: 5001 profiles in storage, 5000 rules
  // on the wire, hw:sync reporting {ok: true}, green dots on every profile, and
  // no surface anywhere saying one of them was inert. Confirmed with numbers,
  // Test D 2026-08-05. Partial application reported as complete is a distinct
  // honesty gap from finding 4's, and the 0.1.1 failure indicator does not and
  // should not cover it — that sync genuinely succeeds. For a configuration
  // tool, refusing is better than silently applying most of what was asked.
  //
  // COUNTED IN PROFILES, NOT RULES, AND THIS IS DELIBERATELY CONSERVATIVE.
  // The real ceiling is 5000 APPLYING profiles: one rule per profile
  // regardless of how many domains or headers it carries, and a profile with
  // no granted domain or no valid header returns null from profileToRule() and
  // consumes no budget at all. But grant state is a chrome.permissions question
  // and this file is chrome.*-free by construction, so the applying count is
  // genuinely unknowable here. Profile count is the only sound upper bound
  // available at parse time. The cost is refusing a file of 6000 profiles of
  // which only 100 would ever apply; the alternative is accepting it and
  // reintroducing silent truncation later, which is the bug being fixed.
  // MESSAGE SHAPE, revised during the 0.1.2 smoke run after reading it in the
  // popup rather than in a test assertion. The first version stated the limit
  // twice — once in the sentence, once in a parenthetical explaining that one
  // profile becomes one rule — which read as though two different limits were
  // in play, and spent its last clause on a mechanism the reader cannot act
  // on. A rejection owes the reader three things: what was wrong, what the
  // limit is, and what to do about it. The overage is computed so the
  // instruction stays correct at any size.
  if (doc.profiles.length > MAX_UNSAFE_DYNAMIC_RULES) {
    const excess = doc.profiles.length - MAX_UNSAFE_DYNAMIC_RULES;
    throw new Error(
      `this file has ${doc.profiles.length} profiles. The most that can be ` +
        `applied is ${MAX_UNSAFE_DYNAMIC_RULES}. Remove at least ${excess} ` +
        `profile${excess === 1 ? "" : "s"} from the file and try again`
    );
  }

  // ONE VALIDATOR, TWO MODES. The per-profile rules used to be written out
  // inline here and, in a shallower form, again in stored.js. They now live in
  // lib/profile.js and both callers share them: import STOPS on the first
  // invalid profile because a file is all-or-nothing, storage DROPS the
  // invalid profile because a working configuration must survive one bad
  // record. Same rules, different response to failure.
  const seenIds = new Set();
  doc.profiles.forEach((profile, index) => {
    const where = `profile ${index + 1}`;
    const verdict = validateProfile(profile, { version: doc.version });
    if (!verdict.valid) {
      throw new Error(`${where}: ${verdict.reason}`);
    }
    // Duplicate ids are a property of the SET, not of a profile, so they are
    // checked here rather than inside validateProfile(). The worker checks the
    // same property over stored profiles in buildRules().
    if (seenIds.has(profile.id)) {
      throw new Error(`${where}: duplicate id ${profile.id}`);
    }
    seenIds.add(profile.id);
  });

  // FINDING-021, the import half of the write-path refusal. Runs AFTER every
  // per-profile check, deliberately: a file with a malformed header should be
  // rejected for the malformed header, not for a collision computed from it.
  // Reason precedence, the same ordering the cap refusal already follows.
  //
  // Normalized domains are used because that is what reaches requestDomains —
  // an unnormalized "EXAMPLE.com" would miss its own overlap. Note this runs
  // on CONFIGURED domains: an import is a configuration, and grant state is a
  // chrome.permissions question this file has no access to by construction.
  const normalizedForCheck = doc.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    domains: normalizeDomains(profile.domains),
    headers: profile.headers,
  }));
  const collisions = findCollisions(
    normalizedForCheck,
    (entry) => validateHeaderEntry(entry).valid
  );
  if (collisions.length > 0) {
    // FINDING-026. This used to pair a wrapper sentence with the CARD marker,
    // which stated the problem a second time, asserted "Not applying:" about
    // profiles that had not been imported, and supplied a full stop the
    // caller adds again. describeImportRefusal() is written for this surface
    // and, like every other message thrown from this file, is an
    // UNTERMINATED CLAUSE — popup.js punctuates.
    const nameById = new Map(normalizedForCheck.map((p) => [p.id, p.name]));
    throw new Error(describeImportRefusal(collisions, (id) => nameById.get(id)));
  }

  return canonicalizeProfiles(doc.profiles);
}
