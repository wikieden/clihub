/**
 * Catalog signing (v0.9.0, supply-chain authenticity).
 *
 * `syncCatalog` already records a sha256 per file — that proves the
 * catalog wasn't corrupted in transit (integrity). It does NOT prove WHO
 * published it (authenticity). This module adds an ed25519 signature over
 * the manifest's content fingerprint, verified against a publisher key the
 * user has explicitly trusted.
 *
 * Pure crypto only (node:crypto) — no cosign, no external key servers, no
 * new dependencies. The signature covers a CANONICAL payload (source +
 * version + sorted checksums) so re-signing identical content is stable
 * and the volatile `lastSync` timestamp is excluded.
 */
import crypto from 'node:crypto';

export interface CatalogKeypair {
  publicKey: string;
  privateKey: string;
}

/** Generate an ed25519 keypair as PEM strings (spki public / pkcs8 private). */
export function generateCatalogKeypair(): CatalogKeypair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/** Short, stable id for a public key (first 16 hex of sha256 over its DER). */
export function keyIdFor(publicKeyPem: string): string {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

export interface SignablePayload {
  source: string;
  version?: string;
  checksums: Partial<Record<string, string>>;
}

/** Deterministic bytes to sign: sorted checksums + source + version. */
export function canonicalPayload(input: SignablePayload): string {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(input.checksums).sort()) {
    const v = input.checksums[key];
    if (v) sorted[key] = v;
  }
  return JSON.stringify({ source: input.source, version: input.version ?? null, checksums: sorted });
}

/** Sign a canonical payload with an ed25519 private key. Returns base64. */
export function signCatalogPayload(payload: string, privateKeyPem: string): string {
  // ed25519 takes a null algorithm.
  return crypto.sign(null, Buffer.from(payload, 'utf8'), privateKeyPem).toString('base64');
}

/** Verify a base64 ed25519 signature over a canonical payload. */
export function verifyCatalogPayload(payload: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(payload, 'utf8'), publicKeyPem, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
