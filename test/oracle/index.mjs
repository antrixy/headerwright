// Response oracle — page module.
//
// EXTRACTED FROM index.html FOR TWO REASONS, both findings rather than tidiness.
//
// 1. SYNTAX GATE. test/verify.mjs walks .js and .mjs only, so an inline
//    <script type="module"> was outside every automated check. A syntax error
//    here would have broken the instrument silently while all seven gates
//    stayed green — and this page is where v0.2.0's evidence comes from.
//
// 2. INJECTION. The previous version built its results table with innerHTML
//    and template literals holding header NAMES and VALUES. A header value may
//    legally contain markup characters, and the values on this page are
//    supplied by the profile under test. So the subject of the experiment
//    could write DOM into the page certifying it — forging or hiding its own
//    result. Everything below uses createElement and textContent.
//
// The rule for anyone editing this file: measured data reaches the DOM through
// textContent, never through innerHTML or insertAdjacentHTML. The only
// permitted innerHTML is clearing a container to "".

import { diffHeaders, unobservableAmong } from "./diff.mjs";

const out = document.getElementById("out");

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function fail(message) {
  out.replaceChildren(
    el(
      "p",
      `MEASUREMENT FAILED — ${message}. ` +
        `This is not a "no change" result; nothing was observed.`,
      "verdict failed"
    )
  );
}

async function measure(caseName) {
  out.replaceChildren(el("p", "measuring…"));
  const id = `${caseName}-${Date.now()}`;

  let received, sent, observed;
  try {
    const echo = await fetch(`/echo?id=${id}&case=${caseName}`, {
      cache: "no-store",
    });
    received = [...echo.headers.entries()];

    const rec = await fetch(`/sent?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!rec.ok) throw new Error(`no sent-side record (${rec.status})`);
    ({ headers: sent, observed } = await rec.json());
  } catch (e) {
    // e.message can contain server-controlled text. It is rendered as text.
    fail(e.message);
    return;
  }

  const d = diffHeaders(sent, received, observed);
  const recvMap = new Map(received.map(([n, v]) => [n.toLowerCase(), v]));
  const sentMap = new Map(sent.map(([n, v]) => [n.toLowerCase(), v]));

  const names = [
    ...new Set([
      ...observed.map((n) => n.toLowerCase()),
      ...d.added.map((a) => a.name),
    ]),
  ].sort();

  const frag = document.createDocumentFragment();

  // Colour carries no verdict here — UNMODIFIED means opposite things in the
  // control and feature phases. The text is the result.
  frag.appendChild(
    el(
      "div",
      d.identical
        ? "UNMODIFIED — sent and received agree across the observed set."
        : `MODIFIED — ${d.changed.length} changed, ${d.removed.length} removed, ` +
          `${d.added.length} added.`,
      "verdict"
    )
  );

  const table = document.createElement("table");
  const head = document.createElement("tr");
  for (const label of ["header", "server sent", "browser received"]) {
    head.appendChild(el("th", label));
  }
  table.appendChild(head);

  for (const name of names) {
    const s = sentMap.has(name) ? sentMap.get(name) : "—";
    const r = recvMap.has(name) ? recvMap.get(name) : "—";
    const row = el("tr", undefined, s === r ? "same" : "diff");
    // THE THREE CELLS THAT USED TO BE INTERPOLATED INTO innerHTML. A header
    // value containing markup now renders as the characters it contains.
    row.appendChild(el("td", name));
    row.appendChild(el("td", s));
    row.appendChild(el("td", r));
    table.appendChild(row);
  }
  frag.appendChild(table);

  const blind = unobservableAmong(observed);
  if (blind.length) {
    frag.appendChild(
      el("p", `Not observable by this instrument: ${blind.join(", ")}.`, "note")
    );
  }

  out.replaceChildren(frag);
}

document.getElementById("cors").onclick = () => measure("cors");
document.getElementById("plain").onclick = () => measure("plain");
