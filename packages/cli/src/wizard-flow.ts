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
    options: [{ value: '', label: 'none' }, ...catalog.presets.map((pr) => ({ value: pr.id, label: pr.name, hint: pr.description }))],
    initialValue: 'starter',
  });
  bail(preset);
  const presetId = (preset as string) || undefined;

  // 3. proxy
  let proxy: string | undefined;
  const wantProxy = await p.confirm({ message: 'Configure an HTTP/HTTPS/SOCKS5 proxy for the CLIs?', initialValue: false });
  bail(wantProxy);
  if (wantProxy) {
    const url = await p.text({ message: 'Proxy URL', placeholder: 'http://proxy.corp:8080 or socks5://user:pass@host:1080' });
    bail(url);
    proxy = (url as string).trim() || undefined;
  }

  // 4. accounts (multi-profile + one key each)
  const accounts: Array<{ profile: string; apiKeyName?: string; apiKeyValue?: string }> = [];
  let addMore = await p.confirm({ message: 'Set up account profiles (work / personal / client)?', initialValue: false });
  bail(addMore);
  while (addMore) {
    const name = await p.text({ message: 'Profile name', placeholder: 'work' });
    bail(name);
    const profile = (name as string).trim();
    if (profile) {
      const keyName = await p.text({ message: `API key env var for "${profile}" (blank to skip)`, placeholder: 'ANTHROPIC_API_KEY' });
      bail(keyName);
      const acct: { profile: string; apiKeyName?: string; apiKeyValue?: string } = { profile };
      if ((keyName as string).trim()) {
        const val = await p.password({ message: `Value for ${(keyName as string).trim()}` });
        bail(val);
        acct.apiKeyName = (keyName as string).trim();
        acct.apiKeyValue = val as string;
      }
      accounts.push(acct);
    }
    addMore = await p.confirm({ message: 'Add another profile?', initialValue: false });
    bail(addMore);
  }

  // 5. config artifacts
  const schema = await p.confirm({ message: 'Add a JSON Schema for clihub.yaml (editor autocomplete)?', initialValue: true });
  bail(schema);
  const memory = await p.confirm({ message: 'Write a clihub.memory.md template (one source → every CLI)?', initialValue: true });
  bail(memory);

  const plan = planWizard({
    tools: toolIds,
    preset: presetId,
    proxy,
    accounts: accounts.map((a) => ({ profile: a.profile, apiKeyName: a.apiKeyName })),
    schema: schema as boolean,
    memory: memory as boolean,
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
    p.log.success(`proxy set: ${proxy}`);
  }
  for (const a of accounts) {
    try { await createProfile(a.profile, {}); } catch { /* exists */ }
    if (a.apiKeyName && a.apiKeyValue) {
      try { await setSecret(a.profile, a.apiKeyName, a.apiKeyValue); p.log.success(`stored ${a.apiKeyName} for ${a.profile}`); }
      catch (e) { p.log.warn(`key ${a.profile}: ${e instanceof Error ? e.message : String(e)}`); }
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
  p.outro('Done. Run `clihub apply` to install the preset, `clihub memory generate` to fan out memory.');
}
