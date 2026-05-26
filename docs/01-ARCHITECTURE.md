# 总体架构

## 三身位模型

```
┌─────────────────────────────────────────────────────────┐
│                    clihub                             │
├─────────────────────────────────────────────────────────┤
│ ① CLI 工具       — 终端: clihub tool install codex    │
│ ② CC Skill       — Claude 内: /clihub 装 tavily        │
│ ③ Slash Command  — /clihub 触发 TUI 主菜单            │
└─────────────────────────────────────────────────────────┘
```

三者共享 `@clihub/core` 内核，保证行为一致。

## monorepo 结构

```
clihub/                              # 仓库根 (= 现 CCEnvOneCLick, 待改名)
├── package.json                       # bun workspace 根
├── bun.lockb
├── packages/
│   ├── core/                          # 内核库 (无依赖 UI)
│   │   ├── settings/
│   │   ├── mcp/
│   │   ├── permission/
│   │   ├── skill/
│   │   ├── hook/
│   │   ├── backup/
│   │   ├── catalog/
│   │   ├── tools/                     # ToolProvider 实现
│   │   │   ├── types.ts
│   │   │   ├── registry.ts
│   │   │   └── providers/
│   │   │       ├── claude-code.ts
│   │   │       ├── codex.ts
│   │   │       └── kiro-cli.ts
│   │   └── i18n/
│   │       ├── index.ts
│   │       └── locales/*.json
│   ├── cli/                           # clihub CLI binary
│   │   ├── src/cli.ts
│   │   ├── src/tui/
│   │   └── dist/
│   ├── skill/                         # 装到 ~/.claude/skills/clihub/
│   │   ├── SKILL.md
│   │   ├── scripts/
│   │   └── commands/clihub.md
│   ├── statusline/                    # 原 statusline.sh + install
│   │   ├── statusline.sh
│   │   └── install.sh
│   └── catalog/                       # skill / tool 元数据 JSON
│       ├── skills.json
│       ├── tools.json
│       └── presets.json
├── plugins/                           # 内嵌的官方插件 (单独发包)
│   ├── clihub-plugin-codex/
│   ├── clihub-plugin-kiro/
│   └── clihub-plugin-gemini/
├── docs/
├── scripts/
│   ├── install.sh                     # curl | sh 入口
│   └── postinstall.js                 # npm postinstall
└── README.md
```

## 数据流

```
用户输入 (CLI / Slash / TUI)
       │
       ▼
   @clihub/cli  解析参数 + 选语言 + 选目标工具
       │
       ▼
   @clihub/core  业务逻辑
       │
       ├──▶ ToolProvider (claude-code / codex / kiro-cli / ...)
       │       └─▶ SettingsAdapter (读写各自配置文件)
       │
       ├──▶ SkillSyncAdapter (skill 跨工具落盘)
       │
       ├──▶ BackupManager (tar 备份 ~/.<tool>/)
       │
       └──▶ Catalog (本地 + 远端 skill/tool 元数据)
```

## 关键抽象

### ToolProvider

```ts
interface ToolProvider {
  id: string
  name: string                        // i18n key
  description: string                 // i18n key
  homepage: string
  supportedPlatforms: Platform[]
  installMethods: InstallMethod[]
  detect(): Promise<DetectResult>
  install(opts: InstallOpts): Promise<void>
  uninstall(): Promise<void>
  update(): Promise<void>
  doctor(): Promise<HealthReport>
  configure?(): Promise<void>
  settingsAdapter: SettingsAdapter
  skillAdapter?: SkillSyncAdapter
}
```

### SettingsAdapter

```ts
interface SettingsAdapter {
  configPath(): string
  read(): Promise<unknown>
  write(data: unknown): Promise<void>
  validate(data: unknown): boolean
  backup(): Promise<string>
}
```

### SkillSyncAdapter

```ts
interface SkillSyncAdapter {
  install(skill: SkillManifest, source: string): Promise<void>
  uninstall(skillId: string): Promise<void>
  list(): Promise<InstalledSkill[]>
}
```

## 运行时分层

```
┌────────────────────────────────────────┐
│  L4  UI Layer                          │
│      - CLI argparser (cac)             │
│      - TUI (@clack/prompts)            │
│      - Slash command stubs             │
├────────────────────────────────────────┤
│  L3  Domain                            │
│      - Workflow orchestration          │
│      - Preset application              │
│      - Dry-run / Rollback              │
├────────────────────────────────────────┤
│  L2  Provider / Adapter                │
│      - ToolProvider impl               │
│      - SettingsAdapter impl            │
│      - SkillSyncAdapter impl           │
├────────────────────────────────────────┤
│  L1  Infra                             │
│      - fs / exec / http                │
│      - jq / tar / git                  │
│      - Platform detect                 │
└────────────────────────────────────────┘
```

## 打包目标

- `bun build --target node`：单文件 CJS，Node 18+ 兼容
- `dist/cli.js` 作 npm `bin`
- 第三方 plugin 走标准 npm 包，运行时懒加载
- Bun 用户走 `Bun.file` fast path

## 平台支持矩阵

| 平台 | 包管理 | Shell |
|---|---|---|
| macOS | brew / npm / bun | bash / zsh |
| Linux | apt / dnf / pacman / npm / bun | bash |
| Windows | winget / npm / bun | PowerShell / WSL |

## 自更新

```
clihub self-update     # 探测装法 (npm/bun/brew) 重装
clihub catalog sync    # 拉远端 skill 目录
```

## 配置文件落地

```
~/.clihub/
├── config.json          # 用户偏好 (语言 / 默认工具 / 预设)
├── backups/
│   ├── 20260526-104530/ # tar 备份目录, ISO YYYYMMDD-HHMMSS
│   └── ...
├── plugins/             # 第三方插件落点
└── cache/
    └── catalog.json     # 远端目录缓存
```
