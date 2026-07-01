<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { GuiResponse, GuiAppRow } from '../lib/types';

  const client = new DaemonClient();

  let supported = $state(false);
  let apps = $state<GuiAppRow[]>([]);
  // Each app's proxy input is its own entry, keyed by app id — fully
  // independent of every other app (no shared "launch proxy" value).
  let draft = $state<Record<string, string>>({});
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);

  async function load() {
    error = null;
    try {
      const res = await client.get<GuiResponse>('/v1/gui');
      supported = res.supported;
      apps = res.apps;
      for (const a of res.apps) if (draft[a.id] === undefined) draft[a.id] = a.proxy ?? '';
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
      supported = false;
      apps = [];
    }
  }

  $effect(() => {
    load();
  });

  /** Persist this app's own proxy so it's remembered next session. */
  async function remember(id: string, url: string) {
    try {
      await client.post('/v1/launch-proxy', { id, url });
    } catch {
      /* non-fatal */
    }
  }

  async function launch(id: string) {
    const url = draft[id]?.trim();
    if (!url) {
      error = 'Enter a proxy url to launch with.';
      return;
    }
    busy = id;
    status = null;
    error = null;
    try {
      await client.post('/v1/gui/launch', { id, url });
      await remember(id, url);
      status = `Launched ${id} with proxy ${url}.`;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }
</script>

<section>
  <h1>Desktop Apps</h1>
  <p class="hint">
    Desktop GUI apps (Claude desktop, Codex desktop) don't read a config env — clihub
    <strong>launches</strong> them with the proxy applied (chromium <code>--proxy-server</code> for
    Electron, env for native). Each app below has its own independent proxy — setting one never
    affects another.
    {#if !supported}<span class="badge warn">macOS only</span>{/if}
  </p>

  {#if error}<p class="error">{error}</p>{/if}
  {#if status}<p class="status">{status}</p>{/if}

  <div class="cards">
    {#each apps as a (a.id)}
      <div class="card" class:dim={!a.installed}>
        <div class="card-head">
          <strong>{a.name}</strong>
          {#if !a.osSupported}<span class="badge">no app on this OS</span>
          {:else if !a.installed}<span class="badge">not installed</span>{/if}
          <span class="mech">{a.mechanism === 'electron-flag' ? '--proxy-server flag' : 'env (best-effort)'}</span>
          {#if a.note}<span class="badge warn" title={a.note}>⚠ best-effort</span>{/if}
        </div>
        {#if a.osSupported}
          <div class="row">
            <input
              type="text"
              placeholder="http://host:port"
              bind:value={draft[a.id]}
              disabled={busy === a.id}
            />
            <button
              disabled={!a.installed || busy === a.id || !draft[a.id]?.trim()}
              onclick={() => launch(a.id)}
            >
              {busy === a.id ? '…' : 'Launch with proxy'}
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</section>

<style>
  .hint {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin: 0.25rem 0 0.75rem;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .card {
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
  }
  .card.dim {
    opacity: 0.5;
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.4rem;
  }
  .mech {
    font-family: var(--mono);
    font-size: 0.74rem;
    color: var(--text-dim);
    margin-left: auto;
  }
  .row {
    display: flex;
    gap: 0.4rem;
  }
  input {
    flex: 1;
    min-width: 14rem;
  }
  .badge {
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
  button {
    border-color: var(--accent);
    background: var(--accent-bg);
    color: var(--accent-bright);
  }
  button:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
  }
  .error {
    color: var(--err);
  }
  .status {
    color: var(--ok);
  }
</style>
