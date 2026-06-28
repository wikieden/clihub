/**
 * `clihub usage` — read-only token rollup across CLIs + their desktop apps.
 *
 * Strictly local file reads — no network, no writes (except a parse cache).
 * Each agent can have more than one "surface" (the CLI, and the desktop app's
 * embedded agent sessions); we report them split AND combined. Token sums drive
 * an ESTIMATED dollar value at public list prices (see ./pricing.ts) — never
 * your real bill.
 *
 * Performance: session logs get huge (multi-GB Codex rollouts, 100s-of-MB
 * Claude sessions). So we (a) STREAM line-by-line — never readFile a whole file
 * into memory; (b) tail-read Codex, whose token_count events are cumulative, so
 * only the last one matters; (c) cache per-file parse results by mtime+size in
 * ~/.config/clihub/usage-cache.json so repeat loads only re-parse changed files.
 *
 * Parsers are defensive: unparseable lines are skipped, missing files → a row
 * with `supported: false`, never a throw.
 */
import { createReadStream, promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { estimateCost, type ModelTokens } from './pricing.js';
import { globalClihubYamlPath } from '../clihubyaml/index.js';

export type Surface = 'cli' | 'desktop';

export interface SurfaceUsage {
  surface: Surface;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
  sessions: number;
  estCostUsd: number;
}

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
  estCostUsd?: number;
  /** Per-surface split (cli / desktop), present when any surface has data. */
  surfaces?: SurfaceUsage[];
  /** Subscription/plan label when locally derivable (Codex chatgpt_plan_type). */
  plan?: string;
  /** True when some tokens used an unpriced model — the cost is a floor. */
  partialCost?: boolean;
  note?: string;
}

export interface UsageOptions {
  /** Override home dir (tests). */
  home?: string;
  /** Disable the on-disk parse cache (tests). */
  noCache?: boolean;
}

export interface UsageResult {
  rows: UsageRow[];
  totals: { inputTokens: number; outputTokens: number; cacheTokens: number; totalTokens: number; estCostUsd: number };
}

// ── per-model accumulation ──────────────────────────────────────────────────
type ByModel = Record<string, ModelTokens>;

function bump(by: ByModel, model: string, t: Partial<ModelTokens>): void {
  const m = (by[model] ??= { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
  m.input += t.input ?? 0;
  m.output += t.output ?? 0;
  m.cacheWrite += t.cacheWrite ?? 0;
  m.cacheRead += t.cacheRead ?? 0;
}

function mergeInto(dst: ByModel, src: ByModel): void {
  for (const [m, t] of Object.entries(src)) bump(dst, m, t);
}

interface SurfaceParse {
  sessions: number;
  byModel: ByModel;
}

// ── on-disk parse cache (keyed by file path → mtime+size+byModel) ───────────
interface CacheEntry {
  mtimeMs: number;
  size: number;
  byModel: ByModel;
}
type Cache = Record<string, CacheEntry>;

function cachePath(): string {
  return path.join(path.dirname(globalClihubYamlPath()), 'usage-cache.json');
}

async function loadCache(): Promise<Cache> {
  try {
    return JSON.parse(await fs.readFile(cachePath(), 'utf8')) as Cache;
  } catch {
    return {};
  }
}

async function saveCache(cache: Cache): Promise<void> {
  try {
    const p = cachePath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(cache), 'utf8');
  } catch {
    /* cache is best-effort */
  }
}

/** Stream a file line-by-line — bounded memory regardless of file size. */
async function forEachLine(file: string, cb: (line: string) => void, start = 0): Promise<void> {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8', start }), crlfDelay: Infinity });
  for await (const line of rl) cb(line);
}

/** Recursively collect every *.jsonl path under `root` (returns [] if missing). */
async function jsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
  }
  await walk(root);
  return out;
}

/**
 * Parse each file under `roots` via `parseFile`, using the cache to skip files
 * whose mtime+size are unchanged. Returns the merged per-model totals + the
 * number of files (sessions) that yielded usage.
 */
async function parseTree(
  roots: string[],
  cache: Cache,
  parseFile: (file: string) => Promise<ByModel | undefined>,
): Promise<SurfaceParse | undefined> {
  const files = (await Promise.all(roots.map(jsonlFiles))).flat();
  if (files.length === 0) return undefined;
  const byModel: ByModel = {};
  let sessions = 0;
  for (const file of files) {
    let st: import('node:fs').Stats;
    try {
      st = await fs.stat(file);
    } catch {
      continue;
    }
    const hit = cache[file];
    let parsed: ByModel | undefined;
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
      parsed = hit.byModel;
    } else {
      parsed = await parseFile(file).catch(() => undefined);
      cache[file] = { mtimeMs: st.mtimeMs, size: st.size, byModel: parsed ?? {} };
    }
    if (parsed && Object.keys(parsed).length > 0) {
      sessions += 1;
      mergeInto(byModel, parsed);
    }
  }
  return { sessions, byModel };
}

// ── Claude (CLI + Desktop share the `message.usage` shape) ──────────────────
async function parseClaudeFile(file: string): Promise<ByModel> {
  const by: ByModel = {};
  await forEachLine(file, (line) => {
    if (!line.includes('"usage"')) return;
    let obj: { message?: { model?: string; usage?: Record<string, unknown> } };
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }
    const u = obj?.message?.usage;
    if (!u) return;
    const num = (k: string): number => (typeof u[k] === 'number' ? (u[k] as number) : 0);
    bump(by, obj.message?.model ?? 'unknown', {
      input: num('input_tokens'),
      output: num('output_tokens'),
      cacheWrite: num('cache_creation_input_tokens'),
      cacheRead: num('cache_read_input_tokens'),
    });
  });
  return by;
}

/** Desktop app data root for the embedded agent sessions, per OS. */
function claudeDesktopRoot(home: string): string {
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'local-agent-mode-sessions');
  }
  return path.join(home, '.config', 'Claude', 'local-agent-mode-sessions');
}

// ── Codex (`payload.type == "token_count"` cumulative events) ───────────────
/** Read the last `bytes` of a file as UTF-8 (for tail-scanning huge rollouts). */
async function readTail(file: string, bytes: number): Promise<string> {
  const fh = await fs.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    await fh.close();
  }
}

async function parseCodexFile(file: string): Promise<ByModel | undefined> {
  // token_count events are CUMULATIVE, so only the last one matters — tail-read
  // (these rollouts reach multiple GB). Model lives in an early line; head-read.
  let model = 'gpt-5';
  try {
    const fh = await fs.open(file, 'r');
    const buf = Buffer.alloc(65536);
    await fh.read(buf, 0, buf.length, 0);
    await fh.close();
    for (const line of buf.toString('utf8').split('\n')) {
      const m = line.match(/"model"\s*:\s*"([^"]+)"/);
      if (m) {
        model = m[1]!;
        break;
      }
    }
  } catch {
    /* keep default model */
  }
  let last: Record<string, number> | undefined;
  const tail = await readTail(file, 2 * 1024 * 1024).catch(() => '');
  for (const line of tail.split('\n')) {
    if (!line.includes('token_count')) continue;
    let obj: { payload?: { type?: string; info?: { total_token_usage?: Record<string, number> } } };
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.payload?.type === 'token_count' && obj.payload.info?.total_token_usage) {
      last = obj.payload.info.total_token_usage;
    }
  }
  if (!last) return undefined;
  const n = (k: string): number => (typeof last![k] === 'number' ? last![k] : 0);
  const cached = n('cached_input_tokens');
  const by: ByModel = {};
  // OpenAI's input_tokens INCLUDES the cached portion; split it out so cached
  // tokens price at the cheaper cache-read rate.
  bump(by, model, {
    input: Math.max(0, n('input_tokens') - cached),
    cacheRead: cached,
    output: n('output_tokens') + n('reasoning_output_tokens'),
  });
  return by;
}

/** Codex subscription type from the local auth token (chatgpt_plan_type). */
async function codexPlan(home: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(path.join(home, '.codex', 'auth.json'), 'utf8');
    const tok = (JSON.parse(raw) as { tokens?: { id_token?: string } }).tokens?.id_token;
    if (!tok || tok.split('.').length !== 3) return undefined;
    const claims = JSON.parse(Buffer.from(tok.split('.')[1]!, 'base64url').toString('utf8'));
    const plan = claims?.['https://api.openai.com/auth']?.chatgpt_plan_type;
    return typeof plan === 'string' ? plan : undefined;
  } catch {
    return undefined;
  }
}

// ── surface → display row math ──────────────────────────────────────────────
function toSurfaceUsage(surface: Surface, p: SurfaceParse): SurfaceUsage {
  let input = 0;
  let output = 0;
  let cache = 0;
  for (const m of Object.values(p.byModel)) {
    input += m.input;
    output += m.output;
    cache += m.cacheWrite + m.cacheRead;
  }
  const { usd } = estimateCost(p.byModel);
  return {
    surface,
    inputTokens: input,
    outputTokens: output,
    cacheTokens: cache,
    totalTokens: input + output + cache,
    sessions: p.sessions,
    estCostUsd: usd,
  };
}

function combineRow(
  tool: string,
  label: string,
  parses: Array<{ surface: Surface; parse: SurfaceParse | undefined }>,
  extra: { plan?: string } = {},
): UsageRow {
  const present = parses.filter((p): p is { surface: Surface; parse: SurfaceParse } => Boolean(p.parse?.sessions));
  if (present.length === 0) {
    return { tool, label, supported: false, note: 'no usage files found', plan: extra.plan };
  }
  const surfaces = present.map((p) => toSurfaceUsage(p.surface, p.parse));
  const merged: ByModel = {};
  for (const p of present) mergeInto(merged, p.parse.byModel);
  const cost = estimateCost(merged);
  const sum = (k: keyof SurfaceUsage) => surfaces.reduce((a, s) => a + (s[k] as number), 0);
  return {
    tool,
    label,
    supported: true,
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
    cacheTokens: sum('cacheTokens'),
    totalTokens: sum('totalTokens'),
    sessions: sum('sessions'),
    estCostUsd: cost.usd,
    partialCost: cost.pricedTokens < cost.totalTokens,
    surfaces,
    plan: extra.plan,
  };
}

const UNSUPPORTED: Array<{ tool: string; label: string }> = [
  { tool: 'gemini-cli', label: 'Gemini CLI' },
  { tool: 'qwen-code', label: 'Qwen Code' },
  { tool: 'cursor', label: 'Cursor' },
  { tool: 'goose', label: 'Goose' },
  { tool: 'kiro-cli', label: 'Kiro' },
  { tool: 'opencode', label: 'OpenCode' },
];

export async function collectUsage(opts: UsageOptions = {}): Promise<UsageResult> {
  const home = opts.home ?? os.homedir();
  const cache: Cache = opts.noCache ? {} : await loadCache();
  const seen = new Set<string>();
  const tracked = (f: string): void => void seen.add(f);
  // Wrap parsers so we can prune dead cache entries afterwards.
  const claudeParse = async (f: string): Promise<ByModel> => {
    tracked(f);
    return parseClaudeFile(f);
  };
  const codexParse = async (f: string): Promise<ByModel | undefined> => {
    tracked(f);
    return parseCodexFile(f);
  };

  const rows: UsageRow[] = [];

  const [claudeCli, claudeDesktop] = await Promise.all([
    parseTree([path.join(home, '.claude', 'projects')], cache, claudeParse).catch(() => undefined),
    parseTree([claudeDesktopRoot(home)], cache, claudeParse).catch(() => undefined),
  ]);
  rows.push(
    combineRow('claude-code', 'Claude Code', [
      { surface: 'cli', parse: claudeCli },
      { surface: 'desktop', parse: claudeDesktop },
    ]),
  );

  const [codex, plan] = await Promise.all([
    parseTree([path.join(home, '.codex', 'sessions'), path.join(home, '.codex', 'archived_sessions')], cache, codexParse).catch(
      () => undefined,
    ),
    codexPlan(home),
  ]);
  rows.push(combineRow('codex', 'Codex', [{ surface: 'cli', parse: codex }], { plan }));

  for (const o of UNSUPPORTED) {
    rows.push({ tool: o.tool, label: o.label, supported: false, note: 'usage parsing not yet verified for this CLI' });
  }

  if (!opts.noCache) {
    for (const k of Object.keys(cache)) if (!seen.has(k)) delete cache[k];
    await saveCache(cache);
  }

  const totals = rows.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + (r.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (r.outputTokens ?? 0),
      cacheTokens: acc.cacheTokens + (r.cacheTokens ?? 0),
      totalTokens: acc.totalTokens + (r.totalTokens ?? 0),
      estCostUsd: acc.estCostUsd + (r.estCostUsd ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0, estCostUsd: 0 },
  );

  return { rows, totals };
}
