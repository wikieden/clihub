# Launch posts (v0.4.x)

Drafts for the Sprint 4 launch. Don't ship a single one without re-reading
it; everything below is a starting point, not final copy.

**Synchronised launch checklist** (target: weekday morning US-East):

- [ ] Demo GIF rendered from `scripts/demo.sh` + uploaded to repo
- [ ] HN — Show HN
- [ ] Reddit r/ClaudeAI (English)
- [ ] Reddit r/LocalLLaMA (English)
- [ ] V2EX 创意工坊 (中文)
- [ ] X / Twitter thread
- [ ] dev.to long-form
- [ ] 掘金 (Chinese) long-form
- [ ] Friendly PR comments on competing repos
- [ ] Personal Slack / Discord nudges to 3 friends for early upvotes

---

## HN — Show HN

**Title** (≤ 80 chars):
```
Show HN: clihub — one CLI to install Claude Code, Codex, Gemini & Kiro
```

**Body**:
```
Hi HN — I built clihub because I'd been hand-managing four AI coding
CLIs in parallel and the workflow was death by a thousand papercuts.

Every AI coding CLI ships its own bespoke layout for skills, plugins and
MCP servers. If you run more than one (Claude Code + Codex + Gemini +
Kiro in my case) you end up:

  · Re-installing the same skill in four different folders.
  · Hand-syncing `superpowers` to ~/.claude/skills/, ~/.codex/skills/,
    ~/.kiro/skills/, ~/.gemini/skills/.
  · Watching an unrelated upgrade flatten your config with no way back.

clihub fixes all three with a single 148 KB binary:

  npm install -g @wikieden/clihub
  clihub                            # TUI
  clihub preset apply starter       # install Claude Code + 5 skills
  clihub skill install https://github.com/foo/bar.git  # SKILL.md installer
  clihub plugin install superpowers --tool claude-code
  clihub catalog sync               # remote catalog (sha256-verified)
  clihub doctor                     # cross-CLI health matrix
  clihub backup && clihub rollback  # safety net

What's there today:

  · 4 CLIs (Claude Code, OpenAI Codex, Gemini, Kiro), abstracted behind
    a thin ToolProvider interface.
  · 30 skills + 3 presets + 7 MCP servers + 5 plugins in the catalog.
  · Cross-CLI skill fan-out: one install, every CLI that supports it.
  · agentskills.io SKILL.md installer (clihub skill install <git-url>).
  · i18n: en / zh-CN / ja / ko / es, auto-detected from $LANG.
  · Single-binary tarball, zero install-time deps.
  · MIT.

What I'm asking for:

  · Brutal feedback on the wedge — is "install CLI + sync skills +
    rollback" really the right shape, or am I missing the obvious?
  · Beta testers on Windows (currently macOS / Linux only).
  · Plugin authors who want to ship via the catalog.

Code: https://github.com/wikieden/clihub
npm:  https://www.npmjs.com/package/@wikieden/clihub
Docs: https://github.com/wikieden/clihub/tree/main/docs

Happy to answer anything.
```

---

## Reddit r/ClaudeAI / r/LocalLLaMA (English)

**Title**:
```
[Tool] clihub — install Claude Code, Codex, Gemini & Kiro side by side, keep their skills in sync, rollback on bad upgrades
```

**Body**:
```
TL;DR — `npm i -g @wikieden/clihub` then `clihub preset apply starter`
installs Claude Code + 5 core skills + MCP servers + cross-CLI sync,
under 30 seconds, fully reversible.

I kept ending up with skills duplicated across ~/.claude/skills,
~/.codex/skills, ~/.kiro/skills and ~/.gemini/skills, manually copying
files between them whenever a new "superpowers" version dropped.
clihub is a single binary that does that work — and it cleans up after
itself when a CLI upgrade rewrites your config (every write is
timestamped-backed-up; `clihub rollback` restores the most recent).

Highlights:

  · One install of any skill → fans out to every CLI that supports it.
  · Catalog of 30 skills + 7 MCP servers + 5 plugins, all open-source.
  · `clihub skill install <git-url>` understands the agentskills.io
    SKILL.md standard, so you can install any skill repo regardless
    of which CLI it was originally written for.
  · `clihub doctor` shows a single cross-CLI health table.
  · MIT, no telemetry, no cloud account.

Repo + docs: https://github.com/wikieden/clihub
Comparison vs claude-skills / multica / ccpi / oh-my-claudecode:
https://github.com/wikieden/clihub#why-clihub

What I'd love feedback on: which CLI / plugin / MCP should land next.
```

---

## V2EX 创意工坊 (中文)

**标题**：
```
[工具] clihub — 一个 CLI 装 Claude Code / Codex / Gemini / Kiro，skill 跨工具同步，一键 rollback
```

**正文**：
```
背景：之前同时跑 4 个 AI 编程 CLI，每个都有自己的 skill / plugin / MCP
目录。一个 superpowers 要往 ~/.claude/skills、~/.codex/skills、
~/.kiro/skills、~/.gemini/skills 各复制一遍，每次升级又怕配置被覆盖
没法回滚。

写了 clihub，单二进制 148 KB，零运行时依赖：

  npm install -g @wikieden/clihub
  clihub                            # 中文 TUI（自动识别 $LANG）
  clihub preset apply starter       # 一键装 Claude Code + 5 skill
  clihub skill install https://github.com/foo/bar.git  # agentskills.io 标准
  clihub plugin install superpowers --tool claude-code
  clihub catalog sync               # 远端 catalog + sha256 校验
  clihub doctor                     # 跨 CLI 健康表
  clihub backup && clihub rollback  # 备份 / 回滚

特性：

  · 跨厂商中立：装 / 同步 / 回滚都不偏袒任何一家。
  · 装一个 skill → 自动同步到所有装了的 CLI。
  · 30 个 skill + 7 个 MCP server + 5 个 plugin，全开源。
  · i18n：en / zh-CN / ja / ko / es 自动切换。
  · MIT 协议，零 telemetry，零云依赖。

主要想问大家：

  · 还有哪些 AI 编程 CLI 该加进来？（Cursor、Aider、Goose 已经在路上）
  · 你最想要的 skill / preset 是什么？
  · Windows 用户有没有愿意做 beta 测试的？

仓库：https://github.com/wikieden/clihub
npm：https://www.npmjs.com/package/@wikieden/clihub
对比 claude-skills / multica / ccpi / oh-my-claudecode：
https://github.com/wikieden/clihub#why-clihub

欢迎拍砖。
```

---

## X / Twitter thread

```
1/ I shipped clihub — one binary that installs Claude Code,
   Codex, Gemini and Kiro side-by-side, syncs their skills,
   and rolls back when an upgrade bites.

   npm i -g @wikieden/clihub

   [demo GIF]

2/ Running more than one AI coding CLI today means:
   · re-installing the same skill four times in four folders
   · hand-syncing every "superpowers" release
   · watching an unrelated upgrade flatten your config

   clihub fixes all three.

3/ Wedge nobody else covers:
   ✓ install the CLIs themselves
   ✓ presets bundling tools + skills + MCP + plugin
   ✓ backup + one-command rollback of ~/.claude (and siblings)
   ✓ installer for the open agentskills.io SKILL.md standard

4/ What's in v0.4:
   • 4 CLIs, 30 skills, 7 MCP servers, 5 plugins
   • Cross-CLI fan-out (one install → every supported CLI)
   • Remote catalog sync with sha256 verification
   • i18n: en / zh / ja / ko / es

5/ MIT. No telemetry. No cloud account. Single 148 KB tarball.

   GitHub: https://github.com/wikieden/clihub
   Docs:   https://github.com/wikieden/clihub/tree/main/docs

   Brutal feedback welcome. What CLI should land next?
```

---

## dev.to / Medium (English long-form)

**Title**:
```
I was juggling four AI coding CLIs. So I built one tool to rule them all (and let you roll back).
```

Outline:
1. The pain: four bespoke skill layouts, no rollback, hand-syncing.
2. What clihub does in three flows: install · sync · rollback.
3. Architecture: ToolProvider abstraction + SkillSyncAdapter + JsonMcpAdapter + GitClonePluginAdapter.
4. Comparison table (claude-skills / multica / ccpi / oh-my-claudecode).
5. Roadmap & invitation.

---

## 掘金 / 知乎 (Chinese long-form)

**标题**：
```
一个 CLI 管 4 个 AI 编程工具：clihub 设计回顾
```

大纲与 dev.to 一致，外加：
- 国内 AI CLI 用户的特殊痛点（i18n、镜像、Lark / 飞书集成）
- 给 catalog 投稿的路径

---

## Friendly PR comments on competing repos

模板（友好、不抢饭）：

```
Heads-up — I built clihub (https://github.com/wikieden/clihub) which
installs multiple AI coding CLIs and fans skills out across them. It
treats <PROJECT_NAME> as one of the upstream catalogs it pulls from
rather than a competitor.

If you'd like, I'm happy to add a `clihub plugin install <PROJECT_NAME>`
entry to the bundled catalog so your users can get there in one
command. Let me know if you want me to send a PR with that entry.
```

目标仓库（按优先级）：

- alirezarezvani/claude-skills
- multica-ai/multica
- jeremylongshore/claude-code-plugins-plus-skills (ccpi)
- musistudio/claude-code-router
- yeachan-heo/oh-my-claudecode
