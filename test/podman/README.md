# clihub test environment (podman)

A throwaway container that mimics a brand-new developer machine — so test runs
and experience reports are precise and never touch your real `~/.claude`,
`~/.codex`, Keychain, etc.

This is **separate** from the root `./Dockerfile` (that one is the end-user
distribution image with `ENTRYPOINT clihub`). This harness adds:

- stub CLIs (`claude`, `codex`, `gemini`, `goose`, `kiro`, `cursor-agent`) on
  PATH so `doctor` / proxy / config flows exercise the "CLI installed" paths,
- an automated non-interactive report (`report.sh`),
- an interactive shell entry for the wizard / TUI (which need a real TTY).

## Quick start

```bash
cd test/podman

./run.sh report          # build + automated newcomer report (non-interactive)
./run.sh shell           # build + interactive shell → run `clihub wizard`
./run.sh report 1.30.0   # pin a specific published version
./run.sh bare            # a "nothing installed yet" machine, then report
```

Use `ENGINE=docker ./run.sh report` if you prefer docker.

## What the report covers

`report.sh` checks the flows that can run without a TTY: version/help banner,
`doctor` matrix + stub detection, `recommend`, the newcomer guard rails
(unknown-command suggestion, friendly non-TTY messages), `init` scaffolding,
and the auto-backup → `config restore` round-trip.

## Interactive testing (wizard + TUI)

```bash
./run.sh shell
# inside the container:
clihub wizard        # walk the guided setup; note any awkward prompts
clihub               # the TUI menu — try Set proxy, Run CLI, navigation
```

Because the container is `--rm`, every run starts from a clean state. Nothing
persists to the host. To keep a HOME between runs, mount a volume:

```bash
podman run --rm -it -v clihub-home:/home/dev clihub-test bash
```

## Notes

- Stubs answer `--version` only; they are not the real proprietary CLIs, so
  `clihub tool install` / actually launching a CLI is out of scope here.
- `CLIHUB_NO_NUDGE=1` is set so the GitHub-star prompt never fires in CI.
- Set `CLIHUB_NO_BACKUP=1` to test the no-auto-backup path.
