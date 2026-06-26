import { describe, expect, it } from 'bun:test';
import { GUI_APPS, getGuiApp, buildLaunchCommand, launchGuiAppWithProxy } from './index.js';

describe('gui registry', () => {
  it('knows claude (electron) + codex (native)', () => {
    expect(getGuiApp('claude-desktop')?.mechanism).toBe('electron-flag');
    expect(getGuiApp('codex-desktop')?.mechanism).toBe('env');
    expect(getGuiApp('nope')).toBeUndefined();
  });

  it('every app has a unique id + bundle id', () => {
    const ids = GUI_APPS.map((a) => a.id);
    const bundles = GUI_APPS.map((a) => a.bundleId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(bundles).size).toBe(bundles.length);
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
