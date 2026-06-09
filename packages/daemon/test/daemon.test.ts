import { describe, expect, test } from 'bun:test';
import {
  createDaemon,
  routeRequest,
  randomToken,
  DAEMON_VERSION,
  routeKeys,
} from '../src/index.js';
import { listEndpoints, listProviders } from '@clihub/core';

const TOKEN = 'a'.repeat(64);
const ctx = { token: TOKEN, version: DAEMON_VERSION };

function authedReq(path: string): Request {
  return new Request(`http://127.0.0.1${path}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
}

describe('routeRequest auth', () => {
  test('401 without a bearer token', async () => {
    const res = await routeRequest(new Request('http://127.0.0.1/healthz'), ctx);
    expect(res.status).toBe(401);
  });

  test('401 with a wrong token', async () => {
    const res = await routeRequest(
      new Request('http://127.0.0.1/healthz', { headers: { authorization: 'Bearer nope' } }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  test('403 on a non-loopback Host header (DNS-rebind guard)', async () => {
    const res = await routeRequest(
      new Request('http://127.0.0.1/healthz', {
        headers: { authorization: `Bearer ${TOKEN}`, host: 'evil.example.com' },
      }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  test('404 with the known-route list for an unknown path', async () => {
    const res = await routeRequest(authedReq('/v1/nope'), ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { known: string[] };
    expect(body.known).toEqual(routeKeys());
  });
});

describe('healthz', () => {
  test('reports ok + version', async () => {
    const res = await routeRequest(authedReq('/healthz'), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: 'clihub-daemon', version: DAEMON_VERSION });
  });
});

describe('golden parity — route result === direct kernel call', () => {
  test('/v1/endpoints matches listEndpoints()', async () => {
    const res = await routeRequest(authedReq('/v1/endpoints'), ctx);
    const body = (await res.json()) as { endpoints: unknown };
    expect(body.endpoints).toEqual(await listEndpoints());
  });

  test('/v1/providers ids match listProviders()', async () => {
    const res = await routeRequest(authedReq('/v1/providers'), ctx);
    const body = (await res.json()) as { providers: Array<{ id: string }> };
    expect(body.providers.map((p) => p.id)).toEqual(listProviders().map((p) => p.id));
  });
});

describe('createDaemon', () => {
  test('refuses a non-loopback bind without unsafeBind', () => {
    expect(() => createDaemon({ host: '0.0.0.0' })).toThrow(/non-loopback/);
  });

  test('serves over loopback with the session bearer', async () => {
    const d = createDaemon({ token: TOKEN });
    try {
      expect(d.host).toBe('127.0.0.1');
      expect(d.port).toBeGreaterThan(0);

      const ok = await fetch(`${d.url}/healthz`, { headers: { authorization: `Bearer ${TOKEN}` } });
      expect(ok.status).toBe(200);

      const denied = await fetch(`${d.url}/healthz`);
      expect(denied.status).toBe(401);
    } finally {
      d.stop();
    }
  });

  test('randomToken is 64 hex chars and unique', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
