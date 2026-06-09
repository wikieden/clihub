/**
 * `clihub sync push|pull --to <transport>` — cloud-folder / WebDAV transports
 * (v1.57). A transport only moves the ALREADY-ENCRYPTED PEM blob produced by
 * `encryptBundle`; the E2E crypto in ./index.ts is untouched and never sees a
 * plaintext key. So "cloud sync" needs no clihub backend and no cloud account —
 * a folder the user already syncs (iCloud Drive / Dropbox / OneDrive) or any
 * WebDAV endpoint is enough.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  encryptBundle,
  decryptBundle,
  type SyncBundle,
} from './index.js';

/** The default object name a transport stores the encrypted blob under. */
export const SYNC_BLOB_NAME = 'clihub-sync.pem';

export interface SyncTransport {
  /** Store the encrypted blob. */
  put(blob: string): Promise<void>;
  /** Fetch the encrypted blob, or undefined if none exists yet. */
  get(): Promise<string | undefined>;
  /** Human label for output (never includes secrets). */
  describe(): string;
}

/** Local / synced-folder transport. Covers iCloud, Dropbox, OneDrive folders. */
export class FsFolderTransport implements SyncTransport {
  private readonly file: string;
  constructor(private readonly dir: string, filename: string = SYNC_BLOB_NAME) {
    this.file = path.join(dir, filename);
  }
  async put(blob: string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, blob, 'utf8');
    await fs.rename(tmp, this.file);
  }
  async get(): Promise<string | undefined> {
    try {
      return await fs.readFile(this.file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }
  describe(): string {
    return `folder:${this.dir}`;
  }
}

export interface WebDavOptions {
  url: string;
  username?: string;
  password?: string;
  filename?: string;
}

/** WebDAV transport (Nextcloud, Box, generic). PUT to store, GET to fetch. */
export class WebDavTransport implements SyncTransport {
  private readonly target: string;
  private readonly auth?: string;
  constructor(opts: WebDavOptions) {
    const base = opts.url.replace(/\/+$/, '');
    this.target = `${base}/${opts.filename ?? SYNC_BLOB_NAME}`;
    if (opts.username) {
      this.auth = 'Basic ' + Buffer.from(`${opts.username}:${opts.password ?? ''}`).toString('base64');
    }
  }
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.auth ? { Authorization: this.auth, ...extra } : extra;
  }
  async put(blob: string): Promise<void> {
    const res = await fetch(this.target, {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/octet-stream' }),
      body: blob,
    });
    if (!res.ok) throw new Error(`webdav PUT failed: ${res.status} ${res.statusText}`);
  }
  async get(): Promise<string | undefined> {
    const res = await fetch(this.target, { method: 'GET', headers: this.headers() });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`webdav GET failed: ${res.status} ${res.statusText}`);
    return await res.text();
  }
  describe(): string {
    return `webdav:${this.target.replace(/\/[^/]+$/, '')}`;
  }
}

/**
 * Resolve a `--to` spec into a transport.
 *   - `webdav:https://host/path`  → WebDAV (creds from env WEBDAV_USER/WEBDAV_PASS)
 *   - anything else               → a filesystem folder path (FsFolderTransport)
 */
export function resolveTransport(spec: string, env: NodeJS.ProcessEnv = process.env): SyncTransport {
  if (spec.startsWith('webdav:')) {
    const url = spec.slice('webdav:'.length);
    if (!url) throw new Error('webdav transport needs a URL: --to webdav:https://host/path');
    return new WebDavTransport({ url, username: env.WEBDAV_USER, password: env.WEBDAV_PASS });
  }
  return new FsFolderTransport(spec);
}

/** Encrypt + store a bundle through a transport. */
export async function pushBundle(transport: SyncTransport, bundle: SyncBundle, passphrase: string): Promise<void> {
  await transport.put(encryptBundle(bundle, passphrase));
}

/** Fetch + decrypt a bundle through a transport. Throws if none / wrong passphrase. */
export async function pullBundle(transport: SyncTransport, passphrase: string): Promise<SyncBundle> {
  const blob = await transport.get();
  if (blob === undefined) throw new Error(`no sync bundle found at ${transport.describe()}`);
  return decryptBundle(blob, passphrase);
}
