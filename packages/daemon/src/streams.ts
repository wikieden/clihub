/**
 * @clihub/daemon — Server-Sent Events streams (one-way server→client push).
 *
 * SSE over WebSockets by design: it reuses the existing bearer/loopback HTTP
 * path (no upgrade handshake, no required `message` handler, no query-string
 * token hack), and EventSource auto-reconnects. Two streams:
 *   GET /stream/doctor — poll runHealthMatrix, emit only when the matrix changes
 *   GET /stream/watch  — one shared startWatch fanned out to every subscriber
 */
import { runHealthMatrix, startWatch, type WatchHandle, type WatchEvent } from '@clihub/core';
import type { RouteCtx } from './routes.js';

/** Stream handlers build their own streaming Response (not JSON-wrapped). */
export type StreamHandler = (ctx: RouteCtx) => Response;

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
} as const;

const DOCTOR_POLL_MS = 4000;

/** Format one SSE frame. Exported for unit testing. */
export function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** Health matrix has no change-notification — poll, push only on change. */
function doctorStream(): Response {
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let last = '';

  return new Response(
    new ReadableStream({
      async start(controller) {
        const tick = async () => {
          if (closed) return;
          try {
            const rows = await runHealthMatrix();
            const serialized = JSON.stringify(rows);
            if (serialized !== last && !closed) {
              last = serialized;
              controller.enqueue(enc.encode(sseFrame({ tools: rows })));
            }
          } catch (e) {
            if (!closed) controller.enqueue(enc.encode(sseFrame({ error: (e as Error).message })));
          }
        };
        await tick(); // immediate first frame — deterministic for clients/tests
        if (closed) return; // client left during the first poll — don't leak an interval
        timer = setInterval(tick, DOCTOR_POLL_MS);
      },
      cancel() {
        closed = true;
        if (timer) clearInterval(timer);
      },
    }),
    { headers: SSE_HEADERS },
  );
}

/**
 * One process-wide fs watcher fanned out to N subscribers. `events()` is a
 * single-consumer iterator, so we use the `onEvent` callback + a Set of
 * listeners and refcount the shared handle down to zero on the last unsubscribe.
 */
class WatchHub {
  private handle: WatchHandle | undefined;
  private creating: Promise<WatchHandle> | undefined;
  private readonly listeners = new Set<(e: WatchEvent) => void>();

  async subscribe(fn: (e: WatchEvent) => void): Promise<void> {
    this.listeners.add(fn);
    if (this.handle) return;
    if (!this.creating) {
      this.creating = startWatch({
        onEvent: (e) => {
          for (const l of this.listeners) l(e);
        },
      });
    }
    try {
      this.handle = await this.creating;
    } catch (e) {
      // Reset so a transient watcher failure doesn't poison every future stream.
      this.creating = undefined;
      this.listeners.delete(fn);
      throw e;
    }
    this.creating = undefined;
    // The triggering subscriber may have disconnected during the await — if no
    // listeners remain, tear the freshly-created watcher down instead of leaking it.
    if (this.listeners.size === 0) {
      const h = this.handle;
      this.handle = undefined;
      await h.stop();
    }
  }

  async unsubscribe(fn: (e: WatchEvent) => void): Promise<void> {
    this.listeners.delete(fn);
    if (this.listeners.size === 0 && this.handle) {
      const h = this.handle;
      this.handle = undefined;
      await h.stop();
    }
  }
}

const watchHub = new WatchHub();

function watchStream(): Response {
  const enc = new TextEncoder();
  let listener: ((e: WatchEvent) => void) | undefined;
  let closed = false;

  return new Response(
    new ReadableStream({
      async start(controller) {
        listener = (e) => {
          if (closed) return;
          try {
            controller.enqueue(enc.encode(sseFrame(e)));
          } catch {
            /* stream already closed */
          }
        };
        try {
          await watchHub.subscribe(listener);
        } catch (e) {
          // subscribe() already removed the listener on failure; drop our handle
          // so cancel() won't double-unsubscribe.
          listener = undefined;
          controller.enqueue(enc.encode(sseFrame({ error: (e as Error).message })));
        }
      },
      async cancel() {
        closed = true;
        if (listener) await watchHub.unsubscribe(listener);
      },
    }),
    { headers: SSE_HEADERS },
  );
}

export const STREAMS: Record<string, StreamHandler> = {
  'GET /stream/doctor': () => doctorStream(),
  'GET /stream/watch': () => watchStream(),
};

/** Sorted "METHOD path" keys for the streaming routes. */
export function streamKeys(): string[] {
  return Object.keys(STREAMS).sort();
}
