/**
 * Minimal SKILL.md frontmatter parser (agentskills.io standard).
 *
 * SKILL.md format:
 *
 *     ---
 *     name: my-skill
 *     description: One-line description.
 *     license: MIT
 *     allowed-tools: Read, Bash, Edit
 *     ---
 *
 *     # Body markdown
 *     Free-form instructions for the agent.
 *
 * We intentionally avoid `gray-matter` / `js-yaml` to keep the bundle
 * lean. The parser handles:
 *   · simple scalars (strings, with single/double quotes optional)
 *   · comma-separated lists (`allowed-tools: a, b, c` → string[])
 *   · YAML-style block lists:
 *         tags:
 *           - one
 *           - two
 *   · `key: |` block scalars (multi-line strings)
 *
 * Anything outside that grammar is returned as the raw string and left
 * for callers to interpret. Nested mappings are not supported.
 */

export interface SkillMdParsed {
  /** Parsed frontmatter as a string-keyed object. */
  frontmatter: Record<string, string | string[]>;
  /** Markdown body that follows the closing `---`. Trimmed. */
  body: string;
  /** True if the input started with a frontmatter block. */
  hasFrontmatter: boolean;
}

const FENCE_RE = /^---\s*\r?\n/;

export function parseSkillMd(input: string): SkillMdParsed {
  if (!FENCE_RE.test(input)) {
    return { frontmatter: {}, body: input.trim(), hasFrontmatter: false };
  }
  const afterOpen = input.replace(FENCE_RE, '');
  const closeIdx = afterOpen.search(/^---\s*$/m);
  if (closeIdx === -1) {
    return { frontmatter: {}, body: input.trim(), hasFrontmatter: false };
  }
  const yamlBlock = afterOpen.slice(0, closeIdx);
  const body = afterOpen.slice(closeIdx).replace(/^---\s*\r?\n?/, '').trim();
  const frontmatter = parseYamlSubset(yamlBlock);
  return { frontmatter, body, hasFrontmatter: true };
}

/**
 * Parse the YAML-subset used by agentskills.io. Not a general YAML
 * parser; only the shapes we need.
 */
function parseYamlSubset(src: string): Record<string, string | string[]> {
  const lines = src.split(/\r?\n/);
  const out: Record<string, string | string[]> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1]!;
    const rawValue = kv[2] ?? '';

    if (rawValue === '|' || rawValue === '|-' || rawValue === '|+') {
      const collected: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (next.length === 0) {
          collected.push('');
          i++;
          continue;
        }
        if (!/^\s/.test(next)) break;
        collected.push(next.replace(/^\s{2}/, ''));
        i++;
      }
      out[key] = collected.join('\n').trim();
      continue;
    }

    if (rawValue === '') {
      const list: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i] ?? '';
        const item = next.match(/^\s+-\s+(.*)$/);
        if (!item) break;
        list.push(stripQuotes(item[1]!.trim()));
        i++;
      }
      if (list.length > 0) {
        out[key] = list;
      } else {
        out[key] = '';
      }
      continue;
    }

    if (
      rawValue.includes(',') &&
      !(rawValue.startsWith('"') && rawValue.endsWith('"')) &&
      !(rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      out[key] = rawValue.split(',').map((s) => stripQuotes(s.trim())).filter(Boolean);
      i++;
      continue;
    }

    out[key] = stripQuotes(rawValue.trim());
    i++;
  }
  return out;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
