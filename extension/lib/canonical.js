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

import {
  validateHeaderEntry,
  isValidDomain,
  isValidRuleId,
  normalizeDomains,
  MAX_RULE_ID,
  MAX_UNSAFE_DYNAMIC_RULES,
} from "./rules.js";

export const FILE_FORMAT = "headerwright-profiles";
export const FILE_VERSION = 1;

/**
 * Normalize a profile array into canonical form. Lossless: never changes
 * what the profiles mean, only how they are ordered and cased.
 */
export function canonicalizeProfiles(profiles) {
  return [...profiles]
    .sort((a, b) => a.id - b.id)
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      domains: normalizeDomains(profile.domains),
      headers: (profile.headers || []).map((entry) => {
        const out = { name: entry.name, operation: entry.operation };
        if (entry.operation !== "remove") out.value = entry.value;
        return out;
      }),
    }));
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
    version: FILE_VERSION,
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
  if (doc.version !== FILE_VERSION) {
    throw new Error(`unsupported "version" (this build reads version ${FILE_VERSION})`);
  }
  if (!Array.isArray(doc.profiles)) {
    throw new Error('"profiles" must be an array');
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
  if (doc.profiles.length > MAX_UNSAFE_DYNAMIC_RULES) {
    throw new Error(
      `file has ${doc.profiles.length} profiles, more than the ` +
        `${MAX_UNSAFE_DYNAMIC_RULES} Chrome allows this extension to register ` +
        `(each profile becomes one header-modifying rule, and Chrome caps ` +
        `those at ${MAX_UNSAFE_DYNAMIC_RULES})`
    );
  }

  const seenIds = new Set();
  doc.profiles.forEach((profile, index) => {
    const where = `profile ${index + 1}`;
    if (profile === null || typeof profile !== "object" || Array.isArray(profile)) {
      throw new Error(`${where}: must be an object`);
    }
    // The id is used verbatim as the DNR dynamic rule id, and one bad id
    // fails the whole atomic updateDynamicRules() call — every other
    // profile's rules go down with it. Import accepts hand-edited JSON, so
    // this is the boundary where a crafted or fat-fingered id is caught.
    if (!isValidRuleId(profile.id)) {
      throw new Error(
        `${where}: "id" must be an integer between 1 and ${MAX_RULE_ID}`
      );
    }
    if (seenIds.has(profile.id)) {
      throw new Error(`${where}: duplicate id ${profile.id}`);
    }
    seenIds.add(profile.id);
    if (typeof profile.name !== "string" || profile.name.trim() === "") {
      throw new Error(`${where}: "name" must be a non-empty string`);
    }
    if (!Array.isArray(profile.domains) || profile.domains.length === 0) {
      throw new Error(`${where}: "domains" must be a non-empty array`);
    }
    for (const domain of profile.domains) {
      if (typeof domain !== "string" || !isValidDomain(domain.toLowerCase())) {
        throw new Error(`${where}: "${domain}" is not a valid domain`);
      }
    }
    if (!Array.isArray(profile.headers) || profile.headers.length === 0) {
      throw new Error(`${where}: "headers" must be a non-empty array`);
    }
    profile.headers.forEach((entry, headerIndex) => {
      const result = validateHeaderEntry(entry);
      if (!result.valid) {
        throw new Error(`${where}, header ${headerIndex + 1}: ${result.reason}`);
      }
    });
  });

  return canonicalizeProfiles(doc.profiles);
}
