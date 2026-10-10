# Privacy Policy — HeaderWright

HeaderWright collects nothing. No data about you or your browsing goes to
its developer or to any third party.

- **What is stored, and where.** Header profiles are stored in Chrome's
  local extension storage (`chrome.storage.local`) on your machine. Edits
  you have not saved yet are kept in Chrome's session storage
  (`chrome.storage.session`), in memory, until you save or cancel them;
  Chrome clears them when the browser restarts or the extension updates.
  There is no account, no sync, no backend, and no server operated by this
  extension.
- **What is sent, and where.** Request headers you configure are set,
  appended or removed by Chrome on requests to the domains you configured
  them for, and their subdomains. That is the extension's purpose, and it
  is the only way anything you enter leaves your machine. Response headers
  you configure change what your browser receives; they are not sent
  anywhere. The extension's own code makes no network requests of any kind.
- **No traffic observation.** HeaderWright uses only the
  `declarativeNetRequest` API: it hands rules to Chrome, and Chrome applies
  them. It does not request the `webRequest` permission and has no content
  scripts, so it receives no request, no response and no page content.
  This is verifiable from the extension's manifest.
- **No telemetry or analytics.**
- **Exports are user-initiated.** The export feature writes a JSON file to
  your device at your request. Note that header values you configure may
  include sensitive strings (such as tokens); they are stored in plaintext
  in the storage named above, as with comparable tools, and included in
  any file you choose to export.

Questions: https://github.com/antrixy/headerwright/issues
