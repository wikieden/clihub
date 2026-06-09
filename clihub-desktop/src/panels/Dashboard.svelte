<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { DoctorResponse, HealthRow } from '../lib/types';

  const client = new DaemonClient();

  let rows = $state<HealthRow[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);

  $effect(() => {
    let stop = () => {};
    client
      .get<DoctorResponse>('/v1/doctor')
      .then((d) => {
        rows = d.tools;
        loading = false;
      })
      .catch((e: unknown) => {
        error = e instanceof Error ? e.message : String(e);
        loading = false;
      });

    // Live updates: the daemon re-pushes the matrix when it changes.
    stop = client.stream('/stream/doctor', (d) => {
      const data = d as DoctorResponse;
      if (Array.isArray(data?.tools)) rows = data.tools;
    });

    return () => stop();
  });
</script>

<section>
  <h1>Dashboard</h1>
  {#if loading}
    <p>Loading health matrix…</p>
  {:else if error}
    <p class="error">Daemon unreachable: {error}</p>
  {:else}
    <table>
      <thead>
        <tr><th>CLI</th><th>Installed</th><th>Version</th></tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr>
            <td>{row.id}</td>
            <td>{row.installed ? '✓' : '—'}</td>
            <td>{row.version ?? '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
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
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #eee;
  }
  th {
    background: #fafafa;
    font-size: 0.85rem;
    color: #666;
  }
  .error {
    color: #c0392b;
  }
</style>
