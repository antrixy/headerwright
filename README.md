# HeaderWright

A small, dependency-free Chrome extension for setting, appending, and removing
HTTP request headers, built on Manifest V3's `declarativeNetRequest` API only.

No `webRequest` permission, ever — nothing in this extension can observe your
traffic, and that's verifiable by reading the manifest rather than trusting a
description.

## Status

Early development. v0.1.0 is not yet released.

## Planned v0.1.0 scope

- Header profiles: set / append / remove request headers
- Per-profile URL scoping
- Master on/off toggle with an unmissable badge
- Deterministic JSON import/export (canonical key-sorted, byte-stable) for
  sharing configs via git

## What it deliberately does not do (yet)

- No response header modification — a later version
- No account, no sync, no backend — profiles live in local extension storage
- No telemetry

## Development

Build and run instructions will land with the v0.1.0 release.

## License

MIT — see [LICENSE](./LICENSE).
