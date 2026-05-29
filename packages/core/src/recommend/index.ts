/**
 * `clihub recommend` (v1.10.0, newcomer discovery).
 *
 * Answers "what should I add?" by combining two read-only signals:
 *   - which CLIs are installed (provider detection)
 *   - what the current project looks like (files in cwd → tags)
 *
 * and matching them against the catalog. Suggestions are advisory; they
 * may already be installed — `recommend` never writes anything.
 */
import { promises as fs } from 'node:fs';
import { listProviders, getProvider } from '../tools/registry.js';
import { CatalogLoader } from '../catalog/index.js';

export type RecommendKind = 'preset' | 'skill' | 'mcp';

export interface Recommendation {
  kind: RecommendKind;
  id: string;
  name: string;
  reason: string;
  command: string;
}

export interface RecommendOptions {
  cwd?: string;
  loader?: CatalogLoader;
}

/** Map a project's files to coarse capability tags. */
export async function detectProjectSignals(cwd: string): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(cwd);
  } catch {
    return [];
  }
  const has = (name: string) => entries.includes(name);
  const hasExt = (ext: string) => entries.some((e) => e.endsWith(ext));
  const tags = new Set<string>();

  if (has('package.json')) { tags.add('frontend'); tags.add('backend'); tags.add('api'); tags.add('test'); }
  if (has('tsconfig.json') || hasExt('.ts')) tags.add('typescript');
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) tags.add('python');
  if (has('go.mod')) tags.add('go');
  if (has('Cargo.toml')) tags.add('rust');
  if (has('Dockerfile') || entries.some((e) => e.startsWith('docker-compose'))) tags.add('docker');
  if (has('schema.prisma') || has('prisma') || has('migrations')) tags.add('database');
  if (hasExt('.tf')) tags.add('infra');
  if (has('.git')) { tags.add('git'); tags.add('review'); }

  return [...tags];
}

function matchesSignals(haystack: string[], idAndName: string, signals: string[]): boolean {
  const hay = [...haystack.map((t) => t.toLowerCase()), idAndName.toLowerCase()].join(' ');
  return signals.some((s) => hay.includes(s));
}

export async function recommend(opts: RecommendOptions = {}): Promise<Recommendation[]> {
  const cwd = opts.cwd ?? process.cwd();
  const loader = opts.loader ?? new CatalogLoader();
  const catalog = await loader.load();
  const signals = await detectProjectSignals(cwd);

  // which CLIs are installed?
  const installed: string[] = [];
  for (const p of listProviders()) {
    if ((await p.detect()).installed) installed.push(p.id);
  }
  const supportsInstalled = (s: { supports: Record<string, boolean | undefined> }) =>
    installed.length === 0 || installed.some((t) => s.supports[t]);

  const out: Recommendation[] = [];

  // 1. No CLI yet → start here.
  if (installed.length === 0) {
    out.push({ kind: 'preset', id: 'starter', name: 'starter', reason: 'no AI CLI detected — fastest way to a working setup', command: 'clihub preset apply starter' });
  } else {
    // preset whose tools are all installed → worth applying wholesale
    for (const preset of catalog.presets) {
      const covered = preset.tools.filter((t) => installed.includes(t)).length;
      if (covered >= 2 && covered === preset.tools.length) {
        out.push({ kind: 'preset', id: preset.id, name: preset.name, reason: `covers your installed CLIs (${preset.tools.join(', ')})`, command: `clihub preset apply ${preset.id}` });
      }
    }
  }

  // 2. Skills: support an installed CLI, ranked by project-signal match then preset membership.
  const inPreset = new Set(catalog.presets.flatMap((p) => p.skills));
  const scored = catalog.skills
    .filter(supportsInstalled)
    .map((s) => {
      const sigMatch = matchesSignals(s.tags, `${s.id} ${s.name}`, signals);
      const score = (sigMatch ? 2 : 0) + (inPreset.has(s.id) ? 1 : 0);
      const reason = sigMatch
        ? `matches this project (${signals.join(', ')})`
        : inPreset.has(s.id)
          ? 'part of a core preset — broadly useful'
          : '';
      return { s, score, reason };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  for (const { s, reason } of scored) {
    out.push({ kind: 'skill', id: s.id, name: s.name, reason, command: `clihub skill install ${s.id}` });
  }

  // MCP servers that match the project are surfaced as a hint only — there
  // is no standalone `clihub mcp install` yet (planned v1.12); today MCP is
  // added via a preset or the TUI. We point at the TUI rather than emit a
  // command that doesn't exist.
  for (const m of catalog.mcpServers.filter(supportsInstalled)) {
    if (signals.length > 0 && matchesSignals(m.tags ?? [], `${m.id} ${m.name}`, signals)) {
      out.push({ kind: 'mcp', id: m.id, name: m.name, reason: `relevant to this project — add via the TUI (clihub → pick a CLI → MCP)`, command: 'clihub' });
    }
  }

  return out;
}
