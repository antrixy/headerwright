# HeaderWright

A small, dependency-free Chrome extension for setting, appending, and removing
HTTP request headers, built on Manifest V3's `declarativeNetRequest` API only.

No `webRequest` permission, ever — nothing in this extension can observe your
traffic, and that's verifiable by reading the manifest rather than trusting a
description.

## What it does

- Header profiles: set / append / remove request headers
- Per-profile domain scoping (subdomains included)
- Master on/off toggle with a badge that always shows the current state
- Deterministic JSON import/export — canonical key-sorted, byte-stable
  output, so configs can be shared and versioned in git

## What it deliberately does not do (yet)

- No response header modification — a later version
- No account, no sync, no backend — profiles live in local extension storage
- No telemetry

## Permissions

HeaderWright does not request access to any site at install time. When you
add a profile scoped to a domain, the browser prompts for permission on that
domain only — one extra click per new domain, not once for everything.

Why:

- **Bounded blast radius.** If the extension is ever compromised — a bad
  update, a hijacked account, a supply-chain slip — the damage is limited to
  domains you've actually granted, not every site you visit.
- **Revocable per site.** Removing a profile drops that domain's
  permission too (unless another profile still uses it), so unused access
  doesn't linger.
- **What you see is what's true.** `chrome://extensions` → Site access shows
  exactly the domains HeaderWright can currently touch, and that list
  always matches your configured profiles.
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
correctly and still no-op on a domain without a permission grant, so
release verification also includes a manual smoke test against a live
endpoint.

## Versioning

Each minor version adds exactly one feature; patch versions are fixes only,
never features.

## License

MIT — see [LICENSE](./LICENSE).
