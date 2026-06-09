<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { EndpointsResponse, EndpointPreset } from '../lib/types';

  const client = new DaemonClient();

  let endpoints = $state<EndpointPreset[]>([]);
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);

  async function load() {
    try {
      endpoints = (await client.get<EndpointsResponse>('/v1/endpoints')).endpoints;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    load();
  });

  async function use(id: string) {
    busy = id;
    status = null;
    error = null;
    try {
      await client.post('/v1/endpoint/use', { id });
      status = `Active endpoint set to ${id}`;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }
</script>

<section>
  <h1>Endpoints</h1>
  {#if error}<p class="error">{error}</p>{/if}
  {#if status}<p class="status">{status}</p>{/if}
  <ul>
    {#each endpoints as ep (ep.id)}
      <li>
        <div class="meta">
          <strong>{ep.label}</strong>
          <span class="family">{ep.family}</span>
          <code>{ep.baseURL}</code>
        </div>
        <button disabled={busy === ep.id} onclick={() => use(ep.id)}>
          {busy === ep.id ? 'Switching…' : 'Use'}
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.75rem;
    background: #fff;
    border-bottom: 1px solid #eee;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .family {
    font-size: 0.75rem;
    color: #888;
  }
  code {
    font-size: 0.8rem;
    color: #555;
  }
  button {
    border: 1px solid #1c1c1e;
    background: #1c1c1e;
    color: #fff;
    padding: 0.35rem 0.9rem;
    border-radius: 6px;
  }
  button:disabled {
    opacity: 0.5;
  }
  .error {
    color: #c0392b;
  }
  .status {
    color: #1e7e34;
  }
</style>
