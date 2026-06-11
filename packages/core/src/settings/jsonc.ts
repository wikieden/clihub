/**
 * JSONC-tolerant SettingsAdapter — for CLIs whose config files allow
 * comments and trailing commas (opencode parses its `opencode.json`
 * as JSONC). Reads via parseJsonc; writes/backups delegate to
 * JsonSettingsAdapter, so output is plain JSON and the pre-write
 * snapshot keeps a copy of the original (comments included).
 */
import { promises as fs } from 'node:fs';
import type { SettingsAdapter } from '../tools/types.js';
import { parseJsonc } from '../utils/jsonc.js';
import { JsonSettingsAdapter } from './index.js';

export interface JsoncSettingsAdapterOpts {
  /** Absolute path to the settings file. */
  path: string;
}

export class JsoncSettingsAdapter implements SettingsAdapter {
  private readonly filePath: string;
  private readonly inner: JsonSettingsAdapter;

  constructor(opts: JsoncSettingsAdapterOpts) {
    this.filePath = opts.path;
    this.inner = new JsonSettingsAdapter({ path: opts.path });
  }

  configPath(): string {
    return this.filePath;
  }

  async read(): Promise<unknown> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      return parseJsonc(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  write(data: unknown): Promise<void> {
    return this.inner.write(data);
  }

  validate(data: unknown): boolean {
    return this.inner.validate(data);
  }

  backup(): Promise<string> {
    return this.inner.backup();
  }
}
