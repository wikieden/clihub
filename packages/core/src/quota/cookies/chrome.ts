/**
 * Chromium-family cookie extraction (Chrome, Edge, Brave, Arc, Chromium) on macOS.
 *
 * Cookies live in a SQLite DB; values are encrypted with `v10` AES-128-CBC. The
 * key is derived from the browser's "… Safe Storage" password in the login
 * Keychain: PBKDF2-HMAC-SHA1(password, salt="saltysalt", iterations=1003,
 * keylen=16). IV is 16 spaces. Newer Chrome (v24+) prepends a 32-byte SHA256
 * domain hash to the plaintext, which we strip.
 *
 * The DB is copied to a temp file before reading because the running browser
 * holds a lock (and may be in WAL mode).
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { type Cookie, hostMatches } from './types.js';

const execFileP = promisify(execFile);
const SUPPORT = path.join(os.homedir(), 'Library', 'Application Support');

interface ChromiumBrowser {
  id: string;
  label: string;
  /** Profile-containing root under Application Support. */
  root: string;
  /** Keychain generic-password service + account. */
  keychainService: string;
  keychainAccount: string;
}

const BROWSERS: ChromiumBrowser[] = [
  { id: 'chrome', label: 'Chrome', root: path.join(SUPPORT, 'Google', 'Chrome'), keychainService: 'Chrome Safe Storage', keychainAccount: 'Chrome' },
  { id: 'edge', label: 'Edge', root: path.join(SUPPORT, 'Microsoft Edge'), keychainService: 'Microsoft Edge Safe Storage', keychainAccount: 'Microsoft Edge' },
  { id: 'brave', label: 'Brave', root: path.join(SUPPORT, 'BraveSoftware', 'Brave-Browser'), keychainService: 'Brave Safe Storage', keychainAccount: 'Brave' },
  { id: 'arc', label: 'Arc', root: path.join(SUPPORT, 'Arc', 'User Data'), keychainService: 'Arc Safe Storage', keychainAccount: 'Arc' },
  { id: 'chromium', label: 'Chromium', root: path.join(SUPPORT, 'Chromium'), keychainService: 'Chromium Safe Storage', keychainAccount: 'Chromium' },
];

/** Profiles that may hold a Cookies DB inside a browser root. */
const PROFILE_DIRS = ['Default', 'Profile 1', 'Profile 2', 'Profile 3'];

async function keychainKey(b: ChromiumBrowser): Promise<Buffer | undefined> {
  try {
    const { stdout } = await execFileP('security', [
      'find-generic-password',
      '-wa',
      b.keychainAccount,
      '-s',
      b.keychainService,
    ]);
    const password = stdout.trim();
    if (!password) return undefined;
    return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  } catch {
    return undefined; // not installed / user denied keychain
  }
}

function decryptValue(encrypted: Buffer, key: Buffer): string | undefined {
  if (encrypted.length < 4) return undefined;
  const prefix = encrypted.subarray(0, 3).toString('latin1');
  if (prefix !== 'v10') {
    // Unencrypted (rare) — return as-is.
    return encrypted.toString('utf8');
  }
  try {
    const iv = Buffer.alloc(16, 0x20);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    let out = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]);
    // strip PKCS7 padding
    const pad = out[out.length - 1] ?? 0;
    if (pad > 0 && pad <= 16) out = out.subarray(0, out.length - pad);
    // Chrome v24+ prepends a 32-byte SHA256 domain hash; strip if the result
    // isn't printable but the post-32 slice is.
    const direct = out.toString('utf8');
    if (looksPrintable(direct)) return direct;
    const stripped = out.subarray(32).toString('utf8');
    return looksPrintable(stripped) ? stripped : direct;
  } catch {
    return undefined;
  }
}

function looksPrintable(s: string): boolean {
  if (!s) return false;
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x08\x0e-\x1f]/.test(s);
}

async function openCookieDb(file: string): Promise<unknown | undefined> {
  // Copy the (locked) DB + any WAL/SHM sidecars to temp before opening.
  const tmp = path.join(os.tmpdir(), `clihub-ck-${process.pid}-${path.basename(path.dirname(file))}.sqlite`);
  try {
    await fs.copyFile(file, tmp);
    for (const ext of ['-wal', '-shm']) {
      await fs.copyFile(file + ext, tmp + ext).catch(() => {});
    }
  } catch {
    return undefined;
  }
  try {
    // bun:sqlite is only present in the daemon's Bun runtime; the `as string`
    // specifier keeps node's tsc from trying to resolve/typecheck it.
    const mod = await import('bun:sqlite' as string);
    const Database = (mod as { Database: new (p: string, o?: unknown) => unknown }).Database;
    return new Database(tmp, { readonly: true });
  } catch {
    return undefined;
  }
}

interface CookieRow {
  host_key: string;
  name: string;
  encrypted_value: Uint8Array;
  value: string;
  path: string;
  expires_utc: number;
}

/** Chromium expires_utc = microseconds since 1601-01-01 → epoch ms. */
function chromiumTimeToMs(v: number): number | undefined {
  if (!v) return undefined;
  return Math.round(v / 1000 - 11644473600000);
}

export async function chromeCookies(domains: string[], only?: string[]): Promise<Cookie[]> {
  const out: Cookie[] = [];
  for (const b of BROWSERS) {
    if (only && !only.includes(b.id)) continue;
    let key: Buffer | undefined;
    for (const prof of PROFILE_DIRS) {
      const file = path.join(b.root, prof, 'Cookies');
      try {
        await fs.access(file);
      } catch {
        continue;
      }
      const db = await openCookieDb(file);
      if (!db) continue;
      try {
        if (!key) key = await keychainKey(b);
        if (!key) break; // no key → can't decrypt this browser
        const rows = (
          db as { query: (sql: string) => { all: (...a: unknown[]) => CookieRow[] } }
        )
          .query(
            'SELECT host_key, name, encrypted_value, value, path, expires_utc FROM cookies',
          )
          .all() as CookieRow[];
        for (const r of rows) {
          if (!hostMatches(r.host_key, domains)) continue;
          const enc = Buffer.from(r.encrypted_value);
          const value = enc.length ? decryptValue(enc, key) : r.value;
          if (!value) continue;
          out.push({
            name: r.name,
            value,
            domain: r.host_key,
            path: r.path,
            expires: chromiumTimeToMs(r.expires_utc),
            source: b.label,
          });
        }
      } catch {
        /* skip this profile */
      } finally {
        try {
          (db as { close?: () => void }).close?.();
        } catch {
          /* ignore */
        }
      }
    }
  }
  return out;
}
