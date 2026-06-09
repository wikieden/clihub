/**
 * `clihub apply` engine (v0.6.1, Pillar II).
 *
 * Converges the local machine to a `clihub.yaml`:
 *   - planApply(cfg)        → read-only diff (PlanItem[])
 *   - runApply(cfg)         → execute the plan
 *   - generateLockfile(cfg) → clihub.lock.json
 *   - readLockfile(path)    → parse a lockfile
 *
 * Reuses the same provider / adapter surface the CLI uses, so behaviour
 * matches `clihub tool/skill/plugin install`.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ClihubYamlConfig } from '../clihubyaml/full.js';
import { getProvider } from '../tools/registry.js';
import { CatalogLoader } from '../catalog/index.js';
import { ClaudeCodeSkillAdapter } from '../skill/index.js';
import { CodexSkillAdapter } from '../skill/codex-adapter.js';
import { KiroCliSkillAdapter } from '../skill/kiro-adapter.js';
import { GeminiCliSkillAdapter } from '../skill/gemini-adapter.js';
import { CursorSkillAdapter } from '../skill/cursor-adapter.js';
import { GooseSkillAdapter } from '../skill/goose-adapter.js';
import { ClaudeCodePluginAdapter } from '../plugin/index.js';
import { addMcp } from '../mcp/manage.js';
import { recordVersion } from '../version/index.js';
import { systemPromptHash } from '../sysprompt/index.js';
import type { SkillSyncAdapter } from '../tools/types.js';

const SKILL_ADAPTERS: Record<string, () => SkillSyncAdapter> = {
  'claude-code': () => new ClaudeCodeSkillAdapter(),
  'codex': () => new CodexSkillAdapter(),
  'kiro-cli': () => new KiroCliSkillAdapter(),
  'gemini-cli': () => new GeminiCliSkillAdapter(),
  'qwen-code': () => new GeminiCliSkillAdapter({ commandsDir: path.join(os.homedir(), '.qwen', 'commands'), geminiMd: path.join(os.homedir(), '.qwen', 'QWEN.md') }),
  'cursor': () => new CursorSkillAdapter(),
  'goose': () => new GooseSkillAdapter(),
};

export type PlanVerb = 'add' | 'skip' | 'upgrade' | 'missing';

export interface PlanItem {
  kind: 'tool' | 'skill' | 'preset' | 'mcp' | 'plugin';
  id: string;
  verb: PlanVerb;
  detail?: string;
}

export interface ApplyPlan {
  items: PlanItem[];
  add: number;
  upgrade: number;
  skip: number;
  missing: number;
}

export async function planApply(cfg: ClihubYamlConfig, loader = new CatalogLoader()): Promise<ApplyPlan> {
  const items: PlanItem[] = [];
  const catalog = await loader.load();

  for (const tool of cfg.tools) {
    const provider = getProvider(tool.id);
    if (!provider) { items.push({ kind: 'tool', id: tool.id, verb: 'missing', detail: 'unknown tool' }); continue; }
    const det = await provider.detect();
    if (!det.installed) items.push({ kind: 'tool', id: tool.id, verb: 'add', detail: tool.version ? `@${tool.version}` : 'latest' });
    else if (tool.version && det.version && tool.version !== det.version) items.push({ kind: 'tool', id: tool.id, verb: 'upgrade', detail: `${det.version} → ${tool.version}` });
    else items.push({ kind: 'tool', id: tool.id, verb: 'skip', detail: det.version });
  }

  for (const skill of cfg.skills) {
    const id = skill.id ?? skill.source ?? '';
    if (!id) continue;
    const known = skill.id ? catalog.skills.find((s) => s.id === skill.id) : true;
    if (!known && !skill.source) { items.push({ kind: 'skill', id, verb: 'missing', detail: 'not in catalog' }); continue; }
    items.push({ kind: 'skill', id, verb: 'add', detail: skill.tool });
  }

  for (const presetId of cfg.presets) {
    const preset = catalog.presets.find((p) => p.id === presetId);
    items.push({ kind: 'preset', id: presetId, verb: preset ? 'add' : 'missing' });
  }

  for (const mcp of cfg.mcp) {
    const id = mcp.id ?? '';
    if (!id) continue;
    const known = catalog.mcpServers.find((m) => m.id === id) || mcp.command || mcp.url;
    items.push({ kind: 'mcp', id, verb: known ? 'add' : 'missing' });
  }

  for (const plugin of cfg.plugins) {
    const known = catalog.plugins.find((p) => p.id === plugin.id);
    items.push({ kind: 'plugin', id: plugin.id, verb: known ? 'add' : 'missing' });
  }

  return {
    items,
    add: items.filter((i) => i.verb === 'add').length,
    upgrade: items.filter((i) => i.verb === 'upgrade').length,
    skip: items.filter((i) => i.verb === 'skip').length,
    missing: items.filter((i) => i.verb === 'missing').length,
  };
}

export interface ApplyResult {
  done: PlanItem[];
  failed: Array<PlanItem & { error: string }>;
}

export async function runApply(cfg: ClihubYamlConfig, loader = new CatalogLoader()): Promise<ApplyResult> {
  const catalog = await loader.load();
  const done: PlanItem[] = [];
  const failed: Array<PlanItem & { error: string }> = [];

  for (const tool of cfg.tools) {
    const provider = getProvider(tool.id);
    if (!provider) { failed.push({ kind: 'tool', id: tool.id, verb: 'missing', error: 'unknown tool' }); continue; }
    const det = await provider.detect();
    if (det.installed && (!tool.version || tool.version === det.version)) {
      done.push({ kind: 'tool', id: tool.id, verb: 'skip' });
      continue;
    }
    try {
      await provider.install({ version: tool.version, method: tool.method as never });
      const d2 = await provider.detect();
      await recordVersion(tool.id, { version: tool.version ?? d2.version ?? 'latest', method: tool.method ?? 'npm' });
      done.push({ kind: 'tool', id: tool.id, verb: det.installed ? 'upgrade' : 'add' });
    } catch (e) {
      failed.push({ kind: 'tool', id: tool.id, verb: 'add', error: String(e) });
    }
  }

  for (const skill of cfg.skills) {
    const manifest = skill.id ? catalog.skills.find((s) => s.id === skill.id) : undefined;
    if (!manifest) {
      // git-url / path skills are handled by the CLI's resolver, not here.
      continue;
    }
    const toolIds = skill.tool ? [skill.tool] : Object.keys(SKILL_ADAPTERS).filter((t) => manifest.supports[t]);
    for (const toolId of toolIds) {
      const factory = SKILL_ADAPTERS[toolId];
      const provider = getProvider(toolId);
      if (!factory || !provider) continue;
      const det = await provider.detect();
      if (!det.installed) continue;
      try {
        await factory().install(manifest, manifest.source);
        done.push({ kind: 'skill', id: `${manifest.id}@${toolId}`, verb: 'add' });
      } catch (e) {
        failed.push({ kind: 'skill', id: `${manifest.id}@${toolId}`, verb: 'add', error: String(e) });
      }
    }
  }

  for (const presetId of cfg.presets) {
    const preset = catalog.presets.find((p) => p.id === presetId);
    if (!preset) { failed.push({ kind: 'preset', id: presetId, verb: 'missing', error: 'unknown preset' }); continue; }
    done.push({ kind: 'preset', id: presetId, verb: 'add', detail: 'expand via catalog' });
  }

  for (const mcp of cfg.mcp) {
    const id = mcp.id ?? '';
    if (!id) continue;
    // Delegate to the single MCP source of truth (correct per-CLI file +
    // http/sse dialect): Claude Code → ~/.claude.json, Gemini → settings.json.
    const res = await addMcp(id, { command: mcp.command, url: mcp.url, transport: mcp.transport as never, loader });
    for (const d of res.done) done.push({ kind: 'mcp', id: d, verb: 'add' });
    for (const f of res.failed) {
      failed.push({ kind: 'mcp', id: f.tool === '-' ? id : `${id}@${f.tool}`, verb: f.tool === '-' ? 'missing' : 'add', error: f.error });
    }
  }

  for (const plugin of cfg.plugins) {
    const manifest = catalog.plugins.find((p) => p.id === plugin.id);
    if (!manifest) { failed.push({ kind: 'plugin', id: plugin.id, verb: 'missing', error: 'unknown plugin' }); continue; }
    try {
      await new ClaudeCodePluginAdapter().install(manifest);
      done.push({ kind: 'plugin', id: plugin.id, verb: 'add' });
    } catch (e) {
      failed.push({ kind: 'plugin', id: plugin.id, verb: 'add', error: String(e) });
    }
  }

  return { done, failed };
}

// ─── lockfile ─────────────────────────────────────────────────────────

export interface Lockfile {
  version: 1;
  generatedAt: string;
  source: string;
  clihub: string;
  tools: Record<string, { version: string; method?: string }>;
  skills: Record<string, { tools: string[] }>;
  mcp: Record<string, Record<string, never>>;
  plugins: Record<string, Record<string, never>>;
  /** Selected provider preset (forward-compat; populated by `provider switch`, v1.51+). */
  provider?: { id: string; baseURL?: string };
  /** sha256 of the resolved clihub.systemprompt.md body, if any (v1.60). */
  systemPromptHash?: string;
}

export async function generateLockfile(
  cfg: ClihubYamlConfig,
  clihubVersion: string,
  loader = new CatalogLoader(),
  opts: { cwd?: string } = {},
): Promise<Lockfile> {
  const catalog = await loader.load();
  const tools: Lockfile['tools'] = {};
  for (const tool of cfg.tools) {
    const provider = getProvider(tool.id);
    let version = tool.version ?? 'latest';
    if (provider) {
      const det = await provider.detect();
      version = tool.version ?? det.version ?? 'latest';
    }
    tools[tool.id] = { version, ...(tool.method ? { method: tool.method } : {}) };
  }
  const skills: Lockfile['skills'] = {};
  for (const skill of cfg.skills) {
    const id = skill.id ?? skill.source ?? '';
    if (!id) continue;
    const manifest = skill.id ? catalog.skills.find((s) => s.id === skill.id) : undefined;
    const toolIds = skill.tool ? [skill.tool] : manifest ? Object.keys(manifest.supports).filter((t) => manifest.supports[t]) : [];
    skills[id] = { tools: toolIds };
  }
  const mcp: Lockfile['mcp'] = {};
  for (const m of cfg.mcp) if (m.id) mcp[m.id] = {};
  const plugins: Lockfile['plugins'] = {};
  for (const p of cfg.plugins) plugins[p.id] = {};

  const promptHash = await systemPromptHash(opts.cwd);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'clihub.yaml',
    clihub: clihubVersion,
    tools,
    skills,
    mcp,
    plugins,
    ...(promptHash ? { systemPromptHash: promptHash } : {}),
  };
}

export async function writeLockfile(lock: Lockfile, file: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

/**
 * Build an apply config from a lockfile — the pinned source of truth for
 * `clihub install --frozen` (reproducible installs). Tool versions come from
 * the lock, not re-resolved from clihub.yaml.
 */
export function lockfileToConfig(lock: Lockfile): ClihubYamlConfig {
  return {
    version: 1,
    tools: Object.entries(lock.tools).map(([id, t]) => ({ id, version: t.version, method: t.method })),
    skills: Object.entries(lock.skills).flatMap(([id, s]) =>
      s.tools.length > 0 ? s.tools.map((tool) => ({ id, tool })) : [{ id }]),
    presets: [],
    mcp: Object.keys(lock.mcp).map((id) => ({ id })),
    plugins: Object.keys(lock.plugins).map((id) => ({ id })),
  };
}

export async function readLockfile(file: string): Promise<Lockfile | undefined> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as Lockfile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}
