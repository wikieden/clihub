import { describe, expect, it } from 'bun:test';
import { listLaunchTargets, launchCliInTerminal } from '../src/launch/index.js';

describe('listLaunchTargets', () => {
  it('returns every provider with the right launch methods', async () => {
    const t = await listLaunchTargets();
    const byId = Object.fromEntries(t.map((x) => [x.id, x]));
    // Claude/Codex/Kiro/Cursor have both a desktop app and a CLI.
    expect(byId['claude-code']?.gui?.id).toBe('claude-desktop');
    expect(byId['claude-code']?.cli?.toolId).toBe('claude-code');
    expect(byId['cursor']?.gui?.id).toBe('cursor-desktop');
    // CLI-only clients have no gui target.
    expect(byId['gemini-cli']?.gui).toBeNull();
    expect(byId['goose']?.gui).toBeNull();
    expect(byId['opencode']?.gui).toBeNull();
    // every target carries a cli descriptor
    for (const x of t) expect(x.cli?.toolId).toBe(x.id);
  });
});

describe('launchCliInTerminal', () => {
  it('rejects an unknown tool', async () => {
    const r = await launchCliInTerminal('nope', { dryRun: true });
    expect(r.launched).toBe(false);
    expect(r.error).toMatch(/unknown tool/);
  });

  it('builds a terminal command for an installed CLI (dry run)', async () => {
    const targets = await listLaunchTargets();
    const installed = targets.find((t) => t.cli?.installed);
    if (!installed) return; // no CLI installed in this env — skip
    const r = await launchCliInTerminal(installed.id, { proxy: 'http://127.0.0.1:7897', dryRun: true });
    expect(r.launched).toBe(true);
    expect(r.command.length).toBeGreaterThan(0);
    // proxy must appear somewhere in the launch command/env plan
    expect(r.command.join(' ')).toContain('127.0.0.1:7897');
  });
});
