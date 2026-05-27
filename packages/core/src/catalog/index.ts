/**
 * Catalog — uses statically imported JSON (bundled inline by bun/tsc) so the
 * path works both in dev and in the published npm package.  Pass `dir` to
 * override with a file-system catalog (useful for tests and plugin extensions).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  McpServerManifest,
  PluginManifest,
  Preset,
  SkillManifest,
  ToolCatalogEntry,
} from '../types.js';
import _skills from '../../../catalog/skills.json' with { type: 'json' };
import _tools from '../../../catalog/tools.json' with { type: 'json' };
import _presets from '../../../catalog/presets.json' with { type: 'json' };
import _mcp from '../../../catalog/mcp.json' with { type: 'json' };
import _plugins from '../../../catalog/plugins.json' with { type: 'json' };
import { defaultCatalogDir, readCatalogManifest } from './sync.js';

export interface Catalog {
  skills: SkillManifest[];
  tools: ToolCatalogEntry[];
  presets: Preset[];
  mcpServers: McpServerManifest[];
  plugins: PluginManifest[];
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
    // 1. explicit dir override (tests / private team catalogs)
    if (this.dir) {
      this.cache = await this.loadFromDir(this.dir);
      return this.cache;
    }
    // 2. user-synced catalog at ~/.clihub/catalog/ (if a manifest exists)
    const userDir = defaultCatalogDir();
    const manifest = await readCatalogManifest(userDir);
    if (manifest) {
      try {
        this.cache = await this.loadFromDir(userDir);
        return this.cache;
      } catch {
        // fall through to bundled if the synced files are corrupt
      }
    }
    // 3. bundled fallback
    this.cache = {
      skills: _skills as unknown as SkillManifest[],
      tools: _tools as unknown as ToolCatalogEntry[],
      presets: _presets as unknown as Preset[],
      mcpServers: _mcp as unknown as McpServerManifest[],
      plugins: _plugins as unknown as PluginManifest[],
    };
    return this.cache;
  }

  /** Source the catalog is currently being read from. */
  async source(): Promise<{ kind: 'bundled' | 'user' | 'override'; dir?: string }> {
    if (this.dir) return { kind: 'override', dir: this.dir };
    const userDir = defaultCatalogDir();
    const manifest = await readCatalogManifest(userDir);
    if (manifest) return { kind: 'user', dir: userDir };
    return { kind: 'bundled' };
  }

  private async loadFromDir(dir: string): Promise<Catalog> {
    const readAt = async <T>(name: string): Promise<T> => {
      const raw = await fs.readFile(path.join(dir, name), 'utf8');
      return JSON.parse(raw) as T;
    };
    const [skills, tools, presets, mcpServers, plugins] = await Promise.all([
      readAt<SkillManifest[]>('skills.json'),
      readAt<ToolCatalogEntry[]>('tools.json'),
      readAt<Preset[]>('presets.json'),
      readAt<McpServerManifest[]>('mcp.json').catch(() => [] as McpServerManifest[]),
      readAt<PluginManifest[]>('plugins.json').catch(() => [] as PluginManifest[]),
    ]);
    return { skills, tools, presets, mcpServers, plugins };
  }

  async findMcpServer(id: string): Promise<McpServerManifest | undefined> {
    const { mcpServers } = await this.load();
    return mcpServers.find((m) => m.id === id);
  }

  async findPlugin(id: string): Promise<PluginManifest | undefined> {
    const { plugins } = await this.load();
    return plugins.find((p) => p.id === id);
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

}
