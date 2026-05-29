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

/** Register declarative providers from ~/.clihub/providers.json + synced catalog. */
async function ensureProviders(allowScripts = false): Promise<void> {
  const { loadExternalProviders, defaultCatalogDir } = await import('@clihub/core');
  try {
    await loadExternalProviders({ catalogDir: defaultCatalogDir(), allowScripts });
  } catch {
    /* spec file errors shouldn't block built-in tools */
  }
}

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
  .option('--allow-scripts', 'Permit declarative providers that install via a shell command')
  .action(async (action: string, id: string | undefined, opts: { method?: string; dryRun?: boolean; allowScripts?: boolean }) => {
    await ensureProviders(opts.allowScripts);
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
        if (!id) { err('id required: clihub tool install <id>[@version]'); process.exit(1); }
        // Support `id@version` (e.g. claude-code@2.1.140). Scoped npm
        // names have no leading @ here since `id` is a clihub tool id.
        const at = id.lastIndexOf('@');
        const toolId = at > 0 ? id.slice(0, at) : id;
        const pinnedVersion = at > 0 ? id.slice(at + 1) : undefined;
        const provider = getProvider(toolId);
        if (!provider) { err(t('cli.unknownCommand', { cmd: `tool install ${toolId}` })); process.exit(1); }
        info(t('tool.install.start', { tool: toolId }) + (pinnedVersion ? ` @${pinnedVersion}` : ''));
        if (opts.dryRun) {
          info(t('tool.install.dryRun', { cmd: `${opts.method ?? 'npm'} install -g ${toolId}${pinnedVersion ? `@${pinnedVersion}` : ''}` }));
          return;
        }
        try {
          await provider.install({ method: opts.method as never, version: pinnedVersion, dryRun: false });
          ok(t('tool.install.done', { tool: toolId }));
          const { recordVersion, appendAudit } = await import('@clihub/core');
          const det = await provider.detect();
          const recorded = pinnedVersion ?? det.version ?? 'latest';
          await recordVersion(toolId, { version: recorded, method: opts.method ?? 'npm' });
          await appendAudit({ actor: 'cli', action: 'tool.install', tool: toolId, version: recorded });
        } catch (e) {
          err(t('tool.install.failed', { tool: toolId, reason: String(e) }));
          process.exit(1);
        }
        return;
      }
      case 'rollback': {
        if (!id) { err('id required: clihub tool rollback <id>'); process.exit(1); }
        const provider = getProvider(id);
        if (!provider) { err(t('cli.unknownCommand', { cmd: `tool rollback ${id}` })); process.exit(1); }
        const { readHistory, previousVersion, recordVersion, appendAudit } = await import('@clihub/core');
        const det = await provider.detect();
        const history = await readHistory(id);
        const target = previousVersion(history, det.version);
        if (!target) {
          err(`No prior version recorded for ${id}. clihub only knows versions it installed.`);
          process.exit(1);
        }
        info(`Rolling ${id} back: ${det.version ?? '?'} → ${target}`);
        try {
          await provider.install({ method: opts.method as never, version: target, dryRun: false });
          await recordVersion(id, { version: target, method: opts.method ?? 'npm', rolledBack: true });
          await appendAudit({ actor: 'cli', action: 'tool.rollback', tool: id, from: det.version ?? null, to: target });
          ok(`${id} rolled back to ${target}`);
        } catch (e) {
          err(`rollback failed: ${String(e)}`);
          process.exit(1);
        }
        return;
      }
      case 'history': {
        if (!id) { err('id required: clihub tool history <id>'); process.exit(1); }
        const { readHistory } = await import('@clihub/core');
        const history = await readHistory(id);
        if (history.records.length === 0) {
          info(`No version history for ${id}.`);
          return;
        }
        console.log(kleur.bold(`${id} version history:`));
        for (const r of history.records) {
          const tag = r.rolledBack ? kleur.yellow(' (rollback)') : '';
          console.log(`  ${r.version}  ${kleur.dim(r.at)}${tag}`);
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
        err(`Unknown tool action: ${action}. Valid: list | install | uninstall | update | rollback | history`);
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
    await ensureProviders();
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
  .command('skill <action> [id]', 'Manage skills  (list | install | uninstall | audit)')
  .option('--tool <tool>', 'Limit to a specific tool')
  .option('--loaded', 'For `list`: show skills actually on disk (default behaviour)')
  .option('--by-cli', 'For `list`: group by CLI (default behaviour)')
  .option('--permissions', 'For `list`/`audit`: flag shell / hooks / network / symlink risks')
  .option('--json', 'For `audit`: machine-readable output')
  .action(async (action: string, id: string | undefined, opts: { tool?: string; loaded?: boolean; byCli?: boolean; permissions?: boolean; json?: boolean }) => {
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
          let riskMap: Record<string, string[]> = {};
          if (opts.permissions) {
            const { auditSkills } = await import('@clihub/core');
            const audited = await auditSkills({ toolId });
            riskMap = Object.fromEntries(audited.map((a) => [a.id, a.risks]));
          }
          for (const s of installed) {
            const risks = riskMap[s.id];
            const riskTag = risks && risks.length > 0 ? `  ${kleur.yellow(`⚠ ${risks.join(',')}`)}` : '';
            console.log(`  ${kleur.bold(s.id)}  ${s.name}  ${kleur.dim(s.version)}${riskTag}`);
          }
        }
        if (!any) info(t('skill.list.empty'));
        return;
      }
      case 'audit': {
        const { auditSkills, auditSkill } = await import('@clihub/core');
        if (id) {
          const entry = await auditSkill(id, { toolId: opts.tool });
          if (!entry) { err(`skill not found among installed: ${id}`); process.exit(1); }
          if (opts.json) { console.log(JSON.stringify(entry, null, 2)); return; }
          console.log(kleur.bold(`${entry.id} (${entry.toolId})`));
          console.log(`  dir: ${kleur.dim(entry.dir)}`);
          if (entry.risks.length === 0) { console.log(`  ${kleur.green('no flagged risks')}`); return; }
          for (const r of entry.risks) {
            console.log(`  ${kleur.yellow('⚠')} ${r}: ${kleur.dim(entry.evidence[r] ?? '')}`);
          }
          return;
        }
        const all = await auditSkills({ toolId: opts.tool });
        if (opts.json) { console.log(JSON.stringify(all, null, 2)); return; }
        const flagged = all.filter((a) => a.risks.length > 0);
        if (all.length === 0) { info('no installed skills found'); return; }
        console.log(kleur.bold(`Audited ${all.length} skill(s); ${flagged.length} flagged:`));
        for (const a of flagged) {
          console.log(`  ${kleur.bold(a.id)} ${kleur.dim(`[${a.toolId}]`)}  ${kleur.yellow(a.risks.join(', '))}`);
          for (const r of a.risks) {
            if (a.evidence[r]) console.log(`      ${kleur.dim(`${r}: ${a.evidence[r]}`)}`);
          }
        }
        if (flagged.length === 0) console.log(`  ${kleur.green('nothing flagged')}`);
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
        err(`Unknown skill action: ${action}. Valid: list | install | uninstall | audit`);
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

// ─── catalog <action> [arg1] [arg2] ───────────────────────────────────
cli
  .command('catalog <action> [arg1] [arg2] [arg3]', 'Manage catalogs (sync | status | verify | add | remove | list | priority | sync-all | keygen | sign | trust)')
  .option('--source <url>', 'trust add: bind the key to a catalog source URL prefix')
  .action(async (action: string, arg1: string | undefined, arg2: string | undefined, arg3: string | undefined, opts: { source?: string }) => {
    const {
      syncCatalog,
      readCatalogManifest,
      verifyCatalog,
      verifyCatalogSignature,
      signCatalogDir,
      generateCatalogKeypair,
      addTrustedKey,
      removeTrustedKey,
      listTrustedKeys,
      defaultCatalogDir,
      DEFAULT_CATALOG_URL,
      addCatalogSource,
      removeCatalogSource,
      setSourcePriority,
      syncAllSources,
      readSources,
    } = await import('@clihub/core');
    const dir = defaultCatalogDir();
    const url = arg1;

    switch (action) {
      // ── federation ──
      case 'add': {
        const name = arg1;
        const srcUrl = arg2;
        if (!name || !srcUrl) { err('usage: clihub catalog add <name> <url>'); process.exit(1); }
        info(`Adding source "${name}" → ${srcUrl}`);
        try {
          const { source, sync } = await addCatalogSource(name, srcUrl);
          ok(`source "${source.name}" added (priority ${source.priority}, ${sync.files.length} files)`);
        } catch (e) {
          err(`add failed: ${String(e)}`);
          process.exit(1);
        }
        return;
      }
      case 'remove': {
        if (!arg1) { err('usage: clihub catalog remove <name>'); process.exit(1); }
        try {
          await removeCatalogSource(arg1);
          ok(`source "${arg1}" removed`);
        } catch (e) {
          err(String(e));
          process.exit(1);
        }
        return;
      }
      case 'list': {
        const data = await readSources();
        if (data.sources.length === 0) {
          info('No federated sources. `catalog add <name> <url>` to add one; otherwise the bundled/synced catalog is used.');
          return;
        }
        console.log(kleur.bold('Catalog sources (priority ascending; higher wins):'));
        for (const s of [...data.sources].sort((a, b) => a.priority - b.priority)) {
          console.log(`  ${kleur.bold(String(s.priority).padStart(3))}  ${s.name}  ${kleur.dim(s.url)}`);
        }
        return;
      }
      case 'priority': {
        const name = arg1;
        const n = arg2 ? Number(arg2) : NaN;
        if (!name || Number.isNaN(n)) { err('usage: clihub catalog priority <name> <number>'); process.exit(1); }
        try {
          await setSourcePriority(name, n);
          ok(`source "${name}" priority → ${n}`);
        } catch (e) {
          err(String(e));
          process.exit(1);
        }
        return;
      }
      case 'sync-all': {
        const results = await syncAllSources();
        if (results.length === 0) { info('No federated sources to sync.'); return; }
        for (const r of results) {
          if (r.ok) ok(`synced ${r.name}`);
          else err(`${r.name}: ${r.detail}`);
        }
        return;
      }
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
        if (bad.length > 0) { err(`checksum mismatch: ${bad.join(', ')}`); process.exit(1); }
        ok('catalog checksums match manifest');
        const sig = await verifyCatalogSignature(dir);
        if (!sig.signed) { warn(`signature: ${sig.reason}`); return; }
        if (sig.valid) { ok(`signature valid (key ${sig.keyId})`); return; }
        if (!sig.trusted) { warn(`signature: ${sig.reason}${sig.keyId ? ` (key ${sig.keyId})` : ''}`); return; }
        err(`signature INVALID: ${sig.reason}${sig.keyId ? ` (key ${sig.keyId})` : ''}`);
        process.exit(1);
      }
      // ── signing / trust ──
      case 'keygen': {
        const fsp = await import('node:fs/promises');
        const out = arg1 ?? process.cwd();
        const { publicKey, privateKey } = generateCatalogKeypair();
        const priv = path.join(out, 'clihub-catalog.key');
        const pub = path.join(out, 'clihub-catalog.pub');
        await fsp.writeFile(priv, privateKey, { mode: 0o600 });
        await fsp.writeFile(pub, publicKey, 'utf8');
        ok(`private key → ${priv}  ${kleur.red('(keep secret, never commit)')}`);
        ok(`public key  → ${pub}  (share + publish for users to trust)`);
        return;
      }
      case 'sign': {
        const keyFile = arg1;
        if (!keyFile) { err('usage: clihub catalog sign <private-key.pem> [public-key.pem]'); process.exit(1); }
        const fsp = await import('node:fs/promises');
        const priv = await fsp.readFile(keyFile, 'utf8');
        const pubFile = arg2 ?? keyFile.replace(/\.key$/, '.pub');
        const pub = await fsp.readFile(pubFile, 'utf8').catch(() => priv);
        try {
          const { keyId } = await signCatalogDir(dir, priv, pub);
          ok(`signed ${dir}/manifest.json (key ${keyId})`);
        } catch (e) {
          err(`sign failed: ${e instanceof Error ? e.message : String(e)}`);
          process.exit(1);
        }
        return;
      }
      case 'trust': {
        const sub = arg1;
        if (sub === 'list') {
          const keys = await listTrustedKeys();
          if (keys.length === 0) { info('no trusted catalog keys. `catalog trust add <name> <pubkey> [source-url]`'); return; }
          console.log(kleur.bold('Trusted catalog keys:'));
          for (const k of keys) console.log(`  ${k.keyId}  ${kleur.bold(k.name)}${k.source ? kleur.dim(`  ${k.source}`) : ''}`);
          return;
        }
        if (sub === 'rm' || sub === 'remove') {
          if (!arg2) { err('usage: clihub catalog trust rm <name>'); process.exit(1); }
          ok(await removeTrustedKey(arg2) ? `removed trusted key "${arg2}"` : `no trusted key named "${arg2}"`);
          return;
        }
        if (sub === 'add') {
          const name = arg2;
          const pubFile = arg3;
          if (!name || !pubFile) { err('usage: clihub catalog trust add <name> <pubkey.pem> [source-url]'); process.exit(1); }
          const fsp = await import('node:fs/promises');
          const pub = await fsp.readFile(pubFile, 'utf8');
          try {
            const entry = await addTrustedKey(name, pub, { source: opts.source });
            ok(`trusted "${entry.name}" (key ${entry.keyId})${entry.source ? kleur.dim(` for ${entry.source}`) : ''}`);
            if (!entry.source) info('tip: bind to a source with --source <url> so `catalog verify` matches it automatically.');
          } catch (e) {
            err(`trust failed: ${e instanceof Error ? e.message : String(e)}`);
            process.exit(1);
          }
          return;
        }
        err('usage: clihub catalog trust <add|list|rm> ...');
        process.exit(1);
        return;
      }
      default:
        err(`Unknown catalog action: ${action}. Valid: sync | status | verify | add | remove | list | priority | sync-all | keygen | sign | trust`);
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

// ─── profile ──────────────────────────────────────────────────────────
cli
  .command(
    'profile <action> [arg1] [arg2]',
    'Manage profiles (list | current | create | use | rm | clone | show)',
  )
  .option('--empty', 'For `create`: skip snapshotting host state, start blank')
  .option('--from <name>', 'For `create`: clone from another profile')
  .option('--force', 'For `use`: also archive existing real vendor dirs')
  .action(async (
    action: string,
    arg1: string | undefined,
    arg2: string | undefined,
    opts: { empty?: boolean; from?: string; force?: boolean },
  ) => {
    const {
      createProfile,
      useProfile,
      listProfiles,
      currentProfile,
      removeProfile,
      cloneProfile,
      readProfileMeta,
    } = await import('@clihub/core');

    switch (action) {
      case 'list': {
        const names = await listProfiles();
        const active = await currentProfile();
        if (names.length === 0) {
          info('No profiles. Run `clihub profile create <name>` to start.');
          return;
        }
        for (const n of names) {
          const marker = n === active ? kleur.green('●') : kleur.dim('○');
          console.log(`  ${marker} ${n}${n === active ? kleur.dim(' (active)') : ''}`);
        }
        return;
      }
      case 'current': {
        const active = await currentProfile();
        if (!active) {
          info('No profile active.');
          return;
        }
        console.log(active);
        return;
      }
      case 'create': {
        if (!arg1) { err('usage: clihub profile create <name> [--from <name>] [--empty]'); process.exit(1); }
        try {
          const meta = await createProfile(arg1, {
            cloneFrom: opts.from,
            empty: opts.empty,
          });
          ok(`profile "${meta.name}" created`);
        } catch (e) {
          err(String(e));
          process.exit(1);
        }
        return;
      }
      case 'use': {
        if (!arg1) { err('usage: clihub profile use <name>'); process.exit(1); }
        try {
          const {
            applyProfileBaseUrls,
            appendAudit,
            currentProfile: currentProfileFn,
          } = await import('@clihub/core');
          const previous = await currentProfileFn();
          const result = await useProfile(arg1, { force: opts.force });
          ok(`profile "${result.profile.name}" activated`);
          if (result.archived.length > 0) {
            info('archived (pre-existing) vendor dirs:');
            for (const a of result.archived) console.log(`    ${a}`);
          }
          const patches = await applyProfileBaseUrls(result.profile.name, result.profile.baseUrls);
          for (const p of patches) {
            if (p.applied) {
              info(`baseurl ${p.envVar} → ${p.filePath}`);
            } else if (p.detail) {
              warn(`baseurl ${p.envVar}: ${p.detail}`);
            }
          }
          await appendAudit({
            actor: 'cli',
            action: 'profile.use',
            from: previous ?? null,
            to: result.profile.name,
          });
        } catch (e) {
          err(String(e));
          process.exit(1);
        }
        return;
      }
      case 'baseurl': {
        // clihub profile baseurl set <provider> <url>
        // clihub profile baseurl unset <provider>
        // clihub profile baseurl show [profile]
        const {
          applyProfileBaseUrls,
          clearProfileBaseUrl,
          appendAudit,
          readProfileMeta: read,
          writeProfileMeta,
          currentProfile: currentProfileFn,
        } = await import('@clihub/core');
        const subAction = arg1;
        if (!subAction) { err('usage: clihub profile baseurl <set|unset|show> [...]'); process.exit(1); }
        if (subAction === 'show') {
          const target = arg2 ?? (await currentProfileFn());
          if (!target) { err('no active profile and no name given'); process.exit(1); }
          try {
            const meta = await read(target);
            console.log(JSON.stringify(meta.baseUrls ?? {}, null, 2));
          } catch (e) { err(String(e)); process.exit(1); }
          return;
        }
        const active = await currentProfileFn();
        if (!active) { err('no active profile. run `clihub profile use <name>` first.'); process.exit(1); }
        if (subAction === 'set') {
          const provider = arg2;
          // The URL is in the next positional arg; cac passes it via opts.url
          // if `--url=...` was used, otherwise it's the last bare positional.
          const positionalUrl = process.argv.slice(2).filter((a) => !a.startsWith('-')).pop();
          const finalUrl = positionalUrl && positionalUrl !== provider ? positionalUrl : undefined;
          if (!provider || !finalUrl) {
            err('usage: clihub profile baseurl set <anthropic|openai|google|kiro> <url>');
            process.exit(1);
          }
          if (!['anthropic', 'openai', 'google', 'kiro'].includes(provider)) {
            err(`unknown provider: ${provider}. valid: anthropic | openai | google | kiro`);
            process.exit(1);
          }
          const meta = await read(active);
          const nextBaseUrls = { ...(meta.baseUrls ?? {}), [provider]: finalUrl };
          await writeProfileMeta(active, { baseUrls: nextBaseUrls });
          const patches = await applyProfileBaseUrls(active, nextBaseUrls);
          for (const p of patches) {
            if (p.applied && p.provider === provider) {
              ok(`${provider} → ${finalUrl} written to ${p.filePath}`);
            } else if (!p.applied && p.detail) {
              warn(`${p.provider}: ${p.detail}`);
            }
          }
          await appendAudit({
            actor: 'cli',
            action: 'profile.baseurl.set',
            profile: active,
            provider,
            url: finalUrl,
          });
          return;
        }
        if (subAction === 'unset') {
          const provider = arg2;
          if (!provider) { err('usage: clihub profile baseurl unset <provider>'); process.exit(1); }
          const meta = await read(active);
          if (meta.baseUrls && provider in meta.baseUrls) {
            const next = { ...meta.baseUrls };
            delete (next as Record<string, unknown>)[provider];
            await writeProfileMeta(active, { baseUrls: next });
          }
          await clearProfileBaseUrl(active, provider as 'anthropic' | 'openai' | 'google' | 'kiro');
          ok(`baseurl for ${provider} cleared from profile ${active}`);
          await appendAudit({
            actor: 'cli',
            action: 'profile.baseurl.unset',
            profile: active,
            provider,
          });
          return;
        }
        err(`Unknown baseurl sub-action: ${subAction}. Valid: set | unset | show`);
        process.exit(1);
      }
      case 'rm': {
        if (!arg1) { err('usage: clihub profile rm <name>'); process.exit(1); }
        try {
          await removeProfile(arg1);
          ok(`profile "${arg1}" removed`);
        } catch (e) {
          err(String(e));
          process.exit(1);
        }
        return;
      }
      case 'clone': {
        if (!arg1 || !arg2) { err('usage: clihub profile clone <src> <dest>'); process.exit(1); }
        try {
          const meta = await cloneProfile(arg1, arg2);
          ok(`profile "${arg1}" cloned → "${meta.name}"`);
        } catch (e) {
          err(String(e));
          process.exit(1);
        }
        return;
      }
      case 'show': {
        if (!arg1) { err('usage: clihub profile show <name>'); process.exit(1); }
        try {
          const meta = await readProfileMeta(arg1);
          console.log(JSON.stringify(meta, null, 2));
        } catch (e) {
          err(String(e));
          process.exit(1);
        }
        return;
      }
      default:
        err(`Unknown profile action: ${action}. Valid: list | current | create | use | rm | clone | show`);
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

// ─── auth ─────────────────────────────────────────────────────────────
cli
  .command('auth <action> [key]', 'Manage per-profile secrets (set | get | list | rm | backend)')
  .option('--reveal', 'For `get`: print the secret in plaintext (default: masked)')
  .action(async (action: string, key: string | undefined, opts: { reveal?: boolean }) => {
    const {
      setSecret,
      getSecret,
      listSecrets,
      removeSecret,
      currentKeychain,
      currentProfile: currentProfileFn,
      appendAudit,
    } = await import('@clihub/core');

    if (action === 'backend') {
      const info = await currentKeychain();
      console.log(`${info.backend}  ${kleur.dim(info.detail)}`);
      return;
    }

    const profile = await currentProfileFn();
    if (!profile) {
      err('no active profile. run `clihub profile use <name>` first.');
      process.exit(1);
    }

    switch (action) {
      case 'set': {
        if (!key) { err('usage: clihub auth set <KEY>'); process.exit(1); }
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
        let value = '';
        if (process.stdin.isTTY) {
          process.stdout.write(`Value for ${key} (input hidden): `);
        }
        for await (const line of rl) {
          value = line;
          break;
        }
        if (!value) { err('no value read'); process.exit(1); }
        const info = await setSecret(profile, key, value);
        ok(`${key} stored via ${info.backend}`);
        await appendAudit({ actor: 'cli', action: 'auth.set', profile, key, backend: info.backend });
        return;
      }
      case 'get': {
        if (!key) { err('usage: clihub auth get <KEY> [--reveal]'); process.exit(1); }
        const v = await getSecret(profile, key);
        if (v === undefined) {
          info(`${key} not set in profile ${profile}`);
          return;
        }
        console.log(opts.reveal ? v : `${v.slice(0, 4)}…${v.slice(-2)} (${v.length} chars)`);
        return;
      }
      case 'list': {
        const keys = await listSecrets(profile);
        if (keys.length === 0) {
          info(`no secrets in profile ${profile}`);
          return;
        }
        for (const k of keys) console.log(`  ${k}`);
        return;
      }
      case 'rm': {
        if (!key) { err('usage: clihub auth rm <KEY>'); process.exit(1); }
        await removeSecret(profile, key);
        ok(`${key} removed from profile ${profile}`);
        await appendAudit({ actor: 'cli', action: 'auth.rm', profile, key });
        return;
      }
      default:
        err(`Unknown auth action: ${action}. Valid: set | get | list | rm | backend`);
        process.exit(1);
    }
  });

// ─── yaml ─────────────────────────────────────────────────────────────
cli
  .command('yaml', 'Show clihub.yaml metadata discovered by walking up from cwd')
  .action(async () => {
    const { loadClihubYaml } = await import('@clihub/core');
    const meta = await loadClihubYaml();
    if (!meta) {
      info('no clihub.yaml found in this directory or any parent');
      return;
    }
    console.log(JSON.stringify(meta, null, 2));
  });

// ─── init ─────────────────────────────────────────────────────────────
cli
  .command('init', 'Scaffold a clihub.yaml in the current directory')
  .option('--profile <name>', 'Set the profile: field')
  .option('--preset <id>', 'Seed with a preset')
  .option('--force', 'Overwrite an existing clihub.yaml')
  .action(async (opts: { profile?: string; preset?: string; force?: boolean }) => {
    const fsp = await import('node:fs/promises');
    const target = path.join(process.cwd(), 'clihub.yaml');
    const exists = await fsp.access(target).then(() => true).catch(() => false);
    if (exists && !opts.force) { err('clihub.yaml already exists (use --force to overwrite)'); process.exit(1); }
    const lines = [
      'version: 1',
      ...(opts.profile ? [`profile: ${opts.profile}`] : []),
      '',
      'tools:',
      '  - claude-code',
      '',
      'skills:',
      '  - superpowers',
      '',
      ...(opts.preset ? ['presets:', `  - ${opts.preset}`, ''] : ['presets: []', '']),
      'mcp: []',
      'plugins: []',
      '',
    ];
    await fsp.writeFile(target, lines.join('\n'), 'utf8');
    ok(`wrote ${target}`);
    info('edit it, then run `clihub apply --plan` to preview.');
  });

// ─── apply ────────────────────────────────────────────────────────────
cli
  .command('apply', 'Converge this machine to clihub.yaml')
  .option('--plan', 'Show the diff without applying')
  .option('--dry-run', 'Alias of --plan')
  .action(async (opts: { plan?: boolean; dryRun?: boolean }) => {
    await ensureProviders();
    const { findClihubYaml, parseClihubYaml, planApply, runApply, formatErrorMessage } = await import('@clihub/core');
    const fsp = await import('node:fs/promises');
    const file = await findClihubYaml();
    if (!file) { err(formatErrorMessage('CLIHUB-E-600')); process.exit(1); }
    const cfg = parseClihubYaml(await fsp.readFile(file, 'utf8'));

    if (opts.plan || opts.dryRun) {
      const plan = await planApply(cfg);
      console.log(kleur.bold(`plan from ${file}:`));
      for (const it of plan.items) {
        const mark = it.verb === 'add' ? kleur.green('+')
          : it.verb === 'upgrade' ? kleur.yellow('~')
          : it.verb === 'missing' ? kleur.red('!')
          : kleur.dim('=');
        console.log(`  ${mark} ${it.kind} ${kleur.bold(it.id)}${it.detail ? kleur.dim(`  (${it.detail})`) : ''}`);
      }
      info(`${plan.add} add, ${plan.upgrade} upgrade, ${plan.skip} skip, ${plan.missing} missing`);
      return;
    }

    info(`Applying ${file}...`);
    const result = await runApply(cfg);
    for (const d of result.done) ok(`${d.kind} ${d.id}${d.verb === 'skip' ? kleur.dim(' (already current)') : ''}`);
    for (const f of result.failed) err(`${f.kind} ${f.id}: ${f.error}`);
    if (result.failed.length > 0) process.exit(1);
  });

// ─── lock ─────────────────────────────────────────────────────────────
cli
  .command('lock', 'Generate clihub.lock.json from clihub.yaml')
  .action(async () => {
    await ensureProviders();
    const { findClihubYaml, parseClihubYaml, generateLockfile, writeLockfile, formatErrorMessage } = await import('@clihub/core');
    const fsp = await import('node:fs/promises');
    const file = await findClihubYaml();
    if (!file) { err(formatErrorMessage('CLIHUB-E-600')); process.exit(1); }
    const cfg = parseClihubYaml(await fsp.readFile(file, 'utf8'));
    const lock = await generateLockfile(cfg, pkg.version);
    const lockPath = path.join(path.dirname(file), 'clihub.lock.json');
    await writeLockfile(lock, lockPath);
    ok(`wrote ${lockPath}`);
    info(`tools: ${Object.keys(lock.tools).length}, skills: ${Object.keys(lock.skills).length}, mcp: ${Object.keys(lock.mcp).length}, plugins: ${Object.keys(lock.plugins).length}`);
  });

// ─── install [--frozen] ───────────────────────────────────────────────
cli
  .command('install', 'Install from clihub.yaml (or clihub.lock.json with --frozen)')
  .option('--frozen', 'Require clihub.lock.json and refuse drift')
  .action(async (opts: { frozen?: boolean }) => {
    await ensureProviders();
    const { findClihubYaml, parseClihubYaml, runApply, readLockfile, formatErrorMessage } = await import('@clihub/core');
    const fsp = await import('node:fs/promises');
    const file = await findClihubYaml();
    if (!file) { err(formatErrorMessage('CLIHUB-E-600')); process.exit(1); }
    const dir = path.dirname(file);
    if (opts.frozen) {
      const lock = await readLockfile(path.join(dir, 'clihub.lock.json'));
      if (!lock) { err(formatErrorMessage('CLIHUB-E-604', 'clihub.lock.json missing; run `clihub lock` first')); process.exit(1); }
      info(`Installing --frozen from clihub.lock.json (clihub ${lock.clihub})`);
    }
    const cfg = parseClihubYaml(await fsp.readFile(file, 'utf8'));
    const result = await runApply(cfg);
    for (const d of result.done) ok(`${d.kind} ${d.id}`);
    for (const f of result.failed) err(`${f.kind} ${f.id}: ${f.error}`);
    if (result.failed.length > 0) process.exit(1);
  });

// ─── sync ─────────────────────────────────────────────────────────────
async function syncPassphrase(confirm: boolean): Promise<string> {
  const env = process.env.CLIHUB_SYNC_PASSPHRASE;
  if (env) return env;
  const { password, isCancel } = await import('@clack/prompts');
  const p = await password({ message: 'Sync passphrase' });
  if (isCancel(p) || typeof p !== 'string' || !p) { err('passphrase required'); process.exit(1); }
  if (confirm) {
    const p2 = await password({ message: 'Confirm passphrase' });
    if (isCancel(p2) || p2 !== p) { err('passphrases do not match'); process.exit(1); }
  }
  return p;
}

cli
  .command('sync [action] [file]', 'Cross-machine encrypted config sync (export | import)')
  .option('--out <file>', 'export: output file (default: clihub-sync.txt)')
  .option('--plan', 'import: show the diff without writing')
  .option('--no-overwrite', 'import: keep local files that differ')
  .action(async (action: string | undefined, file: string | undefined, opts: { out?: string; plan?: boolean; overwrite?: boolean }) => {
    const { collectBundle, encryptBundle, decryptBundle, planRestore, applyRestore } = await import('@clihub/core');
    const fsp = await import('node:fs/promises');

    if (action === 'export') {
      const pass = await syncPassphrase(true);
      const bundle = await collectBundle(pkg.version);
      const out = opts.out ?? 'clihub-sync.txt';
      await fsp.writeFile(out, encryptBundle(bundle, pass), 'utf8');
      ok(`wrote ${out}  (${bundle.files.length} files${bundle.currentProfile ? `, profile ${bundle.currentProfile}` : ''})`);
      info(`encrypted with your passphrase. Move it to another machine, then: clihub sync import ${out}`);
      return;
    }

    if (action === 'import') {
      if (!file) { err('usage: clihub sync import <file>'); process.exit(1); }
      const pass = await syncPassphrase(false);
      let bundle;
      try {
        bundle = decryptBundle(await fsp.readFile(file, 'utf8'), pass);
      } catch (e) {
        err(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
      info(`bundle from clihub ${bundle.clihub}, generated ${bundle.generatedAt}`);
      if (opts.plan) {
        for (const it of await planRestore(bundle)) {
          const mark = it.verb === 'new' ? kleur.green('+') : it.verb === 'overwrite' ? kleur.yellow('~') : kleur.dim('=');
          console.log(`  ${mark} ${it.path}`);
        }
        return;
      }
      const res = await applyRestore(bundle, { noOverwrite: opts.overwrite === false });
      for (const w of res.written) if (w.verb !== 'same') ok(w.path);
      if (res.relinkedProfile) ok(`current profile → ${res.relinkedProfile}`);
      for (const f of res.failed) err(`${f.path}: ${f.error}`);
      if (res.failed.length > 0) process.exit(1);
      info('run `clihub profile use <name>` to materialise a profile, `clihub catalog sync-all` to refresh sources.');
      return;
    }

    err('usage: clihub sync <export|import> [file]');
    process.exit(1);
  });

// ─── memory ───────────────────────────────────────────────────────────
cli
  .command('memory [action]', 'Sync one memory source to every CLI (generate | plan)')
  .option('--user', 'Write user-level files (~/.claude, ~/.codex, ...) instead of project files')
  .option('--all', 'Include CLIs that are not installed')
  .option('--source <file>', 'Source markdown (default: clihub.memory.md → AGENTS.md → CLAUDE.md)')
  .option('--check', 'Exit non-zero if any file is out of date (CI); writes nothing')
  .action(async (action: string | undefined, opts: { user?: boolean; all?: boolean; source?: string; check?: boolean }) => {
    const { resolveMemorySource, planMemory, generateMemory } = await import('@clihub/core');
    const scope = opts.user ? 'user' : 'project';
    const src = await resolveMemorySource(process.cwd(), opts.source);
    if (!src) {
      err('no memory source found (looked for clihub.memory.md, AGENTS.md, CLAUDE.md)');
      info('create clihub.memory.md with your shared agent instructions, then re-run.');
      process.exit(1);
    }
    info(`source: ${src.file}`);
    const memOpts = { scope, all: opts.all } as const;

    if (action === 'plan' || opts.check) {
      const plan = await planMemory(src.body, memOpts);
      for (const it of plan) {
        const mark = it.verb === 'create' ? kleur.green('+')
          : it.verb === 'update' ? kleur.yellow('~')
          : it.verb === 'skip' ? kleur.dim('·')
          : kleur.dim('=');
        console.log(`  ${mark} ${it.label} ${kleur.dim(it.path)}${it.detail ? kleur.dim(`  (${it.detail})`) : ''}`);
      }
      const drift = plan.filter((i) => i.verb === 'create' || i.verb === 'update').length;
      info(`${drift} out of date, ${plan.filter((i) => i.verb === 'unchanged').length} current, ${plan.filter((i) => i.verb === 'skip').length} skipped`);
      if (opts.check && drift > 0) { err('memory files are out of date (run `clihub memory generate`)'); process.exit(1); }
      return;
    }

    const result = await generateMemory(src.body, memOpts);
    for (const w of result.written) {
      if (w.verb === 'skip') continue;
      ok(`${w.label} ${kleur.dim(w.path)}${w.verb === 'unchanged' ? kleur.dim(' (unchanged)') : ''}`);
    }
    for (const f of result.failed) err(`${f.tool} ${f.path}: ${f.error}`);
    if (result.failed.length > 0) process.exit(1);
  });

// ─── status ───────────────────────────────────────────────────────────
cli
  .command('status', 'Check this machine against clihub.lock.json (CI compliance gate)')
  .option('--json', 'Output the report as JSON')
  .option('--strict', 'Exit non-zero if not compliant (drift or missing)')
  .action(async (opts: { json?: boolean; strict?: boolean }) => {
    await ensureProviders();
    const { findClihubYaml, parseClihubYaml, readLockfile, computeStatus, formatErrorMessage } = await import('@clihub/core');
    const fsp = await import('node:fs/promises');
    const file = await findClihubYaml();
    if (!file) { err(formatErrorMessage('CLIHUB-E-600')); process.exit(1); }
    const cfg = parseClihubYaml(await fsp.readFile(file, 'utf8'));
    const lock = await readLockfile(path.join(path.dirname(file), 'clihub.lock.json'));
    const report = await computeStatus(cfg, lock);

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      if (!report.lockfile) warn('no clihub.lock.json — run `clihub lock` to pin versions for precise checks');
      for (const it of report.items) {
        const mark = it.state === 'ok' ? kleur.green('✓')
          : it.state === 'drift' ? kleur.yellow('~')
          : it.state === 'missing' ? kleur.red('✗')
          : kleur.dim('·');
        const ver = it.state === 'drift' ? kleur.dim(`  ${it.actual} → ${it.locked}`)
          : it.locked || it.actual ? kleur.dim(`  ${it.locked ?? it.actual}`) : '';
        console.log(`  ${mark} ${it.kind} ${kleur.bold(it.id)}${ver}${it.detail ? kleur.dim(`  (${it.detail})`) : ''}`);
      }
      info(`${report.ok} ok, ${report.drift} drift, ${report.missing} missing, ${report.unlocked} unlocked`);
      if (report.compliant) ok('compliant with clihub.lock.json'); else warn('NOT compliant — run `clihub install --frozen` to converge');
    }
    if (opts.strict && !report.compliant) process.exit(1);
  });

// ─── provider <action> [arg] ──────────────────────────────────────────
cli
  .command('provider <action> [arg]', 'Manage declarative providers (list | add <spec.json> | remove <id>)')
  .action(async (action: string, arg: string | undefined) => {
    const {
      loadExternalProviders,
      readProviderSpecsFile,
      parseProvidersJson,
      addProviderSpec,
      removeProviderSpec,
      defaultProvidersPath,
      defaultCatalogDir,
    } = await import('@clihub/core');

    switch (action) {
      case 'list': {
        const userSpecs = await readProviderSpecsFile();
        const res = await loadExternalProviders({ catalogDir: defaultCatalogDir() });
        if (res.registered.length === 0 && res.skipped.length === 0) {
          info(`no declarative providers. Add one: clihub provider add <spec.json>  (file: ${defaultProvidersPath()})`);
          return;
        }
        console.log(kleur.bold('Declarative providers:'));
        for (const id of res.registered) {
          const fromUser = userSpecs.some((s) => s.id === id);
          console.log(`  ${kleur.green('✓')} ${kleur.bold(id)}${kleur.dim(fromUser ? '  (user)' : '  (catalog)')}`);
        }
        for (const s of res.skipped) console.log(`  ${kleur.yellow('·')} ${s.id} ${kleur.dim(`— ${s.reason}`)}`);
        return;
      }
      case 'add': {
        if (!arg) { err('usage: clihub provider add <spec.json>'); process.exit(1); }
        const fsp = await import('node:fs/promises');
        let specs;
        try {
          specs = parseProvidersJson(await fsp.readFile(arg, 'utf8'));
        } catch (e) {
          err(`invalid spec: ${e instanceof Error ? e.message : String(e)}`);
          process.exit(1);
        }
        for (const s of specs) { await addProviderSpec(s); ok(`added provider "${s.id}" (${s.name})`); }
        info(`saved to ${defaultProvidersPath()} — verify with: clihub tool list`);
        return;
      }
      case 'remove': case 'rm': {
        if (!arg) { err('usage: clihub provider remove <id>'); process.exit(1); }
        ok(await removeProviderSpec(arg) ? `removed provider "${arg}"` : `no declarative provider "${arg}"`);
        return;
      }
      default:
        err(`Unknown provider action: ${action}. Valid: list | add | remove`);
        process.exit(1);
    }
  });

// ─── schema ───────────────────────────────────────────────────────────
cli
  .command('schema', 'Emit the clihub.yaml JSON Schema (for editor autocomplete + validation)')
  .option('--out <file>', 'Write to a file instead of stdout (e.g. clihub.schema.json)')
  .action(async (opts: { out?: string }) => {
    const { clihubYamlSchemaJson } = await import('@clihub/core');
    const json = clihubYamlSchemaJson();
    if (opts.out) {
      const fsp = await import('node:fs/promises');
      await fsp.writeFile(opts.out, json, 'utf8');
      ok(`wrote ${opts.out}`);
      info('add to clihub.yaml line 1:  # yaml-language-server: $schema=./' + path.basename(opts.out));
    } else {
      process.stdout.write(json);
    }
  });

// ─── team ─────────────────────────────────────────────────────────────
cli
  .command('team <action> [name] [arg]', 'Share clihub config via a git repo (add | list | pull | use | push | rm)')
  .option('--message <msg>', 'push: commit message')
  .action(async (action: string, name: string | undefined, arg: string | undefined, opts: { message?: string }) => {
    const { addTeam, listTeams, removeTeam, pullTeam, applyTeam, pushTeam, TEAM_FILES } = await import('@clihub/core');
    const cwd = process.cwd();
    try {
      switch (action) {
        case 'add': {
          if (!name || !arg) { err('usage: clihub team add <name> <git-url>'); process.exit(1); }
          const dir = await addTeam(name, arg);
          ok(`cloned team "${name}" → ${dir}`);
          info(`pull it into a project with: clihub team use ${name}`);
          return;
        }
        case 'list': {
          const teams = await listTeams();
          if (teams.length === 0) { info('no teams. `clihub team add <name> <git-url>`'); return; }
          console.log(kleur.bold('Teams:'));
          for (const t of teams) console.log(`  ${t}`);
          return;
        }
        case 'pull': {
          if (!name) { err('usage: clihub team pull <name>'); process.exit(1); }
          await pullTeam(name);
          ok(`pulled latest for "${name}"`);
          info(`apply into this project with: clihub team use ${name}`);
          return;
        }
        case 'use': {
          if (!name) { err('usage: clihub team use <name>'); process.exit(1); }
          await pullTeam(name).catch(() => {});
          const res = await applyTeam(name, cwd);
          if (res.files.length === 0) { warn(`team "${name}" has none of: ${TEAM_FILES.join(', ')}`); return; }
          for (const f of res.files) ok(`← ${f}`);
          info('run `clihub install --frozen` to converge to the team toolchain.');
          return;
        }
        case 'push': {
          if (!name) { err('usage: clihub team push <name> [--message <msg>]'); process.exit(1); }
          const res = await pushTeam(name, cwd, opts.message ?? '');
          for (const f of res.files) ok(`→ ${f}`);
          ok(`pushed team "${name}"`);
          return;
        }
        case 'rm':
        case 'remove': {
          if (!name) { err('usage: clihub team rm <name>'); process.exit(1); }
          ok(await removeTeam(name) ? `removed team "${name}"` : `no team named "${name}"`);
          return;
        }
        default:
          err(`Unknown team action: ${action}. Valid: add | list | pull | use | push | rm`);
          process.exit(1);
      }
    } catch (e) {
      err(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });

// ─── ci ───────────────────────────────────────────────────────────────
cli
  .command('ci [provider]', 'Generate a CI workflow that validates clihub.yaml (github | gitlab)')
  .option('--out <file>', 'Write to a file (default: stdout). github default path: .github/workflows/clihub.yml')
  .option('--node <version>', 'Node version for the runner (default 20)')
  .action(async (provider: string | undefined, opts: { out?: string; node?: string }) => {
    const { ciWorkflow, defaultCiPath, CI_PROVIDERS } = await import('@clihub/core');
    const prov = (provider ?? 'github') as 'github' | 'gitlab';
    if (!CI_PROVIDERS.includes(prov)) { err(`unknown provider "${prov}". Valid: ${CI_PROVIDERS.join(' | ')}`); process.exit(1); }
    const yaml = ciWorkflow(prov, { nodeVersion: opts.node });
    if (opts.out) {
      const fsp = await import('node:fs/promises');
      const out = opts.out;
      await fsp.mkdir(path.dirname(out), { recursive: true });
      await fsp.writeFile(out, yaml, 'utf8');
      ok(`wrote ${out}`);
      info(`conventional path: ${defaultCiPath(prov)}`);
    } else {
      process.stdout.write(yaml);
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
