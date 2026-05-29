/**
 * `clihub team` (v1.2.0, Pillar III + VII — shared team config).
 *
 * Share a reproducible toolchain across a team through a plain git repo —
 * no clihub-specific backend. clihub clones the team repo into
 * `~/.clihub/team/<name>` and copies the committed config files in/out of
 * the working directory:
 *
 *   - addTeam(name, gitUrl)   → clone the team config repo
 *   - pullTeam(name)          → git pull --ff-only
 *   - applyTeam(name, cwd)    → copy team files INTO the project
 *   - pushTeam(name, cwd)     → copy project files into the repo + push
 *
 * Team config is not secret (it pins versions, lists skills), so it is
 * NOT encrypted — sign the catalog with `clihub catalog sign` for
 * authenticity. Personal secrets stay in the OS keychain; use
 * `clihub sync` for encrypted personal config.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/** Config files shared through a team repo (copied in/out of the project root). */
export const TEAM_FILES = [
  'clihub.yaml',
  'clihub.lock.json',
  'clihub.memory.md',
  'clihub.schema.json',
];

export interface TeamIoOpts {
  /** Override the team root (default ~/.clihub/team). */
  root?: string;
}

export function defaultTeamRoot(): string {
  return path.join(os.homedir(), '.clihub', 'team');
}

function teamDir(name: string, root: string): string {
  return path.join(root, name);
}

function validateName(name: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) throw new Error(`invalid team name: ${name}`);
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileP('git', args, { cwd });
  return stdout;
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}

/** Clone a team config repo into ~/.clihub/team/<name>. */
export async function addTeam(name: string, gitUrl: string, opts: TeamIoOpts = {}): Promise<string> {
  validateName(name);
  const root = opts.root ?? defaultTeamRoot();
  const dir = teamDir(name, root);
  if (await exists(dir)) throw new Error(`team "${name}" already exists (${dir}); remove it first`);
  await fs.mkdir(root, { recursive: true });
  await execFileP('git', ['clone', gitUrl, dir]);
  return dir;
}

export async function listTeams(opts: TeamIoOpts = {}): Promise<string[]> {
  const root = opts.root ?? defaultTeamRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function removeTeam(name: string, opts: TeamIoOpts = {}): Promise<boolean> {
  validateName(name);
  const dir = teamDir(name, opts.root ?? defaultTeamRoot());
  if (!(await exists(dir))) return false;
  await fs.rm(dir, { recursive: true, force: true });
  return true;
}

/** git pull --ff-only the team repo. */
export async function pullTeam(name: string, opts: TeamIoOpts = {}): Promise<void> {
  validateName(name);
  const dir = teamDir(name, opts.root ?? defaultTeamRoot());
  if (!(await exists(dir))) throw new Error(`team "${name}" not found; run \`clihub team add ${name} <git-url>\``);
  await git(['pull', '--ff-only'], dir);
}

export interface TeamSyncResult {
  files: string[];
}

/** Copy team config files FROM the repo INTO the project (cwd). */
export async function applyTeam(name: string, cwd: string, opts: TeamIoOpts = {}): Promise<TeamSyncResult> {
  validateName(name);
  const dir = teamDir(name, opts.root ?? defaultTeamRoot());
  if (!(await exists(dir))) throw new Error(`team "${name}" not found`);
  const files: string[] = [];
  for (const f of TEAM_FILES) {
    const src = path.join(dir, f);
    if (await exists(src)) {
      await fs.copyFile(src, path.join(cwd, f));
      files.push(f);
    }
  }
  return { files };
}

/** Copy project config files into the repo, commit, and push. */
export async function pushTeam(
  name: string,
  cwd: string,
  message: string,
  opts: TeamIoOpts = {},
): Promise<TeamSyncResult> {
  validateName(name);
  const dir = teamDir(name, opts.root ?? defaultTeamRoot());
  if (!(await exists(dir))) throw new Error(`team "${name}" not found`);
  const files: string[] = [];
  for (const f of TEAM_FILES) {
    const src = path.join(cwd, f);
    if (await exists(src)) {
      await fs.copyFile(src, path.join(dir, f));
      files.push(f);
    }
  }
  if (files.length === 0) throw new Error('no clihub config files in this directory to push');
  await git(['add', '-A'], dir);
  try {
    await git(['commit', '-m', message || 'clihub: update team config'], dir);
  } catch {
    // nothing to commit — fall through to push (a no-op remotely)
  }
  await git(['push', 'origin', 'HEAD'], dir);
  return { files };
}
