/**
 * TomlSettingsAdapter — for CLIs that store config as TOML (e.g. Codex
 * with `~/.codex/config.toml`). Mirrors JsonSettingsAdapter's contract.
 *
 * Round-trip caveat: smol-toml emits canonical formatting; user comments
 * and key ordering are not preserved on write. Reads pass through
 * untouched, so doctor-style read-only flows are safe.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'smol-toml';
import type { SettingsAdapter } from '../tools/types.js';
import { timestamp } from '../backup/index.js';
import { snapshotBeforeWrite } from './backup.js';

export interface TomlSettingsAdapterOpts {
  /** Absolute path to the TOML settings file. */
  path: string;
}

export class TomlSettingsAdapter implements SettingsAdapter {
  private readonly filePath: string;

  constructor(opts: TomlSettingsAdapterOpts) {
    this.filePath = opts.path;
  }

  configPath(): string {
    return this.filePath;
  }

  async read(): Promise<unknown> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return parse(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  async write(data: unknown): Promise<void> {
    if (!this.validate(data)) {
      throw new TypeError('TomlSettingsAdapter.write expects a plain object');
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const formatted = stringify(data as Record<string, unknown>) + '\n';
    await snapshotBeforeWrite(this.filePath, formatted);
    await fs.writeFile(this.filePath, formatted, 'utf8');
  }

  validate(data: unknown): boolean {
    return typeof data === 'object' && data !== null && !Array.isArray(data);
  }

  async backup(): Promise<string> {
    const ts = timestamp();
    const backupPath = `${this.filePath}.bak.${ts}`;
    try {
      await fs.copyFile(this.filePath, backupPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.writeFile(backupPath, '', 'utf8');
      } else {
        throw err;
      }
    }
    return backupPath;
  }
}
