/**
 * Typed client for the @clihub/daemon loopback sidecar.
 *
 * Auth: every request carries `Authorization: Bearer <token>`. SSE streams are
 * consumed via fetch + ReadableStream (NOT EventSource) precisely because
 * EventSource cannot set an Authorization header — this keeps the bearer in a
 * header (never in the URL/logs) and needs no daemon-side change.
 */

export interface DaemonConfig {
  baseUrl: string;
  token: string;
}

declare global {
  // Injected by the Tauri shell once it has spawned the daemon and read its token.
  // eslint-disable-next-line no-var
  var __CLIHUB__: Partial<DaemonConfig> | undefined;
}

const DEFAULT_URL = 'http://127.0.0.1:8787';

/** Resolve the daemon endpoint: Tauri-injected globals win, else Vite env, else default. */
export function resolveConfig(): DaemonConfig {
  const injected = globalThis.__CLIHUB__;
  const baseUrl = injected?.baseUrl ?? import.meta.env.VITE_CLIHUB_DAEMON_URL ?? DEFAULT_URL;
  const token = injected?.token ?? import.meta.env.VITE_CLIHUB_DAEMON_TOKEN ?? '';
  return { baseUrl, token };
}

export class DaemonError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DaemonError';
  }
}

export class DaemonClient {
  constructor(private readonly config: DaemonConfig = resolveConfig()) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.config.token}` };
    if (body !== undefined) headers['content-type'] = 'application/json';

    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message = (data && typeof data === 'object' && 'error' in data && String(data.error)) || res.statusText;
      throw new DaemonError(res.status, message);
    }
    return data as T;
  }

  /**
   * Subscribe to an SSE route. Returns an unsubscribe fn that aborts the
   * connection. Parses `data: <json>\n\n` frames from the response stream.
   */
  stream(path: string, onData: (data: unknown) => void, onError?: (err: unknown) => void): () => void {
    const ctrl = new AbortController();
    void this.pump(path, ctrl.signal, onData).catch((err) => {
      if (!ctrl.signal.aborted && onError) onError(err);
    });
    return () => ctrl.abort();
  }

  private async pump(path: string, signal: AbortSignal, onData: (data: unknown) => void): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${this.config.token}` },
      signal,
    });
    if (!res.ok || !res.body) throw new DaemonError(res.status, `stream ${path} failed`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
        if (dataLine) {
          try {
            onData(JSON.parse(dataLine.slice(6)));
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
  }
}
