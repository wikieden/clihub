/**
 * Cross-platform `which` — find an executable on PATH.
 *
 * macOS / Linux ship `which`; Windows ships `where` (note CRLF line
 * breaks in its output). Some minimal shells (Alpine without coreutils,
 * BusyBox) lack `which` entirely.
 *
 * Strategy:
 *   1. Try the OS-native command (`which` / `where`) for speed.
 *   2. Fall back to scanning `PATH` ourselves so we keep working in
 *      busybox / restricted environments.
 *
 * Returns the absolute path to the first match, or `undefined` if
 * nothing matches.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const IS_WIN = process.platform === 'win32';
const WIN_EXTS = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
  .split(';')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function whichCmd(name: string): Promise<string | undefined> {
  const viaShell = await viaShellLookup(name);
  if (viaShell) return viaShell;
  return manualScan(name);
}

async function viaShellLookup(name: string): Promise<string | undefined> {
  try {
    const cmd = IS_WIN ? 'where' : 'which';
    const { stdout } = await execFileP(cmd, [name]);
    const first = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return first;
  } catch {
    return undefined;
  }
}

async function manualScan(name: string): Promise<string | undefined> {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    if (IS_WIN) {
      for (const ext of WIN_EXTS) {
        const candidate = path.join(dir, name + ext);
        if (await fileExecutable(candidate)) return candidate;
      }
      // also allow exact name (e.g. someone added a unix-style script)
      const exact = path.join(dir, name);
      if (await fileExecutable(exact)) return exact;
    } else {
      const candidate = path.join(dir, name);
      if (await fileExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

async function fileExecutable(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    if (!stat.isFile()) return false;
    // On Windows fs.access X_OK is a no-op; rely on PATHEXT match above.
    if (IS_WIN) return true;
    await fs.access(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
