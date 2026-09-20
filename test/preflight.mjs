// preflight.mjs
// THE COMMAND TO RUN BEFORE CHROME. Checks the instrument processes the
// BROWSER will talk to, which is the one thing test/verify.mjs structurally
// cannot do.
//
// FINDING-037, and its three predecessors. `verify.mjs` spawns its own servers
// on 8788 and 8789 and kills them; the browser uses 8787 and 8790. A gate
// cannot test a process it does not own, so this file tests the processes
// nobody owns — by asking them what they are, running their own selfchecks
// against them, and resolving the hostnames the browser will actually use.
//
// THREE THINGS, AND THE ORDER IS THE POINT:
//
//   1. IS IT THERE, AND WHAT IS IT SERVING? /whoami returns a digest taken at
//      the process's startup. Compared against the files on disk right now. A
//      mismatch means a pull has landed that the running process never saw —
//      the exact state that produced a 404 on /index.mjs with all seven gates
//      green, twice.
//
//   2. DOES ITS OWN SELFCHECK PASS AGAINST *IT*? Not against a freshly spawned
//      copy. This is the row that makes a green tree mean something about the
//      instrument under test rather than about a sibling of it.
//
//   3. DO THE HOSTNAMES RESOLVE? Both selfchecks dial 127.0.0.1 and spoof the
//      Host header, so a missing /etc/hosts entry is invisible to every gate
//      and fatal to the browser, which does a real lookup. Sitting 2 found
//      both entries absent on a machine whose runbook called them "assumed
//      present"; on 2026-09-20 a curl to hw.test returned 000 and the hosts
//      file had to be ruled out by hand. This row rules it out by command.
//
// NOT A GATE IN verify.mjs, ON PURPOSE. It requires running servers and a
// hosts file, neither of which exists in CI, and a gate that skips is a gate
// that lies. It is a separate command with its own exit code, named in the
// runbook's before-Chrome checklist.
//
// Run:  node test/preflight.mjs
// Ports: ORACLE_PORT (default 8787), INITIATOR_PORT (default 8790).

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stampFiles } from "./instrument-stamp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const ORACLE_PORT = Number(process.env.ORACLE_PORT || 8787);
const INITIATOR_PORT = Number(process.env.INITIATOR_PORT || 8790);

const INSTRUMENTS = [
  {
    label: "oracle",
    dir: join(HERE, "oracle"),
    files: ["server.mjs", "index.html", "index.mjs", "diff.mjs"],
    port: ORACLE_PORT,
    selfcheck: "test/oracle/selfcheck.mjs",
    // The hostnames the BROWSER will type, not the loopback the gates dial.
    hosts: ["hw.test"],
  },
  {
    label: "initiator",
    dir: join(HERE, "initiator"),
    files: ["server.mjs", "index.html", "index.mjs"],
    port: INITIATOR_PORT,
    selfcheck: "test/initiator/selfcheck.mjs",
    hosts: ["hw.test", "nothw.test"],
  },
];

let failed = 0;
const notes = [];

function report(label, ok, detail) {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) {
    failed += 1;
    if (detail) for (const line of String(detail).split("\n")) console.log(`       ${line}`);
  }
}

async function checkInstrument(inst) {
  console.log(`\n${inst.label} — 127.0.0.1:${inst.port}`);

  // 1. Reachable, and serving which tree?
  let stamp = null;
  try {
    const res = await fetch(`http://127.0.0.1:${inst.port}/whoami`);
    if (!res.ok) throw new Error(`/whoami returned ${res.status}`);
    stamp = await res.json();
    report(`reachable — pid ${stamp.pid}, started ${stamp.started}`, true);
  } catch (e) {
    report("reachable", false,
      `${e.message}\nstart it:  node ${inst.selfcheck.replace("selfcheck", "server")} ${inst.port}\n` +
      `if it IS running, it predates the /whoami route and is therefore stale by definition — restart it`);
    return;
  }

  // 2. Does what it loaded match what is on disk NOW?
  const onDisk = stampFiles(inst.dir, inst.files);
  if (stamp.digest === onDisk.combined) {
    report(`serving the current tree (${onDisk.combined.slice(0, 12)})`, true);
  } else {
    const drifted = Object.keys(onDisk.files).filter(
      (n) => onDisk.files[n] !== (stamp.files || {})[n]
    );
    report("serving the current tree", false,
      `running ${String(stamp.digest).slice(0, 12)}, on disk ${onDisk.combined.slice(0, 12)}\n` +
      `differs in: ${drifted.join(", ") || "(file list itself changed)"}\n` +
      `server.mjs is evaluated once at startup — a pull cannot reach a running process. Restart it.`);
  }

  // 3. Its own selfcheck, against THIS process.
  const r = spawnSync("node", [inst.selfcheck], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ORACLE_PORT: String(inst.port) },
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const selfcheckOk = r.status === 0 && !out.includes("FAIL") && !out.includes("TRIPWIRE");
  report(`its own selfcheck passes against it — ${(out.match(/(\d+\/\d+) rows passed/) || [])[1] || "no row count"}`,
    selfcheckOk, selfcheckOk ? "" : out.trimEnd().split("\n").slice(-12).join("\n"));

  // 4. The hostnames the browser will use, resolved for real.
  for (const host of inst.hosts) {
    try {
      const res = await fetch(`http://${host}:${inst.port}/whoami`);
      const body = await res.json();
      const samePid = body.pid === stamp.pid;
      report(`${host}:${inst.port} resolves to this process`, res.ok && samePid,
        res.ok ? `answered with pid ${body.pid}, expected ${stamp.pid}` : `status ${res.status}`);
    } catch (e) {
      report(`${host}:${inst.port} resolves to this process`, false,
        `${e.message}\nadd to /etc/hosts:  127.0.0.1  ${host}\n` +
        `the selfchecks dial 127.0.0.1 with a spoofed Host header and cannot see this; the browser can`);
    }
  }
}

async function main() {
  console.log("HeaderWright preflight — the processes the BROWSER will use\n");
  console.log("test/verify.mjs checks the tree. This checks what is running.");

  for (const inst of INSTRUMENTS) {
    await checkInstrument(inst);
  }

  console.log();
  for (const n of notes) console.log(n);
  if (failed) {
    console.log(`PREFLIGHT FAILED — ${failed} check${failed === 1 ? "" : "s"}. Do not open Chrome.`);
    process.exit(1);
  }
  console.log("PREFLIGHT PASSES — the running instruments match this tree.");
  console.log("This says nothing about HeaderWright. It says the instruments are honest.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`preflight aborted: ${e.stack || e.message}`);
  process.exit(3);
});
