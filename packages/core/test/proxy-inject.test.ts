import { test, expect } from 'bun:test';
import { applyProxyEnv, readProxyFromEnv, setToolProxy, getToolProxy } from '../src/proxy/inject.js';

test('applyProxyEnv sets HTTP_PROXY + HTTPS_PROXY', () => {
  const out = applyProxyEnv({}, 'http://proxy:8080');
  const env = out.env as Record<string, string>;
  expect(env.HTTP_PROXY).toBe('http://proxy:8080');
  expect(env.HTTPS_PROXY).toBe('http://proxy:8080');
  expect(env.ALL_PROXY).toBeUndefined();
});

test('socks url also sets ALL_PROXY', () => {
  const env = applyProxyEnv({}, 'socks5://host:1080').env as Record<string, string>;
  expect(env.ALL_PROXY).toBe('socks5://host:1080');
});

test('applyProxyEnv preserves other settings + other env vars', () => {
  const out = applyProxyEnv({ model: 'opus', env: { FOO: 'bar' } }, 'http://p:1');
  expect(out.model).toBe('opus');
  expect((out.env as Record<string, string>).FOO).toBe('bar');
});

test('clearing removes proxy keys, drops env if empty', () => {
  const withProxy = applyProxyEnv({}, 'http://p:1');
  const cleared = applyProxyEnv(withProxy, undefined);
  expect(cleared.env).toBeUndefined();

  const keepFoo = applyProxyEnv({ env: { FOO: 'bar', HTTP_PROXY: 'x' } }, undefined);
  expect((keepFoo.env as Record<string, string>).FOO).toBe('bar');
  expect((keepFoo.env as Record<string, string>).HTTP_PROXY).toBeUndefined();
});

test('setToolProxy refuses YAML-config CLIs (goose) with guidance; getToolProxy returns undefined', async () => {
  await expect(setToolProxy('goose', 'http://p:8080')).rejects.toThrow(/YAML/i);
  expect(await getToolProxy('goose')).toBeUndefined();
});

test('readProxyFromEnv prefers HTTPS then HTTP then ALL', () => {
  expect(readProxyFromEnv({ HTTP_PROXY: 'h', HTTPS_PROXY: 's' })).toBe('s');
  expect(readProxyFromEnv({ HTTP_PROXY: 'h' })).toBe('h');
  expect(readProxyFromEnv({ ALL_PROXY: 'a' })).toBe('a');
  expect(readProxyFromEnv(undefined)).toBeUndefined();
});
