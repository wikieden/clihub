<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { BindingsResponse, CliBindingRow, DoctorResponse, HealthRow } from '../lib/types';

  const client = new DaemonClient();

  let rows = $state<HealthRow[]>([]);
  let bindings = $state<Record<string, CliBindingRow>>({});
  let error = $state<string | null>(null);
  let loading = $state(true);

  // Doctor rows use tool-provider ids; bindings use binding CLI ids.
  const BINDING_ID: Record<string, string> = { 'gemini-cli': 'gemini', 'kiro-cli': 'kiro' };

  function bindingFor(row: HealthRow): string {
    const b = bindings[BINDING_ID[row.id] ?? row.id];
    if (!b) return 'official';
    return `${b.endpoint ?? '(model only)'}${b.model ? ` · ${b.model}` : ''}`;
  }

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
    client
      .get<BindingsResponse>('/v1/bindings')
      .then((b) => {
        bindings = b.bindings;
      })
      .catch(() => {
        /* binding overview is best-effort — the health matrix stays useful without it */
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
        <tr><th>CLI</th><th>Installed</th><th>Version</th><th>Skills</th><th>MCP</th><th>Endpoint</th></tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr>
            <td>{row.id}</td>
            <td>{row.installed ? '✓' : '—'}</td>
            <td>{row.version ?? '—'}</td>
            <td>{row.skillCount ?? '—'}</td>
            <td>{row.mcpCount ?? '—'}</td>
            <td class:bound={bindingFor(row) !== 'official'}>{bindingFor(row)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .error {
    color: var(--err);
  }
  .bound {
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--accent-bright);
  }
</style>
