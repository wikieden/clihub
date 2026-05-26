/**
 * Tool provider registry. v0.1 only ships claude-code; codex/kiro slot
 * in here in v0.2+.
 */
import type { ToolProvider } from './types.js';
import { claudeCodeProvider } from './providers/claude-code.js';

const providers: Record<string, ToolProvider> = {
  [claudeCodeProvider.id]: claudeCodeProvider,
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
