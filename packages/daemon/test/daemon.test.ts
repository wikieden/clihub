import { describe, expect, test } from 'bun:test';
import {
  createDaemon,
  routeRequest,
  randomToken,
  DAEMON_VERSION,
  routeKeys,
  knownRoutes,
  sseFrame,
  streamKeys,
} from '../src/index.js';
import {
  listEndpoints,
  listProviders,
  reconcileMcpPlan,
  planApply,
  parseClihubYaml,
  skillCapableTools,
  readBindings,
  listTeams,
} from '@clihub/core';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const TOKEN = 'a'.repeat(64);
const ctx = { token: TOKEN, version: DAEMON_VERSION };

function getReq(path: string): Request {
  return new Request(`http://127.0.0.1${path}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
}

function postReq(path: string, body?: unknown, auth = true): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth) headers.authorization = `Bearer ${TOKEN}`;
  return new Request(`http://127.0.0.1${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('auth + guards', () => {
  test('401 without a bearer token', async () => {
    expect((await routeRequest(new Request('http://127.0.0.1/healthz'), ctx)).status).toBe(401);
  });

  test('401 with a wrong token', async () => {
    const res = await routeRequest(
      new Request('http://127.0.0.1/healthz', { headers: { authorization: 'Bearer nope' } }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  test('401 on a POST without a token', async () => {
    expect((await routeRequest(postReq('/v1/endpoint/use', { id: 'x' }, false), ctx)).status).toBe(401);
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

  test('allows an IPv6 [::1] loopback Host (with port)', async () => {
    const res = await routeRequest(
      new Request('http://127.0.0.1/healthz', {
        headers: { authorization: `Bearer ${TOKEN}`, host: '[::1]:8973' },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
  });

  test('404 lists known routes (data + stream) for an unknown path', async () => {
    const res = await routeRequest(getReq('/v1/nope'), ctx);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { known: string[] };
    expect(body.known).toEqual(knownRoutes());
    expect(body.known).toContain('POST /v1/endpoint/use');
    expect(body.known).toContain('GET /stream/doctor');
  });
});

describe('healthz', () => {
  test('reports ok + version', async () => {
    const res = await routeRequest(getReq('/healthz'), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: 'clihub-daemon', version: DAEMON_VERSION });
  });
});

describe('golden parity — read routes === direct kernel call', () => {
  test('/v1/endpoints matches listEndpoints()', async () => {
    const res = await routeRequest(getReq('/v1/endpoints'), ctx);
    const body = (await res.json()) as { endpoints: unknown };
    expect(body.endpoints).toEqual(await listEndpoints());
  });

  test('/v1/providers ids match listProviders()', async () => {
    const res = await routeRequest(getReq('/v1/providers'), ctx);
    const body = (await res.json()) as { providers: Array<{ id: string }> };
    expect(body.providers.map((p) => p.id)).toEqual(listProviders().map((p) => p.id));
  });

  test('/v1/bindings: live bindings (read-only) + all 7 adapter capabilities', async () => {
    const res = await routeRequest(getReq('/v1/bindings'), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bindings: Record<string, unknown>;
      adapters: Array<{ cli: string; modelOnly: boolean; deliversKey: boolean }>;
    };
    expect(body.bindings).toEqual(await readBindings());
    expect(body.adapters.map((a) => a.cli).sort()).toEqual(
      ['claude-code', 'codex', 'cursor', 'gemini', 'goose', 'kiro', 'qwen'],
    );
    // the honest flags the GUI matrix renders: kiro/cursor are model-only,
    // goose can't carry a key in its config file.
    expect(body.adapters.find((a) => a.cli === 'kiro')?.modelOnly).toBe(true);
    expect(body.adapters.find((a) => a.cli === 'cursor')?.modelOnly).toBe(true);
    expect(body.adapters.find((a) => a.cli === 'goose')?.deliversKey).toBe(false);
  });
});

describe('mutating routes — validation (no side effects)', () => {
  test('POST /v1/endpoint/use with no body → 400', async () => {
    expect((await routeRequest(postReq('/v1/endpoint/use'), ctx)).status).toBe(400);
  });

  test('POST /v1/endpoint/use {} → 400 (missing id)', async () => {
    expect((await routeRequest(postReq('/v1/endpoint/use', {}), ctx)).status).toBe(400);
  });

  test('POST /v1/mcp/add {} → 400 (missing id)', async () => {
    expect((await routeRequest(postReq('/v1/mcp/add', {}), ctx)).status).toBe(400);
  });

  test('POST /v1/profile/use {} → 400 (missing name)', async () => {
    expect((await routeRequest(postReq('/v1/profile/use', {}), ctx)).status).toBe(400);
  });

  test('POST /v1/use {} → 400 (missing endpoint)', async () => {
    expect((await routeRequest(postReq('/v1/use', {}), ctx)).status).toBe(400);
  });

  test('POST /v1/model {} → 400 (missing cli/model)', async () => {
    expect((await routeRequest(postReq('/v1/model', {}), ctx)).status).toBe(400);
    expect((await routeRequest(postReq('/v1/model', { cli: 'kiro' }), ctx)).status).toBe(400);
  });

  test('POST /v1/rollback {} / unknown tool → 400 (no install attempted)', async () => {
    expect((await routeRequest(postReq('/v1/rollback', {}), ctx)).status).toBe(400);
    expect((await routeRequest(postReq('/v1/rollback', { tool: 'nope-zzz' }), ctx)).status).toBe(400);
  });

  test('POST /v1/yaml {} → 400 (missing content)', async () => {
    expect((await routeRequest(postReq('/v1/yaml', {}), ctx)).status).toBe(400);
  });

  test('POST /v1/team/* and /v1/sync/export validate required fields → 400', async () => {
    expect((await routeRequest(postReq('/v1/team/add', { name: 'x' }), ctx)).status).toBe(400);
    expect((await routeRequest(postReq('/v1/team/pull', {}), ctx)).status).toBe(400);
    expect((await routeRequest(postReq('/v1/team/rm', {}), ctx)).status).toBe(400);
    expect((await routeRequest(postReq('/v1/sync/export', {}), ctx)).status).toBe(400);
  });

  test('GET /v1/teams matches listTeams()', async () => {
    const res = await routeRequest(getReq('/v1/teams'), ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { teams: string[] }).teams).toEqual(await listTeams());
  });

  // ALWAYS pin `dir` to a sandbox in these tests: without it the route
  // discovers a clihub.yaml by walking UP from the test cwd — all the way
  // into $HOME — and a 200 means a REAL file was replaced.
  test('POST /v1/yaml with sandbox dir but no clihub.yaml there → 400, nothing created', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'clihub-yaml-'));
    const res = await routeRequest(postReq('/v1/yaml', { content: 'version: 1\n', dir }), ctx);
    expect(res.status).toBe(400);
  });

  test('POST /v1/yaml round-trip in a sandbox dir (write + GET back)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'clihub-yaml-'));
    await writeFile(path.join(dir, 'clihub.yaml'), 'version: 1\ntools: []\n', 'utf8');
    const res = await routeRequest(
      postReq('/v1/yaml', { content: 'version: 1\ntools:\n  - id: codex\n', dir }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { file: string; tools: number };
    expect(body.file).toBe(path.join(dir, 'clihub.yaml'));
    expect(body.tools).toBe(1);

    const read = await routeRequest(getReq(`/v1/yaml?dir=${encodeURIComponent(dir)}`), ctx);
    expect(read.status).toBe(200);
    expect(((await read.json()) as { content: string }).content).toContain('id: codex');
  });

  test('GET /v1/versions covers every provider with history + rollback target fields', async () => {
    const res = await routeRequest(getReq('/v1/versions'), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tools: Array<{ id: string; current: string | null; target: string | null; records: unknown[] }>;
    };
    expect(body.tools.map((t) => t.id).sort()).toEqual(listProviders().map((p) => p.id).sort());
    for (const t of body.tools) {
      expect(Array.isArray(t.records)).toBe(true);
      expect('target' in t).toBe(true);
    }
  });

  // addMcp early-returns for an unknown id with no command/url — it touches no
  // config file, so this exercises POST→kernel delegation + the no-op audit path
  // (audit is skipped when done is empty) without mutating real config.
  test('POST /v1/mcp/add unknown id → 200 with failure, mutates nothing', async () => {
    const res = await routeRequest(postReq('/v1/mcp/add', { id: 'clihub-nonexistent-server-zzz' }), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { done: string[]; failed: Array<{ tool: string }> };
    expect(body.done).toEqual([]);
    expect(body.failed.length).toBeGreaterThan(0);
  });
});

describe('golden parity — read-only POST paths === direct kernel call', () => {
  test('POST /v1/mcp/reconcile (preview) matches reconcileMcpPlan({})', async () => {
    const res = await routeRequest(postReq('/v1/mcp/reconcile', {}), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(await reconcileMcpPlan({}));
  });

  test('POST /v1/apply {plan:true, yaml} matches planApply(parse(yaml))', async () => {
    const yaml = 'tools: []\n';
    const res = await routeRequest(postReq('/v1/apply', { plan: true, yaml }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(await planApply(parseClihubYaml(yaml)));
  });
});

describe('M2 read routes', () => {
  test('GET /v1/skills covers every skill-capable CLI with an installed flag', async () => {
    const res = await routeRequest(getReq('/v1/skills'), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tools: Array<{ tool: string; installed: boolean; skills: unknown[] }>;
    };
    expect(body.tools.map((t) => t.tool).sort()).toEqual([...skillCapableTools()].sort());
    for (const t of body.tools) {
      expect(Array.isArray(t.skills)).toBe(true);
      expect(typeof t.installed).toBe('boolean');
    }
  });

  test('GET /v1/status?dir → 400 with CLIHUB-E-600 when no clihub.yaml exists there', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'clihub-status-'));
    const res = await routeRequest(getReq(`/v1/status?dir=${encodeURIComponent(tmp)}`), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('CLIHUB-E-600');
  });

  test('GET /v1/status rejects a relative dir', async () => {
    const res = await routeRequest(getReq('/v1/status?dir=relative/path'), ctx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('absolute');
  });

  test('GET /v1/status?dir → report shape for a minimal clihub.yaml', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'clihub-status-'));
    await writeFile(path.join(tmp, 'clihub.yaml'), 'tools: []\n');
    const res = await routeRequest(getReq(`/v1/status?dir=${encodeURIComponent(tmp)}`), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { file: string; compliant: boolean; items: unknown[] };
    expect(body.file.endsWith('clihub.yaml')).toBe(true);
    expect(typeof body.compliant).toBe('boolean');
    expect(Array.isArray(body.items)).toBe(true);
  });
});

describe('CORS for the GUI WebView', () => {
  const ORIGIN = 'http://localhost:1420';

  test('OPTIONS preflight from a known GUI origin → 204 with CORS headers, no token needed', async () => {
    const res = await routeRequest(
      new Request('http://127.0.0.1/v1/doctor', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
      ctx,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  test('OPTIONS from an unknown origin → 403', async () => {
    const res = await routeRequest(
      new Request('http://127.0.0.1/v1/doctor', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example.com' },
      }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('authed GET from a known GUI origin echoes the CORS header', async () => {
    const res = await routeRequest(
      new Request('http://127.0.0.1/healthz', {
        headers: { authorization: `Bearer ${TOKEN}`, origin: ORIGIN },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  test('non-browser clients (no Origin) get no CORS headers and work unchanged', async () => {
    const res = await routeRequest(getReq('/healthz'), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('SSE streams', () => {
  test('sseFrame formats a data frame', () => {
    expect(sseFrame({ a: 1 })).toBe('data: {"a":1}\n\n');
  });

  test('streamKeys lists the two streams', () => {
    expect(streamKeys()).toEqual(['GET /stream/doctor', 'GET /stream/watch']);
  });

  test('GET /stream/doctor without a token → 401', async () => {
    expect((await routeRequest(new Request('http://127.0.0.1/stream/doctor'), ctx)).status).toBe(401);
  });
});

describe('createDaemon (live loopback server)', () => {
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

  test('streams a first /stream/doctor frame over the wire', async () => {
    const d = createDaemon({ token: TOKEN });
    const ctrl = new AbortController();
    try {
      const res = await fetch(`${d.url}/stream/doctor`, {
        headers: { authorization: `Bearer ${TOKEN}` },
        signal: ctrl.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const reader = res.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text.startsWith('data: ')).toBe(true);
      const payload = JSON.parse(text.slice('data: '.length).trim());
      expect(Array.isArray(payload.tools)).toBe(true);
    } finally {
      ctrl.abort();
      d.stop();
    }
  }, 20000);

  test('opens /stream/watch and cancels cleanly', async () => {
    const d = createDaemon({ token: TOKEN });
    const ctrl = new AbortController();
    try {
      const res = await fetch(`${d.url}/stream/watch`, {
        headers: { authorization: `Bearer ${TOKEN}` },
        signal: ctrl.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
    } finally {
      ctrl.abort();
      d.stop();
    }
  }, 20000);

  test('randomToken is 64 hex chars and unique', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
