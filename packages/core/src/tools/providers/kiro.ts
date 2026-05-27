/**
 * Kiro CLI ToolProvider (AWS). Installs via curl or brew.
 * Settings live at ~/.kiro/. No skill adapter in v0.1.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { JsonSettingsAdapter } from '../../settings/index.js';
import type {
  DetectResult,
  HealthReport,
  InstallOpts,
  ToolProvider,
} from '../types.js';

const execFileP = promisify(execFile);

const CONFIG_DIR = path.join(os.homedir(), '.kiro');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
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

export const kiroProvider: ToolProvider = {
  id: 'kiro-cli',
  name: 'Kiro CLI',
  description: 'AWS Kiro — AI coding agent by Amazon',
  homepage: 'https://kiro.dev',
  supportedPlatforms: ['macos', 'linux'],
  installMethods: ['curl', 'brew'],

  async detect(): Promise<DetectResult> {
    const which = await tryExec('which', ['kiro']);
    if (!which?.stdout.trim()) return { installed: false };
    const binPath = which.stdout.trim();
    const ver = await tryExec('kiro', ['--version']);
    const version = ver?.stdout.trim().split(/\s+/)[0];
    return { installed: true, path: binPath, version };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    if (opts.dryRun) return;
    const platform = process.platform;
    const hasBrew = !!(await tryExec('brew', ['--version']));

    if (opts.method === 'brew' || (opts.method === undefined && platform === 'darwin' && hasBrew)) {
      await execFileP('brew', ['install', '--cask', 'kiro']);
      return;
    }

    const installPage = 'https://kiro.dev/downloads';
    throw new Error(
      `Kiro CLI has no scripted installer on ${platform}.\n` +
      `Install methods:\n` +
      `  • macOS:  brew install --cask kiro  (or download from ${installPage})\n` +
      `  • Linux:  download .deb / .tar.gz from ${installPage}\n` +
      `  • Windows: download .msi from ${installPage}\n` +
      `Once installed, run \`clihub doctor kiro-cli\` to verify.`,
    );
  },

  async uninstall(): Promise<void> {
    try { await execFileP('brew', ['uninstall', '--cask', 'kiro']); return; } catch { /* try manual */ }
    const binPath = (await tryExec('which', ['kiro']))?.stdout.trim();
    if (binPath) await fs.rm(binPath, { force: true });
  },

  async update(): Promise<void> {
    const hasBrew = !!(await tryExec('brew', ['--version']));
    if (hasBrew) {
      await execFileP('brew', ['upgrade', '--cask', 'kiro']);
    } else {
      await this.install({});
    }
  },

  async doctor(): Promise<HealthReport> {
    const issues: string[] = [];
    const det = await this.detect();
    if (!det.installed) issues.push('kiro is not installed');
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      issues.push(`Config directory missing: ${CONFIG_DIR}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
};
