<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { UsageResponse, UsageRow } from '../lib/types';

  const client = new DaemonClient();

  let rows = $state<UsageRow[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load() {
    loading = true;
    error = null;
    try {
      rows = (await client.get<UsageResponse>('/v1/usage')).rows;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  function fmtTokens(n?: number): string {
    if (!n) return '—';
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return String(n);
  }
  function fmtUsd(n?: number): string {
    if (!n) return '$0';
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
    if (n >= 1) return `$${n.toFixed(0)}`;
    return `$${n.toFixed(2)}`;
  }
  const SURFACE_LABEL: Record<string, string> = { cli: 'CLI', desktop: 'Desktop' };

  const total = $derived(rows.reduce((s, r) => s + (r.totalTokens ?? 0), 0));
  const totalUsd = $derived(rows.reduce((s, r) => s + (r.estCostUsd ?? 0), 0));
</script>

<section>
  <h1>Usage</h1>
  <p class="hint">
    Cross-CLI token rollup — mirrors <code>clihub usage</code>. Tokens-only, no live network call;
    reads each CLI's own local session logs. Costs are an estimate from published list prices.
  </p>

  <div class="actions">
    <button onclick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
    <span class="total">{fmtTokens(total)} tokens total · ~{fmtUsd(totalUsd)}</span>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#each rows as r (r.tool)}
    <div class="tool">
      {#if !r.supported}
        <h2 class="dim">{r.label} <span class="small dim">({r.note ?? 'not supported'})</span></h2>
      {:else}
        <h2>
          {r.label}
          {#if r.plan}<span class="small dim">({r.plan})</span>{/if}
        </h2>
        <table>
          <thead><tr><th>Surface</th><th>Input</th><th>Output</th><th>Cache</th><th>Total</th><th>Sessions</th><th>Est. cost</th></tr></thead>
          <tbody>
            {#if r.surfaces && r.surfaces.length > 0}
              {#each r.surfaces as s (s.surface)}
                <tr>
                  <td>{SURFACE_LABEL[s.surface] ?? s.surface}</td>
                  <td>{fmtTokens(s.inputTokens)}</td>
                  <td>{fmtTokens(s.outputTokens)}</td>
                  <td>{fmtTokens(s.cacheTokens)}</td>
                  <td><strong>{fmtTokens(s.totalTokens)}</strong></td>
                  <td>{s.sessions}</td>
                  <td>{fmtUsd(s.estCostUsd)}</td>
                </tr>
              {/each}
            {:else}
              <tr>
                <td>—</td>
                <td>{fmtTokens(r.inputTokens)}</td>
                <td>{fmtTokens(r.outputTokens)}</td>
                <td>{fmtTokens(r.cacheTokens)}</td>
                <td><strong>{fmtTokens(r.totalTokens)}</strong></td>
                <td>{r.sessions ?? '—'}</td>
                <td>{fmtUsd(r.estCostUsd)}</td>
              </tr>
            {/if}
          </tbody>
        </table>
        {#if r.partialCost}<p class="small dim">cost estimate is partial (some sessions missing pricing data)</p>{/if}
      {/if}
    </div>
  {/each}

  {#if !loading && rows.length === 0}<p class="dim small">No usage-capable CLI installed.</p>{/if}
</section>

<style>
  .hint {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin: 0.25rem 0 0.75rem;
  }
  .actions {
    margin: 0 0 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .total {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .tool {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
  .tool h2 {
    font-size: 0.9rem;
    margin: 0 0 0.35rem;
    color: var(--text);
  }
  .dim {
    color: var(--text-dim);
  }
  .small {
    font-size: 0.8rem;
  }
  .error {
    color: var(--err);
  }
</style>
