/**
 * Codex CLI ToolProvider. Installs via `npm i -g @openai/codex`.
 * Settings live at ~/.codex/config.toml (TOML, not JSON).
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { TomlSettingsAdapter } from '../../settings/toml.js';
import { whichCmd } from '../../utils/which.js';
import { parseVersion } from '../../utils/version.js';
import type {
  DetectResult,
  HealthReport,
  InstallOpts,
  ToolProvider,
} from '../types.js';

const execFileP = promisify(execFile);

const NPM_PACKAGE = '@openai/codex';
const CONFIG_DIR = path.join(os.homedir(), '.codex');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.toml');

const settingsAdapter = new TomlSettingsAdapter({ path: CONFIG_PATH });

async function tryExec(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string } | undefined> {
  try {
    return await execFileP(cmd, args);
  } catch {
    return undefined;
  }
}

export const codexProvider: ToolProvider = {
  id: 'codex',
  name: 'Codex CLI',
  description: 'OpenAI Codex CLI — AI coding agent in the terminal',
  homepage: 'https://github.com/openai/codex',
  supportedPlatforms: ['macos', 'linux'],
  installMethods: ['npm', 'bun'],

  async detect(): Promise<DetectResult> {
    const binPath = await whichCmd('codex');
    if (!binPath) return { installed: false };
    const ver = await tryExec('codex', ['--version']);
    const version = parseVersion(ver?.stdout);
    return { installed: true, path: binPath, version };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    const method = opts.method ?? 'npm';
    const spec = opts.version ? `${NPM_PACKAGE}@${opts.version}` : NPM_PACKAGE;
    if (opts.dryRun) return;
    if (method === 'bun') {
      await execFileP('bun', ['add', '-g', spec]);
    } else {
      await execFileP('npm', ['install', '-g', spec]);
    }
  },

  async uninstall(): Promise<void> {
    try { await execFileP('npm', ['uninstall', '-g', NPM_PACKAGE]); return; } catch { /* try bun */ }
    try { await execFileP('bun', ['remove', '-g', NPM_PACKAGE]); } catch { /* best-effort */ }
  },

  async update(): Promise<void> {
    await this.install({ version: 'latest' });
  },

  async doctor(): Promise<HealthReport> {
    const issues: string[] = [];
    const det = await this.detect();
    if (!det.installed) issues.push('codex is not installed');
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      issues.push(`Not configured yet (run clihub wizard) — no config dir: ${CONFIG_DIR}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
};
