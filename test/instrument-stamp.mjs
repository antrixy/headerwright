// instrument-stamp.mjs
// WHAT A RUNNING INSTRUMENT IS SERVING, stated by the process itself.
//
// FINDING-037. Both instrument gates in test/verify.mjs spawn their OWN server
// on a non-default port (8788, 8789) and kill it afterwards. The browser talks
// to 8787 and 8790. So a green `verify.mjs` says the tree on disk is
// consistent and says NOTHING about the process the browser is about to use.
// That gap has now cost three sittings: FINDING-032 was file-versus-route,
// FINDING-033 was route-versus-process, FINDING-037 is the same shape again
// with the ports made explicit, and on 2026-09-20 a fourth costume appeared —
// the gates dial 127.0.0.1 with a spoofed Host header, so a hostname that does
// not resolve is invisible to every gate and fatal to the browser.
//
// THE FIX IS NOT ANOTHER GATE. A gate cannot test a process it does not own.
// What it can do is make the process SELF-IDENTIFYING: each server hashes the
// files it actually loaded, at startup, and serves that digest at /whoami.
// Anything can then ask a live process which tree it came from and compare
// against what is on disk right now. test/preflight.mjs is the caller.
//
// THE DIGEST IS TAKEN AT STARTUP, DELIBERATELY. Reading the files per request
// would report what is on disk, not what the process is running — which is
// exactly the confusion being removed. `server.mjs` is evaluated once, so a
// pull cannot reach a running process, and the stamp has to inherit that same
// staleness to be worth anything.
//
// PER-FILE DIGESTS, not just a combined one. When a stamp mismatches, the
// useful question is immediately "which file", and a single hash cannot answer
// it. The combined digest is derived from the per-file list so the two cannot
// disagree.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Hash the files an instrument serves, as they are on disk at this moment.
 *
 * @param {string} dir  absolute directory the files live in
 * @param {string[]} names  file names, relative to dir
 * @returns {{combined: string, files: Record<string, string>}}
 *
 * A file that cannot be read is recorded as "MISSING" rather than thrown on:
 * a server whose page asset has been deleted is precisely the state worth
 * reporting, and a crash at startup would report it as "not running" instead,
 * which is a different and less useful diagnosis.
 */
export function stampFiles(dir, names) {
  const files = {};
  for (const name of [...names].sort()) {
    try {
      files[name] = createHash("sha256")
        .update(readFileSync(join(dir, name)))
        .digest("hex");
    } catch {
      files[name] = "MISSING";
    }
  }
  const combined = createHash("sha256")
    .update(Object.entries(files).map(([n, h]) => `${n}:${h}`).join("\n"))
    .digest("hex");
  return { combined, files };
}

/**
 * The body a server returns from /whoami.
 *
 * `pid` and `started` are included because FINDING-037's own entry records that
 * the provenance of a stale process was lost: it was killed before
 * `ps -o lstart` and `lsof -d cwd` could be run, so whether it predated the
 * pull can never be established. A process that reports its own pid and start
 * time cannot take that answer to the grave.
 */
export function stampBody(dir, names) {
  const { combined, files } = stampFiles(dir, names);
  return {
    digest: combined,
    files,
    pid: process.pid,
    started: new Date(Date.now() - Math.round(process.uptime() * 1000)).toISOString(),
    cwd: process.cwd(),
  };
}

/** Short form for a startup log line. Enough to eyeball, not to rely on. */
export function shortDigest(digest) {
  return digest.slice(0, 12);
}
