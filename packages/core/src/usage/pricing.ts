/**
 * Static token pricing — public list prices, used to ESTIMATE the dollar value
 * of locally-logged token usage. This is NOT your actual bill (subscriptions,
 * discounts, batch/cache nuances, and plan caps all change the real number);
 * it answers "at pay-as-you-go list prices, how much AI did I burn?".
 *
 * Rates are USD per 1,000,000 tokens. Keyed by model FAMILY so a drifting model
 * id (`claude-opus-4-8`, `gpt-5.5-codex`, …) still maps to a rate.
 *
 * Sources (list prices, refreshed with each clihub release):
 *   - Anthropic: Opus 15/75, Sonnet 3/15, Haiku 0.80/4; cache-write = 1.25×input,
 *     cache-read = 0.1×input.
 *   - OpenAI GPT-5 family: ~1.25 input / 10 output; cached input ~0.125.
 */
export interface Rate {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** Per-1M-token USD list prices, by model family. */
export const RATES: Record<string, Rate> = {
  'claude-opus': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-sonnet': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku': { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  // OpenAI GPT-5 family (Codex). cacheWrite is 0 — OpenAI doesn't bill cache writes.
  'gpt-5': { input: 1.25, output: 10, cacheWrite: 0, cacheRead: 0.125 },
};

/** Map a raw model id to a pricing family, or undefined when unknown. */
export function rateFamily(model: string): string | undefined {
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'claude-opus';
  if (m.includes('sonnet')) return 'claude-sonnet';
  if (m.includes('haiku')) return 'claude-haiku';
  if (m.includes('gpt-5') || m.includes('codex') || m.includes('gpt5')) return 'gpt-5';
  return undefined;
}

export interface ModelTokens {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * Estimate USD for a per-model token breakdown. Tokens on a model whose family
 * isn't in RATES contribute $0 (and are reported via `pricedFraction` so the UI
 * can flag "partial estimate").
 */
export function estimateCost(byModel: Record<string, ModelTokens>): { usd: number; pricedTokens: number; totalTokens: number } {
  let usd = 0;
  let pricedTokens = 0;
  let totalTokens = 0;
  for (const [model, t] of Object.entries(byModel)) {
    const tok = t.input + t.output + t.cacheWrite + t.cacheRead;
    totalTokens += tok;
    const fam = rateFamily(model);
    if (!fam) continue;
    const r = RATES[fam]!;
    usd += (t.input * r.input + t.output * r.output + t.cacheWrite * r.cacheWrite + t.cacheRead * r.cacheRead) / 1_000_000;
    pricedTokens += tok;
  }
  return { usd, pricedTokens, totalTokens };
}
