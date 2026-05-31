/**
 * YamlSettingsAdapter — for CLIs that store config as YAML (e.g. Goose
 * with `~/.config/goose/config.yaml`, or Continue with
 * `~/.continue/config.yaml`). Mirrors JsonSettingsAdapter's contract.
 *
 * Round-trip caveat: the `yaml` library re-emits canonical formatting;
 * comments and exact key ordering are not preserved on write. Reads pass
 * through untouched, so doctor-style read-only flows are safe. Crucially,
 * write() emits YAML — not JSON — so it will not corrupt the target file
 * the way JsonSettingsAdapter does when pointed at a `.yaml` path.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import type { SettingsAdapter } from '../tools/types.js';
import { timestamp } from '../backup/index.js';
import { snapshotBeforeWrite } from './backup.js';

export interface YamlSettingsAdapterOpts {
  /** Absolute path to the YAML settings file. */
  path: string;
}

export class YamlSettingsAdapter implements SettingsAdapter {
  private readonly filePath: string;

  constructor(opts: YamlSettingsAdapterOpts) {
    this.filePath = opts.path;
  }

  configPath(): string {
    return this.filePath;
  }

  async read(): Promise<unknown> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      // An empty YAML document parses to null; normalise to {} so callers
      // can spread it like JsonSettingsAdapter's empty-file behaviour.
      return parse(raw) ?? {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  async write(data: unknown): Promise<void> {
    if (!this.validate(data)) {
      throw new TypeError('YamlSettingsAdapter.write expects a plain object');
    }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const formatted = stringify(data as Record<string, unknown>);
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
