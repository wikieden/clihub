/**
 * `clihub sync` engine (v0.8.0, Pillar: cross-machine sync).
 *
 * Carry your clihub *identity* — global config, catalog sources, and
 * profile metadata — to another machine, end-to-end encrypted with a
 * passphrase only you know. Zero backend, vendor-neutral: the encrypted
 * bundle is a text blob you move however you like (git, scp, paste).
 *
 *   - collectBundle(version)        → gather the portable config surface
 *   - encryptBundle(bundle, pass)   → PEM-style ciphertext text
 *   - decryptBundle(text, pass)     → bundle (throws on wrong passphrase)
 *   - planRestore(bundle)           → read-only diff (RestoreItem[])
 *   - applyRestore(bundle)          → write files + relink current profile
 *
 * Crypto: scrypt KDF (N=2^15) → AES-256-GCM. We never see the plaintext
 * key; lose the passphrase and the bundle is unrecoverable by design.
 *
 * NOTE: per-CLI home dirs (~/.claude, ~/.codex, ...) and OS-keychain
 * secrets are intentionally NOT bundled — they are machine-local and/or
 * sensitive. Re-materialise a profile on the new machine with
 * `clihub profile use <name>`; re-add secrets with `clihub auth set`.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const MAGIC_BEGIN = '-----BEGIN CLIHUB SYNC v1-----';
const MAGIC_END = '-----END CLIHUB SYNC v1-----';
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SCRYPT_N = 32768; // 2^15
const SCRYPT_OPTS = { N: SCRYPT_N, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

export interface SyncFile {
  /** POSIX-style path relative to the home directory. */
  path: string;
  encoding: 'utf8';
  content: string;
}

export interface SyncBundle {
  version: 1;
  tool: 'clihub';
  clihub: string;
  generatedAt: string;
  files: SyncFile[];
  /** Active profile name (the `current-profile` symlink target basename). */
  currentProfile?: string;
}

export interface SyncIoOpts {
  /** Home dir override (tests / sandboxes). */
  home?: string;
}

/** Regular files we bundle, as POSIX paths relative to home. */
function staticRelPaths(): string[] {
  return ['.clihub/config.json', '.clihub/sources.json'];
}

function homePath(home: string, rel: string): string {
  return path.join(home, ...rel.split('/'));
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/** Gather the portable config surface from the home directory. */
export async function collectBundle(clihubVersion: string, opts: SyncIoOpts = {}): Promise<SyncBundle> {
  const home = opts.home ?? os.homedir();
  const files: SyncFile[] = [];

  for (const rel of staticRelPaths()) {
    const content = await readIfExists(homePath(home, rel));
    if (content !== undefined) files.push({ path: rel, encoding: 'utf8', content });
  }

  // profile metadata: .clihub/profiles/<name>/meta.json (NOT the per-CLI dirs)
  const profilesDir = homePath(home, '.clihub/profiles');
  let names: string[] = [];
  try {
    names = (await fs.readdir(profilesDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  for (const name of names) {
    const rel = `.clihub/profiles/${name}/meta.json`;
    const content = await readIfExists(homePath(home, rel));
    if (content !== undefined) files.push({ path: rel, encoding: 'utf8', content });
  }

  // active profile (symlink target basename)
  let currentProfile: string | undefined;
  try {
    const target = await fs.readlink(homePath(home, '.clihub/current-profile'));
    currentProfile = path.basename(target);
  } catch {
    /* no active profile */
  }

  return {
    version: 1,
    tool: 'clihub',
    clihub: clihubVersion,
    generatedAt: new Date().toISOString(),
    files,
    ...(currentProfile ? { currentProfile } : {}),
  };
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, KEY_LEN, SCRYPT_OPTS);
}

/** Encrypt a bundle into PEM-style ciphertext text (git/paste friendly). */
export function encryptBundle(bundle: SyncBundle, passphrase: string): string {
  if (!passphrase) throw new Error('passphrase required');
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(bundle), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob = Buffer.concat([salt, iv, tag, ciphertext]).toString('base64');
  const wrapped = blob.replace(/(.{76})/g, '$1\n');
  return `${MAGIC_BEGIN}\n${wrapped}\n${MAGIC_END}\n`;
}

/** Decrypt PEM-style ciphertext text. Throws on wrong passphrase / tamper. */
export function decryptBundle(text: string, passphrase: string): SyncBundle {
  if (!passphrase) throw new Error('passphrase required');
  const begin = text.indexOf(MAGIC_BEGIN);
  const end = text.indexOf(MAGIC_END);
  if (begin === -1 || end === -1 || end < begin) throw new Error('not a clihub sync bundle');
  const body = text.slice(begin + MAGIC_BEGIN.length, end).replace(/\s+/g, '');
  const buf = Buffer.from(body, 'base64');
  if (buf.length < SALT_LEN + IV_LEN + TAG_LEN) throw new Error('corrupt sync bundle');
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(passphrase, Buffer.from(salt));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('decryption failed — wrong passphrase or corrupt bundle');
  }
  const bundle = JSON.parse(plaintext.toString('utf8')) as SyncBundle;
  if (bundle.tool !== 'clihub' || bundle.version !== 1) throw new Error('unsupported sync bundle');
  return bundle;
}

export type RestoreVerb = 'new' | 'overwrite' | 'same';

export interface RestoreItem {
  path: string;
  verb: RestoreVerb;
}

/** Diff a bundle against the local home dir without writing. */
export async function planRestore(bundle: SyncBundle, opts: SyncIoOpts = {}): Promise<RestoreItem[]> {
  const home = opts.home ?? os.homedir();
  const items: RestoreItem[] = [];
  for (const f of bundle.files) {
    const existing = await readIfExists(homePath(home, f.path));
    if (existing === undefined) items.push({ path: f.path, verb: 'new' });
    else if (existing === f.content) items.push({ path: f.path, verb: 'same' });
    else items.push({ path: f.path, verb: 'overwrite' });
  }
  return items;
}

export interface RestoreResult {
  written: RestoreItem[];
  failed: Array<{ path: string; error: string }>;
  relinkedProfile?: string;
}

export interface ApplyRestoreOpts extends SyncIoOpts {
  /** Skip files that already exist with different content (default: false → overwrite). */
  noOverwrite?: boolean;
}

async function writeAtomic(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}

/** Write bundle files into the home dir and relink the active profile. */
export async function applyRestore(bundle: SyncBundle, opts: ApplyRestoreOpts = {}): Promise<RestoreResult> {
  const home = opts.home ?? os.homedir();
  const written: RestoreItem[] = [];
  const failed: Array<{ path: string; error: string }> = [];

  const plan = await planRestore(bundle, opts);
  const verbByPath = new Map(plan.map((p) => [p.path, p.verb]));

  for (const f of bundle.files) {
    const verb = verbByPath.get(f.path) ?? 'new';
    if (verb === 'same') { written.push({ path: f.path, verb }); continue; }
    if (verb === 'overwrite' && opts.noOverwrite) continue;
    try {
      await writeAtomic(homePath(home, f.path), f.content);
      written.push({ path: f.path, verb });
    } catch (e) {
      failed.push({ path: f.path, error: String(e) });
    }
  }

  let relinkedProfile: string | undefined;
  if (bundle.currentProfile) {
    const link = homePath(home, '.clihub/current-profile');
    const target = path.join('profiles', bundle.currentProfile);
    const profileDir = homePath(home, `.clihub/profiles/${bundle.currentProfile}`);
    try {
      const exists = await fs.access(profileDir).then(() => true).catch(() => false);
      if (exists) {
        await fs.rm(link, { force: true });
        await fs.symlink(target, link);
        relinkedProfile = bundle.currentProfile;
      }
    } catch (e) {
      failed.push({ path: '.clihub/current-profile', error: String(e) });
    }
  }

  return { written, failed, ...(relinkedProfile ? { relinkedProfile } : {}) };
}
