<script lang="ts">
  import { DaemonClient } from './lib/daemon';
  import type { DoctorResponse, HealthRow, ProxyResponse, ProxyToolRow, SystemProxyRow } from './lib/types';
  import Launcher from './Launcher.svelte';

  const client = new DaemonClient();

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

  // ── panel data ──────────────────────────────────────────────────────────
  type UsageRow = {
    tool: string;
    label: string;
    supported: boolean;
    totalTokens?: number;
    note?: string;
  };
  let health = $state<HealthRow[]>([]);
  let proxySystem = $state<Partial<SystemProxyRow>>({});
  let proxyTools = $state<ProxyToolRow[]>([]);
  let usage = $state<UsageRow[]>([]);
  let usageTotal = $state<number>(0);
  let err = $state<string | null>(null);
  let loading = $state(true);

  function fmtTokens(n?: number): string {
    if (!n) return '—';
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return String(n);
  }
  const prettyId = (id: string) =>
    ({ 'claude-code': 'Claude Code', 'kiro-cli': 'Kiro', 'gemini-cli': 'Gemini', 'qwen-code': 'Qwen', codex: 'Codex', cursor: 'Cursor', goose: 'Goose', opencode: 'OpenCode' })[id] ?? id;

  async function load() {
    err = null;
    loading = true;
    try {
      const [d, p, u] = await Promise.all([
        client.get<DoctorResponse>('/v1/doctor'),
        client.get<ProxyResponse>('/v1/proxy'),
        client
          .get<{ rows: UsageRow[]; totals: { totalTokens: number } }>('/v1/usage')
          .catch(() => ({ rows: [] as UsageRow[], totals: { totalTokens: 0 } })),
      ]);
      health = d.tools;
      proxySystem = p.system ?? {};
      proxyTools = p.tools;
      usage = u.rows;
      usageTotal = u.totals?.totalTokens ?? 0;
    } catch (e: unknown) {
      err = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  const proxiedCount = $derived(proxyTools.filter((t) => t.proxy).length);
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
      <Launcher />
      <button class="icon" title="Refresh" onclick={load} aria-label="Refresh">↻</button>
      <div class="swatches">
        {#each THEMES as t (t.id)}
          <button class="swatch" class:on={theme === t.id} style={`--sw:${t.swatch}`} title={t.id} aria-label={`theme ${t.id}`} onclick={() => (theme = t.id)}></button>
        {/each}
      </div>
    </div>
  </header>

  <div class="scroll">
    {#if err}<p class="error">Daemon: {err}</p>{/if}

    <!-- Health -->
    <section>
      <h2>Health</h2>
      <div class="rows">
        {#each health as r (r.id)}
          <div class="row" class:off={!r.installed}>
            <span class="nm">{prettyId(r.id)}</span>
            <span class="meta">
              {#if r.installed}<span class="ok">✓</span> {r.version ?? '?'}{:else}<span class="dim">not installed</span>{/if}
            </span>
            <span class="counts">{r.installed ? `${r.skillCount ?? 0} sk · ${r.mcpCount ?? 0} mcp` : ''}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- Proxy -->
    <section>
      <h2>Proxy <span class="badge">{proxiedCount}/{proxyTools.length}</span></h2>
      <p class="line">
        System: {#if proxySystem.url}<code>{proxySystem.url}</code> <span class="dim">({proxySystem.source})</span>{:else}<span class="dim">none</span>{/if}
      </p>
      <div class="rows">
        {#each proxyTools.filter((t) => t.installed) as t (t.id)}
          <div class="row">
            <span class="nm">{t.name}</span>
            <span class="meta">{#if t.proxy}<code>{t.proxy}</code>{:else if !t.supported}<span class="dim">shell env</span>{:else}<span class="dim">direct</span>{/if}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- Usage -->
    <section>
      <h2>Usage <span class="badge">{fmtTokens(usageTotal)} tok</span></h2>
      <p class="hint">30-day token rollup from local logs · tokens only, never $.</p>
      <div class="rows">
        {#each usage.filter((u) => u.supported) as u (u.tool)}
          <div class="row">
            <span class="nm">{u.label}</span>
            <span class="meta mono">{fmtTokens(u.totalTokens)}</span>
          </div>
        {/each}
        {#if usage.filter((u) => u.supported).length === 0 && !loading}
          <p class="dim small">No local usage logs found.</p>
        {/if}
      </div>
    </section>
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
    padding: 0.55rem 0.7rem;
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
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.4rem 0.7rem 0.9rem;
  }
  section {
    margin-top: 0.8rem;
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
    padding: 0.18rem 0.1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    font-size: 0.82rem;
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
  .line {
    font-size: 0.78rem;
    color: var(--text-dim);
    margin: 0 0 0.3rem;
  }
  .hint {
    font-size: 0.68rem;
    color: var(--text-faint);
    margin: 0 0 0.3rem;
  }
  code {
    color: var(--accent-bright);
    font-size: 0.74rem;
  }
  .error {
    color: var(--err);
    font-size: 0.78rem;
  }
</style>
