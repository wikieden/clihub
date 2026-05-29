import { test, expect } from 'bun:test';
import { encryptBundle, decryptBundle, type SyncBundle } from '../src/sync/index.js';

const bundle: SyncBundle = {
  version: 1,
  tool: 'clihub',
  clihub: '1.0.0',
  generatedAt: '2026-01-01T00:00:00.000Z',
  files: [{ path: '.clihub/config.json', encoding: 'utf8', content: '{"version":1}' }],
  currentProfile: 'work',
};

test('encrypt/decrypt roundtrip', () => {
  const text = encryptBundle(bundle, 'correct horse');
  expect(text).toContain('BEGIN CLIHUB SYNC');
  const back = decryptBundle(text, 'correct horse');
  expect(back.files[0]!.content).toBe('{"version":1}');
  expect(back.currentProfile).toBe('work');
});

test('wrong passphrase throws', () => {
  const text = encryptBundle(bundle, 'right');
  expect(() => decryptBundle(text, 'wrong')).toThrow();
});

test('tampered ciphertext throws', () => {
  const text = encryptBundle(bundle, 'pw');
  const bad = text.replace(/\n(.{10})/, '\nXXXXXXXXXX');
  expect(() => decryptBundle(bad, 'pw')).toThrow();
});
