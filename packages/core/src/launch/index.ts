/**
 * Unified launcher (v1.72) — one place that knows, per client, which launch
 * methods exist and how to fire them:
 *
 *   - GUI desktop app → `launchGuiAppWithProxy` (see ../gui): chromium
 *     --proxy-server for Electron, env for native.
 *   - CLI in a terminal → `launchCliInTerminal`: opens the OS terminal running
 *     the resolved CLI binary (from the provider's own `detect()`), with the
 *     proxy injected as HTTPS_PROXY/HTTP_PROXY for that session.
 *
 * "Different clients support different launch methods": Claude/Codex/Kiro/Cursor
 * have both a desktop app and a CLI; Gemini/Qwen/Goose/OpenCode are CLI-only.
 * `listLaunchTargets()` returns exactly the methods each installed client has so
 * a launcher UI can render only the real buttons.
 */
import { spawn, spawnSync } from 'node:child_process';
import { getProvider, listProviders } from '../tools/registry.js';
import {
  GUI_APPS,
  getGuiApp,
  launchGuiAppWithProxy,
  listGuiApps,
  type GuiProxyMechanism,
  type LaunchResult,
} from '../gui/index.js';

/** Maps a GUI app id → the CLI provider id for the same client. */
const GUI_TO_PROVIDER: Record<string, string> = {
  'claude-desktop': 'claude-code',
  'codex-desktop': 'codex',
  'kiro-desktop': 'kiro-cli',
  'cursor-desktop': 'cursor',
};

export interface CliLaunchInfo {
  toolId: string;
  installed: boolean;
  binPath?: string;
}
export interface GuiLaunchInfo {
  id: string;
  installed: boolean;
  osSupported: boolean;
  mechanism: GuiProxyMechanism;
  note?: string;
}
export interface LaunchTarget {
  /** client id (== CLI provider id) */
  id: string;
  name: string;
  gui: GuiLaunchInfo | null;
  cli: CliLaunchInfo | null;
}

/** Per-client matrix of available launch methods (CLI installs probed live). */
export async function listLaunchTargets(): Promise<LaunchTarget[]> {
  const guiByProvider = new Map<string, ReturnType<typeof listGuiApps>[number]>();
  for (const g of listGuiApps()) {
    const provId = GUI_TO_PROVIDER[g.id];
    if (provId) guiByProvider.set(provId, g);
  }
  const providerTargets = await Promise.all(
    listProviders().map(async (p) => {
      const det = await p.detect().catch(() => ({ installed: false }) as Awaited<ReturnType<typeof p.detect>>);
      const g = guiByProvider.get(p.id);
      return {
        id: p.id,
        name: p.name,
        gui: g
          ? { id: g.id, installed: g.installed, osSupported: g.osSupported, mechanism: g.mechanism, note: g.note }
          : null,
        cli: { toolId: p.id, installed: Boolean(det.installed), binPath: det.path },
      } satisfies LaunchTarget;
    }),
  );

  // GUI-only apps with no CLI provider (Chromium browsers) — App launch only.
  const browserTargets = listGuiApps()
    .filter((g) => !GUI_TO_PROVIDER[g.id])
    .map(
      (g) =>
        ({
          id: g.id,
          name: g.name,
          gui: { id: g.id, installed: g.installed, osSupported: g.osSupported, mechanism: g.mechanism, note: g.note },
          cli: null,
        }) satisfies LaunchTarget,
    );

  return [...providerTargets, ...browserTargets];
}

/** Re-exported so callers need one import for both launch kinds. */
export { launchGuiAppWithProxy, getGuiApp, GUI_APPS };

/**
 * Open the OS terminal running a client's CLI, with the proxy injected as env
 * for that session. `dryRun` returns the command without spawning.
 */
export async function launchCliInTerminal(
  toolId: string,
  opts: { proxy?: string; dryRun?: boolean } = {},
): Promise<LaunchResult> {
  const provider = getProvider(toolId);
  const base = (error: string): LaunchResult => ({
    id: toolId,
    launched: false,
    command: [],
    mechanism: 'env',
    error,
  });
  if (!provider) return base(`unknown tool: ${toolId}`);

  const det = await provider.detect().catch(() => ({ installed: false }) as Awaited<ReturnType<typeof provider.detect>>);
  if (!det.installed || !det.path) return base(`${provider.name} CLI not installed`);
  const bin = det.path;
  const proxy = opts.proxy?.trim() || undefined;

  if (process.platform === 'darwin') {
    // Terminal.app is already running with its own env, so inline the proxy.
    const inline = (proxy ? `HTTPS_PROXY=${proxy} HTTP_PROXY=${proxy} ` : '') + bin;
    const command = ['osascript', '-e', `tell application "Terminal" to do script ${JSON.stringify(inline)}`];
    if (opts.dryRun) return { id: toolId, launched: true, command, mechanism: 'env' };
    const res = spawnSync(command[0]!, [...command.slice(1), '-e', 'tell application "Terminal" to activate'], {
      encoding: 'utf8',
    });
    if (res.status !== 0) return base(`osascript exited ${res.status}: ${(res.stderr || '').trim()}`);
    return { id: toolId, launched: true, command, mechanism: 'env' };
  }

  // Windows / Linux: spawn the terminal with the proxy in the child env so the
  // CLI inherits it.
  const env = proxy ? { ...process.env, HTTPS_PROXY: proxy, HTTP_PROXY: proxy } : process.env;

  // The proxy rides in the child env (not argv); surface it as a leading token
  // in the display command so a dry run is honest + greppable about it.
  const proxyPrefix = proxy ? [`HTTPS_PROXY=${proxy}`] : [];

  if (process.platform === 'win32') {
    // `start "" cmd /k <bin>` opens a new console running the CLI.
    const spawnArgs = ['/c', 'start', 'clihub', 'cmd', '/k', bin];
    const command = [...proxyPrefix, 'cmd', ...spawnArgs];
    if (opts.dryRun) return { id: toolId, launched: true, command, mechanism: 'env' };
    try {
      spawn('cmd', spawnArgs, { detached: true, stdio: 'ignore', env }).unref();
    } catch (e) {
      return base(`failed to launch terminal: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { id: toolId, launched: true, command, mechanism: 'env' };
  }

  // Linux: try the common terminal emulators in order. A dry run shouldn't need
  // one present — fall back to the canonical name so the command is still
  // inspectable on headless boxes (e.g. CI).
  const term = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm'].find(
    (t) => spawnSync('which', [t]).status === 0,
  );
  const termName = term ?? 'x-terminal-emulator';
  const args = termName === 'gnome-terminal' ? ['--', bin] : ['-e', bin];
  const command = [...proxyPrefix, termName, ...args];
  if (opts.dryRun) return { id: toolId, launched: true, command, mechanism: 'env' };
  if (!term) return base('no terminal emulator found (install x-terminal-emulator / gnome-terminal)');
  try {
    spawn(term, args, { detached: true, stdio: 'ignore', env }).unref();
  } catch (e) {
    return base(`failed to launch terminal: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { id: toolId, launched: true, command, mechanism: 'env' };
}
