<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { ProfilesResponse } from '../lib/types';

  const client = new DaemonClient();

  let profiles = $state<string[]>([]);
  let current = $state<string | null>(null);
  let error = $state<string | null>(null);
  let status = $state<string | null>(null);
  let busy = $state<string | null>(null);

  async function load() {
    try {
      const d = await client.get<ProfilesResponse>('/v1/profiles');
      profiles = d.profiles;
      current = d.current;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    load();
  });

  async function use(name: string) {
    busy = name;
    error = null;
    status = null;
    try {
      const r = await client.post<{ archived: string[] }>('/v1/profile/use', { name });
      status =
        r.archived.length > 0
          ? `Switched to ${name} — archived (never deleted): ${r.archived.join(', ')}`
          : `Switched to ${name}`;
      await load();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }
</script>

<section>
  <h1>Profiles</h1>
  {#if error}<p class="error">{error}</p>{/if}
  {#if status}<p class="status">{status}</p>{/if}
  {#if profiles.length === 0}
    <p class="muted">No profiles yet — create one with <code>clihub profile create &lt;name&gt;</code>.</p>
  {:else}
    <ul>
      {#each profiles as p (p)}
        <li class:active={p === current}>
          <span>{p} {p === current ? '· active' : ''}</span>
          {#if p !== current}
            <!-- Disable ALL switches while one is in flight — concurrent vendor-dir
                 symlink swaps would race on the same real config dirs. -->
            <button disabled={busy !== null} onclick={() => use(p)}>{busy === p ? 'Switching…' : 'Use'}</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--border);
    border-left: 2px solid transparent;
    font-family: var(--mono);
    font-size: 0.85rem;
  }
  li:last-child {
    border-bottom: none;
  }
  li.active {
    border-left-color: var(--ok);
    background: var(--ok-bg);
    color: var(--ok);
    font-weight: 600;
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
  .muted {
    color: var(--text-dim);
  }
  .error {
    color: var(--err);
  }
  .status {
    color: var(--ok);
  }
</style>
