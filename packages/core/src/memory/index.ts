/**
 * `clihub memory` engine (v0.7.0, Pillar: cross-CLI memory sync).
 *
 * Every AI CLI keeps its own "memory" / instructions file in a different
 * place and format. Users hand-copy the same rules into each one. This
 * module writes them ALL from a single source:
 *
 *   - resolveMemorySource(cwd) → find the canonical source file
 *   - planMemory(opts)         → read-only diff (MemoryPlanItem[])
 *   - generateMemory(opts)     → write each CLI's memory file
 *
 * Generated content is wrapped in a managed block so hand-written text
 * outside the markers survives regeneration.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getProvider } from '../tools/registry.js';

export const MEMORY_START =
  '<!-- clihub:start - managed by `clihub memory`; edit your source file instead -->';
export const MEMORY_END = '<!-- clihub:end -->';

export interface MemoryTarget {
  /** Provider id (matches the tool registry). */
  tool: string;
  /** Human label for output. */
  label: string;
  /** Project-scoped path, relative to the project root. */
  project: string;
  /** User-scoped absolute path (omitted = no user-level file for this CLI). */
  user?: string;
  /** Frontmatter body (without `---` fences) prepended at file top, e.g. Cursor .mdc. */
  frontmatter?: string;
}

/** Where each CLI reads its instructions. */
export const MEMORY_TARGETS: MemoryTarget[] = [
  {
    tool: 'claude-code',
    label: 'Claude Code',
    project: 'CLAUDE.md',
    user: path.join(os.homedir(), '.claude', 'CLAUDE.md'),
  },
  {
    tool: 'codex',
    label: 'Codex',
    project: 'AGENTS.md',
    user: path.join(os.homedir(), '.codex', 'AGENTS.md'),
  },
  {
    tool: 'gemini-cli',
    label: 'Gemini CLI',
    project: 'GEMINI.md',
    user: path.join(os.homedir(), '.gemini', 'GEMINI.md'),
  },
  {
    tool: 'qwen-code',
    label: 'Qwen Code',
    project: 'QWEN.md',
    user: path.join(os.homedir(), '.qwen', 'QWEN.md'),
  },
  {
    tool: 'cursor',
    label: 'Cursor',
    project: path.join('.cursor', 'rules', 'clihub.mdc'),
    frontmatter: 'description: clihub-managed project rules\nalwaysApply: true',
  },
  {
    tool: 'goose',
    label: 'Goose',
    project: '.goosehints',
    user: path.join(os.homedir(), '.config', 'goose', '.goosehints'),
  },
  {
    tool: 'kiro-cli',
    label: 'Kiro',
    project: path.join('.kiro', 'steering', 'clihub.md'),
  },
];

/** Source files we look for, in priority order. */
export const MEMORY_SOURCE_CANDIDATES = ['clihub.memory.md', 'AGENTS.md', 'CLAUDE.md'];

export interface MemorySource {
  file: string;
  body: string;
}

/** Find the canonical source: clihub.memory.md → AGENTS.md → CLAUDE.md. */
export async function resolveMemorySource(
  cwd = process.cwd(),
  explicit?: string,
): Promise<MemorySource | undefined> {
  const candidates = explicit ? [explicit] : MEMORY_SOURCE_CANDIDATES;
  for (const name of candidates) {
    const file = path.isAbsolute(name) ? name : path.join(cwd, name);
    try {
      let body = await fs.readFile(file, 'utf8');
      body = stripManagedBlock(stripFrontmatter(body)).trim();
      if (body) return { file, body };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return undefined;
}

function stripFrontmatter(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

/** Remove an existing managed block (used when a source file is also a target). */
export function stripManagedBlock(text: string): string {
  const s = text.indexOf(MEMORY_START);
  const e = text.indexOf(MEMORY_END);
  if (s !== -1 && e !== -1 && e > s) {
    return (text.slice(0, s) + text.slice(e + MEMORY_END.length)).trim();
  }
  return text;
}

/** Insert or replace the managed block in `existing`, preserving outside text. */
export function applyManagedBlock(existing: string, body: string): string {
  const block = `${MEMORY_START}\n${body.trim()}\n${MEMORY_END}`;
  const s = existing.indexOf(MEMORY_START);
  const e = existing.indexOf(MEMORY_END);
  if (s !== -1 && e !== -1 && e > s) {
    return existing.slice(0, s) + block + existing.slice(e + MEMORY_END.length);
  }
  const head = existing.replace(/\s+$/, '');
  return (head ? `${head}\n\n` : '') + block + '\n';
}

/** Compute the full file content a target should have for `body`. */
export function renderTarget(target: MemoryTarget, existing: string, body: string): string {
  if (target.frontmatter) {
    const fm = `---\n${target.frontmatter}\n---\n`;
    return fm + applyManagedBlock(stripFrontmatter(existing), body);
  }
  return applyManagedBlock(existing, body);
}

export type MemoryVerb = 'create' | 'update' | 'unchanged' | 'skip';

export interface MemoryPlanItem {
  tool: string;
  label: string;
  path: string;
  verb: MemoryVerb;
  detail?: string;
}

export interface MemoryOptions {
  cwd?: string;
  scope?: 'project' | 'user';
  /** Source markdown body (overrides resolveMemorySource). */
  body?: string;
  /** Explicit source filename. */
  source?: string;
  /** Include CLIs that are not installed (default: false → skip them). */
  all?: boolean;
}

function targetPath(target: MemoryTarget, scope: 'project' | 'user', cwd: string): string | undefined {
  if (scope === 'user') return target.user;
  return path.join(cwd, target.project);
}

async function readExisting(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

export async function planMemory(body: string, opts: MemoryOptions = {}): Promise<MemoryPlanItem[]> {
  const cwd = opts.cwd ?? process.cwd();
  const scope = opts.scope ?? 'project';
  const items: MemoryPlanItem[] = [];

  for (const target of MEMORY_TARGETS) {
    const file = targetPath(target, scope, cwd);
    if (!file) continue; // no file for this scope (e.g. cursor has no user file)

    if (!opts.all) {
      const provider = getProvider(target.tool);
      const det = provider ? await provider.detect() : { installed: false };
      if (!det.installed) {
        items.push({ tool: target.tool, label: target.label, path: file, verb: 'skip', detail: 'not installed' });
        continue;
      }
    }

    const existing = await readExisting(file);
    const next = renderTarget(target, existing ?? '', body);
    if (existing === undefined) items.push({ tool: target.tool, label: target.label, path: file, verb: 'create' });
    else if (existing === next) items.push({ tool: target.tool, label: target.label, path: file, verb: 'unchanged' });
    else items.push({ tool: target.tool, label: target.label, path: file, verb: 'update' });
  }
  return items;
}

export interface MemoryResult {
  written: MemoryPlanItem[];
  failed: Array<{ tool: string; path: string; error: string }>;
}

export async function generateMemory(body: string, opts: MemoryOptions = {}): Promise<MemoryResult> {
  const written: MemoryPlanItem[] = [];
  const failed: Array<{ tool: string; path: string; error: string }> = [];

  const plan = await planMemory(body, opts);
  for (const item of plan) {
    if (item.verb === 'skip' || item.verb === 'unchanged') {
      written.push(item);
      continue;
    }
    const target = MEMORY_TARGETS.find((m) => m.tool === item.tool)!;
    try {
      const existing = (await readExisting(item.path)) ?? '';
      const next = renderTarget(target, existing, body);
      await fs.mkdir(path.dirname(item.path), { recursive: true });
      const tmp = `${item.path}.tmp`;
      await fs.writeFile(tmp, next, 'utf8');
      await fs.rename(tmp, item.path);
      written.push(item);
    } catch (e) {
      failed.push({ tool: item.tool, path: item.path, error: String(e) });
    }
  }
  return { written, failed };
}
