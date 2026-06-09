#!/usr/bin/env bun
/**
 * @clihub/daemon entrypoint — the process the desktop shell (Tauri supervisor)
 * spawns. Boots the loopback sidecar, then prints a single-line JSON handshake
 *
 *   {"clihub_daemon":{"url":"http://127.0.0.1:<port>","port":<port>,"token":"<hex>"}}
 *
 * on stdout so the supervisor learns where to connect and the bearer to use.
 * Stays alive until SIGINT/SIGTERM. Env overrides:
 *   CLIHUB_DAEMON_PORT  — bind port (default 0 = OS-assigned ephemeral)
 *   CLIHUB_DAEMON_TOKEN — bearer token (default: a fresh 256-bit hex)
 */
import { createDaemon } from './index.js';

const port = Number(process.env.CLIHUB_DAEMON_PORT ?? 0) || 0;
const token = process.env.CLIHUB_DAEMON_TOKEN || undefined;

const daemon = createDaemon({ port, token });

// Single-line handshake — the ONLY thing written to stdout before logs.
process.stdout.write(
  `${JSON.stringify({ clihub_daemon: { url: daemon.url, port: daemon.port, token: daemon.token } })}\n`,
);

const shutdown = () => {
  daemon.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
