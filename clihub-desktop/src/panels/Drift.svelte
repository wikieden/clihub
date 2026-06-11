<script lang="ts">
  import { DaemonClient, DaemonError } from '../lib/daemon';
  import type { StatusResponse } from '../lib/types';

  const client = new DaemonClient();

  const DIR_KEY = 'clihub.drift.dir';

  let report = $state<StatusResponse | null>(null);
  let notConfigured = $state(false);
  let error = $state<string | null>(null);
  let loading = $state(true);
  // The daemon's cwd is wherever the shell spawned it — let the user pin the
  // project dir explicitly (persisted locally, sent as ?dir= to /v1/status).
  let dir = $state(localStorage.getItem(DIR_KEY) ?? '');

  async function load() {
    loading = true;
    notConfigured = false;
    error = null;
    report = null;
    try {
      report = await client.get<StatusResponse>(
        dir ? `/v1/status?dir=${encodeURIComponent(dir)}` : '/v1/status',
      );
    } catch (e: unknown) {
      if (e instanceof DaemonError && e.status === 400) notConfigured = true;
      else error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function check() {
    localStorage.setItem(DIR_KEY, dir);
    load();
  }

  $effect(() => {
    load();
  });
</script>

<section>
  <h1>Drift</h1>
  <form
    class="dirbar"
    onsubmit={(e) => {
      e.preventDefault();
      check();
    }}
  >
    <input type="text" placeholder="Project directory (absolute path, empty = daemon cwd)" bind:value={dir} />
    <button type="submit">Check</button>
  </form>
  {#if loading}
    <p>Computing status…</p>
  {:else if notConfigured}
    <p class="muted">
      No clihub.yaml found{dir ? ` under ${dir}` : ''} — run <code>clihub init</code> there to start pinning.
    </p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if report}
    <div class="banner" class:ok={report.compliant} class:bad={!report.compliant}>
      {report.compliant ? '✓ compliant with lockfile' : '✗ drift detected'}
      <span class="counts">ok {report.ok} · drift {report.drift} · missing {report.missing} · unlocked {report.unlocked}</span>
    </div>
    <p class="muted"><code>{report.file}</code></p>
    {#if report.items.length > 0}
      <table>
        <thead><tr><th>kind</th><th>id</th><th>state</th><th>locked</th><th>actual</th><th>detail</th></tr></thead>
        <tbody>
          {#each report.items as it (it.kind + it.id)}
            <tr class:bad={it.state === 'drift' || it.state === 'missing'}>
              <td>{it.kind}</td>
              <td><code>{it.id}</code></td>
              <td>{it.state}</td>
              <td>{it.locked ?? '—'}</td>
              <td>{it.actual ?? '—'}</td>
              <td>{it.detail ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</section>

<style>
  .dirbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .dirbar input {
    flex: 1;
  }
  .banner {
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .banner.ok {
    background: var(--ok-bg);
    color: var(--ok);
  }
  .banner.bad {
    background: var(--err-bg);
    color: var(--err);
  }
  .counts {
    font-size: 0.74rem;
    font-weight: 400;
    color: var(--text-dim);
  }
  tr.bad td {
    background: var(--err-bg);
  }
  .muted {
    color: var(--text-dim);
  }
  .error {
    color: var(--err);
  }
</style>
