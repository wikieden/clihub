<script lang="ts">
  import Dashboard from './panels/Dashboard.svelte';
  import Endpoints from './panels/Endpoints.svelte';

  type Panel = 'dashboard' | 'endpoints';

  // Lead panel = Dashboard (drift / health), never a provider dropdown first.
  let panel = $state<Panel>('dashboard');

  const tabs: { id: Panel; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'endpoints', label: 'Endpoints' },
  ];
</script>

<div class="shell">
  <nav>
    <span class="brand">clihub</span>
    {#each tabs as tab (tab.id)}
      <button class:active={panel === tab.id} onclick={() => (panel = tab.id)}>{tab.label}</button>
    {/each}
  </nav>
  <main>
    {#if panel === 'dashboard'}
      <Dashboard />
    {:else if panel === 'endpoints'}
      <Endpoints />
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
