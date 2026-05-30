/**
 * GitHub star nudge (v1.26.0) — interactive shell for the core nudge state.
 *
 * Occasionally (TTY only) asks the user to star clihub on GitHub. Enter
 * opens the repo in a browser; Esc / No just continues. Capped + remembers
 * via `~/.clihub/nudge.json` so it never pesters.
 */
import { spawn } from 'node:child_process';

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => { /* no browser — ignore */ });
    child.unref();
  } catch { /* ignore */ }
}

export async function maybeStarNudge(): Promise<void> {
  if (!process.stdout.isTTY || process.env.CI || process.env.CLIHUB_NO_NUDGE) return;
  const core = await import('@clihub/core');
  let state;
  try { state = await core.readNudge(); } catch { return; }
  if (!core.shouldNudgeStar(state, Math.random())) return;

  const p = await import('@clack/prompts');
  const yes = await p.confirm({
    message: '⭐ Enjoying clihub? Star it on GitHub  (Enter = open, Esc = skip)',
    initialValue: true,
  });
  if (p.isCancel(yes) || !yes) {
    await core.markNudged('dismissed').catch(() => {});
    return;
  }
  openBrowser(core.CLIHUB_REPO_URL);
  await core.markNudged('opened').catch(() => {});
}
