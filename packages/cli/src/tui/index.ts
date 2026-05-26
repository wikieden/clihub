/**
 * TUI main menu. Uses @clack/prompts for the interactive flow. Routes
 * back into the same @clihub/core APIs the CLI uses.
 */
import {
  cancel,
  intro,
  isCancel,
  log,
  outro,
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
        message: 'Pick a tool',
        options: tools.map((p) => ({ value: p.id, label: p.name })),
      });
      if (isCancel(choice)) return;
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
        message: 'Pick a skill',
        options: skills.map((sk) => ({
          value: sk.id,
          label: `${sk.name} — ${sk.description}`,
        })),
      });
      if (isCancel(choice)) return;
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
        message: 'Pick a preset',
        options: presets.map((p) => ({
          value: p.id,
          label: `${p.name} — ${p.description}`,
        })),
      });
      if (isCancel(choice)) return;
      const preset = await catalog.findPreset(choice as string);
      if (!preset) return;
      const s = spinner();
      s.start(t('preset.applying', { preset: preset.id }));
      for (const toolId of preset.tools) {
        const provider = getProvider(toolId);
        if (!provider) continue;
        const det = await provider.detect();
        if (!det.installed) await provider.install({});
      }
      for (const skillId of preset.skills) {
        const skill = await catalog.findSkill(skillId);
        if (!skill) continue;
        const targets = await adaptersForSkill(skill);
        for (const { adapter } of targets) await adapter.install(skill, skill.source);
      }
      s.stop(t('preset.applied', { preset: preset.id }));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  runTui().then(() => outro('done'));
}
