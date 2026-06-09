/**
 * @clihub/daemon — thin Bun HTTP sidecar (architecture §6).
 *
 * The only IPC surface for the desktop GUI. Loopback-bound, per-session 256-bit
 * bearer on EVERY route (incl. /healthz), DNS-rebind Host guard, constant-time
 * token compare. All domain logic stays in `@clihub/core`; this file only
 * authenticates, routes, and serializes.
 */
import { ROUTES, routeKeys, HttpError } from './routes.js';
import { STREAMS, streamKeys } from './streams.js';

export { ROUTES, routeKeys, HttpError, type RouteCtx, type RouteHandler } from './routes.js';
export { STREAMS, streamKeys, sseFrame, type StreamHandler } from './streams.js';

/** Monorepo version reported by /healthz. Bump with the package version. */
export const DAEMON_VERSION = '1.61.0';

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export interface DaemonOptions {
  /** TCP port; 0 (default) asks the OS for an ephemeral free port. */
  port?: number;
  /** Bind address; default 127.0.0.1. Non-loopback requires `unsafeBind`. */
  host?: string;
  /** Bearer token; default a fresh 256-bit hex string. */
  token?: string;
  /** Version surfaced by /healthz; defaults to DAEMON_VERSION. */
  version?: string;
  /** Escape hatch to bind a non-loopback address (refused by default). */
  unsafeBind?: boolean;
}

export interface DaemonHandle {
  port: number;
  host: string;
  token: string;
  url: string;
  stop: () => void;
}

/** 256-bit token as lowercase hex (Web Crypto — available in Bun and Node 18+). */
export function randomToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Length-checked constant-time string compare (avoids token-timing leaks). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Hostname from a Host header: strip the port, unwrap IPv6 brackets, lowercase. */
function hostnameOf(rawHost: string): string {
  let h = rawHost.trim();
  if (!h) return '';
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return (end >= 0 ? h.slice(1, end) : h.slice(1)).toLowerCase();
  }
  // Strip :port only when there's a single colon (IPv4/hostname, not bare IPv6).
  const first = h.indexOf(':');
  if (first >= 0 && first === h.lastIndexOf(':')) h = h.slice(0, first);
  return h.toLowerCase();
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Pure request router — auth + DNS-rebind guard + dispatch. Exported so tests
 * can exercise it without binding a socket; `createDaemon` wires it to Bun.serve.
 */
export async function routeRequest(
  req: Request,
  ctx: { token: string; version: string },
): Promise<Response> {
  // DNS-rebind guard: reject a present Host header that isn't loopback. (An empty
  // header — no network Host — is allowed and backstopped by the bearer check.)
  const rawHost = req.headers.get('host') ?? '';
  if (rawHost && !LOOPBACK.has(hostnameOf(rawHost))) return json(403, { error: 'forbidden host' });

  // Bearer auth on every route (incl. /healthz).
  const auth = req.headers.get('authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!presented || !timingSafeEqual(presented, ctx.token)) {
    return json(401, { error: 'unauthorized' });
  }

  const url = new URL(req.url);
  const key = `${req.method} ${url.pathname}`;

  // Streaming routes (SSE) build their own Response; don't JSON-wrap them.
  const stream = STREAMS[key];
  if (stream) {
    try {
      return stream({ version: ctx.version });
    } catch (e) {
      return errorResponse(e);
    }
  }

  const handler = ROUTES[key];
  if (!handler) return json(404, { error: 'not found', route: key, known: knownRoutes() });

  try {
    return json(200, await handler({ version: ctx.version }, req));
  } catch (e) {
    return errorResponse(e);
  }
}

/** Map a thrown error to a Response: HttpError keeps its status, else 500. */
function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json(e.status, { error: e.message });
  return json(500, { error: e instanceof Error ? e.message : String(e) });
}

/** All registered route keys (data + stream), sorted — surfaced on a 404. */
export function knownRoutes(): string[] {
  return [...routeKeys(), ...streamKeys()].sort();
}

/** Start a loopback HTTP daemon. Throws if asked to bind a non-loopback host without `unsafeBind`. */
export function createDaemon(opts: DaemonOptions = {}): DaemonHandle {
  const host = opts.host ?? '127.0.0.1';
  if (!LOOPBACK.has(host) && !opts.unsafeBind) {
    throw new Error(`refusing to bind non-loopback host "${host}" without unsafeBind`);
  }
  const token = opts.token ?? randomToken();
  const version = opts.version ?? DAEMON_VERSION;

  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname: host,
    // Cap request bodies (clihub.yaml is tiny) so an authenticated-but-confused
    // client can't memory-pressure the sidecar; Bun's default is 128 MiB.
    maxRequestBodySize: 4 * 1024 * 1024,
    fetch: (req) => routeRequest(req, { token, version }),
  });

  const port = server.port ?? 0;
  return {
    port,
    host,
    token,
    url: `http://${host}:${port}`,
    stop: () => server.stop(true),
  };
}
