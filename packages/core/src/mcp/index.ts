/**
 * MCP (Model Context Protocol) server adapters.
 *
 * Most JSON-backed CLIs share the same `mcpServers` map shape:
 *
 *   {
 *     "mcpServers": {
 *       "<id>": { "command": "...", "args": [...], "env": { ... } }
 *     }
 *   }
 *
 * `JsonMcpAdapter` covers Claude Code, Gemini CLI, Kiro CLI and any
 * other CLI using that convention. Providers with a different storage
 * format (e.g. Codex with `~/.codex/config.toml`) need a custom adapter.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TomlSettingsAdapter } from '../settings/toml.js';
import { parseJsonc } from '../utils/jsonc.js';
import type { InstalledMcpServer, McpServerManifest } from '../types.js';

export interface McpAdapter {
  /** List MCP servers currently registered with the CLI. */
  list(): Promise<InstalledMcpServer[]>;
  /** Add (or upsert) a server entry. */
  install(server: McpServerManifest): Promise<void>;
  /** Remove a server entry by id. No-op if absent. */
  uninstall(id: string): Promise<void>;
  /** Path of the settings file this adapter writes to. */
  configPath(): string;
}

/** HTTP/SSE entry shape differs per CLI:
 *  - claude  → { type: 'http'|'sse', url }
 *  - gemini  → http: { httpUrl }, sse: { url }  (distinguishes by key, no `type`)
 */
export type McpDialect = 'claude' | 'gemini';

export interface JsonMcpAdapterOpts {
  /** Absolute path of the JSON settings file. */
  path: string;
  /** CLI dialect for http/sse entry shape. Defaults to 'claude'. */
  dialect?: McpDialect;
}

export class JsonMcpAdapter implements McpAdapter {
  private readonly filePath: string;
  private readonly dialect: McpDialect;

  constructor(opts: JsonMcpAdapterOpts) {
    this.filePath = opts.path;
    this.dialect = opts.dialect ?? 'claude';
  }

  configPath(): string {
    return this.filePath;
  }

  async list(): Promise<InstalledMcpServer[]> {
    const obj = await this.read();
    const servers = (obj.mcpServers ?? {}) as Record<string, { command?: string; args?: string[] }>;
    return Object.entries(servers).map(([id, def]) => ({
      id,
      name: id,
      command: def.command ?? '',
      args: def.args,
    }));
  }

  async install(server: McpServerManifest): Promise<void> {
    const obj = await this.read();
    obj.mcpServers ??= {};
    const transport = server.transport ?? 'stdio';
    let entry: Record<string, unknown>;
    if (transport === 'http' || transport === 'sse') {
      if (!server.url) {
        throw new Error(`MCP server ${server.id} uses ${transport} transport but has no url`);
      }
      if (this.dialect === 'gemini') {
        // Gemini distinguishes by key (no `type`): httpUrl for streamable HTTP,
        // url for SSE.
        entry = transport === 'http' ? { httpUrl: server.url } : { url: server.url };
      } else {
        entry = { type: transport, url: server.url };
      }
      if (server.headers && Object.keys(server.headers).length > 0) {
        entry.headers = { ...server.headers };
      }
    } else {
      if (!server.command) {
        throw new Error(`MCP server ${server.id} uses stdio transport but has no command`);
      }
      entry = { command: server.command };
      if (server.args && server.args.length > 0) entry.args = server.args;
    }
    if (server.env && Object.keys(server.env).length > 0) {
      entry.env = Object.fromEntries(
        Object.keys(server.env).map((k) => [k, process.env[k] ?? '']),
      );
    }
    (obj.mcpServers as Record<string, unknown>)[server.id] = entry;
    await this.write(obj);
  }

  async uninstall(id: string): Promise<void> {
    const obj = await this.read();
    if (!obj.mcpServers || typeof obj.mcpServers !== 'object') return;
    const map = obj.mcpServers as Record<string, unknown>;
    if (!(id in map)) return;
    delete map[id];
    await this.write(obj);
  }

  private async read(): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  private async write(obj: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  }
}

/**
 * MCP adapter for Codex — TOML config.toml with an `[mcp_servers.<id>]` table
 * (verified via `codex mcp add`). stdio only (command + args); HTTP/SSE MCP is
 * not expressible here, so it's refused rather than written wrong.
 */
export class TomlMcpAdapter implements McpAdapter {
  private readonly inner: TomlSettingsAdapter;

  constructor(opts: { path: string }) {
    this.inner = new TomlSettingsAdapter({ path: opts.path });
  }

  configPath(): string {
    return this.inner.configPath();
  }

  async list(): Promise<InstalledMcpServer[]> {
    const obj = (await this.inner.read()) as Record<string, unknown>;
    const servers = (obj.mcp_servers ?? {}) as Record<string, { command?: string; args?: string[] }>;
    return Object.entries(servers).map(([id, def]) => ({
      id, name: id, command: def.command ?? '', args: def.args,
    }));
  }

  async install(server: McpServerManifest): Promise<void> {
    if ((server.transport ?? 'stdio') !== 'stdio') {
      throw new Error(`codex MCP via clihub supports stdio only (${server.id} is ${server.transport})`);
    }
    if (!server.command) throw new Error(`MCP server ${server.id} has no command`);
    const obj = (await this.inner.read()) as Record<string, unknown>;
    const map = (obj.mcp_servers ??= {}) as Record<string, unknown>;
    const entry: Record<string, unknown> = { command: server.command };
    if (server.args && server.args.length > 0) entry.args = server.args;
    if (server.env && Object.keys(server.env).length > 0) {
      entry.env = Object.fromEntries(Object.keys(server.env).map((k) => [k, process.env[k] ?? '']));
    }
    map[server.id] = entry;
    await this.inner.write(obj);
  }

  async uninstall(id: string): Promise<void> {
    const obj = (await this.inner.read()) as Record<string, unknown>;
    const map = obj.mcp_servers as Record<string, unknown> | undefined;
    if (!map || !(id in map)) return;
    delete map[id];
    await this.inner.write(obj);
  }
}

/**
 * MCP adapter for OpenCode — `~/.config/opencode/opencode.json`, top-level
 * `mcp` map (verified against opencode.ai/docs/mcp-servers + the live config
 * schema 2026-06-11). Shapes differ from the mcpServers convention:
 *   - local:  { type: "local", command: [exe, ...args], environment: {...} }
 *     (ONE array — no separate `args`; env key is `environment`, not `env`)
 *   - remote: { type: "remote", url, headers? }   (covers http and sse)
 * The file is JSONC for opencode itself, so reads are comment-tolerant;
 * writes are plain JSON (comments end up only in the pre-write snapshot).
 */
export class OpencodeMcpAdapter implements McpAdapter {
  private readonly filePath: string;

  constructor(opts: { path: string }) {
    this.filePath = opts.path;
  }

  configPath(): string {
    return this.filePath;
  }

  async list(): Promise<InstalledMcpServer[]> {
    const obj = await this.read();
    const servers = (obj.mcp ?? {}) as Record<
      string,
      { type?: string; command?: string[]; url?: string }
    >;
    return Object.entries(servers).map(([id, def]) => {
      const cmd = Array.isArray(def.command) ? def.command : [];
      return {
        id,
        name: id,
        command: def.type === 'remote' ? (def.url ?? '') : (cmd[0] ?? ''),
        args: def.type === 'remote' ? undefined : cmd.length > 1 ? cmd.slice(1) : undefined,
      };
    });
  }

  async install(server: McpServerManifest): Promise<void> {
    const obj = await this.read();
    const map = (obj.mcp ??= {}) as Record<string, unknown>;
    const transport = server.transport ?? 'stdio';
    let entry: Record<string, unknown>;
    if (transport === 'http' || transport === 'sse') {
      if (!server.url) {
        throw new Error(`MCP server ${server.id} uses ${transport} transport but has no url`);
      }
      entry = { type: 'remote', url: server.url };
      if (server.headers && Object.keys(server.headers).length > 0) {
        entry.headers = { ...server.headers };
      }
    } else {
      if (!server.command) {
        throw new Error(`MCP server ${server.id} uses stdio transport but has no command`);
      }
      entry = { type: 'local', command: [server.command, ...(server.args ?? [])] };
      if (server.env && Object.keys(server.env).length > 0) {
        entry.environment = Object.fromEntries(
          Object.keys(server.env).map((k) => [k, process.env[k] ?? '']),
        );
      }
    }
    map[server.id] = entry;
    await this.write(obj);
  }

  async uninstall(id: string): Promise<void> {
    const obj = await this.read();
    if (!obj.mcp || typeof obj.mcp !== 'object') return;
    const map = obj.mcp as Record<string, unknown>;
    if (!(id in map)) return;
    delete map[id];
    await this.write(obj);
  }

  private async read(): Promise<Record<string, unknown>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = parseJsonc(raw);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw err;
    }
  }

  private async write(obj: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  }
}
