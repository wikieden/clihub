<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { ProxyResponse, ProxyToolRow, SystemProxyRow, ProxySetResult } from '../lib/types';

  const client = new DaemonClient();

  let tools = $state<ProxyToolRow[]>([]);
  let system = $state<SystemProxyRow>({ source: 'none' });
  let pick = $state<Record<string, string>>({});
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);

  // Desktop GUI apps clihub can launch WITH a proxy (Claude / Codex desktop).
  type GuiApp = {
    id: string;
    name: string;
    installed: boolean;
    mechanism: 'electron-flag' | 'env';
    note?: string;
  };
  let guiSupported = $state(false);
  let guiApps = $state<GuiApp[]>([]);
  let guiProxy = $state('');

  async function load() {
    error = null;
    try {
      const res = await client.get<ProxyResponse>('/v1/proxy');
      tools = res.tools;
      system = res.system;
      for (const t of res.tools) pick[t.id] = t.proxy ?? '';
      if (system.url && !guiProxy) guiProxy = system.url;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
    try {
      const g = await client.get<{ supported: boolean; apps: GuiApp[] }>('/v1/gui');
      guiSupported = g.supported;
      guiApps = g.apps;
    } catch {
      guiSupported = false;
      guiApps = [];
    }
  }

  async function launchGui(id: string) {
    const url = guiProxy.trim();
    if (!url) {
      error = 'Enter a proxy url to launch with.';
      return;
    }
    busy = id;
    status = null;
    error = null;
    try {
      await client.post('/v1/gui/launch', { id, url });
      status = `Launched ${id} with proxy ${url}.`;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  $effect(() => {
    load();
  });

  async function setProxy(id: string, url: string | undefined) {
    busy = id;
    status = null;
    error = null;
    try {
      const res = await client.post<ProxySetResult>('/v1/proxy', { tool: id, url: url ?? '' });
      status = res.proxy
        ? `${id} → ${res.proxy}. Restart the CLI to pick it up.`
        : `${id}: proxy cleared.`;
      await load();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  /** One-click: drop the detected system proxy into every supported, installed CLI. */
  async function applySystemToAll() {
    const url = system.url;
    if (!url) return;
    for (const t of tools) {
      if (!t.supported || !t.installed) continue;
      pick[t.id] = url;
      await setProxy(t.id, url);
    }
  }
</script>

<section>
  <h1>Proxy</h1>
  <p class="hint">
    Each CLI carries its own <code>HTTP_PROXY</code>/<code>HTTPS_PROXY</code> in its native config —
    mirrors <code>clihub proxy</code> + the TUI "Set proxy". <code>socks5://</code> also sets
    <code>ALL_PROXY</code>. Blank = clear.
  </p>

  {#if system.source !== 'none' && system.url}
    <p class="sys">
      System proxy detected (<code>{system.source}</code>): <code>{system.url}</code>
      <button class="ghost" disabled={busy !== null} onclick={applySystemToAll}>Apply to all installed</button>
    </p>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
  {#if status}<p class="status">{status}</p>{/if}

  <table>
    <thead>
      <tr><th>CLI</th><th>Proxy URL</th><th></th></tr>
    </thead>
    <tbody>
      {#each tools as t (t.id)}
        <tr class:dim={!t.installed}>
          <td>
            <strong>{t.name}</strong>
            {#if !t.installed}<span class="badge">not installed</span>{/if}
            {#if !t.supported}<span class="badge warn">YAML — shell env only</span>{/if}
          </td>
          <td>
            {#if t.supported}
              <input
                type="text"
                placeholder="http://host:port (blank = clear)"
                bind:value={pick[t.id]}
                disabled={busy === t.id}
              />
            {:else}
              <span class="unsupported" title={t.configPath}>set HTTPS_PROXY in your shell</span>
            {/if}
          </td>
          <td class="actions">
            {#if t.supported}
              <button disabled={busy === t.id} onclick={() => setProxy(t.id, pick[t.id]?.trim() || undefined)}>
                {busy === t.id ? '…' : 'Set'}
              </button>
              {#if t.proxy}
                <button class="ghost" disabled={busy === t.id} onclick={() => setProxy(t.id, undefined)}>Clear</button>
              {/if}
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if guiApps.length > 0}
    <h2>Desktop apps</h2>
    <p class="hint">
      GUI apps don't read a config env — clihub <strong>launches</strong> them with the proxy applied
      (chromium <code>--proxy-server</code> for Electron, env for native). One-click start.
      {#if !guiSupported}<span class="badge warn">macOS only</span>{/if}
    </p>
    <p class="sys">
      Launch proxy: <input class="gui-url" type="text" placeholder="http://host:port" bind:value={guiProxy} />
    </p>
    <table>
      <thead>
        <tr><th>App</th><th>Mechanism</th><th></th></tr>
      </thead>
      <tbody>
        {#each guiApps as a (a.id)}
          <tr class:dim={!a.installed}>
            <td>
              <strong>{a.name}</strong>
              {#if !a.installed}<span class="badge">not installed</span>{/if}
            </td>
            <td>
              <span class="mech">{a.mechanism === 'electron-flag' ? '--proxy-server flag' : 'env (best-effort)'}</span>
              {#if a.note}<span class="badge warn" title={a.note}>⚠ best-effort</span>{/if}
            </td>
            <td class="actions">
              <button
                disabled={!guiSupported || !a.installed || busy === a.id || !guiProxy.trim()}
                onclick={() => launchGui(a.id)}
              >
                {busy === a.id ? '…' : 'Launch with proxy'}
              </button>
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
  h2 {
    margin: 1.5rem 0 0.25rem;
    font-size: 0.95rem;
  }
  .mech {
    font-family: var(--mono);
    font-size: 0.74rem;
    color: var(--text-dim);
  }
  .gui-url {
    min-width: 16rem;
    margin-left: 0.4rem;
  }
  .sys {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin: 0 0 0.75rem;
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
  .unsupported {
    color: var(--text-faint);
    font-size: 0.8rem;
    font-style: italic;
  }
  input {
    min-width: 18rem;
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
