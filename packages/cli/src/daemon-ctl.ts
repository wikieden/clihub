/**
 * Loopback-daemon lifecycle (shared by the `clihub daemon` command and the TUI).
 *
 * The daemon is Bun.serve-based, so it must be spawned under a bun runtime —
 * resolved the same way the desktop shell does. State lives in
 * ~/.clihub/daemon.json ({url, port, token, pid, startedAt}, chmod 0600);
 * clients (GUI dev servers, HTTP tools) read the bearer from there.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';

export interface DaemonState {
  url: string;
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

export function daemonStatePath(): string {
  return path.join(os.homedir(), '.clihub', 'daemon.json');
}

export async function readDaemonState(): Promise<DaemonState | undefined> {
  try {
    return JSON.parse(await fs.readFile(daemonStatePath(), 'utf8')) as DaemonState;
  } catch {
    return undefined;
  }
}

export async function probeDaemon(state: DaemonState): Promise<{ ok: boolean; version?: string }> {
  try {
    const res = await fetch(`${state.url}/healthz`, {
      headers: { authorization: `Bearer ${state.token}` },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { version?: string };
    return { ok: true, version: body.version };
  } catch {
    return { ok: false };
  }
}

/** The daemon needs a bun runtime — resolved like the desktop shell does. */
export async function findBun(): Promise<string | undefined> {
  const candidates = [
    process.env.CLIHUB_BUN_PATH,
    path.join(os.homedir(), '.bun', 'bin', 'bun'),
    path.join(os.homedir(), '.local', 'bin', 'bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    if (await fs.access(c).then(() => true, () => false)) return c;
  }
  // PATH lookup last — covers shells where bun is installed elsewhere.
  return new Promise((resolve) => {
    execFile(process.platform === 'win32' ? 'where' : 'which', ['bun'], (e, out) => {
      resolve(e ? undefined : out.split('\n')[0]?.trim() || undefined);
    });
  });
}

/** dist/daemon.js ships next to dist/cli.js; monorepo dev falls back to the source entry. */
export async function findDaemonEntry(): Promise<string | undefined> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, 'daemon.js'),
    path.join(here, '..', 'dist', 'daemon.js'),
    path.join(here, '..', '..', 'daemon', 'src', 'main.ts'),
  ];
  for (const c of candidates) {
    if (await fs.access(c).then(() => true, () => false)) return c;
  }
  return undefined;
}

export type StartDaemonResult =
  | { kind: 'already-running'; state: DaemonState }
  | { kind: 'started'; state: DaemonState };

/**
 * Start the daemon (idempotent: a live one short-circuits). Throws with an
 * actionable message when bun or the bundled entry is missing, or when no
 * handshake arrives within 10s.
 */
export async function startDaemon(opts: { port?: string | number } = {}): Promise<StartDaemonResult> {
  const existing = await readDaemonState();
  if (existing && (await probeDaemon(existing)).ok) {
    return { kind: 'already-running', state: existing };
  }

  const bun = await findBun();
  if (!bun) {
    throw new Error('bun runtime not found — the daemon needs bun (https://bun.sh). Set CLIHUB_BUN_PATH to override.');
  }
  const entry = await findDaemonEntry();
  if (!entry) {
    throw new Error('daemon entry not found (dist/daemon.js) — reinstall clihub or build the monorepo');
  }

  const child = spawn(bun, [entry], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, ...(opts.port ? { CLIHUB_DAEMON_PORT: String(opts.port) } : {}) },
  });

  // The daemon prints a single-line JSON handshake on stdout; everything else is logs.
  const handshake = await new Promise<{ url: string; port: number; token: string } | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), 10_000);
    let buf = '';
    child.stdout!.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      clearTimeout(timer);
      try {
        resolve((JSON.parse(buf.slice(0, nl)) as { clihub_daemon: { url: string; port: number; token: string } }).clihub_daemon);
      } catch {
        resolve(undefined);
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
  if (!handshake) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    throw new Error('daemon failed to start (no handshake within 10s)');
  }

  const state: DaemonState = { ...handshake, pid: child.pid!, startedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(daemonStatePath()), { recursive: true });
  await fs.writeFile(daemonStatePath(), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  child.stdout!.destroy();
  child.unref();
  return { kind: 'started', state };
}

export type StopDaemonResult =
  | { kind: 'not-running' }
  | { kind: 'stopped'; pid: number }
  | { kind: 'stale-cleaned'; pid: number };

/** SIGTERM the recorded pid and remove the state file. Tolerates a dead pid. */
export async function stopDaemon(): Promise<StopDaemonResult> {
  const state = await readDaemonState();
  if (!state) return { kind: 'not-running' };
  let alive = true;
  try {
    process.kill(state.pid, 'SIGTERM');
  } catch {
    alive = false;
  }
  await fs.rm(daemonStatePath(), { force: true });
  return alive ? { kind: 'stopped', pid: state.pid } : { kind: 'stale-cleaned', pid: state.pid };
}
