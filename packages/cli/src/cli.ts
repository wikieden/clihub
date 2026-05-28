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
  ClaudeCodePluginAdapter,
  ClaudeCodeSkillAdapter,
  CodexSkillAdapter,
  GeminiCliSkillAdapter,
  KiroCliSkillAdapter,
  getProvider,
  listProviders,
  type PluginAdapter,
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

const PLUGIN_ADAPTERS: Record<string, () => PluginAdapter> = {
  'claude-code': () => new ClaudeCodePluginAdapter(),
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

/**
 * Resolve a skill id into a SkillManifest. The id can be:
 *   · a catalog key (e.g. "tdd") — looked up in CatalogLoader
 *   · a git URL (https://..., git@..., or http://...) — cloned, SKILL.md parsed
 *   · a local path (./foo, /abs/path, ~/path) — SKILL.md read directly
 */
async function resolveSkillFromId(id: string): Promise<SkillManifest | undefined> {
  const isGitUrl = /^(https?:\/\/|git@|git:\/\/|ssh:\/\/)/.test(id) || id.endsWith('.git');
  const isPath = id.startsWith('./') || id.startsWith('../') || id.startsWith('/') || id.startsWith('~');

  if (isGitUrl) {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { createHash } = await import('node:crypto');
    const { promises: fsP } = await import('node:fs');
    const exec = promisify(execFile);
    const { discoverSkillMdRepo } = await import('@clihub/core');

    const cacheRoot = path.join(os.homedir(), '.clihub', 'skill-md-cache');
    const hash = createHash('sha1').update(id).digest('hex').slice(0, 12);
    const cloneDir = path.join(cacheRoot, hash);
    await fsP.mkdir(cacheRoot, { recursive: true });

    const exists = await fsP.access(path.join(cloneDir, '.git')).then(() => true).catch(() => false);
    if (exists) {
      info(`updating cached clone at ${cloneDir}`);
      await exec('git', ['-C', cloneDir, 'pull', '--ff-only']);
    } else {
      info(`cloning ${id} → ${cloneDir}`);
      await exec('git', ['clone', '--depth=1', id, cloneDir]);
    }

    const found = await discoverSkillMdRepo(cloneDir);
    if (!found) {
      err(`No SKILL.md found in ${id}`);
      return undefined;
    }
    return found.manifest;
  }

  if (isPath) {
    const { discoverSkillMdRepo, manifestFromSkillMd, findSkillMd } = await import('@clihub/core');
    const { promises: fsP } = await import('node:fs');
    const expanded = id.startsWith('~') ? path.join(os.homedir(), id.slice(1)) : path.resolve(id);
    const stat = await fsP.stat(expanded).catch(() => undefined);
    if (!stat) {
      err(`Path not found: ${expanded}`);
      return undefined;
    }
    if (stat.isFile() && /SKILL\.md$/i.test(expanded)) {
      return manifestFromSkillMd(expanded);
    }
    if (stat.isDirectory()) {
      const found = await discoverSkillMdRepo(expanded);
      if (!found) {
        err(`No SKILL.md found under ${expanded}`);
        return undefined;
      }
      return found.manifest;
    }
    err(`Unsupported path: ${expanded}`);
    return undefined;
  }

  return catalog.findSkill(id);
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
  .option('--fix', 'Attempt to auto-remediate common issues (missing dirs, etc.)')
  .option('--check-network', 'Probe each vendor API host through the resolved proxy')
  .action(async (
    id: string | undefined,
    opts: { json?: boolean; fix?: boolean; checkNetwork?: boolean },
  ) => {
    const {
      runHealthMatrix,
      attemptAutoRepair,
      probeNetwork,
    } = await import('@clihub/core');
    let rows = await runHealthMatrix();
    if (id) rows = rows.filter((r) => r.id === id);

    let repair: Awaited<ReturnType<typeof attemptAutoRepair>> | undefined;
    if (opts.fix) {
      repair = await attemptAutoRepair(rows);
      // Re-read after fixing so the table reflects the new state.
      rows = await runHealthMatrix();
      if (id) rows = rows.filter((r) => r.id === id);
    }

    let probes: Awaited<ReturnType<typeof probeNetwork>> | undefined;
    if (opts.checkNetwork) {
      probes = await probeNetwork();
    }

    if (opts.json) {
      console.log(JSON.stringify({ rows, repair, probes }, null, 2));
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

    if (repair && repair.attempted.length > 0) {
      console.log();
      console.log(kleur.bold('repair:'));
      for (const a of repair.attempted) {
        const mark = a.ok ? kleur.green('✓') : kleur.red('✗');
        console.log(`  ${mark} [${a.toolId}] ${a.action}${a.detail ? ` — ${a.detail}` : ''}`);
      }
    }

    if (probes && probes.length > 0) {
      console.log();
      console.log(kleur.bold('network:'));
      for (const p of probes) {
        const proxyTag = p.proxy ? kleur.dim(`(via ${p.proxy})`) : kleur.dim('(direct)');
        if (p.error) {
          console.log(`  ${kleur.red('✗')} [${p.toolId}] ${p.host} ${proxyTag} — ${p.error}`);
        } else {
          const status = p.status && p.status < 500 ? kleur.green(String(p.status)) : kleur.yellow(String(p.status));
          console.log(`  ${kleur.green('✓')} [${p.toolId}] ${p.host} ${proxyTag} → ${status} ${kleur.dim(`${p.latencyMs}ms`)}`);
        }
      }
    }

    let problems = 0;
    for (const r of rows) {
      if (r.installed && r.issues.length > 0) {
        warn(`${r.id}: ${t('doctor.issues', { count: r.issues.length })}`);
        for (const issue of r.issues) console.log(`    - ${issue}`);
        problems += r.issues.length;
      }
    }
    if (problems > 0 && !opts.fix) process.exit(1);
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
        if (!id) { err('id required: clihub skill install <id|git-url|path>'); process.exit(1); }
        const skill = await resolveSkillFromId(id);
        if (!skill) { err(t('skill.notFound', { skill: id })); process.exit(1); }
        const targets = opts.tool
          ? (() => {
              const factory = ADAPTERS[opts.tool!];
              return factory ? [{ toolId: opts.tool!, adapter: factory() }] : [];
            })()
          : await adaptersForSkill(skill);
        if (targets.length === 0) {
          warn(`No installed tools support skill ${skill.id}`);
          return;
        }
        for (const { toolId, adapter } of targets) {
          info(`[${toolId}] ${t('skill.install.start', { skill: skill.id })}`);
          try {
            await adapter.install(skill, skill.source);
            ok(`[${toolId}] ${t('skill.install.done', { skill: skill.id })}`);
          } catch (e) {
            err(`[${toolId}] ${t('skill.install.failed', { skill: skill.id, reason: String(e) })}`);
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

// ─── plugin <action> [id] ─────────────────────────────────────────────
cli
  .command('plugin <action> [id]', 'Manage plugins  (list | install | uninstall | update)')
  .option('--tool <tool>', 'Limit to a specific CLI', { default: 'claude-code' })
  .action(async (action: string, id: string | undefined, opts: { tool: string }) => {
    const factory = PLUGIN_ADAPTERS[opts.tool];
    if (!factory) {
      err(`Plugins not yet supported for tool: ${opts.tool}. Currently supported: ${Object.keys(PLUGIN_ADAPTERS).join(', ')}`);
      process.exit(1);
    }
    const adapter = factory();

    switch (action) {
      case 'list': {
        const installed = await adapter.list();
        if (installed.length === 0) {
          info(`No plugins installed for ${opts.tool} (root: ${adapter.rootDir()})`);
          return;
        }
        console.log(kleur.bold(`[${opts.tool}] plugins (${installed.length}):`));
        for (const p of installed) {
          console.log(`  ${kleur.bold(p.id)}  ${kleur.dim(p.version)}  ${kleur.dim(p.path)}`);
        }
        return;
      }
      case 'install': {
        if (!id) { err('id required: clihub plugin install <id>'); process.exit(1); }
        const plugin = await catalog.findPlugin(id);
        if (!plugin) { err(`Plugin not found in catalog: ${id}`); process.exit(1); }
        if (!plugin.supports[opts.tool]) {
          err(`Plugin ${id} does not declare support for ${opts.tool}`);
          process.exit(1);
        }
        info(`[${opts.tool}] cloning ${plugin.source} → ${path.join(adapter.rootDir(), plugin.id)}`);
        try {
          await adapter.install(plugin);
          ok(`[${opts.tool}] plugin ${id} installed`);
        } catch (e) {
          err(`[${opts.tool}] plugin ${id} install failed: ${String(e)}`);
          process.exit(1);
        }
        return;
      }
      case 'uninstall': {
        if (!id) { err('id required: clihub plugin uninstall <id>'); process.exit(1); }
        await adapter.uninstall(id);
        ok(`[${opts.tool}] plugin ${id} removed`);
        return;
      }
      case 'update': {
        if (!id) { err('id required: clihub plugin update <id>'); process.exit(1); }
        try {
          await adapter.update(id);
          ok(`[${opts.tool}] plugin ${id} updated`);
        } catch (e) {
          err(`[${opts.tool}] plugin ${id} update failed: ${String(e)}`);
          process.exit(1);
        }
        return;
      }
      default:
        err(`Unknown plugin action: ${action}. Valid: list | install | uninstall | update`);
        process.exit(1);
    }
  });

// ─── catalog <action> [url] ───────────────────────────────────────────
cli
  .command('catalog <action> [url]', 'Manage the local catalog  (sync | status | verify)')
  .action(async (action: string, url: string | undefined) => {
    const {
      syncCatalog,
      readCatalogManifest,
      verifyCatalog,
      defaultCatalogDir,
      DEFAULT_CATALOG_URL,
    } = await import('@clihub/core');
    const dir = defaultCatalogDir();

    switch (action) {
      case 'sync': {
        const src = url ?? DEFAULT_CATALOG_URL;
        info(`Syncing catalog from ${src} → ${dir}`);
        try {
          const result = await syncCatalog({ url: src });
          ok(`catalog synced (${result.files.length} files)`);
          for (const f of result.files) {
            console.log(`  ${kleur.dim(f.sha256.slice(0, 12))}  ${f.name}  ${kleur.dim(`${f.bytes}b`)}`);
          }
          info(`last sync: ${result.manifest.lastSync}`);
        } catch (e) {
          err(`sync failed: ${String(e)}`);
          process.exit(1);
        }
        return;
      }
      case 'status': {
        const manifest = await readCatalogManifest(dir);
        if (!manifest) {
          info(`No synced catalog at ${dir}. Currently serving the bundled catalog.`);
          info(`Run \`clihub catalog sync\` to pull from ${DEFAULT_CATALOG_URL}`);
          return;
        }
        console.log(kleur.bold('Synced catalog'));
        console.log(`  dir:        ${dir}`);
        console.log(`  source:     ${manifest.source}`);
        console.log(`  last sync:  ${manifest.lastSync}`);
        if (manifest.version) console.log(`  version:    ${manifest.version}`);
        console.log(`  files:`);
        for (const [name, sum] of Object.entries(manifest.checksums)) {
          console.log(`    ${kleur.dim(sum?.slice(0, 19) ?? '?')}  ${name}`);
        }
        return;
      }
      case 'verify': {
        const bad = await verifyCatalog(dir);
        if (bad.length === 0) {
          ok('catalog checksums match manifest');
          return;
        }
        err(`checksum mismatch: ${bad.join(', ')}`);
        process.exit(1);
      }
      default:
        err(`Unknown catalog action: ${action}. Valid: sync | status | verify`);
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
  .command('config <action> [key] [value]', 'Show or edit clihub config  (show | get | set | unset)')
  .action(async (action: string, keyOrTool: string | undefined, value: string | undefined) => {
    const {
      loadConfig,
      setConfigKey,
      getConfigKey,
      defaultConfigPath,
    } = await import('@clihub/core');

    switch (action) {
      case 'show': {
        const cfg = await loadConfig();
        console.log(kleur.bold(`── clihub global (${defaultConfigPath()}) ──`));
        console.log(JSON.stringify(cfg, null, 2));
        const targets = keyOrTool ? [getProvider(keyOrTool)].filter(Boolean) : listProviders();
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
        return;
      }
      case 'get': {
        if (!keyOrTool) { err('key required: clihub config get <key>'); process.exit(1); }
        const cfg = await loadConfig();
        const v = getConfigKey(cfg, keyOrTool);
        if (v === undefined) {
          info(`${keyOrTool}: (unset)`);
          return;
        }
        console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
        return;
      }
      case 'set': {
        if (!keyOrTool || value === undefined) {
          err('usage: clihub config set <key> <value>');
          process.exit(1);
        }
        await setConfigKey(keyOrTool, value);
        ok(`${keyOrTool} = ${value}`);
        return;
      }
      case 'unset': {
        if (!keyOrTool) { err('key required: clihub config unset <key>'); process.exit(1); }
        await setConfigKey(keyOrTool, undefined);
        ok(`${keyOrTool} unset`);
        return;
      }
      default:
        err(`Unknown config action: ${action}. Valid: show | get | set | unset`);
        process.exit(1);
    }
  });

// ─── proxy ────────────────────────────────────────────────────────────
cli
  .command('proxy <action> [url]', 'Manage proxy + CA bundle  (set | unset | show | test)')
  .option('--tool <id>', 'Limit to a specific CLI (default: all)')
  .option('--ca-bundle <path>', 'Set CA bundle path along with the proxy')
  .action(async (
    action: string,
    url: string | undefined,
    opts: { tool?: string; caBundle?: string },
  ) => {
    const {
      loadConfig,
      setConfigKey,
      resolveProxy,
      proxyEnvVector,
      defaultConfigPath,
      formatErrorMessage,
    } = await import('@clihub/core');

    switch (action) {
      case 'show': {
        const cfg = await loadConfig();
        console.log(kleur.bold(`proxy (from ${defaultConfigPath()}):`));
        console.log(JSON.stringify(cfg.proxy ?? {}, null, 2));
        if (cfg.caBundle) console.log(`ca-bundle: ${cfg.caBundle}`);
        const sample = resolveProxy('https://api.anthropic.com', cfg);
        if (sample) info(`effective proxy for https://api.anthropic.com → ${sample}`);
        return;
      }
      case 'set': {
        if (!url) {
          err('usage: clihub proxy set <url> [--ca-bundle <path>] [--tool <id>]');
          process.exit(1);
        }
        try {
          // eslint-disable-next-line no-new
          new URL(url);
        } catch {
          err(formatErrorMessage('CLIHUB-E-100', url));
          process.exit(1);
        }
        const isHttps = url.toLowerCase().startsWith('https://');
        if (url.startsWith('socks')) {
          await setConfigKey('proxy.all', url);
        } else if (isHttps) {
          await setConfigKey('proxy.https', url);
        } else {
          await setConfigKey('proxy.http', url);
        }
        if (opts.caBundle) await setConfigKey('caBundle', opts.caBundle);
        ok(`proxy set → ${url}${opts.tool ? ` (scope: ${opts.tool})` : ''}`);
        info('Restart any running CLIs (claude, codex, gemini, kiro) to pick this up.');
        return;
      }
      case 'unset': {
        await setConfigKey('proxy', undefined);
        ok('proxy cleared from clihub config');
        return;
      }
      case 'test': {
        const cfg = await loadConfig();
        const env = { ...process.env, ...proxyEnvVector(cfg) } as NodeJS.ProcessEnv;
        const targets = [
          'https://registry.npmjs.org/-/ping',
          'https://api.anthropic.com',
          'https://api.openai.com',
        ];
        for (const target of targets) {
          const proxy = resolveProxy(target, cfg, env);
          process.stdout.write(`  ${target}  (proxy: ${proxy ?? 'direct'}) ... `);
          try {
            const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
            console.log(`${res.status} ${res.statusText || ''}`);
          } catch (e) {
            console.log(`✗ ${String(e)}`);
          }
        }
        return;
      }
      default:
        err(`Unknown proxy action: ${action}. Valid: set | unset | show | test`);
        process.exit(1);
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

// ─── search <query> ───────────────────────────────────────────────────
cli
  .command('search <query>', 'Search the catalog (skills + plugins + MCP + presets + tools)')
  .option('--json', 'Output as JSON instead of a table')
  .action(async (query: string, opts: { json?: boolean }) => {
    const { searchCatalog } = await import('@clihub/core');
    const hits = await searchCatalog(query);
    if (opts.json) {
      console.log(JSON.stringify(hits, null, 2));
      return;
    }
    if (hits.length === 0) {
      info(`No matches for "${query}"`);
      return;
    }
    const CAT_COLOR: Record<string, (s: string) => string> = {
      skill: kleur.cyan,
      plugin: kleur.magenta,
      mcp: kleur.yellow,
      preset: kleur.green,
      tool: kleur.blue,
    };
    for (const h of hits) {
      const tag = (CAT_COLOR[h.category] ?? kleur.white)(`[${h.category}]`);
      console.log(`${tag}  ${kleur.bold(h.id)}  ${kleur.dim(`(${h.score})`)}  ${h.name}`);
      if (h.description) console.log(`        ${kleur.dim(h.description)}`);
    }
    info(`${hits.length} result(s) for "${query}"`);
  });

// ─── watch ────────────────────────────────────────────────────────────
cli
  .command('watch', 'Watch each installed CLI for setting changes; auto-backup on change')
  .option('--debounce <ms>', 'Debounce window in ms', { default: 5000 })
  .option('--tool <id>', 'Watch only one tool')
  .action(async (opts: { debounce: number; tool?: string }) => {
    const { startWatch } = await import('@clihub/core');
    const handle = await startWatch({
      debounceMs: Number(opts.debounce) || 5000,
      toolIds: opts.tool ? [opts.tool] : undefined,
    });
    info('Watching for changes. Press Ctrl+C to stop.');
    const cleanup = async () => {
      info('Stopping watcher...');
      await handle.stop();
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    for await (const ev of handle.events()) {
      if (ev.error) {
        warn(`[${ev.toolId}] ${ev.reason}: ${ev.error}`);
      } else if (ev.reason === 'initial') {
        info(`[${ev.toolId}] watching ${ev.file}`);
      } else {
        ok(`[${ev.toolId}] ${ev.reason} → backup ${ev.backupId ?? '?'}`);
      }
    }
  });

// ─── completion <shell> ───────────────────────────────────────────────
cli
  .command(
    'completion <shell>',
    'Print shell completion script (bash | zsh | fish | powershell | man)',
  )
  .action(async (shell: string) => {
    if (shell === 'man') {
      const { generateMan } = await import('@clihub/core');
      process.stdout.write(generateMan(pkg.version));
      return;
    }
    const validShells = ['bash', 'zsh', 'fish', 'powershell'] as const;
    if (!(validShells as readonly string[]).includes(shell)) {
      err(`Unknown shell: ${shell}. Valid: ${validShells.join(' | ')} | man`);
      process.exit(1);
    }
    const { generateCompletion } = await import('@clihub/core');
    process.stdout.write(generateCompletion(shell as (typeof validShells)[number]));
  });

// ─── default → TUI ────────────────────────────────────────────────────
cli.command('', t('cli.title')).action(async () => {
  const { runTui } = await import('./tui/index.js');
  await runTui();
});

cli.help();
cli.version(pkg.version);

cli.parse();
