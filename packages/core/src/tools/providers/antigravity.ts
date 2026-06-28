/**
 * Antigravity CLI ToolProvider (Google). The Gemini CLI successor (Google
 * transitioned Gemini CLI → Antigravity CLI at I/O 2026). Official installer:
 *   curl -fsSL https://antigravity.google/cli/install.sh | bash
 * Installs the `agy` binary into ~/.local/bin and runs `agy install`. Auth is
 * the system keyring + Google sign-in (no creds file). Config lives under
 * ~/.gemini/antigravity-cli/ (it reuses the ~/.gemini home): settings.json,
 * mcp_config.json (MCP servers, supports `url`), and skills/.
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

const CONFIG_DIR = path.join(os.homedir(), '.gemini', 'antigravity-cli');
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

export const antigravityProvider: ToolProvider = {
  id: 'antigravity',
  name: 'Antigravity',
  description: 'Google Antigravity CLI — the Gemini CLI successor (agy)',
  homepage: 'https://antigravity.google',
  supportedPlatforms: ['macos', 'linux'],
  installMethods: ['curl'],

  async detect(): Promise<DetectResult> {
    const binPath = await whichCmd('agy');
    if (!binPath) return { installed: false };
    const ver = await tryExec('agy', ['--version']);
    const version = parseVersion(ver?.stdout);
    return { installed: true, path: binPath, version };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    if (opts.dryRun) return;
    if (process.platform === 'win32') {
      throw new Error(
        'On Windows, install Antigravity CLI with: irm https://antigravity.google/cli/install.ps1 | iex',
      );
    }
    // Official one-line installer (macOS + Linux). Installs `agy` into
    // ~/.local/bin and runs `agy install` to wire the shell.
    await execFileP('bash', ['-c', 'curl -fsSL https://antigravity.google/cli/install.sh | bash']);
    // ~/.local/bin may not be on PATH yet — detect() will miss it until then.
  },

  async uninstall(): Promise<void> {
    const binDir = path.join(os.homedir(), '.local', 'bin');
    await fs.rm(path.join(binDir, 'agy'), { force: true }).catch(() => {});
    const binPath = await whichCmd('agy');
    if (binPath) await fs.rm(binPath, { force: true }).catch(() => {});
  },

  async update(): Promise<void> {
    await this.install({});
  },

  async doctor(): Promise<HealthReport> {
    const issues: string[] = [];
    const det = await this.detect();
    if (!det.installed) issues.push('agy is not installed');
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      issues.push(`Not configured yet (run clihub wizard) — no config dir: ${CONFIG_DIR}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
};
