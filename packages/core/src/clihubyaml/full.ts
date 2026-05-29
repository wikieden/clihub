/**
 * Full(er) `clihub.yaml` parser for `clihub apply` (v0.6.1).
 *
 * Still dependency-free. Handles the subset the documented schema needs:
 *   - top-level scalars            (version, profile)
 *   - scalar lists                 (tools: [- a, - b]) or (- "id")
 *   - lists of single-level maps   (skills: [- {id, tool, source}])
 *
 * It does NOT handle deep nesting, anchors, flow syntax, or block
 * scalars. Anything it can't model is ignored rather than erroring, so
 * a forward-compatible file still applies its known keys.
 */

export interface YamlToolEntry {
  id: string;
  version?: string;
  method?: string;
}

export interface YamlSkillEntry {
  id?: string;
  source?: string;
  tool?: string;
}

export interface YamlMcpEntry {
  id?: string;
  transport?: string;
  url?: string;
  command?: string;
}

export interface YamlPluginEntry {
  id: string;
  tool?: string;
  branch?: string;
}

export interface ClihubYamlConfig {
  version?: number;
  profile?: string;
  tools: YamlToolEntry[];
  skills: YamlSkillEntry[];
  presets: string[];
  mcp: YamlMcpEntry[];
  plugins: YamlPluginEntry[];
  proxy?: { inherit?: boolean; http?: string; https?: string; noProxy?: string };
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

interface Line {
  indent: number;
  text: string;
}

function tokenize(input: string): Line[] {
  const out: Line[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const noComment = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    if (!noComment.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    out.push({ indent, text: noComment.trim() });
  }
  return out;
}

/** Parse a `- ...` list under `key:` (lines deeper than baseIndent). */
function parseList(lines: Line[], start: number, baseIndent: number): { items: Array<string | Record<string, string>>; next: number } {
  const items: Array<string | Record<string, string>> = [];
  let i = start;
  while (i < lines.length && lines[i]!.indent > baseIndent) {
    const line = lines[i]!;
    if (!line.text.startsWith('- ')) { i++; continue; }
    const itemIndent = line.indent;
    const first = line.text.slice(2).trim();
    const kvMatch = first.match(/^([\w.-]+)\s*:\s*(.*)$/);
    if (kvMatch) {
      const map: Record<string, string> = {};
      map[kvMatch[1]!] = stripQuotes(kvMatch[2] ?? '');
      i++;
      while (i < lines.length && lines[i]!.indent > itemIndent && !lines[i]!.text.startsWith('- ')) {
        const cont = lines[i]!.text.match(/^([\w.-]+)\s*:\s*(.*)$/);
        if (cont) map[cont[1]!] = stripQuotes(cont[2] ?? '');
        i++;
      }
      items.push(map);
    } else {
      items.push(stripQuotes(first));
      i++;
    }
  }
  return { items, next: i };
}

export function parseClihubYaml(input: string): ClihubYamlConfig {
  const lines = tokenize(input);
  const cfg: ClihubYamlConfig = {
    tools: [], skills: [], presets: [], mcp: [], plugins: [],
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent !== 0) { i++; continue; }
    const m = line.text.match(/^([\w.-]+)\s*:\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1]!;
    const inline = (m[2] ?? '').trim();

    if (inline) {
      switch (key) {
        case 'version': cfg.version = Number(stripQuotes(inline)) || undefined; break;
        case 'profile': cfg.profile = stripQuotes(inline); break;
        default: break;
      }
      i++;
      continue;
    }

    const { items, next } = parseList(lines, i + 1, 0);
    i = next;
    switch (key) {
      case 'tools':
        cfg.tools = items.map((it) =>
          typeof it === 'string' ? { id: it } : { id: it.id ?? '', version: it.version, method: it.method },
        ).filter((t) => t.id);
        break;
      case 'skills':
        cfg.skills = items.map((it) =>
          typeof it === 'string' ? { id: it } : { id: it.id, source: it.source, tool: it.tool },
        );
        break;
      case 'presets':
        cfg.presets = items.map((it) => (typeof it === 'string' ? it : it.id ?? '')).filter(Boolean);
        break;
      case 'mcp':
        cfg.mcp = items.map((it) =>
          typeof it === 'string' ? { id: it } : { id: it.id, transport: it.transport, url: it.url, command: it.command },
        );
        break;
      case 'plugins':
        cfg.plugins = items.map((it) =>
          typeof it === 'string' ? { id: it } : { id: it.id ?? '', tool: it.tool, branch: it.branch },
        ).filter((p) => p.id);
        break;
      case 'proxy': {
        const proxy: ClihubYamlConfig['proxy'] = {};
        for (const it of items) {
          if (typeof it === 'object') {
            if ('inherit' in it) proxy.inherit = it.inherit === 'true';
            if ('http' in it) proxy.http = it.http;
            if ('https' in it) proxy.https = it.https;
            if ('noProxy' in it) proxy.noProxy = it.noProxy;
          }
        }
        cfg.proxy = proxy;
        break;
      }
      default:
        break;
    }
  }
  return cfg;
}
