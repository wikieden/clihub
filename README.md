# Claude Code Statusline — Optimized for Embodied AI / Multi-Worktree Dev

Two-line, color-coded, dependency-light statusline for Claude Code. Built by surveying
the popular community solutions (ccstatusline, cc-statusline, CCometixLine, claude-powerline,
claude-hud, SippieCup gist) and distilling what actually moves the needle for long
architecture sessions and parallel worktree workflows.

## Layout

```
◆ opus·high 🧠 │ ⎇ l3-planner │ 🌿 main ±3 ↑2 │ #1234 pending │ ⚙ code-reviewer │ 🎨 plan-eng-review
ctx ▓▓▓▓░░░░░░  44% │ 5h ░░░░░░░░░░   0% │ wk ▓▓▓░░░░░░░  36% │ $2.31 · 2h10m  +156/-23
```

**Line 1 — identity & location** (what you're working on)
- `◆ opus·high 🧠` — model, effort level, thinking indicator
- `⚠1M` — appears when token count exceeds 200k (hint that you're in 1M-context territory)
- `⎇ l3-planner` — git worktree name (only if inside a linked worktree, otherwise shows directory)
- `🌿 main ±3 ↑2 ↓0` — branch, dirty file count, ahead/behind upstream
- `#1234 pending` — open PR with color-coded review state (green/yellow/red/dim)
- `⚙ code-reviewer` — active subagent (only when `--agent` is set)
- `🎨 plan-eng-review` — non-default output style / skill context

**Line 2 — resources** (what you're spending)
- `ctx ▓▓▓▓░░░░░░ 44%` — context window usage with 10-char progress bar
- `5h … 0%` — 5-hour rolling rate limit (Pro/Max subscribers only)
- `wk … 36%` — 7-day weekly rate limit
- `$2.31 · 2h10m` — estimated session cost + wall-clock duration
- `+156/-23` — lines added/removed by Claude this session

**Color thresholds** (intentionally earlier than defaults so you can act, not react):
- `< 50%` green
- `50–74%` yellow
- `75–89%` red
- `≥ 90%` bold red

## Install

```bash
# From the directory containing these files
./install.sh
```

The installer:
1. Verifies `jq` is installed (the only hard dependency)
2. Copies `statusline.sh` → `~/.claude/statusline.sh`
3. Backs up your existing `~/.claude/settings.json` with a timestamp
4. Deep-merges the `statusLine` config into your settings (preserves everything else)
5. Runs a smoke test with mock JSON to verify the script works

Restart Claude Code afterward, or just keep working — it auto-reloads on the next interaction.

## Why this design

The statusline's job is **passive awareness** of state that would otherwise require manual
checks (`/context`, `/cost`, `/model`, `git status`). The fields were chosen by asking:
"What surprises me mid-session that I wish I'd known earlier?"

| Choice | Reason |
|---|---|
| `git_worktree` over `cwd` basename | When juggling parallel feature branches in worktrees, the basename is meaningless — the worktree name is what tells you which branch you're on |
| `5h` + `wk` rate limits | Hitting weekly limits mid-architecture-conversation is catastrophic; seeing `wk:75%` 12+ hours early lets you pace yourself |
| 50/75 thresholds, not 70/90 | At 70% you're already too late to `/compact` cleanly without losing semantic continuity. 50% gives you a one-message-warning window |
| `effort` + `thinking` together | When mixing Doubao / DeepSeek / Qwen / Claude, the same `model.display_name` can mean very different token economics; effort+thinking flag makes this explicit |
| `output_style.name` displayed | If you use skills heavily, knowing which skill context is active prevents asking the wrong question for the loaded skill |
| `ahead/↑ behind/↓` from upstream | Catches the "I forgot to push" / "I forgot to pull" failure mode before it bites |
| Cached git ops (5s TTL, keyed by `session_id`) | `git status` in a large repo can take 200ms+ and run on every tick; caching keeps the statusline snappy |

## Customization

Open `~/.claude/statusline.sh` and edit. A few useful tweaks:

**Add a clock to line 1:**
```bash
CLOCK=$(date +%H:%M)
LINE1="${LINE1}${SEP}${DIM}${CLOCK}${RST}"
```
Combined with `"refreshInterval": 5` in settings.json, the clock updates every 5s even when idle.

**Show transcript path for quick `tail -f` debugging:**
```bash
TRANSCRIPT=$(j '.transcript_path // empty')
# add to LINE1: ${DIM}📜${TRANSCRIPT##*/}${RST}
```

**Change bar width** (replace `w=10` in the `bar()` function with `w=20` for wider bars).

**Per-project override:** add the same `statusLine` block to a project's `.claude/settings.json`
to override the user-level config for that repo.

## Troubleshooting

**Statusline doesn't appear**
- Run `claude --debug` and look for stderr from the script
- Verify `jq` is on `$PATH` inside Claude Code's shell environment
- Check that the workspace trust prompt has been accepted (statusline is gated by trust)

**`statusline skipped · restart to fix`**
- Workspace trust hasn't been accepted. Restart Claude Code and accept the trust dialog.

**Output is garbled or shows literal `\e[32m`**
- Your terminal doesn't support ANSI escape codes. Check `$TERM` (should be `xterm-256color` or similar).
- If running over SSH/tmux, ensure ANSI passthrough is enabled.

**Statusline is slow / stale**
- The script caches git operations for 5s. If you have a huge repo, increase `TTL=5` to `TTL=15` in `statusline.sh`.
- For background-subagent-heavy workflows, increase `refreshInterval` in settings.json (1 = every second; 5 = every 5s).

**Want to revert**
- All installed runs leave timestamped backups: `~/.claude/settings.json.bak.YYYYMMDD-HHMMSS`
- Restore: `cp ~/.claude/settings.json.bak.<timestamp> ~/.claude/settings.json` and `rm ~/.claude/statusline.sh`

## Comparison with community alternatives

| Tool | Lang | Startup | Strength | Why I didn't pick it |
|---|---|---|---|---|
| **This script** | bash + jq | ~10ms | zero extra tooling, fully readable, easy to edit | requires you to hand-edit for new features |
| ccstatusline | Node + TUI | 150-300ms | 30+ widgets, polished TUI configurator | startup latency is noticeable on every tick; another tool to install/update |
| CCometixLine | Rust | <20ms | very fast, has its own TUI | binary distribution; less customizable without rebuilding |
| claude-statusline | Go | <20ms | TOML config, single binary | similar to above; smaller widget set |
| cc-statusline | bash | ~10ms | beautiful default output | hardcoded 3-line layout, less worktree-aware |

If you outgrow this script (e.g. want a TUI config editor, more widgets, MCP integration),
**ccstatusline** is the path of least regret — same JSON contract, just swap the `command` field.

## References

- [Official statusline docs](https://docs.claude.com/en/docs/claude-code/statusline)
- [ccstatusline](https://github.com/sirmalloc/ccstatusline)
- [CCometixLine](https://github.com/Haleclipse/CCometixLine)
- [claude-statusline (Go)](https://felipeelias.github.io/2026/03/17/claude-statusline.html)
- [Yiğit Konur statusline comparison (2026-04-16)](https://yigitkonur.com/research/claude-code-statuslines-compared)
