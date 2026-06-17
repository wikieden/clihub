/**
 * `clihub usage` — read-only token rollup across CLIs (v1.56).
 *
 * Honesty: each CLI's local usage/telemetry format is undocumented and drifts
 * between vendor releases. So this is **tokens-only, never a dollar figure**,
 * and we ship a parser ONLY for the format we are confident about (Claude Code's
 * session JSONL — the same `message.usage.*` shape ccusage reads). Every other
 * CLI returns `supported: false` with a note rather than a fabricated number.
 * Parsers are defensive: unparseable lines are skipped, missing files → a row
 * with `supported: false`, never a throw.
 *
 * Strictly local file reads — no network, no writes.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface UsageRow {
  tool: string;
  label: string;
  /** True only when a parser exists AND usage data was found. */
  supported: boolean;
  inputTokens?: number;
  outputTokens?: number;
  cacheTokens?: number;
  totalTokens?: number;
  sessions?: number;
  note?: string;
}

export interface UsageOptions {
  /** Override home dir (tests). */
  home?: string;
}

interface Tokens {
  input: number;
  output: number;
  cache: number;
  sessions: number;
}

/** Sum Claude Code session usage from ~/.claude/projects/<dir>/*.jsonl. */
async function claudeCodeUsage(home: string): Promise<Tokens | undefined> {
  const root = path.join(home, '.claude', 'projects');
  let projectDirs: string[];
  try {
    projectDirs = await fs.readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  const t: Tokens = { input: 0, output: 0, cache: 0, sessions: 0 };
  let sawFile = false;
  for (const d of projectDirs) {
    const dir = path.join(root, d);
    let files: string[];
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;
      files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      sawFile = true;
      t.sessions += 1;
      let raw: string;
      try {
        raw = await fs.readFile(path.join(dir, f), 'utf8');
      } catch {
        continue;
      }
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        let obj: unknown;
        try {
          obj = JSON.parse(line);
        } catch {
          continue; // defensive: skip unparseable lines, never throw
        }
        const u = (obj as { message?: { usage?: Record<string, unknown> } })?.message?.usage;
        if (!u) continue;
        const num = (k: string): number => (typeof u[k] === 'number' ? (u[k] as number) : 0);
        t.input += num('input_tokens');
        t.output += num('output_tokens');
        t.cache += num('cache_creation_input_tokens') + num('cache_read_input_tokens');
      }
    }
  }
  return sawFile ? t : undefined;
}

/** Tools with a verified parser. Others are reported `supported: false`. */
const USAGE_SOURCES: Record<string, { label: string; parse: (home: string) => Promise<Tokens | undefined> }> = {
  'claude-code': { label: 'Claude Code', parse: claudeCodeUsage },
};

const OTHER_TOOLS: Array<{ tool: string; label: string }> = [
  { tool: 'codex', label: 'Codex' },
  { tool: 'gemini-cli', label: 'Gemini CLI' },
  { tool: 'qwen-code', label: 'Qwen Code' },
  { tool: 'cursor', label: 'Cursor' },
  { tool: 'goose', label: 'Goose' },
  { tool: 'kiro-cli', label: 'Kiro' },
  { tool: 'opencode', label: 'OpenCode' },
];

export interface UsageResult {
  rows: UsageRow[];
  totals: { inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number };
}

export async function collectUsage(opts: UsageOptions = {}): Promise<UsageResult> {
  const home = opts.home ?? os.homedir();
  const rows: UsageRow[] = [];

  for (const [tool, src] of Object.entries(USAGE_SOURCES)) {
    let t: Tokens | undefined;
    try {
      t = await src.parse(home);
    } catch (e) {
      rows.push({ tool, label: src.label, supported: false, note: `read error: ${String(e)}` });
      continue;
    }
    if (!t) {
      rows.push({ tool, label: src.label, supported: false, note: 'no usage files found' });
      continue;
    }
    rows.push({
      tool,
      label: src.label,
      supported: true,
      inputTokens: t.input,
      outputTokens: t.output,
      cacheTokens: t.cache,
      totalTokens: t.input + t.output + t.cache,
      sessions: t.sessions,
    });
  }

  for (const o of OTHER_TOOLS) {
    rows.push({ tool: o.tool, label: o.label, supported: false, note: 'usage parsing not yet verified for this CLI' });
  }

  const totals = rows.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + (r.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (r.outputTokens ?? 0),
      cacheTokens: acc.cacheTokens + (r.cacheTokens ?? 0),
      totalTokens: acc.totalTokens + (r.totalTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 },
  );

  return { rows, totals };
}
