import { describe, expect, it } from 'bun:test';
import { GUI_APPS, getGuiApp, buildLaunchCommand, launchGuiAppWithProxy } from '../src/gui/index.js';

describe('gui registry', () => {
  it('knows claude/kiro/cursor (electron) + codex (native)', () => {
    expect(getGuiApp('claude-desktop')?.mechanism).toBe('electron-flag');
    expect(getGuiApp('kiro-desktop')?.mechanism).toBe('electron-flag');
    expect(getGuiApp('cursor-desktop')?.mechanism).toBe('electron-flag');
    expect(getGuiApp('codex-desktop')?.mechanism).toBe('env');
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

describe('buildLaunchCommand', () => {
  it('electron apps get the chromium --proxy-server flag via --args', () => {
    const cmd = buildLaunchCommand(getGuiApp('claude-desktop')!, 'http://127.0.0.1:7897');
    expect(cmd).toEqual([
      'open',
      '-n',
      '-b',
      'com.anthropic.claudefordesktop',
      '--args',
      '--proxy-server=http://127.0.0.1:7897',
    ]);
  });

  it('native apps get HTTPS_PROXY/HTTP_PROXY via --env', () => {
    const cmd = buildLaunchCommand(getGuiApp('codex-desktop')!, 'http://127.0.0.1:7897');
    expect(cmd).toContain('--env');
    expect(cmd).toContain('HTTPS_PROXY=http://127.0.0.1:7897');
    expect(cmd).toContain('HTTP_PROXY=http://127.0.0.1:7897');
    expect(cmd).not.toContain('ALL_PROXY=http://127.0.0.1:7897');
  });

  it('socks url also sets ALL_PROXY on native apps', () => {
    const cmd = buildLaunchCommand(getGuiApp('codex-desktop')!, 'socks5://127.0.0.1:1080');
    expect(cmd).toContain('ALL_PROXY=socks5://127.0.0.1:1080');
  });
});

describe('launchGuiAppWithProxy', () => {
  it('rejects unknown apps without spawning', () => {
    const r = launchGuiAppWithProxy('nope', 'http://127.0.0.1:7897', { dryRun: true });
    expect(r.launched).toBe(false);
    expect(r.error).toMatch(/unknown gui app/);
  });

  it('dryRun returns the command without launching', () => {
    const r = launchGuiAppWithProxy('claude-desktop', 'http://127.0.0.1:7897', { dryRun: true });
    expect(r.launched).toBe(false);
    expect(r.command[0]).toBe('open');
    expect(r.command).toContain('--proxy-server=http://127.0.0.1:7897');
  });
});
