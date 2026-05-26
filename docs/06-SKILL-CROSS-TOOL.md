# Skill 跨工具同步

## 问题

Claude Code 有完整的 skill 一等公民支持，其它 AI CLI 工具（Codex / Kiro / Gemini）扩展机制各异。clihub 要让用户「装一次 skill，所有工具能用」。

## 各工具扩展机制现状

### Claude Code

```
~/.claude/skills/<name>/SKILL.md     # 一等公民
~/.claude/commands/<name>.md         # slash command
~/.claude/agents/<name>.md           # 子 agent
settings.json hooks / permissions / MCP
```

LLM 启动看 skill 列表 (name + description)，按需调 `Skill` 工具加载全文。description 写得好可自动激活。

### Codex CLI

```
~/.codex/config.toml                 # 主配置 (含 MCP)
~/.codex/instructions.md             # 全局 system 指令
~/.codex/prompts/<name>.md           # 自定义 slash prompt
项目根 AGENTS.md                      # 项目级指令
```

无 skill 概念。用 prompts/ + AGENTS.md 模拟。

### Kiro CLI

```
~/.kiro/                             # 配置目录
项目 .kiro/specs/                     # 需求规范
项目 .kiro/steering/                  # 引导文档
```

围绕 spec-driven 开发，扩展点是 specs / steering / MCP。

### Gemini CLI

```
GEMINI.md                            # 项目级
~/.gemini/                           # 全局配置
~/.gemini/extensions/                # 扩展
~/.gemini/commands/                  # 自定义命令
```

## 统一 Skill 包格式

```
clihub-skill-<id>/
├── manifest.json
├── SKILL.md                         # 中性源文（CC 风格）
├── adapters/
│   ├── codex.md
│   ├── kiro.md
│   └── gemini.md
├── scripts/
├── assets/
└── README.md
```

### manifest.json

```json
{
  "id": "tavily",
  "name": "Tavily Web Search",
  "version": "1.0.0",
  "description": "Search the web with LLM-optimized results.",
  "category": "search",
  "triggers": ["search the web", "tavily", "搜一下"],
  "supports": {
    "claude-code": "native",
    "codex": "bridge",
    "gemini-cli": "bridge",
    "kiro-cli": "steering"
  },
  "requires": {
    "env": ["TAVILY_API_KEY"],
    "mcp": [],
    "tools": []
  },
  "i18n": {
    "zh-CN": { "name": "Tavily 网页搜索", "description": "..." },
    "ja":    { "name": "Tavily ウェブ検索", "description": "..." }
  }
}
```

`supports.<tool>` 取值：

- `native`：工具原生支持，直接落盘
- `bridge`：通过 clihub 桥接生成 prompts / 引用
- `steering`：转译为该工具的 steering / context 机制
- `unsupported`：不支持，跳过

## 同步流程

```
clihub skill install tavily
  │
  ├─ catalog 拉 manifest + 文件
  ├─ 选目标工具（默认全部已装的，过滤 unsupported）
  ├─ 对每个目标:
  │     ├─ backup
  │     └─ skillAdapter.install(skill)
  └─ doctor 验证每个工具能看见 skill
```

## Adapter 实现

### ClaudeCodeSkillAdapter

```ts
class ClaudeCodeSkillAdapter implements SkillSyncAdapter {
  async install(skill, source) {
    const dst = `${HOME}/.claude/skills/${skill.id}`
    await cpdir(`${source}/`, dst)
    if (skill.installSlash !== false) {
      await writeSlash(skill.id, `${source}/SKILL.md`)
    }
  }
  async uninstall(id) { await rm(`${HOME}/.claude/skills/${id}`) }
  async list() { /* 扫描 + 解析 frontmatter */ }
}
```

### CodexSkillAdapter

```ts
class CodexSkillAdapter implements SkillSyncAdapter {
  async install(skill, source) {
    const skillDir = `${HOME}/.codex/skills/${skill.id}`
    await cpdir(`${source}/`, skillDir)

    const src = exists(`${source}/adapters/codex.md`)
      ? `${source}/adapters/codex.md`
      : `${source}/SKILL.md`

    const promptStub = `# ${skill.name}\n\n` +
      `读取并执行 ${skillDir}/SKILL.md (或 adapters/codex.md) 中的指令。\n` +
      `触发词：${skill.triggers?.join(' / ')}\n`
    await write(`${HOME}/.codex/prompts/${skill.id}.md`, promptStub)

    await appendUnique(
      `${HOME}/.codex/AGENTS.md`,
      `- /${skill.id} — ${skill.description}`
    )
  }

  async uninstall(id) {
    await rm(`${HOME}/.codex/skills/${id}`)
    await rm(`${HOME}/.codex/prompts/${id}.md`)
    await removeLine(`${HOME}/.codex/AGENTS.md`, new RegExp(`^- /${id} —`))
  }
}
```

### KiroCliSkillAdapter

```ts
class KiroCliSkillAdapter implements SkillSyncAdapter {
  async install(skill, source) {
    const steeringDir = `${HOME}/.kiro/steering/`
    await mkdir(steeringDir)
    const md = render(skill, 'kiro-steering-template')
    await write(`${steeringDir}/clihub-${skill.id}.md`, md)
  }
}
```

### GeminiCliSkillAdapter

类似 codex，写 `~/.gemini/commands/` + 追加 `GEMINI.md` 注册行。

## 能力降级

skill 用了 CC 独有能力（hooks / agents / 特定 MCP），manifest 声明，adapter 检查：

```json
"requires": {
  "capabilities": ["hooks", "subagents"]
}
```

codex adapter 看 `hooks` 不支持 → 警告 + 跳过对应部分，用户能看到「该 skill 在 codex 中无 hooks 部分」。

## 校验

每次同步后跑 `doctor`：

- CC: `~/.claude/skills/<id>/SKILL.md` 存在且 frontmatter 有效
- Codex: prompts/ 桥接 + AGENTS.md 注册行齐
- Kiro: steering 文档可读
- Gemini: commands/ + GEMINI.md 注册齐

## 卸载顺序

1. 各 adapter 各自清理
2. 删 clihub 自管目录
3. 清空相关备份索引（仍保留 tar）
4. 提示用户：「skill X 已从 N 个工具移除，可 clihub rollback 撤销」

## skill 来源

```
clihub skill install <id>            # 从内嵌 catalog 装
clihub skill install <url>           # 从 git URL
clihub skill install <pkg>           # 从 npm 包
clihub skill install <path>          # 本地路径
```

## 命名空间

社区 skill 建议带前缀：

```
@user/clihub-skill-<id>
clihub-skill-<id>
```

clihub 装时 id 默认取 manifest.id，可选 `--as <new-id>` 重命名避冲。
