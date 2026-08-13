# Scope

What HeaderWright will do next, and what it will not do at all.

This exists because "and more are planned" is not a plan, and because the
useful half of a roadmap is the part that says no. Written 2026-08-13, at
v0.1.3.

## The constraint everything follows from

HeaderWright is built on `declarativeNetRequest` and holds no `webRequest`
permission. That is the product, not an implementation detail. Chrome applies
the rules internally; no extension code observes any request.

Every decision below is downstream of that. Where a feature would require
`webRequest`, it is not a roadmap item that hasn't been reached yet — it is
permanently unavailable, and saying so plainly is more useful than leaving it
open.

## v0.2 — response headers

One feature, per the versioning rule.

`declarativeNetRequest` supports response header modification with the same
`set` / `append` / `remove` operations already used for request headers. The
profile schema extends rather than changes: a second header list per profile,
same domain scoping, same permission model, same canonical export.

What has to be settled during v0.2, not assumed:

- Chrome's appendable-header allowlist for responses differs from the request
  allowlist. It needs establishing from the reference and encoding as its own
  constant, not reused.
- Export format changes shape. Import of a v0.1 config must keep working, and
  the canonical output must stay byte-stable. This is the part most likely to
  break something.
- The popup already carries a full-width header list. A second one needs a
  layout answer that does not turn the popup into a form.

Not in v0.2: anything else.

## Permanently out of scope — cannot be built

These require `webRequest`, the debugger API, or a native host. Adopting any
of them would end the property the extension exists to have.

- **Request or response interception.** Watching traffic as it happens.
- **Response body modification, mocking, or stubbing.** Bodies are not
  reachable through `declarativeNetRequest`.
- **A traffic log or request viewer.** HeaderWright does not receive request
  events and so has nothing to show.
- **Conditional rules based on response content.** Requires reading the
  response.
- **Throttling, delaying, or failing requests on a timer.** Requires holding
  the request.

If any of these becomes necessary, the honest answer is that a different
extension is the right tool, and this one should say so rather than grow a
`webRequest` permission.

## Out of scope by choice — possible, declined

`declarativeNetRequest` could do these. They are excluded anyway.

- **URL redirection.** Technically available. Excluded because it widens the
  blast radius of a compromised profile from "a header was wrong" to "traffic
  went somewhere else," and because it makes the extension's name a lie.
- **Blocking requests.** Same reasoning. Content blockers exist and are better
  at it.
- **Accounts, sync, or any backend.** Profiles are local. JSON export is the
  sharing mechanism, and it is deterministic and byte-stable specifically so
  git can be the sync layer.
- **Telemetry or analytics of any kind.** Including anonymous, including
  opt-in. The claim "no network requests of its own" is worth more than any
  usage data it would buy.
- **A paid tier or ads.** Not a revenue project.
- **Team features, shared profiles, permissions management.** Export the JSON
  and put it in a repo.

## Open, not decided

- **Rule match feedback.** Showing which rules actually fired would need the
  `declarativeNetRequestFeedback` permission. That is a real diagnostic gap —
  users currently cannot confirm a rule applied — but it adds a permission to
  an extension whose thesis is permission minimalism. Unresolved, and it
  should be resolved on the merits rather than by drift.
- **Cookie header handling.** `Cookie` is in the appendable request-header
  allowlist, so this partly works today. Whether it deserves explicit
  affordances or stays a general-purpose header is undecided.
- **Firefox.** The `declarativeNetRequest` implementation differs. No
  investigation done.

## Rules for changing this document

- A feature moves from "out of scope by choice" to a version only with a
  written reason and a date. Silent additions are how the scope above stops
  meaning anything.
- Nothing moves out of "cannot be built" without adopting `webRequest`, which
  is a different product and should be named as such.
- Evidence of demand does not by itself override an exclusion. The permission
  model is the thesis; if it turns out nobody wants a tool built that way,
  the correct response is to record that, not to dissolve the constraint.
