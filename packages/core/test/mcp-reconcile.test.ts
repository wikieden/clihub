import { test, expect } from 'bun:test';
import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { reconcileMcpPlan } from '../src/index.js';

test('reconcileMcpPlan flags a server present in one CLI but absent in others', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'clihub-recon-'));
  // Claude Code reads ~/.claude.json mcpServers.
  await fs.writeFile(
    path.join(home, '.claude.json'),
    JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', 'gh-mcp'] } } }),
    'utf8',
  );
  const plan = await reconcileMcpPlan({ home, all: true });
  const gh = plan.items.find((i) => i.id === 'github')!;
  expect(gh).toBeTruthy();
  expect(gh.presentIn).toContain('claude-code');
  expect(gh.state).toBe('drift');
  expect(gh.absentIn.length).toBeGreaterThan(0); // other mcp-capable CLIs lack it
  expect(plan.driftCount).toBeGreaterThanOrEqual(1);
});

test('reconcileMcpPlan reports no items for an empty machine', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'clihub-recon-empty-'));
  const plan = await reconcileMcpPlan({ home, all: true });
  expect(plan.items).toHaveLength(0);
  expect(plan.driftCount).toBe(0);
});
