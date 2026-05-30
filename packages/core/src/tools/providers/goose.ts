/**
 * Goose CLI ToolProvider (Block). Installs via the official
 * download script, or Homebrew on macOS. Config lives under
 * `~/.config/goose/` (YAML). We only read/exist-check the dir for
 * doctor; clihub does not parse goose's YAML config yet.
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

const CONFIG_DIR = path.join(os.homedir(), '.config', 'goose');
// goose stores YAML; clihub only exists-checks this for now.
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');
const settingsAdapter = new JsonSettingsAdapter({ path: CONFIG_PATH });

const INSTALL_SCRIPT =
  'curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | bash';

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

export const gooseProvider: ToolProvider = {
  id: 'goose',
  name: 'Goose',
  description: 'Block Goose — open-source, extensible AI agent',
  homepage: 'https://block.github.io/goose/',
  supportedPlatforms: ['macos', 'linux'],
  installMethods: ['curl', 'brew'],

  async detect(): Promise<DetectResult> {
    const binPath = await whichCmd('goose');
    if (!binPath) return { installed: false };
    const ver = await tryExec('goose', ['--version']);
    return { installed: true, path: binPath, version: parseVersion(ver?.stdout) };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    if (opts.dryRun) return;
    const hasBrew = !!(await tryExec('brew', ['--version']));
    if (opts.method === 'brew' || (opts.method === undefined && process.platform === 'darwin' && hasBrew)) {
      await execFileP('brew', ['install', 'block-goose-cli']);
      return;
    }
    await execFileP('sh', ['-c', INSTALL_SCRIPT]);
  },

  async uninstall(): Promise<void> {
    try { await execFileP('brew', ['uninstall', 'block-goose-cli']); return; } catch { /* try manual */ }
    const binPath = await whichCmd('goose');
    if (binPath) await fs.rm(binPath, { force: true });
  },

  async update(): Promise<void> {
    const hasBrew = !!(await tryExec('brew', ['--version']));
    if (hasBrew) {
      try { await execFileP('brew', ['upgrade', 'block-goose-cli']); return; } catch { /* fall through */ }
    }
    await this.install({});
  },

  async doctor(): Promise<HealthReport> {
    const issues: string[] = [];
    const det = await this.detect();
    if (!det.installed) issues.push('goose is not installed');
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      issues.push(`Not configured yet (run clihub wizard) — no config dir: ${CONFIG_DIR}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
};
