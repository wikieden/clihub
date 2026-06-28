/**
 * Cross-CLI health matrix.
 *
 * Collects one row per registered tool provider:
 *   · install status + version + binary path
 *   · settings file path + whether it exists
 *   · installed skill count (via the matching skill adapter, when present)
 *   · MCP server count (via JsonMcpAdapter, for JSON-shaped settings)
 *   · issue list from the provider's own `doctor()`
 *
 * Consumed by the `clihub doctor` CLI command and by the TUI's
 * cross-tool "Doctor across every CLI" action. UIs are free to render
 * the matrix as a table, a list, or JSON.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SKILL_ADAPTERS } from '../skill/registry.js';
import { listMcp } from '../mcp/manage.js';
import { listProviders } from '../tools/registry.js';
import type { SkillSyncAdapter } from '../tools/types.js';
import { loadConfig, resolveProxy, proxyEnvVector, type ClihubConfig } from '../config/index.js';

export interface ToolHealthRow {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  binPath?: string;
  settingsPath: string;
  settingsExists: boolean;
  skillCount?: number;
  mcpCount?: number;
  issues: string[];
}


async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Vendor endpoints used by `probeNetwork`. Public URLs only. */
const PROBE_HOSTS: Record<string, string> = {
  'claude-code': 'https://api.anthropic.com',
  codex: 'https://api.openai.com',
  'antigravity': 'https://antigravity.google',
  'kiro-cli': 'https://kiro.dev',
};

export interface RepairAction {
  toolId: string;
  action: string;
  ok: boolean;
  detail?: string;
}

export interface RepairResult {
  attempted: RepairAction[];
}

export interface NetworkProbe {
  toolId: string;
  host: string;
  proxy?: string;
  status?: number;
  latencyMs?: number;
  error?: string;
}

/**
 * Try to fix common config drift without user input:
 *   - missing settings directory  → mkdir -p
 *   - missing catalog dir         → noop (sync command does it)
 *   - missing skills dir          → mkdir -p
 * No-ops for issues we can't safely fix without confirmation.
 */
export async function attemptAutoRepair(
  rows: ToolHealthRow[] = [],
): Promise<RepairResult> {
  const actions: RepairAction[] = [];
  for (const row of rows.length ? rows : await runHealthMatrix()) {
    if (!row.installed) continue;
    const settingsDir = path.dirname(row.settingsPath);
    try {
      await fs.access(settingsDir);
    } catch {
      try {
        await fs.mkdir(settingsDir, { recursive: true });
        actions.push({
          toolId: row.id,
          action: `mkdir ${settingsDir}`,
          ok: true,
        });
      } catch (err) {
        actions.push({
          toolId: row.id,
          action: `mkdir ${settingsDir}`,
          ok: false,
          detail: String(err),
        });
      }
    }
  }
  return { attempted: actions };
}

/**
 * Probe each installed CLI's primary vendor API host through the
 * resolved clihub proxy. Reports status code + latency; no auth.
 */
export async function probeNetwork(
  cfg?: ClihubConfig,
): Promise<NetworkProbe[]> {
  const config = cfg ?? (await loadConfig());
  const env = { ...process.env, ...proxyEnvVector(config) } as NodeJS.ProcessEnv;
  const out: NetworkProbe[] = [];
  for (const provider of listProviders()) {
    const det = await provider.detect();
    if (!det.installed) continue;
    const host = PROBE_HOSTS[provider.id];
    if (!host) continue;
    const proxy = resolveProxy(host, config, env);
    const started = Date.now();
    try {
      const res = await fetch(host, { signal: AbortSignal.timeout(5000) });
      out.push({
        toolId: provider.id,
        host,
        proxy,
        status: res.status,
        latencyMs: Date.now() - started,
      });
    } catch (e) {
      out.push({
        toolId: provider.id,
        host,
        proxy,
        latencyMs: Date.now() - started,
        error: String(e),
      });
    }
  }
  return out;
}

export async function runHealthMatrix(): Promise<ToolHealthRow[]> {
  const providers = listProviders();
  const rows: ToolHealthRow[] = [];

  // MCP counts come from the single source of truth (manage.ts), which knows
  // each CLI's real config + format: Claude ~/.claude.json, Gemini/Qwen
  // settings.json, Codex config.toml [mcp_servers]. Computed once.
  const mcpCounts = new Map<string, number>();
  try {
    for (const row of await listMcp({})) mcpCounts.set(row.tool, row.servers.length);
  } catch { /* best-effort */ }

  for (const provider of providers) {
    const det = await provider.detect();
    const settingsPath = provider.settingsAdapter.configPath();
    const settingsExists = await fileExists(settingsPath);

    let skillCount: number | undefined;
    const skillFactory = SKILL_ADAPTERS[provider.id];
    if (skillFactory && det.installed) {
      try {
        skillCount = (await skillFactory().list()).length;
      } catch {
        skillCount = undefined;
      }
    }

    const mcpCount: number | undefined =
      det.installed && mcpCounts.has(provider.id) ? mcpCounts.get(provider.id) : undefined;

    const report = await provider.doctor();

    rows.push({
      id: provider.id,
      name: provider.name,
      installed: det.installed,
      version: det.version,
      binPath: det.path,
      settingsPath,
      settingsExists,
      skillCount,
      mcpCount,
      issues: report.issues,
    });
  }

  return rows;
}
