// What a profile IS. One definition, used by every boundary that has an
// opinion about it.
//
// WHY THIS FILE EXISTS. Three external reviews in a row found defects living
// in the gaps between separate, subtly different answers to "is this profile
// valid?". The count reached eight: popup form validation, popup storage read,
// worker stored decode, import parser, export canonicalizer, rule builder,
// collision engine, status renderer. Each was locally correct. The system
// still contradicted itself, because the next malformed field simply crossed
// the next unguarded seam:
//
//   - `side: "respones"` passed the export writer and came back a REQUEST
//     header, because the writer checked field NAMES and not values.
//   - `headers: {}` passed the storage decoder and then threw inside
//     collisions and the rule builder, taking every valid profile down with
//     it — in a worker whose own comment promised that could not happen.
//   - `{id: 0, name: ""}` serialized successfully and was then rejected by
//     this same build's importer.
//
// So this module is NOT a ninth definition. It REPLACES the strict per-profile
// validation that was inline in canonical.js and the shallow shape check that
// was inline in stored.js, and the popup's raw storage read now routes through
// stored.js to reach it. Three definitions became one.
//
// TWO CONSUMPTION MODES, ONE RULE SET. That distinction is the whole design:
//
//   STRICT (import): the first invalid profile rejects the file. An import is
//   an all-or-nothing artifact and partial application reported as complete is
//   a recorded defect of this project (FINDING 6).
//
//   TOLERANT (storage): each profile is judged INDEPENDENTLY. Invalid ones are
//   dropped with a structured reason and the valid ones still apply. Storage
//   is untrusted input that arrives one field at a time over months, and a
//   single bad record must never be able to disable a working configuration.
//
// They must not drift apart, which is why they share this function rather than
// each implementing "roughly the same checks".

import {
  isValidRuleId,
  isValidDomain,
  validateHeaderEntry,
  MAX_RULE_ID,
} from "./rules.js";

// Keys a document may carry, per level. Anything else is refused rather than
// dropped — a rebuild that names its fields will always drop the field nobody
// remembered to add, which is exactly how `side` was lost.
export const PROFILE_KEYS = new Set(["id", "name", "domains", "headers"]);
export const ENTRY_KEYS_V1 = new Set(["name", "operation", "value"]);
export const ENTRY_KEYS_V2 = new Set(["name", "operation", "value", "side"]);

export function entryKeysFor(version) {
  return version >= 2 ? ENTRY_KEYS_V2 : ENTRY_KEYS_V1;
}

/**
 * Is this a usable profile?
 *
 * Returns `{valid: true}` or `{valid: false, reason}`. RETURNS RATHER THAN
 * THROWS so the tolerant caller can keep going; the strict caller turns the
 * reason into its own error and stops. A validator that could only throw would
 * force the tolerant path to use try/catch as control flow and would make
 * "which profile failed" a parsing problem.
 *
 * Per-profile ONLY. Duplicate ids and collisions are properties of a SET and
 * are checked where sets are handled — the importer and buildRules(). Putting
 * them here would mean two places deciding the same thing again.
 *
 * `version` selects the header key set. Storage has no envelope version and
 * holds whatever the current popup writes, so it passes the current version.
 */
export function validateProfile(profile, { version = 2 } = {}) {
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)) {
    return { valid: false, reason: "must be an object" };
  }

  // The id is used verbatim as the DNR dynamic rule id, and one bad id fails
  // the whole atomic updateDynamicRules() call — every other profile's rules
  // go down with it.
  if (!isValidRuleId(profile.id)) {
    return {
      valid: false,
      reason: `"id" must be an integer between 1 and ${MAX_RULE_ID}`,
    };
  }
  if (typeof profile.name !== "string" || profile.name.trim() === "") {
    return { valid: false, reason: '"name" must be a non-empty string' };
  }
  if (!Array.isArray(profile.domains) || profile.domains.length === 0) {
    return { valid: false, reason: '"domains" must be a non-empty array' };
  }
  for (const domain of profile.domains) {
    // Lowercased before checking because that is what reaches requestDomains.
    // The popup's form validator checks the raw string, so storage can hold
    // mixed case that is valid once normalized.
    if (typeof domain !== "string" || !isValidDomain(domain.toLowerCase())) {
      return { valid: false, reason: `"${domain}" is not a valid domain` };
    }
  }
  // THE CHECK THAT WAS MISSING FROM THE STORAGE PATH. `headers: {}` is an
  // object, so a shape check that only asked "is this an object?" let it
  // through, and every later consumer iterates or filters it.
  if (!Array.isArray(profile.headers) || profile.headers.length === 0) {
    return { valid: false, reason: '"headers" must be a non-empty array' };
  }
  for (const key of Object.keys(profile)) {
    if (!PROFILE_KEYS.has(key)) {
      return { valid: false, reason: `unknown field "${key}"` };
    }
  }

  const allowed = entryKeysFor(version);
  for (let i = 0; i < profile.headers.length; i += 1) {
    const entry = profile.headers[i];
    const at = `header ${i + 1}`;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      for (const key of Object.keys(entry)) {
        if (!allowed.has(key)) {
          // A `side` key under version 1 is the dangerous case rather than a
          // typo: the record carries v2 meaning while claiming v1, so every
          // shipped 0.1.x build would accept it and apply a response header on
          // the request side.
          return {
            valid: false,
            reason:
              key === "side" && version < 2
                ? `${at}: "side" requires version 2 (file claims version ${version})`
                : `${at}: unknown field "${key}"`,
          };
        }
      }
    }
    const result = validateHeaderEntry(entry);
    if (!result.valid) {
      return { valid: false, reason: `${at}: ${result.reason}` };
    }
  }

  return { valid: true };
}
