// The comparison itself, in ONE place.
//
// The browser page and the headless self-check both import this. If the page
// had its own copy, the self-check would be proving something about code the
// browser never runs — which is the shape 9e warns about, and the reason this
// file exists separately rather than being inlined into index.html.
//
// Header names are compared case-insensitively (HTTP semantics, and Chrome
// canonicalises). Values are compared exactly: a whitespace difference in a
// response header is a real difference and must not be normalised away by the
// instrument.

export function normalise(pairs) {
  const map = new Map();
  for (const [name, value] of pairs) {
    map.set(String(name).toLowerCase(), String(value));
  }
  return map;
}

/**
 * Compare what the server recorded sending against what the browser received.
 *
 * `sent` and `received` are arrays of [name, value].
 * Returns { changed, added, removed, identical } — identical is a BOOLEAN and
 * is the only thing a caller should treat as "nothing happened".
 */
export function diffHeaders(sent, received, only = null) {
  const s = normalise(sent);
  const r = normalise(received);

  const inScope = (name) =>
    only === null || only.some((n) => n.toLowerCase() === name);

  const changed = [];
  const removed = [];
  const added = [];

  for (const [name, value] of s) {
    if (!inScope(name)) continue;
    if (!r.has(name)) {
      removed.push({ name, sent: value });
    } else if (r.get(name) !== value) {
      changed.push({ name, sent: value, received: r.get(name) });
    }
  }
  for (const [name, value] of r) {
    if (!inScope(name)) continue;
    if (!s.has(name)) added.push({ name, received: value });
  }

  const identical =
    changed.length === 0 && removed.length === 0 && added.length === 0;

  return { changed, added, removed, identical };
}

/**
 * Headers the instrument CANNOT see, so no claim may rest on them.
 *
 * Set-Cookie is stripped from fetch's Response.headers even same-origin, per
 * the Fetch spec. An empty diff for one of these means "not observed", never
 * "unmodified", and callers must render it as such rather than as a pass.
 */
export const UNOBSERVABLE = ["set-cookie"];

export function unobservableAmong(names) {
  return names.filter((n) => UNOBSERVABLE.includes(String(n).toLowerCase()));
}
