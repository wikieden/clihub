/**
 * Desktop-GUI proxy launch (v1.70).
 *
 * The per-CLI proxy (`proxy/inject.ts`) writes HTTP(S)_PROXY into a CLI's
 * settings `env`. Desktop GUI apps don't read those files — they read their
 * own network stack. So instead of writing config, clihub LAUNCHES the GUI app
 * with the proxy applied for that run:
 *
 *   - Electron apps (Claude desktop) honor the chromium `--proxy-server` flag,
 *     passed via `open --args`.
 *   - Native apps (Codex desktop) get HTTPS_PROXY/HTTP_PROXY/ALL_PROXY injected
 *     via `open --env`. macOS native apps often honor only the *system* proxy,
 *     so this is best-effort and flagged honestly (see `note`).
 *
 * macOS only for now (`open` + LaunchServices). Other platforms return a clear
 * `unsupported` instead of pretending.
 */
import { spawnSync } from 'node:child_process';

export type GuiProxyMechanism = 'electron-flag' | 'env';

export interface GuiApp {
  /** stable clihub id */
  id: string;
  /** display name */
  name: string;
  /** macOS bundle identifier (used for LaunchServices + mdfind detection) */
  bundleId: string;
  /** how the proxy reaches the app's network stack */
  mechanism: GuiProxyMechanism;
  /** honesty note shown in UIs when the mechanism is best-effort */
  note?: string;
}

export interface GuiAppStatus extends GuiApp {
  installed: boolean;
  /** resolved .app path when installed (macOS) */
  path?: string;
}

export interface LaunchResult {
  id: string;
  launched: boolean;
  /** the argv we handed to `open` (for transparency / dry-run) */
  command: string[];
  mechanism: GuiProxyMechanism;
  note?: string;
  /** populated when launched === false */
  error?: string;
}

/**
 * Known desktop GUI apps clihub can launch with a proxy. Electron apps take the
 * chromium flag; native apps get env (best-effort).
 */
export const GUI_APPS: readonly GuiApp[] = [
  {
    id: 'claude-desktop',
    name: 'Claude',
    bundleId: 'com.anthropic.claudefordesktop',
    mechanism: 'electron-flag',
  },
  {
    id: 'codex-desktop',
    name: 'Codex',
    bundleId: 'com.openai.codex',
    mechanism: 'env',
    note: 'native app — honors the launch proxy env best-effort; may fall back to the system proxy',
  },
  {
    // Kiro is a VS Code fork → Electron, so it honors --proxy-server.
    id: 'kiro-desktop',
    name: 'Kiro',
    bundleId: 'dev.kiro.desktop',
    mechanism: 'electron-flag',
  },
  {
    // Cursor is an Electron (ToDesktop-wrapped) editor → --proxy-server.
    id: 'cursor-desktop',
    name: 'Cursor',
    bundleId: 'com.todesktop.230313mzl4w4u92',
    mechanism: 'electron-flag',
  },
];

export function getGuiApp(id: string): GuiApp | undefined {
  return GUI_APPS.find((a) => a.id === id);
}

/** True only on macOS, where `open` + bundle launching exists. */
export function guiLaunchSupported(): boolean {
  return process.platform === 'darwin';
}

/** Resolve an installed app's path via LaunchServices (mdfind on bundle id). macOS only. */
export function findGuiAppPath(bundleId: string): string | undefined {
  if (!guiLaunchSupported()) return undefined;
  const res = spawnSync('mdfind', [`kMDItemCFBundleIdentifier == '${bundleId}'`], {
    encoding: 'utf8',
  });
  if (res.status !== 0 || !res.stdout) return undefined;
  // Prefer a real .app bundle; mdfind can return helper bundles too.
  const hit = res.stdout
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.endsWith('.app'));
  return hit || undefined;
}

export function listGuiApps(): GuiAppStatus[] {
  return GUI_APPS.map((app) => {
    const path = findGuiAppPath(app.bundleId);
    return { ...app, installed: Boolean(path), path };
  });
}

/** Build the `open` argv for launching `app` with `url` (no side effects — used by launch + dry-run). */
export function buildLaunchCommand(app: GuiApp, url: string): string[] {
  // -n: new instance so the proxy actually applies even if the app is running.
  // -b: target by bundle id (more robust than -a path).
  const base = ['open', '-n', '-b', app.bundleId];
  if (app.mechanism === 'electron-flag') {
    // chromium reads --proxy-server from argv.
    return [...base, '--args', `--proxy-server=${url}`];
  }
  // env mechanism: inject the proxy vars into the launched process.
  const env = [
    '--env',
    `HTTPS_PROXY=${url}`,
    '--env',
    `HTTP_PROXY=${url}`,
  ];
  if (url.toLowerCase().startsWith('socks')) env.push('--env', `ALL_PROXY=${url}`);
  return [...base, ...env];
}

/**
 * Launch a GUI app with the proxy applied. `dryRun` returns the command without
 * spawning. Throws nothing — failures come back on the result.
 */
export function launchGuiAppWithProxy(
  id: string,
  url: string,
  opts: { dryRun?: boolean } = {},
): LaunchResult {
  const app = getGuiApp(id);
  if (!app) return { id, launched: false, command: [], mechanism: 'env', error: `unknown gui app: ${id}` };

  const fail = (error: string): LaunchResult => ({
    id,
    launched: false,
    command: [],
    mechanism: app.mechanism,
    note: app.note,
    error,
  });

  if (!url) return fail('no proxy url given');

  // dryRun is a transparency/debug affordance — it just shows the command, so
  // it's resolved before the platform + install gates (works off-macOS too).
  const command = buildLaunchCommand(app, url);
  if (opts.dryRun) {
    return { id, launched: false, command, mechanism: app.mechanism, note: app.note };
  }

  if (!guiLaunchSupported()) return fail('gui launch is macOS-only for now');
  const path = findGuiAppPath(app.bundleId);
  if (!path) return fail(`${app.name} not installed (bundle ${app.bundleId} not found)`);

  const [, ...args] = command;
  const res = spawnSync('open', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    return fail(`open exited ${res.status}: ${(res.stderr || '').trim() || 'unknown error'}`);
  }
  return { id, launched: true, command, mechanism: app.mechanism, note: app.note };
}
