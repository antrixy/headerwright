// Cross-profile header collisions — FINDING-021.
//
// Two profiles whose domains overlap and which both write the same header
// name have no defined winner. Every generated rule carries priority: 1, and
// Chrome states that ordering between rules with the same action and priority
// is not standardised. OBS-C10 (2026-08-29) observed the consequence on the
// wire: two profiles on shared1.test setting `xheader` to "A" and "B" produced
// exactly one value, with no indication which profile supplied it and no way
// to tell from one observation what picked it.
//
// THE DECISION IS REFUSAL, NOT PRECEDENCE. The alternative — assign DNR
// priorities deterministically and document a winner — was rejected on the
// export format. The frozen v1 file stores profiles sorted by id and carries
// no ordering field, so a list-order precedence is not expressible in it:
// two configurations that would behave differently serialize to identical
// bytes, and an export/import round trip silently reassigns the winner. The
// only round-trippable key is `id`, which nextRuleId() allocates lowest-free
// WITH REUSE, so deleting an unrelated profile could change who wins with
// nothing on screen saying so. That is a new silent surprise in a release
// whose whole purpose is removing one.
//
// Refusal also makes the mechanism moot. OBS-C10 could not establish WHY "A"
// won — profile-slot order, creation order, rule-id tie-break and storage
// order all predicted the same answer in that configuration, so it has no
// discriminating power by construction. A precedence fix would have to be
// built on top of a Chrome behaviour nobody has characterised. Refusal never
// lets the ambiguous configuration reach Chrome, so the question does not
// need answering.
//
// FAIL-CLOSED, matching FINDING-018's direction. A colliding pair applies
// NEITHER header rather than an arbitrary one of two values. Fewer headers
// than promised is the failure this project accepts; a value the user did not
// choose is not.

import { isIpLiteral } from "./grants.js";

/**
 * Do two configured domains cover any host in common?
 *
 * DNR's requestDomains matches a domain AND its subdomains, so "example.com"
 * and "api.example.com" overlap even though the strings differ. The test is
 * therefore label-suffix containment, not string equality.
 *
 * SUFFIX CONFUSABLES MUST NOT MATCH. "example.com" and "notexample.com" share
 * a string suffix and cover disjoint host sets. The leading "." in the
 * endsWith test is what separates them, and it is the single most important
 * character in this file. SMOKE Part 13 step 3 is the wire control for it.
 *
 * NO IP BRANCH HERE, DELIBERATELY, and this is not an oversight — it is the
 * FINDING-020 lesson applied before the fact. originsForDomain() special-cases
 * IP literals because "*.192.168.1.5" is a match PATTERN that matches nothing
 * real. That is a question about permission patterns. This function asks a
 * different question — which hosts does requestDomains cover — and reusing one
 * answer for both is exactly how FINDING-020 happened. Under uniform
 * label-suffix logic a full IPv4 literal can only overlap another domain by
 * exact equality or by an oddity like a configured domain of "3.4", which
 * isValidDomain() accepts and which nothing establishes the behaviour of.
 * Uniform logic refuses that configuration rather than proving it safe, which
 * is the fail-closed side.
 *
 * Both arguments are expected to be normalized (lowercased) already —
 * normalizeDomains() runs on every read path, per FINDING-007.
 */
export function domainsOverlap(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Do two domain LISTS cover any host in common?
 */
export function domainListsOverlap(domainsA, domainsB) {
  for (const a of domainsA || []) {
    for (const b of domainsB || []) {
      if (domainsOverlap(a, b)) return true;
    }
  }
  return false;
}

/**
 * The set of header names one profile writes, lowercased.
 *
 * ONLY VALID ENTRIES COUNT. An entry that fails validateHeaderEntry() is
 * filtered out by profileToRule() and never reaches DNR, so it cannot collide
 * with anything. Counting it would refuse a configuration on the strength of a
 * header that was never going to apply.
 *
 * Lowercased because HTTP header names are case-insensitive, so a profile
 * setting "X-Api-Key" and one setting "x-api-key" are writing the same header.
 * NOTE THE ONE PLACE THIS DOES NOT GENERALISE: Chrome's append allowlist is
 * case-SENSITIVE per crbug 449152902, and validateHeaderEntry() lowercases
 * only for that lookup. Do not let one of these decisions leak into the other.
 *
 * The validator is injected rather than imported so this module stays
 * independent of rules.js and the suite can drive the predicate directly.
 */
export function headerNamesFor(profile, isValidEntry) {
  const names = new Set();
  for (const entry of profile.headers || []) {
    if (isValidEntry && !isValidEntry(entry)) continue;
    if (entry && typeof entry.name === "string" && entry.name !== "") {
      names.add(entry.name.toLowerCase());
    }
  }
  return names;
}

/**
 * Find every cross-profile header collision in a set of entries.
 *
 * `entries` is [{ id, name, domains, headers }]. THE CALLER CHOOSES WHICH
 * DOMAIN SET TO PASS, and that is load-bearing — there are two different
 * questions here and collapsing them is FINDING-020's exact shape:
 *
 *   "is this configuration ambiguous?"        -> CONFIGURED domains -> the popup
 *   "would two rules actually both register?" -> GRANTED domains    -> buildRules
 *
 * One predicate, two inputs, two call sites. Detecting only against granted
 * domains would make the popup warning flicker as grants change; enforcing
 * against configured domains would refuse rules that were never going to
 * collide because one side is ungranted.
 *
 * INTRA-PROFILE REPEATS ARE NOT COLLISIONS. One profile may name the same
 * header twice — set-then-append is a supported, order-sensitive pattern, and
 * canonical.js freezes header order precisely to preserve it. Within a single
 * profile the entries land in one rule's ordered modifyHeaders array, so DNR
 * applies them deterministically. Only pairs of DISTINCT profiles are compared.
 *
 * STRICT BY DECISION (2026-09-01). Any shared header name on overlapping
 * domains collides, regardless of whether the outcome actually differs by
 * order. So two profiles both REMOVING the same header collide, and so do two
 * both SETTING it to the identical value, even though neither is ambiguous in
 * result. The outcome-based alternative was considered and set aside: "two
 * profiles disagree about this header" is a rule that fits in a 360px popup
 * and stays honest, while "...in a way that changes the result" needs a table
 * the user cannot see. The known cost is a false positive on identical-value
 * sets, which is a plausible configuration when someone splits profiles by
 * domain. Revisit if it is reported.
 *
 * Returns pairwise records, sorted deterministically so the popup, the
 * refusal message and the suite all agree on ordering:
 *   [{ header, profileIds: [lowerId, higherId] }]
 */
export function findCollisions(entries, isValidEntry) {
  // Bucket by header name first. The pairwise comparison is O(n^2) WITHIN a
  // bucket, and in any ordinary configuration the buckets are tiny.
  //
  // MEASURED, NOT REASONED ABOUT — the FINDING-016 lesson, where a debounce
  // window chosen by reasoning turned out wrong at scale. Node 22, this
  // machine, 2026-09-01:
  //     5000 profiles, distinct header names (one per bucket)      ~3 ms
  //     5000 profiles, ONE shared header name, distinct domains  ~319 ms
  // The second is the worst reachable case: it needs a deliberate import at
  // exactly the cap. 319 ms on a sync at the ceiling is the same order as the
  // sync cost FINDING-016 already records at that profile count, so it is
  // accepted rather than optimised. If it ever needs a ceiling, MEASURE in
  // Chrome first — these numbers are Node's.
  const buckets = new Map();
  for (const entry of entries || []) {
    for (const header of headerNamesFor(entry, isValidEntry)) {
      if (!buckets.has(header)) buckets.set(header, []);
      buckets.get(header).push(entry);
    }
  }

  const collisions = [];
  for (const [header, members] of buckets) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        if (a.id === b.id) continue;
        if (!domainListsOverlap(a.domains, b.domains)) continue;
        const ids = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        collisions.push({ header, profileIds: ids });
      }
    }
  }

  collisions.sort(
    (x, y) =>
      x.header.localeCompare(y.header) ||
      x.profileIds[0] - y.profileIds[0] ||
      x.profileIds[1] - y.profileIds[1]
  );
  return collisions;
}

/**
 * Every profile id involved in at least one collision.
 *
 * This is what buildRules() skips and what the popup marks. BOTH sides are
 * included, which is the whole point: skipping one would be picking a winner
 * by another name.
 */
export function collidingProfileIds(collisions) {
  const ids = new Set();
  for (const collision of collisions || []) {
    ids.add(collision.profileIds[0]);
    ids.add(collision.profileIds[1]);
  }
  return ids;
}

/**
 * The collisions one profile is involved in, as [{ header, otherId }].
 */
export function collisionsForProfile(collisions, profileId) {
  const out = [];
  for (const collision of collisions || []) {
    const [a, b] = collision.profileIds;
    if (a === profileId) out.push({ header: collision.header, otherId: b });
    else if (b === profileId) out.push({ header: collision.header, otherId: a });
  }
  return out;
}

/**
 * The user-facing sentence for a profile's collisions.
 *
 * ANCHORED ON THE DECIDED PART, not on incidental prose — the FINDING-006
 * lesson. What the suite asserts is that the message names the header and
 * names the other profile, because those two facts are what make the state
 * actionable. The surrounding wording is free to change.
 *
 * `nameFor` maps a profile id to its display name; unresolvable ids fall back
 * to the id so the sentence never renders "undefined".
 */
export function describeCollisions(collisions, profileId, nameFor) {
  const mine = collisionsForProfile(collisions, profileId);
  if (mine.length === 0) return "";

  const headers = [...new Set(mine.map((c) => c.header))].sort();
  const others = [...new Set(mine.map((c) => c.otherId))]
    .map((id) => {
      const name = nameFor ? nameFor(id) : null;
      return name ? `"${name}"` : `profile ${id}`;
    })
    .sort();

  const headerList = headers.map((h) => `"${h}"`).join(", ");
  return (
    `Not applying: ${headers.length === 1 ? "header" : "headers"} ` +
    `${headerList} also written by ${others.join(", ")} on an overlapping ` +
    `domain. Two profiles cannot write the same header on the same request, ` +
    `so neither applies. Change the header or the domains in one of them.`
  );
}
