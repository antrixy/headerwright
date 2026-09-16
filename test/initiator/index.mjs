// Initiator oracle — page module.
//
// EXTERNALIZED FOR THE SYNTAX GATE. test/verify.mjs walks .js and .mjs only,
// so an inline module script is unchecked — a syntax error here would break
// the only instrument that can see HW-V6-01 while every gate stayed green.
//
// This page already rendered measured data with createElement/textContent
// rather than innerHTML, which is why it was not part of the injection
// finding. Keep it that way: header values on this page come from the profile
// under test, and a subject able to write DOM into its own certificate can
// forge the result.
  const TARGET = document.getElementById("targetOrigin").textContent;
  const out = document.getElementById("out");

  document.getElementById("run").addEventListener("click", async () => {
    out.innerHTML = "";
    let data;
    try {
      const res = await fetch(`${TARGET}/echo?t=${Date.now()}`, {
        cache: "no-store",
      });
      data = await res.json();
    } catch (err) {
      // NOT A NULL RESULT. A failed fetch says nothing about headers, and
      // rendering it as "absent" would manufacture a confirmation of the very
      // thing this page is testing.
      const p = document.createElement("p");
      p.className = "verdict failed";
      p.textContent =
        `MEASUREMENT FAILED — ${err.message}. Nothing was observed. ` +
        `This is not evidence that the header was absent.`;
      out.appendChild(p);
      return;
    }

    const sameOrigin = data.initiatorOrigin === null;
    const rows = Object.entries(data.received);

    const verdict = document.createElement("div");
    verdict.className = "verdict";
    verdict.textContent =
      `${sameOrigin ? "SAME-ORIGIN" : "CROSS-ORIGIN"} — page on ` +
      `${location.host}, target ${data.servedBy}, ` +
      `initiator origin ${data.initiatorOrigin ?? "(none sent — same origin)"}.`;
    out.appendChild(verdict);

    const list = document.createElement("ul");
    for (const [name, value] of rows) {
      const li = document.createElement("li");
      // textContent throughout: these values come from whatever the browser
      // sent, which includes anything a HeaderWright profile put there. The
      // other oracle used innerHTML for its table and that was a real finding
      // (HW-V6-16) — an instrument a test subject can inject markup into can
      // be made to lie about its own result.
      li.textContent =
        `${name}: ${value === null ? "ABSENT" : JSON.stringify(value)}`;
      list.appendChild(li);
    }
    out.appendChild(list);

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(data, null, 2);
    out.appendChild(pre);
  });
