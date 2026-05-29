import { test, expect } from 'bun:test';
import { generatePkce, randomState, buildAuthorizeUrl, refreshToken } from '../src/auth/login.js';

test('PKCE verifier/challenge distinct + url-safe', () => {
  const p = generatePkce();
  expect(p.verifier).not.toBe(p.challenge);
  expect(p.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(p.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
});

test('randomState is url-safe + unique', () => {
  const a = randomState();
  const b = randomState();
  expect(a).not.toBe(b);
  expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
});

test('buildAuthorizeUrl carries S256 challenge + state', () => {
  const url = buildAuthorizeUrl(
    { id: 'x', tokenUrl: 't', clientId: 'cid', authorizeUrl: 'http://a/authorize', scope: 'a b' },
    { redirectUri: 'http://127.0.0.1/cb', challenge: 'CH', state: 'ST' },
  );
  expect(url).toContain('code_challenge=CH');
  expect(url).toContain('code_challenge_method=S256');
  expect(url).toContain('state=ST');
});

test('refreshToken exchanges via injected fetch', async () => {
  const fetchImpl = (async () => ({
    ok: true,
    json: async () => ({ access_token: 'a', refresh_token: 'r2', expires_in: 60, token_type: 'Bearer' }),
  })) as unknown as typeof fetch;
  const tok = await refreshToken({ id: 'x', tokenUrl: 'http://t', clientId: 'c' }, 'r1', { fetchImpl, now: 1000 });
  expect(tok.access_token).toBe('a');
  expect(tok.refresh_token).toBe('r2');
  expect(tok.expires_at).toBe(1000 + 60 * 1000);
});

test('refreshToken keeps old refresh_token when none returned', async () => {
  const fetchImpl = (async () => ({ ok: true, json: async () => ({ access_token: 'a' }) })) as unknown as typeof fetch;
  const tok = await refreshToken({ id: 'x', tokenUrl: 'http://t', clientId: 'c' }, 'r1', { fetchImpl });
  expect(tok.refresh_token).toBe('r1');
});

test('refreshToken throws on error response', async () => {
  const fetchImpl = (async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) })) as unknown as typeof fetch;
  await expect(refreshToken({ id: 'x', tokenUrl: 'http://t', clientId: 'c' }, 'r1', { fetchImpl })).rejects.toThrow(/invalid_grant/);
});
