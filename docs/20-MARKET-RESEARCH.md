# Market research (2026-05) — HN / Reddit / V2EX demand audit

Snapshot of the last 90 days of public complaints about multi-CLI AI
coding workflows. Drives the re-prioritised v0.5 → v0.8 roadmap in
[`11-ROADMAP.md`](11-ROADMAP.md) and `Sprint 6+` in
[`14-SPRINT.md`](14-SPRINT.md).

Status legend: ✅ shipped · 🚧 on roadmap · ⚠️ partial · ❌ uncovered.

## Top 10 pain points

| # | Theme | Complaint signal | Coverage |
|---|---|---|---|
| 1 | Skill format drift | dev.to: "Your SKILL.md works in Claude Code but silently fails in VS Code". Codex CLI wants extra `openai.yaml`; Claude reads `model` / `hooks` frontmatter; others choke. | ⚠️ clihub installs across CLIs, no per-CLI lint/normalisation |
| 2 | No cross-machine sync | GH [#36693](https://github.com/anthropics/claude-code/issues/36693) "No native way to sync config / skills across machines" + GH [#57678](https://github.com/anthropics/claude-code/issues/57678) "Add cloud sync". Hundreds of upvotes; users hand-roll dotfiles. | ❌ — covered in new **v0.8** (Pillar XI) |
| 3 | Multi-account / multi-provider switching | [cc-switch 75K stars](https://www.augmentcode.com/learn/cc-switch-75k-stars-ai-cli-manager) + V2EX [t/1154494](https://v2ex.com/t/1154494) "claude code 多配置一键切换" + [t/1209512](https://fast.v2ex.com/t/1209512). Massive China-dev signal. | 🚧 **v0.5.2 — headline feature** |
| 4 | Corporate proxy / TLS CA | Multiple guides + GH [#4053](https://github.com/anthropics/claude-code/issues/4053) on SSL cert config; recurrent r/ClaudeAI Zscaler / CrowdStrike threads. | 🚧 v0.5.1 |
| 5 | OAuth token expiry loop | HN [45770183](https://news.ycombinator.com/item?id=45770183), GH [#19078](https://github.com/anthropics/claude-code/issues/19078), GH [#33811](https://github.com/anthropics/claude-code/issues/33811), GH [#34306](https://github.com/anthropics/claude-code/issues/34306). | 🚧 v0.5.2 — strengthen recovery flow |
| 6 | Quota burn opacity | HN [47586176](https://news.ycombinator.com/item?id=47586176), [47626833](https://news.ycombinator.com/item?id=47626833); MacRumors 2026-03-26 rapid-burn report. Users want live meter. | 🚧 **new in v0.5.1** — live quota in `doctor` |
| 7 | Auto-update broken / version drift | GH [#62130](https://github.com/anthropics/claude-code/issues/62130). Users fragmented across builds, no rollback. | ❌ → 🚧 **new in v0.5.3** — `clihub install <tool>@<ver>` + per-tool `rollback` |
| 8 | "Claude Code is getting worse" → want previous build | HN [47936579](https://news.ycombinator.com/item?id=47936579), [47878905](https://news.ycombinator.com/item?id=47878905), [47660925](https://news.ycombinator.com/item?id=47660925). | ❌ → 🚧 **v0.5.3 version pinning** addresses this |
| 9 | Skill supply chain | HN [48057842](https://news.ycombinator.com/item?id=48057842) on CVE-2026-39861 sandbox escape via symlink; Reversec "Compromising Claude Code with malicious skills" series; HN [45611559](https://news.ycombinator.com/item?id=45611559) on the trust model. | ⚠️ catalog sha256 done; 🚧 v0.6 sigstore + **new v0.6 skill audit** |
| 10 | Skill sprawl / no inventory | DEV "How I stopped Claude from cloning entire repos"; awesome-claude-code-toolkit lists 135 agents + 35 skills + 176 plugins. Users install 100+, can't audit what's loaded. | ❌ → 🚧 **new in v0.6** — `clihub skill list --loaded --by-cli --permissions` |

## Surprise demand (not previously on the roadmap)

1. **Live quota / session meter** — most-asked observability gap. Trivial extension of `doctor`. → v0.5.1.
2. **Provider / gateway abstraction** (Nyro, LiteLLM, ACM, cc-switch). Huge Chinese-dev demand. → **Not building the data plane** (see anti-pattern below); only the config-adapter side (write `ANTHROPIC_BASE_URL` etc. per profile in v0.5.2).
3. **CLI version pinning + rollback** — `clihub install claude-code@1.2.3`, `clihub rollback claude-code`. nvm-style UX. → v0.5.3.
4. **Skill audit / inventory dashboard** — what's loaded, by which CLI, with what hooks / permissions. → v0.6.
5. **Unified memory file generator** — single `CONTEXT.md` → emit `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` / `.kiro/steering/`. Codifies the SKILL.md fragmentation pain. → **new v0.7** deliverable.

## One thing we deliberately do NOT build, despite demand

**LLM gateway / provider router** (compete with Nyro / LiteLLM / cc-switch on data plane).

- Puts clihub in the request path → failure mode becomes "clihub broke my session" rather than "clihub manages files on disk".
- Breaks vendor neutrality: routing Claude Code traffic to OpenRouter invites ToS friction with Anthropic, whom we want as a catalog partner.
- LiteLLM / Nyro / cc-switch already dominate this lane; competing means perpetual catch-up on protocol drift.
- Better play: **config adapter** (v0.5.2 profiles + `BASE_URL` injection) and let users point at LiteLLM themselves. Stay out of the data plane.

## Re-prioritisation summary

| Version | Old plan | New plan after research |
|---|---|---|
| v0.5.1 | proxy + CA + ease | proxy + CA + ease + **live quota meter** |
| v0.5.2 | profile + keychain (Pillar IX) | **headline: profile switching (cc-switch competitor)** + keychain + OAuth recovery + per-profile BASE_URL injection |
| v0.5.3 | clihub.yaml + lockfile + apply | + **CLI version pin + rollback** |
| v0.6 | federation + sigstore + team mode | + **skill audit / inventory** |
| v0.7 | provider SDK + RFC drafts | + **unified memory file generator** (`clihub memory generate`) |
| v0.8 | (was unset) | **NEW — cross-machine sync (Pillar XI), E2E encrypted, opt-in cloud or self-host** |

## Sources

### Anthropic / Claude Code

- [HN — usage limits "way faster than expected"](https://news.ycombinator.com/item?id=47586176)
- [HN — Is Claude Code getting worse?](https://news.ycombinator.com/item?id=47936579)
- [HN — Quality reports update](https://news.ycombinator.com/item?id=47878905)
- [HN — Feb updates unusable for complex tasks](https://news.ycombinator.com/item?id=47660925)
- [HN — Moving on now that Claude Code is rate-limited](https://news.ycombinator.com/item?id=47626833)
- [HN — OAuth token expired, /login leads to broken page](https://news.ycombinator.com/item?id=45770183)
- [HN — Sandbox escape via symlink CVE-2026-39861](https://news.ycombinator.com/item?id=48057842)
- [HN — Claude skills depend on developers](https://news.ycombinator.com/item?id=45611559)
- [GH #36693 — No native way to sync config / skills](https://github.com/anthropics/claude-code/issues/36693)
- [GH #57678 — Add cloud sync for skills / settings / memory](https://github.com/anthropics/claude-code/issues/57678)
- [GH #62130 — Auto-update failed banner](https://github.com/anthropics/claude-code/issues/62130)
- [GH #33811 — OAuth expired, no CLI recovery path](https://github.com/anthropics/claude-code/issues/33811)
- [GH #34306 — Forces re-login after every PC restart](https://github.com/anthropics/claude-code/issues/34306)
- [GH #4053 — SSL cert config under corporate proxy](https://github.com/anthropics/claude-code/issues/4053)
- [GH #19078 — Auth fail loop](https://github.com/anthropics/claude-code/issues/19078)
- [MacRumors — Rapid rate-limit drain bug](https://www.macrumors.com/2026/03/26/claude-code-users-rapid-rate-limit-drain-bug/)

### Switchers / profiles

- [Augment — CC-Switch hits 75K stars](https://www.augmentcode.com/learn/cc-switch-75k-stars-ai-cli-manager)
- [V2EX — claude code 多配置一键切换](https://v2ex.com/t/1154494)
- [V2EX — 一行代码接入任意 LLM (Nyro)](https://www.v2ex.com/t/1207104)
- [V2EX — 公司给了 $90 额度，但 cc-switch/env 都救不活](https://www.v2ex.com/t/1202778)
- [V2EX — VibeAround 多配置并行启动](https://fast.v2ex.com/t/1209512)

### Skill format & supply chain

- [DEV — SKILL.md silently fails in VS Code](https://dev.to/moonrunnerkc/your-skillmd-works-in-claude-code-but-silently-fails-in-vs-code-k9b)
- [Reversec — Compromising Claude Code with malicious skills](https://labs.reversec.com/posts/2026/05/skill-issues-compromising-claude-code-with-malicious-skills-agents-part-1)
- [Claude Lab — Corporate proxy SSL troubleshooting](https://claudelab.net/en/articles/claude-code/claude-code-corporate-proxy-ssl-troubleshooting)
- [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit)
