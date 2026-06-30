/**
 * Firefox cookie extraction. Cookies live unencrypted in
 * `cookies.sqlite` (moz_cookies table) under each profile. Read via the
 * daemon's Bun sqlite (copied to temp to avoid the live lock).
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type Cookie, hostMatches } from './types.js';

const PROFILES_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'Firefox', 'Profiles');

interface MozCookie {
  host: string;
  name: string;
  value: string;
  path: string;
  expiry: number; // seconds
}

export async function firefoxCookies(domains: string[]): Promise<Cookie[]> {
  let profiles: string[];
  try {
    profiles = await fs.readdir(PROFILES_ROOT);
  } catch {
    return [];
  }
  const out: Cookie[] = [];
  for (const prof of profiles) {
    const file = path.join(PROFILES_ROOT, prof, 'cookies.sqlite');
    try {
      await fs.access(file);
    } catch {
      continue;
    }
    const tmp = path.join(os.tmpdir(), `clihub-ff-${process.pid}-${prof}.sqlite`);
    try {
      await fs.copyFile(file, tmp);
      for (const ext of ['-wal', '-shm']) await fs.copyFile(file + ext, tmp + ext).catch(() => {});
    } catch {
      continue;
    }
    try {
      const mod = await import('bun:sqlite' as string);
      const Database = (mod as { Database: new (p: string, o?: unknown) => unknown }).Database;
      const db = new Database(tmp, { readonly: true });
      const rows = (
        db as { query: (sql: string) => { all: () => MozCookie[] } }
      )
        .query('SELECT host, name, value, path, expiry FROM moz_cookies')
        .all() as MozCookie[];
      for (const r of rows) {
        if (!hostMatches(r.host, domains)) continue;
        out.push({
          name: r.name,
          value: r.value,
          domain: r.host,
          path: r.path,
          expires: r.expiry ? r.expiry * 1000 : undefined,
          source: 'Firefox',
        });
      }
      (db as { close?: () => void }).close?.();
    } catch {
      /* skip profile */
    }
  }
  return out;
}
