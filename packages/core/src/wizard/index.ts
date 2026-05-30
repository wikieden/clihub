/**
 * `clihub wizard` planning core (v1.17.0, first-run guided setup — skeleton).
 *
 * The interactive shell lives in the CLI; this module is the pure,
 * testable part: turn the answers a newcomer gives into (a) the
 * `clihub.yaml` to write and (b) an ordered, human-readable list of the
 * actions the wizard will perform, for the confirm screen and `--dry-run`.
 *
 * Skeleton scope (this release): install CLIs, apply a preset, configure a
 * proxy, create accounts (profiles) + one API key each, emit clihub.yaml /
 * schema / memory. Project scaffold files and multi-key-per-account loops
 * are stubbed steps to be filled in follow-up versions.
 */
import { generateClihubYaml } from '../init/index.js';

export interface WizardAccount {
  /** Profile name (e.g. work / personal / client-x). */
  profile: string;
  /** API key names to store in this profile's keychain (one or many). */
  apiKeyNames?: string[];
}

export interface WizardAnswers {
  tools: string[];
  preset?: string;
  /** Proxy URL applied to every CLI (http/https/socks5). */
  proxy?: string;
  accounts?: WizardAccount[];
  /** Emit clihub.schema.json + header. */
  schema?: boolean;
  /** Emit a clihub.memory.md template. */
  memory?: boolean;
  /** Emit project scaffold files (AGENTS.md, .editorconfig, ...). */
  scaffold?: boolean;
}

export interface WizardPlan {
  /** The clihub.yaml document to write. */
  yaml: string;
  /** Ordered, human-readable actions the wizard will perform. */
  steps: string[];
}

export function planWizard(answers: WizardAnswers): WizardPlan {
  const tools = answers.tools.length > 0 ? answers.tools : ['claude-code'];
  const activeProfile = answers.accounts && answers.accounts.length > 0 ? answers.accounts[0]!.profile : undefined;

  const steps: string[] = [];
  steps.push(`Install CLIs: ${tools.join(', ')}`);
  if (answers.preset) steps.push(`Apply preset: ${answers.preset}`);
  if (answers.proxy) steps.push(`Set proxy for every CLI: ${answers.proxy}`);
  for (const acct of answers.accounts ?? []) {
    const keys = acct.apiKeyNames ?? [];
    steps.push(`Create account profile: ${acct.profile}${keys.length > 0 ? ` (+ ${keys.length} key${keys.length > 1 ? 's' : ''}: ${keys.join(', ')})` : ''}`);
  }
  steps.push('Write clihub.yaml');
  if (answers.schema) steps.push('Write clihub.schema.json (+ schema header)');
  if (answers.memory) steps.push('Write clihub.memory.md template');
  if (answers.scaffold) steps.push('Write project scaffold (AGENTS.md, .editorconfig, .gitignore)');

  const yaml = generateClihubYaml({
    profile: activeProfile,
    preset: answers.preset,
    tools,
    schema: answers.schema,
  });

  return { yaml, steps };
}

/** A minimal clihub.memory.md template for the wizard to write. */
export function memoryTemplate(): string {
  return [
    '# Project agent instructions',
    '',
    'Shared rules for every AI CLI in this project. Edit me, then run',
    '`clihub memory generate` to fan out to CLAUDE.md / AGENTS.md / GEMINI.md / …',
    '',
    '- Use the project\'s existing code style.',
    '- Run tests before committing.',
    '- Keep changes small and reviewable.',
    '',
  ].join('\n');
}
