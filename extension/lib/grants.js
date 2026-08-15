// grants.js
// Pure host-permission set arithmetic: profile sets -> which origins to
// request and which to revoke. No chrome.* calls — the caller supplies the
// currently-granted domain set and performs the actual request/remove.
//
// Why this file exists (finding 1b, v0.1.1): create and delete each grew
// their own ad-hoc version of this reasoning inline, and edit grew none at
// all, so a domain dropped during an edit kept its grant forever. One pure
// primitive, three call sites (save, delete, import), one selftest.
//
// Why "grants" and not "permissions": nothing here touches the
// chrome.permissions API. This is set arithmetic over domain strings.

/**
 * Every domain referenced by any profile in the set, deduplicated and
 * sorted. This is the "what SHOULD be granted" side of the invariant.
 */
export function referencedDomains(profiles) {
  return [
    ...new Set((profiles || []).flatMap((p) => p.domains || [])),
  ].sort();
}

/**
 * True for an IPv4 dotted quad. isValidDomain() accepts these (digits and
 * dots are legal label characters), and they are the one host shape where
 * the subdomain pattern below is wrong: "*.192.168.1.5" is a syntactically
 * valid match pattern that matches nothing real, and an IP literal has no
 * subdomains for DNR to match either. IPv6 cannot reach here — isValidDomain
 * rejects colons.
 */
export function isIpLiteral(domain) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(domain || "");
}

/**
 * The host permission patterns for one configured domain — PLURAL, and that
 * is the whole point of finding 18.
 *
 * THE INVARIANT: the host set covered by these patterns must equal the host
 * set covered by the same domain in DNR's requestDomains. DNR matches the
 * domain AND its subdomains ("example.com" also matches "api.example.com").
 * Through v0.1.3 this function returned "*://example.com/*" alone, which is
 * the exact host only, so every subdomain rule matched in DNR and then
 * no-opped for want of host access — silently, with the popup dot green.
 * See test/selftest.mjs "permission set == DNR host set" for the oracle.
 *
 * Both patterns are emitted, not just the wildcard. "*.example.com" is
 * documented to cover the apex too, so the first entry is redundant by
 * spec — it is kept because (a) it makes the covered set unarguable at the
 * call site rather than resting on one sentence of Chrome documentation,
 * and (b) it is byte-identical to what v0.1.3 granted, so an existing
 * install's grant stays inside the wanted set and is never orphaned by
 * reconcileHostGrants(). Dropping it would turn every upgrade into a stale
 * grant of exactly the kind finding 19 exists to sweep.
 *
 * Ports are deliberately absent: match patterns ignore them, so
 * "*://localhost/*" already covers localhost:3000.
 */
export function originsForDomain(domain) {
  const exact = `*://${domain}/*`;
  return isIpLiteral(domain) ? [exact] : [exact, `*://*.${domain}/*`];
}

/**
 * Flattened, deduplicated, sorted patterns for a domain list. Sorted so the
 * request path and the revoke path produce byte-identical arrays —
 * chrome.permissions.remove() silently does nothing useful if handed a
 * pattern that differs from the granted one.
 */
export function originsFor(domains) {
  return [...new Set((domains || []).flatMap(originsForDomain))].sort();
}

/**
 * The origin patterns v0.1.3 and earlier granted for a domain.
 *
 * Kept as a NAMED HISTORICAL SHAPE rather than inlined at the one call site,
 * because it is not a general-purpose helper and should read as what it is:
 * the old format, retained only long enough to recognize an install that
 * still carries it. If a future release ever changes the pattern set again,
 * this is the seam to extend — not another version constant.
 */
export function legacyOriginsForDomain(domain) {
  return [`*://${domain}/*`];
}

/**
 * Is this domain carrying a pre-0.1.4 grant that no longer suffices?
 *
 * @param {string} domain
 * @param {{legacyGranted: boolean, currentGranted: boolean}} state
 *
 * SELF-EXPIRING BY CONSTRUCTION, and that is the design requirement, not a
 * side effect. A migration notice gated on a version constant outlives the
 * migration and becomes dead code guarded by a number nobody remembers —
 * exactly the accretion SCOPE.md exists to prevent. This is gated on the
 * STATE instead: it can only be true on an install that granted under
 * v0.1.3, and it goes false permanently the moment that domain is
 * re-granted. Nothing has to remember to delete it.
 *
 * The IP guard is belt-and-braces: for an IP literal the legacy shape and
 * the current shape are the same single pattern, so currentGranted false
 * already implies legacyGranted false. Stated explicitly so a future reader
 * does not have to re-derive it.
 */
export function isLegacyOnlyGrant(domain, { legacyGranted, currentGranted }) {
  if (currentGranted) return false;
  if (isIpLiteral(domain)) return false;
  return legacyGranted === true;
}

/**
 * Does this origin pattern have the shape HeaderWright itself generates?
 *
 * A SHAPE TEST, NOT A PROVENANCE TEST, and the distinction is load-bearing
 * enough to state plainly: chrome.permissions.getAll() reports what is held,
 * not who asked for it. There is no field saying whether a grant came from
 * this extension's permissions.request() or from the user working
 * chrome://extensions -> Site access. This function CANNOT tell them apart
 * and does not claim to.
 *
 * What it does establish is narrower: the sweep is confined to patterns of
 * the exact form this extension emits. The all-hosts pattern from
 * optional_host_permissions does not match, so "On all sites" survives. A
 * scheme-specific pattern does not match either, which MAY mean Chrome's own
 * site-access grants are already outside the sweep — that depends on what
 * shape Chrome actually produces, which is an observation nobody has made
 * yet. See SMOKE.md Part 12. Until it is made, read the guarantee as "shape
 * confined" and not as "user grants are safe".
 */
export function isManagedOrigin(pattern) {
  return /^\*:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\/\*$/.test(
    pattern || ""
  );
}

/**
 * Host patterns granted to this extension that no current profile asks for.
 *
 * @param {Array} profiles          the current profile set
 * @param {Array<string>} grantedOrigins  chrome.permissions.getAll().origins
 * @returns {string[]} sorted patterns safe to revoke
 *
 * diffDomainGrants() can only revoke a domain that appeared in
 * previousProfiles, so a grant left behind by an older release — or by an
 * upgrade that changed the pattern shape — is invisible to it forever. This
 * turns the privacy property from "every new operation preserves the
 * invariant" into "the installed extension actively establishes it".
 */
export function staleManagedOrigins(profiles, grantedOrigins) {
  const wanted = new Set(originsFor(referencedDomains(profiles)));
  return (grantedOrigins || [])
    .filter((o) => isManagedOrigin(o) && !wanted.has(o))
    .sort();
}

/**
 * Reconcile host grants across a profile-set change.
 *
 * @param {object} args
 * @param {Array}  args.previousProfiles  profile set before the change
 * @param {Array}  args.nextProfiles      profile set after the change
 * @param {Array<string>} args.grantedDomains  domains holding the COMPLETE
 *   origin set from originsForDomain() — the all-of question
 * @param {Array<string>} [args.heldDomains]  domains holding ANY managed
 *   origin, complete or not — the any-of question. Defaults to
 *   grantedDomains, which is correct whenever the two cannot differ.
 * @returns {{toRequest: string[], toRevoke: string[]}} sorted, deduplicated
 *
 * THE TWO SETS ARE DIFFERENT QUESTIONS, and collapsing them into one was
 * finding 20 — a regression introduced by finding 18's own fix and caught
 * before release, not a pre-existing gap. That fix correctly made the grant
 * check strict so a
 * partially-granted domain could not carry a DNR rule. But this function
 * was still fed that same strict set to decide what to REVOKE, and those
 * are not the same question:
 *
 *   "granted enough to carry a rule?"      -> all-of  -> toRequest
 *   "holds anything worth cleaning up?"    -> any-of  -> toRevoke
 *
 * A domain upgraded from v0.1.3 holds the apex pattern but not the
 * subdomain one, so under a single strict set it was simultaneously not
 * granted enough to use and not granted enough to revoke. It fell through
 * both branches and survived deletion. v0.1.3 revoked it correctly; the
 * strict-everywhere version did not. Verified against the exact README
 * claim it would have broken: "deleting a
 * profile ... releases that domain's permission ... immediately".
 *
 * Three deliberate asymmetries, all load-bearing:
 *
 * 1. toRevoke is diffed against PROFILE membership (referenced before but
 *    not after), then intersected with what is actually HELD. Diffing
 *    against the edited profile alone is the finding-1b bug: a domain
 *    another profile still references must be RETAINED.
 *
 * 2. toRequest is diffed against GRANT state, not profile membership. A
 *    domain can be in the profile set and still ungranted (the user denied
 *    the dialog). Requesting only "newly referenced" domains would satisfy
 *    a naive reading of "an unchanged save causes no permission churn" and
 *    would also silently delete the only recovery path a denied domain
 *    has today — Edit -> Save re-firing request(). Churn-free for the
 *    all-granted case falls out of this anyway: nothing to request.
 *
 * 3. toRequest uses the STRICT set and toRevoke the PERMISSIVE one, and
 *    the direction matters. Strict-for-request keeps the migration path
 *    open: a legacy domain reads as ungranted, so Edit -> Save re-fires
 *    request() and completes the upgrade. Permissive-for-revoke keeps the
 *    cleanup path open: the same domain reads as held, so deleting it
 *    releases what it has. Swapping them would re-break both at once.
 */
export function diffDomainGrants({
  previousProfiles,
  nextProfiles,
  grantedDomains,
  heldDomains,
}) {
  const before = new Set(referencedDomains(previousProfiles));
  const after = new Set(referencedDomains(nextProfiles));
  const granted = new Set(grantedDomains || []);
  // Defaulting to grantedDomains rather than to the empty set is the safe
  // direction: a caller that has not been taught the distinction keeps the
  // pre-finding-20 behaviour instead of silently revoking nothing.
  const held = new Set(heldDomains || grantedDomains || []);

  const toRevoke = [...before].filter((d) => !after.has(d) && held.has(d));
  const toRequest = [...after].filter((d) => !granted.has(d));

  return { toRequest: toRequest.sort(), toRevoke: toRevoke.sort() };
}
