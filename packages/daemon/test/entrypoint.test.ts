import { describe, expect, test } from 'bun:test';
import path from 'node:path';

const ENTRY = path.resolve(import.meta.dir, '../src/main.ts');

/** Read stdout until the first newline-terminated line, or throw on EOF. */
async function readFirstLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('process ended before printing a handshake line');
      buf += decoder.decode(value, { stream: true });
      const nl = buf.indexOf('\n');
      if (nl >= 0) return buf.slice(0, nl);
    }
  } finally {
    reader.releaseLock();
  }
}

describe('daemon entrypoint', () => {
  test('prints a handshake and serves /healthz with the env token', async () => {
    const token = 'b'.repeat(64);
    const proc = Bun.spawn(['bun', 'run', ENTRY], {
      env: { ...process.env, CLIHUB_DAEMON_PORT: '0', CLIHUB_DAEMON_TOKEN: token },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    try {
      const line = await readFirstLine(proc.stdout);
      const handshake = JSON.parse(line) as { clihub_daemon: { url: string; port: number; token: string } };

      expect(handshake.clihub_daemon.token).toBe(token);
      expect(handshake.clihub_daemon.port).toBeGreaterThan(0);
      expect(handshake.clihub_daemon.url).toBe(`http://127.0.0.1:${handshake.clihub_daemon.port}`);

      const ok = await fetch(`${handshake.clihub_daemon.url}/healthz`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(ok.status).toBe(200);

      const denied = await fetch(`${handshake.clihub_daemon.url}/healthz`);
      expect(denied.status).toBe(401);
    } finally {
      proc.kill();
      await proc.exited;
    }
  }, 20000);
});
