// HeaderWright response-header ORACLE — server half.
//
// WHY THIS EXISTS AT ALL. The existing rig (postman-echo.com, httpbin.org)
// reflects REQUEST headers in a JSON body. It cannot report what the browser
// received after DNR rewrote a RESPONSE header. DevTools is not a fallback:
// DNR response-header modifications are not reliably visible in the Network
// tab even when they are applied.
//
// TWO PROPERTIES THIS SERVER EXISTS TO GUARANTEE:
//
// 1. SAME ORIGIN. A cross-origin fetch() exposes only CORS-safelisted response
//    headers to script unless the server sends Access-Control-Expose-Headers.
//    The v0.2.0 use case IS setting Access-Control-Allow-Origin and friends,
//    so a cross-origin oracle would be blind to exactly the header class under
//    test and would report "no change" as success. Page and endpoints are
//    served from one origin so no CORS filtering applies.
//
// 2. THE SENT-SIDE RECORD IS DNR-IMMUNE. A rule scoped to this origin reaches
//    every endpoint on it, so a record of "what the server sent" carried in a
//    response HEADER could itself be rewritten by the thing being measured.
//    modifyHeaders touches headers only, never bodies. The record therefore
//    travels in a response BODY, via /sent.
//
// Run:  node server.mjs [port]        default 8787
// Then: open http://127.0.0.1:8787/ in the profile with the extension loaded.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 8787);

// The header set under observation. Deliberately includes the CORS family,
// because that is the canonical v0.2.0 job, plus one ordinary custom header.
const CASES = {
  cors: [
    ["Access-Control-Allow-Origin", "https://origin.invalid"],
    ["Access-Control-Allow-Headers", "X-Baseline"],
    ["Access-Control-Allow-Methods", "GET"],
    ["X-HW-Oracle", "baseline"],
  ],
  plain: [
    ["X-HW-Oracle", "baseline"],
    ["X-HW-Second", "two"],
  ],
};

// Per-request record of what was actually emitted, keyed by the id the page
// supplies. Bounded so a long sitting cannot grow it without limit.
const sentLog = new Map();
const LOG_CAP = 500;

function record(id, rec) {
  if (sentLog.size >= LOG_CAP) sentLog.delete(sentLog.keys().next().value);
  sentLog.set(id, rec);
}

/**
 * TEST-ONLY. Makes the server EMIT something different from what it RECORDS,
 * simulating a DNR rewrite so the instrument can be checked WITHOUT Chrome.
 *
 * THE DIVERGENCE IS THE POINT. The sent-side record always holds the case's
 * base headers; only the emission is altered. A version of this that recorded
 * the altered set too would make sent and received agree in every row, and the
 * mutant rows would pass while proving nothing — which is the failure this
 * whole file exists to catch, and it was present in the first draft.
 *
 * Never used in a real measurement: a real measurement passes no tamper, and
 * the browser is what creates the difference.
 *
 * Returns { emitted, observed } — observed is the set of header names in
 * scope for the diff, so Node's own Date/Connection/Content-Length are not
 * mistaken for a modification.
 */
function applyTamper(pairs, tamper) {
  const observed = pairs.map(([n]) => n);
  if (!tamper) return { emitted: pairs, observed };

  const out = pairs.map(([n, v]) => [n, v]);
  if (tamper === "set") {
    const i = out.findIndex(([n]) => n.toLowerCase() === "x-hw-oracle");
    if (i >= 0) out[i] = [out[i][0], "TAMPERED"];
    return { emitted: out, observed };
  }
  if (tamper === "remove") {
    return {
      emitted: out.filter(([n]) => n.toLowerCase() !== "x-hw-oracle"),
      observed,
    };
  }
  if (tamper === "add") {
    out.push(["X-HW-Injected", "injected"]);
    return { emitted: out, observed: [...observed, "X-HW-Injected"] };
  }
  return { emitted: pairs, observed };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = await readFile(join(HERE, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (url.pathname === "/diff.mjs") {
    const js = await readFile(join(HERE, "diff.mjs"));
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    return res.end(js);
  }

  // The observed endpoint. Emits the case's headers; records what it emitted.
  if (url.pathname === "/echo") {
    const id = url.searchParams.get("id") || String(Date.now());
    const name = url.searchParams.get("case") || "cors";
    const base = CASES[name];
    if (!base) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: `unknown case "${name}"` }));
    }
    const { emitted, observed } = applyTamper(base, url.searchParams.get("tamper"));
    // RECORD THE BASE, EMIT THE TAMPERED. See applyTamper.
    record(id, { headers: base, observed });

    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    for (const [n, v] of emitted) headers[n] = v;
    res.writeHead(200, headers);
    return res.end(JSON.stringify({ id, case: name }));
  }

  // The DNR-immune channel. Body carries the sent-side record.
  if (url.pathname === "/sent") {
    const id = url.searchParams.get("id");
    const rec = sentLog.get(id);
    res.writeHead(rec ? 200 : 404, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    return res.end(
      JSON.stringify(rec ? { id, ...rec } : { error: "no record", id })
    );
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found\n");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`oracle on http://127.0.0.1:${PORT}/  cases: ${Object.keys(CASES).join(", ")}`);
});

export { CASES, PORT };
