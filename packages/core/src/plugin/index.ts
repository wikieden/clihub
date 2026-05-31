/**
 * Plugin adapters.
 *
 * A plugin is a git repository cloned into a per-CLI directory:
 *   · Claude Code → ~/.claude/plugins/<id>/
 *   · (other CLIs may add their own conventions in future)
 *
 * `GitClonePluginAdapter` provides the generic git-clone strategy. Each
 * CLI provider exposes a singleton bound to its plugin root path.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { InstalledPlugin, PluginManifest } from '../types.js';

const execFileP = promisify(execFile);

export interface PluginAdapter {
  /** List plugins currently installed under the CLI's plugins directory. */
  list(): Promise<InstalledPlugin[]>;
  /** Clone the plugin's source repo. Idempotent — re-runs `git pull` if the dir exists. */
  install(plugin: PluginManifest): Promise<void>;
  /** Remove a plugin directory. No-op if absent. */
  uninstall(id: string): Promise<void>;
  /** `git pull` an installed plugin to refresh it. Throws if not installed. */
  update(id: string): Promise<void>;
  /** Base directory the adapter manages (e.g. `~/.claude/plugins`). */
  rootDir(): string;
}

export interface GitClonePluginAdapterOpts {
  /** Absolute path of the directory that holds plugin checkouts. */
  rootDir: string;
}

export class GitClonePluginAdapter implements PluginAdapter {
  private readonly root: string;

  constructor(opts: GitClonePluginAdapterOpts) {
    this.root = opts.rootDir;
  }

  rootDir(): string {
    return this.root;
  }

  async list(): Promise<InstalledPlugin[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }

    const out: InstalledPlugin[] = [];
    for (const name of entries) {
      const dir = path.join(this.root, name);
      const stat = await fs.stat(dir).catch(() => undefined);
      if (!stat?.isDirectory()) continue;
      const isGit = await fs.access(path.join(dir, '.git')).then(() => true).catch(() => false);
      if (!isGit) continue;
      const version = await this.gitDescribe(dir);
      out.push({ id: name, name, version, path: dir });
    }
    return out;
  }

  async install(plugin: PluginManifest): Promise<void> {
    if (!plugin.source) {
      throw new Error(`Plugin ${plugin.id} has no source — cannot install.`);
    }
    await fs.mkdir(this.root, { recursive: true });
    const target = path.join(this.root, plugin.id);
    const existing = await fs.access(path.join(target, '.git')).then(() => true).catch(() => false);
    if (existing) {
      await execFileP('git', ['-C', target, 'pull', '--ff-only']);
      return;
    }
    await execFileP('git', ['clone', '--depth=1', plugin.source, target]);
  }

  async uninstall(id: string): Promise<void> {
    const target = path.join(this.root, id);
    await fs.rm(target, { recursive: true, force: true });
  }

  async update(id: string): Promise<void> {
    const target = path.join(this.root, id);
    const exists = await fs.access(path.join(target, '.git')).then(() => true).catch(() => false);
    if (!exists) throw new Error(`Plugin ${id} is not installed at ${target}`);
    await execFileP('git', ['-C', target, 'pull', '--ff-only']);
  }

  private async gitDescribe(dir: string): Promise<string> {
    try {
      const { stdout } = await execFileP('git', ['-C', dir, 'rev-parse', '--short', 'HEAD']);
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }
}

/**
 * Claude Code's plugin directory (`~/.claude/plugins/`). NOTE: modern Claude
 * Code loads plugins via *marketplaces* (`claude plugin marketplace add` +
 * `claude plugin install`, tracked in `enabledPlugins`), so a bare clone here is
 * not auto-discovered. This adapter is the legacy clone strategy; the CLI prints
 * the marketplace commands to run with Claude's own `claude plugin`.
 */
export class ClaudeCodePluginAdapter extends GitClonePluginAdapter {
  constructor() {
    super({ rootDir: path.join(os.homedir(), '.claude', 'plugins') });
  }
}
