# 路线图与里程碑

## v0.1 — MVP (4 周)

**目标**：能装 Claude Code + 5 个核心 skill + 中英双语 TUI。

### 范围

- [ ] monorepo 骨架 (bun workspace)
- [ ] `@clihub/core` 底座 (settings/backup/i18n)
- [ ] `clihub` CLI (cac + clack TUI)
- [ ] i18n: en + zh-CN
- [ ] ToolProvider: `claude-code`
- [ ] 内置 skill catalog: 5 个
  - superpowers, oh-my-claudecode, codegraph,
    tavily-dynamic-search, caveman
- [ ] CC SkillSyncAdapter (native 落盘)
- [ ] clihub skill 包（装到 ~/.claude/skills/clihub）
- [ ] /clihub slash command
- [ ] statusline 集成（保留现 statusline.sh）
- [ ] npm + bun 安装
- [ ] doctor / backup / restore / rollback
- [ ] 一个 preset: `starter`

### 不做

- 其它 CLI 工具 provider
- 跨工具 skill 同步
- 远端 catalog
- 文档站

### 验收

```bash
curl -fsSL clihub.dev/install | sh
clihub
clihub tool install claude-code
clihub preset apply starter
clihub doctor
# 在 CC 内: /clihub → 能 list / install skill
```

## v0.2 — 多工具 (4 周)

- [ ] CodexProvider + CodexSkillAdapter (bridge)
- [ ] KiroCliProvider + KiroSteeringAdapter
- [ ] GeminiCliProvider + GeminiSkillAdapter
- [ ] skill manifest 支持 `supports.<tool>` 与 `adapters/`
- [ ] catalog 扩充到 30 skill
- [ ] preset: `fullstack`, `lark-office`
- [ ] i18n: + ja, ko, es

### 验收

```bash
clihub tool install codex
clihub skill install tavily        # 自动落 CC + codex
clihub doctor                       # 两工具都看到 tavily
```

## v0.3 — 生态 (4 周)

- [ ] `clihub plugin add` 加载 npm 包 ToolProvider
- [ ] 远端 catalog: `catalog.clihub.dev`
- [ ] `clihub catalog sync`
- [ ] 插件作者文档 + 模板仓库
- [ ] brew tap: `clihub/tap/clihub`
- [ ] 文档站 `clihub.dev` 上线
- [ ] catalog 扩到 50 skill
- [ ] i18n: + fr, de, pt-BR

### 验收

```bash
brew install clihub/tap/clihub
clihub plugin add clihub-plugin-myai
clihub catalog sync
```

## v0.4 — 完备 (4 周)

- [ ] catalog 80+ skill 全量
- [ ] i18n: + zh-TW, ru, ar
- [ ] winget / scoop 分发
- [ ] Windows 路径与脚本完整支持
- [ ] CI 模式打磨
- [ ] preset: `geek`, `designer`
- [ ] backup / restore 多工具事务

## v1.0 — GA

- 稳定 API
- 文档完整
- 用户超 1000
- 第三方插件 ≥ 5

## 技术债务追踪

每发版 review：

- [ ] 测试覆盖率 ≥ 70%
- [ ] i18n key 100% 翻译至核心 5 语
- [ ] 文档与代码同步
- [ ] 启动延迟 < 150ms
- [ ] 烟雾测试矩阵：3 平台 × 2 包管 × 3 工具

## 度量指标

| 指标 | v0.1 | v0.3 | v1.0 |
|---|---|---|---|
| 装机用户 | 50 | 300 | 1000 |
| GitHub stars | 100 | 500 | 2000 |
| skill 数 | 5 | 50 | 80+ |
| 支持工具 | 1 | 4 | 6+ |
| 支持语言 | 2 | 5 | 10 |
| 启动延迟 | <150ms | <100ms | <80ms |
| 首装耗时 | <120s | <90s | <60s |

## 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| Anthropic 改 skill 格式 | 高 | adapter 抽象层吸收变化 |
| Codex skill 机制变 | 中 | bridge 也加适配 |
| 翻译质量参差 | 低 | LLM 辅助 + 母语 review 制度 |
| npm 包名冲突 | 低 | 主域名 + npm 早抢注 |
| Windows 兼容 | 中 | 早期招 Windows beta 测试者 |
| 维护者精力 | 高 | 模块化 + 插件化分散负担 |
