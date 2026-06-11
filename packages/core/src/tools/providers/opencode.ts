/**
 * OpenCode ToolProvider (opencode.ai, GitHub anomalyco/opencode — formerly
 * sst/opencode). Verified 2026-06-11 against the official docs + install
 * script + npm registry:
 *   - binary `opencode`; `--version` prints bare semver (no "v"; dev builds
 *     print "local")
 *   - npm package `opencode-ai` (platform binaries via optionalDependencies),
 *     so npm installs support version pin/rollback; the official curl script
 *     installs to the hardcoded ~/.opencode/bin (often not on PATH for
 *     GUI-spawned processes — detect probes it explicitly)
 *   - config: ~/.config/opencode/opencode.json, parsed as JSONC by the CLI
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { JsoncSettingsAdapter } from '../../settings/jsonc.js';
import { whichCmd } from '../../utils/which.js';
import { parseVersion } from '../../utils/version.js';
import type {
  DetectResult,
  HealthReport,
  InstallOpts,
  ToolProvider,
} from '../types.js';

const execFileP = promisify(execFile);

const NPM_PACKAGE = 'opencode-ai';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const CONFIG_PATH = path.join(CONFIG_DIR, 'opencode.json');
/** Install dir hardcoded in the official `curl https://opencode.ai/install` script. */
const SCRIPT_BIN = path.join(os.homedir(), '.opencode', 'bin', 'opencode');
const settingsAdapter = new JsoncSettingsAdapter({ path: CONFIG_PATH });

async function tryExec(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string } | undefined> {
  try {
    return await execFileP(cmd, args);
  } catch {
    return undefined;
  }
}

async function resolveBin(): Promise<string | undefined> {
  const onPath = await whichCmd('opencode');
  if (onPath) return onPath;
  try {
    await fs.access(SCRIPT_BIN);
    return SCRIPT_BIN;
  } catch {
    return undefined;
  }
}

export const opencodeProvider: ToolProvider = {
  id: 'opencode',
  name: 'OpenCode',
  description: 'OpenCode — open-source AI coding agent for the terminal',
  homepage: 'https://opencode.ai',
  supportedPlatforms: ['macos', 'linux'],
  installMethods: ['npm', 'bun', 'curl'],

  async detect(): Promise<DetectResult> {
    const bin = await resolveBin();
    if (!bin) return { installed: false };
    const ver = await tryExec(bin, ['--version']);
    // Output is a bare semver ("1.17.3") or "local" for dev builds.
    return { installed: true, path: bin, version: parseVersion(ver?.stdout) ?? ver?.stdout.trim() };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    if (opts.dryRun) return;
    const method = opts.method ?? 'npm';
    if (method === 'curl') {
      await execFileP('sh', ['-c', 'curl -fsSL https://opencode.ai/install | bash']);
      return;
    }
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
    if (!det.installed) issues.push('opencode is not installed');
    try {
      await fs.access(CONFIG_DIR);
    } catch {
      issues.push(`Not configured yet (run clihub wizard) — no config dir: ${CONFIG_DIR}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
};
