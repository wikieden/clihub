import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addMcp, listMcp, removeMcp } from '../src/mcp/manage.js';

// `all: true` bypasses provider detection so we exercise both JSON-MCP targets.
test('add → list → remove an inline MCP across CLIs', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'clihub-mcp-'));

  const added = await addMcp('myserver', { home, all: true, command: 'my-mcp', transport: 'stdio' });
  expect(added.failed.length).toBe(0);
  expect(added.done).toContain('myserver@claude-code');
  expect(added.done).toContain('myserver@gemini-cli');

  // Claude Code reads user-scope MCP from ~/.claude.json (not settings.json).
  const claudeMcp = path.join(home, '.claude.json');
  expect(existsSync(claudeMcp)).toBe(true);
  expect(JSON.parse(readFileSync(claudeMcp, 'utf8')).mcpServers.myserver.command).toBe('my-mcp');

  const rows = await listMcp({ home, all: true });
  const claude = rows.find((r) => r.tool === 'claude-code');
  expect(claude?.servers.some((s) => s.id === 'myserver')).toBe(true);

  const removed = await removeMcp('myserver', { home, all: true });
  expect(removed.done).toContain('myserver@claude-code');
  const after = await listMcp({ home, all: true });
  expect(after.find((r) => r.tool === 'claude-code')?.servers.some((s) => s.id === 'myserver')).toBe(false);
});

test('inline --command with args is split into command + args', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'clihub-mcp-'));
  await addMcp('fs', { home, all: true, command: 'npx -y @modelcontextprotocol/server-filesystem /tmp', transport: 'stdio' });
  const entry = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8')).mcpServers.fs;
  expect(entry.command).toBe('npx');
  expect(entry.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
});

test('add unknown MCP (no command/url) fails clearly', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'clihub-mcp-'));
  const res = await addMcp('no-such-mcp-xyz', { home, all: true });
  expect(res.done.length).toBe(0);
  expect(res.failed[0]!.error).toContain('unknown MCP');
});
