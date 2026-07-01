<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { SyncPlanResponse, SyncGenerateResult } from '../lib/types';

  const client = new DaemonClient();

  let file = $state<string | null>(null);
  let plan = $state<SyncPlanResponse['plan']>([]);
  let result = $state<SyncGenerateResult | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function load() {
    error = null;
    try {
      const res = await client.get<SyncPlanResponse>('/v1/memory');
      file = res.file;
      plan = res.plan;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    load();
  });

  async function apply() {
    busy = true;
    error = null;
    try {
      result = await client.post<SyncGenerateResult>('/v1/memory/generate', {});
      await load();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const driftCount = $derived(plan.filter((p) => p.verb === 'create' || p.verb === 'update').length);
</script>

<section>
  <h1>Memory</h1>
  <p class="hint">
    Cross-CLI shared memory sync — mirrors <code>clihub memory generate</code>. Writes one managed
    block per CLI's instruction file (CLAUDE.md / AGENTS.md / GEMINI.md / …) from a single source
    (<code>clihub.memory.md</code> or a fallback already present), leaving your own hand-written
    text around the block untouched.
  </p>

  {#if error}<p class="error">{error}</p>{/if}

  {#if !file}
    <p class="muted">No memory source found (clihub.memory.md, AGENTS.md, CLAUDE.md).</p>
  {:else}
    <p class="status">source: <code>{file}</code></p>

    <table>
      <thead><tr><th>CLI</th><th>Target</th><th>Action</th></tr></thead>
      <tbody>
        {#each plan as p (p.tool)}
          <tr class:drift={p.verb === 'create' || p.verb === 'update'}>
            <td><strong>{p.label}</strong></td>
            <td class="mono small">{p.path}</td>
            <td>{p.verb}{p.detail ? ` — ${p.detail}` : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <div class="actions">
      {#if driftCount > 0}
        <button class="primary" onclick={apply} disabled={busy}>Sync now ({driftCount} out of date)</button>
      {:else}
        <p class="muted">Everything up to date.</p>
      {/if}
    </div>

    {#if result}
      <p class="status">
        written: {result.written.length ? result.written.map((w) => w.label).join(', ') : 'none'}
      </p>
      {#each result.failed as f (f.tool)}
        <p class="error">failed on {f.tool}: {f.error}</p>
      {/each}
    {/if}
  {/if}
</section>

<style>
  .hint {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin: 0.25rem 0 0.75rem;
  }
  td {
    vertical-align: middle;
  }
  tr.drift td {
    background: var(--warn-bg);
  }
  .actions {
    margin: 0.75rem 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  button.primary {
    border-color: var(--accent);
    background: var(--accent-bg);
    color: var(--accent-bright);
  }
  button.primary:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
  }
  .muted {
    color: var(--text-dim);
  }
  .small {
    font-size: 0.8rem;
  }
  .mono {
    font-family: var(--mono);
  }
  .error {
    color: var(--err);
  }
  .status {
    color: var(--ok);
  }
</style>
