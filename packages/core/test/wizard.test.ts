import { test, expect } from 'bun:test';
import { planWizard, memoryTemplate } from '../src/wizard/index.js';
import { parseClihubYaml } from '../src/clihubyaml/full.js';

test('planWizard builds steps + parseable yaml', () => {
  const plan = planWizard({
    tools: ['claude-code', 'codex'],
    preset: 'python',
    proxy: 'http://proxy:8080',
    accounts: [{ profile: 'work', apiKeyNames: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] }, { profile: 'personal' }],
    schema: true,
    memory: true,
  });
  const joined = plan.steps.join('\n');
  expect(joined).toContain('Install CLIs: claude-code, codex');
  expect(joined).toContain('Apply preset: python');
  expect(joined).toContain('Set proxy');
  expect(joined).toContain('work (+ 2 keys: ANTHROPIC_API_KEY, OPENAI_API_KEY)');
  expect(joined).toContain('personal');

  const cfg = parseClihubYaml(plan.yaml);
  expect(cfg.tools.map((t) => t.id)).toEqual(['claude-code', 'codex']);
  expect(cfg.profile).toBe('work'); // first account is the active profile
  expect(cfg.presets).toContain('python');
  expect(plan.yaml.startsWith('# yaml-language-server')).toBe(true);
});

test('planWizard minimal answers default to claude-code', () => {
  const plan = planWizard({ tools: [] });
  expect(parseClihubYaml(plan.yaml).tools[0]!.id).toBe('claude-code');
  expect(plan.steps[0]).toContain('claude-code');
});

test('memoryTemplate mentions clihub memory generate', () => {
  expect(memoryTemplate()).toContain('clihub memory generate');
});
