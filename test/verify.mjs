// verify.mjs
// ONE COMMAND THAT RUNS EVERY GATE. Zero dependencies, like everything else.
//
// Why this exists, recorded plainly because the reason is embarrassing and
// therefore worth keeping: on 2026-09-13 two sessions added checks to
// selftest.mjs, ran mutate-collisions.py because handoffs/headerwright/NEXT.md
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

function run(label, cmd, args, opts = {}) {
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

console.log("HeaderWright verify — every gate, one command\n");

for (const [label, cmd, args] of GATES) run(label, cmd, args);

// Oracle: start the server, run the selfcheck against it, always stop it.
// The port is deliberately not the default, so a stray server left running
// from a browser sitting cannot answer for this one and turn a broken
// instrument into a pass.
const PORT = "8788";
const server = spawnSync("node", ["-e", `
  const { spawn } = require("node:child_process");
  const s = spawn("node", ["test/oracle/server.mjs", "${PORT}"], { cwd: ${JSON.stringify(ROOT)}, stdio: "ignore", detached: true });
  setTimeout(() => { console.log(s.pid); process.exit(0); }, 1200);
`], { cwd: ROOT, encoding: "utf8" });
const pid = parseInt((server.stdout || "").trim(), 10);
try {
  run("oracle-selfcheck", "node", ["test/oracle/selfcheck.mjs"], {
    env: { ...process.env, ORACLE_PORT: PORT },
  });
} finally {
  if (Number.isInteger(pid)) {
    try { process.kill(-pid); } catch { /* already gone */ }
    try { process.kill(pid); } catch { /* already gone */ }
  }
}

console.log(
  failed === 0
    ? "\nALL GATES PASS"
    : `\n${failed} GATE${failed === 1 ? "" : "S"} FAILED — the tree is not green`
);
process.exit(failed === 0 ? 0 : 1);
