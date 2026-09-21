# HeaderWright

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ooapgilielelobkkcdlnkenkflbnnmhi)](https://chromewebstore.google.com/detail/headerwright/ooapgilielelobkkcdlnkenkflbnnmhi)

A small, dependency-free Chrome extension for setting, appending, and removing
HTTP headers — request and response — built on Manifest V3's
`declarativeNetRequest` API only.
No `webRequest` permission, ever. HeaderWright receives no request or response
events: it hands declarative rules to Chrome, and Chrome applies them
internally. That's verifiable by reading the manifest rather than trusting a
description.

## What it does

- Header profiles: set / append / remove request headers; set / remove
  response headers
- Per-profile domain scoping (subdomains included)
- Master on/off toggle with a badge showing that toggle's state, plus a
  distinct state when Chrome rejects a rule registration
- Deterministic JSON import/export — canonical key-sorted, byte-stable
  output, so configs can be shared and versioned in git

## Repeated entries on one header

A profile may hold more than one entry for the same header name, and **the
order matters.** Chrome applies them in the order the profile lists them, with
one consequence worth knowing before you rely on it:

| profile order, one header | result on the wire |
| --- | --- |
| `set A`, then `append B` | `A, B` |
| `append B`, then `set A` | `B` — **the `set` does not apply** |

Once a rule has appended to a header, a later `set` on that same header is
discarded. This is Chrome's `declarativeNetRequest` precedence, not a
HeaderWright choice, and HeaderWright does not reorder your entries to work
around it. Measured on Chrome 153; see `FINDINGS.md`, FINDING-036.

If you want a specific final value, put the `set` first.

## What it deliberately does not do (yet)

- No response-side `append` — request headers only, for now
- No account, no sync, no backend — profiles live in local extension storage
- No telemetry

## Install

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/headerwright/ooapgilielelobkkcdlnkenkflbnnmhi)

To run from source instead, see [Development](#development).

## Permissions

HeaderWright does not request access to any site at install time. When you
add a profile scoped to a domain, the browser prompts for permission on that
domain and its subdomains only — one extra click per new domain, not once
for everything.

Subdomains are part of the grant because they are part of the rule: a profile
on `example.com` also applies to `api.example.com`, and the permission has to
cover the same hosts the rule does. Through v0.1.3 it didn't, and headers
silently failed to apply on subdomains — see finding 18.

Why:

- **Bounded blast radius.** If the extension is ever compromised — a bad
  update, a hijacked account, a supply-chain slip — the damage is limited to
  domains you've actually granted, not every site you visit.
- **Revocable per site.** Deleting a profile, editing its domains, or
  importing a config that drops a domain all release that domain's
  permission — unless another profile still references it. Verified against
  `chrome.permissions.getAll()`: the grant is gone immediately, not deferred.
  This holds for a partially-held grant too: a domain carrying only the
  pre-0.1.4 apex permission releases what it has rather than being skipped
  because it does not hold the complete set (finding 20).
- **What you see is what's true.** HeaderWright's own popup is the honest
  display: a green dot means the grant is currently held, a gray dot means it
  isn't and the headers will not apply. Both are read from Chrome at render
  time rather than remembered.

  **As of v0.2.0, each profile card also shows the rule Chrome has actually
  registered** — one line per header, giving the side, the operation, the full
  header name and the value in quotes, e.g. `res · set · X-Frame-Options →
  "DENY"`. It is read from Chrome each time the popup draws, not from what was
  saved, so if it differs from what you meant, the card is right and the form
  was wrong. While a change is still being registered the card says so rather
  than showing the previous rule.

  **A second exception, as of v0.2.0 — and this one has been true since
  v0.1.0.** Chrome requires host permission for the request URL *and* for the
  request's **initiator** — the page that made the request — before it will act
  on it. That applies to everything except top-level and frame navigations.
  HeaderWright grants only the target domain. So:

  - **Loading the domain itself: headers apply.** Navigations need no initiator
    grant.
  - **Requests made by a page on that same domain: headers apply.** The
    initiator is the same domain, so the one grant covers both. Observed on
    `/favicon.ico` during v0.1.7 testing.
  - **Requests made by a page on a DIFFERENT site: headers do NOT apply**,
    unless that site is also granted. A profile on `api.example.com` does
    nothing when `app.example.com` calls it.

  The dot is still green in that last case, because the grant genuinely is
  held. Nothing currently reports it. Separating target and initiator domains
  is the fix and is planned; see SCOPE.md.

  **One exception, as of v0.1.5.** A green dot means the GRANT is held, which
  is not quite the same as the headers applying. If two profiles write the same
  header on overlapping domains, neither applies — but the grant is still held,
  so the dots stay green, the domains are still counted in the "domains
  granted" total, the status line still reads "applying", and the badge still
  reads ON. The per-profile collision marker on each card is the only surface
  that reports it, and it is what to read. Closing the gap on the other four
  means the status line and badge reporting how many profiles were skipped,
  which is new signal rather than a corrected one, so it is queued rather than
  patched (findings 21, 22 and 26).

  One caveat, found while verifying this: the site list under
  `chrome://extensions` → Details is *not* a reliable view of what is
  currently granted. It has been observed listing a domain that
  `chrome.permissions.getAll()` reports as not granted. Trust the popup, or
  the API, over that panel.
- **Lighter store review.** Broad host permissions draw more scrutiny from
  the Chrome Web Store; asking for nothing until it's needed avoids that by
  construction, not by explanation.

This costs one extra permission prompt the first time you scope a profile to
a new domain. That's the tradeoff, made deliberately.

A note on the prompt's wording: Chrome phrases every host grant as "read and
change your data" on the site. That describes the permission class, not this
extension — with `declarativeNetRequest` only, the browser applies the rules
itself and no extension code observes any request. The manifest is the proof.

A note on prompts that don't appear: re-adding a domain you previously removed
may produce **no dialog at all**. The grant is still acquired — Chrome appears
to suppress the prompt for a host you have already consented to for this
extension. Nothing is hidden from you when this happens: the popup's dot,
`chrome.permissions.contains()` and `chrome.permissions.getAll()` all agree
that the grant is held.

How far that suppression reaches is only partly established. Uninstalling the
extension **does** clear it — reinstalling and granting the same host prompts
again, observed twice. Whether it is scoped to the browsing session or persists
indefinitely for an install that stays in place is **not yet verified**;
settling it needs a fresh browser profile, and it is recorded here as open
rather than guessed at. The practical consequence either way is that the
absence of a prompt is not evidence that a grant was skipped — read the dot.

## Development

No build step — the `extension/` directory *is* the extension. Load it
unpacked from `chrome://extensions` with Developer mode on.

Run the selftests with `node test/selftest.mjs` from the repo root (no
dependencies). The suite covers rule construction and the canonical export
format, and ends with a check-count tripwire: adding or removing checks
requires updating `EXPECTED_CHECKS` in the same commit.

The suite verifies construction, not application — a rule can be built
correctly and still no-op on a domain without a permission grant, so release
verification also includes a manual smoke test against a live endpoint. Those
steps are written down in [test/SMOKE.md](./test/SMOKE.md) rather than left to
memory.

Defects found so far, what caused them, and what changed are recorded in
[FINDINGS.md](./FINDINGS.md) — including the ones introduced by earlier fixes
and the limitations that are known rather than solved.

## Versioning

Each minor version adds exactly one feature; patch versions are fixes only,
never features.

## License

MIT — see [LICENSE](./LICENSE).
