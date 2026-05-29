/**
 * Catalog sync — pull JSON catalogs from a remote URL into the user's
 * local catalog dir (`~/.clihub/catalog/` by default), record sha256
 * checksums, and timestamp the pull.
 *
 * Layout on disk:
 *   ~/.clihub/catalog/
 *     ├── manifest.json     ← source URL + lastSync + per-file sha256
 *     ├── skills.json
 *     ├── tools.json
 *     ├── presets.json
 *     ├── mcp.json
 *     └── plugins.json
 *
 * `CatalogLoader` checks for this directory first; if present and the
 * manifest validates, it serves the synced catalog. Otherwise it falls
 * back to the JSON files bundled inside the published package.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalPayload,
  signCatalogPayload,
  verifyCatalogPayload,
  keyIdFor,
} from './signing.js';
import { findTrustedKey, type TrustIoOpts } from './trust.js';

/** Default remote URL — points at this repo's main branch raw catalog. */
export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/wikieden/clihub/main/packages/catalog/';

/** Per-user catalog directory. */
export function defaultCatalogDir(): string {
  return path.join(os.homedir(), '.clihub', 'catalog');
}

export const CATALOG_FILES = [
  'skills.json',
  'tools.json',
  'presets.json',
  'mcp.json',
  'plugins.json',
] as const;

export type CatalogFile = (typeof CATALOG_FILES)[number];

export interface CatalogManifest {
  /** Source base URL (always ends with `/`). */
  source: string;
  /** ISO 8601 timestamp of the last successful sync. */
  lastSync: string;
  /** sha256 of every file fetched, keyed by filename. */
  checksums: Partial<Record<CatalogFile, string>>;
  /** Optional version stamp from the upstream (commit SHA / tag). */
  version?: string;
  /** Optional base64 ed25519 signature over the canonical payload. */
  signature?: string;
  /** Short id of the public key that produced `signature`. */
  keyId?: string;
}

export interface SyncCatalogOpts {
  /** Base URL to fetch from. Trailing slash optional; one is added if missing. */
  url?: string;
  /** Where to write the catalog. Defaults to `~/.clihub/catalog/`. */
  dir?: string;
  /** Optional version label (commit SHA / tag) to record in the manifest. */
  version?: string;
}

export interface SyncResult {
  dir: string;
  manifest: CatalogManifest;
  files: { name: CatalogFile; bytes: number; sha256: string }[];
}

/**
 * Download every known catalog file from `url` into `dir`, compute sha256,
 * write `manifest.json`. Failures on optional files (mcp / plugins) are
 * recorded as missing but don't abort the sync.
 */
export async function syncCatalog(opts: SyncCatalogOpts = {}): Promise<SyncResult> {
  const url = ensureTrailingSlash(opts.url ?? DEFAULT_CATALOG_URL);
  const dir = opts.dir ?? defaultCatalogDir();
  await fs.mkdir(dir, { recursive: true });

  const checksums: Partial<Record<CatalogFile, string>> = {};
  const fileEntries: { name: CatalogFile; bytes: number; sha256: string }[] = [];

  for (const name of CATALOG_FILES) {
    const fileUrl = url + name;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      if (name === 'skills.json' || name === 'tools.json' || name === 'presets.json') {
        throw new Error(`Required catalog file ${name} returned ${res.status} from ${fileUrl}`);
      }
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      JSON.parse(buf.toString('utf8'));
    } catch (e) {
      throw new Error(`${fileUrl} is not valid JSON: ${String(e)}`);
    }
    const sha = createHash('sha256').update(buf).digest('hex');
    await fs.writeFile(path.join(dir, name), buf);
    checksums[name] = `sha256:${sha}`;
    fileEntries.push({ name, bytes: buf.length, sha256: sha });
  }

  const manifest: CatalogManifest = {
    source: url,
    lastSync: new Date().toISOString(),
    checksums,
    ...(opts.version ? { version: opts.version } : {}),
  };
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  return { dir, manifest, files: fileEntries };
}

/**
 * Load the manifest at `dir`, if any. Returns `undefined` on missing or
 * unparseable manifest (callers fall back to the bundled catalog).
 */
export async function readCatalogManifest(dir: string): Promise<CatalogManifest | undefined> {
  try {
    const raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8');
    return JSON.parse(raw) as CatalogManifest;
  } catch {
    return undefined;
  }
}

/**
 * Re-hash every file in `dir` against the manifest. Returns the list of
 * filenames whose checksum no longer matches (empty array = healthy).
 */
export async function verifyCatalog(dir: string): Promise<string[]> {
  const manifest = await readCatalogManifest(dir);
  if (!manifest) return [];
  const bad: string[] = [];
  for (const [name, expected] of Object.entries(manifest.checksums)) {
    try {
      const buf = await fs.readFile(path.join(dir, name));
      const actual = `sha256:${createHash('sha256').update(buf).digest('hex')}`;
      if (actual !== expected) bad.push(name);
    } catch {
      bad.push(name);
    }
  }
  return bad;
}

function ensureTrailingSlash(s: string): string {
  return s.endsWith('/') ? s : s + '/';
}

// ─── signing / authenticity ───────────────────────────────────────────

/**
 * Sign the manifest at `dir` with an ed25519 private key (publisher side).
 * Writes `signature` + `keyId` back into manifest.json and returns the keyId.
 */
export async function signCatalogDir(
  dir: string,
  privateKeyPem: string,
  publicKeyPem: string,
): Promise<{ keyId: string; signature: string }> {
  const manifest = await readCatalogManifest(dir);
  if (!manifest) throw new Error(`no manifest.json in ${dir} (run \`clihub catalog sync\` first)`);
  const payload = canonicalPayload(manifest);
  const signature = signCatalogPayload(payload, privateKeyPem);
  const keyId = keyIdFor(publicKeyPem);
  const signed: CatalogManifest = { ...manifest, signature, keyId };
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(signed, null, 2) + '\n', 'utf8');
  return { keyId, signature };
}

export interface CatalogSigStatus {
  /** Manifest carries a signature. */
  signed: boolean;
  /** A trusted key was found for this source/keyId. */
  trusted: boolean;
  /** Signature verified against the trusted key. */
  valid: boolean;
  keyId?: string;
  reason?: string;
}

/**
 * Verify the manifest signature at `dir` against the local trust store.
 * Pure read — never mutates the catalog or trust store.
 */
export async function verifyCatalogSignature(dir: string, opts: TrustIoOpts = {}): Promise<CatalogSigStatus> {
  const manifest = await readCatalogManifest(dir);
  if (!manifest) return { signed: false, trusted: false, valid: false, reason: 'no manifest' };
  if (!manifest.signature) return { signed: false, trusted: false, valid: false, reason: 'catalog is unsigned' };
  const key = await findTrustedKey({ source: manifest.source, keyId: manifest.keyId }, opts);
  if (!key) {
    return { signed: true, trusted: false, valid: false, keyId: manifest.keyId, reason: 'no trusted key for this source — run `clihub catalog trust add`' };
  }
  const payload = canonicalPayload(manifest);
  const valid = verifyCatalogPayload(payload, manifest.signature, key.publicKey);
  return { signed: true, trusted: true, valid, keyId: manifest.keyId, reason: valid ? undefined : 'signature does not match the trusted key' };
}
