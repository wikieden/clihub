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

export interface JsonMcpAdapterOpts {
  /** Absolute path of the JSON settings file. */
  path: string;
}

export class JsonMcpAdapter implements McpAdapter {
  private readonly filePath: string;

  constructor(opts: JsonMcpAdapterOpts) {
    this.filePath = opts.path;
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
      entry = { type: transport, url: server.url };
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
