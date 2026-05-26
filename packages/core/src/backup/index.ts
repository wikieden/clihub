/**
 * BackupManager — tar.gz snapshots of a directory (e.g. ~/.claude/) to
 * `~/.clihub/backups/YYYYMMDD-HHMMSS/`.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface BackupEntry {
  id: string;
  path: string;
  createdAt: Date;
}

export interface BackupOptions {
  /** Directory to snapshot (e.g. ~/.claude). */
  sourceDir: string;
  /** Override root for backup storage. Defaults to ~/.clihub/backups. */
  backupRoot?: string;
}

/** ISO-ish compact timestamp: 20260526-104530 */
export function timestamp(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

export function defaultBackupRoot(): string {
  return path.join(os.homedir(), '.clihub', 'backups');
}

export class BackupManager {
  private readonly root: string;

  constructor(root: string = defaultBackupRoot()) {
    this.root = root;
  }

  /**
   * Create a tar.gz snapshot of `sourceDir` under `~/.clihub/backups/<ts>/`.
   * Falls back to a recursive copy if `tar` is unavailable.
   */
  async create(opts: BackupOptions): Promise<BackupEntry> {
    const id = timestamp();
    const dest = path.join(this.root, id);
    await fs.mkdir(dest, { recursive: true });

    const archive = path.join(dest, 'snapshot.tar.gz');
    const srcExists = await pathExists(opts.sourceDir);
    if (!srcExists) {
      // Record the absence; restore will recreate an empty dir.
      await fs.writeFile(
        path.join(dest, 'EMPTY'),
        `source did not exist: ${opts.sourceDir}\n`,
        'utf8',
      );
      return { id, path: dest, createdAt: new Date() };
    }

    try {
      await execFileP('tar', [
        '-czf',
        archive,
        '-C',
        path.dirname(opts.sourceDir),
        path.basename(opts.sourceDir),
      ]);
    } catch {
      // tar missing or failed — fall back to a directory copy.
      const copyDest = path.join(dest, path.basename(opts.sourceDir));
      await fs.cp(opts.sourceDir, copyDest, { recursive: true });
    }

    return { id, path: dest, createdAt: new Date() };
  }

  async list(): Promise<BackupEntry[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    const results: BackupEntry[] = [];
    for (const name of entries) {
      const full = path.join(this.root, name);
      const stat = await fs.stat(full).catch(() => null);
      if (!stat?.isDirectory()) continue;
      results.push({ id: name, path: full, createdAt: stat.birthtime });
    }
    return results.sort((a, b) => b.id.localeCompare(a.id));
  }

  async find(id: string): Promise<BackupEntry | undefined> {
    const all = await this.list();
    return all.find((e) => e.id === id);
  }

  /**
   * Restore a snapshot back to `targetDir`. The existing target is
   * itself backed up before being replaced.
   */
  async restore(id: string, targetDir: string): Promise<void> {
    const entry = await this.find(id);
    if (!entry) throw new Error(`Backup not found: ${id}`);

    // Safety: snapshot current target before clobbering it.
    if (await pathExists(targetDir)) {
      await this.create({ sourceDir: targetDir });
      await fs.rm(targetDir, { recursive: true, force: true });
    }
    await fs.mkdir(path.dirname(targetDir), { recursive: true });

    const archive = path.join(entry.path, 'snapshot.tar.gz');
    if (await pathExists(archive)) {
      await execFileP('tar', ['-xzf', archive, '-C', path.dirname(targetDir)]);
      return;
    }
    const copySrc = path.join(entry.path, path.basename(targetDir));
    if (await pathExists(copySrc)) {
      await fs.cp(copySrc, targetDir, { recursive: true });
      return;
    }
    // Snapshot was empty — leave an empty directory.
    await fs.mkdir(targetDir, { recursive: true });
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
