import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import {
  FsFolderTransport,
  WebDavTransport,
  resolveTransport,
  pushBundle,
  pullBundle,
  type SyncBundle,
} from '../src/index.js';

const PASS = 'correct horse battery staple';
const bundle: SyncBundle = {
  version: 1,
  tool: 'clihub',
  clihub: '1.57.0',
  generatedAt: '2026-01-01T00:00:00.000Z',
  files: [{ path: '.clihub/config.json', encoding: 'utf8', content: '{"version":1}' }],
  currentProfile: 'work',
};

test('FsFolderTransport: push → pull round-trips through encryption', async () => {
  const dir = mkdtempSync(`${tmpdir()}/clihub-tr-`);
  const t = new FsFolderTransport(dir);
  expect(await t.get()).toBeUndefined(); // nothing yet
  await pushBundle(t, bundle, PASS);
  const back = await pullBundle(t, PASS);
  expect(back).toEqual(bundle);
});

test('FsFolderTransport: blob on disk is ciphertext, not plaintext', async () => {
  const dir = mkdtempSync(`${tmpdir()}/clihub-tr-`);
  const t = new FsFolderTransport(dir);
  await pushBundle(t, bundle, PASS);
  const blob = (await t.get())!;
  expect(blob).toContain('BEGIN CLIHUB SYNC');
  expect(blob).not.toContain('config.json'); // payload encrypted
});

test('pull with wrong passphrase throws', async () => {
  const dir = mkdtempSync(`${tmpdir()}/clihub-tr-`);
  const t = new FsFolderTransport(dir);
  await pushBundle(t, bundle, PASS);
  await expect(pullBundle(t, 'wrong')).rejects.toThrow();
});

test('resolveTransport picks Fs vs WebDav by spec', () => {
  expect(resolveTransport('/some/folder')).toBeInstanceOf(FsFolderTransport);
  expect(resolveTransport('webdav:https://host/dav')).toBeInstanceOf(WebDavTransport);
});

test('WebDavTransport: push → pull against an in-process server', async () => {
  let stored: string | undefined;
  const server = http.createServer((req, res) => {
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { stored = body; res.writeHead(201).end(); });
    } else if (req.method === 'GET') {
      if (stored === undefined) { res.writeHead(404).end(); return; }
      res.writeHead(200).end(stored);
    } else {
      res.writeHead(405).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as import('node:net').AddressInfo).port;
  try {
    const t = new WebDavTransport({ url: `http://127.0.0.1:${port}/dav` });
    expect(await t.get()).toBeUndefined(); // 404 → undefined
    await pushBundle(t, bundle, PASS);
    const back = await pullBundle(t, PASS);
    expect(back).toEqual(bundle);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
