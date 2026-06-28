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
    color: var(--text-dim);
    margin: 0.25rem 0 0.75rem;
  }
  td {
    vertical-align: top;
  }
  tr.dim td {
    opacity: 0.5;
  }
  .none {
    color: var(--text-faint);
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
    color: var(--text-faint);
    font-family: var(--mono);
    font-size: 0.7rem;
    margin-left: 0.5rem;
  }
  .rb {
    margin-left: 0.5rem;
    font-family: var(--mono);
    font-size: 0.64rem;
    color: var(--warn);
    border: 1px solid var(--warn);
    border-radius: 4px;
    padding: 0.05rem 0.3rem;
  }
  .actions {
    white-space: nowrap;
  }
  button {
    border-color: var(--accent);
    background: var(--accent-bg);
    color: var(--accent-bright);
  }
  button:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
  }
  button.link {
    border: none;
    background: transparent;
    color: var(--text);
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--border-strong);
  }
  button.link:hover:not(:disabled) {
    background: transparent;
    color: var(--accent-bright);
  }
  .error {
    color: var(--err);
  }
  .status {
    color: var(--ok);
  }
</style>
