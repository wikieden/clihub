# Spec 01 — Declarative provider JSON (stable, v0.10.0)

A provider spec teaches clihub a new AI CLI without code or a fork. Specs
live in `~/.clihub/providers.json` or a catalog's `providers.json`.

## File shape

```json
{
  "version": 1,
  "providers": [ /* ProviderSpec[] */ ]
}
```

A bare top-level array is also accepted.

## ProviderSpec

| Field | Type | Req | Meaning |
|---|---|---|---|
| `id` | string | ✓ | `^[a-z0-9][a-z0-9-]*$`; must not collide with a built-in |
| `name` | string | ✓ | human label |
| `description` | string | | shown in `tool list` |
| `homepage` | string | | URL |
| `bin` | string | ✓ | binary used for detection + version probe |
| `versionArgs` | string[] | | args to print version (default `["--version"]`) |
| `supportedPlatforms` | string[] | | subset of `macos`,`linux`,`windows` |
| `install` | object | ✓ | at least one of `npm`,`bun`,`brew`,`script`,`command` |
| `configPath` | string | | optional JSON settings file (`~` expanded) |

## install methods

- `npm` / `bun` — package name → `npm install -g <pkg>` / `bun add -g <pkg>`
- `brew` — formula → `brew install <formula>`
- `script` / `command` — arbitrary shell. **Refused** unless the caller
  opts in (`--allow-scripts`); a federated catalog could ship a malicious
  one, so package-manager methods are the safe default.

## Detection contract

`detect()` resolves `bin` on `PATH`; if found, runs `bin versionArgs` and
parses a semver-ish version. Absent binary → `{ installed: false }`.

## Example

```json
{
  "version": 1,
  "providers": [
    {
      "id": "aider",
      "name": "Aider",
      "bin": "aider",
      "versionArgs": ["--version"],
      "install": { "brew": "aider" },
      "supportedPlatforms": ["macos", "linux"]
    }
  ]
}
```

Register with `clihub provider add <file.json>`; loaded automatically by
`tool` / `apply` / `status` commands.
