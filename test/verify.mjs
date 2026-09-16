// verify.mjs
// ONE COMMAND THAT RUNS EVERY GATE. Zero dependencies, like everything else.
//
// Why this exists, recorded plainly because the reason is embarrassing and
// therefore worth keeping: on 2026-09-13 two sessions added checks to
// selftest.mjs, ran mutate-collisions.py because the handoff file in the private
// planning repo (antrixy/project-planning/handoffs/headerwright/NEXT.md)
// named that one in its FIRST ACTIONS list, and reported "the tree is green"
// twice. mutate-scans.py had been failing the whole time — its pinned
// string-scan count had drifted 7 -> 12 from those very additions. An external
// review found it, not the project.
//
// The failure was not laziness. It was that "run the tests" had no single
// referent: there are three mutation harnesses plus the oracle selfcheck plus
// the selftest, and a session confirms whichever ones the handoff happens to
// mention. A handoff is prose and prose goes stale; this file is a command.
//
// ANY NEW GATE GOES IN THE LIST BELOW IN THE SAME COMMIT that adds it. A gate
// that is not in this list is a gate that will be skipped by someone who
// believes they ran everything.

import { spawnSync } from "node:child_process";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The oracle selfcheck needs a server, so it is a two-step gate and is run
// separately below rather than being forced into this shape.
const GATES = [
  ["selftest", "node", ["test/selftest.mjs"]],
  ["mutate-collisions", "python3", ["test/mutate-collisions.py"]],
  ["mutate-grants", "python3", ["test/mutate-grants.py"]],
  ["mutate-scans", "python3", ["test/mutate-scans.py"]],
];

// A harness can exit 0 while printing a failure — mutate-*.py report drift in
// their summary lines rather than in their status code. Exit code alone is not
// the verdict, so the output is scanned for the phrases each harness uses to
// announce a problem. A gate passes only if BOTH agree.
const FAILURE_MARKERS = [
  "PATCH DID NOT APPLY",
  "ZERO-FAIL MUTATIONS",
  "CRASHING MUTATIONS",
  "MUTANTS NOT MATCHING EXPECT",
  "count tripwire",
  "checks FAILED",
];

let failed = 0;
// Counted as gates RUN, not derived from the GATES array — the syntax gate and
// the two instrument gates are not in that array, and the first version of
// this tally said 6 where the output showed 7. A number computed from the
// wrong source is the same defect as a number typed by hand.
let gatesRun = 0;

// ES-MODULE SYNTAX GATE. Nothing else in this project parses sw.js as code:
// selftest.mjs reads it as TEXT for source scans, and no harness imports it,
// because it calls chrome.* at module scope. So a syntax error in the SERVICE
// WORKER — the file whose failure means the extension does nothing at all —
// passed every gate. Demonstrated 2026-09-13 from external review.
//
// `node --check <file>` IS NOT THE RIGHT INSTRUMENT and silently is not.
// Measured on this repo: with a deliberate syntax error appended to sw.js,
// `node --check extension/background/sw.js` exits 0. These are ES modules in a
// tree with no package.json, so node's CommonJS-then-retry detection does not
// report the module parse failure. `node --input-type=module --check` reading
// the file on STDIN exits 1 on the same file. The obvious instrument reads
// clean on a broken file — the same shape as the oracle's CORS blindness.
function syntaxGate() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(mjs|js)$/.test(name)) files.push(rel);
    }
  };
  walk("extension");
  walk("test");

  gatesRun += 1;
  process.stdout.write(`${"module-syntax".padEnd(20)} `);
  const broken = [];
  for (const rel of files) {
    const r = spawnSync(process.execPath, ["--input-type=module", "--check"], {
      cwd: ROOT,
      input: readFileSync(join(ROOT, rel), "utf8"),
      encoding: "utf8",
    });
    if (r.status !== 0) broken.push([rel, (r.stderr || "").trim().split("\n")[0]]);
  }
  const ok = broken.length === 0;
  console.log(ok ? `PASS (${files.length} files)` : "FAIL");
  if (!ok) {
    failed += 1;
    for (const [rel, msg] of broken) console.log(`  ${rel}: ${msg}`);
  }
}

function run(label, cmd, args, opts = {}) {
  gatesRun += 1;
  process.stdout.write(`${label.padEnd(20)} `);
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const markers = FAILURE_MARKERS.filter((m) => out.includes(m));
  const ok = r.status === 0 && markers.length === 0;
  console.log(ok ? "PASS" : "FAIL");
  if (!ok) {
    failed += 1;
    if (r.status !== 0) console.log(`  exit status ${r.status}`);
    for (const m of markers) console.log(`  output contains: ${m}`);
    const tail = out.trimEnd().split("\n").slice(-12);
    for (const line of tail) console.log(`  | ${line}`);
  }
  return ok;
}

console.log("HeaderWright verify — every automated gate, one command\n");

// Syntax first: a file that does not parse makes every later result
// meaningless, and the source scans below would happily read it as text.
syntaxGate();

for (const [label, cmd, args] of GATES) run(label, cmd, args);

// Instrument selfchecks: start the server, run its selfcheck, always stop it.
//
// TWO INSTRUMENTS, TWO GATES, and they are separate for the reason the
// initiator oracle exists at all: test/oracle/ is same-origin by ruling, so
// initiator equals target there and every row passes whether or not
// HeaderWright models initiators. Folding them into one gate would let a green
// line stand for a property only one of them can see.
//
// Ports are deliberately NOT the defaults, so a stray server left running from
// a browser sitting cannot answer for these and turn a broken instrument into
// a pass.
function instrumentGate(label, serverPath, checkPath, port) {
  const started = spawnSync("node", ["-e", `
    const { spawn } = require("node:child_process");
    const s = spawn("node", ["${serverPath}", "${port}"], { cwd: ${JSON.stringify(ROOT)}, stdio: "ignore", detached: true });
    setTimeout(() => { console.log(s.pid); process.exit(0); }, 1200);
  `], { cwd: ROOT, encoding: "utf8" });
  const pid = parseInt((started.stdout || "").trim(), 10);
  try {
    run(label, "node", [checkPath], {
      env: { ...process.env, ORACLE_PORT: String(port) },
    });
  } finally {
    if (Number.isInteger(pid)) {
      try { process.kill(-pid); } catch { /* already gone */ }
      try { process.kill(pid); } catch { /* already gone */ }
    }
  }
}

instrumentGate("oracle-selfcheck",
  "test/oracle/server.mjs", "test/oracle/selfcheck.mjs", 8788);
// The initiator oracle's selfcheck talks to 127.0.0.1 directly and does NOT
// need hw.test / nothw.test to resolve — the hosts file only matters for the
// browser rows. So this gate runs anywhere, including CI.
instrumentGate("initiator-selfcheck",
  "test/initiator/server.mjs", "test/initiator/selfcheck.mjs", 8789);

// "AUTOMATED" IS LOAD-BEARING, NOT MODESTY. Every gate above runs in Node
// against source or pure functions. NOTHING HERE TOUCHES A BROWSER: no rule
// reaches Chrome, no header reaches the wire, no popup renders. The oracle
// selfcheck proves the INSTRUMENT can detect a difference; it does not prove
// HeaderWright makes one. A green run here means the tree is internally
// consistent, which is a precondition for a release and not evidence of one.
// The browser rows in antrixy/project-planning/handoffs/headerwright/NEXT.md
// are the other half.
// COUNTS ARE PRINTED, NOT MAINTAINED BY HAND. Twice now a hand-written total
// has gone stale and been quoted as fact: the triage ledger stated a row count
// that disagreed with its own table, and the v0.2 runbook said "79 mutants"
// when three harnesses hold 90 scenarios. Prose cannot be kept in sync with a
// tree; a command can print what is actually there. Quote this line rather
// than a number typed into a document.
const tally = [];
try {
  const checks = readFileSync(join(ROOT, "test/selftest.mjs"), "utf8")
    .match(/^const EXPECTED_CHECKS = (\d+);/m);
  if (checks) tally.push(`${checks[1]} checks`);
  let mutants = 0;
  for (const file of ["mutate-collisions", "mutate-grants", "mutate-scans"]) {
    mutants += (readFileSync(join(ROOT, `test/${file}.py`), "utf8")
      .match(/^ {4}\("/gm) || []).length;
  }
  tally.push(`${mutants} mutation scenarios`);
  tally.push(`${gatesRun} gates`);
} catch { /* the tally is reporting, never a gate */ }
if (tally.length) console.log(`\ntree: ${tally.join(", ")}`);

console.log(
  failed === 0
    ? "\nALL AUTOMATED GATES PASS — no browser evidence is included"
    : `\n${failed} GATE${failed === 1 ? "" : "S"} FAILED — the tree is not green`
);
process.exit(failed === 0 ? 0 : 1);
