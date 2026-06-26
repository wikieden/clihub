<script lang="ts">
  import { DaemonClient } from './lib/daemon';

  const client = new DaemonClient();

  type GuiInfo = { id: string; installed: boolean; osSupported: boolean; mechanism: 'electron-flag' | 'env'; note?: string };
  type CliInfo = { toolId: string; installed: boolean; binPath?: string };
  type Target = { id: string; name: string; gui: GuiInfo | null; cli: CliInfo | null };

  let open = $state(false);
  let targets = $state<Target[]>([]);
  let proxy = $state('');
  let busy = $state<string | null>(null);
  let msg = $state<string | null>(null);
  let err = $state<string | null>(null);
  let loaded = $state(false);

  async function load() {
    err = null;
    try {
      const [t, p] = await Promise.all([
        client.get<{ targets: Target[] }>('/v1/launch'),
        client.get<{ system: { url?: string } }>('/v1/proxy').catch(() => ({ system: {} as { url?: string } })),
      ]);
      targets = t.targets;
      if (p.system?.url && !proxy) proxy = p.system.url;
      loaded = true;
    } catch (e: unknown) {
      err = e instanceof Error ? e.message : String(e);
    }
  }

  function toggle() {
    open = !open;
    if (open && !loaded) load();
  }

  // Expose a launch entry point the Rust tray can call via window.eval — so the
  // system-tray "Launch" submenu fires the SAME daemon endpoints as the dropdown
  // (no logic fork). kind='gui' → gui app id; kind='cli' → provider id.
  $effect(() => {
    (globalThis as unknown as { __clihubLaunch?: (k: string, id: string) => void }).__clihubLaunch = async (
      kind: string,
      id: string,
    ) => {
      let url = proxy.trim();
      if (!url) {
        try {
          const p = await client.get<{ system: { url?: string } }>('/v1/proxy');
          url = p.system?.url ?? '';
        } catch {
          /* no system proxy — launch without one (gui will no-op if it needs one) */
        }
      }
      try {
        if (kind === 'gui') await client.post('/v1/gui/launch', { id, url });
        else await client.post('/v1/launch/cli', { tool: id, url });
      } catch {
        /* tray launch is fire-and-forget; errors surface in the in-window dropdown */
      }
    };
  });

  async function go(kind: 'gui' | 'cli', t: Target) {
    const key = `${kind}:${t.id}`;
    busy = key;
    msg = null;
    err = null;
    try {
      if (kind === 'gui' && t.gui) {
        if (!proxy.trim()) throw new Error('Enter a proxy url first.');
        await client.post('/v1/gui/launch', { id: t.gui.id, url: proxy.trim() });
        msg = `Launched ${t.name} app.`;
      } else if (kind === 'cli' && t.cli) {
        await client.post('/v1/launch/cli', { tool: t.cli.toolId, url: proxy.trim() });
        msg = `Opened ${t.name} CLI in a terminal.`;
      }
    } catch (e: unknown) {
      err = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }
</script>

<div class="launcher">
  <button class="trigger" class:open onclick={toggle} aria-haspopup="menu" aria-expanded={open}>
    ◇ Launch <span class="caret">▾</span>
  </button>

  {#if open}
    <div class="menu" role="menu">
      <div class="head">
        <span class="title">Launch with proxy</span>
        <input class="proxy" type="text" placeholder="http://host:port" bind:value={proxy} />
      </div>
      {#if err}<p class="err">{err}</p>{/if}
      {#if msg}<p class="ok">{msg}</p>{/if}

      <div class="rows">
        {#each targets as t (t.id)}
          <div class="row">
            <span class="name">{t.name}</span>
            <span class="acts">
              {#if t.gui && t.gui.osSupported}
                <button
                  class="act"
                  disabled={!t.gui.installed || busy === `gui:${t.id}` || !proxy.trim()}
                  title={t.gui.installed ? 'Open the desktop app with proxy' : 'desktop app not installed'}
                  onclick={() => go('gui', t)}
                >
                  {busy === `gui:${t.id}` ? '…' : 'App'}
                </button>
              {/if}
              {#if t.cli}
                <button
                  class="act"
                  disabled={!t.cli.installed || busy === `cli:${t.id}`}
                  title={t.cli.installed ? 'Open the CLI in a terminal' : 'CLI not installed'}
                  onclick={() => go('cli', t)}
                >
                  {busy === `cli:${t.id}` ? '…' : 'Terminal'}
                </button>
              {/if}
              {#if !(t.gui && t.gui.osSupported) && !t.cli}
                <span class="none">—</span>
              {/if}
            </span>
          </div>
        {/each}
      </div>
      <p class="foot">Electron apps use --proxy-server; native + CLIs use env. macOS/Win/Linux.</p>
    </div>
  {/if}
</div>

<style>
  .launcher {
    position: relative;
  }
  .trigger {
    font-family: var(--mono);
    font-size: 0.78rem;
    border-color: var(--accent);
    background: var(--accent-bg);
    color: var(--accent-bright);
    padding: 0.25rem 0.7rem;
  }
  .trigger:hover,
  .trigger.open {
    background: var(--accent);
    color: var(--bg);
  }
  .caret {
    font-size: 0.6rem;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 2rem;
    z-index: 50;
    width: 23rem;
    background: var(--panel, var(--bg));
    border: 1px solid var(--border-strong);
    border-radius: var(--radius, 8px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    padding: 0.6rem;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .title {
    font-size: 0.78rem;
    color: var(--text-dim);
  }
  .proxy {
    flex: 1;
    min-width: 0;
    font-size: 0.74rem;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.2rem;
    border-radius: 4px;
  }
  .row:hover {
    background: var(--accent-bg);
  }
  .name {
    font-size: 0.85rem;
  }
  .acts {
    display: flex;
    gap: 0.3rem;
  }
  .act {
    font-size: 0.7rem;
    padding: 0.1rem 0.5rem;
    border-color: var(--border-strong);
    background: transparent;
    color: var(--text-dim);
  }
  .act:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent-bright);
  }
  .act:disabled {
    opacity: 0.35;
  }
  .none {
    color: var(--text-faint);
    font-size: 0.75rem;
  }
  .err {
    color: var(--err);
    font-size: 0.75rem;
    margin: 0.2rem 0;
  }
  .ok {
    color: var(--ok);
    font-size: 0.75rem;
    margin: 0.2rem 0;
  }
  .foot {
    margin: 0.5rem 0 0;
    font-size: 0.68rem;
    color: var(--text-faint);
  }
</style>
