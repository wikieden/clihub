/**
 * Minimal JSONC parser — opencode config files (`opencode.json`/`.jsonc`)
 * tolerate `//` and `/* *​/` comments plus trailing commas, so a strict
 * `JSON.parse` rejects valid user configs. This strips comments OUTSIDE
 * string literals (string-aware scan) and trailing commas, then parses.
 *
 * Note: writers that round-trip through this lose comments — callers
 * snapshot the original file before writing (snapshotBeforeWrite).
 */
export function parseJsonc(raw: string): unknown {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < raw.length) {
    const c = raw[i];
    if (inString) {
      out += c;
      if (c === '\\') {
        // keep the escaped char verbatim (covers \" and \\)
        if (i + 1 < raw.length) out += raw[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && raw[i + 1] === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  // trailing commas: `,}` / `,]` (whitespace between is legal)
  out = out.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(out);
}
