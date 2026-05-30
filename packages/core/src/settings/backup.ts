/**
 * Auto-backup for CLI settings files. Every SettingsAdapter.write() snapshots
 * the *current* on-disk content before overwriting, so any clihub-caused
 * change (proxy set, skill install, profile switch, wizard, apply…) is
 * one `clihub config restore <tool>` away from being undone.
 *
 * Snapshots live centrally under `~/.clihub/settings-backups/<key>/` — out of
 * each CLI's own config dir, so the host CLI never sees stray `.bak` files.
 * Opt out per-process with `CLIHUB_NO_BACKUP=1`.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { timestamp } from '../backup/index.js';

export interface SettingsBackupOpts {
  /** Override storage root. Defaults to ~/.clihub/settings-backups. */
  root?: string;
  /** How many snapshots to keep per file. Defaults to 10. */
  keep?: number;
  /** Deterministic clock for tests. */
  now?: Date;
}

export interface SettingsBackupEntry {
  /** Snapshot filename; sorts lexicographically, reversed on list (newest first). */
  id: string;
  /** Absolute path to the snapshot file. */
  path: string;
}

const DEFAULT_KEEP = 10;

export function settingsBackupRoot(): string {
  return path.join(os.homedir(), '.clihub', 'settings-backups');
}

/** Stable per-file key derived from the absolute settings path. */
export function backupKey(filePath: string): string {
  return path
    .resolve(filePath)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * Snapshot the current content of `filePath` before it is overwritten with
 * `newContent`. No-op when backups are disabled, the file does not exist yet,
 * or the content is unchanged. Returns the snapshot path, or null on no-op.
 */
export async function snapshotBeforeWrite(
  filePath: string,
  newContent: string,
  opts: SettingsBackupOpts = {},
): Promise<string | null> {
  if (process.env.CLIHUB_NO_BACKUP) return null;
  let old: string;
  try {
    old = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  if (old === newContent) return null;
  return writeSnapshot(filePath, old, opts);
}

async function writeSnapshot(filePath: string, content: string, opts: SettingsBackupOpts): Promise<string> {
  const root = opts.root ?? settingsBackupRoot();
  const dir = path.join(root, backupKey(filePath));
  await fs.mkdir(dir, { recursive: true });
  const base = path.basename(filePath);
  const id = timestamp(opts.now);
  let dest = path.join(dir, `${id}__${base}`);
  let n = 1;
  // Same-second collisions get a suffix so a snapshot is never clobbered.
  while (await exists(dest)) { dest = path.join(dir, `${id}-${n}__${base}`); n++; }
  await fs.writeFile(dest, content, 'utf8');
  await prune(dir, opts.keep ?? DEFAULT_KEEP);
  return dest;
}

async function prune(dir: string, keep: number): Promise<void> {
  let names: string[];
  try { names = await fs.readdir(dir); } catch { return; }
  const snaps = names.filter((nm) => nm.includes('__')).sort((a, b) => b.localeCompare(a));
  for (const stale of snaps.slice(keep)) {
    await fs.rm(path.join(dir, stale), { force: true }).catch(() => {});
  }
}

/** List snapshots for a settings file, newest first. */
export async function listSettingsBackups(
  filePath: string,
  opts: SettingsBackupOpts = {},
): Promise<SettingsBackupEntry[]> {
  const dir = path.join(opts.root ?? settingsBackupRoot(), backupKey(filePath));
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return names
    .filter((nm) => nm.includes('__'))
    .map((nm) => ({ id: nm, path: path.join(dir, nm) }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Restore the most recent snapshot back to `filePath`. The current content is
 * itself snapshotted first, so a restore is undoable. Returns the restored
 * snapshot id, or null when there is nothing to restore.
 */
export async function restoreLatestSettings(
  filePath: string,
  opts: SettingsBackupOpts = {},
): Promise<string | null> {
  const list = await listSettingsBackups(filePath, opts);
  const latest = list[0];
  if (!latest) return null;
  const current = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (current !== null) await writeSnapshot(filePath, current, opts);
  const content = await fs.readFile(latest.path, 'utf8');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  return latest.id;
}
