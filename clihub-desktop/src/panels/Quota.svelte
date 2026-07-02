<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { QuotaResponse, QuotaSnapshot } from '../lib/types';

  const client = new DaemonClient();

  let snapshots = $state<QuotaSnapshot[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  // Some fetchers (Claude) spawn the vendor CLI under the hood and can take
  // tens of seconds — same live-network caveat as `clihub quota`.
  async function load() {
    loading = true;
    error = null;
    try {
      snapshots = (await client.get<QuotaResponse>('/v1/quota')).snapshots;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  function fmtReset(s?: number, label?: string): string {
    if (label) return label;
    if (s == null) return '';
    if (s <= 0) return 'now';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
</script>

<section>
  <h1>Quota</h1>
  <p class="hint">
    Live rate-limit rollup — mirrors <code>clihub quota</code>. Reuses each CLI's own sign-in
    (OAuth session, API key, or browser cookies); never prompts for credentials itself.
  </p>

  <div class="actions">
    <button onclick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
  </div>

  {#if error}<p class="error">{error}</p>{/if}

  {#each snapshots as s (s.tool)}
    <div class="tool">
      {#if !s.supported}
        <h2 class="dim">{s.label} <span class="small dim">({s.error ?? 'unavailable'})</span></h2>
      {:else}
        <h2>
          {s.label}
          {#if s.plan || s.account}
            <span class="small dim">({[s.plan, s.account].filter(Boolean).join(' · ')})</span>
          {/if}
        </h2>
        <table>
          <thead><tr><th>Window</th><th>Remaining</th><th>Resets</th></tr></thead>
          <tbody>
            {#each s.windows as w (w.id)}
              <tr class:low={w.remainingPercent <= 0}>
                <td>{w.label}</td>
                <td><strong>{w.remainingPercent}%</strong> left</td>
                <td class="small dim">{fmtReset(w.resetsInSeconds, w.resetLabel)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if s.credits}
          <p class="small dim">reset credits: {s.credits.available} available</p>
        {/if}
      {/if}
    </div>
  {/each}

  {#if !loading && snapshots.length === 0}<p class="dim small">No quota-capable CLI installed.</p>{/if}
</section>

<style>
  .hint {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin: 0.25rem 0 0.75rem;
  }
  .actions {
    margin: 0 0 0.75rem;
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
  tr.low td {
    background: var(--warn-bg);
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
