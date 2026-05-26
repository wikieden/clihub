/**
 * Generic JSON SettingsAdapter. Each tool provider supplies a path; the
 * adapter handles read / write / validate / timestamped backup.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SettingsAdapter } from '../tools/types.js';
import { timestamp } from '../backup/index.js';

export interface JsonSettingsAdapterOpts {
  /** Absolute path to the settings file. */
  path: string;
}

export class JsonSettingsAdapter implements SettingsAdapter {
  private readonly filePath: string;

  constructor(opts: JsonSettingsAdapterOpts) {
    this.filePath = opts.path;
  }

  configPath(): string {
    return this.filePath;
  }

  async read(): Promise<unknown> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  async write(data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const formatted = JSON.stringify(data, null, 2) + '\n';
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
        // Nothing to back up; create an empty marker so callers get a path.
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.writeFile(backupPath, '{}\n', 'utf8');
      } else {
        throw err;
      }
    }
    return backupPath;
  }
}
