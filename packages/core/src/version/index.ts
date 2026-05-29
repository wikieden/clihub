/**
 * Per-tool version history + rollback (Pillar II).
 *
 * Records every clihub-driven install of a tool so a bad upgrade can be
 * undone with `clihub rollback <tool>`. History lives at
 * `~/.clihub/history/<toolId>.json` (overridable). Most-recent-first.
 *
 * clihub does not snapshot the binary — it re-installs the recorded
 * version via the provider's npm/bun install path. So rollback only
 * works for tools the registry can re-install at an explicit version
 * (currently the npm-based providers: claude-code, codex, gemini-cli).
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface VersionRecord {
  /** Version installed (semver or 'latest' if unknown). */
  version: string;
  /** ISO 8601 UTC timestamp of the install. */
  at: string;
  /** Install method used (npm | bun | brew | curl). */
  method?: string;
  /** True when this record was the result of a rollback. */
  rolledBack?: boolean;
}

export interface VersionHistory {
  toolId: string;
  /** Most-recent-first. */
  records: VersionRecord[];
}

export interface HistoryIoOpts {
  /** Override the history dir; defaults to `~/.clihub/history`. */
  dir?: string;
}

export function defaultHistoryDir(): string {
  return path.join(os.homedir(), '.clihub', 'history');
}

function historyFile(toolId: string, opts: HistoryIoOpts): string {
  return path.join(opts.dir ?? defaultHistoryDir(), `${toolId}.json`);
}

export async function readHistory(toolId: string, opts: HistoryIoOpts = {}): Promise<VersionHistory> {
  const file = historyFile(toolId, opts);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as VersionHistory;
    if (!Array.isArray(parsed.records)) return { toolId, records: [] };
    return { toolId, records: parsed.records };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { toolId, records: [] };
    throw err;
  }
}

async function writeHistory(history: VersionHistory, opts: HistoryIoOpts = {}): Promise<void> {
  const file = historyFile(history.toolId, opts);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(history, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

/**
 * Push a freshly-installed version onto the tool's history. De-dups
 * consecutive identical versions (no point recording the same install
 * twice in a row), caps the list at 50 entries.
 */
export async function recordVersion(
  toolId: string,
  record: Omit<VersionRecord, 'at'> & { at?: string },
  opts: HistoryIoOpts = {},
): Promise<VersionHistory> {
  const history = await readHistory(toolId, opts);
  const entry: VersionRecord = {
    version: record.version,
    at: record.at ?? new Date().toISOString(),
    ...(record.method ? { method: record.method } : {}),
    ...(record.rolledBack ? { rolledBack: true } : {}),
  };
  const head = history.records[0];
  if (!head || head.version !== entry.version || head.rolledBack !== entry.rolledBack) {
    history.records.unshift(entry);
  } else {
    history.records[0] = entry;
  }
  history.records = history.records.slice(0, 50);
  await writeHistory(history, opts);
  return history;
}

/**
 * Return the version to roll *back* to: the most recent record whose
 * version differs from the currently-installed one. `undefined` when
 * there's no prior version to fall back to.
 */
export function previousVersion(history: VersionHistory, currentVersion: string | undefined): string | undefined {
  for (const rec of history.records) {
    if (rec.version && rec.version !== currentVersion && rec.version !== 'latest') {
      return rec.version;
    }
  }
  return undefined;
}
