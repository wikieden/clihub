<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { RollbackResult, VersionToolRow, VersionsResponse } from '../lib/types';

  const client = new DaemonClient();

  let tools = $state<VersionToolRow[]>([]);
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let loading = $state(true);
  let expanded = $state<Record<string, boolean>>({});

  async function load() {
    try {
      tools = (await client.get<VersionsResponse>('/v1/versions')).tools;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  async function rollback(t: VersionToolRow) {
    if (!t.target) return;
    busy = t.id;
    status = null;
    error = null;
    try {
      const res = await client.post<RollbackResult>('/v1/rollback', { tool: t.id });
      status = `${res.tool}: ${res.from ?? '?'} → ${res.to} (re-installed)`;
      await load();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }
</script>

<section>
  <h1>Versions</h1>
  <p class="hint">
    Every clihub-driven install is recorded — a bad upgrade rolls back to the previous
    version (npm-based CLIs). Mirrors <code>clihub tool history / rollback</code>.
  </p>
  {#if error}<p class="error">{error}</p>{/if}
  {#if status}<p class="status">{status}</p>{/if}

  {#if loading}
    <p>Loading version history…</p>
  {:else}
    <table>
      <thead>
        <tr><th>CLI</th><th>Current</th><th>History</th><th></th></tr>
      </thead>
      <tbody>
        {#each tools as t (t.id)}
          <tr class:dim={!t.installed}>
            <td><strong>{t.id}</strong></td>
            <td><code>{t.current ?? '—'}</code></td>
            <td>
              {#if t.records.length === 0}
                <span class="none">none recorded</span>
              {:else}
                <button class="link" onclick={() => (expanded[t.id] = !expanded[t.id])}>
                  {t.records.length} install{t.records.length > 1 ? 's' : ''} {expanded[t.id] ? '▾' : '▸'}
                </button>
                {#if expanded[t.id]}
                  <ul class="history">
                    {#each t.records as r}
                      <li>
                        <code>{r.version}</code>
                        <span class="at">{r.at}</span>
                        {#if r.rolledBack}<span class="rb">rollback</span>{/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            </td>
            <td class="actions">
              {#if t.target}
                <button disabled={busy === t.id} onclick={() => rollback(t)}>
                  {busy === t.id ? 'Rolling back…' : `Rollback to ${t.target}`}
                </button>
              {:else}
                <span class="none">no rollback target</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .hint {
    font-size: 0.8rem;
    color: #888;
    margin: 0.25rem 0 0.75rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
  }
  th {
    text-align: left;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #999;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #eee;
  }
  td {
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid #f2f2f2;
    vertical-align: top;
    font-size: 0.85rem;
  }
  tr.dim td {
    opacity: 0.55;
  }
  code {
    font-size: 0.8rem;
    color: #555;
  }
  .none {
    color: #aaa;
    font-size: 0.8rem;
    font-style: italic;
  }
  .history {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
  }
  .history li {
    padding: 0.15rem 0;
  }
  .at {
    color: #aaa;
    font-size: 0.72rem;
    margin-left: 0.5rem;
  }
  .rb {
    margin-left: 0.5rem;
    font-size: 0.68rem;
    color: #9a6700;
    border: 1px solid #e3c98a;
    border-radius: 4px;
    padding: 0.05rem 0.3rem;
  }
  .actions {
    white-space: nowrap;
  }
  button {
    border: 1px solid #1c1c1e;
    background: #1c1c1e;
    color: #fff;
    padding: 0.3rem 0.7rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }
  button:disabled {
    opacity: 0.5;
  }
  button.link {
    border: none;
    background: transparent;
    color: #1c1c1e;
    padding: 0;
    text-decoration: underline;
    font-size: 0.8rem;
  }
  .error {
    color: #c0392b;
  }
  .status {
    color: #1e7e34;
  }
</style>
