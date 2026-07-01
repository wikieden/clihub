<script lang="ts">
  import Dashboard from './panels/Dashboard.svelte';
  import Endpoints from './panels/Endpoints.svelte';
  import Drift from './panels/Drift.svelte';
  import Mcp from './panels/Mcp.svelte';
  import Skills from './panels/Skills.svelte';
  import Profiles from './panels/Profiles.svelte';
  import Proxy from './panels/Proxy.svelte';
  import ProxyApps from './panels/ProxyApps.svelte';
  import Auth from './panels/Auth.svelte';
  import Memory from './panels/Memory.svelte';
  import Prompt from './panels/Prompt.svelte';
  import Versions from './panels/Versions.svelte';
  import Yaml from './panels/Yaml.svelte';
  import SyncTeam from './panels/SyncTeam.svelte';
  import Launcher from './Launcher.svelte';

  type Panel = 'dashboard' | 'drift' | 'endpoints' | 'mcp' | 'skills' | 'profiles' | 'proxy' | 'proxy-apps' | 'auth' | 'memory' | 'prompt' | 'versions' | 'yaml' | 'sync';

  const PANELS: Panel[] = ['dashboard', 'drift', 'endpoints', 'mcp', 'skills', 'profiles', 'proxy', 'proxy-apps', 'auth', 'memory', 'prompt', 'versions', 'yaml', 'sync'];

  /** Deep-linkable panel via location.hash (#/mcp) — also lets Tauri deep links land on a panel. */
  function panelFromHash(): Panel {
    const h = location.hash.replace(/^#\/?/, '') as Panel;
    return PANELS.includes(h) ? h : 'dashboard';
  }

  // Lead panels = health + drift (the moat), never a provider dropdown first.
  let panel = $state<Panel>(panelFromHash());

  // React to runtime hash changes too — a Tauri deep link landing on an
  // already-open window must switch panels, not just a fresh page load.
  $effect(() => {
    const onHash = () => {
      panel = panelFromHash();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  function select(id: Panel) {
    panel = id;
    location.hash = `/${id}`;
  }

  // Multi-theme: four palettes share one token contract (app.css); switching
  // data-theme on <html> restyles every panel. Persisted across launches.
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

  const groups: { label: string; items: { id: Panel; label: string }[] }[] = [
    {
      label: 'observe',
      items: [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'drift', label: 'Drift' },
        { id: 'versions', label: 'Versions' },
      ],
    },
    {
      label: 'control',
      items: [
        { id: 'endpoints', label: 'Endpoints' },
        { id: 'mcp', label: 'MCP' },
        { id: 'skills', label: 'Skills' },
        { id: 'profiles', label: 'Profiles' },
        { id: 'proxy', label: 'Proxy' },
        { id: 'proxy-apps', label: 'Desktop Apps' },
        { id: 'auth', label: 'Auth' },
        { id: 'memory', label: 'Memory' },
        { id: 'prompt', label: 'Prompt' },
      ],
    },
    {
      label: 'source',
      items: [
        { id: 'yaml', label: 'clihub.yaml' },
        { id: 'sync', label: 'Sync / Team' },
      ],
    },
  ];
</script>

<div class="shell">
  <aside>
    <div class="brand">
      <div class="lockup">
        <svg class="glyph" viewBox="0 0 64 64" aria-hidden="true">
          <g fill="currentColor">
            <rect x="27" y="27" width="10" height="10" rx="2" />
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" />
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" transform="rotate(45 32 32)" />
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" transform="rotate(90 32 32)" />
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" transform="rotate(135 32 32)" />
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" transform="rotate(180 32 32)" />
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" transform="rotate(225 32 32)" />
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" transform="rotate(270 32 32)" />
            <rect x="29.75" y="8" width="4.5" height="12" rx="2" transform="rotate(315 32 32)" />
          </g>
        </svg>
        <span class="mark">clihub</span><span class="caret">▮</span>
      </div>
      <span class="tag">ai-cli control plane</span>
    </div>
    <nav>
      {#each groups as group (group.label)}
        <div class="group">
          <span class="label">{group.label}</span>
          {#each group.items as tab (tab.id)}
            <button class:active={panel === tab.id} onclick={() => select(tab.id)}>{tab.label}</button>
          {/each}
        </div>
      {/each}
    </nav>
    <div class="theme">
      <span class="label">theme</span>
      <div class="swatches">
        {#each THEMES as t (t.id)}
          <button
            class="swatch"
            class:on={theme === t.id}
            style={`--sw: ${t.swatch}`}
            title={t.id}
            aria-label={`theme: ${t.id}`}
            onclick={() => (theme = t.id)}
          ></button>
        {/each}
      </div>
    </div>
    <div class="foot">8 CLIs · pinned &amp; drift-gated</div>
  </aside>
  <main>
    <header class="topbar">
      <span class="crumb">{panel}</span>
      <Launcher />
    </header>
    {#key panel}
      <div class="page">
        {#if panel === 'dashboard'}
          <Dashboard />
        {:else if panel === 'drift'}
          <Drift />
        {:else if panel === 'endpoints'}
          <Endpoints />
        {:else if panel === 'mcp'}
          <Mcp />
        {:else if panel === 'skills'}
          <Skills />
        {:else if panel === 'profiles'}
          <Profiles />
        {:else if panel === 'proxy'}
          <Proxy />
        {:else if panel === 'proxy-apps'}
          <ProxyApps />
        {:else if panel === 'auth'}
          <Auth />
        {:else if panel === 'memory'}
          <Memory />
        {:else if panel === 'prompt'}
          <Prompt />
        {:else if panel === 'versions'}
          <Versions />
        {:else if panel === 'yaml'}
          <Yaml />
        {:else if panel === 'sync'}
          <SyncTeam />
        {/if}
      </div>
    {/key}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 200px 1fr;
    min-height: 100vh;
  }

  /* -- sidebar: raised dark column with faint scanlines ------------------ */
  aside {
    display: flex;
    flex-direction: column;
    background:
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 3px),
      var(--bg-raised);
    border-right: 1px solid var(--border);
    padding: 1rem 0.7rem 0.8rem;
    position: sticky;
    top: 0;
    height: 100vh;
  }

  .brand {
    padding: 0 0.5rem 1.1rem;
  }

  .lockup {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .glyph {
    width: 19px;
    height: 19px;
    flex: none;
    color: var(--accent);
  }

  .mark {
    font-family: var(--mono);
    font-size: 1.12rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .caret {
    color: var(--accent);
    font-size: 1rem;
    animation: blink 1.2s steps(2) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .tag {
    display: block;
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-top: 0.15rem;
  }

  nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .group {
    display: flex;
    flex-direction: column;
  }

  .label {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding: 0 0.5rem 0.3rem;
  }

  nav button {
    text-align: left;
    font-family: var(--mono);
    font-size: 0.8rem;
    color: var(--text-dim);
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0 var(--radius) var(--radius) 0;
    padding: 0.34rem 0.55rem;
    transition:
      color 120ms ease,
      background 120ms ease,
      border-color 120ms ease;
  }

  nav button:hover:not(:disabled) {
    color: var(--text);
    border-left-color: var(--border-strong);
  }

  nav button.active {
    color: var(--accent-bright);
    background: var(--accent-bg);
    border-left-color: var(--accent);
  }

  .theme {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.5rem 0.6rem;
  }

  .theme .label {
    padding: 0;
  }

  .swatches {
    display: flex;
    gap: 0.35rem;
  }

  .swatch {
    width: 14px;
    height: 14px;
    padding: 0;
    border-radius: 50%;
    background: var(--sw);
    border: 1px solid transparent;
    opacity: 0.55;
    transition:
      opacity 120ms ease,
      box-shadow 120ms ease;
  }

  .swatch:hover:not(:disabled) {
    opacity: 1;
    border-color: transparent;
    color: inherit;
  }

  .swatch.on {
    opacity: 1;
    box-shadow: 0 0 0 2px var(--bg-raised), 0 0 0 3px var(--sw);
  }

  .foot {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    padding: 0.8rem 0.5rem 0;
    border-top: 1px solid var(--border);
  }

  /* -- content ------------------------------------------------------------ */
  main {
    padding: 1.4rem 1.6rem 2rem;
    min-width: 0;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: -0.4rem 0 1rem;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--border);
  }
  .crumb {
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .page {
    max-width: 1100px;
    animation: rise 220ms ease both;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
  }
</style>
