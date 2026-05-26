/**
 * TUI main menu. Uses @clack/prompts for the interactive flow. Routes
 * back into the same @clihub/core APIs the CLI uses.
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

import {
  BackupManager,
  CatalogLoader,
  ClaudeCodeSkillAdapter,
  CodexSkillAdapter,
  GeminiCliSkillAdapter,
  KiroCliSkillAdapter,
  getProvider,
  listProviders,
  t,
  type SkillManifest,
  type SkillSyncAdapter,
} from '@clihub/core';

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

type Action =
  | 'tool.list'
  | 'tool.install'
  | 'skill.list'
  | 'skill.install'
  | 'preset.apply'
  | 'doctor'
  | 'backup'
  | 'exit';

export async function runTui(): Promise<void> {
  intro(kleur.bold().cyan(t('cli.title')));

  while (true) {
    const action = (await select({
      message: 'What would you like to do?',
      options: [
        { value: 'tool.list', label: 'List tools' },
        { value: 'tool.install', label: 'Install a tool' },
        { value: 'skill.list', label: 'List installed skills' },
        { value: 'skill.install', label: 'Install a skill' },
        { value: 'preset.apply', label: 'Apply a preset' },
        { value: 'doctor', label: 'Run doctor' },
        { value: 'backup', label: 'Backup ~/.claude' },
        { value: 'exit', label: 'Exit' },
      ],
    })) as Action | symbol;

    if (isCancel(action) || action === 'exit') {
      cancel('Bye');
      return;
    }

    try {
      await handle(action as Action);
    } catch (e) {
      log.error(String(e));
    }
  }
}

async function handle(action: Action): Promise<void> {
  switch (action) {
    case 'tool.list':
      for (const p of listProviders()) {
        const det = await p.detect();
        log.info(
          `${p.id}  ${p.name}  ${
            det.installed ? `✓ ${det.version ?? ''}` : 'not installed'
          }`,
        );
      }
      return;

    case 'tool.install': {
      const tools = listProviders();
      const choice = await select({
        message: 'Pick a tool (ESC = back)',
        options: [
          ...tools.map((p) => ({ value: p.id, label: p.name })),
          { value: '__back__', label: '← Back to main menu' },
        ],
      });
      if (isCancel(choice) || choice === '__back__') return;
      const provider = getProvider(choice as string);
      if (!provider) return;
      const s = spinner();
      s.start(t('tool.install.start', { tool: provider.id }));
      try {
        await provider.install({});
        s.stop(t('tool.install.done', { tool: provider.id }));
      } catch (e) {
        s.stop(t('tool.install.failed', { tool: provider.id, reason: String(e) }));
      }
      return;
    }

    case 'skill.list': {
      let any = false;
      for (const [toolId, factory] of Object.entries(ADAPTERS)) {
        const provider = getProvider(toolId);
        if (!provider) continue;
        const det = await provider.detect();
        if (!det.installed) continue;
        const installed = await factory().list();
        if (installed.length === 0) continue;
        any = true;
        log.info(`[${toolId}]`);
        for (const sk of installed) log.message(`  ${sk.id}  ${sk.name}  ${sk.version}`);
      }
      if (!any) log.info(t('skill.list.empty'));
      return;
    }

    case 'skill.install': {
      const { skills } = await catalog.load();
      const choice = await select({
        message: 'Pick a skill (ESC = back)',
        options: [
          ...skills.map((sk) => ({
            value: sk.id,
            label: `${sk.name} — ${sk.description}`,
          })),
          { value: '__back__', label: '← Back to main menu' },
        ],
      });
      if (isCancel(choice) || choice === '__back__') return;
      const skill = await catalog.findSkill(choice as string);
      if (!skill) return;
      const targets = await adaptersForSkill(skill);
      if (targets.length === 0) { log.warn(`No installed tools support skill ${skill.id}`); return; }
      const s = spinner();
      s.start(t('skill.install.start', { skill: skill.id }));
      for (const { toolId, adapter } of targets) {
        await adapter.install(skill, skill.source);
        log.step(`[${toolId}] installed`);
      }
      s.stop(t('skill.install.done', { skill: skill.id }));
      return;
    }

    case 'preset.apply': {
      const { presets } = await catalog.load();
      const choice = await select({
        message: 'Pick a preset (ESC = back)',
        options: [
          ...presets.map((p) => ({
            value: p.id,
            label: `${p.name} — ${p.description}`,
          })),
          { value: '__back__', label: '← Back to main menu' },
        ],
      });
      if (isCancel(choice) || choice === '__back__') return;
      const preset = await catalog.findPreset(choice as string);
      if (!preset) return;

      const toolLines = preset.tools.map((id) => {
        const p = getProvider(id);
        return `  • ${id}${p ? `  (${p.name})` : ''}`;
      });
      const skillPreviews: string[] = [];
      for (const skillId of preset.skills) {
        const skill = await catalog.findSkill(skillId);
        if (!skill) { skillPreviews.push(`  • ${skillId}  ${kleur.red('(missing in catalog)')}`); continue; }
        const targets = await adaptersForSkill(skill);
        const targetIds = targets.map((t) => t.toolId).join(', ') || kleur.dim('no installed tool supports it');
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
      return;
    }

    case 'doctor': {
      for (const p of listProviders()) {
        const r = await p.doctor();
        if (r.healthy) log.success(`${p.id}: ${t('doctor.healthy')}`);
        else {
          log.warn(`${p.id}: ${t('doctor.issues', { count: r.issues.length })}`);
          for (const i of r.issues) log.message(`  - ${i}`);
        }
      }
      return;
    }

    case 'backup': {
      const s = spinner();
      s.start('backing up');
      const entry = await backups.create({
        sourceDir: path.join(os.homedir(), '.claude'),
      });
      s.stop(t('backup.created', { path: entry.path }));
      return;
    }
  }
}
