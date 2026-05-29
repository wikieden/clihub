import { test, expect } from 'bun:test';
import { profileHook } from '../src/profile/hook.js';

test('bash hook wires PROMPT_COMMAND + reads clihub.yaml profile', () => {
  const h = profileHook('bash');
  expect(h).toContain('PROMPT_COMMAND');
  expect(h).toContain('clihub.yaml');
  expect(h).toContain('clihub profile use');
  expect(h).toContain('CLIHUB_ACTIVE_PROFILE');
});

test('zsh hook uses chpwd', () => {
  expect(profileHook('zsh')).toContain('add-zsh-hook chpwd');
});

test('fish hook uses --on-variable PWD', () => {
  expect(profileHook('fish')).toContain('--on-variable PWD');
});

test('unknown shell throws', () => {
  // @ts-expect-error invalid shell
  expect(() => profileHook('powershell')).toThrow();
});
