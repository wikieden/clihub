import type { ToolProvider } from './types.js';
import { claudeCodeProvider } from './providers/claude-code.js';
import { codexProvider } from './providers/codex.js';
import { kiroProvider } from './providers/kiro.js';
import { antigravityProvider } from './providers/antigravity.js';
import { cursorProvider } from './providers/cursor.js';
import { gooseProvider } from './providers/goose.js';
import { qwenProvider } from './providers/qwen.js';
import { opencodeProvider } from './providers/opencode.js';

const providers: Record<string, ToolProvider> = {
  [claudeCodeProvider.id]: claudeCodeProvider,
  [codexProvider.id]: codexProvider,
  [kiroProvider.id]: kiroProvider,
  [antigravityProvider.id]: antigravityProvider,
  [cursorProvider.id]: cursorProvider,
  [gooseProvider.id]: gooseProvider,
  [qwenProvider.id]: qwenProvider,
  [opencodeProvider.id]: opencodeProvider,
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
