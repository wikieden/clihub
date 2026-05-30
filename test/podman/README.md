# clihub test environment (podman) — real CLIs

A throwaway container that installs **the real AI CLIs** — Claude Code, Gemini,
Codex — from npm, then exercises clihub against them. No stubs: `doctor`,
`proxy`, `skill`, `mcp`, `config` operate on real binaries and real config files
(`~/.claude`, `~/.gemini`, `~/.codex`). Nothing touches your host machine.

> Installing the CLIs needs no login. Running an actual *coding session* does —
> that part is out of scope (no API keys in the container).

This is **separate** from the root `./Dockerfile` (the end-user distribution
image with `ENTRYPOINT clihub`).

## Quick start

```bash
cd test/podman

./run.sh report          # build + automated real-CLI report (non-interactive)
./run.sh shell           # build + interactive shell → run `clihub wizard`
./run.sh report 1.32.0   # pin a specific published clihub version
```

Use `ENGINE=docker ./run.sh report` if you prefer docker.

## What the report asserts (on real CLIs / real files)

- the three CLIs report a real `--version` (proves they are not stubs)
- `doctor` detects them with their real versions
- `proxy set` writes the proxy into the real `~/.claude/settings.json`
- `skill install` creates a real `~/.claude/skills/<id>/` directory
- `mcp add` lands in the real Gemini config
- `preset apply starter` runs the real skill installs
- auto-backup (opt-in) + `config restore` round-trip on the real settings file

## Interactive testing (wizard + TUI)

```bash
./run.sh shell
# inside the container (real CLIs already installed):
clihub wizard        # walk guided setup; note awkward prompts
clihub               # TUI menu — Set proxy, Run CLI, navigation
clihub tool install kiro-cli   # install another real CLI (runs as root)
```

`--rm` means every run starts clean. To persist a HOME between runs:

```bash
podman run --rm -it -v clihub-home:/root clihub-test bash
```

## Notes

- Runs as root so `clihub tool install` and ad-hoc `npm i -g` work without sudo.
- `CLIHUB_NO_NUDGE=1` is set so the GitHub-star prompt never fires.
- Auto-backup is opt-in: `CLIHUB_BACKUP=1` or `clihub config set backup.auto true`.
