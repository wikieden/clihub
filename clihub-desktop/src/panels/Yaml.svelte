<script lang="ts">
  import { DaemonClient } from '../lib/daemon';
  import type { StatusResponse } from '../lib/types';

  const client = new DaemonClient();

  let dir = $state('');
  let file = $state<string | null>(null);
  let content = $state('');
  let savedContent = $state('');
  let drift = $state<StatusResponse | null>(null);
  let status = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  const dirty = $derived(content !== savedContent);

  async function load() {
    error = null;
    status = null;
    const q = dir.trim() ? `?dir=${encodeURIComponent(dir.trim())}` : '';
    try {
      const res = await client.get<{ file: string; content: string }>(`/v1/yaml${q}`);
      file = res.file;
      content = res.content;
      savedContent = res.content;
    } catch (e: unknown) {
      file = null;
      error = e instanceof Error ? e.message : String(e);
      return;
    }
    // Drift banner is best-effort — the editor stays usable without a lockfile.
    try {
      drift = await client.get<StatusResponse>(`/v1/status${q}`);
    } catch {
      drift = null;
    }
  }

  $effect(() => {
    load();
  });

  async function save() {
    busy = true;
    error = null;
    status = null;
    try {
      const res = await client.post<{ file: string; tools: number; skills: number }>('/v1/yaml', {
        content,
        ...(dir.trim() ? { dir: dir.trim() } : {}),
      });
      savedContent = content;
      status = `saved ${res.file} (${res.tools} tools, ${res.skills} skills) — run Apply or \`clihub apply\` to converge.`;
      await load();
    } catch (e: unknown) {
      // A parse failure 400s and writes nothing — the editor keeps the draft.
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<section>
  <h1>clihub.yaml</h1>
  <p class="hint">
    The declarative source of truth — the previous content is snapshotted before
    every save; converge with <code>clihub apply</code> / <code>install --frozen</code>.
  </p>

  <div class="toolbar">
    <input type="text" placeholder="project dir (absolute; empty = daemon cwd discovery)" bind:value={dir} />
    <button class="ghost" onclick={() => load()}>Load</button>
    <button disabled={busy || !dirty || !file} onclick={() => save()}>
      {busy ? 'Saving…' : dirty ? 'Save' : 'Saved'}
    </button>
  </div>

  {#if drift && !drift.compliant}
    <p class="banner">
      ⚠ {drift.drift} drift / {drift.missing} missing vs clihub.lock.json — this machine
      diverges from the pinned toolchain (<code>clihub install --frozen</code> to converge).
    </p>
  {:else if drift?.compliant}
    <p class="banner ok">✓ compliant with clihub.lock.json</p>
  {/if}

  {#if error}<p class="error">{error}</p>{/if}
  {#if status}<p class="status">{status}</p>{/if}

  {#if file}
    <p class="file"><code>{file}</code>{#if dirty}<span class="dirty"> · unsaved changes</span>{/if}</p>
    <textarea bind:value={content} spellcheck="false" rows="24"></textarea>
  {/if}
</section>

<style>
  .hint {
    font-size: 0.8rem;
    color: #888;
    margin: 0.25rem 0 0.75rem;
  }
  .toolbar {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }
  .toolbar input {
    flex: 1;
    font: inherit;
    font-size: 0.82rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid #ddd;
    border-radius: 6px;
  }
  .banner {
    background: #fff8e1;
    border: 1px solid #e3c98a;
    color: #9a6700;
    border-radius: 6px;
    padding: 0.45rem 0.7rem;
    font-size: 0.82rem;
  }
  .banner.ok {
    background: #f0fff4;
    border-color: #bde5c8;
    color: #1e7e34;
  }
  .file {
    font-size: 0.78rem;
    color: #888;
    margin: 0.4rem 0;
  }
  .dirty {
    color: #9a6700;
  }
  textarea {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.82rem;
    line-height: 1.45;
    padding: 0.6rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #fff;
    resize: vertical;
    box-sizing: border-box;
  }
  button {
    border: 1px solid #1c1c1e;
    background: #1c1c1e;
    color: #fff;
    padding: 0.3rem 0.8rem;
    border-radius: 6px;
    font-size: 0.82rem;
  }
  button.ghost {
    background: #fff;
    color: #1c1c1e;
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
