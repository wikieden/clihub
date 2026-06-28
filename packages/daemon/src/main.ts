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
import { ensureGlobalClihubYaml } from '@clihub/core';

const port = Number(process.env.CLIHUB_DAEMON_PORT ?? 0) || 0;
const token = process.env.CLIHUB_DAEMON_TOKEN || undefined;

const daemon = createDaemon({ port, token });

// Single-line handshake — the ONLY thing written to stdout before logs.
process.stdout.write(
  `${JSON.stringify({ clihub_daemon: { url: daemon.url, port: daemon.port, token: daemon.token } })}\n`,
);

// First-launch default: ensure ~/.config/clihub/clihub.yaml exists so the GUI
// always resolves a config (the daemon's cwd is wherever Finder launched the
// app, almost never a project). Best-effort — never blocks the handshake.
ensureGlobalClihubYaml().catch(() => {});

const shutdown = () => {
  daemon.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Orphan guard. The Tauri supervisor reaps us via kill_daemon on a clean exit,
// but a crash / force-quit / SIGKILL skips that — leaving a stale daemon that
// bricks the NEXT launch (it holds the sidecar binary open while Tauri's
// resource-recopy overwrites it, corrupting the new copy). When our parent dies
// we get reparented to init (pid 1), so poll ppid and self-exit on orphan.
const parentPid = process.ppid;
if (parentPid > 1) {
  setInterval(() => {
    if (process.ppid !== parentPid) shutdown();
  }, 2000).unref();
}
