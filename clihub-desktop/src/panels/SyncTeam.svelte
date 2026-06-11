<script lang="ts">
  import { DaemonClient } from '../lib/daemon';

  const client = new DaemonClient();

  let teams = $state<string[]>([]);
  let newName = $state('');
  let newUrl = $state('');
  let passphrase = $state('');
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state<string | null>(null);

  async function load() {
    try {
      teams = (await client.get<{ teams: string[] }>('/v1/teams')).teams;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    load();
  });

  async function run(label: string, fn: () => Promise<string>) {
    busy = label;
    status = null;
    error = null;
    try {
      status = await fn();
      await load();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  const addTeam = () =>
    run('add', async () => {
      const res = await client.post<{ name: string; dir: string }>('/v1/team/add', {
        name: newName.trim(),
        gitUrl: newUrl.trim(),
      });
      newName = '';
      newUrl = '';
      return `team "${res.name}" cloned to ${res.dir}`;
    });

  const pull = (name: string) =>
    run(`pull:${name}`, async () => {
      await client.post('/v1/team/pull', { name });
      return `pulled latest config for "${name}" — apply it to a project with \`clihub team use ${name}\``;
    });

  const remove = (name: string) =>
    run(`rm:${name}`, async () => {
      await client.post('/v1/team/rm', { name });
      return `removed team "${name}"`;
    });

  const exportBundle = () =>
    run('export', async () => {
      const res = await client.post<{ file: string; files: number }>('/v1/sync/export', {
        passphrase,
      });
      passphrase = '';
      return `encrypted bundle (${res.files} files) → ${res.file}`;
    });
</script>

<section>
  <h1>Sync / Team</h1>
  {#if error}<p class="error">{error}</p>{/if}
  {#if status}<p class="status">{status}</p>{/if}

  <h2>Team config repos</h2>
  <p class="hint">
    Share clihub config across a team via a git repo — mirrors <code>clihub team</code>.
    Applying a team's config into a project stays on the CLI: <code>clihub team use &lt;name&gt;</code>.
  </p>
  {#if teams.length === 0}
    <p class="none">no teams registered</p>
  {:else}
    <ul class="teams">
      {#each teams as name (name)}
        <li>
          <strong>{name}</strong>
          <span class="grow"></span>
          <button class="ghost" disabled={busy !== null} onclick={() => pull(name)}>
            {busy === `pull:${name}` ? 'Pulling…' : 'Pull'}
          </button>
          <button class="ghost danger" disabled={busy !== null} onclick={() => remove(name)}>Remove</button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="row">
    <input type="text" placeholder="team name" bind:value={newName} />
    <input type="text" class="grow" placeholder="git url (git@… or https://…)" bind:value={newUrl} />
    <button disabled={busy !== null || !newName.trim() || !newUrl.trim()} onclick={addTeam}>
      {busy === 'add' ? 'Cloning…' : 'Add team'}
    </button>
  </div>

  <h2>Encrypted sync export</h2>
  <p class="hint">
    E2E-encrypted bundle of profiles + sources + config (AES-256-GCM, keys redacted
    before packing). Written under <code>~/.clihub/</code> (0600). Restore on another
    machine with <code>clihub sync import &lt;file&gt;</code>.
  </p>
  <div class="row">
    <input type="password" class="grow" placeholder="passphrase" bind:value={passphrase} />
    <button disabled={busy !== null || passphrase.length === 0} onclick={exportBundle}>
      {busy === 'export' ? 'Exporting…' : 'Export'}
    </button>
  </div>
</section>

<style>
  h2 {
    margin: 1.2rem 0 0.2rem;
  }
  .hint {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin: 0.15rem 0 0.6rem;
  }
  .none {
    color: var(--text-faint);
    font-size: 0.85rem;
    font-style: italic;
  }
  .teams {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .teams li {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.7rem;
    border-bottom: 1px solid var(--border);
    font-family: var(--mono);
    font-size: 0.85rem;
  }
  .teams li:last-child {
    border-bottom: none;
  }
  .grow {
    flex: 1;
  }
  .row {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }
  /* Add team / Export are primary actions — amber signal. */
  button {
    white-space: nowrap;
    border-color: var(--accent);
    background: var(--accent-bg);
    color: var(--accent-bright);
  }
  button:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
  }
  button.ghost {
    border-color: var(--border-strong);
    background: transparent;
    color: var(--text-dim);
  }
  button.ghost:hover:not(:disabled) {
    background: transparent;
    border-color: var(--accent);
    color: var(--accent-bright);
  }
  button.ghost.danger {
    color: var(--err);
    border-color: var(--err);
  }
  button.ghost.danger:hover:not(:disabled) {
    background: var(--err-bg);
    border-color: var(--err);
    color: var(--err);
  }
  .error {
    color: var(--err);
  }
  .status {
    color: var(--ok);
  }
</style>
