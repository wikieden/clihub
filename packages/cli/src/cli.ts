#!/usr/bin/env node
/**
 * clihub CLI entrypoint. Uses cac for argument parsing; delegates all
 * domain logic to @clihub/core.
 */
import { cac } from 'cac';
import kleur from 'kleur';
import pkg from '../package.json' with { type: 'json' };

import {
  BackupManager,
  CatalogLoader,
  ClaudeCodeSkillAdapter,
  CodexSkillAdapter,
  GeminiCliSkillAdapter,
  KiroCliSkillAdapter,
  getProvider,
  listProviders,
  type SkillSyncAdapter,
  type SkillManifest,
  t,
} from '@clihub/core';
import os from 'node:os';
import path from 'node:path';

const cli = cac('clihub');
const catalog = new CatalogLoader();
const backups = new BackupManager();

const ADAPTERS: Record<string, () => SkillSyncAdapter> = {
  'claude-code': () => new ClaudeCodeSkillAdapter(),
  'codex': () => new CodexSkillAdapter(),
  'kiro-cli': () => new KiroCliSkillAdapter(),
  'gemini-cli': () => new GeminiCliSkillAdapter(),
};

async function adaptersForSkill(skill: SkillManifest): Promise<Array<{ toolId: string; adapter: SkillSyncAdapter }>> {
  const result: Array<{ toolId: string; adapter: SkillSyncAdapter }> = [];
  for (const [toolId, factory] of Object.entries(ADAPTERS)) {
    if (!skill.supports[toolId as keyof typeof skill.supports]) continue;
    const provider = getProvider(toolId);
    if (!provider) continue;
    const det = await provider.detect();
    if (!det.installed) continue;
    result.push({ toolId, adapter: factory() });
  }
  return result;
}

const ok = (msg: string) => console.log(kleur.green('✓'), msg);
const info = (msg: string) => console.log(kleur.cyan('ℹ'), msg);
const warn = (msg: string) => console.log(kleur.yellow('⚠'), msg);
const err = (msg: string) => console.error(kleur.red('✗'), msg);

// ─── tool <action> [id] ───────────────────────────────────────────────
cli
  .command('tool <action> [id]', 'Manage tools  (list | install | uninstall | update)')
  .option('--method <m>', 'Install method: npm | bun | brew')
  .option('--dry-run', 'Preview only')
  .action(async (action: string, id: string | undefined, opts: { method?: string; dryRun?: boolean }) => {
    switch (action) {
      case 'list': {
        console.log(kleur.bold(t('tool.list.header')));
        for (const p of listProviders()) {
          const det = await p.detect();
          const status = det.installed
            ? kleur.green(`installed${det.version ? ` ${det.version}` : ''}`)
            : kleur.dim('not installed');
          console.log(`  ${kleur.bold(p.id)}  ${p.name}  ${status}`);
        }
        return;
      }
      case 'install': {
        if (!id) { err('id required: clihub tool install <id>'); process.exit(1); }
        const provider = getProvider(id);
        if (!provider) { err(t('cli.unknownCommand', { cmd: `tool install ${id}` })); process.exit(1); }
        info(t('tool.install.start', { tool: id }));
        if (opts.dryRun) {
          info(t('tool.install.dryRun', { cmd: `${opts.method ?? 'npm'} install -g ${id}` }));
          return;
        }
        try {
          await provider.install({ method: opts.method as never, dryRun: false });
          ok(t('tool.install.done', { tool: id }));
        } catch (e) {
          err(t('tool.install.failed', { tool: id, reason: String(e) }));
          process.exit(1);
        }
        return;
      }
      case 'uninstall': {
        if (!id) { err('id required: clihub tool uninstall <id>'); process.exit(1); }
        const provider = getProvider(id);
        if (!provider) { err(t('cli.unknownCommand', { cmd: `tool uninstall ${id}` })); process.exit(1); }
        info(t('tool.uninstall.start', { tool: id }));
        await provider.uninstall();
        ok(t('tool.uninstall.done', { tool: id }));
        return;
      }
      case 'update': {
        const targets = id ? [getProvider(id)].filter(Boolean) : listProviders();
        for (const p of targets) {
          if (!p) continue;
          info(t('tool.update.start', { tool: p.id }));
          await p.update();
          ok(t('tool.update.done', { tool: p.id }));
        }
        return;
      }
      default:
        err(`Unknown tool action: ${action}. Valid: list | install | uninstall | update`);
        process.exit(1);
    }
  });

// ─── doctor ───────────────────────────────────────────────────────────
cli
  .command('doctor [id]', 'Cross-CLI health matrix (install + settings + skills + MCP)')
  .option('--json', 'Output the matrix as JSON instead of a table')
  .action(async (id: string | undefined, opts: { json?: boolean }) => {
    const { runHealthMatrix } = await import('@clihub/core');
    let rows = await runHealthMatrix();
    if (id) rows = rows.filter((r) => r.id === id);

    if (opts.json) {
      console.log(JSON.stringify(rows, null, 2));
      const exitNonZero = rows.some((r) => r.installed && r.issues.length > 0);
      if (exitNonZero) process.exit(1);
      return;
    }

    const headers = ['CLI', 'STATUS', 'VERSION', 'SETTINGS', 'SKILLS', 'MCP'];
    const data = rows.map((r) => [
      r.name,
      r.installed ? kleur.green('✓ installed') : kleur.dim('✗ not installed'),
      r.installed ? (r.version ?? kleur.dim('?')) : kleur.dim('—'),
      r.installed
        ? (r.settingsExists ? r.settingsPath : kleur.yellow(`${r.settingsPath} (missing)`))
        : kleur.dim('—'),
      r.installed && r.skillCount !== undefined ? String(r.skillCount) : kleur.dim('—'),
      r.installed && r.mcpCount !== undefined ? String(r.mcpCount) : kleur.dim('—'),
    ]);

    const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, '');
    const widths = headers.map((h, i) =>
      Math.max(h.length, ...data.map((row) => stripAnsi(row[i] ?? '').length)),
    );
    const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - stripAnsi(s).length));

    console.log(kleur.bold(headers.map((h, i) => pad(h, widths[i]!)).join('  ')));
    console.log(kleur.dim(widths.map((w) => '─'.repeat(w)).join('  ')));
    for (const row of data) {
      console.log(row.map((c, i) => pad(c, widths[i]!)).join('  '));
    }

    let problems = 0;
    for (const r of rows) {
      if (r.installed && r.issues.length > 0) {
        warn(`${r.id}: ${t('doctor.issues', { count: r.issues.length })}`);
        for (const issue of r.issues) console.log(`    - ${issue}`);
        problems += r.issues.length;
      }
    }
    if (problems > 0) process.exit(1);
  });

// ─── skill <action> [id] ──────────────────────────────────────────────
cli
  .command('skill <action> [id]', 'Manage skills  (list | install | uninstall)')
  .option('--tool <tool>', 'Limit to a specific tool')
  .action(async (action: string, id: string | undefined, opts: { tool?: string }) => {
    switch (action) {
      case 'list': {
        const toolIds = opts.tool ? [opts.tool] : Object.keys(ADAPTERS);
        let any = false;
        for (const toolId of toolIds) {
          const factory = ADAPTERS[toolId];
          if (!factory) continue;
          const provider = getProvider(toolId);
          if (!provider) continue;
          const det = await provider.detect();
          if (!det.installed) continue;
          const installed = await factory().list();
          if (installed.length === 0) continue;
          any = true;
          console.log(kleur.bold(`[${toolId}] ${t('skill.list.header')}`));
          for (const s of installed) {
            console.log(`  ${kleur.bold(s.id)}  ${s.name}  ${kleur.dim(s.version)}`);
          }
        }
        if (!any) info(t('skill.list.empty'));
        return;
      }
      case 'install': {
        if (!id) { err('id required: clihub skill install <id>'); process.exit(1); }
        const skill = await catalog.findSkill(id);
        if (!skill) { err(t('skill.notFound', { skill: id })); process.exit(1); }
        const targets = opts.tool
          ? (() => {
              const factory = ADAPTERS[opts.tool!];
              return factory ? [{ toolId: opts.tool!, adapter: factory() }] : [];
            })()
          : await adaptersForSkill(skill);
        if (targets.length === 0) {
          warn(`No installed tools support skill ${id}`);
          return;
        }
        for (const { toolId, adapter } of targets) {
          info(`[${toolId}] ${t('skill.install.start', { skill: id })}`);
          try {
            await adapter.install(skill, skill.source);
            ok(`[${toolId}] ${t('skill.install.done', { skill: id })}`);
          } catch (e) {
            err(`[${toolId}] ${t('skill.install.failed', { skill: id, reason: String(e) })}`);
          }
        }
        return;
      }
      case 'uninstall': {
        if (!id) { err('id required: clihub skill uninstall <id>'); process.exit(1); }
        const toolIds = opts.tool ? [opts.tool] : Object.keys(ADAPTERS);
        for (const toolId of toolIds) {
          const factory = ADAPTERS[toolId];
          if (!factory) continue;
          info(`[${toolId}] ${t('skill.uninstall.start', { skill: id })}`);
          await factory().uninstall(id);
          ok(`[${toolId}] ${t('skill.uninstall.done', { skill: id })}`);
        }
        return;
      }
      default:
        err(`Unknown skill action: ${action}. Valid: list | install | uninstall`);
        process.exit(1);
    }
  });

// ─── preset <action> [id] ─────────────────────────────────────────────
cli
  .command('preset <action> [id]', 'Manage presets  (list | apply)')
  .action(async (action: string, id: string | undefined) => {
    switch (action) {
      case 'list': {
        const { presets } = await catalog.load();
        console.log(kleur.bold(t('preset.list.header')));
        for (const p of presets) {
          console.log(`  ${kleur.bold(p.id)}  ${p.name}  ${kleur.dim(p.description)}`);
        }
        return;
      }
      case 'apply': {
        if (!id) { err('id required: clihub preset apply <id>'); process.exit(1); }
        const preset = await catalog.findPreset(id);
        if (!preset) { err(t('preset.notFound', { preset: id })); process.exit(1); }
        info(t('preset.applying', { preset: id }));
        for (const toolId of preset.tools) {
          const p = getProvider(toolId);
          if (!p) { warn(`skip unknown tool ${toolId}`); continue; }
          const det = await p.detect();
          if (det.installed) {
            info(t('tool.detect.found', { tool: toolId, version: det.version ?? '' }));
            continue;
          }
          info(t('tool.install.start', { tool: toolId }));
          await p.install({});
          ok(t('tool.install.done', { tool: toolId }));
        }
        for (const skillId of preset.skills) {
          const skill = await catalog.findSkill(skillId);
          if (!skill) { warn(`skip unknown skill ${skillId}`); continue; }
          const targets = await adaptersForSkill(skill);
          if (targets.length === 0) { warn(`skip ${skillId}: no installed tools support it`); continue; }
          for (const { toolId, adapter } of targets) {
            info(`[${toolId}] ${t('skill.install.start', { skill: skillId })}`);
            await adapter.install(skill, skill.source);
            ok(`[${toolId}] ${t('skill.install.done', { skill: skillId })}`);
          }
        }
        ok(t('preset.applied', { preset: id }));
        return;
      }
      default:
        err(`Unknown preset action: ${action}. Valid: list | apply`);
        process.exit(1);
    }
  });

// ─── backup [action] ──────────────────────────────────────────────────
cli
  .command('backup [action]', 'Backup ~/.claude  (no arg = create, list = list backups)')
  .action(async (action?: string) => {
    if (action === 'list') {
      const all = await backups.list();
      if (all.length === 0) { info(t('backup.list.empty')); return; }
      console.log(kleur.bold(t('backup.list.header')));
      for (const b of all) console.log(`  ${b.id}  ${kleur.dim(b.path)}`);
      return;
    }
    try {
      const entry = await backups.create({ sourceDir: path.join(os.homedir(), '.claude') });
      ok(t('backup.created', { path: entry.path }));
    } catch (e) {
      err(t('backup.failed', { reason: String(e) }));
      process.exit(1);
    }
  });

// ─── restore / rollback ───────────────────────────────────────────────
cli
  .command('restore <id>', 'Restore a backup by id')
  .action(async (id: string) => {
    info(t('restore.start', { id }));
    try {
      await backups.restore(id, path.join(os.homedir(), '.claude'));
      ok(t('restore.done', { id }));
    } catch {
      err(t('restore.notFound', { id }));
      process.exit(1);
    }
  });

cli
  .command('rollback', 'Restore the most recent backup')
  .action(async () => {
    const all = await backups.list();
    const latest = all[0];
    if (!latest) { err(t('backup.list.empty')); process.exit(1); return; }
    info(t('restore.start', { id: latest.id }));
    await backups.restore(latest.id, path.join(os.homedir(), '.claude'));
    ok(t('restore.done', { id: latest.id }));
  });

// ─── config ───────────────────────────────────────────────────────────
cli
  .command('config <action> [tool]', 'Show or edit config  (show)')
  .action(async (action: string, toolId: string | undefined) => {
    if (action !== 'show') {
      err(`Unknown config action: ${action}. Valid: show`);
      process.exit(1);
    }
    const targets = toolId ? [getProvider(toolId)].filter(Boolean) : listProviders();
    for (const p of targets) {
      if (!p) continue;
      const det = await p.detect();
      if (!det.installed) {
        info(`${p.id}: not installed`);
        continue;
      }
      const data = await p.settingsAdapter.read();
      console.log(kleur.bold(`\n── ${p.name} (${p.settingsAdapter.configPath()}) ──`));
      console.log(JSON.stringify(data, null, 2));
    }
  });

// ─── self-update ──────────────────────────────────────────────────────
cli
  .command('self-update', 'Update clihub to the latest version')
  .action(async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileP = promisify(execFile);

    const PKG = '@wikieden/clihub';
    let method: 'npm' | 'bun' = 'npm';
    try {
      const { stdout } = await execFileP('npm', ['ls', '-g', '--depth=0', PKG]);
      if (stdout.includes('clihub')) method = 'npm';
    } catch {
      method = 'bun';
    }

    info(`Updating clihub via ${method}...`);
    try {
      if (method === 'npm') {
        await execFileP('npm', ['install', '-g', `${PKG}@latest`]);
      } else {
        await execFileP('bun', ['add', '-g', `${PKG}@latest`]);
      }
      ok('clihub updated to latest');
    } catch (e) {
      err(`Update failed: ${String(e)}`);
      process.exit(1);
    }
  });

// ─── default → TUI ────────────────────────────────────────────────────
cli.command('', t('cli.title')).action(async () => {
  const { runTui } = await import('./tui/index.js');
  await runTui();
});

cli.help();
cli.version(pkg.version);

cli.parse();
