/**
 * Per-profile credential vault.
 *
 * Storage backend resolution (highest first):
 *   1. macOS  → `/usr/bin/security` generic password
 *   2. Linux  → `secret-tool` (libsecret)
 *   3. anywhere else → encrypted file vault at
 *      `~/.clihub/profiles/<profile>/vault.json` using AES-256-GCM with
 *      a key derived from `${hostname}:${username}` via scrypt. Not as
 *      strong as a real keychain (a co-located attacker can re-derive
 *      the key), but better than plaintext.
 *
 * Service / attribute scheme: service = `clihub:<profile>`, account =
 * <key> (e.g. `ANTHROPIC_API_KEY`). Profiles are isolated.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { defaultProfilesRoot } from '../profile/index.js';
import { createError } from '../errors/index.js';

const execFileP = promisify(execFile);

export type KeychainBackend = 'macos' | 'libsecret' | 'file';

export interface KeychainInfo {
  backend: KeychainBackend;
  detail: string;
}

let cachedBackend: KeychainInfo | undefined;

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await execFileP(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function detectBackend(): Promise<KeychainInfo> {
  if (cachedBackend) return cachedBackend;
  // CLIHUB_KEYCHAIN_BACKEND lets users (and tests) force a particular
  // backend — useful when the macOS Keychain prompt is undesirable, in
  // CI, or in containers without libsecret.
  const override = process.env.CLIHUB_KEYCHAIN_BACKEND;
  if (override === 'macos' || override === 'libsecret' || override === 'file') {
    cachedBackend = {
      backend: override,
      detail: `forced via CLIHUB_KEYCHAIN_BACKEND=${override}`,
    };
    return cachedBackend;
  }
  if (process.platform === 'darwin') {
    if (await commandExists('security')) {
      cachedBackend = { backend: 'macos', detail: 'macOS Keychain via /usr/bin/security' };
      return cachedBackend;
    }
  }
  if (process.platform === 'linux') {
    if (await commandExists('secret-tool')) {
      cachedBackend = { backend: 'libsecret', detail: 'libsecret via secret-tool' };
      return cachedBackend;
    }
  }
  cachedBackend = {
    backend: 'file',
    detail: 'encrypted file vault (~/.clihub/profiles/<name>/vault.json)',
  };
  return cachedBackend;
}

/** Reset the cached backend (mainly for tests). */
export function resetKeychainBackendCache(): void {
  cachedBackend = undefined;
}

export async function currentKeychain(): Promise<KeychainInfo> {
  return detectBackend();
}

function serviceFor(profile: string): string {
  return `clihub:${profile}`;
}

// ─── macOS Keychain ───────────────────────────────────────────────────

async function macosSet(profile: string, key: string, value: string): Promise<void> {
  await execFileP('/usr/bin/security', [
    'add-generic-password',
    '-a', key,
    '-s', serviceFor(profile),
    '-w', value,
    '-U',
  ]);
}

async function macosGet(profile: string, key: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileP('/usr/bin/security', [
      'find-generic-password',
      '-a', key,
      '-s', serviceFor(profile),
      '-w',
    ]);
    return stdout.replace(/\r?\n$/, '');
  } catch {
    return undefined;
  }
}

async function macosDel(profile: string, key: string): Promise<void> {
  try {
    await execFileP('/usr/bin/security', [
      'delete-generic-password',
      '-a', key,
      '-s', serviceFor(profile),
    ]);
  } catch {
    // Item not found is fine.
  }
}

async function macosList(profile: string): Promise<string[]> {
  try {
    const { stdout } = await execFileP('/usr/bin/security', [
      'dump-keychain',
    ]);
    const out: string[] = [];
    const svc = serviceFor(profile);
    const lines = stdout.split('\n');
    let currentSvc: string | undefined;
    let currentAcc: string | undefined;
    for (const line of lines) {
      const m1 = line.match(/"svce"<blob>="([^"]+)"/);
      const m2 = line.match(/"acct"<blob>="([^"]+)"/);
      if (m1) currentSvc = m1[1];
      if (m2) currentAcc = m2[1];
      if (line.startsWith('keychain:')) {
        if (currentSvc === svc && currentAcc) out.push(currentAcc);
        currentSvc = undefined;
        currentAcc = undefined;
      }
    }
    if (currentSvc === svc && currentAcc) out.push(currentAcc);
    return [...new Set(out)].sort();
  } catch {
    return [];
  }
}

// ─── libsecret (Linux) ────────────────────────────────────────────────

async function libsecretSet(profile: string, key: string, value: string): Promise<void> {
  const child = execFile('secret-tool', [
    'store',
    '--label', `clihub:${profile}:${key}`,
    'service', 'clihub',
    'profile', profile,
    'account', key,
  ]);
  await new Promise<void>((resolve, reject) => {
    child.stdin?.end(value);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`secret-tool exit ${code}`))));
    child.on('error', reject);
  });
}

async function libsecretGet(profile: string, key: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileP('secret-tool', [
      'lookup',
      'service', 'clihub',
      'profile', profile,
      'account', key,
    ]);
    return stdout.replace(/\r?\n$/, '');
  } catch {
    return undefined;
  }
}

async function libsecretDel(profile: string, key: string): Promise<void> {
  try {
    await execFileP('secret-tool', [
      'clear',
      'service', 'clihub',
      'profile', profile,
      'account', key,
    ]);
  } catch {
    // ignore
  }
}

async function libsecretList(profile: string): Promise<string[]> {
  try {
    const { stdout } = await execFileP('secret-tool', [
      'search',
      '--all',
      'service', 'clihub',
      'profile', profile,
    ]);
    const out: string[] = [];
    for (const line of stdout.split('\n')) {
      const m = line.match(/attribute\.account = (.+)$/);
      if (m) out.push(m[1]!);
    }
    return [...new Set(out)].sort();
  } catch {
    return [];
  }
}

// ─── Encrypted file vault (fallback) ──────────────────────────────────

interface FileVault {
  version: 1;
  kdf: 'scrypt';
  salt: string;
  entries: Record<string, { iv: string; ciphertext: string; tag: string }>;
}

function vaultPath(profile: string): string {
  return path.join(defaultProfilesRoot(), profile, 'vault.json');
}

function deriveKey(salt: Buffer): Buffer {
  const passphrase = `${os.hostname()}:${os.userInfo().username}`;
  return scryptSync(passphrase, salt, 32);
}

async function readVault(profile: string): Promise<FileVault> {
  try {
    const raw = await fs.readFile(vaultPath(profile), 'utf8');
    const parsed = JSON.parse(raw) as FileVault;
    if (parsed.version !== 1) throw new Error('unsupported vault version');
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return {
      version: 1,
      kdf: 'scrypt',
      salt: randomBytes(16).toString('base64'),
      entries: {},
    };
  }
}

async function writeVault(profile: string, vault: FileVault): Promise<void> {
  const p = vaultPath(profile);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(vault, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, p);
  try { await fs.chmod(p, 0o600); } catch { /* best-effort */ }
}

async function fileSet(profile: string, key: string, value: string): Promise<void> {
  const vault = await readVault(profile);
  const salt = Buffer.from(vault.salt, 'base64');
  const dKey = deriveKey(salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  vault.entries[key] = {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
  };
  await writeVault(profile, vault);
}

async function fileGet(profile: string, key: string): Promise<string | undefined> {
  const vault = await readVault(profile);
  const entry = vault.entries[key];
  if (!entry) return undefined;
  const dKey = deriveKey(Buffer.from(vault.salt, 'base64'));
  const decipher = createDecipheriv(
    'aes-256-gcm',
    dKey,
    Buffer.from(entry.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
  try {
    const out = Buffer.concat([
      decipher.update(Buffer.from(entry.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return out.toString('utf8');
  } catch {
    return undefined;
  }
}

async function fileDel(profile: string, key: string): Promise<void> {
  const vault = await readVault(profile);
  if (!(key in vault.entries)) return;
  delete vault.entries[key];
  await writeVault(profile, vault);
}

async function fileList(profile: string): Promise<string[]> {
  const vault = await readVault(profile);
  return Object.keys(vault.entries).sort();
}

// ─── public API ───────────────────────────────────────────────────────

export async function setSecret(profile: string, key: string, value: string): Promise<KeychainInfo> {
  const info = await detectBackend();
  switch (info.backend) {
    case 'macos':     await macosSet(profile, key, value);     break;
    case 'libsecret': await libsecretSet(profile, key, value); break;
    case 'file':      await fileSet(profile, key, value);      break;
  }
  return info;
}

export async function getSecret(profile: string, key: string): Promise<string | undefined> {
  const info = await detectBackend();
  switch (info.backend) {
    case 'macos':     return macosGet(profile, key);
    case 'libsecret': return libsecretGet(profile, key);
    case 'file':      return fileGet(profile, key);
  }
}

export async function removeSecret(profile: string, key: string): Promise<void> {
  const info = await detectBackend();
  switch (info.backend) {
    case 'macos':     return macosDel(profile, key);
    case 'libsecret': return libsecretDel(profile, key);
    case 'file':      return fileDel(profile, key);
  }
}

export async function listSecrets(profile: string): Promise<string[]> {
  const info = await detectBackend();
  switch (info.backend) {
    case 'macos':     return macosList(profile);
    case 'libsecret': return libsecretList(profile);
    case 'file':      return fileList(profile);
  }
}

/**
 * Surface a CLIHUB-E-400 if the only available backend is the file
 * vault — useful for `clihub doctor --fix` warnings.
 */
export async function assertSecureKeychain(): Promise<void> {
  const info = await detectBackend();
  if (info.backend === 'file') {
    throw createError('CLIHUB-E-400', info.detail);
  }
}
