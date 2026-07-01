/**
 * `clihub mcp` (v1.13.0) — unified MCP-server management across the CLIs
 * that use the standard JSON `mcpServers` map (Claude Code, Antigravity).
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
import { JsonMcpAdapter, TomlMcpAdapter, OpencodeMcpAdapter, type McpAdapter, type McpDialect } from './index.js';
import { CatalogLoader } from '../catalog/index.js';
import { getProvider } from '../tools/registry.js';
import type { InstalledMcpServer, McpServerManifest, McpTransport } from '../types.js';

/** CLIs whose MCP config is a JSON `mcpServers` map, with their config file (relative to home).
 *  NB: Claude Code reads user-scope MCP from ~/.claude.json (verified via
 *  `claude mcp add --scope user`), NOT ~/.claude/settings.json (which holds
 *  env/permissions). Antigravity reads mcpServers from
 *  ~/.gemini/antigravity-cli/mcp_config.json (its own file, not settings.json). */
/** MCP-capable CLIs → config file (relative to home). Claude/Antigravity/Qwen
 *  use a JSON `mcpServers` map; Codex uses TOML `[mcp_servers]` in config.toml. */
const MCP_RELPATHS: Record<string, string> = {
  'claude-code': '.claude.json',
  'antigravity': '.gemini/antigravity-cli/mcp_config.json',
  'qwen-code': '.qwen/settings.json',
  'codex': '.codex/config.toml',
  'opencode': '.config/opencode/opencode.json',
};

/** The right MCP adapter for a CLI: TOML for Codex, opencode's `mcp` map for
 *  OpenCode, JSON `mcpServers` (+dialect) for the rest. */
function adapterFor(tool: string, p: string): McpAdapter {
  if (tool === 'codex') return new TomlMcpAdapter({ path: p });
  if (tool === 'opencode') return new OpencodeMcpAdapter({ path: p });
  return new JsonMcpAdapter({ path: p, dialect: dialectFor(tool) });
}

export interface McpManageOpts {
  /** Home dir override (tests). */
  home?: string;
  loader?: CatalogLoader;
}

function dialectFor(tool: string): McpDialect {
  // Qwen Code is a Gemini-CLI fork → same mcpServers/httpUrl shape.
  return tool === 'qwen-code' ? 'gemini' : 'claude';
}

function targets(home: string): Array<{ tool: string; path: string }> {
  return Object.entries(MCP_RELPATHS).map(([tool, rel]) => ({ tool, path: path.join(home, ...rel.split('/')) }));
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
    const servers = await adapterFor(t.tool, t.path).list();
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
  // Inline `--command "npx -y @x/y"` must be split into command + args, or the
  // CLI tries to exec a binary literally named "npx -y @x/y". Catalog manifests
  // already store command/args separately, so this only touches the inline path.
  const inlineParts = opts.command ? opts.command.trim().split(/\s+/) : [];
  const manifest: McpServerManifest | undefined =
    catalog.mcpServers.find((m) => m.id === id) ??
    (opts.command || opts.url
      ? {
          id, name: id, description: '', supports: {}, transport: opts.transport,
          command: inlineParts[0],
          args: inlineParts.length > 1 ? inlineParts.slice(1) : undefined,
          url: opts.url,
        }
      : undefined);

  const done: string[] = [];
  const failed: Array<{ tool: string; error: string }> = [];
  if (!manifest) { failed.push({ tool: '-', error: `unknown MCP server "${id}" (not in catalog; pass --command or --url)` }); return { done, failed }; }

  for (const t of await activeTargets(home, opts.all ?? false)) {
    if (manifest.supports && Object.keys(manifest.supports).length > 0 && !manifest.supports[t.tool]) continue;
    try {
      await adapterFor(t.tool, t.path).install(manifest);
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
      await adapterFor(t.tool, t.path).uninstall(id);
      done.push(`${id}@${t.tool}`);
    } catch (e) {
      failed.push({ tool: t.tool, error: String(e) });
    }
  }
  return { done, failed };
}
