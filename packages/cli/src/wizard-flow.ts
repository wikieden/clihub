/**
 * Interactive first-run wizard flow (v1.17 → reusable in v1.18).
 *
 * `runWizard()` is callable both from the `clihub wizard` command and the
 * TUI main menu, so newcomers can re-run setup any time. Self-contained:
 * loads declarative providers, drives the @clack prompts, and executes
 * install / proxy / accounts / config-generation.
 */
import path from 'node:path';

export interface RunWizardOpts {
  dryRun?: boolean;
}

export async function runWizard(opts: RunWizardOpts = {}): Promise<void> {
  const p = await import('@clack/prompts');
  const core = await import('@clihub/core');
  const {
    listProviders, getProvider, CatalogLoader,
    setConfigKey, createProfile, useProfile, setSecret,
    planWizard, generateClihubYaml, clihubYamlSchemaJson, memoryTemplate,
    loadExternalProviders, defaultCatalogDir,
  } = core;
  const fsp = await import('node:fs/promises');

  // load declarative providers (best-effort)
  try { await loadExternalProviders({ catalogDir: defaultCatalogDir() }); } catch { /* ignore */ }

  const bail = (v: unknown): void => { if (p.isCancel(v)) { p.cancel('cancelled'); process.exit(0); } };

  p.intro('clihub wizard — setup');

  // 1. CLIs
  const providers = listProviders();
  const detected = new Map<string, boolean>();
  for (const pr of providers) detected.set(pr.id, (await pr.detect()).installed);
  const tools = await p.multiselect({
    message: 'Which AI CLIs do you want?',
    options: providers.map((pr) => ({ value: pr.id, label: pr.name, hint: detected.get(pr.id) ? 'installed' : undefined })),
    initialValues: providers.filter((pr) => detected.get(pr.id)).map((pr) => pr.id),
    required: false,
  });
  bail(tools);
  const toolIds = (tools as string[]).length > 0 ? (tools as string[]) : ['claude-code'];

  // 2. preset
  const catalog = await new CatalogLoader().load();
  const preset = await p.select({
    message: 'Pick a preset (bundles skills)',
    options: [{ value: '', label: 'none' }, ...catalog.presets.map((pr) => ({ value: pr.id, label: pr.name, hint: `${pr.skills.length} skills: ${pr.skills.join(', ')}` }))],
    initialValue: 'starter',
  });
  bail(preset);
  const presetId = (preset as string) || undefined;

  // 2b. per-CLI skill selection (optional)
  const perToolSkills: Record<string, string[]> = {};
  const wantPerCli = await p.confirm({ message: 'Pick skills per CLI (otherwise the preset applies to all)?', initialValue: false });
  bail(wantPerCli);
  if (wantPerCli) {
    for (const toolId of toolIds) {
      const supported = catalog.skills.filter((sk) => sk.supports?.[toolId]);
      if (supported.length === 0) continue;
      const picked = await p.multiselect({
        message: `Skills for ${toolId}`,
        options: supported.map((sk) => ({ value: sk.id, label: sk.name, hint: sk.description })),
        required: false,
      });
      bail(picked);
      if ((picked as string[]).length > 0) perToolSkills[toolId] = picked as string[];
    }
  }

  // 3. proxy (pre-filled from the detected system/terminal proxy)
  let proxy: string | undefined;
  const sysProxy = await core.detectSystemProxy().catch(() => ({ source: 'none' as const, url: undefined as string | undefined }));
  const detectMsg = sysProxy.url ? `Configure a proxy for the CLIs? (detected ${sysProxy.source}: ${sysProxy.url})` : 'Configure an HTTP/HTTPS/SOCKS5 proxy for the CLIs?';
  const wantProxy = await p.confirm({ message: detectMsg, initialValue: Boolean(sysProxy.url) });
  bail(wantProxy);
  if (wantProxy) {
    const url = await p.text({ message: 'Proxy URL', placeholder: 'http://proxy.corp:8080 or socks5://user:pass@host:1080', initialValue: sysProxy.url ?? '' });
    bail(url);
    proxy = (url as string).trim() || undefined;
  }

  // 4. accounts (multi-profile + multiple keys each)
  const accounts: Array<{ profile: string; keys: Array<{ name: string; value: string }> }> = [];
  let addMore = await p.confirm({ message: 'Set up account profiles (work / personal / client)?', initialValue: false });
  bail(addMore);
  while (addMore) {
    const name = await p.text({ message: 'Profile name', placeholder: 'work' });
    bail(name);
    const profile = (name as string).trim();
    if (profile) {
      const keys: Array<{ name: string; value: string }> = [];
      let addKey = true;
      while (addKey) {
        const keyName = await p.text({ message: `API key env var for "${profile}" (blank = done)`, placeholder: 'ANTHROPIC_API_KEY' });
        bail(keyName);
        const kn = (keyName as string).trim();
        if (!kn) break;
        const val = await p.password({ message: `Value for ${kn}` });
        bail(val);
        keys.push({ name: kn, value: val as string });
        addKey = (await p.confirm({ message: `Add another key for "${profile}"?`, initialValue: false })) as boolean;
        bail(addKey);
      }
      accounts.push({ profile, keys });
    }
    addMore = await p.confirm({ message: 'Add another profile?', initialValue: false });
    bail(addMore);
  }

  // 5. config artifacts
  const schema = await p.confirm({ message: 'Add a JSON Schema for clihub.yaml (editor autocomplete)?', initialValue: true });
  bail(schema);
  const memory = await p.confirm({ message: 'Write a clihub.memory.md template (one source → every CLI)?', initialValue: true });
  bail(memory);
  const scaffold = await p.confirm({ message: 'Write project starter files (.editorconfig, .gitignore, CI)?', initialValue: false });
  bail(scaffold);

  const plan = planWizard({
    tools: toolIds,
    preset: presetId,
    perToolSkills,
    proxy,
    accounts: accounts.map((a) => ({ profile: a.profile, apiKeyNames: a.keys.map((k) => k.name) })),
    schema: schema as boolean,
    memory: memory as boolean,
    scaffold: scaffold as boolean,
  });
  p.note(plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'), 'Plan');

  if (opts.dryRun) { p.outro('dry run — nothing changed'); return; }
  const go = await p.confirm({ message: 'Proceed?', initialValue: true });
  bail(go);
  if (!go) { p.cancel('aborted'); return; }

  // execute
  for (const id of toolIds) {
    if (detected.get(id)) continue;
    const pr = getProvider(id);
    if (!pr) continue;
    try { await pr.install({}); p.log.success(`installed ${id}`); } catch (e) { p.log.warn(`install ${id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (proxy) {
    await setConfigKey('proxy.http', proxy);
    await setConfigKey('proxy.https', proxy);
    for (const id of toolIds) {
      try { await core.setToolProxy(id, proxy); } catch { /* settings write may fail for some CLIs */ }
    }
    p.log.success(`proxy → ${proxy} (global + injected into ${toolIds.join(', ')})`);
  }
  for (const a of accounts) {
    try { await createProfile(a.profile, {}); } catch { /* exists */ }
    for (const k of a.keys) {
      try { await setSecret(a.profile, k.name, k.value); p.log.success(`stored ${k.name} for ${a.profile}`); }
      catch (e) { p.log.warn(`key ${a.profile}/${k.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    p.log.success(`profile ${a.profile}`);
  }
  if (accounts.length > 0) { try { await useProfile(accounts[0]!.profile, {}); p.log.success(`active profile → ${accounts[0]!.profile}`); } catch { /* ignore */ } }

  const cwd = process.cwd();
  const yaml = generateClihubYaml({ profile: accounts[0]?.profile, preset: presetId, tools: toolIds, schema: schema as boolean });
  await fsp.writeFile(path.join(cwd, 'clihub.yaml'), yaml, 'utf8');
  p.log.success('wrote clihub.yaml');
  if (schema) { await fsp.writeFile(path.join(cwd, 'clihub.schema.json'), clihubYamlSchemaJson(), 'utf8'); p.log.success('wrote clihub.schema.json'); }
  if (memory) {
    const memPath = path.join(cwd, 'clihub.memory.md');
    const memExists = await fsp.access(memPath).then(() => true).catch(() => false);
    if (!memExists) { await fsp.writeFile(memPath, memoryTemplate(), 'utf8'); p.log.success('wrote clihub.memory.md'); }
  }
  if (scaffold) {
    const res = await core.writeScaffold(cwd);
    for (const f of res.written) p.log.success(`wrote ${f}`);
    for (const f of res.skipped) p.log.info(`kept existing ${f}`);
  }
  p.outro('Done. Run `clihub apply` to install the preset, `clihub memory generate` to fan out memory.');
  const { maybeStarNudge } = await import('./star-nudge.js');
  await maybeStarNudge().catch(() => {});
}
