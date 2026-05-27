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
import { ClaudeCodeSkillAdapter } from '../skill/index.js';
import { CodexSkillAdapter } from '../skill/codex-adapter.js';
import { KiroCliSkillAdapter } from '../skill/kiro-adapter.js';
import { GeminiCliSkillAdapter } from '../skill/gemini-adapter.js';
import { JsonMcpAdapter } from '../mcp/index.js';
import { listProviders } from '../tools/registry.js';
import type { SkillSyncAdapter } from '../tools/types.js';

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

const SKILL_ADAPTERS: Record<string, () => SkillSyncAdapter> = {
  'claude-code': () => new ClaudeCodeSkillAdapter(),
  'codex': () => new CodexSkillAdapter(),
  'kiro-cli': () => new KiroCliSkillAdapter(),
  'gemini-cli': () => new GeminiCliSkillAdapter(),
};

/** CLIs whose MCP servers live under `<settings>.mcpServers` (JSON shape). */
const JSON_MCP_PATHS: Record<string, string> = {
  'claude-code': path.join(os.homedir(), '.claude', 'settings.json'),
  'gemini-cli': path.join(os.homedir(), '.gemini', 'settings.json'),
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function runHealthMatrix(): Promise<ToolHealthRow[]> {
  const providers = listProviders();
  const rows: ToolHealthRow[] = [];

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

    let mcpCount: number | undefined;
    const jsonMcpPath = JSON_MCP_PATHS[provider.id];
    if (jsonMcpPath && det.installed) {
      try {
        mcpCount = (await new JsonMcpAdapter({ path: jsonMcpPath }).list()).length;
      } catch {
        mcpCount = undefined;
      }
    }

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
