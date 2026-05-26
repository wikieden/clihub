#!/usr/bin/env node
/**
 * clihub CLI entrypoint. Uses cac for argument parsing; delegates all
 * domain logic to @clihub/core.
 */
import { cac } from 'cac';
import kleur from 'kleur';

import {
  BackupManager,
  CatalogLoader,
  ClaudeCodeSkillAdapter,
  getProvider,
  listProviders,
  t,
} from '@clihub/core';
import os from 'node:os';
import path from 'node:path';

const cli = cac('clihub');
const catalog = new CatalogLoader();
const backups = new BackupManager();
const skillAdapter = new ClaudeCodeSkillAdapter();

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
  .command('doctor [id]', 'Check health of installed tools')
  .action(async (id?: string) => {
    const targets = id ? [getProvider(id)].filter(Boolean) : listProviders();
    let total = 0;
    for (const p of targets) {
      if (!p) continue;
      const report = await p.doctor();
      if (report.healthy) {
        ok(`${p.id}: ${t('doctor.healthy')}`);
      } else {
        warn(`${p.id}: ${t('doctor.issues', { count: report.issues.length })}`);
        for (const issue of report.issues) console.log(`    - ${issue}`);
        total += report.issues.length;
      }
    }
    if (total > 0) process.exit(1);
  });

// ─── skill <action> [id] ──────────────────────────────────────────────
cli
  .command('skill <action> [id]', 'Manage skills  (list | install | uninstall)')
  .action(async (action: string, id: string | undefined) => {
    switch (action) {
      case 'list': {
        const installed = await skillAdapter.list();
        if (installed.length === 0) { info(t('skill.list.empty')); return; }
        console.log(kleur.bold(t('skill.list.header')));
        for (const s of installed) {
          console.log(`  ${kleur.bold(s.id)}  ${s.name}  ${kleur.dim(s.version)}`);
        }
        return;
      }
      case 'install': {
        if (!id) { err('id required: clihub skill install <id>'); process.exit(1); }
        const skill = await catalog.findSkill(id);
        if (!skill) { err(t('skill.notFound', { skill: id })); process.exit(1); }
        info(t('skill.install.start', { skill: id }));
        try {
          await skillAdapter.install(skill, skill.source);
          ok(t('skill.install.done', { skill: id }));
        } catch (e) {
          err(t('skill.install.failed', { skill: id, reason: String(e) }));
          process.exit(1);
        }
        return;
      }
      case 'uninstall': {
        if (!id) { err('id required: clihub skill uninstall <id>'); process.exit(1); }
        info(t('skill.uninstall.start', { skill: id }));
        await skillAdapter.uninstall(id);
        ok(t('skill.uninstall.done', { skill: id }));
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
          info(t('skill.install.start', { skill: skillId }));
          await skillAdapter.install(skill, skill.source);
          ok(t('skill.install.done', { skill: skillId }));
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

    let method: 'npm' | 'bun' = 'npm';
    try {
      const { stdout } = await execFileP('npm', ['ls', '-g', '--depth=0', 'clihub']);
      if (stdout.includes('clihub')) method = 'npm';
    } catch {
      method = 'bun';
    }

    info(`Updating clihub via ${method}...`);
    try {
      if (method === 'npm') {
        await execFileP('npm', ['install', '-g', 'clihub@latest']);
      } else {
        await execFileP('bun', ['add', '-g', 'clihub@latest']);
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
cli.version('0.1.0');

cli.parse();
