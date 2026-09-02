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
- **Run in the `hw-test` Chrome profile, not the main one.** The two-profile
  rig was established 2026-08-05 after the store fixture was destroyed twice by
  the same mistake: the store card and the unpacked card look alike in one
  `chrome://extensions` list. Extension installs and `chrome.storage` are
  per-Chrome-profile, so separation makes the mistake unavailable rather than
  merely discouraged. The test profile is signed OUT on purpose — signing in
  syncs extensions from the Google account and reintroduces the second card.
- **Check the DevTools title bar for the extension ID before trusting any
  console reading.** A correct API call against the wrong extension returns a
  real number and a wrong conclusion. This cost a mid-session scare on
  2026-08-05, when an empty `getAll()` was briefly read as the store fixture
  having been wiped; DevTools was attached to the freshly-loaded unpacked popup,
  which correctly had no grants.
- `sw.js` output lands in the **service worker console**, not the popup
  console. Open it via the "service worker" link on the card. Parts 5 and 6
  below depend on reading it.

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

## Fixtures for Parts 5 and 6

Not committed. Generate them with the repo's OWN `serializeProfiles()` so each
is canonical and known-accepted BY CONSTRUCTION — any rejection seen in a
browser is then a real disagreement, not a malformed file. From the repo root:

    node -e '
    import("./extension/lib/canonical.js").then(({serializeProfiles}) => {
      const one = (id) => ({id, name:`p${id}`, domains:["postman-echo.com"],
        headers:[{name:`X-HW-Test-${id}`, operation:"set", value:"1"}]});
      const fs = require("fs");
      fs.writeFileSync("/tmp/hw-fixture-id-ceiling.json",
        serializeProfiles([{...one(1), id: 2147483647, name: "Ceiling"}]));
      fs.writeFileSync("/tmp/hw-fixture-cap-5000.json",
        serializeProfiles(Array.from({length:5000}, (_, i) => one(i+1))));
      fs.writeFileSync("/tmp/hw-fixture-cap-5001.json",
        serializeProfiles(Array.from({length:5001}, (_, i) => one(i+1))));
      console.log("written to /tmp");
    })'

**TECHNIQUE WORTH REUSING:** point every profile at the SAME already-granted
domain. Rules are one-per-profile regardless of domain count, so rule count
scales with profile count while permission dialogs stay at ZERO. That is what
makes a 5,000-rule test a one-click operation.

**CHANGED IN v0.1.5, AND THE SHARED DOMAIN IS NOT THE PART THAT CHANGED.** The
header NAME must now vary per profile. Until FINDING-021 every fixture profile
carried the same `X-HW-Test` on the same domain, which v0.1.5 reads as a
5000-way collision and refuses on import. Verified against the committed
parser, not assumed:

    cap-5000.json -> REFUSED: ...would write the same header on overlapping d...
    cap-5001.json -> REFUSED: this file has 5001 profiles. The most that...

Note the asymmetry, because it is the part that hides the problem: 5001 still
refuses, but for the CAP. Reason precedence puts the cap check first, so Part 6
step 2 would pass while step 1 failed, and the step-2 pass would no longer be
testing anything — the file is refused either way. The shared domain is
untouched, so dialogs stay at zero and the technique survives intact.

---

## Part 5 — Generated rule ids (finding 9, fixed in v0.1.2)

At 0.1.1 `saveProfile()` computed `max(id)+1` and never checked it, so one
imported profile at the legitimate ceiling made the next save generate
2147483648 — written to storage unchecked and then rejected by Chrome as a
32-bit overflow. Confirmed at the wire 2026-08-05.

What actually broke was **a latch, not a takedown**, and the distinction is the
thing to preserve: atomicity meant the failed call changed nothing, so already
registered rules survived. Every SUBSEQUENT sync rebuilt the same set,
containing the same unregisterable rule, and failed identically.

Service worker console open throughout.

1. Import `hw-fixture-id-ceiling.json`. Expected: **accepted** — one profile at
   id 2147483647, one dynamic rule. The import path deliberately still accepts
   the ceiling; narrowing it would have invalidated this fixture.
2. Add a new profile through the popup on any domain. Read its stored id:

       chrome.storage.local.get("hw:profiles")

   | Observation | Meaning |
   | --- | --- |
   | id is **1** | Lowest-free allocation working. The ceiling no longer poisons the id space. |
   | id is 2147483648 | The fix is not wired — `nextRuleId()` is not being called. |
   | Save refused with "no rule id is available" | The A3 guard fired, which should be unreachable. Record it; something is wrong with allocation. |

3. Confirm both profiles register: `getDynamicRules()` shows 2 rules, `hw:sync`
   reads `{ok: true}`, badge is not red.
4. **Id reuse.** Delete the low-id profile, add another. Expected: the freed id
   is reallocated, and the new rule registers cleanly. Reuse is safe because
   every sync rebuilds the whole rule set — this step is what proves that
   claim in a browser rather than in a comment.

### 5b — Latch recovery still works

The generator can no longer create a latch, but hand-edited storage still can,
and the recovery path must not rot. Optional; run it if the sitting has room.

1. Write an out-of-range id straight to `hw:profiles` from the service worker
   console, bypassing both validators.
2. Expected: `sw.js:` "rule sync failed", badge RED, `hw:sync {ok:false}`.
3. Edit an UNRELATED profile. Expected: the edit is retained in storage but
   never reaches Chrome — the sync fails identically. That divergence IS the
   latch.
4. Delete the offending profile. Expected: `hw:sync` returns to `{ok:true}` and
   the pending edit is pushed through on the recovering sync.

---

## Part 6 — Over-cap import refusal (finding 6, fixed in v0.1.2)

At 0.1.1 an over-cap import was accepted whole and `sw.js` truncated to the cap
with only a `console.warn`: 5001 profiles stored, 5000 rules on the wire, sync
reporting success, green dots on every profile, and no surface saying one was
inert. Confirmed with numbers, Test D 2026-08-05.

1. Import `hw-fixture-cap-5000.json`. Expected: **accepted.** 5000 profiles,
   `getDynamicRules().length` is 5000, `hw:sync {ok:true}`, no truncation
   warning in the service worker console.
2. Import `hw-fixture-cap-5001.json`. Expected: **refused in the UI**, with the
   reason naming both numbers — the 5001 it was given and the 5000 Chrome
   allows. No `hw:profiles` write, no sync, no truncation warning.
3. **A4 regression.** After the refusal, the prior configuration is untouched:
   same profile count, same rules, same grants. An import that fails must
   change nothing.

> **The 5001-profile state is no longer reachable through the UI**, which is
> the point of the fix and also means the render-burst observation from
> 2026-08-05 can only be reproduced at 5000 now. Note the ceiling change rather
> than re-deriving it next time.

The truncation branch in `sw.js` is retained deliberately as defence in depth.
If its warning ever appears in the service worker console, something wrote to
storage that did not come through import or the form — that is a real finding,
not noise.

---

## Part 7 — Domain dedup and count agreement (finding 7, fixed in v0.1.2)

Test C, 2026-08-05: three identical `example.com` chips beside a status line
reading "1/1 domain granted" — two different counts of the same thing in one
view, visible without opening a console.

1. Create a profile with the domains field reading exactly:

       example.com, EXAMPLE.com, example.com

2. Save. Expected: **ONE chip**, and the status line domain count agrees with
   the number of chips on screen. The two counts must never disagree.
3. Export. Expected: `"domains": ["example.com"]` — a single entry.
4. **Idempotence.** Import that export, export again, diff the two files.
   Expected: empty. Byte-identity survives the dedup.
5. **Legacy storage.** Write a profile with duplicate domains straight to
   `hw:profiles` from the console, then reopen the popup. Expected: still one
   chip. Normalization runs on READ, so profiles written by 0.1.1 agree without
   needing to be re-saved. This is the step that covers an upgrading user.

---

## Part 8 — Live state while the popup is open (finding 8, fixed in v0.1.2)

At 0.1.1 the popup rendered once on open and never re-read storage: a failure
arriving AFTER the render left the status line reading "applying" beside green
dots while the toolbar badge was already RED. Reproduced in both directions on
a genuine failure, 2026-08-05.

The uncovered case is precisely **a change arriving after a render**, so the
popup must stay open throughout. Closing and reopening it hides the bug.

1. Open the popup. Confirm the status line reads "applying".
2. **Without closing it**, inject a sync failure from the service worker
   console (Part 3 step 2 describes how).
3. Expected: within a moment, the status line updates IN PLACE to "not applying
   — last sync failed", with the tooltip carrying Chrome's message. No reopen.
4. Clear the failure. Expected: the status line returns to "applying" in place.
5. **Grant change from outside.** With the popup open, revoke a host via
   `chrome://extensions` → Site access. Expected: the chip's dot updates
   without a reopen.
6. **Debounce sanity.** Save a profile — that writes `hw:profiles` and then
   `hw:sync` back to back. Expected: the list settles once, with no visible
   double-repaint and no perceptible lag. At 5000 profiles this is the step
   that matters: each render costs one `permissions.contains()` per chip.
7. **Editor is undisturbed.** Open the editor, type into a field, and trigger a
   storage change from the console. Expected: the form keeps its contents and
   the view does not switch. Re-render touches the list and status line only.

---

## Part 9 — Delete confirmation (finding 10, new in v0.1.2)

Delete was the only destructive action with no confirmation, while import —
which is RECOVERABLE, since the file still exists on disk — had one. This is a
recorded deviation from "patch = fixes only"; see the handoff before changing
it.

1. Click Delete on a profile. Expected: **nothing is deleted yet.** A
   confirmation appears naming that profile and its domain count.
2. **Cancel.** Expected: the confirmation closes, the profile survives intact,
   and its grants are untouched.
3. Click Delete again, then confirm. Expected: the profile is removed, and
   domains no longer referenced by any other profile are REVOKED in the same
   step — Part 2e's expectations apply unchanged through the confirmation.
4. **No native dialog.** The confirmation must be inline. A native
   `window.confirm()` is the Bug record hazard: a modal destroys the popup's JS
   context and nothing after the await runs. If the popup closes at any point
   here, that is a failure.
5. **Retraction.** Open the confirmation, then delete the SAME profile from
   another context (write `hw:profiles` from the console). Expected: the
   confirmation withdraws itself rather than sitting there naming a profile
   that no longer exists.
6. **View change abandons it.** Open the confirmation, click Edit on any
   profile, return to the list. Expected: no confirmation is still armed.
7. **Import closes it.** Open the confirmation, then start an import. Expected:
   only one confirmation on screen at a time.

---

## Part 10 — Export plaintext-secrets notice (new in v0.1.2)

Header values are written to the export file exactly as configured, and a
header editor's most common real use is an `Authorization` or `Cookie` value.
Nothing said so before 0.1.2.

The suite can prove the `.notice` class is DEFINED. It cannot see what colour
anything renders, which is the entire point of this part.

1. Export. Expected: the file downloads as usual, and a message appears naming
   `headerwright-profiles.json` and stating that header values are plain text.
2. **It must read as neutral, not as an error.** `#io-msg` is shared with
   import rejections and is styled in the danger colour by default. A red line
   after a successful export says "your export failed", which is a new false
   claim in the same release that removed several.
3. **Both themes.** Check in light and dark — the popup follows
   `prefers-color-scheme`, and the notice uses `--ink-soft` and `--line`, both
   of which are redefined in the dark block.
4. **The channel still carries errors.** Immediately after the notice, import a
   deliberately invalid file. Expected: the message is REPLACED by the
   rejection reason, rendered in the error colour. If it stays neutral, the
   class toggle is one-way and every future import rejection reads as a
   success.
5. **No confirmation before export.** Export is non-destructive and must not
   gate itself. If a confirmation appears, the wrong pattern was applied.
6. **Export closes a pending delete confirmation.** Open a delete confirmation,
   then click Export without confirming. Expected: the confirmation withdraws
   and the export notice appears in its place — never both at once.

---

## Part 11 — Subdomain application and upgrade path (findings 18/19/20, fixed in v0.1.4)

**This is the part the selftest structurally cannot do.** The suite now
proves the permission set and the DNR host set cover the same hosts, but
"covers" there is a claim about two string oracles. Only Chrome can say
whether the header reaches the wire on a subdomain. Through v0.1.3 the
construction was right, the oracle said yes, and the wire said nothing.

Needs an echo endpoint reachable at both an apex and a subdomain. If the
usual one is not, any host you control with a wildcard DNS record works;
record which was used.

**RUN ORDER — the numbering here is not the execution order.** A legacy-gray
domain is a CONSUMABLE. Step 6's last bullet turns one green, and 6b turns the
last one green by design. But step 7 must be read before any re-grant, and all
of Part 12 continues from step 6 with a domain still gray. Taken in document
order, steps 7 and 12 arrive with nothing left to observe and the v0.1.3
fixture has to be rebuilt.

Spend every observation that REQUIRES gray before any that CLEARS it:

    6 (all bullets except the last) -> 8 -> 7 -> Part 12 steps 1-4
      -> 6 last bullet -> 6b -> 12.5 -> 6d -> 6c -> 10 -> 9 -> 12.6-12.7

Steps 8 and 7 are one sweep — swept and retained observed in the same pass is
a stronger result than either alone, so orphan the step 8 domain in storage
BEFORE the upgrade and open the service worker console BEFORE reloading. That
console line is logged on install and is not recoverable afterwards.

Grant enough legacy domains up front that nothing needs rebuilding mid-run:
one carrying multiple profiles (serves 6d and 12.4), one to cycle through
12.1-12.3, one to orphan for step 8, and one held untouched as step 7's
retention control. Verify every granted set with `permissions.getAll()` in the
service worker console, NOT the Details panel — that panel collapses the
patterns and under-reports.

**Read Part 12's PRECONDITION before starting.** Step 6's last bullet needs a
re-grant dialog to fire, and in a Chrome profile that has already approved
these hosts it will not — the grant is issued silently and the step cannot be
observed. The same constraint governs 6b. Choose the browser profile and the
hostnames accordingly, before building the fixture rather than after.

1. **Apex still applies (regression control).** Profile on `<apex>`, granted
   fresh in v0.1.4, master ON. Header present on `<apex>`. This is Part 1
   step 1 re-run against the new pattern set — if it fails, the wildcard
   grant broke the case that used to work.
2. **Subdomain applies — THE FIX.** Same profile, no edits. Load
   `sub.<apex>`. The header is present on the wire. Under v0.1.3 this step
   fails; that failure is the bug and is worth reproducing once on the old
   build before trusting the new one.
3. **Deep subdomain applies.** `a.b.<apex>`. Present.
4. **Suffix confusable does NOT apply.** A host that merely ends with the
   same letters (`not<apex>`, or `<apex>.something-else.test`) gets NO
   header. The wildcard must not have widened the set beyond the DNR
   condition — over-application is a worse bug than the one being fixed.
5. **Dialog text.** Grant a fresh domain and read the native dialog. It
   should name the site and its subdomains. Record the exact wording: this
   is the user-visible cost of the fix and it belongs in the record.
6. **Upgrade path from a real v0.1.3 profile.** Install v0.1.3, create a
   profile, grant it, confirm the dot is GREEN. Load the v0.1.4 build over
   it without deleting storage.
   - The profile survives.
   - Its dot is now GRAY, and the chip is clickable.
   - The chip carries the dashed underline, and its tooltip names the older
     version as the reason — distinguishable from a domain that was simply
     never granted.
   - The migration notice appears above the list, counts the affected
     domains correctly, and reads with correct singular/plural agreement.
     Check BOTH: one affected domain and two.
   - The status line and badge agree that it is ungranted — no green dot
     over an unapplied header, which was the whole failure mode.
   - Clicking the chip opens the dialog; accepting turns it green and the
     header applies on both apex and subdomain WITHOUT reopening the popup.
6b. **The notice self-expires.** Continuing from step 6, re-approve the LAST
   affected domain. The notice disappears in the same render, without
   reopening the popup. Close and reopen: still gone. Then reload the
   extension entirely: still gone. Nothing but a re-grant should be able to
   clear it, and nothing should be able to bring it back.
6c. **The notice never appears on a fresh install.** Load v0.1.4 into a
   clean profile (the `hw-test` Chrome profile with storage cleared), create
   a profile, deny the grant. The dot is gray and the chip is clickable, but
   there is NO notice and NO dashed underline — a denied grant is not a
   migration. This is the false-positive check: the notice is only correct
   if it cannot fire for a user who never ran v0.1.3.
6d. **Render cost did not regress.** The permission pass is now once per
   unique domain instead of once per chip. With three profiles referencing
   the same domain — **each writing a DIFFERENT header name, or v0.1.5 refuses
   the configuration outright and there is nothing to render** — the popup
   renders without visible flicker and the chips all agree. Finding 8's live-update path still works: change storage from
   the service worker console and the list corrects itself.
7. **Sweep leaves the legacy grant alone until it is unreferenced.** After
   step 6 but BEFORE re-granting, check `chrome://extensions` → Site access.
   The v0.1.3 apex grant should still be listed: it is inside the wanted set,
   so `reconcileHostGrants()` must not have taken it.
8. **Sweep removes a genuinely orphaned grant.** With v0.1.3 installed,
   grant a domain, then edit storage directly (service worker console:
   `chrome.storage.local.set`) to drop that domain from every profile —
   simulating the pre-v0.1.1 stale grant that `diffDomainGrants()` cannot
   see. Load v0.1.4. On install the service worker console logs the revoke
   and the grant is gone from Site access.
9. **User-granted all-sites is NOT swept.** Set Site access to "On all
   sites" in `chrome://extensions`, then reload the extension. The setting
   survives. `isManagedOrigin()` must keep the sweep off anything the
   extension did not itself request.
10. **IP literal, if you use one.** A profile on `127.0.0.1` or a LAN
    address still applies. This is the case the wildcard pattern would
    have broken; `originsForDomain()` special-cases it and only a live run
    proves the special case was needed and sufficient.

---

## Part 12 — Revocation under migration, and sweep provenance (findings 20/4, v0.1.4)

Part 11 covers the migration path forward — re-approve and headers apply.
This covers the path SIDEWAYS: a user who upgrades and then removes the
profile without ever re-approving. An earlier cut of this release leaked the
old grant there, and it
is the one case that contradicts the README's "released immediately" claim.

Continues from Part 11 step 6, with a legacy-only domain still gray.

### PRECONDITION — a Chrome profile with no approval history

**Chrome caches permission approval per origin, per browser profile, and that
cache SURVIVES `permissions.remove()`.** Once a user has approved an origin
for this extension, a later `request()` for it is granted SILENTLY, with no
dialog. A never-approved origin still prompts normally.

Consequences, all of which invalidate this part if ignored:

- Gray state cannot be HELD. Any profile mutation runs `reconcileGrants()`,
  which re-requests every wanted-but-not-fully-granted domain — and those
  requests are granted silently. A domain re-gray'd by hand reverts to a full
  grant on the next unrelated delete or save, with nothing shown to the user.
- Re-grant dialogs do not fire, so any step that observes one fails to
  reproduce.
- Nothing about this is visible while it happens. The failure looks like the
  test passing.

Run this part in a Chrome profile that has NEVER approved the test hosts, or
against hostnames never approved in the current profile (`hw2.test`,
`alt2.test`). If reusing a profile with different hostnames, record that —
the old approval cache is still present and constrains what can be re-run.

Cheap verification that a host is genuinely unapproved: create a throwaway
profile on it and confirm the dialog appears. No dialog means the cache is
already primed and this part cannot produce clean evidence for that host.

### Instrument the revoke path before running steps 1-3

Without this, a retained grant is ambiguous between two very different
answers: Chrome kept it despite a correct `remove()`, or `remove()` never
happened. The first is DOCUMENTED per the Part 0 table; the second is a FAILED
row and a real bug. The observation cannot be reconstructed afterwards, so arm
the wrapper first.

    const _rm = chrome.permissions.remove.bind(chrome.permissions);
    chrome.permissions.remove = (p) => {
      console.log("REMOVE CALLED", JSON.stringify(p.origins));
      return _rm(p).then(r => { console.log("REMOVE RESULT", r); return r; });
    };
    console.log("wrapper armed");

Then act, then read `chrome.permissions.getAll().then(p => p.origins)`.

What to expect: the popup revokes with the domain's `heldOrigins` — exactly
what is held, not what a full grant would look like — so a legacy-only domain
must produce ONE pattern in the apex shape, `*://<domain>/*`. Two patterns is
the leak this part exists to catch: removing `*://*.<domain>/*` succeeds
vacuously while the grant that is actually held stays behind.

| Observation | Verdict |
| --- | --- |
| No `REMOVE CALLED` line | **FAIL** — code path missed |
| Called with 2 patterns for a legacy-only domain | **FAIL** — the leak regressed |
| Called with `["*://<domain>/*"]`, result true, origin STILL in `getAll()` | **DOCUMENTED** — Chrome retention |
| Called with `["*://<domain>/*"]`, result true, origin GONE | **PASS** |

The wrapper lives in the service worker and dies when the worker idles out.
Re-arm after any restart and confirm `wrapper armed` is still the newest line
in the console before each of steps 1-3 — a wrapper that died silently reads
exactly like the FAIL row above.

1. **Delete releases the legacy grant.** With the domain gray, delete the
   profile and confirm. Check `chrome://extensions` -> Site access: the
   old apex grant is GONE, without a browser restart.
2. **Edit releases it too.** Restore the profile, re-gray it (see below), then
   EDIT the domain to something else and save. The old grant is gone.

   Re-graying: reloading the v0.1.3 build over the directory again is the
   genuine path but is slow, and revoking via Site access is unreliable
   because that panel collapses the two patterns. `isLegacyOnlyGrant()` is a
   pure state test — apex held, current set not held — so the state is
   reachable from the service worker console, but it takes TWO calls:

       // 1. remove the wildcard. NOTE: this takes the apex with it —
       //    "*://*.host/*" SUBSUMES "*://host/*" in Chrome match-pattern
       //    semantics, so the domain is left with no grant at all.
       await chrome.permissions.remove({ origins: ["*://*.<domain>/*"] });
       // 2. request the apex back on its own
       await chrome.permissions.request({ origins: ["*://<domain>/*"] });
       await chrome.permissions.getAll().then(p => console.log(p.origins));
       // expect: holds "*://<domain>/*", does NOT hold "*://*.<domain>/*"

   `remove()` needs no user gesture. `request()` does — enable "Treat code
   evaluation as user action" in the console settings, or it will reject.
   Removing ONLY the wildcard and stopping there does not work: it yields an
   empty grant set, not a legacy-only one. Verify with `getAll()` rather than
   assuming; a domain with no grant and a domain with a legacy grant both
   render as a gray chip, and only one of them is the state this part needs.

   RECORD THAT THE RE-GRAY WAS SYNTHETIC wherever it is used — it reproduces
   the state, not the upgrade that produces the state. Part 11 steps 6 and 6b
   still require a genuine v0.1.3 -> v0.1.4 overwrite. Note also that
   synthetic re-gray does not HOLD: see the precondition above.
3. **Import replace-all releases it.** Same setup, then import a config that
   does not reference the domain. Gone.
4. **A shared legacy domain is RETAINED.** Two profiles on the same gray
   domain, **writing different header names** (same name is a v0.1.5 collision
   and will not save); delete one. The grant stays, because the other still
   references it. This is finding 1b's invariant holding under migration.
5. **The migration path still works after all that.** Re-create the profile
   and click the chip. Dialog appears, grant completes, green.

### Sweep provenance — an OBSERVATION, not a pass/fail

`isManagedOrigin()` is a shape test. It cannot know whether a grant came from
this extension or from the user. The open question is whether Chrome's own
Site Access UI even produces the shape the sweep matches. Find out:

6. In `chrome://extensions`, set Site access to "On specific sites" and add
   a site the extension has no profile for. Then in the service worker
   console run `chrome.permissions.getAll()` and RECORD THE EXACT PATTERN.
   - If it is scheme-specific (`https://x.test/*`), the sweep already cannot
     touch it and finding 4 is largely theoretical.
   - If it is `*://x.test/*`, the sweep WILL remove it on restart, and the
     provenance ledger becomes worth building.
7. Reload the extension and check whether the site survives. Record either
   way. This single observation decides whether finding 4 is design work or
   a comment fix.

---

## Part 13 — Collision refusal (finding 21, fixed in v0.1.5)

**What the selftest cannot do here.** The suite proves the predicate: which
domain pairs overlap, which header names match, which configurations are
refused. It cannot show that a refused pair applies NEITHER header on the
wire, because "neither" is a claim about what Chrome did with the rules it was
given, and the suite never registers a rule.

**The before-state is banked, and it is thinner than it looks.** OBS-C10
(`test/EVIDENCE.md`) recorded two profiles on one domain both setting
`xheader`, values `A` and `B`, and `A` alone reaching the wire. It establishes
a single silent winner. It does NOT establish what chose the winner — four
candidate mechanisms all predicted `A` in that configuration. Refusal is
measured against the first fact and does not need the second.

**CORRECTED AFTER SITTING D (2026-09-01), FIRST RUN.** Three changes, all
found by running the part rather than reading it:

- **Steps 1 and 4 collapse.** Step 1 as written has you create a colliding pair
  through the UI. On v0.1.5 you CANNOT — the write path refuses the second
  save, which is the thing being tested. The only route to a colliding pair is
  step 4's storage write. Treat them as one procedure.
- **Run steps 5 and 6 in the order 6 THEN 5.** Step 5 ends by editing the
  collision away; step 6 needs it intact to export. In document order step 6
  arrives with nothing left. Same consumable problem as Part 11.
- **Step 4 needs a real before-state.** Writing a colliding pair straight into
  storage leaves both domains UNGRANTED, so "no header on the wire" is
  explained by the missing grant and the row proves nothing. Instead: create
  the two profiles with DIFFERENT header names, grant both, confirm both apply,
  then rename one header in storage so they match. Same profiles, same grants,
  one field changed.

**WHICH ROWS CARRY THE WEIGHT.** The headline row is the weakest in the part: a
build that refused every configuration would pass it. Steps 2 and 3 are what
distinguish a working refusal from a broken one, and step 3 in particular —
`"notn1.test".endsWith("n1.test")` is true, so a string-suffix bug would refuse
a pair covering disjoint hosts. If time is short, 2 and 3 cannot be skipped.

Needs the echo server and two hostnames with a real parent/child relationship
(`c1.test` and `sub.c1.test`), plus one suffix confusable (`notc1.test`). All
three to 127.0.0.1. Use a profile with no prior approval for any of them.

1. **A colliding pair applies NEITHER header.** Two profiles, one on
   `c1.test` and one on `sub.c1.test`, both writing `X-Collide` with different
   values. Grant both.
   - Expected on the wire at `http://sub.c1.test:8080/`: **no `X-Collide` at
     all.** Not one value, not both, not a concatenation.
   - Expected in the popup: BOTH cards carry a collision marker naming the
     header and the other profile by name. Neither is silently the loser.
   - Expected in the service worker console: one `HeaderWright:` warning
     naming the header and both profile ids.
   - This is the FINDING-018-enlarged surface deliberately: apex and subdomain
     did not overlap before v0.1.4 and do now.

2. **The STRICT decision, on the wire.** Edit the second profile so both
   profiles set `X-Collide` to the SAME value. The outcome no longer depends
   on order, and v0.1.5 refuses it anyway.
   - Expected: **the save is refused in the form**, with the message naming
     `X-Collide` and the other profile.
   - This row exists because it is the one a user is most likely to report as
     wrong. If it is ever relaxed to outcome-based detection, THIS row and the
     two matching selftest checks are what change. Record the exact message.

3. **Suffix confusables are NOT a collision.** Two profiles, one on `c1.test`
   and one on `notc1.test`, both writing `X-Collide`.
   - Expected: both save, both grant, and **both apply** —
     `http://c1.test:8080/` and `http://notc1.test:8080/` each show their own
     value. No marker on either card.
   - `"notc1.test".endsWith("c1.test")` is true, so a string-suffix test would
     refuse two configurations that cover disjoint hosts. This is the wire
     version of the selftest's confusable control and the reason the leading
     dot in `domainsOverlap()` is the most load-bearing character in the file.

4. **The build-path half reaches an install the write path cannot.** The
   write-path refusals only fire on a save or an import; an install that is
   ALREADY colliding never triggers either. Reproduce that state directly:
   with the extension unloaded, write a colliding pair into
   `chrome.storage.local` from the service worker console, then reload.
   - Expected: both profiles present in the popup, both marked, neither
     applying on the wire, and the console warning present.
   - This is the row that stands in for a real v0.1.4 install that FINDING-018
     pushed into a collision. If it is skipped, the half of the fix that
     reaches existing users is untested in a browser.

5. **An unrelated profile can still be edited while a collision exists.** With
   the colliding pair from step 4 still in place, add a third profile on a
   fresh domain with its own header, and save it.
   - Expected: **it saves.** The collision it has nothing to do with does not
     block it.
   - Then edit one of the COLLIDING profiles to change its header name.
     Expected: it saves, both markers clear, and both profiles apply.
   - Without this the guard would trap an upgraded user with delete as the
     only exit. This is finding 15's editing exemption, one release later.

6. **A colliding import is refused, and refused for the right reason.**
   Export the step-4 state, then re-import it.
   - Expected: refused, message naming the header.
   - Then import a file that is BOTH over-cap and colliding. Expected: refused
     for the CAP. Reason precedence — a file should be rejected for the first
     thing wrong with it, and the cap is the cheaper thing to fix.

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
    Part 5:          id generated after the ceiling profile = ?  (expect 1)
    Part 5b:         latch reproduced / recovered = ?  (optional)
    Part 6:          5000 accepted = ?  5001 refused with both numbers = ?
    Part 7:          chips shown for a triple-entered domain = ?  (expect 1)
    Part 8:          status line corrected WITHOUT reopening = ?
    Part 9:          delete confirmed / cancelled / retracted = ?
    Part 10:         export notice neutral in light / dark = ?
                     import rejection still renders red afterwards = ?
    Part 11:         echo host used (apex / wildcard DNS) = ?
                     1-4 apply/no-apply as expected = ?
                     5 dialog wording observed = "..."
                     6 v0.1.3 -> v0.1.4 dot went GRAY = ?  re-grant OK = ?
                     6 notice text at n=1 / n=2 = "..." / "..."
                     6b notice gone after last re-grant, survives reload = ?
                     6c fresh install + denied grant shows NO notice = ?
                     6d shared domain renders once, no flicker = ?
                     7 legacy apex grant retained = ?
                     8 orphaned grant swept, console line seen = ?
                     9 "On all sites" survived reload = ?
                     10 IP-literal profile still applies = ?  (n/a if unused)
    Part 12:         browser profile approval history for test hosts = none / primed
                     wrapper armed in POPUP context = ?  re-armed after each close = ?
                     1 delete: REMOVE CALLED = "..."  result = ?  after = ?
                     2 edit:   REMOVE CALLED = "..."  result = ?  after = ?
                     3 import: REMOVE CALLED = "..."  result = ?  after = ?
                     1-3 verdict per the table = pass / documented / fail
                     re-gray method (genuine downgrade / synthetic console) = ?
                     4 shared legacy domain retained = ?
                     5 re-grant still works afterwards = ?
                     6 pattern Chrome's Site Access UI produced = "..."
                     7 that site survived extension reload = ?
    Part 13:         1 colliding pair: X-Collide on the wire = ?  (expect absent)
                     1 markers on BOTH cards = ?  console warning seen = ?
                     2 identical-value save refused = ?  message = "..."
                     3 confusable pair BOTH applied = ?  (expect yes, no markers)
                     4 storage-written pair marked + not applying after reload = ?
                     5 unrelated profile still saveable = ?  collision editable away = ?
                     6 colliding import refused = ?  over-cap+colliding refused for CAP = ?
    Notes:
