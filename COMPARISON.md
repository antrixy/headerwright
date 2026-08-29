# Choosing a header extension

This page exists because of an event, not a marketing plan. In July 2026,
Google and Microsoft removed ModHeader — the most widely used header
extension, with roughly 1.6 million installs across Chrome and Edge — after
security researchers at Stripe OLT found a dormant browsing-history collector
shipped inside the official store version. The collector was switched off by
an empty allow-list, and no evidence has been published that it ever gathered
or transmitted anything. The code, an encryption key, and a daily upload
schedule were nonetheless present in the build Google's own store signature
verified. Complaints about injected ads had preceded it by several years.

People displaced by that removal are choosing a replacement right now, and
the honest thing to offer them is the axis that made the incident possible —
not a feature grid with checkmarks down our column.

## The axis that matters: can the extension read your traffic?

Header extensions divide into two architectures.

**In-path (`webRequest` / `webRequestBlocking` + `<all_urls>`).** The
extension receives an event for every request on every site and returns the
modified headers itself. This is the older, more powerful model: it enables
response-header editing, live traffic inspection, and per-request logic. It
also means the extension's code — including whatever a future update, a new
owner, or a compromised publisher account puts in it — sits in the request
path for your entire browser. ModHeader used this model, by its own store
listing: `webRequest`, `webRequestBlocking`, `<all_urls>`, `storage`,
`contextMenus`, `alarm`.

**Declarative (`declarativeNetRequest`).** The extension hands Chrome a list
of rules and Chrome applies them internally. The extension receives no
request or response events and cannot observe traffic, on granted domains or
anywhere else. The cost is expressiveness: no per-request logic, and the rule
vocabulary is whatever Chrome's API offers.

The critical property of the declarative model is that it is **verifiable
from the manifest, before installing**. You do not have to trust a
description, a privacy policy, or this page — see
[Verify it yourself](#verify-it-yourself) below.

HeaderWright is declarative-only, with one narrowing: it uses
`declarativeNetRequestWithHostAccess`, the variant that applies rules only on
hosts you have individually granted, and it requests no host at install time.
A compromised HeaderWright could, at worst, modify request headers on the
specific domains you had approved — it could not read traffic on them, and it
could not touch any other site.

## The field, as of August 2026

Claims below about other extensions come from their own store listings and
repositories at the time of writing. Permission sets change with updates;
verify against the current listing before relying on this.

**Requestly** — the largest surviving tool. Request and response headers,
redirects, script injection, API mocking, team-shared rules. It is an
all-in-one development platform, and its permission footprint is sized
accordingly. If you need response headers or mocking today, it is the capable
choice, and the trade you are making is the breadth of the surface you are
trusting.

**Simple Modify Headers** — open source, ~40,000 users, and per its own
listing still built on `webRequest`, `webRequestBlocking`, and `<all_urls>`.
That is the blocking model Manifest V3 removes; its future depends on a
rewrite.

**Header Editor** — open source, minimalist, regex-based URL matching. Closer
in spirit to HeaderWright than the platforms are. We have not audited its
permission model and make no claim about it; read its manifest.

**Post-ModHeader replacements** (VibeHeader, HeaderTools, and others) —
several tools now market themselves specifically as ad-free ModHeader
alternatives. Position statements are not architecture; the manifest test
below applies to them, and to us, equally.

## What HeaderWright does not do

A comparison written by the thing being compared is only useful if this
section is real.

- **No response headers.** Requestly and ModHeader users use these
  constantly. It is the planned v0.2 feature, and it does not exist today.
- **No URL or regex matching.** Scoping is by domain (with subdomains),
  nothing finer. If you need per-path rules, Header Editor or Requestly fit
  better.
- **No defined precedence between overlapping profiles.** Two profiles
  setting the same header on the same request currently have no defined
  winner ([FINDINGS.md](./FINDINGS.md), FINDING-021, open). If your workflow
  layers profiles, this is a live sharp edge.
- **The popup layout degrades past about six profiles** (FINDING-022, open).
- **No sync, no cloud, no teams.** Profiles are local. Deterministic
  JSON export/import is the sharing mechanism, deliberately.

If those gaps rule HeaderWright out for you today, that is the correct
conclusion and this page has worked.

## Verify it yourself

For any header extension, including this one:

1. Download the extension's package without installing it (the Chrome Web
   Store serves the CRX; several sites unpack listings, or use
   `chrome://extensions` → pack/inspect an unpacked copy from source).
2. Read `manifest.json`. If `permissions` or `host_permissions` include
   `webRequest` or `<all_urls>`, the extension's code is in-path for the
   sites covered — its behavior is whatever its current code does, and its
   description is a promise, not a property.
3. If it declares only `declarativeNetRequest` variants, the browser applies
   the rules and the extension cannot observe traffic. Then check *when* host
   access is acquired: at install for everything, or per-domain on request.

HeaderWright's manifest is
[in this repository](./extension/manifest.json): two permissions
(`declarativeNetRequestWithHostAccess`, `storage`), no host permissions at
install, optional host permissions granted per domain. The store package and
the repository are the same files — there is no build step, so a diff against
a downloaded CRX is meaningful.

## Sources

- The Hacker News, "Google and Microsoft Pull ModHeader With 1.6 Million
  Installs After Dormant Collector Found" (July 2026)
- SC Media brief on the removal (July 2026)
- Stripe OLT's published analysis of ModHeader 7.0.18
- Chrome Web Store listings for ModHeader, Simple Modify Headers, and
  Requestly as retrieved August 2026
