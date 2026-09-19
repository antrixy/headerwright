// Instrument mutation test for the INITIATOR oracle.
//
// SAME ARGUMENT AS test/oracle/selfcheck.mjs, and it is not optional. A page
// that reports "the header was absent" is worthless unless it has been shown
// capable of reporting "the header was present" — otherwise a broken endpoint,
// a wrong header name, or a typo in the WATCHED list produces exactly the
// result HW-V6-01 predicts, and the prediction confirms itself.
//
// This runs WITHOUT Chrome. It drives the /echo endpoint directly over HTTP
// with and without the header, which is the only part of the chain this file
// can exercise. What it therefore does NOT prove is stated at the bottom, and
// that limit matters more than the rows that pass.
//
// Run:  node server.mjs 8790 &   then   node selfcheck.mjs
//       ORACLE_PORT overrides the port.

const PORT = Number(process.env.ORACLE_PORT || 8790);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function row(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

async function echo(headers, host = "hw.test") {
  const res = await fetch(`${BASE}/echo`, {
    headers: { Host: host, ...headers },
  });
  return res.json();
}

console.log("initiator oracle — instrument mutation test\n");

try {
  // BASELINE. No probe header sent, so the endpoint must report ABSENT. If
  // this row ever reports a value, something upstream is injecting headers and
  // every later row is measuring that instead.
  const clean = await echo({});
  row("a request without the probe reports ABSENT",
    clean.received["x-hw-probe"] === null,
    JSON.stringify(clean.received["x-hw-probe"]));

  // THE ROW THAT MAKES THE INSTRUMENT CREDIBLE. Send the header explicitly:
  // the endpoint must see it. Without this, "absent" is indistinguishable from
  // "this endpoint cannot see headers at all".
  const withProbe = await echo({ "X-HW-Probe": "present" });
  row("a request WITH the probe reports its value",
    withProbe.received["x-hw-probe"] === "present",
    JSON.stringify(withProbe.received["x-hw-probe"]));

  // Header names are case-insensitive on the wire; a browser or a DNR rule may
  // send any casing. An instrument that only matched one would report a real
  // header as absent.
  const oddCase = await echo({ "X-hW-pRoBe": "mixed" });
  row("header matching is case-insensitive",
    oddCase.received["x-hw-probe"] === "mixed");

  // The full name list is what a sitting reads when a header arrives that the
  // WATCHED list does not cover. If it were empty or truncated, an unexpected
  // header would be invisible.
  row("the full received-name list is reported",
    Array.isArray(withProbe.allReceivedNames) &&
    withProbe.allReceivedNames.includes("x-hw-probe"));


  // --- FINDING-033 / FINDING-034: the page must LOAD, and must not ship a
  // placeholder to the reader. Both defects were found in a browser, by eye,
  // on a tree where every gate was green. ---
  const pageRes = await fetch(`${BASE}/`, { headers: { Host: "hw.test" } });
  const pageHtml = await pageRes.text();
  row("the page itself is served", pageRes.ok && pageHtml.length > 0,
    `status ${pageRes.status}`);

  const refs = [...pageHtml.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => m[1]);
  const fetched = [];
  for (const ref of refs) {
    const r = await fetch(`${BASE}/${ref}`, { headers: { Host: "hw.test" } });
    fetched.push({ ref, status: r.status, type: r.headers.get("content-type") || "" });
  }

  const bad = fetched.filter((f) => f.status !== 200);
  row("every asset the page references is served",
    refs.length > 0 && bad.length === 0,
    refs.length === 0 ? "no assets found in the served HTML" : JSON.stringify(bad));

  const wrongType = fetched.filter(
    (f) => f.ref.endsWith(".mjs") && !f.type.includes("javascript")
  );
  row("every module is served as JavaScript", wrongType.length === 0,
    JSON.stringify(wrongType));

  row("no unsubstituted placeholder reaches the reader",
    !/__[A-Z][A-Z_]*__/.test(pageHtml),
    (pageHtml.match(/__[A-Z][A-Z_]*__/) || [""])[0]);

  // CORS must come from the SERVER. If it came from a HeaderWright rule the
  // page could not read the body whenever the extension was off — which is
  // exactly when the instrument is needed.
  const res = await fetch(`${BASE}/echo`, {
    headers: { Host: "hw.test", Origin: "http://nothw.test" },
  });
  row("the server sends its own Access-Control-Allow-Origin",
    res.headers.get("access-control-allow-origin") === "http://nothw.test");
  row("the server exposes response headers to script",
    res.headers.get("access-control-expose-headers") === "*");

  // The page distinguishes cross-origin from same-origin by whether an Origin
  // header arrived. If the endpoint did not echo it back, both rows would look
  // identical and the control would be worthless.
  const withOrigin = await res.json();
  row("the initiator origin is echoed back for cross-origin requests",
    withOrigin.initiatorOrigin === "http://nothw.test");
  row("no initiator origin is reported for a plain request",
    clean.initiatorOrigin === null);
} catch (err) {
  console.log(`\nMEASUREMENT FAILED — ${err.message}`);
  console.log("Is the server running?  node server.mjs 8790");
  process.exit(1);
}

console.log(`\n${passed}/${passed + failed} rows passed`);

// WHAT THIS DOES NOT PROVE, stated because a green selfcheck is the most
// likely thing to be over-read:
//
//   - It does not prove Chrome applies or refuses anything. Every row above
//     is Node talking to Node. The extension is not involved.
//   - It does not prove the two hosts resolve, that the browser treats them as
//     separate origins, or that a grant on one does not reach the other.
//   - It proves ONE thing: this endpoint can tell the presence of a request
//     header from its absence, and can tell a cross-origin request from a
//     same-origin one. That is the minimum for the browser rows to mean
//     anything, and it is not itself a result.
console.log(
  "\nInstrument only — no browser, no extension. A green run here says the " +
  "endpoint can report a difference, not that HeaderWright makes one."
);

process.exit(failed === 0 ? 0 : 1);
