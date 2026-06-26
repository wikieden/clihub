/**
 * Desktop-GUI proxy launch (v1.70 macOS · v1.71 Windows/Linux).
 *
 * The per-CLI proxy (`proxy/inject.ts`) writes HTTP(S)_PROXY into a CLI's
 * settings `env`. Desktop GUI apps don't read those files — they read their own
 * network stack. So instead of writing config, clihub LAUNCHES the GUI app with
 * the proxy applied for that run. The mechanism is OS-portable; only how we
 * resolve the executable + invoke it differs per platform:
 *
 *   - Electron apps (Claude / Kiro / Cursor) honor the chromium `--proxy-server`
 *     flag — passed via `open --args` on macOS, or directly on the spawn argv on
 *     Windows/Linux.
 *   - Native apps (Codex desktop) get HTTPS_PROXY/HTTP_PROXY/ALL_PROXY injected
 *     into the launched process env. Native apps often honor only the *system*
 *     proxy, so this is best-effort and flagged honestly (see `note`).
 *
 * Resolution never hard-codes a guessed absolute path:
 *   - macOS  → `mdfind` on the bundle id (LaunchServices is authoritative).
 *   - Windows→ `CLIHUB_<ID>_PATH` env override → known dirs (newest `app-*`
 *     glob) → `where.exe`.
 *   - Linux  → `CLIHUB_<ID>_PATH` env override → `which` on the PATH binary →
 *     known dirs.
 * Apps with no official desktop GUI on an OS (Claude/Linux, Codex/Linux,
 * Codex/Windows path unverified) carry no target for that OS and report
 * `installed: false` rather than pretending.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type GuiProxyMechanism = 'electron-flag' | 'env';

interface MacTarget {
  bundleId: string;
}
interface ExeTarget {
  /** executable / binary name (e.g. Cursor.exe, kiro) */
  exe: string;
  /** candidate install dirs; a `*` path segment globs to the newest match */
  dirs?: string[];
}

export interface GuiApp {
  /** stable clihub id */
  id: string;
  /** display name */
  name: string;
  /** how the proxy reaches the app's network stack (OS-independent) */
  mechanism: GuiProxyMechanism;
  /** honesty note shown in UIs when the mechanism/coverage is best-effort */
  note?: string;
  mac?: MacTarget;
  win?: ExeTarget;
  linux?: ExeTarget;
}

export interface GuiAppStatus extends GuiApp {
  installed: boolean;
  /** resolved app/exe path when installed (current OS) */
  path?: string;
  /** false when the app has no launch target for the current OS */
  osSupported: boolean;
}

export interface LaunchResult {
  id: string;
  launched: boolean;
  /** the command we ran (for transparency / dry-run) */
  command: string[];
  mechanism: GuiProxyMechanism;
  note?: string;
  /** populated when launched === false */
  error?: string;
}

const NATIVE_NOTE =
  'native app — honors the launch proxy env best-effort; may fall back to the system proxy';

/**
 * Known desktop GUI apps clihub can launch with a proxy. Per-OS targets reflect
 * where each app actually ships (verified against official sources; absent
 * targets = no official GUI on that OS).
 */
export const GUI_APPS: readonly GuiApp[] = [
  {
    id: 'claude-desktop',
    name: 'Claude',
    mechanism: 'electron-flag',
    mac: { bundleId: 'com.anthropic.claudefordesktop' },
    // Windows installs into a versioned dir; glob the newest app-*.
    win: { exe: 'claude.exe', dirs: ['%LOCALAPPDATA%\\AnthropicClaude\\app-*'] },
    // No official Claude desktop on Linux.
  },
  {
    // Codex.app embeds Chromium (custom, not Electron). Its launcher swallows
    // `open --args`, but a DIRECT binary exec forwards --proxy-server to the
    // Chromium network service (verified). Chromium ignores HTTP_PROXY env, so
    // the flag — via direct exec — is the only lever that works.
    id: 'codex-desktop',
    name: 'Codex',
    mechanism: 'electron-flag',
    // Honest: --proxy-server only covers Codex's embedded-Chromium traffic. Its
    // native core has its own network stack (managed proxy / direct) the flag
    // can't fully capture — for guaranteed coverage use a system proxy or TUN.
    note: 'best-effort: --proxy-server covers Codex’s Chromium traffic only; the native core may bypass it (use system proxy / TUN for full coverage). Quit Codex first.',
    mac: { bundleId: 'com.openai.codex' },
    // Codex desktop on Windows is an MSIX package with an unverified exe/path —
    // not wired rather than guessed. No Codex GUI on Linux (CLI only).
  },
  {
    // Kiro is a VS Code fork → Electron, honors --proxy-server.
    id: 'kiro-desktop',
    name: 'Kiro',
    mechanism: 'electron-flag',
    mac: { bundleId: 'dev.kiro.desktop' },
    win: { exe: 'Kiro.exe', dirs: ['%LOCALAPPDATA%\\Programs\\Kiro'] },
    linux: { exe: 'kiro', dirs: ['/usr/share/kiro', '/opt/kiro'] },
  },
  {
    // Cursor is an Electron (ToDesktop-wrapped) editor → --proxy-server.
    id: 'cursor-desktop',
    name: 'Cursor',
    mechanism: 'electron-flag',
    mac: { bundleId: 'com.todesktop.230313mzl4w4u92' },
    win: { exe: 'Cursor.exe', dirs: ['%LOCALAPPDATA%\\Programs\\cursor'] },
    linux: { exe: 'cursor', dirs: ['/opt/cursor', '/opt/Cursor', '~/Applications'] },
  },
  // Chromium browsers — no CLI, GUI-only. Same --proxy-server lever.
  {
    id: 'chrome',
    name: 'Chrome',
    mechanism: 'electron-flag',
    mac: { bundleId: 'com.google.Chrome' },
    win: {
      exe: 'chrome.exe',
      dirs: ['%PROGRAMFILES%\\Google\\Chrome\\Application', '%LOCALAPPDATA%\\Google\\Chrome\\Application'],
    },
    linux: { exe: 'google-chrome', dirs: ['/opt/google/chrome'] },
  },
  {
    id: 'edge',
    name: 'Edge',
    mechanism: 'electron-flag',
    mac: { bundleId: 'com.microsoft.edgemac' },
    win: { exe: 'msedge.exe', dirs: ['%PROGRAMFILES(x86)%\\Microsoft\\Edge\\Application', '%PROGRAMFILES%\\Microsoft\\Edge\\Application'] },
    linux: { exe: 'microsoft-edge', dirs: ['/opt/microsoft/msedge'] },
  },
  {
    id: 'brave',
    name: 'Brave',
    mechanism: 'electron-flag',
    mac: { bundleId: 'com.brave.Browser' },
    win: { exe: 'brave.exe', dirs: ['%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application', '%PROGRAMFILES%\\BraveSoftware\\Brave-Browser\\Application'] },
    linux: { exe: 'brave-browser', dirs: ['/opt/brave.com/brave'] },
  },
];

export function getGuiApp(id: string): GuiApp | undefined {
  return GUI_APPS.find((a) => a.id === id);
}

/** GUI launch is supported on the three desktop OSes. */
export function guiLaunchSupported(): boolean {
  return ['darwin', 'win32', 'linux'].includes(process.platform);
}

/** Per-app: does this app have a launch target for the current OS? */
export function osTargetFor(app: GuiApp): MacTarget | ExeTarget | undefined {
  if (process.platform === 'darwin') return app.mac;
  if (process.platform === 'win32') return app.win;
  if (process.platform === 'linux') return app.linux;
  return undefined;
}

/** `CLIHUB_<ID>_PATH` manual override, if it points at an existing path. */
function envOverridePath(app: GuiApp): string | undefined {
  const key = `CLIHUB_${app.id.toUpperCase().replace(/-/g, '_')}_PATH`;
  const v = process.env[key];
  return v && existsSync(v) ? v : undefined;
}

/** Expand %VAR% (win), $VAR, and a leading ~; then resolve a single `*` segment to the newest match. */
function expandAndGlob(dir: string): string | undefined {
  let p = dir
    .replace(/%([^%]+)%/g, (_, n) => process.env[n] ?? '')
    .replace(/\$\{?(\w+)\}?/g, (_, n) => process.env[n] ?? '');
  if (p.startsWith('~')) p = join(homedir(), p.slice(1));
  if (!p.includes('*')) return existsSync(p) ? p : undefined;
  // Resolve the first `*`-containing segment against its parent, newest first.
  const sep = process.platform === 'win32' ? '\\' : '/';
  const segs = p.split(/[\\/]/);
  const starIdx = segs.findIndex((s) => s.includes('*'));
  const parent = segs.slice(0, starIdx).join(sep) || sep;
  const rest = segs.slice(starIdx + 1);
  if (!existsSync(parent)) return undefined;
  const re = new RegExp('^' + segs[starIdx]!.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  let matches: string[];
  try {
    matches = readdirSync(parent).filter((n) => re.test(n));
  } catch {
    return undefined;
  }
  matches.sort((a, b) => {
    try {
      return statSync(join(parent, b)).mtimeMs - statSync(join(parent, a)).mtimeMs;
    } catch {
      return b.localeCompare(a);
    }
  });
  for (const m of matches) {
    const candidate = [parent, m, ...rest].join(sep);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Resolve the executable/app path for `app` on the current OS, or undefined. */
export function findGuiAppPath(app: GuiApp): string | undefined {
  const override = envOverridePath(app);
  if (override) return override;

  if (process.platform === 'darwin') {
    if (!app.mac) return undefined;
    const res = spawnSync('mdfind', [`kMDItemCFBundleIdentifier == '${app.mac.bundleId}'`], {
      encoding: 'utf8',
    });
    if (res.status !== 0 || !res.stdout) return undefined;
    return (
      res.stdout
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.endsWith('.app')) || undefined
    );
  }

  const target = (process.platform === 'win32' ? app.win : process.platform === 'linux' ? app.linux : undefined) as
    | ExeTarget
    | undefined;
  if (!target) return undefined;

  // Known install dirs first (resolves the real Electron exe, not a CLI shim).
  for (const dir of target.dirs ?? []) {
    const base = expandAndGlob(dir);
    if (base) {
      const exePath = join(base, target.exe);
      if (existsSync(exePath)) return exePath;
      if (existsSync(base) && base.toLowerCase().endsWith(target.exe.toLowerCase())) return base;
    }
  }
  // Fall back to PATH lookup (Linux `which`, Windows `where`).
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(finder, [target.exe], { encoding: 'utf8' });
  if (res.status === 0 && res.stdout) {
    const hit = res.stdout.split('\n').map((l) => l.trim()).find(Boolean);
    if (hit && existsSync(hit)) return hit;
  }
  return undefined;
}

export function listGuiApps(): GuiAppStatus[] {
  return GUI_APPS.map((app) => {
    const osSupported = Boolean(osTargetFor(app));
    const path = osSupported ? findGuiAppPath(app) : undefined;
    return { ...app, osSupported, installed: Boolean(path), path };
  });
}

/**
 * Resolve a macOS `.app`'s inner executable (Contents/MacOS/<CFBundleExecutable>).
 * Needed because `open --args` doesn't reliably forward chromium flags to custom
 * Chromium embeds (e.g. Codex) — a direct binary exec does.
 */
function macAppBinary(appPath: string): string | undefined {
  const macOsDir = join(appPath, 'Contents', 'MacOS');
  // CFBundleExecutable is authoritative; fall back to the sole file in MacOS/.
  const plist = spawnSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleExecutable', join(appPath, 'Contents', 'Info.plist')],
    { encoding: 'utf8' },
  );
  const exe = plist.status === 0 ? plist.stdout.trim() : undefined;
  if (exe) {
    const p = join(macOsDir, exe);
    if (existsSync(p)) return p;
  }
  try {
    const first = readdirSync(macOsDir).find((n) => !n.startsWith('.'));
    if (first) {
      const p = join(macOsDir, first);
      if (existsSync(p)) return p;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Build the macOS `open` argv (pure — used by launch + dry-run on darwin).
 * Requires a mac target.
 */
export function buildLaunchCommand(app: GuiApp, url: string): string[] {
  const bundleId = app.mac?.bundleId ?? app.id;
  // -n: new instance so the proxy applies even if the app is running.
  // -b: target by bundle id (more robust than -a path).
  const base = ['open', '-n', '-b', bundleId];
  if (app.mechanism === 'electron-flag') {
    return [...base, '--args', `--proxy-server=${url}`];
  }
  const env = ['--env', `HTTPS_PROXY=${url}`, '--env', `HTTP_PROXY=${url}`];
  if (url.toLowerCase().startsWith('socks')) env.push('--env', `ALL_PROXY=${url}`);
  return [...base, ...env];
}

/** Spawn argv + env for a direct (Windows/Linux) launch of an already-resolved exe. */
function buildSpawnPlan(
  app: GuiApp,
  exePath: string,
  url: string,
): { args: string[]; env: NodeJS.ProcessEnv; display: string[] } {
  if (app.mechanism === 'electron-flag') {
    // <-loopback> un-bypasses loopback so a 127.0.0.1 proxy isn't skipped.
    const flags = [`--proxy-server=${url}`, '--proxy-bypass-list=<-loopback>'];
    // Also inject the proxy env: --proxy-server covers the Chromium net stack,
    // but apps with a native/Node core (Codex) read HTTP(S)_PROXY instead. Pure
    // Electron apps just ignore the env, so this is a safe superset.
    const env: NodeJS.ProcessEnv = { ...process.env, HTTPS_PROXY: url, HTTP_PROXY: url };
    if (url.toLowerCase().startsWith('socks')) env.ALL_PROXY = url;
    return { args: flags, env, display: [`HTTPS_PROXY=${url}`, exePath, ...flags] };
  }
  const env: NodeJS.ProcessEnv = { ...process.env, HTTPS_PROXY: url, HTTP_PROXY: url };
  if (url.toLowerCase().startsWith('socks')) env.ALL_PROXY = url;
  const display = url.toLowerCase().startsWith('socks')
    ? [`HTTPS_PROXY=${url}`, `ALL_PROXY=${url}`, exePath]
    : [`HTTPS_PROXY=${url}`, exePath];
  return { args: [], env, display };
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
  if (!guiLaunchSupported()) return fail('gui launch needs macOS, Windows, or Linux');
  if (!osTargetFor(app)) return fail(`${app.name} has no desktop app on this OS`);

  if (process.platform === 'darwin') {
    const appPath = findGuiAppPath(app);

    // Electron / Chromium apps: DIRECT-exec the binary with --proxy-server.
    // `open --args` doesn't forward the flag to custom Chromium embeds (Codex),
    // but a direct exec reaches the Chromium network service (verified). This
    // matches the Windows/Linux path.
    if (app.mechanism === 'electron-flag') {
      const bin = appPath ? macAppBinary(appPath) : undefined;
      const plan = buildSpawnPlan(app, bin ?? `${app.name}`, url);
      if (opts.dryRun) return { id, launched: false, command: plan.display, mechanism: app.mechanism, note: app.note };
      if (!bin) return fail(`${app.name} not installed`);
      try {
        spawn(bin, plan.args, { detached: true, stdio: 'ignore', env: plan.env }).unref();
      } catch (e) {
        return fail(`failed to launch: ${e instanceof Error ? e.message : String(e)}`);
      }
      return { id, launched: true, command: plan.display, mechanism: app.mechanism, note: app.note };
    }

    // Native apps: env via `open --env` (Chromium-less; honors process env).
    const command = buildLaunchCommand(app, url);
    if (opts.dryRun) return { id, launched: false, command, mechanism: app.mechanism, note: app.note };
    if (!appPath) return fail(`${app.name} not installed`);
    const [, ...args] = command;
    const res = spawnSync('open', args, { encoding: 'utf8' });
    if (res.status !== 0) {
      return fail(`open exited ${res.status}: ${(res.stderr || '').trim() || 'unknown error'}`);
    }
    return { id, launched: true, command, mechanism: app.mechanism, note: app.note };
  }

  // Windows / Linux: resolve the exe, then spawn it detached.
  const exePath = findGuiAppPath(app);
  if (!exePath) {
    const key = `CLIHUB_${app.id.toUpperCase().replace(/-/g, '_')}_PATH`;
    return fail(`${app.name} not found — set ${key}=<path to executable> to point clihub at it`);
  }
  const plan = buildSpawnPlan(app, exePath, url);
  if (opts.dryRun) {
    return { id, launched: false, command: plan.display, mechanism: app.mechanism, note: app.note };
  }
  try {
    const child = spawn(exePath, plan.args, { detached: true, stdio: 'ignore', env: plan.env });
    child.unref();
  } catch (e) {
    return fail(`failed to launch: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { id, launched: true, command: plan.display, mechanism: app.mechanism, note: app.note };
}
