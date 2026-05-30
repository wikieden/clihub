/**
 * TUI main menu. Restructured in v0.3.0 so the top level branches *per
 * CLI tool* — picking a tool drops you into a sub-menu that exposes
 * install / update / skills / plugins / MCP / config / doctor for just
 * that CLI. A separate "Cross-tool" branch keeps the fan-out actions
 * (preset apply, install-to-all, doctor-all).
 *
 * Plugin and MCP support is added incrementally. Where a CLI doesn't
 * yet have an adapter the menu shows a friendly "coming in v0.3.x"
 * notice instead of failing.
 */
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  select,
  spinner,
} from '@clack/prompts';
import kleur from 'kleur';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runWizard } from '../wizard-flow.js';

import {
  BackupManager,
  CatalogLoader,
  ClaudeCodePluginAdapter,
  ClaudeCodeSkillAdapter,
  CodexSkillAdapter,
  GeminiCliSkillAdapter,
  JsonMcpAdapter,
  KiroCliSkillAdapter,
  getProvider,
  listProviders,
  t,
  type McpAdapter,
  type McpServerManifest,
  type PluginAdapter,
  type PluginManifest,
  type SkillManifest,
  type SkillSyncAdapter,
} from '@clihub/core';

const catalog = new CatalogLoader();
const backups = new BackupManager();

// ─── Per-CLI capability tables ────────────────────────────────────────

const SUPPORTED_TOOLS = ['claude-code', 'codex', 'kiro-cli', 'gemini-cli'] as const;
type ToolId = (typeof SUPPORTED_TOOLS)[number];

const SKILL_ADAPTERS: Record<ToolId, () => SkillSyncAdapter> = {
  'claude-code': () => new ClaudeCodeSkillAdapter(),
  'codex': () => new CodexSkillAdapter(),
  'kiro-cli': () => new KiroCliSkillAdapter(),
  'gemini-cli': () => new GeminiCliSkillAdapter(),
};

/** JSON-shaped MCP settings paths (CLIs using the standard `mcpServers` map). */
const MCP_SETTINGS_PATH: Partial<Record<ToolId, string>> = {
  'claude-code': path.join(os.homedir(), '.claude', 'settings.json'),
  'gemini-cli': path.join(os.homedir(), '.gemini', 'settings.json'),
};

function mcpAdapterFor(toolId: ToolId): McpAdapter | undefined {
  const p = MCP_SETTINGS_PATH[toolId];
  if (!p) return undefined;
  return new JsonMcpAdapter({ path: p });
}

/** Plugin support is Claude Code-only for v0.3.x. */
function supportsPlugins(toolId: ToolId): boolean {
  return toolId === 'claude-code';
}

function pluginAdapterFor(toolId: ToolId): PluginAdapter | undefined {
  if (toolId === 'claude-code') return new ClaudeCodePluginAdapter();
  return undefined;
}

const BACK = '__back__';

// ─── Public entry ─────────────────────────────────────────────────────

export async function runTui(): Promise<void> {
  intro(kleur.bold().cyan(t('cli.title')));

  let welcomed = false;

  while (true) {
    // How many CLIs are already installed? Drives the first-run guidance.
    const installedCount = (
      await Promise.all(
        SUPPORTED_TOOLS.map(async (id) => {
          const p = getProvider(id);
          return p ? (await p.detect()).installed : false;
        }),
      )
    ).filter(Boolean).length;

    if (installedCount === 0 && !welcomed) {
      note(
        [
          'No AI CLI detected yet. Fastest path:',
          `  ${kleur.green('🚀 Quick start')} — installs Claude Code + 5 core skills in one step.`,
          'Or pick a single CLI below to install just that one.',
          '',
          kleur.dim('`clihub doctor` checks health · every change is backed up and reversible.'),
        ].join('\n'),
        kleur.bold('Welcome to clihub'),
      );
      welcomed = true;
    }

    const choice = (await select({
      message: 'What would you like to do? (ESC = exit)',
      options: [
        ...(installedCount === 0
          ? [{ value: 'quickstart', label: `${kleur.green('🚀')} Quick start  ${kleur.dim('— install the starter preset (recommended)')}` }]
          : []),
        { value: 'wizard', label: `${kleur.green('🧙')} Setup wizard  ${kleur.dim('— install + preset + proxy + accounts (re-runnable)')}` },
        ...SUPPORTED_TOOLS.map((id) => {
          const p = getProvider(id);
          const label = p ? p.name : id;
          return { value: `cli:${id}`, label: `${kleur.cyan('▸')} ${label}  ${kleur.dim('(install, skills, MCP, ...)')}` };
        }),
        { value: 'sep1', label: kleur.dim('────────────────'), hint: '' },
        { value: 'cross', label: `${kleur.magenta('◇')} Cross-tool actions  ${kleur.dim('(presets, fan-out, doctor-all)')}` },
        { value: 'maint', label: `${kleur.yellow('◆')} Backup / Restore` },
        { value: 'sep2', label: kleur.dim('────────────────'), hint: '' },
        { value: 'exit', label: 'Exit' },
      ],
    })) as string | symbol;

    if (isCancel(choice) || choice === 'exit') {
      const { maybeStarNudge } = await import('../star-nudge.js');
      await maybeStarNudge().catch(() => {});
      cancel('Bye');
      return;
    }
    if (choice === 'sep1' || choice === 'sep2') continue;

    try {
      if (choice === 'wizard') {
        await runWizard();
      } else if (choice === 'quickstart') {
        await runPresetApply();
      } else if (typeof choice === 'string' && choice.startsWith('cli:')) {
        await cliMenu(choice.slice(4) as ToolId);
      } else if (choice === 'cross') {
        await crossMenu();
      } else if (choice === 'maint') {
        await maintenanceMenu();
      }
    } catch (e) {
      log.error(String(e));
    }
  }
}

// ─── Per-CLI submenu ─────────────────────────────────────────────────

async function cliMenu(toolId: ToolId): Promise<void> {
  const provider = getProvider(toolId);
  if (!provider) {
    log.error(`No provider registered for ${toolId}`);
    return;
  }

  const { getToolProxy } = await import('@clihub/core');

  while (true) {
    const det = await provider.detect();
    const curProxy = await getToolProxy(toolId).catch(() => undefined);
    const status = det.installed
      ? kleur.green(`installed${det.version ? `  v${det.version}` : ''}`)
      : kleur.dim('not installed');

    const choice = (await select({
      message: `${kleur.bold(provider.name)}  —  ${status}`,
      options: [
        ...(det.installed
          ? [{ value: 'tool.run', label: `${kleur.green('▶')} Run ${provider.name}  ${kleur.dim('(launch the CLI)')}` }, { value: 'sep0', label: kleur.dim('────────────────'), hint: '' }]
          : []),
        det.installed
          ? { value: 'tool.update', label: 'Update CLI to latest' }
          : { value: 'tool.install', label: 'Install CLI' },
        det.installed
          ? { value: 'tool.uninstall', label: 'Uninstall CLI' }
          : { value: 'tool.info', label: 'Show install info' },
        { value: 'sep1', label: kleur.dim('───────── Skills'), hint: '' },
        { value: 'skill.list', label: '  List installed skills' },
        { value: 'skill.install', label: '  Install a skill' },
        { value: 'skill.uninstall', label: '  Uninstall a skill' },
        { value: 'sep2', label: kleur.dim('───────── Plugins'), hint: '' },
        supportsPlugins(toolId)
          ? { value: 'plugin.list', label: '  List installed plugins' }
          : { value: 'plugin.notyet', label: kleur.dim('  Plugins — coming for this CLI') },
        supportsPlugins(toolId)
          ? { value: 'plugin.install', label: '  Install a plugin' }
          : { value: 'plugin.notyet2', label: kleur.dim('  ') },
        supportsPlugins(toolId)
          ? { value: 'plugin.uninstall', label: '  Uninstall a plugin' }
          : { value: 'plugin.notyet3', label: kleur.dim('  ') },
        { value: 'sep3', label: kleur.dim('───────── MCP servers'), hint: '' },
        mcpAdapterFor(toolId)
          ? { value: 'mcp.list', label: '  List MCP servers' }
          : { value: 'mcp.notyet', label: kleur.dim('  MCP — coming in v0.3.x for this CLI') },
        mcpAdapterFor(toolId)
          ? { value: 'mcp.install', label: '  Install an MCP server' }
          : { value: 'mcp.notyet2', label: kleur.dim('  ') },
        mcpAdapterFor(toolId)
          ? { value: 'mcp.uninstall', label: '  Uninstall an MCP server' }
          : { value: 'mcp.notyet3', label: kleur.dim('  ') },
        { value: 'sep4', label: kleur.dim('───────── Maintenance'), hint: '' },
        { value: 'proxy', label: `Set proxy${curProxy ? `  ${kleur.dim(`(current: ${curProxy})`)}` : `  ${kleur.dim('(none)')}`}` },
        { value: 'doctor', label: 'Doctor (this CLI)' },
        { value: 'config', label: 'Show config file' },
        { value: 'sep5', label: kleur.dim('────────────────'), hint: '' },
        { value: BACK, label: '← Back to main menu' },
      ],
    })) as string | symbol;

    if (isCancel(choice) || choice === BACK) return;
    if (typeof choice === 'string' && choice.startsWith('sep')) continue;
    if (typeof choice === 'string' && choice.startsWith('plugin.notyet')) {
      log.info(`Plugin support for ${toolId} is not implemented yet. See roadmap.`);
      continue;
    }
    if (typeof choice === 'string' && choice.startsWith('mcp.notyet')) {
      log.info(`MCP support for ${toolId} is not implemented yet. See roadmap.`);
      continue;
    }

    try {
      await handleCliAction(toolId, choice as string);
    } catch (e) {
      log.error(String(e));
    }
  }
}

async function handleCliAction(toolId: ToolId, action: string): Promise<void> {
  const provider = getProvider(toolId)!;
  switch (action) {
    case 'proxy': {
      const { getToolProxy, setToolProxy, detectSystemProxy } = await import('@clihub/core');
      const cur = await getToolProxy(toolId).catch(() => undefined);
      const detected = cur ? undefined : await detectSystemProxy().catch(() => undefined);
      if (detected?.url) log.info(`detected ${detected.source} proxy: ${detected.url} (pre-filled)`);
      const { text } = await import('@clack/prompts');
      const url = await text({
        message: `Proxy for ${provider.name} (blank = clear)`,
        placeholder: 'http://proxy.corp:8080 or socks5://host:1080',
        initialValue: cur ?? detected?.url ?? '',
      });
      if (isCancel(url)) return;
      const v = (url as string).trim();
      try {
        await setToolProxy(toolId, v || undefined);
        log.success(v ? `proxy set for ${toolId}: ${v}` : `proxy cleared for ${toolId}`);
        log.info('Restart the CLI to pick up the new env.');
      } catch (e) {
        log.error(`proxy: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    case 'tool.run': {
      const det = await provider.detect();
      const bin = det.path || toolId;
      log.info(`Launching ${provider.name} (${bin}). Exit it to return to clihub.`);
      await new Promise<void>((resolve) => {
        const child = spawn(bin, [], { stdio: 'inherit' });
        child.on('error', (e) => { log.error(`could not launch ${bin}: ${e.message}`); resolve(); });
        child.on('close', () => resolve());
      });
      return;
    }
    case 'tool.install': {
      const s = spinner();
      s.start(t('tool.install.start', { tool: toolId }));
      try {
        await provider.install({});
        s.stop(t('tool.install.done', { tool: toolId }));
      } catch (e) {
        s.stop(t('tool.install.failed', { tool: toolId, reason: String(e) }));
      }
      return;
    }
    case 'tool.update': {
      const s = spinner();
      s.start(t('tool.update.start', { tool: toolId }));
      try {
        await provider.update();
        s.stop(t('tool.update.done', { tool: toolId }));
      } catch (e) {
        s.stop(`update failed: ${String(e)}`);
      }
      return;
    }
    case 'tool.uninstall': {
      const ok = await confirm({ message: `Uninstall ${provider.name}?`, initialValue: false });
      if (isCancel(ok) || ok !== true) return;
      const s = spinner();
      s.start(t('tool.uninstall.start', { tool: toolId }));
      try {
        await provider.uninstall();
        s.stop(t('tool.uninstall.done', { tool: toolId }));
      } catch (e) {
        s.stop(`uninstall failed: ${String(e)}`);
      }
      return;
    }
    case 'tool.info': {
      note(
        [
          kleur.bold(provider.name),
          kleur.dim(provider.description),
          `homepage:   ${provider.homepage}`,
          `platforms:  ${provider.supportedPlatforms.join(', ')}`,
          `installers: ${provider.installMethods.join(', ')}`,
        ].join('\n'),
        'Install info',
      );
      return;
    }

    case 'skill.list': {
      const adapter = SKILL_ADAPTERS[toolId]();
      const installed = await adapter.list();
      if (installed.length === 0) { log.info(t('skill.list.empty')); return; }
      for (const sk of installed) log.message(`  ${sk.id}  ${sk.name}  ${kleur.dim(sk.version)}`);
      return;
    }
    case 'skill.install': {
      const { skills } = await catalog.load();
      const supported = skills.filter((sk) => sk.supports[toolId]);
      if (supported.length === 0) { log.info(`No skills in the catalog support ${toolId} yet.`); return; }
      const pick = await select({
        message: `Pick a skill to install on ${toolId} (ESC = back)`,
        options: [
          ...supported.map((sk) => ({ value: sk.id, label: `${sk.name} — ${sk.description}` })),
          { value: BACK, label: '← Back' },
        ],
      });
      if (isCancel(pick) || pick === BACK) return;
      const skill = (await catalog.findSkill(pick as string))!;
      const s = spinner();
      s.start(t('skill.install.start', { skill: skill.id }));
      try {
        await SKILL_ADAPTERS[toolId]().install(skill, skill.source);
        s.stop(t('skill.install.done', { skill: skill.id }));
      } catch (e) {
        s.stop(t('skill.install.failed', { skill: skill.id, reason: String(e) }));
      }
      return;
    }
    case 'skill.uninstall': {
      const adapter = SKILL_ADAPTERS[toolId]();
      const installed = await adapter.list();
      if (installed.length === 0) { log.info(t('skill.list.empty')); return; }
      const pick = await select({
        message: `Pick a skill to uninstall from ${toolId} (ESC = back)`,
        options: [
          ...installed.map((sk) => ({ value: sk.id, label: `${sk.id}  ${kleur.dim(sk.version)}` })),
          { value: BACK, label: '← Back' },
        ],
      });
      if (isCancel(pick) || pick === BACK) return;
      const s = spinner();
      s.start(t('skill.uninstall.start', { skill: pick as string }));
      try {
        await adapter.uninstall(pick as string);
        s.stop(t('skill.uninstall.done', { skill: pick as string }));
      } catch (e) {
        s.stop(`uninstall failed: ${String(e)}`);
      }
      return;
    }

    case 'mcp.list': {
      const adapter = mcpAdapterFor(toolId)!;
      const servers = await adapter.list();
      if (servers.length === 0) { log.info(`No MCP servers registered with ${toolId}.`); return; }
      note(
        servers.map((s) => `• ${kleur.bold(s.id)}  ${kleur.dim(`${s.command} ${(s.args ?? []).join(' ')}`)}`).join('\n'),
        `MCP servers in ${adapter.configPath()}`,
      );
      return;
    }
    case 'mcp.install': {
      const adapter = mcpAdapterFor(toolId)!;
      const { mcpServers } = await catalog.load();
      const supported = mcpServers.filter((m) => m.supports[toolId]);
      if (supported.length === 0) { log.info(`No MCP servers in the catalog support ${toolId} yet.`); return; }
      const pick = await select({
        message: `Pick an MCP server to install on ${toolId} (ESC = back)`,
        options: [
          ...supported.map((m) => ({ value: m.id, label: `${m.name} — ${m.description}` })),
          { value: BACK, label: '← Back' },
        ],
      });
      if (isCancel(pick) || pick === BACK) return;
      const server = (await catalog.findMcpServer(pick as string))!;
      await previewAndInstallMcp(toolId, adapter, server);
      return;
    }
    case 'mcp.uninstall': {
      const adapter = mcpAdapterFor(toolId)!;
      const servers = await adapter.list();
      if (servers.length === 0) { log.info(`No MCP servers registered with ${toolId}.`); return; }
      const pick = await select({
        message: `Pick an MCP server to remove from ${toolId} (ESC = back)`,
        options: [
          ...servers.map((s) => ({ value: s.id, label: s.id })),
          { value: BACK, label: '← Back' },
        ],
      });
      if (isCancel(pick) || pick === BACK) return;
      await adapter.uninstall(pick as string);
      log.success(`Removed ${pick} from ${adapter.configPath()}`);
      return;
    }

    case 'plugin.list': {
      const adapter = pluginAdapterFor(toolId);
      if (!adapter) { log.info(`Plugin support not yet available for ${toolId}`); return; }
      const installed = await adapter.list();
      if (installed.length === 0) {
        log.info(`No plugins installed at ${adapter.rootDir()}`);
        return;
      }
      const lines = [`Root: ${adapter.rootDir()}`, ''];
      for (const p of installed) lines.push(`  ${p.id}  ${p.version}  ${kleur.dim(p.path)}`);
      note(lines.join('\n'), `Installed plugins (${installed.length})`);
      return;
    }
    case 'plugin.install': {
      const adapter = pluginAdapterFor(toolId);
      if (!adapter) { log.info(`Plugin support not yet available for ${toolId}`); return; }
      const { plugins } = await catalog.load();
      const compatible = plugins.filter((p) => p.supports[toolId]);
      if (compatible.length === 0) {
        log.warn(`No plugins in the catalog support ${toolId}`);
        return;
      }
      const choice = await select({
        message: `Pick a plugin to install (ESC = back)`,
        options: [
          ...compatible.map((p) => ({
            value: p.id,
            label: `${p.name} — ${p.description}`,
          })),
          { value: BACK, label: '← Back' },
        ],
      });
      if (isCancel(choice) || choice === BACK) return;
      const plugin = compatible.find((p) => p.id === choice)!;
      const confirmIt = await confirm({
        message: `Clone ${plugin.source} into ${path.join(adapter.rootDir(), plugin.id)}?`,
        initialValue: true,
      });
      if (isCancel(confirmIt) || confirmIt !== true) return;
      const s = spinner();
      s.start(`Installing ${plugin.id}...`);
      try {
        await adapter.install(plugin);
        s.stop(`✓ ${plugin.id} installed`);
      } catch (e) {
        s.stop(`✗ ${plugin.id} failed: ${String(e)}`);
      }
      return;
    }
    case 'plugin.uninstall': {
      const adapter = pluginAdapterFor(toolId);
      if (!adapter) { log.info(`Plugin support not yet available for ${toolId}`); return; }
      const installed = await adapter.list();
      if (installed.length === 0) { log.info('No plugins installed.'); return; }
      const pick = await select({
        message: 'Pick a plugin to uninstall (ESC = back)',
        options: [
          ...installed.map((p) => ({ value: p.id, label: `${p.id}  ${kleur.dim(p.version)}` })),
          { value: BACK, label: '← Back' },
        ],
      });
      if (isCancel(pick) || pick === BACK) return;
      const sure = await confirm({ message: `Remove ${pick}?`, initialValue: false });
      if (isCancel(sure) || sure !== true) return;
      await adapter.uninstall(pick as string);
      log.success(`Removed ${pick} from ${adapter.rootDir()}`);
      return;
    }

    case 'doctor': {
      const r = await provider.doctor();
      if (r.healthy) log.success(`${toolId}: ${t('doctor.healthy')}`);
      else {
        log.warn(`${toolId}: ${t('doctor.issues', { count: r.issues.length })}`);
        for (const i of r.issues) log.message(`  - ${i}`);
      }
      return;
    }
    case 'config': {
      const data = await provider.settingsAdapter.read();
      note(
        [`path: ${provider.settingsAdapter.configPath()}`, '', JSON.stringify(data, null, 2)].join('\n'),
        `${provider.name} config`,
      );
      return;
    }
  }
}

async function previewAndInstallMcp(toolId: ToolId, adapter: McpAdapter, server: McpServerManifest): Promise<void> {
  const envWarning = server.env && Object.keys(server.env).length > 0
    ? [
        '',
        kleur.yellow('⚠ Required environment variables (set before running the CLI):'),
        ...Object.entries(server.env).map(([k, hint]) => `   ${kleur.bold(k)}  ${kleur.dim(`— ${hint}`)}`),
      ]
    : [];
  note(
    [
      kleur.bold(`${server.name}  →  ${toolId}`),
      kleur.dim(server.description),
      '',
      `command: ${server.command} ${(server.args ?? []).join(' ')}`,
      ...(envWarning as string[]),
      '',
      kleur.dim(`Will patch: ${adapter.configPath()}`),
    ].join('\n'),
    'MCP install preview',
  );
  const go = await confirm({ message: 'Install this MCP server?', initialValue: true });
  if (isCancel(go) || go !== true) { log.info('Cancelled.'); return; }
  const s = spinner();
  s.start(`installing MCP server ${server.id}`);
  try {
    await adapter.install(server);
    s.stop(`✓ MCP server ${server.id} added to ${adapter.configPath()}`);
    if (server.env && Object.keys(server.env).length > 0) {
      log.warn(`Remember to set ${Object.keys(server.env).join(', ')} in your shell before running ${toolId}.`);
    }
  } catch (e) {
    s.stop(`install failed: ${String(e)}`);
  }
}

// ─── Cross-tool submenu ──────────────────────────────────────────────

async function crossMenu(): Promise<void> {
  while (true) {
    const choice = (await select({
      message: 'Cross-tool actions (ESC = back)',
      options: [
        { value: 'preset.apply', label: 'Apply a preset (install tools + fan out skills)' },
        { value: 'skill.fanout', label: 'Install a skill into every supported installed CLI' },
        { value: 'doctor.all', label: 'Run doctor across every CLI' },
        { value: 'tools.status', label: 'List status of every CLI' },
        { value: BACK, label: '← Back' },
      ],
    })) as string | symbol;
    if (isCancel(choice) || choice === BACK) return;
    try {
      await handleCrossAction(choice as string);
    } catch (e) {
      log.error(String(e));
    }
  }
}

async function handleCrossAction(action: string): Promise<void> {
  switch (action) {
    case 'preset.apply':   return runPresetApply();
    case 'skill.fanout':   return runSkillFanout();
    case 'doctor.all': {
      const { runHealthMatrix } = await import('@clihub/core');
      const rows = await runHealthMatrix();
      const lines: string[] = [];
      const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, '');
      const cells = rows.map((r) => [
        r.name,
        r.installed ? kleur.green('✓') : kleur.dim('✗'),
        r.installed ? (r.version ?? kleur.dim('?')) : kleur.dim('—'),
        r.installed && r.skillCount !== undefined ? String(r.skillCount) : kleur.dim('—'),
        r.installed && r.mcpCount !== undefined ? String(r.mcpCount) : kleur.dim('—'),
        r.issues.length > 0 ? kleur.yellow(`${r.issues.length} issue(s)`) : kleur.green('ok'),
      ]);
      const headers = ['CLI', 'INST', 'VERSION', 'SKILLS', 'MCP', 'HEALTH'];
      const widths = headers.map((h, i) =>
        Math.max(h.length, ...cells.map((row) => stripAnsi(row[i] ?? '').length)),
      );
      const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - stripAnsi(s).length));
      lines.push(kleur.bold(headers.map((h, i) => pad(h, widths[i]!)).join('  ')));
      lines.push(kleur.dim(widths.map((w) => '─'.repeat(w)).join('  ')));
      for (const row of cells) lines.push(row.map((c, i) => pad(c, widths[i]!)).join('  '));
      note(lines.join('\n'), 'Health matrix');
      for (const r of rows) {
        if (r.installed && r.issues.length > 0) {
          log.warn(`${r.id}:`);
          for (const i of r.issues) log.message(`  - ${i}`);
        }
      }
      return;
    }
    case 'tools.status': {
      for (const p of listProviders()) {
        const det = await p.detect();
        log.info(`${p.id}  ${p.name}  ${det.installed ? `✓ ${det.version ?? ''}` : kleur.dim('not installed')}`);
      }
      return;
    }
  }
}

async function adaptersForSkill(skill: SkillManifest): Promise<Array<{ toolId: string; adapter: SkillSyncAdapter }>> {
  const result: Array<{ toolId: string; adapter: SkillSyncAdapter }> = [];
  for (const toolId of SUPPORTED_TOOLS) {
    if (!skill.supports[toolId]) continue;
    const provider = getProvider(toolId);
    if (!provider) continue;
    const det = await provider.detect();
    if (!det.installed) continue;
    result.push({ toolId, adapter: SKILL_ADAPTERS[toolId]() });
  }
  return result;
}

async function runSkillFanout(): Promise<void> {
  const { skills } = await catalog.load();
  const pick = await select({
    message: 'Pick a skill to fan out (ESC = back)',
    options: [
      ...skills.map((sk) => ({ value: sk.id, label: `${sk.name} — ${sk.description}` })),
      { value: BACK, label: '← Back' },
    ],
  });
  if (isCancel(pick) || pick === BACK) return;
  const skill = (await catalog.findSkill(pick as string))!;
  const targets = await adaptersForSkill(skill);
  if (targets.length === 0) { log.warn(`No installed CLI supports skill ${skill.id}.`); return; }
  const s = spinner();
  s.start(t('skill.install.start', { skill: skill.id }));
  for (const { toolId, adapter } of targets) {
    try {
      await adapter.install(skill, skill.source);
      log.step(`[${toolId}] installed`);
    } catch (e) {
      log.error(`[${toolId}] ${String(e)}`);
    }
  }
  s.stop(t('skill.install.done', { skill: skill.id }));
}

async function runPresetApply(): Promise<void> {
  const { presets } = await catalog.load();
  const choice = await select({
    message: 'Pick a preset (ESC = back)',
    options: [
      ...presets.map((p) => ({ value: p.id, label: `${p.name} — ${p.description}` })),
      { value: BACK, label: '← Back' },
    ],
  });
  if (isCancel(choice) || choice === BACK) return;
  const preset = (await catalog.findPreset(choice as string))!;

  const toolLines = preset.tools.map((id) => {
    const p = getProvider(id);
    return `  • ${id}${p ? `  (${p.name})` : ''}`;
  });
  const skillPreviews: string[] = [];
  for (const skillId of preset.skills) {
    const skill = await catalog.findSkill(skillId);
    if (!skill) { skillPreviews.push(`  • ${skillId}  ${kleur.red('(missing in catalog)')}`); continue; }
    const targets = await adaptersForSkill(skill);
    const targetIds = targets.map((tg) => tg.toolId).join(', ') || kleur.dim('no installed CLI supports it');
    skillPreviews.push(`  • ${skillId}  →  ${targetIds}`);
  }
  note(
    [
      kleur.bold(`Preset: ${preset.name}`),
      kleur.dim(preset.description),
      '',
      kleur.bold(`Tools (${preset.tools.length}):`),
      ...toolLines,
      '',
      kleur.bold(`Skills (${preset.skills.length}):`),
      ...skillPreviews,
    ].join('\n'),
    'Preview',
  );

  const go = await confirm({ message: 'Apply this preset?', initialValue: true });
  if (isCancel(go) || go !== true) { log.info('Cancelled.'); return; }

  let toolsInstalled = 0;
  let toolsSkipped = 0;
  const skillsInstalled: string[] = [];
  const skillsSkipped: string[] = [];

  for (const toolId of preset.tools) {
    const provider = getProvider(toolId);
    if (!provider) { log.warn(`skip unknown tool ${toolId}`); continue; }
    const det = await provider.detect();
    if (det.installed) {
      log.step(`[tool] ${toolId} already installed${det.version ? ` (${det.version})` : ''}, skipping`);
      toolsSkipped++;
      continue;
    }
    const s = spinner();
    s.start(`[tool] installing ${toolId}`);
    try {
      await provider.install({});
      s.stop(`[tool] ${toolId} installed`);
      toolsInstalled++;
    } catch (e) {
      s.stop(`[tool] ${toolId} failed: ${String(e)}`);
    }
  }

  for (const skillId of preset.skills) {
    const skill = await catalog.findSkill(skillId);
    if (!skill) { log.warn(`[skill] ${skillId} not in catalog, skipping`); skillsSkipped.push(skillId); continue; }
    const targets = await adaptersForSkill(skill);
    if (targets.length === 0) { log.warn(`[skill] ${skillId}: no installed tool supports it, skipping`); skillsSkipped.push(skillId); continue; }
    for (const { toolId, adapter } of targets) {
      try {
        await adapter.install(skill, skill.source);
        log.step(`[skill] ${skillId} → ${toolId}`);
      } catch (e) {
        log.error(`[skill] ${skillId} → ${toolId} failed: ${String(e)}`);
      }
    }
    skillsInstalled.push(skillId);
  }

  note(
    [
      kleur.green(`✓ Preset "${preset.name}" applied`),
      `  tools installed: ${toolsInstalled}  (skipped existing: ${toolsSkipped})`,
      `  skills installed: ${skillsInstalled.length}  (skipped: ${skillsSkipped.length})`,
      skillsInstalled.length ? `  installed skills: ${skillsInstalled.join(', ')}` : '',
      skillsSkipped.length ? kleur.yellow(`  skipped skills: ${skillsSkipped.join(', ')}`) : '',
    ].filter(Boolean).join('\n'),
    'Summary',
  );
}

// ─── Maintenance submenu ─────────────────────────────────────────────

async function maintenanceMenu(): Promise<void> {
  while (true) {
    const choice = (await select({
      message: 'Backup / Restore (ESC = back)',
      options: [
        { value: 'backup', label: 'Create backup of ~/.claude' },
        { value: 'list', label: 'List backups' },
        { value: 'restore', label: 'Restore a backup by id' },
        { value: 'rollback', label: 'Restore the most recent backup' },
        { value: BACK, label: '← Back' },
      ],
    })) as string | symbol;
    if (isCancel(choice) || choice === BACK) return;
    try {
      await handleMaintAction(choice as string);
    } catch (e) {
      log.error(String(e));
    }
  }
}

async function handleMaintAction(action: string): Promise<void> {
  switch (action) {
    case 'backup': {
      const s = spinner();
      s.start('backing up');
      const entry = await backups.create({ sourceDir: path.join(os.homedir(), '.claude') });
      s.stop(t('backup.created', { path: entry.path }));
      return;
    }
    case 'list': {
      const all = await backups.list();
      if (all.length === 0) { log.info(t('backup.list.empty')); return; }
      for (const b of all) log.message(`  ${b.id}  ${kleur.dim(b.path)}`);
      return;
    }
    case 'restore': {
      const all = await backups.list();
      if (all.length === 0) { log.info(t('backup.list.empty')); return; }
      const pick = await select({
        message: 'Pick a backup to restore (ESC = back)',
        options: [
          ...all.map((b) => ({ value: b.id, label: `${b.id}  ${kleur.dim(b.path)}` })),
          { value: BACK, label: '← Back' },
        ],
      });
      if (isCancel(pick) || pick === BACK) return;
      const ok = await confirm({
        message: `Restore ${pick}? This overwrites ~/.claude with the snapshot.`,
        initialValue: false,
      });
      if (isCancel(ok) || ok !== true) return;
      await backups.restore(pick as string, path.join(os.homedir(), '.claude'));
      log.success(t('restore.done', { id: pick as string }));
      return;
    }
    case 'rollback': {
      const all = await backups.list();
      const latest = all[0];
      if (!latest) { log.warn(t('backup.list.empty')); return; }
      const ok = await confirm({
        message: `Rollback to most recent (${latest.id})? Overwrites ~/.claude.`,
        initialValue: false,
      });
      if (isCancel(ok) || ok !== true) return;
      await backups.restore(latest.id, path.join(os.homedir(), '.claude'));
      log.success(t('restore.done', { id: latest.id }));
      return;
    }
  }
}
