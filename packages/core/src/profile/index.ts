/**
 * Profile manager for multi-account workflows (Pillar IX).
 *
 * On-disk layout:
 *
 *   ~/.clihub/
 *   ├── current-profile -> profiles/<name>   (symlink)
 *   └── profiles/
 *       └── <name>/
 *           ├── meta.json
 *           ├── .claude/
 *           ├── .codex/
 *           ├── .gemini/
 *           └── .kiro/
 *
 * Activation strategy (v0.5.2): atomic symlink swap of each vendor dir
 * (`~/.claude`, `~/.codex`, `~/.gemini`, `~/.kiro`) so the vendor CLIs
 * keep finding their own paths but get profile-scoped contents. Any
 * pre-existing real dir is archived under `~/.clihub/legacy/` before
 * the swap — never deleted.
 *
 * OAuth + keychain flow live elsewhere (v0.5.3); this module focuses
 * on the directory shuffle and metadata.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createError } from '../errors/index.js';

const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;

export type VendorId = 'claude-code' | 'codex' | 'kiro-cli';

interface VendorMapping {
  homeDir: string;          // absolute `~/.claude` etc.
  profileSub: string;       // `.claude` inside the profile dir
}

const VENDORS: Record<VendorId, VendorMapping> = {
  'claude-code': { homeDir: path.join(os.homedir(), '.claude'),  profileSub: '.claude'  },
  'codex':       { homeDir: path.join(os.homedir(), '.codex'),   profileSub: '.codex'   },
  'kiro-cli':    { homeDir: path.join(os.homedir(), '.kiro'),    profileSub: '.kiro'    },
};

export interface ProfileBaseUrls {
  anthropic?: string;
  openai?: string;
  google?: string;
  kiro?: string;
}

export interface ProfileMeta {
  name: string;
  /** ISO 8601 UTC. */
  created: string;
  /** ISO 8601 UTC; updated on every `useProfile` or meta write. */
  updated: string;
  baseUrls?: ProfileBaseUrls;
  /** Items shared across profiles (skills | plugins | mcp.<id>). */
  shared?: string[];
  /** Items explicitly kept private. */
  notShared?: string[];
  notes?: string;
}

export interface CreateProfileOpts {
  /** Clone subset from another profile (`--from`). */
  cloneFrom?: string;
  /** Create empty .claude/.codex/.gemini/.kiro instead of snapshotting the host's live state. */
  empty?: boolean;
  /** Override the profiles root (tests). */
  root?: string;
}

export interface UseProfileOpts {
  /** Force-archive existing real vendor dirs (default already archives — this just renames the archive label). */
  force?: boolean;
  root?: string;
}

export interface ProfileRootOpts {
  root?: string;
}

export function defaultProfilesRoot(): string {
  return path.join(os.homedir(), '.clihub', 'profiles');
}

export function currentProfileLink(): string {
  return path.join(os.homedir(), '.clihub', 'current-profile');
}

function legacyArchiveRoot(): string {
  return path.join(os.homedir(), '.clihub', 'legacy');
}

export function validateProfileName(name: string): void {
  if (!NAME_RE.test(name)) throw createError('CLIHUB-E-300', name);
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function isSymlink(p: string): Promise<boolean> {
  try {
    const s = await fs.lstat(p);
    return s.isSymbolicLink();
  } catch {
    return false;
  }
}

async function readSymlinkTarget(p: string): Promise<string | undefined> {
  try { return await fs.readlink(p); } catch { return undefined; }
}

function isoNow(): string {
  return new Date().toISOString();
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await fs.readlink(s);
      await fs.symlink(target, d).catch(() => {});
    } else if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

export async function createProfile(name: string, opts: CreateProfileOpts = {}): Promise<ProfileMeta> {
  validateProfileName(name);
  const root = opts.root ?? defaultProfilesRoot();
  const dir = path.join(root, name);
  if (await pathExists(dir)) {
    return readProfileMeta(name, { root });
  }
  await fs.mkdir(dir, { recursive: true });

  if (opts.cloneFrom) {
    const srcDir = path.join(root, opts.cloneFrom);
    if (!(await pathExists(srcDir))) throw createError('CLIHUB-E-301', opts.cloneFrom);
    for (const v of Object.values(VENDORS)) {
      const srcSub = path.join(srcDir, v.profileSub);
      const destSub = path.join(dir, v.profileSub);
      if (await pathExists(srcSub)) await copyDir(srcSub, destSub);
      else await fs.mkdir(destSub, { recursive: true });
    }
  } else if (opts.empty) {
    for (const v of Object.values(VENDORS)) {
      await fs.mkdir(path.join(dir, v.profileSub), { recursive: true });
    }
  } else {
    // Snapshot whatever the user has live today, so the *first* profile
    // doesn't start blank.
    for (const v of Object.values(VENDORS)) {
      const destSub = path.join(dir, v.profileSub);
      const liveIsSymlink = await isSymlink(v.homeDir);
      if (liveIsSymlink) {
        // Already symlinked elsewhere — don't follow; start clean.
        await fs.mkdir(destSub, { recursive: true });
      } else if (await pathExists(v.homeDir)) {
        await copyDir(v.homeDir, destSub);
      } else {
        await fs.mkdir(destSub, { recursive: true });
      }
    }
  }

  const meta: ProfileMeta = {
    name,
    created: isoNow(),
    updated: isoNow(),
  };
  await writeJsonAtomic(path.join(dir, 'meta.json'), meta);
  return meta;
}

export async function listProfiles(opts: ProfileRootOpts = {}): Promise<string[]> {
  const root = opts.root ?? defaultProfilesRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function readProfileMeta(name: string, opts: ProfileRootOpts = {}): Promise<ProfileMeta> {
  const root = opts.root ?? defaultProfilesRoot();
  const file = path.join(root, name, 'meta.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as ProfileMeta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError('CLIHUB-E-301', name);
    }
    throw err;
  }
}

export async function writeProfileMeta(name: string, patch: Partial<ProfileMeta>, opts: ProfileRootOpts = {}): Promise<ProfileMeta> {
  const meta = await readProfileMeta(name, opts);
  const next: ProfileMeta = { ...meta, ...patch, name: meta.name, updated: isoNow() };
  const root = opts.root ?? defaultProfilesRoot();
  await writeJsonAtomic(path.join(root, name, 'meta.json'), next);
  return next;
}

export async function currentProfile(): Promise<string | undefined> {
  const link = currentProfileLink();
  const target = await readSymlinkTarget(link);
  if (!target) return undefined;
  return path.basename(target);
}

export interface UseProfileResult {
  profile: ProfileMeta;
  archived: string[];   // legacy paths that were moved aside
}

/**
 * Activate `name`: ensure the profile's vendor dirs exist, archive any
 * real vendor dirs sitting at `~/.claude` etc. (only the first time),
 * then symlink the vendor dirs to the profile's. Atomic where possible
 * (symlink via tmp+rename).
 */
export async function useProfile(name: string, opts: UseProfileOpts = {}): Promise<UseProfileResult> {
  validateProfileName(name);
  const root = opts.root ?? defaultProfilesRoot();
  const profDir = path.join(root, name);
  if (!(await pathExists(profDir))) throw createError('CLIHUB-E-301', name);

  const archived: string[] = [];

  for (const v of Object.values(VENDORS)) {
    const destSub = path.join(profDir, v.profileSub);
    await fs.mkdir(destSub, { recursive: true });

    const live = v.homeDir;
    const liveExists = await pathExists(live);
    const liveIsLink = liveExists && (await isSymlink(live));

    if (liveExists && !liveIsLink) {
      // Archive the existing real dir so we never destroy user state.
      const stamp = isoNow().replace(/[:.]/g, '-');
      const label = opts.force ? `force.${stamp}` : stamp;
      const archive = path.join(legacyArchiveRoot(), `${path.basename(live)}.${label}`);
      await fs.mkdir(path.dirname(archive), { recursive: true });
      await fs.rename(live, archive);
      archived.push(archive);
    } else if (liveIsLink) {
      // Already a symlink — safe to replace.
      await fs.unlink(live);
    }

    // Atomic symlink: write to a tmp then rename over.
    const tmpLink = `${live}.linktmp`;
    try { await fs.unlink(tmpLink); } catch { /* ignore */ }
    await fs.symlink(destSub, tmpLink);
    await fs.rename(tmpLink, live);
  }

  // Update current-profile pointer atomically.
  const link = currentProfileLink();
  const tmpLink = `${link}.tmp`;
  try { await fs.unlink(tmpLink); } catch { /* ignore */ }
  await fs.symlink(profDir, tmpLink);
  await fs.rename(tmpLink, link);

  const meta = await writeProfileMeta(name, {}, { root });
  return { profile: meta, archived };
}

export async function removeProfile(name: string, opts: ProfileRootOpts = {}): Promise<void> {
  validateProfileName(name);
  const active = await currentProfile();
  if (active === name) throw createError('CLIHUB-E-302', name);
  const root = opts.root ?? defaultProfilesRoot();
  const dir = path.join(root, name);
  await fs.rm(dir, { recursive: true, force: true });
}

export async function cloneProfile(src: string, dest: string, opts: ProfileRootOpts = {}): Promise<ProfileMeta> {
  validateProfileName(dest);
  if (!(await listProfiles(opts)).includes(src)) throw createError('CLIHUB-E-301', src);
  return createProfile(dest, { cloneFrom: src, root: opts.root });
}

/**
 * Compute the env vector to set when spawning child processes so vendor
 * CLIs that honour env overrides see the right config dir. Most vendors
 * currently ignore these but they cost nothing and start the
 * standardisation push.
 */
export function profileEnvVector(profileName: string, opts: ProfileRootOpts = {}): Record<string, string> {
  const root = opts.root ?? defaultProfilesRoot();
  const dir = path.join(root, profileName);
  return {
    CLIHUB_PROFILE: profileName,
    CLAUDE_HOME: path.join(dir, '.claude'),
    CODEX_CONFIG_DIR: path.join(dir, '.codex'),
    GEMINI_CONFIG_DIR: path.join(dir, '.gemini'),
    KIRO_CONFIG_DIR: path.join(dir, '.kiro'),
  };
}

export const PROFILE_VENDORS: ReadonlyArray<VendorId> = Object.keys(VENDORS) as VendorId[];
