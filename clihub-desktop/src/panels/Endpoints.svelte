<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type {
    BindingsResponse,
    BindingAdapterRow,
    CliBindingRow,
    DoctorResponse,
    EndpointPreset,
    EndpointsResponse,
    UseResultRow,
  } from '../lib/types';

  const client = new DaemonClient();

  let endpoints = $state<EndpointPreset[]>([]);
  let adapters = $state<BindingAdapterRow[]>([]);
  let bindings = $state<Record<string, CliBindingRow>>({});
  let installed = $state<Record<string, boolean>>({});
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);

  // Per-row UI selections (endpoint id / model text), keyed by CLI.
  let pickEndpoint = $state<Record<string, string>>({});
  let pickModel = $state<Record<string, string>>({});
  // CLIs whose last bind failed on a missing key — show the explicit skip path.
  let needsSkip = $state<Record<string, boolean>>({});

  // Binding CLIs vs tool-provider ids differ for two CLIs.
  const PROVIDER_ID: Record<string, string> = { kiro: 'kiro-cli' };

  function urlsOf(p: EndpointPreset): Record<string, string> {
    if (p.urls && Object.keys(p.urls).length > 0) return p.urls;
    if (p.family && p.baseURL) return { [p.family]: p.baseURL };
    return {};
  }

  /** Presets this CLI can actually use (protocol intersection). */
  function presetsFor(a: BindingAdapterRow): EndpointPreset[] {
    return endpoints.filter((p) => {
      const urls = urlsOf(p);
      return a.protocols.some((proto) => urls[proto]);
    });
  }

  async function load() {
    error = null;
    try {
      const [b, e, d] = await Promise.all([
        client.get<BindingsResponse>('/v1/bindings'),
        client.get<EndpointsResponse>('/v1/endpoints'),
        client.get<DoctorResponse>('/v1/doctor'),
      ]);
      adapters = b.adapters;
      bindings = b.bindings;
      endpoints = e.endpoints;
      installed = Object.fromEntries(d.tools.map((t) => [t.id, Boolean(t.installed)]));
      for (const a of b.adapters) {
        const bound = b.bindings[a.cli];
        if (bound?.endpoint && !pickEndpoint[a.cli]) pickEndpoint[a.cli] = bound.endpoint;
        if (bound?.model && !pickModel[a.cli]) pickModel[a.cli] = bound.model;
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    load();
  });

  async function bind(cli: string, skipKey = false) {
    const endpoint = pickEndpoint[cli];
    if (!endpoint) { error = `pick an endpoint for ${cli} first`; return; }
    busy = cli;
    status = null;
    error = null;
    try {
      const model = pickModel[cli]?.trim() || undefined;
      const res = await client.post<UseResultRow>('/v1/use', { endpoint, cli, model, skipKey });
      needsSkip[cli] = false;
      const tg = res.targets[0];
      const keyNote = tg && !tg.keyDelivered ? ' — no key delivered' : '';
      const hint = tg?.patches.find((p) => !p.applied && p.detail)?.detail;
      status = `${cli} → ${endpoint}${model ? ` · ${model}` : ''}${keyNote}${hint ? ` (${hint})` : ''}. Restart the CLI to pick it up.`;
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/no key for/.test(msg)) needsSkip[cli] = true;
      error = msg;
    } finally {
      busy = null;
    }
  }

  async function setModel(cli: string) {
    const model = pickModel[cli]?.trim();
    if (!model) { error = `enter a model for ${cli} first`; return; }
    busy = cli;
    status = null;
    error = null;
    try {
      await client.post('/v1/model', { cli, model });
      status = `${cli} default model → ${model}. Restart the CLI to pick it up.`;
      await load();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  async function clear(cli: string) {
    busy = cli;
    status = null;
    error = null;
    try {
      await client.post('/v1/use/clear', { cli });
      pickEndpoint[cli] = '';
      pickModel[cli] = '';
      status = `${cli}: restored official defaults.`;
      await load();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }
</script>

<section>
  <h1>Endpoints</h1>
  <p class="hint">
    Each CLI holds its own (endpoint, default model) binding — mirrors <code>clihub use</code>.
    Keys come from the clihub keychain and land in each CLI's native config (0600).
  </p>
  {#if error}<p class="error">{error}</p>{/if}
  {#if status}<p class="status">{status}</p>{/if}

  <table>
    <thead>
      <tr><th>CLI</th><th>Bound to</th><th>Endpoint</th><th>Default model</th><th></th></tr>
    </thead>
    <tbody>
      {#each adapters as a (a.cli)}
        {@const bound = bindings[a.cli]}
        {@const isInstalled = installed[PROVIDER_ID[a.cli] ?? a.cli]}
        <tr class:dim={!isInstalled}>
          <td>
            <strong>{a.cli}</strong>
            {#if !isInstalled}<span class="badge">not installed</span>{/if}
            {#if !a.deliversKey && !a.modelOnly}<span class="badge warn">key via keyring/env</span>{/if}
          </td>
          <td>
            {#if bound}
              <code>{bound.endpoint ?? '(model only)'}{bound.model ? ` · ${bound.model}` : ''}</code>
            {:else}
              <span class="official">official</span>
            {/if}
          </td>
          <td>
            {#if a.modelOnly}
              <span class="unsupported" title="proprietary backend — only the default model can be switched">endpoint: unsupported</span>
            {:else}
              <select bind:value={pickEndpoint[a.cli]} disabled={busy === a.cli}>
                <option value="">— pick —</option>
                {#each presetsFor(a) as p (p.id)}
                  <option value={p.id}>{p.label}</option>
                {/each}
              </select>
            {/if}
          </td>
          <td>
            <input
              type="text"
              placeholder={a.requiresModel ? 'required' : '(CLI default)'}
              bind:value={pickModel[a.cli]}
              disabled={busy === a.cli}
              list={`models-${a.cli}`}
            />
            <datalist id={`models-${a.cli}`}>
              {#each endpoints.find((p) => p.id === pickEndpoint[a.cli])?.models ?? [] as m}
                <option value={m}></option>
              {/each}
            </datalist>
          </td>
          <td class="actions">
            {#if a.modelOnly}
              <button disabled={busy === a.cli} onclick={() => setModel(a.cli)}>
                {busy === a.cli ? '…' : 'Set model'}
              </button>
            {:else}
              <button disabled={busy === a.cli} onclick={() => bind(a.cli)}>
                {busy === a.cli ? '…' : 'Bind'}
              </button>
              {#if needsSkip[a.cli]}
                <button class="ghost" disabled={busy === a.cli} onclick={() => bind(a.cli, true)}>
                  Bind without key
                </button>
              {/if}
            {/if}
            {#if bound}
              <button class="ghost" disabled={busy === a.cli} onclick={() => clear(a.cli)}>Clear</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
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
  .badge {
    margin-left: 0.4rem;
    font-family: var(--mono);
    font-size: 0.64rem;
    color: var(--text-faint);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    padding: 0.05rem 0.3rem;
  }
  .badge.warn {
    color: var(--warn);
    border-color: var(--warn);
  }
  .official {
    color: var(--ok);
    font-family: var(--mono);
    font-size: 0.78rem;
  }
  .unsupported {
    color: var(--text-faint);
    font-size: 0.8rem;
    font-style: italic;
  }
  select,
  input {
    max-width: 11rem;
  }
  .actions {
    white-space: nowrap;
  }
  /* Bind / Set model are the row's primary action — amber signal. */
  button {
    border-color: var(--accent);
    background: var(--accent-bg);
    color: var(--accent-bright);
  }
  button:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
  }
  button.ghost {
    border-color: var(--border-strong);
    background: transparent;
    color: var(--text-dim);
    margin-left: 0.3rem;
  }
  button.ghost:hover:not(:disabled) {
    background: transparent;
    border-color: var(--accent);
    color: var(--accent-bright);
  }
  .error {
    color: var(--err);
  }
  .status {
    color: var(--ok);
  }
</style>
