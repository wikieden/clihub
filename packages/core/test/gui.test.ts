import { describe, expect, it } from 'bun:test';
import { GUI_APPS, getGuiApp, launchGuiAppWithProxy } from '../src/gui/index.js';

describe('gui registry', () => {
  it('all four desktop apps use the chromium --proxy-server flag', () => {
    // Codex.app is a custom Chromium embed → flag via DIRECT exec, not env.
    for (const id of ['claude-desktop', 'kiro-desktop', 'cursor-desktop', 'codex-desktop']) {
      expect(getGuiApp(id)?.mechanism).toBe('electron-flag');
    }
    expect(getGuiApp('nope')).toBeUndefined();
  });

  it('every app has a unique id + a mac bundle id', () => {
    const ids = GUI_APPS.map((a) => a.id);
    const bundles = GUI_APPS.map((a) => a.mac?.bundleId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(bundles).size).toBe(bundles.length);
  });

  it('per-OS targets match what each app actually ships', () => {
    // Claude: Windows yes, Linux no (no official Linux desktop).
    expect(getGuiApp('claude-desktop')?.win?.exe).toBe('claude.exe');
    expect(getGuiApp('claude-desktop')?.linux).toBeUndefined();
    // Codex: mac only — Windows MSIX path unverified, no Linux GUI.
    expect(getGuiApp('codex-desktop')?.win).toBeUndefined();
    expect(getGuiApp('codex-desktop')?.linux).toBeUndefined();
    // Kiro + Cursor: Windows + Linux.
    expect(getGuiApp('kiro-desktop')?.win?.exe).toBe('Kiro.exe');
    expect(getGuiApp('kiro-desktop')?.linux?.exe).toBe('kiro');
    expect(getGuiApp('cursor-desktop')?.win?.exe).toBe('Cursor.exe');
    expect(getGuiApp('cursor-desktop')?.linux?.exe).toBe('cursor');
  });
});

describe('launchGuiAppWithProxy', () => {
  it('rejects unknown apps without spawning', () => {
    const r = launchGuiAppWithProxy('nope', 'http://127.0.0.1:7897', { dryRun: true });
    expect(r.launched).toBe(false);
    expect(r.error).toMatch(/unknown gui app/);
  });

  it('electron apps direct-exec with --proxy-server + loopback bypass (not `open`)', () => {
    // kiro-desktop has a target on macOS/Windows/Linux so this runs on any CI OS.
    const r = launchGuiAppWithProxy('kiro-desktop', 'http://127.0.0.1:7897', { dryRun: true });
    expect(r.command).toContain('--proxy-server=http://127.0.0.1:7897');
    expect(r.command).toContain('--proxy-bypass-list=<-loopback>');
    // The fix: launch the binary directly, NOT via `open --args` (which Codex's
    // custom Chromium embed ignores).
    expect(r.command[0]).not.toBe('open');
    expect(r.command).not.toContain('--args');
  });
});
