<script lang="ts">
  import { DaemonClient } from './lib/daemon';
  import { Window } from '@tauri-apps/api/window';
  import type { DoctorResponse, HealthRow, ProxyResponse, ProxyToolRow, SystemProxyRow } from './lib/types';

  const client = new DaemonClient();

  // Surface the full sidebar app window (built hidden by the Rust shell), and
  // tuck the popover away — the tray "Open clihub" item is the fallback path.
  async function openMain() {
    try {
      const w = await Window.getByLabel('main');
      if (w) {
        await w.unminimize();
        await w.show();
        await w.setFocus();
      }
      const p = await Window.getByLabel('popover');
      await p?.hide();
    } catch {
      /* non-fatal */
    }
  }

  // ── theme (four palettes, one token contract; persisted) ────────────────
  type Theme = 'console' | 'graphite' | 'paper' | 'phosphor';
  const THEMES: { id: Theme; swatch: string }[] = [
    { id: 'console', swatch: '#4fd6c4' },
    { id: 'graphite', swatch: '#e2a33c' },
    { id: 'paper', swatch: '#c9402a' },
    { id: 'phosphor', swatch: '#3df28a' },
  ];
  const THEME_KEY = 'clihub.theme';
  function initialTheme(): Theme {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null;
    return saved && THEMES.some((t) => t.id === saved) ? saved : 'console';
  }
  let theme = $state<Theme>(initialTheme());
  $effect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  });

  // ── the eight CLIs, in tab order (Overview is prepended) ─────────────────
  const CLIS: { id: string; label: string }[] = [
    { id: 'claude-code', label: 'Claude' },
    { id: 'codex', label: 'Codex' },
    { id: 'gemini-cli', label: 'Gemini' },
    { id: 'qwen-code', label: 'Qwen' },
    { id: 'kiro-cli', label: 'Kiro' },
    { id: 'cursor', label: 'Cursor' },
    { id: 'goose', label: 'Goose' },
    { id: 'opencode', label: 'OpenCode' },
  ];

  // ── data shapes ─────────────────────────────────────────────────────────
  type SurfaceUsage = {
    surface: 'cli' | 'desktop';
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    totalTokens: number;
    sessions: number;
    estCostUsd: number;
  };
  type UsageRow = {
    tool: string;
    label: string;
    supported: boolean;
    inputTokens?: number;
    outputTokens?: number;
    cacheTokens?: number;
    totalTokens?: number;
    sessions?: number;
    estCostUsd?: number;
    surfaces?: SurfaceUsage[];
    plan?: string;
    partialCost?: boolean;
    note?: string;
  };
  type GuiInfo = { id: string; installed: boolean; osSupported: boolean; mechanism: string; note?: string };
  type CliInfo = { toolId: string; installed: boolean; binPath?: string };
  type Target = { id: string; name: string; gui: GuiInfo | null; cli: CliInfo | null };

  let tab = $state<string>('overview');
  let health = $state<HealthRow[]>([]);
  let usage = $state<UsageRow[]>([]);
  let proxySystem = $state<Partial<SystemProxyRow>>({});
  let proxyTools = $state<ProxyToolRow[]>([]);
  let targets = $state<Target[]>([]);
  let proxy = $state(''); // shared launch proxy
  let err = $state<string | null>(null);
  let loading = $state(true);
  // per-CLI launch status, keyed by `${kind}:${id}`
  let busy = $state<string | null>(null);
  let flash = $state<{ id: string; ok: boolean; text: string } | null>(null);

  // ── joins by id ─────────────────────────────────────────────────────────
  const healthById = $derived(new Map(health.map((h) => [h.id, h])));
  const usageById = $derived(new Map(usage.map((u) => [u.tool, u])));
  const proxyById = $derived(new Map(proxyTools.map((p) => [p.id, p])));
  const targetById = $derived(new Map(targets.map((t) => [t.id, t])));

  const usageTotal = $derived(usage.reduce((s, u) => s + (u.totalTokens ?? 0), 0));
  const usdTotal = $derived(usage.reduce((s, u) => s + (u.estCostUsd ?? 0), 0));
  const installedCount = $derived(health.filter((h) => h.installed).length);
  const proxiedCount = $derived(proxyTools.filter((t) => t.proxy).length);

  function fmtTokens(n?: number): string {
    if (!n) return '—';
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return String(n);
  }
  function fmtUsd(n?: number): string {
    if (!n) return '$0';
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
    if (n >= 1) return `$${n.toFixed(0)}`;
    return `$${n.toFixed(2)}`;
  }
  const SURFACE_LABEL: Record<string, string> = { cli: 'CLI', desktop: 'Desktop' };

  async function load() {
    err = null;
    loading = true;
    try {
      const [d, u, p, l] = await Promise.all([
        client.get<DoctorResponse>('/v1/doctor'),
        client
          .get<{ rows: UsageRow[] }>('/v1/usage')
          .catch(() => ({ rows: [] as UsageRow[] })),
        client.get<ProxyResponse & { launchProxy?: string | null }>('/v1/proxy'),
        client.get<{ targets: Target[] }>('/v1/launch').catch(() => ({ targets: [] as Target[] })),
      ]);
      health = d.tools;
      usage = u.rows;
      proxySystem = p.system ?? {};
      proxyTools = p.tools;
      targets = l.targets;
      if (!proxy) proxy = p.launchProxy || p.system?.url || '';
    } catch (e: unknown) {
      err = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  // Persist the launch proxy so it's remembered next session.
  async function rememberProxy() {
    try {
      await client.post('/v1/launch-proxy', { url: proxy.trim() });
    } catch {
      /* non-fatal */
    }
  }

  async function go(kind: 'gui' | 'cli', t: Target) {
    const key = `${kind}:${t.id}`;
    busy = key;
    flash = null;
    try {
      if (kind === 'gui' && t.gui) {
        if (!proxy.trim()) throw new Error('Enter a proxy url first.');
        await client.post('/v1/gui/launch', { id: t.gui.id, url: proxy.trim() });
        flash = { id: t.id, ok: true, text: `Launched ${t.name} app.` };
      } else if (kind === 'cli' && t.cli) {
        await client.post('/v1/launch/cli', { tool: t.cli.toolId, url: proxy.trim() });
        flash = { id: t.id, ok: true, text: `Opened ${t.name} CLI.` };
      }
      void rememberProxy();
    } catch (e: unknown) {
      flash = { id: t.id, ok: false, text: e instanceof Error ? e.message : String(e) };
    } finally {
      busy = null;
    }
  }

  // Tray "Launch" submenu fires the SAME daemon endpoints via window.eval.
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
          /* launch without proxy */
        }
      }
      try {
        if (kind === 'gui') await client.post('/v1/gui/launch', { id, url });
        else await client.post('/v1/launch/cli', { tool: id, url });
      } catch {
        /* tray launch is fire-and-forget */
      }
    };
  });
</script>

<div class="panel">
  <header class="bar">
    <div class="brand">
      <svg class="glyph" viewBox="0 0 64 64" aria-hidden="true">
        <g fill="currentColor">
          <rect x="27" y="27" width="10" height="10" rx="2" />
          {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" transform={`rotate(${a} 32 32)`} />
          {/each}
        </g>
      </svg>
      <span class="mark">clihub</span>
    </div>
    <div class="right">
      <button class="open-main" title="Open the full app window" onclick={openMain}>Open app →</button>
      <button class="icon" title="Refresh" onclick={load} aria-label="Refresh">↻</button>
      <div class="swatches">
        {#each THEMES as t (t.id)}
          <button class="swatch" class:on={theme === t.id} style={`--sw:${t.swatch}`} title={t.id} aria-label={`theme ${t.id}`} onclick={() => (theme = t.id)}></button>
        {/each}
      </div>
    </div>
  </header>

  <!-- Tab bar: Overview + one per CLI (CodexBar-style) -->
  <nav class="tabs">
    <button class="tab" class:active={tab === 'overview'} onclick={() => (tab = 'overview')}>Overview</button>
    {#each CLIS as c (c.id)}
      {@const inst = healthById.get(c.id)?.installed}
      <button class="tab" class:active={tab === c.id} class:off={!inst} onclick={() => (tab = c.id)}>{c.label}</button>
    {/each}
  </nav>

  <div class="scroll">
    {#if err}<p class="error">Daemon: {err}</p>{/if}

    {#if tab === 'overview'}
      <!-- Coarse rollup across all CLIs -->
      <section>
        <h2>Health <span class="badge">{installedCount}/{CLIS.length}</span></h2>
        <div class="rows">
          {#each CLIS as c (c.id)}
            {@const h = healthById.get(c.id)}
            <button class="row click" class:off={!h?.installed} onclick={() => (tab = c.id)}>
              <span class="nm">{c.label}</span>
              <span class="meta">
                {#if h?.installed}<span class="ok">✓</span> {h.version ?? '?'}{:else}<span class="dim">not installed</span>{/if}
              </span>
              <span class="counts">{h?.installed ? `${h.skillCount ?? 0} sk · ${h.mcpCount ?? 0} mcp` : ''}</span>
            </button>
          {/each}
        </div>
      </section>

      <section>
        <h2>Totals</h2>
        <div class="stat2">
          <div><span class="k">Tokens</span><span class="v mono">{fmtTokens(usageTotal)}</span></div>
          <div><span class="k">Est. value</span><span class="v mono">{fmtUsd(usdTotal)}</span></div>
          <div><span class="k">Proxied</span><span class="v mono">{proxiedCount}/{proxyTools.length}</span></div>
          <div><span class="k">Installed</span><span class="v mono">{installedCount}/{CLIS.length}</span></div>
        </div>
        <p class="line">
          System proxy: {#if proxySystem.url}<code>{proxySystem.url}</code> <span class="dim">({proxySystem.source})</span>{:else}<span class="dim">none</span>{/if}
        </p>
        <p class="hint">est. value = tokens × public list prices, not your bill · local logs</p>
      </section>
    {:else}
      <!-- Per-CLI page: quick launch + detailed stats -->
      {@const c = CLIS.find((x) => x.id === tab)}
      {@const h = healthById.get(tab)}
      {@const u = usageById.get(tab)}
      {@const px = proxyById.get(tab)}
      {@const t = targetById.get(tab)}

      <section class="cli-head">
        <h2 class="title">{c?.label ?? tab}</h2>
        <span class="meta">
          {#if u?.plan}<span class="badge">{u.plan}</span> {/if}{#if h?.installed}<span class="ok">✓</span> {h.version ?? '?'}{:else}<span class="dim">not installed</span>{/if}
        </span>
      </section>

      <!-- Launch -->
      <section>
        <h2>Launch</h2>
        <label class="proxyrow">
          <span class="plabel">proxy</span>
          <input class="proxy" type="text" placeholder="http://host:port" bind:value={proxy} onchange={rememberProxy} />
        </label>
        {#if t}
          <div class="acts-row">
            {#if t.gui && t.gui.osSupported}
              <button
                class="act"
                disabled={!t.gui.installed || busy === `gui:${t.id}` || !proxy.trim()}
                title={t.gui.installed ? 'Open the desktop app with proxy' : 'desktop app not installed'}
                onclick={() => go('gui', t)}
              >{busy === `gui:${t.id}` ? '…' : 'App'}</button>
            {/if}
            {#if t.cli}
              <button
                class="act"
                disabled={!t.cli.installed || busy === `cli:${t.id}`}
                title={t.cli.installed ? 'Open the CLI in a terminal' : 'CLI not installed'}
                onclick={() => go('cli', t)}
              >{busy === `cli:${t.id}` ? '…' : 'Terminal'}</button>
            {/if}
            {#if !(t.gui && t.gui.osSupported) && !t.cli}<span class="dim">no launch method</span>{/if}
          </div>
          {#if flash && flash.id === t.id}<p class={flash.ok ? 'ok msg' : 'error'}>{flash.text}</p>{/if}
        {:else}
          <p class="dim small">Not launchable.</p>
        {/if}
      </section>

      <!-- Detailed stats -->
      <section>
        <h2>Usage <span class="badge">{fmtTokens(u?.totalTokens)} tok</span> <span class="badge">{fmtUsd(u?.estCostUsd)}{u?.partialCost ? '+' : ''} est</span></h2>
        {#if u?.supported}
          <div class="stat2">
            <div><span class="k">Input</span><span class="v mono">{fmtTokens(u.inputTokens)}</span></div>
            <div><span class="k">Output</span><span class="v mono">{fmtTokens(u.outputTokens)}</span></div>
            <div><span class="k">Cache</span><span class="v mono">{fmtTokens(u.cacheTokens)}</span></div>
            <div><span class="k">Sessions</span><span class="v mono">{u.sessions ?? '—'}</span></div>
          </div>
          {#if u.surfaces && u.surfaces.length > 1}
            <p class="surf-title">By surface</p>
            <div class="rows">
              {#each u.surfaces as s (s.surface)}
                <div class="row">
                  <span class="nm">{SURFACE_LABEL[s.surface] ?? s.surface}</span>
                  <span class="meta mono">{fmtTokens(s.totalTokens)} · {fmtUsd(s.estCostUsd)}</span>
                  <span class="counts">{s.sessions} sess</span>
                </div>
              {/each}
            </div>
          {/if}
          <p class="hint">{u.partialCost ? 'partial — some tokens used an unpriced model. ' : ''}est. value at public list prices, not your bill.</p>
        {:else}
          <p class="dim small">{u?.note ?? 'No usage parser for this CLI yet.'}</p>
        {/if}
      </section>

      <section>
        <h2>Config</h2>
        <div class="rows">
          <div class="row"><span class="nm">Skills</span><span class="meta mono">{h?.installed ? (h.skillCount ?? 0) : '—'}</span></div>
          <div class="row"><span class="nm">MCP servers</span><span class="meta mono">{h?.installed ? (h.mcpCount ?? 0) : '—'}</span></div>
          <div class="row">
            <span class="nm">Proxy</span>
            <span class="meta">{#if px?.proxy}<code>{px.proxy}</code>{:else if px && !px.supported}<span class="dim">shell env</span>{:else}<span class="dim">direct</span>{/if}</span>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono, ui-monospace, monospace);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--border);
    -webkit-app-region: drag;
  }
  .bar :global(button),
  .bar .swatches {
    -webkit-app-region: no-drag;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .glyph {
    width: 18px;
    height: 18px;
    color: var(--accent);
  }
  .mark {
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .open-main {
    font-family: var(--mono);
    font-size: 0.7rem;
    padding: 0.22rem 0.55rem;
    border: 1px solid var(--accent);
    background: var(--accent-bg);
    color: var(--accent-bright);
    border-radius: 5px;
  }
  .open-main:hover {
    background: var(--accent);
    color: var(--bg);
  }
  .icon {
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text-dim);
    border-radius: 5px;
    width: 1.7rem;
    height: 1.7rem;
    font-size: 0.9rem;
  }
  .icon:hover {
    color: var(--accent-bright);
    border-color: var(--accent);
  }
  .swatches {
    display: flex;
    gap: 0.25rem;
  }
  .swatch {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: var(--sw);
    padding: 0;
  }
  .swatch.on {
    box-shadow: 0 0 0 2px var(--bg), 0 0 0 3px var(--sw);
  }
  /* Tab bar — wraps to two rows in the narrow popover (CodexBar-style). */
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    font-family: var(--mono);
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text-dim);
    border-radius: 5px;
  }
  .tab:hover {
    color: var(--accent-bright);
    border-color: var(--accent);
  }
  .tab.active {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }
  .tab.off {
    opacity: 0.42;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem 0.7rem 0.9rem;
  }
  section {
    margin-top: 0.8rem;
  }
  .cli-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-top: 0.6rem;
  }
  .cli-head .title {
    font-size: 0.95rem;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text);
    margin: 0;
  }
  h2 {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin: 0 0 0.35rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .badge {
    font-size: 0.64rem;
    color: var(--text-dim);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    padding: 0.02rem 0.3rem;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.2rem 0.1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    font-size: 0.82rem;
    text-align: left;
  }
  button.row.click {
    background: transparent;
    border-left: 0;
    border-right: 0;
    border-top: 0;
    color: inherit;
    font-family: var(--mono);
    cursor: pointer;
    width: 100%;
  }
  button.row.click:hover {
    background: var(--accent-bg);
  }
  .row.off {
    opacity: 0.45;
  }
  .nm {
    font-weight: 600;
  }
  .meta {
    color: var(--text-dim);
    font-size: 0.76rem;
    justify-self: end;
  }
  .counts {
    color: var(--text-faint);
    font-size: 0.7rem;
    justify-self: end;
  }
  .mono {
    font-variant-numeric: tabular-nums;
  }
  .ok {
    color: var(--ok);
  }
  .dim {
    color: var(--text-faint);
  }
  .small {
    font-size: 0.74rem;
  }
  /* two-up stat grid */
  .stat2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem 0.8rem;
  }
  .stat2 > div {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    padding: 0.18rem 0;
  }
  .stat2 .k {
    font-size: 0.66rem;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .stat2 .v {
    font-size: 0.95rem;
    font-weight: 600;
  }
  .proxyrow {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.45rem;
  }
  .plabel {
    font-size: 0.7rem;
    color: var(--text-dim);
  }
  .proxy {
    flex: 1;
    min-width: 0;
    font-size: 0.74rem;
  }
  .acts-row {
    display: flex;
    gap: 0.4rem;
  }
  .act {
    font-size: 0.74rem;
    padding: 0.22rem 0.9rem;
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
  .line {
    font-size: 0.76rem;
    color: var(--text-dim);
    margin: 0.4rem 0 0.2rem;
  }
  .hint {
    font-size: 0.66rem;
    color: var(--text-faint);
    margin: 0.2rem 0 0;
  }
  .surf-title {
    font-size: 0.64rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin: 0.5rem 0 0.1rem;
  }
  .msg {
    font-size: 0.74rem;
    margin: 0.35rem 0 0;
  }
  code {
    color: var(--accent-bright);
    font-size: 0.74rem;
  }
  .error {
    color: var(--err);
    font-size: 0.76rem;
    margin: 0.35rem 0 0;
  }
</style>
