/**
 * Claude Code ToolProvider. Installs via `npm i -g @anthropic-ai/claude-code`,
 * detects via `which claude` + `claude --version`, doctor checks the
 * settings file at `~/.claude/settings.json`.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { JsonSettingsAdapter } from '../../settings/index.js';
import { ClaudeCodeSkillAdapter } from '../../skill/index.js';
import { whichCmd } from '../../utils/which.js';
import { parseVersion } from '../../utils/version.js';
import type {
  DetectResult,
  HealthReport,
  InstallOpts,
  ToolProvider,
} from '../types.js';

const execFileP = promisify(execFile);

const NPM_PACKAGE = '@anthropic-ai/claude-code';
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

const settingsAdapter = new JsonSettingsAdapter({ path: SETTINGS_PATH });
const skillAdapter = new ClaudeCodeSkillAdapter();

async function tryExec(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string } | undefined> {
  try {
    const { stdout, stderr } = await execFileP(cmd, args);
    return { stdout, stderr };
  } catch {
    return undefined;
  }
}

export const claudeCodeProvider: ToolProvider = {
  id: 'claude-code',
  name: 'Claude Code',
  description: "Anthropic's official AI coding CLI",
  homepage: 'https://claude.ai/code',
  supportedPlatforms: ['macos', 'linux'],
  installMethods: ['npm', 'bun'],

  async detect(): Promise<DetectResult> {
    const binPath = await whichCmd('claude');
    if (!binPath) return { installed: false };
    const ver = await tryExec('claude', ['--version']);
    const version = parseVersion(ver?.stdout);
    return { installed: true, path: binPath, version };
  },

  async install(opts: InstallOpts = {}): Promise<void> {
    const method = opts.method ?? 'npm';
    const spec = opts.version ? `${NPM_PACKAGE}@${opts.version}` : NPM_PACKAGE;

    let cmd: string;
    let args: string[];
    if (method === 'bun') {
      cmd = 'bun';
      args = ['add', '-g', spec];
    } else {
      cmd = 'npm';
      args = ['install', '-g', spec];
    }

    if (opts.dryRun) {
      // Caller is responsible for printing; we just no-op the side-effect.
      return;
    }
    await execFileP(cmd, args);
  },

  async uninstall(): Promise<void> {
    // Prefer npm; fall back silently if it isn't installed by npm.
    try {
      await execFileP('npm', ['uninstall', '-g', NPM_PACKAGE]);
      return;
    } catch {
      /* try bun next */
    }
    try {
      await execFileP('bun', ['remove', '-g', NPM_PACKAGE]);
    } catch {
      /* swallow — uninstall is best-effort */
    }
  },

  async update(): Promise<void> {
    // Same as install with `@latest`.
    await this.install({ version: 'latest' });
  },

  async doctor(): Promise<HealthReport> {
    const issues: string[] = [];
    const det = await this.detect();
    if (!det.installed) issues.push(`claude-code is not installed`);
    try {
      await fs.access(SETTINGS_PATH);
    } catch {
      issues.push(`Not configured yet (run clihub wizard) — no settings file: ${SETTINGS_PATH}`);
    }
    return { healthy: issues.length === 0, issues };
  },

  settingsAdapter,
  skillAdapter,
};
