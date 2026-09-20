// MUTATION TEST OF THE INSTRUMENT. Run this before trusting any oracle reading.
//
// Item 0 of the v0.2.0 roadmap: "deliberately set a rule that should change a
// response header, then a rule that should not, and confirm the oracle
// distinguishes them." This is that check, run headless — node's fetch stands
// in for the browser and the server's tamper parameter stands in for DNR, so
// the instrument can be falsified without Chrome and before any extension code
// exists.
//
// WHAT THIS DOES AND DOES NOT ESTABLISH. It establishes that the oracle
// reports a difference when one exists and reports none when none does. It
// establishes NOTHING about whether DNR modifies response headers on this
// codebase — that needs Chrome, this extension, and a real rule. Do not cite a
// green run here as evidence for the feature.
//
// STRUCTURALLY UNABLE TO PASS WITHOUT EVIDENCE (methodology lesson 4): the row
// count is asserted at the end, so a throw that skips rows fails rather than
// reporting zero failures, and an unreachable server fails loudly instead of
// producing an empty green run.
//
// Run:  node server.mjs &   then   node selfcheck.mjs

import { diffHeaders, unobservableAmong, UNOBSERVABLE } from "./diff.mjs";

const PORT = Number(process.env.ORACLE_PORT || 8787);
const BASE = `http://127.0.0.1:${PORT}`;
// Moves 10 -> 13 on 2026-09-20: the plain-case x-hw-removable floor row, the
// plain-case removal-detection row, and the refusal guard behind it. Bumped in
// the same edit that adds them — an unbumped tripwire fails the run, which is
// the design.
const EXPECTED_ROWS = 13;

let ran = 0;
let failed = 0;

function check(label, cond, detail = "") {
  ran++;
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

async function observe({ id, caseName = "cors", tamper = null, tamperHeader = null }) {
  const q = new URLSearchParams({ id, case: caseName });
  if (tamper) q.set("tamper", tamper);
  if (tamperHeader) q.set("tamperHeader", tamperHeader);

  const echo = await fetch(`${BASE}/echo?${q}`);
  if (!echo.ok) throw new Error(`/echo returned ${echo.status} for id=${id}`);
  const received = [...echo.headers.entries()];

  const sentRes = await fetch(`${BASE}/sent?id=${encodeURIComponent(id)}`);
  if (!sentRes.ok) throw new Error(`no sent-side record for id=${id}`);
  const { headers: sent, observed } = await sentRes.json();

  // Scope to the declared observed set so Node's own Date / Connection /
  // Content-Length are not reported as modifications.
  return { diff: diffHeaders(sent, received, observed), sent, received, observed };
}

async function main() {
  // Guard: the instrument must be connected before anything is measured.
  try {
    const ping = await fetch(`${BASE}/sent?id=__ping__`);
    if (ping.status !== 404) throw new Error(`unexpected status ${ping.status}`);
  } catch (e) {
    console.error(`oracle server not reachable at ${BASE} — ${e.message}`);
    console.error("start it first:  node server.mjs");
    process.exit(2);
  }

  console.log("instrument mutation test\n");

  // --- Control rows: nothing changed the response, diff must be empty. ---
  const a = await observe({ id: "clean-cors" });
  check("clean cors response diffs identical", a.diff.identical,
    JSON.stringify(a.diff));
  check("clean cors observed the CORS family",
    a.sent.some(([n]) => n.toLowerCase() === "access-control-allow-origin") &&
    a.received.some(([n]) => n.toLowerCase() === "access-control-allow-origin"),
    "same-origin exposure is the whole point; if this fails the oracle is blind");

  const b = await observe({ id: "clean-plain", caseName: "plain" });
  check("clean plain response diffs identical", b.diff.identical,
    JSON.stringify(b.diff));

  // FLOOR ROW for the removal reads. C8 and the E1/E3 rows that separate
  // FINDING-035's candidate mechanisms all turn on `x-hw-removable` being in
  // the plain case to begin with. If the fixture ever stops emitting it, BOTH
  // sides of the diff lose it at once, the verdict reads UNMODIFIED, and a
  // browser sitting records "remove did not apply" about a header that was
  // never there. Same shape as the CORS-family floor row above.
  check("the plain case emits x-hw-removable",
    b.sent.some(([n]) => n.toLowerCase() === "x-hw-removable") &&
      b.received.some(([n]) => n.toLowerCase() === "x-hw-removable"),
    "the removal rows measure this header; without it they are vacuous");

  // --- Mutant rows: a difference exists, the oracle MUST report it. ---
  const s = await observe({ id: "t-set", tamper: "set" });
  check("SET is detected as changed",
    !s.diff.identical &&
      s.diff.changed.some((c) => c.name === "x-hw-oracle" && c.received === "TAMPERED"),
    JSON.stringify(s.diff));

  const r = await observe({ id: "t-remove", tamper: "remove" });
  check("REMOVE is detected",
    !r.diff.identical &&
      r.diff.removed.some((c) => c.name === "x-hw-oracle"),
    JSON.stringify(r.diff));

  // THE ROW ABOVE IS NOT THE ROW C8 NEEDED. It removes x-hw-oracle from the
  // CORS case; C8 read x-hw-removable in the PLAIN case, and no gate had ever
  // exercised that pair. Until this row existed, a C8-shaped read of "present,
  // not removed" could not be separated from an instrument blind to that
  // removal — and the instrument has been the answer three times already
  // (FINDING-032, 033, 037).
  const rp = await observe({
    id: "t-remove-plain",
    caseName: "plain",
    tamper: "remove",
    tamperHeader: "x-hw-removable",
  });
  check("REMOVE of x-hw-removable is detected in the plain case",
    !rp.diff.identical &&
      rp.diff.removed.some((c) => c.name === "x-hw-removable"),
    JSON.stringify(rp.diff));

  // GUARD ON THE GUARD. The row above is only worth anything if a target the
  // case does not emit fails loudly rather than filtering nothing and reading
  // as "not detected".
  const typo = await fetch(
    `${BASE}/echo?id=t-typo&case=plain&tamper=remove&tamperHeader=x-hw-removeable`
  );
  check("a tamper target the case does not emit is refused",
    typo.status === 400,
    `status ${typo.status}`);

  const p = await observe({ id: "t-add", tamper: "add" });
  check("ADD is detected",
    !p.diff.identical &&
      p.diff.added.some((c) => c.name === "x-hw-injected"),
    JSON.stringify(p.diff));


  // --- FINDING-033: the page must be able to LOAD, not merely parse. ---
  //
  // Every row above talks to an endpoint. None of them asks the server for the
  // files the page itself pulls in, which is how a missing /index.mjs route
  // survived a green tree: the module was valid, exported what it should, and
  // 404ed in the browser. These three rows are one per assertion rather than
  // one per asset, so the tripwire count does not move when an asset is added.
  const pageRes = await fetch(`${BASE}/`, { headers: { Host: "hw.test" } });
  const pageHtml = await pageRes.text();
  check("the page itself is served", pageRes.ok && pageHtml.length > 0,
    `status ${pageRes.status}`);

  const refs = [...pageHtml.matchAll(/(?:src|href)="\.\/([^"]+)"/g)]
    .map((m) => m[1]);
  const fetched = [];
  for (const ref of refs) {
    const r = await fetch(`${BASE}/${ref}`, { headers: { Host: "hw.test" } });
    fetched.push({ ref, status: r.status, type: r.headers.get("content-type") || "" });
  }

  // An empty ref list would pass both rows below vacuously, so the floor is
  // asserted with them: this page references at least one asset.
  const bad = fetched.filter((f) => f.status !== 200);
  check("every asset the page references is served",
    refs.length > 0 && bad.length === 0,
    refs.length === 0 ? "no assets found in the served HTML" : JSON.stringify(bad));

  const wrongType = fetched.filter(
    (f) => f.ref.endsWith(".mjs") && !f.type.includes("javascript")
  );
  check("every module is served as JavaScript", wrongType.length === 0,
    JSON.stringify(wrongType));

  // --- The blind spot is declared, not discovered later. ---
  check("Set-Cookie is declared unobservable",
    UNOBSERVABLE.includes("set-cookie") &&
      unobservableAmong(["Set-Cookie", "X-Other"]).length === 1);

  // --- Tripwire. A skipped row must not read as success. ---
  console.log();
  if (ran !== EXPECTED_ROWS) {
    console.error(
      `TRIPWIRE: ran ${ran} rows, expected ${EXPECTED_ROWS}. ` +
        `A row was skipped or added — do not trust this run.`
    );
    process.exit(3);
  }
  console.log(`${ran - failed}/${ran} rows passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(`selfcheck aborted: ${e.stack || e.message}`);
  process.exit(3);
});
