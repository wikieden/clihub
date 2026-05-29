/**
 * `clihub mcp` (v1.13.0) — unified MCP-server management across the CLIs
 * that use the standard JSON `mcpServers` map (Claude Code, Gemini CLI).
 *
 *   - listMcp()        → installed MCP servers per CLI
 *   - addMcp(id)       → install a catalog (or inline) MCP into each CLI
 *   - removeMcp(id)    → remove it from each CLI
 *
 * Codex (TOML) and others are out of scope here; this orchestrates the
 * existing JsonMcpAdapter, the same path `clihub apply` patches.
 */
import os from 'node:os';
import path from 'node:path';
import { JsonMcpAdapter } from './index.js';
import { CatalogLoader } from '../catalog/index.js';
import { getProvider } from '../tools/registry.js';
import type { InstalledMcpServer, McpServerManifest, McpTransport } from '../types.js';

/** CLIs whose MCP config is a JSON `mcpServers` map, with their settings file (relative to home). */
const JSON_MCP_RELPATHS: Record<string, string> = {
  'claude-code': '.claude/settings.json',
  'gemini-cli': '.gemini/settings.json',
};

export interface McpManageOpts {
  /** Home dir override (tests). */
  home?: string;
  loader?: CatalogLoader;
}

function targets(home: string): Array<{ tool: string; path: string }> {
  return Object.entries(JSON_MCP_RELPATHS).map(([tool, rel]) => ({ tool, path: path.join(home, ...rel.split('/')) }));
}

/** Only the JSON-MCP CLIs that are actually installed (override with `all` in tests). */
async function activeTargets(home: string, includeAll: boolean): Promise<Array<{ tool: string; path: string }>> {
  const out: Array<{ tool: string; path: string }> = [];
  for (const t of targets(home)) {
    if (includeAll) { out.push(t); continue; }
    const p = getProvider(t.tool);
    if (p && (await p.detect()).installed) out.push(t);
  }
  return out;
}

export interface McpListRow {
  tool: string;
  servers: InstalledMcpServer[];
}

export async function listMcp(opts: McpManageOpts & { all?: boolean } = {}): Promise<McpListRow[]> {
  const home = opts.home ?? os.homedir();
  const rows: McpListRow[] = [];
  for (const t of await activeTargets(home, opts.all ?? false)) {
    const servers = await new JsonMcpAdapter({ path: t.path }).list();
    rows.push({ tool: t.tool, servers });
  }
  return rows;
}

export interface McpManageResult {
  done: string[];
  failed: Array<{ tool: string; error: string }>;
}

export interface AddMcpOpts extends McpManageOpts {
  all?: boolean;
  command?: string;
  url?: string;
  transport?: McpTransport;
}

export async function addMcp(id: string, opts: AddMcpOpts = {}): Promise<McpManageResult> {
  const home = opts.home ?? os.homedir();
  const loader = opts.loader ?? new CatalogLoader();
  const catalog = await loader.load();
  const manifest: McpServerManifest | undefined =
    catalog.mcpServers.find((m) => m.id === id) ??
    (opts.command || opts.url
      ? { id, name: id, description: '', supports: {}, transport: opts.transport, command: opts.command, url: opts.url }
      : undefined);

  const done: string[] = [];
  const failed: Array<{ tool: string; error: string }> = [];
  if (!manifest) { failed.push({ tool: '-', error: `unknown MCP server "${id}" (not in catalog; pass --command or --url)` }); return { done, failed }; }

  for (const t of await activeTargets(home, opts.all ?? false)) {
    if (manifest.supports && Object.keys(manifest.supports).length > 0 && !manifest.supports[t.tool]) continue;
    try {
      await new JsonMcpAdapter({ path: t.path }).install(manifest);
      done.push(`${id}@${t.tool}`);
    } catch (e) {
      failed.push({ tool: t.tool, error: String(e) });
    }
  }
  return { done, failed };
}

export async function removeMcp(id: string, opts: McpManageOpts & { all?: boolean } = {}): Promise<McpManageResult> {
  const home = opts.home ?? os.homedir();
  const done: string[] = [];
  const failed: Array<{ tool: string; error: string }> = [];
  for (const t of await activeTargets(home, opts.all ?? false)) {
    try {
      await new JsonMcpAdapter({ path: t.path }).uninstall(id);
      done.push(`${id}@${t.tool}`);
    } catch (e) {
      failed.push({ tool: t.tool, error: String(e) });
    }
  }
  return { done, failed };
}
