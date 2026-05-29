/**
 * Catalog trust store (v0.9.0).
 *
 * Pins publisher ed25519 public keys the user has chosen to trust, at
 * `~/.clihub/trusted-keys.json`. `verifyCatalogSignature` consults this
 * store to decide whether a signed catalog is from a trusted publisher.
 *
 * Trust is local and explicit — clihub never auto-trusts a key shipped
 * inside a catalog (that would defeat the purpose). The user runs
 * `clihub catalog trust add <name> <pubkey>` after obtaining the key out
 * of band.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { keyIdFor } from './signing.js';

export interface TrustedKey {
  /** Friendly label for the publisher. */
  name: string;
  /** Source URL prefix this key signs for (optional; matched by startsWith). */
  source?: string;
  /** ed25519 public key, PEM (spki). */
  publicKey: string;
  /** Short id derived from the key. */
  keyId: string;
  /** ISO 8601 timestamp the key was trusted. */
  addedAt: string;
}

export interface TrustStore {
  version: 1;
  keys: TrustedKey[];
}

export interface TrustIoOpts {
  /** Path override; defaults to `~/.clihub/trusted-keys.json`. */
  file?: string;
}

export function defaultTrustPath(): string {
  return path.join(os.homedir(), '.clihub', 'trusted-keys.json');
}

export async function readTrustStore(opts: TrustIoOpts = {}): Promise<TrustStore> {
  const file = opts.file ?? defaultTrustPath();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as TrustStore;
    if (!Array.isArray(parsed.keys)) return { version: 1, keys: [] };
    return { version: 1, keys: parsed.keys };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, keys: [] };
    throw err;
  }
}

async function writeTrustStore(store: TrustStore, opts: TrustIoOpts = {}): Promise<void> {
  const file = opts.file ?? defaultTrustPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}

/** Trust a publisher key. Re-trusting the same name replaces the entry. */
export async function addTrustedKey(
  name: string,
  publicKeyPem: string,
  opts: TrustIoOpts & { source?: string } = {},
): Promise<TrustedKey> {
  const keyId = keyIdFor(publicKeyPem); // throws on a malformed key
  const store = await readTrustStore(opts);
  const entry: TrustedKey = {
    name,
    ...(opts.source ? { source: opts.source } : {}),
    publicKey: publicKeyPem.trim() + '\n',
    keyId,
    addedAt: new Date().toISOString(),
  };
  const next = store.keys.filter((k) => k.name !== name);
  next.push(entry);
  await writeTrustStore({ version: 1, keys: next }, opts);
  return entry;
}

export async function removeTrustedKey(name: string, opts: TrustIoOpts = {}): Promise<boolean> {
  const store = await readTrustStore(opts);
  const next = store.keys.filter((k) => k.name !== name);
  if (next.length === store.keys.length) return false;
  await writeTrustStore({ version: 1, keys: next }, opts);
  return true;
}

export async function listTrustedKeys(opts: TrustIoOpts = {}): Promise<TrustedKey[]> {
  return (await readTrustStore(opts)).keys;
}

/** Find a trusted key matching a catalog source URL and/or keyId. */
export async function findTrustedKey(
  match: { source?: string; keyId?: string },
  opts: TrustIoOpts = {},
): Promise<TrustedKey | undefined> {
  const keys = (await readTrustStore(opts)).keys;
  // Prefer an exact keyId match, then a source-prefix match.
  if (match.keyId) {
    const byId = keys.find((k) => k.keyId === match.keyId);
    if (byId) return byId;
  }
  if (match.source) {
    return keys.find((k) => k.source && match.source!.startsWith(k.source));
  }
  return undefined;
}
