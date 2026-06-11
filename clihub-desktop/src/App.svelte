<script lang="ts">
  import Dashboard from './panels/Dashboard.svelte';
  import Endpoints from './panels/Endpoints.svelte';
  import Drift from './panels/Drift.svelte';
  import Mcp from './panels/Mcp.svelte';
  import Skills from './panels/Skills.svelte';
  import Profiles from './panels/Profiles.svelte';
  import Versions from './panels/Versions.svelte';
  import Yaml from './panels/Yaml.svelte';

  type Panel = 'dashboard' | 'drift' | 'endpoints' | 'mcp' | 'skills' | 'profiles' | 'versions' | 'yaml';

  const PANELS: Panel[] = ['dashboard', 'drift', 'endpoints', 'mcp', 'skills', 'profiles', 'versions', 'yaml'];

  /** Deep-linkable panel via location.hash (#/mcp) — also lets Tauri deep links land on a panel. */
  function panelFromHash(): Panel {
    const h = location.hash.replace(/^#\/?/, '') as Panel;
    return PANELS.includes(h) ? h : 'dashboard';
  }

  // Lead panels = health + drift (the moat), never a provider dropdown first.
  let panel = $state<Panel>(panelFromHash());

  function select(id: Panel) {
    panel = id;
    location.hash = `/${id}`;
  }

  const tabs: { id: Panel; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'drift', label: 'Drift' },
    { id: 'endpoints', label: 'Endpoints' },
    { id: 'mcp', label: 'MCP' },
    { id: 'skills', label: 'Skills' },
    { id: 'profiles', label: 'Profiles' },
    { id: 'versions', label: 'Versions' },
    { id: 'yaml', label: 'Yaml' },
  ];
</script>

<div class="shell">
  <nav>
    <span class="brand">clihub</span>
    {#each tabs as tab (tab.id)}
      <button class:active={panel === tab.id} onclick={() => select(tab.id)}>{tab.label}</button>
    {/each}
  </nav>
  <main>
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
    {/if}
  </main>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  nav {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: #fff;
    border-bottom: 1px solid #e3e3e6;
  }
  .brand {
    font-weight: 700;
    margin-right: 1rem;
  }
  nav button {
    border: none;
    background: transparent;
    padding: 0.4rem 0.8rem;
    border-radius: 6px;
    color: #444;
  }
  nav button.active {
    background: #1c1c1e;
    color: #fff;
  }
  main {
    flex: 1;
    padding: 1rem;
  }
</style>
