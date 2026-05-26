import type { ToolProvider } from './types.js';
import { claudeCodeProvider } from './providers/claude-code.js';
import { codexProvider } from './providers/codex.js';

const providers: Record<string, ToolProvider> = {
  [claudeCodeProvider.id]: claudeCodeProvider,
  [codexProvider.id]: codexProvider,
};

export function getProvider(id: string): ToolProvider | undefined {
  return providers[id];
}

export function listProviders(): ToolProvider[] {
  return Object.values(providers);
}

export function registerProvider(provider: ToolProvider): void {
  providers[provider.id] = provider;
}
