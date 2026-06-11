<script lang="ts">
  import Dashboard from './panels/Dashboard.svelte';
  import Endpoints from './panels/Endpoints.svelte';
  import Drift from './panels/Drift.svelte';
  import Mcp from './panels/Mcp.svelte';
  import Skills from './panels/Skills.svelte';
  import Profiles from './panels/Profiles.svelte';
  import Versions from './panels/Versions.svelte';
  import Yaml from './panels/Yaml.svelte';
  import SyncTeam from './panels/SyncTeam.svelte';

  type Panel = 'dashboard' | 'drift' | 'endpoints' | 'mcp' | 'skills' | 'profiles' | 'versions' | 'yaml' | 'sync';

  const PANELS: Panel[] = ['dashboard', 'drift', 'endpoints', 'mcp', 'skills', 'profiles', 'versions', 'yaml', 'sync'];

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
      <span class="mark">clihub</span><span class="caret">▮</span>
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
    <div class="foot">7 CLIs · pinned &amp; drift-gated</div>
  </aside>
  <main>
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
