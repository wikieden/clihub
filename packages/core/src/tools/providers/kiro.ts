/**
 * Kiro CLI ToolProvider (AWS). Official installer:
 *   curl -fsSL https://cli.kiro.dev/install | bash
 * Installs `kiro-cli` (+ kiro-cli-chat / kiro-cli-term) into ~/.local/bin.
 * The command is `kiro-cli` (NOT `kiro`). Settings live at ~/.kiro/.
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
  installMethods: ['curl'],

  async detect(): Promise<DetectResult> {
    const binPath = await whichCmd('kiro-cli');
    if (!binPath) return { installed: false };
    const ver = await tryExec('kiro-cli', ['--version']);
    const version = parseVersion(ver?.stdout);
    return { installed: true, path: binPath, version };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    if (opts.dryRun) return;
    if (process.platform === 'win32') {
      throw new Error(
        'On Windows, install Kiro CLI from https://kiro.dev/cli/ (the curl installer needs a POSIX shell).',
      );
    }
    // Official one-line installer (macOS + Linux). Non-interactive on a fresh
    // install; installs kiro-cli into ~/.local/bin.
    await execFileP('bash', ['-c', 'curl -fsSL https://cli.kiro.dev/install | bash']);
    // ~/.local/bin may not be on PATH yet — detect() will miss it until then.
  },

  async uninstall(): Promise<void> {
    const binDir = path.join(os.homedir(), '.local', 'bin');
    for (const name of ['kiro-cli', 'kiro-cli-chat', 'kiro-cli-term']) {
      await fs.rm(path.join(binDir, name), { force: true }).catch(() => {});
    }
    const binPath = await whichCmd('kiro-cli');
    if (binPath) await fs.rm(binPath, { force: true }).catch(() => {});
  },

  async update(): Promise<void> {
    await this.install({});
  },

  async doctor(): Promise<HealthReport> {
    const issues: string[] = [];
    const det = await this.detect();
    if (!det.installed) issues.push('kiro is not installed');
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      issues.push(`Not configured yet (run clihub wizard) — no config dir: ${CONFIG_DIR}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
};
