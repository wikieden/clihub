import type { ToolProvider } from './types.js';
import { claudeCodeProvider } from './providers/claude-code.js';
import { codexProvider } from './providers/codex.js';
import { kiroProvider } from './providers/kiro.js';
import { geminiProvider } from './providers/gemini.js';
import { cursorProvider } from './providers/cursor.js';
import { gooseProvider } from './providers/goose.js';
import { qwenProvider } from './providers/qwen.js';

const providers: Record<string, ToolProvider> = {
  [claudeCodeProvider.id]: claudeCodeProvider,
  [codexProvider.id]: codexProvider,
  [kiroProvider.id]: kiroProvider,
  [geminiProvider.id]: geminiProvider,
  [cursorProvider.id]: cursorProvider,
  [gooseProvider.id]: gooseProvider,
  [qwenProvider.id]: qwenProvider,
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
