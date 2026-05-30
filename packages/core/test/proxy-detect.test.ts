import { test, expect } from 'bun:test';
import { detectSystemProxy, parseScutilProxy } from '../src/proxy/detect.js';

test('env HTTPS_PROXY wins, source=env', async () => {
  const sp = await detectSystemProxy({ env: { HTTPS_PROXY: 'http://e:1', HTTP_PROXY: 'http://h:2' } });
  expect(sp.url).toBe('http://e:1');
  expect(sp.source).toBe('env');
});

test('falls back to HTTP_PROXY then ALL_PROXY', async () => {
  expect((await detectSystemProxy({ env: { HTTP_PROXY: 'http://h:2' } })).url).toBe('http://h:2');
  expect((await detectSystemProxy({ env: { ALL_PROXY: 'socks5://a:3' } })).url).toBe('socks5://a:3');
});

test('lowercase env vars work', async () => {
  expect((await detectSystemProxy({ env: { https_proxy: 'http://lo:1' } })).url).toBe('http://lo:1');
});

test('no env + non-darwin → none', async () => {
  const sp = await detectSystemProxy({ env: {}, platform: 'linux' });
  expect(sp.source).toBe('none');
  expect(sp.url).toBeUndefined();
});

test('macOS scutil parse: HTTPS enabled', async () => {
  const out = '<dictionary> {\n  HTTPSEnable : 1\n  HTTPSProxy : 127.0.0.1\n  HTTPSPort : 7890\n}';
  expect(parseScutilProxy(out)?.url).toBe('http://127.0.0.1:7890');
});

test('macOS detect uses injected scutil when no env', async () => {
  const sp = await detectSystemProxy({
    env: {},
    platform: 'darwin',
    exec: async () => 'SOCKSEnable : 1\nSOCKSProxy : 10.0.0.1\nSOCKSPort : 1080',
  });
  expect(sp.url).toBe('socks5://10.0.0.1:1080');
  expect(sp.source).toBe('macos');
});
