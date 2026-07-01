<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { CredentialRow } from '../lib/types';

  const client = new DaemonClient();

  let rows = $state<CredentialRow[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  async function load() {
    error = null;
    loading = true;
    try {
      const res = await client.get<{ rows: CredentialRow[] }>('/v1/auth');
      rows = res.rows;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });
</script>

<section>
  <h1>Auth</h1>
  <p class="hint">
    Cross-CLI credential/expiry visibility — mirrors <code>clihub auth status</code>. Read-only,
    best-effort read of each CLI's own credential file; never prints the token itself.
    <strong>"no file" ≠ logged out</strong> — re-auth with that CLI's own login if unsure.
  </p>

  {#if error}<p class="error">{error}</p>{/if}

  <table>
    <thead>
      <tr><th>CLI</th><th>Status</th><th>Detail</th></tr>
    </thead>
    <tbody>
      {#each rows as r (r.tool)}
        <tr class:dim={!r.found}>
          <td><strong>{r.label}</strong></td>
          <td>
            {#if !r.found}
              <span class="dim">— no credential file found</span>
            {:else if r.expired}
              <span class="bad">✗ expired</span>
            {:else}
              <span class="ok">✓ logged in</span>
            {/if}
          </td>
          <td class="mono small">
            {#if r.found}
              {#if r.expiresAt}
                <span class:bad={r.expired}>{r.expired ? 'expired' : 'expires'} {r.expiresAt}</span>
              {:else if r.modified}
                <span class="dim">since {r.modified}</span>
              {/if}
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if !loading && rows.length === 0}<p class="dim small">No credential sources known yet.</p>{/if}
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
  tr.dim td {
    opacity: 0.5;
  }
  .ok {
    color: var(--ok);
  }
  .bad {
    color: var(--err);
  }
  .dim {
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
</style>
