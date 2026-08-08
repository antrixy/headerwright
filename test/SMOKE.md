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
      const h = [{name:"X-HW-Test", operation:"set", value:"1"}];
      const one = (id) => ({id, name:`p${id}`, domains:["postman-echo.com"], headers:h});
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
    Notes:
