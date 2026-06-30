/**
 * Tiny JSON-over-HTTP helper for quota fetchers.
 *
 * Uses the global `fetch`. The clihub daemon (the real consumer of quota) runs
 * on Bun, whose `fetch` honors a `proxy` init field and the HTTP(S)_PROXY env
 * natively — many users can only reach these endpoints through a local/corp
 * proxy. On plain Node the `proxy` field is ignored harmlessly (Node fetch has
 * no proxy support); env-based proxying still applies under Bun.
 */
export interface HttpInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  proxy?: string;
}

export async function httpJson<T>(url: string, init: HttpInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20000);
  const proxy =
    init.proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    undefined;
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
      // Bun-specific; ignored by Node's fetch.
      ...(proxy ? { proxy } : {}),
    } as RequestInit);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`unauthorized (${res.status})`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
