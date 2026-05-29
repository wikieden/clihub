/**
 * `clihub conformance` (v1.7.0, Pillar VII — compatibility suite).
 *
 * Validates that a catalog directory conforms to the published clihub
 * specs (see docs/spec): manifest + sha256 integrity, valid JSON, valid
 * declarative provider specs, signature status, and (if present) a
 * well-formed `clihub.lock.json`. This is the machine-checkable basis for
 * a `clihub-compatible` badge — any client producing a catalog can run it.
 *
 * Read-only; composes the existing verifiers, no new dependencies.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  CATALOG_FILES,
  readCatalogManifest,
  verifyCatalog,
  verifyCatalogSignature,
} from '../catalog/sync.js';
import { parseProvidersJson } from '../tools/declarative.js';
import { readLockfile } from '../apply/index.js';

export interface ConformanceCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface ConformanceReport {
  dir: string;
  checks: ConformanceCheck[];
  passed: number;
  failed: number;
  conformant: boolean;
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false);
}

export async function checkConformance(dir: string): Promise<ConformanceReport> {
  const checks: ConformanceCheck[] = [];
  const add = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  // 1. manifest present + parseable
  const manifest = await readCatalogManifest(dir);
  add('manifest.json present + valid JSON', Boolean(manifest), manifest ? undefined : 'missing or unparseable');

  // 2. checksums match (integrity) — only meaningful with a manifest
  if (manifest) {
    const bad = await verifyCatalog(dir);
    add('sha256 checksums match manifest', bad.length === 0, bad.length ? `mismatch: ${bad.join(', ')}` : undefined);
  }

  // 3. each present catalog file parses as JSON
  for (const name of CATALOG_FILES) {
    const file = path.join(dir, name);
    if (!(await exists(file))) continue;
    try {
      JSON.parse(await fs.readFile(file, 'utf8'));
      add(`${name} parses`, true);
    } catch (e) {
      add(`${name} parses`, false, String(e));
    }
  }

  // 4. providers.json (if present) holds valid declarative specs
  const providersFile = path.join(dir, 'providers.json');
  if (await exists(providersFile)) {
    try {
      const specs = parseProvidersJson(await fs.readFile(providersFile, 'utf8'));
      add('providers.json: all specs valid', true, `${specs.length} provider(s)`);
    } catch (e) {
      add('providers.json: all specs valid', false, e instanceof Error ? e.message : String(e));
    }
  }

  // 5. signature status (informational — not a hard fail when unsigned)
  if (manifest) {
    const sig = await verifyCatalogSignature(dir);
    if (!sig.signed) add('catalog signed', false, 'unsigned (optional, but recommended)');
    else if (!sig.trusted) add('catalog signed', true, `signed (key ${sig.keyId}; no local trust entry)`);
    else add('catalog signature valid', sig.valid, sig.valid ? `key ${sig.keyId}` : sig.reason);
  }

  // 6. lockfile (if present) is well-formed v1
  const lockFile = path.join(dir, 'clihub.lock.json');
  if (await exists(lockFile)) {
    const lock = await readLockfile(lockFile);
    add('clihub.lock.json is v1', Boolean(lock && lock.version === 1), lock ? undefined : 'missing version:1 or unparseable');
  }

  // signature-unsigned is a soft warning, not a conformance failure:
  // exclude it from the hard pass/fail tally.
  const hard = checks.filter((c) => c.name !== 'catalog signed' || c.pass);
  const failed = hard.filter((c) => !c.pass).length;
  const passed = checks.filter((c) => c.pass).length;

  return { dir, checks, passed, failed, conformant: failed === 0 };
}
