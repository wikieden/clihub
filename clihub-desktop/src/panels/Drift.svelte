<script lang="ts">
  import { DaemonClient, DaemonError } from '../lib/daemon';
  import type { StatusResponse } from '../lib/types';

  const client = new DaemonClient();

  let report = $state<StatusResponse | null>(null);
  let notConfigured = $state(false);
  let error = $state<string | null>(null);
  let loading = $state(true);

  $effect(() => {
    client
      .get<StatusResponse>('/v1/status')
      .then((d) => {
        report = d;
        loading = false;
      })
      .catch((e: unknown) => {
        if (e instanceof DaemonError && e.status === 400) notConfigured = true;
        else error = e instanceof Error ? e.message : String(e);
        loading = false;
      });
  });
</script>

<section>
  <h1>Drift</h1>
  {#if loading}
    <p>Computing status…</p>
  {:else if notConfigured}
    <p class="muted">No clihub.yaml found — run <code>clihub init</code> to start pinning this machine.</p>
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
  .banner {
    padding: 0.6rem 0.9rem;
    border-radius: 8px;
    font-weight: 600;
    margin-bottom: 0.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .banner.ok {
    background: #e6f4ea;
    color: #1e7e34;
  }
  .banner.bad {
    background: #fdecea;
    color: #c0392b;
  }
  .counts {
    font-size: 0.8rem;
    font-weight: 400;
    color: #555;
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
  tr.bad td {
    background: #fdecea;
  }
  .muted {
    color: #888;
  }
  .error {
    color: #c0392b;
  }
</style>
