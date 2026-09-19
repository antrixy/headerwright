// HeaderWright INITIATOR oracle — server half.
//
// A SECOND INSTRUMENT, NOT AN EXTENSION OF test/oracle/. The response-header
// oracle is same-origin BY RULING, and correctly so: cross-origin fetch()
// cannot see Access-Control-Allow-Origin without Access-Control-Expose-Headers,
// and that header is the canonical v0.2.0 job. But same-origin means the
// INITIATOR EQUALS THE TARGET, so one host grant satisfies both halves of
// Chrome's requirement and every row there passes whether or not HeaderWright
// models initiators at all.
//
// That is the blindness this file exists to remove. HW-V6-01 says Chrome
// requires host permission for the request URL AND its initiator, for
// everything except main_frame and sub_frame. HeaderWright grants only the
// target. The claim has never been observed — only read in documentation and
// inferred from the absence of the word "initiator" in the source.
//
// WHAT MAKES THIS MEASURABLE, and it is the mirror image of the other oracle:
//
// 1. TWO ORIGINS, DELIBERATELY. The page runs on one host and fetches another.
//    Both resolve to 127.0.0.1 through the hosts file, so one process serves
//    both and the Host header decides which role it is playing.
//
// 2. THE MEASUREMENT IS ON THE REQUEST SIDE, so CORS response filtering cannot
//    blind it. The target reports WHAT IT RECEIVED, in a response BODY.
//    modifyHeaders touches headers only, never bodies — the same DNR-immunity
//    argument the other oracle uses for /sent.
//
// 3. THE TARGET SENDS CORS ITSELF. Access-Control-Allow-Origin and
//    Access-Control-Expose-Headers come from this server, not from a
//    HeaderWright rule, so the fetch succeeds and the body is readable
//    regardless of whether the extension is doing anything. An instrument that
//    needed the feature under test in order to report is not an instrument.
//
// 4. A SAME-ORIGIN CONTROL RUNS IN THE SAME SITTING. Without it, "the header
//    did not arrive" cannot be distinguished from "HeaderWright is not working
//    at all" — and those call for opposite responses.
//
// SETUP. Both names must resolve locally. On macOS, in /etc/hosts:
//     127.0.0.1  hw.test
//     127.0.0.1  nothw.test
// hw.test and nothw.test are already the fixture pair used in sitting G, and
// they are deliberately NOT subdomains of each other — a grant on one does not
// reach the other, which is the whole experiment.
//
// Run:  node server.mjs [port]          default 8790
// Then: open http://nothw.test:8790/    (cross-origin row)
//       open http://hw.test:8790/       (same-origin control)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 8790);

// The host that plays TARGET. A HeaderWright profile is scoped to this name,
// and the question is whether its headers arrive here.
export const TARGET_HOST = "hw.test";
// The host that plays INITIATOR. Not a subdomain of the target, so granting
// the target does not grant this.
export const INITIATOR_HOST = "nothw.test";

// Request headers the page asks about. Everything else the browser sends is
// noise for this measurement.
const WATCHED = ["x-hw-probe", "x-hw-second", "authorization"];

function hostOf(req) {
  return String(req.headers.host || "").split(":")[0];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const host = hostOf(req);

  // THE MEASUREMENT ENDPOINT. Reports what THIS SERVER RECEIVED, in the body.
  //
  // Served from any host so the same page code works for both the cross-origin
  // row and the same-origin control — the only difference between them is
  // which origin the page was loaded from, which is exactly the variable under
  // test and must be the ONLY one.
  if (url.pathname === "/echo") {
    const seen = {};
    for (const name of WATCHED) {
      seen[name] = Object.prototype.hasOwnProperty.call(req.headers, name)
        ? req.headers[name]
        : null;
    }
    const body = JSON.stringify(
      {
        servedBy: host,
        // Echoed back so the page can prove the request actually crossed
        // origins rather than being served from its own host by mistake.
        initiatorOrigin: req.headers.origin || null,
        received: seen,
        // Every header name received, so a sitting can spot something the
        // WATCHED list does not cover without editing this file first.
        allReceivedNames: Object.keys(req.headers).sort(),
      },
      null,
      2
    );

    // CORS FROM THE SERVER, NOT FROM A RULE. If these came from HeaderWright
    // the instrument would report nothing whenever the extension was off or
    // broken, which is precisely when it needs to report.
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Expose-Headers": "*",
      "Cache-Control": "no-store",
    });
    return res.end(body);
  }

  // FINDING-033: see test/oracle/server.mjs. This instrument is the only one
  // that can observe HW-V6-01, and it could not serve its own JavaScript.
  if (url.pathname === "/index.mjs") {
    const js = await readFile(join(HERE, "index.mjs"), "utf8");
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return res.end(js);
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = await readFile(join(HERE, "index.html"), "utf8");
    // The page needs to know which role its own origin is playing, and where
    // to aim the cross-origin fetch. Injected rather than hardcoded so the
    // port can move without editing HTML.
    // FINDING-034: replace() with a string pattern substitutes the FIRST
    // occurrence only. __TARGET_ORIGIN__ appears twice in index.html, so the
    // second one shipped to the reader as a literal token telling them to
    // open the page on "__TARGET_ORIGIN__".
    const injected = html
      .replaceAll("__TARGET_ORIGIN__", `http://${TARGET_HOST}:${PORT}`)
      .replaceAll("__INITIATOR_ORIGIN__", `http://${INITIATOR_HOST}:${PORT}`)
      .replaceAll("__THIS_HOST__", host);

    // A placeholder nobody wired up is a bug in the page's instructions, and
    // the reader is the last one who should find it. Fail loudly instead.
    const leftover = injected.match(/__[A-Z][A-Z_]*__/);
    if (leftover) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(
        `unsubstituted placeholder ${leftover[0]} in index.html — ` +
          `add it to the injection list in server.mjs`
      );
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return res.end(injected);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

// Bind to loopback only. Both fixture hosts resolve there, and an instrument
// that answered on a LAN interface could be reached by something other than
// the browser under test.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`initiator oracle on 127.0.0.1:${PORT}`);
  console.log(`  cross-origin row : http://${INITIATOR_HOST}:${PORT}/`);
  console.log(`  same-origin ctrl : http://${TARGET_HOST}:${PORT}/`);
  console.log(`  both names must resolve to 127.0.0.1 in /etc/hosts`);
});
