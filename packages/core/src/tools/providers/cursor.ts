/**
 * Cursor CLI ToolProvider. Installs the Cursor agent CLI via the
 * official `curl https://cursor.com/install -fsS | bash` script.
 *
 * The installed binary has been shipped as both `cursor-agent` and
 * `agent` across versions, so detection tries both. Config lives under
 * `~/.cursor/`.
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

const CONFIG_DIR = path.join(os.homedir(), '.cursor');
const CONFIG_PATH = path.join(CONFIG_DIR, 'cli-config.json');
const settingsAdapter = new JsonSettingsAdapter({ path: CONFIG_PATH });

const BIN_CANDIDATES = ['cursor-agent', 'agent'] as const;

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

async function resolveBin(): Promise<{ bin: string; path: string } | undefined> {
  for (const bin of BIN_CANDIDATES) {
    const p = await whichCmd(bin);
    if (p) return { bin, path: p };
  }
  return undefined;
}

export const cursorProvider: ToolProvider = {
  id: 'cursor',
  name: 'Cursor CLI',
  description: 'Cursor agent CLI — terminal coding agent by Anysphere',
  homepage: 'https://cursor.com/cli',
  supportedPlatforms: ['macos', 'linux'],
  installMethods: ['curl'],

  async detect(): Promise<DetectResult> {
    const found = await resolveBin();
    if (!found) return { installed: false };
    const ver = await tryExec(found.bin, ['--version']);
    return { installed: true, path: found.path, version: parseVersion(ver?.stdout) };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    if (opts.dryRun) return;
    // Official installer. No npm package; curl|bash is the supported path.
    await execFileP('sh', ['-c', 'curl https://cursor.com/install -fsS | bash']);
  },

  async uninstall(): Promise<void> {
    const found = await resolveBin();
    if (found) await fs.rm(found.path, { force: true });
  },

  async update(): Promise<void> {
    // Re-running the installer upgrades in place.
    await this.install({});
  },

  async doctor(): Promise<HealthReport> {
    const issues: string[] = [];
    const det = await this.detect();
    if (!det.installed) issues.push('cursor agent is not installed');
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      issues.push(`Config directory missing: ${CONFIG_DIR}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
};
