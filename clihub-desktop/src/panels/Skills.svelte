<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { SkillsResponse, SkillToolRow } from '../lib/types';

  const client = new DaemonClient();

  let rows = $state<SkillToolRow[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let filter = $state('');

  const visible = $derived(
    rows.map((row) => ({
      ...row,
      skills: filter
        ? row.skills.filter(
            (s) =>
              s.id.toLowerCase().includes(filter.toLowerCase()) ||
              s.name.toLowerCase().includes(filter.toLowerCase()),
          )
        : row.skills,
    })),
  );

  $effect(() => {
    client
      .get<SkillsResponse>('/v1/skills')
      .then((d) => {
        rows = d.tools;
        loading = false;
      })
      .catch((e: unknown) => {
        error = e instanceof Error ? e.message : String(e);
        loading = false;
      });
  });
</script>

<section>
  <h1>Skills</h1>
  {#if loading}
    <p>Loading skills…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <input class="filter" type="search" placeholder="Filter skills…" bind:value={filter} />
    {#each visible as row (row.tool)}
      <div class="tool">
        <h2>{row.tool} <span class="count">{row.skills.length}</span></h2>
        {#if !row.installed}
          <p class="muted">CLI not installed</p>
        {:else if row.error}
          <p class="error">{row.error}</p>
        {:else if row.skills.length === 0}
          <p class="muted">{filter ? 'no match' : 'no skills installed'}</p>
        {:else}
          <ul>
            {#each row.skills as s (s.id)}
              <li>
                <code>{s.id}</code>
                {s.name !== s.id ? s.name : ''}
                {#if s.version && s.version !== 'unknown'}<span class="muted">{s.version}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/each}
  {/if}
</section>

<style>
  .filter {
    width: 100%;
    padding: 0.45rem 0.7rem;
    margin-bottom: 0.6rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    font: inherit;
    background: #fff;
  }
  .tool {
    background: #fff;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
  .tool h2 {
    font-size: 0.95rem;
    margin: 0 0 0.25rem;
  }
  .count {
    font-size: 0.8rem;
    color: #888;
    font-weight: 400;
  }
  ul {
    margin: 0;
    padding-left: 1.2rem;
    max-height: 14rem;
    overflow-y: auto;
  }
  .muted {
    color: #888;
  }
  .error {
    color: #c0392b;
  }
</style>
