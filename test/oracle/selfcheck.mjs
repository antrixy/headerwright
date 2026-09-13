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
const EXPECTED_ROWS = 7;

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

async function observe({ id, caseName = "cors", tamper = null }) {
  const q = new URLSearchParams({ id, case: caseName });
  if (tamper) q.set("tamper", tamper);

  const echo = await fetch(`${BASE}/echo?${q}`);
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

  const p = await observe({ id: "t-add", tamper: "add" });
  check("ADD is detected",
    !p.diff.identical &&
      p.diff.added.some((c) => c.name === "x-hw-injected"),
    JSON.stringify(p.diff));

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
