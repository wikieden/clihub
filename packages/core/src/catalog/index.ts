/**
 * Catalog — uses statically imported JSON (bundled inline by bun/tsc) so the
 * path works both in dev and in the published npm package.  Pass `dir` to
 * override with a file-system catalog (useful for tests and plugin extensions).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  EndpointPreset,
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
import _endpoints from '../../../catalog/endpoints.json' with { type: 'json' };
import { defaultCatalogDir, readCatalogManifest } from './sync.js';
import { orderedSourceDirs } from './sources.js';

const BUNDLED_ENDPOINTS = _endpoints as unknown as EndpointPreset[];

export interface Catalog {
  skills: SkillManifest[];
  tools: ToolCatalogEntry[];
  presets: Preset[];
  mcpServers: McpServerManifest[];
  plugins: PluginManifest[];
  endpoints: EndpointPreset[];
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
    // 2. federated sources at ~/.clihub/catalog-sources/* (if configured)
    const sources = await orderedSourceDirs();
    if (sources.length > 0) {
      try {
        const merged = await this.mergeSourceDirs(sources.map((s) => s.dir));
        this.cache = merged;
        return this.cache;
      } catch {
        // fall through if a source is corrupt
      }
    }
    // 3. user-synced catalog at ~/.clihub/catalog/ (if a manifest exists)
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
      endpoints: BUNDLED_ENDPOINTS,
    };
    return this.cache;
  }

  /** Source the catalog is currently being read from. */
  async source(): Promise<{ kind: 'bundled' | 'user' | 'override' | 'federated'; dir?: string; sources?: string[] }> {
    if (this.dir) return { kind: 'override', dir: this.dir };
    const sources = await orderedSourceDirs();
    if (sources.length > 0) return { kind: 'federated', sources: sources.map((s) => s.name) };
    const userDir = defaultCatalogDir();
    const manifest = await readCatalogManifest(userDir);
    if (manifest) return { kind: 'user', dir: userDir };
    return { kind: 'bundled' };
  }

  /**
   * Merge several source dirs into one catalog. Dirs are passed
   * lowest-priority first; later dirs override earlier ones by `id`.
   */
  private async mergeSourceDirs(dirs: string[]): Promise<Catalog> {
    const byId = {
      skills: new Map<string, SkillManifest>(),
      tools: new Map<string, ToolCatalogEntry>(),
      presets: new Map<string, Preset>(),
      mcpServers: new Map<string, McpServerManifest>(),
      plugins: new Map<string, PluginManifest>(),
      endpoints: new Map<string, EndpointPreset>(),
    };
    let loadedAny = false;
    for (const dir of dirs) {
      let cat: Catalog;
      try {
        cat = await this.loadFromDir(dir);
      } catch {
        continue;
      }
      loadedAny = true;
      for (const s of cat.skills) byId.skills.set(s.id, s);
      for (const t of cat.tools) byId.tools.set(t.id, t);
      for (const p of cat.presets) byId.presets.set(p.id, p);
      for (const m of cat.mcpServers) byId.mcpServers.set(m.id, m);
      for (const pl of cat.plugins) byId.plugins.set(pl.id, pl);
      for (const e of cat.endpoints ?? []) byId.endpoints.set(e.id, e);
    }
    if (!loadedAny) throw new Error('no source dir loaded');
    return {
      skills: [...byId.skills.values()],
      tools: [...byId.tools.values()],
      presets: [...byId.presets.values()],
      mcpServers: [...byId.mcpServers.values()],
      plugins: [...byId.plugins.values()],
      endpoints: [...byId.endpoints.values()],
    };
  }

  private async loadFromDir(dir: string): Promise<Catalog> {
    const readAt = async <T>(name: string): Promise<T> => {
      const raw = await fs.readFile(path.join(dir, name), 'utf8');
      return JSON.parse(raw) as T;
    };
    const [skills, tools, presets, mcpServers, plugins, endpoints] = await Promise.all([
      readAt<SkillManifest[]>('skills.json'),
      readAt<ToolCatalogEntry[]>('tools.json'),
      readAt<Preset[]>('presets.json'),
      readAt<McpServerManifest[]>('mcp.json').catch(() => [] as McpServerManifest[]),
      readAt<PluginManifest[]>('plugins.json').catch(() => [] as PluginManifest[]),
      readAt<EndpointPreset[]>('endpoints.json').catch(() => undefined),
    ]);
    return {
      skills,
      tools,
      presets,
      mcpServers,
      plugins,
      // endpoints.json postdates most synced/team catalogs — an ABSENT file means
      // "not synced yet", not "no endpoints", so the bundled verified seed fills
      // the gap. A present-but-empty array stays authoritative.
      endpoints: endpoints ?? BUNDLED_ENDPOINTS,
    };
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
