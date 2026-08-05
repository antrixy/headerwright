# HeaderWright — manual smoke test

`node test/selftest.mjs` verifies rule CONSTRUCTION and format STABILITY
against the pure `extension/lib/` layer. It makes no claim about whether
rules APPLY to real traffic, and it cannot reach any `chrome.*` call. This
script is the application oracle. Everything the suite cannot see is here.

Run it against the **packed build** before any store submission. Running it
against the unpacked build during development is fine and useful, but an
unpacked pass is not submission evidence: the store copy is a distinct
install with its own extension ID, its own storage, and its own grants.

Record results with the date, Chrome version, OS, and which build. Do not
carry a previous run's evidence forward across a change to the code paths
it exercised.

---

## Preconditions

- A wire-visible echo endpoint. `postman-echo.com/headers` and
  `httpbin.org/headers` both work; either can be down, so have both.
- DevTools open on the Network tab for the request under test.
- `chrome://extensions` → HeaderWright → **Details**, for reading Site access.
- Know which build you are on. Store ID `ooapgilielelobkkcdlnkenkflbnnmhi`;
  unpacked-dev builds get a different ID.

> **NEVER REMOVE THE STORE INSTALL DURING A SMOKE RUN.** Smoke tests use the
> UNPACKED build, which is a separate extension with its own ID, storage, and
> grants. Removing an extension wipes its `chrome.storage.local` and all of its
> host grants. The two cards in `chrome://extensions` look alike, and at 0.1.1
> the store copy was removed by mistake during a reset — which silently
> destroyed the granted state that the store-update re-prompt question needed,
> making that question unanswerable for a second release. Check the ID on the
> card before clicking Remove.

**Read the Site access dropdown before starting** and record it. If it says
*On all sites* rather than *On specific sites*, the extension holds the
broad `*://*/*` grant, and every revocation result below is meaningless —
you cannot subtract a narrower pattern from a broader granted one. Set it to
*On specific sites* and re-establish grants before continuing.

---

## Part 0 — Revocation baseline (run FIRST)

Everything in Part 2 is interpreted against this result. It answers finding
1a: does `chrome.permissions.remove()` actually drop a grant in this
browser, or does Chrome retain it?

1. Create one profile on a domain used by no other profile (`example.com`).
2. Save. Accept the permission dialog. Confirm the domain dot is green and
   Site access lists `*://example.com/*`.
3. Delete the profile.
4. Re-open **Details** fresh (do not read a stale panel) and read Site access.
5. Reload the extension fully, re-open Details, read Site access again.

| Observation | Meaning |
| --- | --- |
| Gone at step 4 | `remove()` revokes promptly. Part 2 revocation expectations apply as written. |
| Present at 4, gone at 5 | Revocation is deferred until reload. Part 2 expectations apply, but only after a reload. |
| Present at both | Chrome retains conservatively. Part 2 revocation rows become DOCUMENTED, not FAILED. Finding 2's toggle option stays off the table. |

Corollary check, cheap and worth doing: re-create a profile on the same
domain. **No prompt** means the grant never dropped, independent of what the
Details panel shows.

If a one-time investigation is in scope for this sitting, log the return
value of `chrome.permissions.remove()` at the call site in
`reconcileGrants()` before step 3. It separates "we never called it
correctly" from "Chrome declined" directly, and nothing else does. Remove
the logging before committing.

---

## Part 1 — Core application (regression baseline)

1. **Positive apply.** Profile with `X-HeaderWright-Test: Hello` on the echo
   domain, granted, master toggle ON. Load the echo endpoint. The header is
   present in the response body and on the wire.
2. **Negative control.** Toggle master OFF. Reload with a fresh request (not
   a cached one). The header is absent. Badge and status line agree.
3. **Per-domain scoping.** Two profiles on two different domains, both
   granted. Only the matching profile's header appears on each domain.
4. **Deny path.** New profile on a fresh domain; deny the dialog. The
   profile is still SAVED, its dot is GRAY, the status line counts it as
   ungranted, and DevTools shows the header is NOT applied. "What you see is
   what's true" holds under deny.
5. **Export → import → export.** Byte-identical. Diff the two files; expect
   empty.
6. **Import rejection.** Hand-edit an export to be invalid. Import surfaces
   the exact reason, and the prior configuration is untouched.

---

## Part 2 — Permission lifecycle (new in v0.1.1)

This is the part the 47-check v0.1.0 suite did not cover and could not: it
verifies the ADVERTISED INVARIANT that granted access tracks configured
profiles. The pure suite proves the set arithmetic in
`diffDomainGrants()`; this proves `reconcileGrants()` is actually wired to
it at all three call sites.

The scenarios mirror the A1 selftest cases deliberately. If a row here
disagrees with the suite, the wiring is wrong, not the arithmetic.

### 2a — Shared-domain retention on edit

Setup:

    Profile A: example.com
    Profile B: example.com, api.example.com

Grant both. Confirm Site access lists both origins.

**Edit A: `example.com` → `localhost`.** Save.

| Domain | Expected | Why |
| --- | --- | --- |
| `example.com` | RETAINED | B still references it |
| `api.example.com` | RETAINED | B references it |
| `localhost` | GRANTED (dialog) | newly requested |

This is the row a naive "revoke whatever the edited profile used to have"
fix breaks. If `example.com` disappears here, B is silently broken.

**Then edit B: `example.com, api.example.com` → `localhost`.** Save.

| Domain | Expected | Why |
| --- | --- | --- |
| `example.com` | REVOKED | now unreferenced |
| `api.example.com` | REVOKED | now unreferenced |
| `localhost` | RETAINED, no dialog | A references it, already granted |

Interpret the two REVOKED rows against Part 0. Under the retain-conservatively
outcome they are documented, not failures.

### 2b — No churn on an unchanged save

Open a fully granted profile, change nothing, Save.

Expected: **no permission dialog**, no visible change to Site access, no dot
flicker. Any dialog here means requests are being diffed against profile
membership instead of grant state.

### 2c — Denied-domain recovery still works

This is the path finding 2's affordance will eventually replace. Until then
it is the only recovery a denied domain has, and it must not be lost.

1. Create a profile on a fresh domain and DENY the dialog. Dot is gray.
2. Open the profile, change nothing, Save.

Expected: **the dialog appears again.** Accept it; the dot turns green.

2b and 2c together are the pair that pins the design: unchanged-and-granted
must be silent, unchanged-and-denied must re-prompt.

### 2d — Ordering survives a real dialog

Edit one profile so it BOTH drops a domain and adds a new one in the same
save (`old.test` → `new.test`, where no other profile references `old.test`).

Expected: the dialog for `new.test` appears, AND `old.test` is revoked.

This is the direct test of `remove()` running before `request()`. If the
dialog never appears, `remove()` destroyed the popup's JS context and the
ordering assumption in `reconcileGrants()` is wrong — record it, because the
code comment currently states that belief as unverified.

### 2f — Grant affordance on a denied domain (finding 2, new in v0.1.1)

1. Create a profile on a fresh domain and DENY the dialog. The chip renders
   with a gray dot and a DASHED border — that border is the affordance.
2. Click the chip. Expected: the permission dialog fires again. Accept it.
3. The dot turns green, the chip reverts to a solid border and stops being
   clickable, and the status line granted count increases.
4. Confirm a GRANTED chip is NOT clickable: no pointer cursor, no dialog.
   Grant-only is deliberate; a revoke control over a shared domain has
   unresolved meaning and is not in this version.
5. Keyboard: the ungranted chip must be reachable by Tab and activate on
   Enter or Space. It is a real button element, so this should be free —
   verify rather than assume.

### 2e — Delete and import

- **Delete** a profile whose domains no other profile uses → those domains
  revoked, others untouched.
- **Import** a file that drops some domains and introduces others → dropped
  ones revoked, new ones prompted, already-granted ones NOT re-prompted.

---

## Part 3 — Badge honesty

Live as of v0.1.1 (finding 4, narrow half). The pure suite covers the decision
table in lib/status.js; this covers the wiring and the failure injection.

1. **Truthful states.** Master toggle ON with a successful sync → badge ON,
   status line third segment reads "applying". Toggle OFF → badge OFF,
   "paused".
2. **Inject a failure.** In the service worker console, register a rule by
   hand whose header value contains a CR — something the validator would now
   refuse but that reaches DNR if written straight to storage. Alternatively
   stub `chrome.declarativeNetRequest.updateDynamicRules` to reject. Then
   trigger a sync by toggling the master switch.

   Expected: badge shows `!` in red, NOT ON. Status line reads "not applying —
   last sync failed" and its tooltip names Chrome's rejection message. The
   service worker console shows a handled error, not an unhandled rejection.
3. **Failure outranks the toggle.** With the failure still injected, switch
   the master toggle OFF. The badge must STILL show `!`, not OFF — the sync
   that just ran was the one clearing the rules, so OFF would assert a
   teardown that may not have happened.
4. **Recovery.** Remove the injected failure and trigger a sync. Badge returns
   to ON or OFF, status line stops reporting failure, tooltip clears.

RE-VERIFICATION DEBT DISCHARGED HERE: the 2026-07-31 negative-control evidence
line included "badge/status consistent". The badge changed in 0.1.1, so that
line is void. Re-run Part 1 steps 1 and 2 on the packed build and REWRITE the
evidence entry in the handoff — do not carry the old wording forward.

---

## Part 3b — Sync serialization (finding 5, new in v0.1.1)

On v0.1.0 an ordinary profile save was observed to produce
"Rule with id 3 does not have a unique ID" in the popup console: two syncs
overlapped, computed removeRuleIds from the same snapshot, and collided. It
did NOT reproduce on demand, and the winning run had already registered the
correct state, so nothing misapplied.

With syncRules serialized, repeat the trigger and confirm the collision is
gone. Popup console open, Preserve log ticked:

1. Save a new profile on a fresh domain and accept the dialog. Watch for any
   unique-ID error. Repeat five times with different domains — the race was
   timing-dependent, so a single clean run proves little.
2. Toggle the master switch rapidly several times. This fires
   storage.onChanged repeatedly and is the cheapest way to force overlap.
3. Expected throughout: no unique-ID error, and the badge never shows the
   failure state for a race that changed nothing.

If a unique-ID error still appears, the queue is not covering an entry point
— check that every listener registers the QUEUED syncRules and not runSync.

---

## Part 4 — Confirm the inferred validator bounds (new in v0.1.1)

Two constraints in lib/rules.js are NOT documented by Chrome and were inferred.
This part is what converts them from guesses into observations. Both need the
service worker console open (chrome://extensions → Details → service worker).

### 4a — Rule-ID upper bound

MAX_RULE_ID is 2147483647, inferred from the extensions IDL integer type. The
Chrome reference states only "should be >= 1" and gives no maximum.

In the service worker console, call updateDynamicRules() directly with a
minimal modifyHeaders rule at each id and record which are accepted:

    2147483647   expect ACCEPTED
    2147483648   expect REJECTED
    4294967295   expect REJECTED

If 2147483648 is accepted, the bound is unsigned or larger and MAX_RULE_ID is
too strict — a validator that rejects ids Chrome would take is lossy. Widen it
and record the observed value. If 2147483647 is REJECTED, the real bound is
lower; find it and record that instead.

### 4b — HTAB in a header value

isValidHeaderValue() rejects HTAB (0x09), which RFC 9110 permits in a
field-value. This is the one place the validator is knowingly stricter than the
standard (decision 2026-08-04).

Register a rule by hand whose header value contains a tab. If Chrome accepts
it, the strictness is confirmed as OUR choice rather than a platform limit —
which is fine, but it should be recorded as a choice, not left looking like a
constraint. If Chrome rejects it, the choice is vindicated and the comment in
lib/rules.js should be updated to say so.

Neither result blocks 0.1.1. Both close a stated-as-inferred gap, and the whole
point of writing the provenance into the source comments was so this could be
settled later rather than silently hardening into folklore.

---

## Recording template

    Date:            YYYY-MM-DD
    Build:           packed (store ID ...) | unpacked (ID ...)
    Chrome / OS:     150 / macOS
    Site access:     On specific sites | On all sites
    Part 0 verdict:  prompt-revoke | deferred-until-reload | retained
    Part 1:          1-6 pass/fail, with trace IDs for 1 and 2
    Part 2:          2a-2e pass/fail/documented
    Part 3:          1-4 pass/fail; Part 1 steps 1-2 REWRITTEN after badge change
    Part 3b:         unique-ID error seen in N of 5 saves (expect 0)
    Part 4a:         max accepted rule id observed = ?
    Part 4b:         HTAB in value accepted / rejected by Chrome = ?
    Notes:
