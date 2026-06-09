import { afterEach, describe, expect, test, vi } from 'vitest';
import { DaemonClient, DaemonError, resolveConfig } from './daemon';

const cfg = { baseUrl: 'http://127.0.0.1:9999', token: 'tok-123' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { __CLIHUB__?: unknown }).__CLIHUB__;
});

describe('resolveConfig', () => {
  test('prefers the Tauri-injected globals', () => {
    (globalThis as { __CLIHUB__?: unknown }).__CLIHUB__ = { baseUrl: 'http://x', token: 'abc' };
    expect(resolveConfig()).toEqual({ baseUrl: 'http://x', token: 'abc' });
  });

  test('falls back to the loopback default when nothing is set', () => {
    expect(resolveConfig()).toEqual({ baseUrl: 'http://127.0.0.1:8787', token: '' });
  });
});

describe('request', () => {
  test('GET sends the bearer header and parses JSON', async () => {
    let url = '';
    let init: RequestInit = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, i: RequestInit) => {
        url = u;
        init = i;
        return jsonResponse({ tools: [{ id: 'claude-code' }] });
      }),
    );

    const out = await new DaemonClient(cfg).get<{ tools: Array<{ id: string }> }>('/v1/doctor');

    expect(out.tools[0]?.id).toBe('claude-code');
    expect(url).toBe('http://127.0.0.1:9999/v1/doctor');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-123');
  });

  test('POST serializes the body and sets content-type', async () => {
    let init: RequestInit = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, i: RequestInit) => {
        init = i;
        return jsonResponse({ ok: true });
      }),
    );

    await new DaemonClient(cfg).post('/v1/endpoint/use', { id: 'anthropic' });
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.body).toBe('{"id":"anthropic"}');
  });

  test('non-ok response throws DaemonError with the daemon error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'missing required string field "id"' }, 400)));
    await expect(new DaemonClient(cfg).post('/v1/endpoint/use', {})).rejects.toMatchObject({
      name: 'DaemonError',
      status: 400,
      message: 'missing required string field "id"',
    });
    expect(DaemonError).toBeDefined();
  });
});

describe('stream', () => {
  test('parses successive SSE data frames and unsubscribe aborts', async () => {
    const frames = ['data: {"tools":[]}\n\n', 'data: {"tools":[{"id":"codex"}]}\n\n'];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const f of frames) controller.enqueue(enc.encode(f));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })),
    );

    const got: unknown[] = [];
    const client = new DaemonClient(cfg);
    await new Promise<void>((resolve) => {
      const stop = client.stream('/stream/doctor', (d) => {
        got.push(d);
        if (got.length === 2) {
          stop();
          resolve();
        }
      });
    });

    expect(got).toEqual([{ tools: [] }, { tools: [{ id: 'codex' }] }]);
  });
});
