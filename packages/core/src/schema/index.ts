/**
 * clihub.yaml JSON Schema (v0.12.0).
 *
 * A draft-07 schema for `clihub.yaml`, so editors with the YAML language
 * server give autocomplete + inline validation. Emit it with
 * `clihub schema --out clihub.schema.json`, then point your file at it:
 *
 *   # yaml-language-server: $schema=./clihub.schema.json
 *
 * Hand-authored to match the subset parsed by `parseClihubYaml`.
 */

export const CLIHUB_YAML_SCHEMA_ID = 'https://wikieden.github.io/clihub/clihub.schema.json';

export const clihubYamlSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: CLIHUB_YAML_SCHEMA_ID,
  title: 'clihub.yaml',
  description: 'Declarative config for clihub: the CLIs, skills, presets, MCP servers and plugins a machine should have.',
  type: 'object',
  additionalProperties: false,
  properties: {
    version: { type: 'integer', enum: [1], description: 'Schema version. Always 1.' },
    profile: { type: 'string', description: 'clihub profile to activate before applying.' },
    tools: {
      type: 'array',
      description: 'AI CLIs to install (provider id, optionally pinned).',
      items: {
        oneOf: [
          { type: 'string', description: 'Provider id, e.g. claude-code.' },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
              id: { type: 'string' },
              version: { type: 'string', description: 'Exact version to pin, or "latest".' },
              method: { type: 'string', enum: ['npm', 'bun', 'brew', 'apt', 'curl'] },
            },
          },
        ],
      },
    },
    skills: {
      type: 'array',
      description: 'Skills to fan out across the installed CLIs.',
      items: {
        oneOf: [
          { type: 'string', description: 'Catalog skill id.' },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', description: 'Catalog skill id.' },
              source: { type: 'string', description: 'git URL or local path (alternative to id).' },
              tool: { type: 'string', description: 'Restrict to one CLI (provider id).' },
            },
          },
        ],
      },
    },
    presets: {
      type: 'array',
      description: 'Preset ids that bundle tools + skills + MCP.',
      items: { type: 'string' },
    },
    mcp: {
      type: 'array',
      description: 'MCP servers to register.',
      items: {
        oneOf: [
          { type: 'string', description: 'Catalog MCP server id.' },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              transport: { type: 'string', enum: ['stdio', 'http', 'sse'] },
              url: { type: 'string', description: 'Endpoint for http/sse transports.' },
              command: { type: 'string', description: 'Executable for stdio transport.' },
            },
          },
        ],
      },
    },
    plugins: {
      type: 'array',
      description: 'Plugins to install (catalog id; optional tool/branch).',
      items: {
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: {
              id: { type: 'string' },
              tool: { type: 'string' },
              branch: { type: 'string' },
            },
          },
        ],
      },
    },
    proxy: {
      type: 'object',
      additionalProperties: false,
      description: 'Proxy settings injected into each CLI environment.',
      properties: {
        inherit: { type: 'boolean' },
        http: { type: 'string' },
        https: { type: 'string' },
        noProxy: { type: 'string' },
      },
    },
  },
} as const;

/** The schema as a pretty-printed JSON string (with trailing newline). */
export function clihubYamlSchemaJson(): string {
  return JSON.stringify(clihubYamlSchema, null, 2) + '\n';
}
