---
description: Open the clihub configuration manager menu
argument-hint: "[subcommand], e.g. install MCP codegraph / show config / backup"
---

Please use the clihub skill to handle: $ARGUMENTS

If $ARGUMENTS is empty, first run `clihub config show` to summarize current
configuration, then ask the user what they want to change (as a checklist).

Available top-level intents (route via the clihub skill table):
- list / install / uninstall tools (`clihub tool ...`)
- list / install / uninstall skills (`clihub skill ...`)
- apply a preset (`clihub preset apply <id>`)
- doctor (`clihub doctor`)
- backup / restore / rollback (`clihub backup`, `clihub restore <id>`, `clihub rollback`)
