<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { BindingsResponse, CliBindingRow, DoctorResponse, HealthRow, NetworkProbeRow } from '../lib/types';

  const client = new DaemonClient();

  let rows = $state<HealthRow[]>([]);
  let bindings = $state<Record<string, CliBindingRow>>({});
  let error = $state<string | null>(null);
  let loading = $state(true);

  // On-demand only — this hits every installed CLI's vendor API for real, so
  // it must never run automatically alongside the health matrix above.
  let probes = $state<NetworkProbeRow[] | null>(null);
  let probing = $state(false);
  let probeError = $state<string | null>(null);

  async function checkNetwork() {
    probing = true;
    probeError = null;
    try {
      probes = (await client.get<{ probes: NetworkProbeRow[] }>('/v1/doctor/network')).probes;
    } catch (e: unknown) {
      probeError = e instanceof Error ? e.message : String(e);
    } finally {
      probing = false;
    }
  }

  // Doctor rows use tool-provider ids; bindings use binding CLI ids.
  const BINDING_ID: Record<string, string> = { 'kiro-cli': 'kiro' };

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

    <div class="network">
      <button onclick={checkNetwork} disabled={probing}>
        {probing ? 'Probing…' : 'Check vendor API reachability'}
      </button>
      {#if probeError}<p class="error">{probeError}</p>{/if}
      {#if probes}
        {#if probes.length === 0}
          <p class="muted small">No installed CLI has a known vendor API host to probe.</p>
        {:else}
          <table>
            <thead><tr><th>CLI</th><th>Host</th><th>Proxy</th><th>Status</th></tr></thead>
            <tbody>
              {#each probes as p (p.toolId)}
                <tr>
                  <td>{p.toolId}</td>
                  <td class="mono small">{p.host}</td>
                  <td class="mono small">{p.proxy ?? '—'}</td>
                  <td>
                    {#if p.error}
                      <span class="bad">✗ {p.error}</span>
                    {:else}
                      <span class:bad={p.status !== undefined && p.status >= 500}>
                        {p.status} · {p.latencyMs}ms
                      </span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      {/if}
    </div>
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
  .network {
    margin-top: 1rem;
  }
  .network table {
    margin-top: 0.5rem;
  }
  .bad {
    color: var(--err);
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
</style>
