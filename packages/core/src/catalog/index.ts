/**
 * Catalog — uses statically imported JSON (bundled inline by bun/tsc) so the
 * path works both in dev and in the published npm package.  Pass `dir` to
 * override with a file-system catalog (useful for tests and plugin extensions).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Preset, SkillManifest, ToolCatalogEntry } from '../types.js';
import _skills from '../../../catalog/skills.json' with { type: 'json' };
import _tools from '../../../catalog/tools.json' with { type: 'json' };
import _presets from '../../../catalog/presets.json' with { type: 'json' };

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
  private readonly dir?: string;
  private cache?: Catalog;

  constructor(opts: CatalogLoaderOpts = {}) {
    this.dir = opts.dir;
  }

  async load(): Promise<Catalog> {
    if (this.cache) return this.cache;
    if (this.dir) {
      const [skills, tools, presets] = await Promise.all([
        this.readJson<SkillManifest[]>('skills.json'),
        this.readJson<ToolCatalogEntry[]>('tools.json'),
        this.readJson<Preset[]>('presets.json'),
      ]);
      this.cache = { skills, tools, presets };
    } else {
      this.cache = {
        skills: _skills as unknown as SkillManifest[],
        tools: _tools as unknown as ToolCatalogEntry[],
        presets: _presets as unknown as Preset[],
      };
    }
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
    const raw = await fs.readFile(path.join(this.dir!, name), 'utf8');
    return JSON.parse(raw) as T;
  }
}
