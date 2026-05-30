/**
 * Gemini CLI ToolProvider (Google). Installs via npm.
 * Settings live at ~/.gemini/. No skill adapter in v0.1.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { JsonSettingsAdapter } from '../../settings/index.js';
import { whichCmd } from '../../utils/which.js';
import { parseVersion } from '../../utils/version.js';
import type {
  DetectResult,
  HealthReport,
  InstallOpts,
  ToolProvider,
} from '../types.js';

const execFileP = promisify(execFile);

const NPM_PACKAGE = '@google/gemini-cli';
const CONFIG_DIR = path.join(os.homedir(), '.gemini');
const CONFIG_PATH = path.join(CONFIG_DIR, 'settings.json');
const settingsAdapter = new JsonSettingsAdapter({ path: CONFIG_PATH });

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

export const geminiProvider: ToolProvider = {
  id: 'gemini-cli',
  name: 'Gemini CLI',
  description: 'Google Gemini CLI — AI coding agent in the terminal',
  homepage: 'https://github.com/google-gemini/gemini-cli',
  supportedPlatforms: ['macos', 'linux'],
  installMethods: ['npm', 'bun'],

  async detect(): Promise<DetectResult> {
    const binPath = await whichCmd('gemini');
    if (!binPath) return { installed: false };
    const ver = await tryExec('gemini', ['--version']);
    const version = parseVersion(ver?.stdout);
    return { installed: true, path: binPath, version };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    if (opts.dryRun) return;
    const method = opts.method ?? 'npm';
    const spec = opts.version ? `${NPM_PACKAGE}@${opts.version}` : NPM_PACKAGE;
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
    if (!det.installed) issues.push('gemini is not installed');
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      issues.push(`Not configured yet (run clihub wizard) — no config dir: ${CONFIG_DIR}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
};
