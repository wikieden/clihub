/**
 * Catalog — reads bundled `skills.json` / `tools.json` / `presets.json`
 * from `packages/catalog/`. In v0.2+ this will also sync from a remote
 * registry into `~/.clihub/cache/catalog.json`.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Preset, SkillManifest, ToolCatalogEntry } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** packages/core/src/catalog/index.ts → repo/packages/catalog */
const DEFAULT_CATALOG_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'catalog',
);

export interface Catalog {
  skills: SkillManifest[];
  tools: ToolCatalogEntry[];
  presets: Preset[];
}

export interface CatalogLoaderOpts {
  /** Override catalog dir. Defaults to packages/catalog/. */
  dir?: string;
}

export class CatalogLoader {
  private readonly dir: string;
  private cache?: Catalog;

  constructor(opts: CatalogLoaderOpts = {}) {
    this.dir = opts.dir ?? DEFAULT_CATALOG_DIR;
  }

  async load(): Promise<Catalog> {
    if (this.cache) return this.cache;
    const [skills, tools, presets] = await Promise.all([
      this.readJson<SkillManifest[]>('skills.json'),
      this.readJson<ToolCatalogEntry[]>('tools.json'),
      this.readJson<Preset[]>('presets.json'),
    ]);
    this.cache = { skills, tools, presets };
    return this.cache;
  }

  async findSkill(id: string): Promise<SkillManifest | undefined> {
    const { skills } = await this.load();
    return skills.find((s) => s.id === id);
  }

  async findTool(id: string): Promise<ToolCatalogEntry | undefined> {
    const { tools } = await this.load();
    return tools.find((t) => t.id === id);
  }

  async findPreset(id: string): Promise<Preset | undefined> {
    const { presets } = await this.load();
    return presets.find((p) => p.id === id);
  }

  private async readJson<T>(name: string): Promise<T> {
    const raw = await fs.readFile(path.join(this.dir, name), 'utf8');
    return JSON.parse(raw) as T;
  }
}
