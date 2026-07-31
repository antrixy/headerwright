# Privacy Policy — HeaderWright

HeaderWright does not collect, transmit, store remotely, or share any data.

- **No data leaves your device.** Header profiles are stored in Chrome's
  local extension storage (`chrome.storage.local`) on your machine only.
  There is no account, no sync, no backend, and no server operated by this
  extension.
- **No traffic observation.** HeaderWright uses only the
  `declarativeNetRequest` API. It does not request the `webRequest`
  permission, so no code path in the extension can read any request or
  response. The browser applies your header rules itself. This is
  verifiable from the extension's manifest.
- **No telemetry or analytics.** The extension makes no network requests
  of any kind.
- **Exports are user-initiated.** The export feature writes a JSON file to
  your device at your request. Note that header values you configure may
  include sensitive strings (such as tokens); they are stored in local
  extension storage in plaintext, as with comparable tools, and included
  in any file you choose to export.

Questions: https://github.com/antrixy/headerwright/issues
