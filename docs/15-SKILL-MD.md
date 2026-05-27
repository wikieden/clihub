# SKILL.md (agentskills.io) compatibility

clihub installs skills authored as plain `SKILL.md` files following the
open [agentskills.io](https://agentskills.io) standard. A SKILL.md is
markdown with a small YAML frontmatter block:

```markdown
---
name: my-skill
description: One-line description of when to apply this skill.
version: 1.0.0
license: MIT
allowed-tools: Read, Bash, Edit
tags:
  - workflow
  - testing
---

# My Skill

Free-form markdown body. The agent loads this when the
`description` matches the user's request (progressive disclosure).
```

## Supported install sources

`clihub skill install <id|git-url|path>` accepts three forms:

| Form | Example | Behaviour |
|---|---|---|
| Catalog id | `clihub skill install tdd` | Look up `tdd` in the bundled (or synced) `skills.json` and install via the matching per-CLI adapters. |
| Git URL | `clihub skill install https://github.com/foo/bar.git` | Clone to `~/.clihub/skill-md-cache/<hash>/`, find SKILL.md, install. Re-running pulls the latest revision. |
| Local path | `clihub skill install ./my-skill` or `clihub skill install ~/skills/tdd/SKILL.md` | Read SKILL.md (or the SKILL.md inside the directory) and install. |

Paths can point at:

- A SKILL.md file directly.
- A directory containing SKILL.md at its root.
- A directory containing one of `skills/`, `.claude/skills/`, or
  `claude/skills/` with `<id>/SKILL.md` underneath. The first match
  wins; clihub picks the first SKILL.md it encounters.

## Frontmatter fields

clihub honours the following fields (everything else is preserved
verbatim and ignored):

| Field | Required | clihub's use |
|---|---|---|
| `name` | yes | Skill display name. If `id` is missing it becomes the slugified `name`. |
| `description` | yes | One-line skill summary; shown in `clihub skill list` and used by the agent for progressive disclosure. |
| `version` | no | Stored on the manifest. Defaults to `latest` if missing. |
| `license` | no | Recorded but not enforced. |
| `tags` (list) or `allowed-tools` (comma-separated) | no | Coalesced into the manifest's `tags[]` for catalog search. |

Frontmatter formats supported by clihub's mini-parser:

- Plain scalars: `key: value`, with optional quoting (`"value"` or `'value'`).
- Comma-separated inline lists: `allowed-tools: Read, Bash, Edit` → `["Read", "Bash", "Edit"]`.
- YAML block lists:
  ```yaml
  tags:
    - one
    - two
  ```
- YAML block scalars:
  ```yaml
  description: |
    A multi-line description.
    Second line.
  ```

Nested mappings are not supported. If your SKILL.md needs them, file an
issue with a real-world example.

## Cross-CLI defaults

A SKILL.md is treated as **vendor-neutral**. By default clihub marks it
supported on every known CLI:

- `claude-code`
- `codex`
- `kiro-cli`
- `gemini-cli`

To narrow this, pass `--tool <cli>` on the command line:

```bash
clihub skill install https://github.com/foo/bar.git --tool claude-code
```

## On-disk layout after install

`clihub skill install` calls the per-CLI `SkillSyncAdapter`, which
writes the skill into the CLI's native skills directory. For Claude
Code that is `~/.claude/skills/<id>/SKILL.md` (plus any sibling files
from the source dir).

## Skill caches

Git-URL installs clone into `~/.clihub/skill-md-cache/<sha1-of-url>/`.
Subsequent installs of the same URL `git pull --ff-only` instead of
re-cloning. To force a clean rebuild, remove the cache dir:

```bash
rm -rf ~/.clihub/skill-md-cache/<hash>/
```

## What clihub does **not** do

- It does not execute scripts bundled inside the SKILL.md repo at
  install time (no `postinstall` or build step).
- It does not validate `allowed-tools` against the running CLI's tool
  list — that is the CLI's responsibility at runtime.
- It does not auto-detect MCP server requirements from the body. Add
  them to `packages/catalog/mcp.json` separately and reference them in
  the body if needed.

## Authoring tips

- Keep `description` action-oriented and condition-bearing — that is
  what the agent loads at discovery.
- One SKILL.md per concept. Bundles of skills belong in a *plugin*
  (`clihub plugin install`), not a single SKILL.md.
- If your skill is CLI-specific, override `supports` by publishing it
  in `skills.json` instead of using the bare SKILL.md path.

## Pointers

- Standard home: <https://agentskills.io>
- Spec: <https://agentskills.io/specification>
- clihub parser: [`packages/core/src/skill-md/parser.ts`](../packages/core/src/skill-md/parser.ts)
- clihub manifest converter: [`packages/core/src/skill-md/manifest.ts`](../packages/core/src/skill-md/manifest.ts)
