<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { McpResponse, McpToolRow, McpReconcilePlan, McpReconcileResult } from '../lib/types';

  const client = new DaemonClient();

  let rows = $state<McpToolRow[]>([]);
  let plan = $state<McpReconcilePlan | null>(null);
  let applied = $state<McpReconcileResult | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function load() {
    try {
      rows = (await client.get<McpResponse>('/v1/mcp')).servers;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    load();
  });

  async function preview() {
    busy = true;
    error = null;
    applied = null;
    try {
      plan = await client.post<McpReconcilePlan>('/v1/mcp/reconcile', {});
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function apply() {
    busy = true;
    error = null;
    try {
      applied = await client.post<McpReconcileResult>('/v1/mcp/reconcile', { apply: true });
      // Re-run the preview so residual drift (e.g. a partially-failed promotion)
      // stays visible instead of silently looking converged.
      plan = await client.post<McpReconcilePlan>('/v1/mcp/reconcile', {});
      await load();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const failures = $derived(applied ? applied.results.flatMap((r) => r.failed) : []);
</script>

<section>
  <h1>MCP</h1>
  {#if error}<p class="error">{error}</p>{/if}

  {#each rows as row (row.tool)}
    <div class="tool">
      <h2>{row.tool}</h2>
      {#if row.servers.length === 0}
        <p class="muted">no servers</p>
      {:else}
        <ul>
          {#each row.servers as s (s.id)}<li><code>{s.id}</code></li>{/each}
        </ul>
      {/if}
    </div>
  {/each}

  <div class="actions">
    <button onclick={preview} disabled={busy}>Preview reconcile</button>
    {#if plan && plan.driftCount > 0}
      <button class="primary" onclick={apply} disabled={busy}>Apply union ({plan.driftCount} drifted)</button>
    {/if}
  </div>

  {#if plan}
    <h2>Drift ({plan.driftCount})</h2>
    {#if plan.items.length === 0}
      <p class="muted">no MCP servers found</p>
    {:else}
      <table>
        <thead><tr><th>server</th><th>present in</th><th>absent in</th><th>state</th></tr></thead>
        <tbody>
          {#each plan.items as it (it.id)}
            <tr class:drift={it.state === 'drift'}>
              <td><code>{it.id}</code></td>
              <td>{it.presentIn.join(', ')}</td>
              <td>{it.absentIn.join(', ') || '—'}</td>
              <td>{it.state}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}

  {#if applied}
    <p class="status">
      promoted: {applied.promoted.length ? applied.promoted.join(', ') : 'none'}
      {#if applied.manual.length}
        · manual (not in catalog): {applied.manual.join(', ')}
      {/if}
    </p>
    {#each failures as f (f.tool + f.error)}
      <p class="error">partial failure on {f.tool}: {f.error}</p>
    {/each}
  {/if}
</section>

<style>
  .tool {
    background: #fff;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
  .tool h2 {
    font-size: 0.95rem;
    margin: 0 0 0.25rem;
  }
  ul {
    margin: 0;
    padding-left: 1.2rem;
  }
  .actions {
    margin: 0.75rem 0;
    display: flex;
    gap: 0.5rem;
  }
  button {
    border: 1px solid #1c1c1e;
    background: #fff;
    padding: 0.35rem 0.9rem;
    border-radius: 6px;
  }
  button.primary {
    background: #1c1c1e;
    color: #fff;
  }
  button:disabled {
    opacity: 0.5;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    background: #fff;
    border-radius: 8px;
    overflow: hidden;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #eee;
  }
  tr.drift td {
    background: #fff7ed;
  }
  .muted {
    color: #888;
  }
  .error {
    color: #c0392b;
  }
  .status {
    color: #1e7e34;
  }
</style>
