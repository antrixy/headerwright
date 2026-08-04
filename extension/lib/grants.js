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
 * The origin match pattern for a bare hostname. Centralized because the
 * request path and the revoke path MUST produce byte-identical patterns —
 * chrome.permissions.remove() silently does nothing useful if handed a
 * pattern that differs from the granted one. Five inline copies of this
 * template was one typo away from being finding 1a's cause.
 *
 * Ports are deliberately absent: match patterns ignore them, so
 * "*://localhost/*" already covers localhost:3000.
 */
export function originFor(domain) {
  return `*://${domain}/*`;
}

export function originsFor(domains) {
  return domains.map(originFor);
}

/**
 * Reconcile host grants across a profile-set change.
 *
 * @param {object} args
 * @param {Array}  args.previousProfiles  profile set before the change
 * @param {Array}  args.nextProfiles      profile set after the change
 * @param {Array<string>} args.grantedDomains  domains Chrome currently grants
 * @returns {{toRequest: string[], toRevoke: string[]}} sorted, deduplicated
 *
 * Two deliberate asymmetries, both load-bearing:
 *
 * 1. toRevoke is diffed against PROFILE membership (referenced before but
 *    not after), then intersected with what is actually granted. Diffing
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
 */
export function diffDomainGrants({
  previousProfiles,
  nextProfiles,
  grantedDomains,
}) {
  const before = new Set(referencedDomains(previousProfiles));
  const after = new Set(referencedDomains(nextProfiles));
  const granted = new Set(grantedDomains || []);

  const toRevoke = [...before].filter((d) => !after.has(d) && granted.has(d));
  const toRequest = [...after].filter((d) => !granted.has(d));

  return { toRequest: toRequest.sort(), toRevoke: toRevoke.sort() };
}
