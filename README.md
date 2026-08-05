# HeaderWright

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ooapgilielelobkkcdlnkenkflbnnmhi)](https://chromewebstore.google.com/detail/headerwright/ooapgilielelobkkcdlnkenkflbnnmhi)

A small, dependency-free Chrome extension for setting, appending, and removing
HTTP request headers, built on Manifest V3's `declarativeNetRequest` API only.
No `webRequest` permission, ever. HeaderWright receives no request or response
events: it hands declarative rules to Chrome, and Chrome applies them
internally. That's verifiable by reading the manifest rather than trusting a
description.

## What it does

- Header profiles: set / append / remove request headers
- Per-profile domain scoping (subdomains included)
- Master on/off toggle with a badge showing that toggle's state, plus a
  distinct state when Chrome rejects a rule registration
- Deterministic JSON import/export — canonical key-sorted, byte-stable
  output, so configs can be shared and versioned in git

## What it deliberately does not do (yet)

- No response header modification — a later version
- No account, no sync, no backend — profiles live in local extension storage
- No telemetry

## Install

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/headerwright/ooapgilielelobkkcdlnkenkflbnnmhi)

To run from source instead, see [Development](#development).

## Permissions

HeaderWright does not request access to any site at install time. When you
add a profile scoped to a domain, the browser prompts for permission on that
domain only — one extra click per new domain, not once for everything.

Why:

- **Bounded blast radius.** If the extension is ever compromised — a bad
  update, a hijacked account, a supply-chain slip — the damage is limited to
  domains you've actually granted, not every site you visit.
- **Revocable per site.** Deleting a profile, editing its domains, or
  importing a config that drops a domain all release that domain's
  permission — unless another profile still references it. Verified against
  `chrome.permissions.getAll()`: the grant is gone immediately, not deferred.
- **What you see is what's true.** HeaderWright's own popup is the honest
  display: a green dot means the grant is currently held, a gray dot means it
  isn't and the headers will not apply. Both are read from Chrome at render
  time rather than remembered.

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

## Versioning

Each minor version adds exactly one feature; patch versions are fixes only,
never features.

## License

MIT — see [LICENSE](./LICENSE).
