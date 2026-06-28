/**
 * `clihub init` helpers (v1.16.0).
 *
 *   - generateClihubYaml(opts)     → a clihub.yaml document (pure string)
 *   - scaffoldFromInstalled(opts)  → tools/skills inferred from this
 *     machine (installed CLIs) + project (recommend), for `init --from-installed`
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { listProviders } from '../tools/registry.js';
import { recommend } from '../recommend/index.js';
import { globalClihubYamlPath } from '../clihubyaml/index.js';

/** A skill entry: a bare id, or an id scoped to a single CLI via `tool`. */
export type SkillEntry = string | { id: string; tool?: string };

export interface GenerateYamlOpts {
  profile?: string;
  preset?: string;
  tools?: string[];
  skills?: SkillEntry[];
  /** MCP server ids to pin (default: none → `mcp: []`). */
  mcp?: string[];
  /** Prepend a yaml-language-server schema reference comment. */
  schema?: boolean;
}

export function generateClihubYaml(opts: GenerateYamlOpts = {}): string {
  const tools = opts.tools && opts.tools.length > 0 ? opts.tools : ['claude-code'];
  const skills = opts.skills ?? ['superpowers'];
  const out: string[] = [];

  if (opts.schema) out.push('# yaml-language-server: $schema=./clihub.schema.json');
  out.push('version: 1');
  if (opts.profile) out.push(`profile: ${opts.profile}`);

  out.push('', 'tools:');
  for (const t of tools) out.push(`  - ${t}`);

  out.push('');
  if (skills.length === 0) {
    out.push('skills: []');
  } else {
    out.push('skills:');
    for (const s of skills) {
      if (typeof s === 'string') { out.push(`  - ${s}`); continue; }
      if (s.tool) out.push(`  - id: ${s.id}`, `    tool: ${s.tool}`);
      else out.push(`  - ${s.id}`);
    }
  }

  out.push('');
  if (opts.preset) out.push('presets:', `  - ${opts.preset}`);
  else out.push('presets: []');

  out.push('');
  if (opts.mcp && opts.mcp.length > 0) {
    out.push('mcp:');
    for (const id of opts.mcp) out.push(`  - id: ${id}`);
  } else {
    out.push('mcp: []');
  }

  out.push('plugins: []', '');
  return out.join('\n');
}

/**
 * Ensure the global default clihub.yaml (`~/.config/clihub/clihub.yaml`) exists,
 * scaffolding a minimal one if absent. Idempotent — the GUI calls this on first
 * launch so a machine always resolves a config even outside any project.
 * Returns the path and whether it was just created.
 */
export async function ensureGlobalClihubYaml(): Promise<{ path: string; created: boolean }> {
  const target = globalClihubYamlPath();
  try {
    await fsp.access(target);
    return { path: target, created: false };
  } catch {
    /* missing — scaffold it below */
  }
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, generateClihubYaml(), 'utf8');
  return { path: target, created: true };
}

export interface ScaffoldOpts {
  cwd?: string;
}

export interface Scaffold {
  tools: string[];
  skills: string[];
}

/** Infer tools (installed CLIs) + skills (recommend) for this machine/project. */
export async function scaffoldFromInstalled(opts: ScaffoldOpts = {}): Promise<Scaffold> {
  const installed: string[] = [];
  for (const p of listProviders()) {
    if ((await p.detect()).installed) installed.push(p.id);
  }
  const tools = installed.length > 0 ? installed : ['claude-code'];

  const recs = await recommend({ cwd: opts.cwd });
  const skills = recs.filter((r) => r.kind === 'skill').slice(0, 6).map((r) => r.id);

  return { tools, skills: skills.length > 0 ? skills : ['superpowers'] };
}
