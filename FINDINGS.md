# Findings

Defects found in HeaderWright, what caused them, and what changed. One entry
per finding, in the order they were found.

This file exists because the reasoning was accumulating in the source. The
comments were individually good and collectively a problem: `grants.js`
reached 129 comment lines against 46 lines of code, and every future edit had
to navigate a miniature postmortem to reach the thing it was editing. The
history is worth keeping. It is not worth keeping inline forever.

The intended end state is that source comments carry the INVARIANT and this
file carries the STORY:

```js
// Permission coverage must equal DNR requestDomains coverage. See FINDING-018.
```

That extraction has not happened yet. As of v0.1.4 this file is written and
the comments are still in place; moving them is a separate mechanical pass,
scheduled before v0.2 rather than during it, because response-header work
will generate its own round of commentary and doing both at once makes each
harder to review.

## How to read an entry

**Symptom** is what a user would have seen. **Cause** is the mechanism, not
the blame. **Fix** is what changed. **Evidence** is what proves it, which for
this project means either a selftest name or a SMOKE part — a finding with
neither is not closed, it is only believed.

Numbering is historical and has gaps. Findings 11–17 were worked during the
v0.1.2 and v0.1.3 cycles and are recorded in the private handoff notes rather
than in the source; they are listed as stubs below so the numbering stays
honest rather than looking contiguous when it is not.

---

## FINDING-001a — Revocation behaviour was assumed, not observed

**Version:** v0.1.1
**Severity:** unknown at the time, which was the point

**Symptom.** The Details panel in `chrome://extensions` continued to list a
host after the profile referencing it was deleted.

**Cause.** Undetermined, and deliberately left that way. Three explanations
fit the same observation: `remove()` was never called correctly, Chrome
defers revocation until reload, or Chrome retains the grant conservatively.
The Details panel cannot distinguish them.

**Fix.** None directly. This became SMOKE Part 0, which runs FIRST and whose
result determines how every revocation expectation in Part 2 is read. A
finding that resolves into a test rather than a patch is still a finding.

**Evidence.** SMOKE Part 0, including the corollary check: re-create a profile
on the same domain, and no prompt means the grant never dropped regardless of
what the panel displays.

---

## FINDING-001b — The edit path had no grant reconciliation at all

**Version:** v0.1.1
**Severity:** high — silent over-permission

**Symptom.** Removing a domain from a profile by editing it left that
domain's host permission granted, permanently.

**Cause.** Create and delete had each grown their own inline version of the
grant reasoning. Edit had grown none. Three copies of a rule and one omission
is what an invariant looks like when it lives at call sites instead of in a
function.

**Fix.** `lib/grants.js` — one pure primitive, three call sites (save,
delete, import). The set arithmetic has no `chrome.*` calls; the caller
supplies the granted set and performs the actual request and remove.

**Fix note.** `diffDomainGrants()` diffs `toRevoke` against PROFILE
membership and then intersects with what is granted. Diffing against the
edited profile alone is the bug itself: a domain another profile still
references must be retained.

**Evidence.** Selftest, the `diffDomainGrants` group. SMOKE Part 2.

---

## FINDING-002 — A denied permission dialog had no in-app recovery

**Version:** v0.1.1
**Severity:** medium — dead-end state

**Symptom.** Deny the permission dialog once and the profile sat permanently
non-functional. The only way to re-fire `request()` was Edit then Save, which
works and which nothing in the interface suggested.

**Cause.** The grant was requested at save time and never again. The gray dot
reported the state correctly but was not actionable.

**Fix.** Ungranted domain chips are buttons. Clicking one re-fires
`request()` for that domain. Dashed border marks the affordance without
shouting.

**Evidence.** SMOKE Part 2. Note that Part 2's revocation rows are only
meaningful once Part 0 has established what revocation does in that browser.

---

## FINDING-003 — Storage was trusted as an input

**Version:** v0.1.1
**Severity:** medium — defence in depth

**Symptom.** None observed. Found by asking what happens if something writes
to `chrome.storage.local` without going through the form or the importer.

**Cause.** The validator ran on import and on form submit. Nothing validated
what `sw.js` read back out.

**Fix.** Validation on the read path too, with a `console.warn` when it
fires. The warning is the useful half: if it ever appears, something wrote to
storage that did not come through a checked path, and that is worth knowing
rather than silently surviving.

**Evidence.** Selftest validator group; acceptance criterion A2. This defence
later defeated the first attempt to inject a failure for FINDING-004, which
is the strongest evidence a defence-in-depth check can produce.

---

## FINDING-004 — The badge asserted success after a failed sync

**Version:** v0.1.1
**Severity:** high — false assertion

**Symptom.** Master toggle ON, badge showing ON, status line reading
"applying", and no DNR rules registered.

**Cause.** `syncRules()` awaited `updateDynamicRules()` with no catch. On
failure the promise rejected unhandled, the popup never learned, and every
surface kept reporting the last state it knew.

**Fix.** `lib/status.js` — a pure decision table for what the badge and
status line should say, including a failure state. Removing a false assertion
is a fix; this is the entry that established that framing for the project.

**Evidence.** Selftest status group. SMOKE Part 3, including failure
injection.

---

## FINDING-005 — Overlapping syncs collided on rule ids

**Version:** v0.1.1
**Severity:** medium — observed, not theorised

**Symptom.** An ordinary profile save produced "Rule with id 3 does not have
a unique ID" in the popup console on v0.1.0.

**Cause.** `syncRules()` is reachable from `onInstalled`, `onStartup`,
`storage.onChanged`, `permissions.onAdded` and `permissions.onRemoved`.
Nothing stopped two runs overlapping. Each run snapshots the existing dynamic
rules and then clears and replaces them, so two overlapping runs compute
`removeRuleIds` from the same snapshot and collide.

**Fix.** `lib/queue.js` — a serial queue primitive. Later reused for popup
renders, which had the same shape.

**Evidence.** Selftest queue group. SMOKE Part 3b.

---

## FINDING-006 — Over-cap imports were truncated instead of refused

**Version:** v0.1.2
**Severity:** high — silent data loss

**Symptom.** Import 5001 profiles: 5001 stored, 5000 registered, sync
reporting `{ok: true}`, green dots throughout, and no surface anywhere saying
one profile was inert.

**Cause.** `sw.js` truncated to the cap with a `console.warn` and nothing
else. The console is not a surface.

**Fix.** Refuse the import whole. For a configuration tool, refusing is
better than silently applying most of what was asked — the same instinct as
"lossless or no-op, never lossy".

**Fix note.** Counted in profiles rather than rules, deliberately
conservative.

**Evidence.** Selftest cap group. SMOKE Part 6.

---

## FINDING-007 — Domains were canonicalised but never deduplicated

**Version:** v0.1.2
**Severity:** medium — two counts of the same thing in one view

**Symptom.** Entering `example.com, EXAMPLE.com, example.com` stored all
three, rendering as three identical chips beside a status line reading
"1/1 domain granted".

**Cause.** `canonical.js` claimed set semantics for domains — "domains sorted
and lowercased within each profile (set semantics to DNR's requestDomains)"
— and canonicalisation lowercased and sorted but never deduped. The frozen
contract and the implementation disagreed.

**Fix.** `normalizeDomains()` lowercases, deduplicates and sorts, applied on
the read path as well as at save. Applying it on read is what makes the chip
count and the status-line count agree BY CONSTRUCTION rather than at two call
sites that happen to match.

**Evidence.** Selftest normalisation group. SMOKE Part 7. Decided
2026-08-05.

---

## FINDING-008 — The popup never re-read storage after opening

**Version:** v0.1.2
**Severity:** low — stale rather than false

**Symptom.** A sync failure arriving after the popup rendered left the status
line reading "applying" beside green dots while the toolbar badge was already
red.

**Cause.** The popup rendered once on open and never re-read. Reproduced in
both directions on a genuine failure, 2026-08-05: failure after render gives
stale, render after failure gives correct.

**Fix.** A `chrome.storage.onChanged` listener that re-renders, scoped to two
keys (`hw:sync`, `hw:profiles`) and debounced through the FINDING-005 queue
primitive, because renders were expensive.

**Consequence worth knowing.** Anything that must survive a re-render has to
live OUTSIDE `#profile-list`, which `renderListNow()` clears on every pass.
This constrained the delete confirmation (FINDING-010) and the migration
notice (FINDING-018).

**Evidence.** SMOKE Part 8.

---

## FINDING-009 — Generated rule ids could escape the valid range

**Version:** v0.1.2
**Severity:** high — silent latch

**Symptom.** One imported profile at exactly `MAX_RULE_ID` made the next save
generate `2147483648`, which was written to storage and rejected at
registration.

**Cause.** The generator computed `max(id)+1` and never checked the result
against `isValidRuleId`. Import legitimately accepts an id of exactly
`MAX_RULE_ID` — that is the boundary SMOKE 4a established — so the ceiling
was reachable by design.

**Fix.** Lowest-free id allocation. A ceiling profile no longer poisons the
id space, because the gaps below it are all still free. Plus a validity check
on the generated id before it is written.

**Fix note.** The check is unreachable in practice at any reachable profile
count. It is there because an UNCHECKED write to storage is what made this a
silent latch, and the check makes recurrence structurally impossible rather
than merely unlikely.

**Evidence.** Selftest id group. SMOKE Part 5. Confirmed at the wire
2026-08-05.

---

## FINDING-010 — Delete had no confirmation

**Version:** v0.1.2
**Severity:** low — but a RECORDED POLICY DEVIATION

**Symptom.** Delete was the only destructive action without a confirmation,
while import — which is recoverable, since the file still exists on disk —
had one.

**Cause.** Not an oversight in reasoning so much as an inconsistency nobody
had lined up side by side.

**Fix.** A confirmation on delete.

**Policy note, and the reason this entry matters beyond its severity.**
Adding a confirmation is NEW BEHAVIOUR, so under "patch = fixes only" it is a
feature and should have queued behind Rule Tester. It shipped in a patch
anyway. That is a deviation, recorded as one, and not a reclassification of
the rule. FINDING-018's migration notice was later argued NOT to be a second
such deviation, on the grounds that it adds no capability — see that entry.

**Evidence.** SMOKE Part 9.

---

## FINDING-011 through FINDING-017 — not yet transcribed

Worked during the v0.1.2 and v0.1.3 cycles. Recorded in the private handoff
notes; not carried into the source, and therefore not reconstructable from
this repository alone.

Listed rather than omitted so the numbering does not appear contiguous when
it is not. To be filled in from the handoff notes when convenient — this is a
transcription task, not an investigation.

---

## FINDING-018 — Host permission did not cover the hosts the rule matched

**Version:** v0.1.4
**Severity:** BLOCKER — a core advertised behaviour did not work

**Symptom.** A profile on `example.com` did not apply headers on
`api.example.com`, while the popup showed a green dot and the README, the
popup hint, and the store listing all said subdomains were included.

**Cause.** Two host sets that had to be identical and were not. DNR's
`requestDomains` matches a domain AND its subdomains. `originFor()` emitted
`*://example.com/*`, which is the exact host only — a match pattern needs a
`*.` host to cover subdomains. With
`declarativeNetRequestWithHostAccess`, the rule matched in DNR and then
no-opped for want of host access.

The failure direction was fail-CLOSED: fewer hosts than promised, never more.
That is why it survived three releases — smoke testing on apex domains passes
either way.

**Fix.** `originsForDomain()` returns a SET: `*://d/*` and `*://*.d/*`. The
wildcard alone covers the apex by specification; the apex pattern is emitted
anyway so the covered set does not rest on one sentence of documentation, and
so an existing install's grant stays inside the wanted set rather than being
orphaned by FINDING-019's sweep.

IPv4 literals get the apex pattern only. `isValidDomain()` accepts dotted
quads, and `*.192.168.1.5` is a syntactically valid pattern that matches
nothing real.

**Why the old test did not catch it.** The selftest asserted
`originFor("localhost") === "*://localhost/*"` — a faithful test of the wrong
thing. It pinned the bug and kept the suite green on it. A string-equality
test cannot catch a set-coverage bug. The replacement implements two oracles
and compares COVERED HOST SETS across a corpus that includes suffix
confusables, so over-application fails it too.

**Upgrade cost.** `permissions.request()` needs a user gesture and a service
worker has none, so the upgrade cannot be silent. Existing installs go gray
until each domain is re-approved. A self-expiring notice explains why — see
below.

**On the notice and the patch policy.** It was argued as remediation rather
than a feature, and therefore NOT a second deviation after FINDING-010: it
adds no capability, and a fix that breaks working configurations without
saying why is an incomplete fix. There is also no other channel — no
telemetry, no update page, no content script, and store release notes are not
read.

The notice is gated on STATE, not on a version constant:
`isLegacyOnlyGrant()` can only be true on an install that granted under
v0.1.3, and goes false permanently on re-grant. It deletes itself by
construction. A version-gated notice outlives its migration and becomes dead
code guarded by a number nobody remembers.

**Evidence.** Selftest F18 group, including the set-coverage invariant.
SMOKE Part 11, which covers apex, subdomain, deep subdomain, suffix-confusable
negative control, the real v0.1.3 upgrade, and the fresh-install false
positive.

---

## FINDING-019 — Historical stale grants were unreachable

**Version:** v0.1.4
**Severity:** medium — weakened the central privacy claim

**Symptom.** A host permission left behind by an older release stayed
granted forever, invisible to every code path.

**Cause.** `diffDomainGrants()` reconciles a CHANGE. It can only revoke a
domain that appeared in `previousProfiles`. A grant with no corresponding
profile in either set is outside its reach by construction.

**Fix.** `reconcileHostGrants()` in `sw.js`, run on install and startup,
diffing `chrome.permissions.getAll()` against the current profile set. This
moves the privacy property from "every new operation preserves the invariant"
to "the installed extension actively establishes it".

Revoke-only, necessarily: `request()` needs a gesture and a service worker
has none.

**Known limitation, stated because the first version of this comment
overclaimed it.** `isManagedOrigin()` is a SHAPE test, not a provenance test.
`chrome.permissions.getAll()` reports what is held, not who asked for it.
There is no way to distinguish a grant this extension requested from one the
user made through `chrome://extensions` → Site access. The all-hosts pattern
does not match the shape, so "On all sites" survives; whether Chrome's
site-access UI produces a matching shape is UNOBSERVED.

Read the guarantee as "shape confined", not "user grants are safe". SMOKE
Part 12 steps 6–7 settle it with one console line: if Chrome grants
scheme-specific patterns, the concern is theoretical and this stays a comment
fix. If it grants `*://x.test/*`, a provenance ledger becomes worth building.

A ledger was considered and deferred, not rejected — it cannot be written
from the popup (the dialog destroys that context, per the v0.1.0 Bug record),
and writing it from `permissions.onAdded` records user-initiated grants too,
which is the thing it exists to exclude.

**Evidence.** Selftest F19 group. The check named "an unreferenced
managed-shape grant is swept (provenance unknown)" PINS THE LIMITATION rather
than endorsing the behaviour; if a ledger lands, that is the check that must
change.

---

## FINDING-020 — A partially-held grant was released by nothing

**Version:** v0.1.4
**Severity:** medium/high — contradicted a stated README claim
**Introduced by:** FINDING-018's own fix, caught before release

**Symptom.** A user upgrading from v0.1.3 who deleted a profile before
re-approving it kept the old host permission until the next browser restart.
The README says deletion releases the permission immediately.

**Cause.** One function answering two different questions. FINDING-018
correctly made the grant check strict — all-of, so a partially-granted domain
cannot carry a DNR rule. But `reconcileGrants()` reused that same strict
result to decide what to REVOKE, and those are not the same question:

```
"granted enough to carry a rule?"    -> all-of     -> toRequest
"holds anything worth cleaning up?"  -> any-of     -> toRevoke
```

A domain mid-migration was simultaneously not granted enough to use and not
granted enough to release. It fell through both branches. v0.1.3 revoked it
correctly; the strict-everywhere version did not.

**Fix.** `diffDomainGrants()` takes `heldDomains` alongside `grantedDomains`,
defaulting to the latter so untaught callers keep the old behaviour.
`grantStateFor()` returns three facts per domain — `granted`, `heldOrigins`,
`legacyOnly` — and `reconcileGrants()` feeds the strict set to the request
side and the permissive set to the revoke side.

The direction matters and swapping them would re-break both at once.
Strict-for-request keeps the migration path open, because a legacy domain
reads as ungranted and Edit → Save re-fires `request()`. Permissive-for-revoke
keeps the cleanup path open.

**Fix note.** `remove()` is passed exactly the held origins rather than what
a full grant would look like. Chrome treats removing an unheld origin as a
no-op, but that is an observation, and the privacy invariant should not rest
on one when the state map already knows the true answer.

**Why the FINDING-018 tests did not catch it.** The legacy install is the
only state in which the two sets differ, and no test constructed one.

**Evidence.** Selftest F20 group — nine checks covering delete, edit, import,
shared-domain retention, and the migration path surviving the change.
Verified by re-collapsing the two sets, which fails four of them. SMOKE Part
12.

---

## Open

**FINDING-021 — overlapping profiles have no defined precedence.** Every
generated rule carries `priority: 1`, so two profiles setting the same header
on the same request have no defined winner; Chrome states that ordering for
rules with the same action and priority is not standardised.

Not yet fixed, and it got WORSE with FINDING-018: profiles on `example.com`
and `api.example.com` did not overlap before subdomain matching and do now.
The fix enlarged the collision surface silently, which is what moves this
from a theoretical edge to a consequence of shipped work.

Two options. Encode an explicit precedence into DNR `priority`, or refuse
configurations where overlapping profiles perform incompatible operations on
the same header. Refusal is the better fit: it avoids inventing an ordering
UI, and it matches the FINDING-006 instinct — if a configuration has
ambiguous meaning, refuse it rather than letting Chrome decide.

Scheduled as its own release. It is design work, and it should not ride along
with a regression fix.
