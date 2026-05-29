import { test, expect } from 'bun:test';
import {
  generateCatalogKeypair,
  keyIdFor,
  canonicalPayload,
  signCatalogPayload,
  verifyCatalogPayload,
} from '../src/catalog/signing.js';

test('keypair + keyId shape', () => {
  const kp = generateCatalogKeypair();
  expect(kp.publicKey).toContain('BEGIN PUBLIC KEY');
  expect(kp.privateKey).toContain('BEGIN PRIVATE KEY');
  expect(keyIdFor(kp.publicKey)).toMatch(/^[0-9a-f]{16}$/);
});

test('canonicalPayload is sorted + stable', () => {
  const a = canonicalPayload({ source: 's', version: '1', checksums: { b: '2', a: '1' } });
  const b = canonicalPayload({ source: 's', version: '1', checksums: { a: '1', b: '2' } });
  expect(a).toBe(b);
  expect(a.indexOf('"a"')).toBeLessThan(a.indexOf('"b"'));
});

test('sign/verify roundtrip, tamper + wrong key fail', () => {
  const kp = generateCatalogKeypair();
  const payload = canonicalPayload({ source: 's', checksums: { a: '1' } });
  const sig = signCatalogPayload(payload, kp.privateKey);
  expect(verifyCatalogPayload(payload, sig, kp.publicKey)).toBe(true);
  expect(verifyCatalogPayload(payload + 'x', sig, kp.publicKey)).toBe(false);
  const other = generateCatalogKeypair();
  expect(verifyCatalogPayload(payload, sig, other.publicKey)).toBe(false);
});
