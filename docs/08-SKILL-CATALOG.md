# Skill 目录 (Catalog)

## 总数与分类

初期目标内嵌 80+ skill 元数据，分 10 类。

## 一、必备核心

| ID | 用途 | 来源 |
|---|---|---|
| `superpowers` | 元方法论：brainstorming / TDD / debugging / planning / executing | 官方 |
| `oh-my-claudecode` | 多 agent 编排核心 | OMC |
| `everything-claude-code` | ECC 总入口 | 社区 |
| `claude-api` | Claude API/SDK 开发助手 | 官方 |

## 二、文档生产 (Anthropic skills)

`pdf` / `docx` / `pptx` / `xlsx` / `canvas-design` / `skill-creator` / `web-artifacts-builder` / `algorithmic-art` / `theme-factory` / `slack-gif-creator` / `brand-guidelines` / `internal-comms` / `mcp-builder` / `frontend-design` / `webapp-testing` / `doc-coauthoring`

## 三、代码质量

`tdd-workflow` / `code-review` / `security-review` / `security-scan` / `deep-research` / `architecture-decision-records` / `refactor-cleaner` / `performance-optimizer` / `verification-loop` / `prompt-optimizer` / `coding-standards` / `agentic-engineering`

## 四、语言专项

每语言含 `*-patterns / *-review / *-build / *-test`：

- `python-*` / `go-*` / `rust-*` / `java-*` / `kotlin-*` / `swift-*` / `cpp-*` / `csharp-*` / `typescript-*` / `dart-*` / `perl-*`

## 五、框架专项

| 框架 | skill |
|---|---|
| Next.js / Turbopack | `nextjs-turbopack`, `frontend-patterns` |
| Nuxt 4 | `nuxt4-patterns` |
| NestJS | `nestjs-patterns` |
| Spring Boot | `springboot-*` |
| Django | `django-*` |
| Laravel | `laravel-*` |
| Flutter | `flutter-reviewer / dart-flutter-patterns` |
| SwiftUI | `swiftui-patterns / swift-concurrency-6-2` |
| Android | `android-clean-architecture / kotlin-coroutines-flows` |
| PyTorch | `pytorch-patterns` |
| Compose Multiplatform | `compose-multiplatform-patterns` |
| Bun runtime | `bun-runtime` |
| Docker | `docker-patterns` |

## 六、Web 流水线 (gstack)

`plan-ceo-review` / `plan-eng-review` / `plan-design-review` / `design-shotgun` / `design-html` / `design-consultation` / `ship` / `land-and-deploy` / `canary` / `browse` / `qa` / `e2e` / `benchmark` / `review` / `setup-deploy` / `office-hours`

## 七、飞书办公全家桶

`lark-mail` / `lark-calendar` / `lark-im` / `lark-doc` / `lark-sheets` / `lark-base` / `lark-wiki` / `lark-minutes` / `lark-vc` / `lark-okr` / `lark-approval` / `lark-drive` / `lark-task` / `lark-event` / `lark-contact` / `lark-attendance` / `lark-whiteboard` / `lark-slides` / `lark-shared` / `lark-skill-maker` / `lark-workflow-meeting-summary` / `lark-workflow-standup-report`

## 八、搜索 / MCP / 第三方

`tavily-search` / `tavily-dynamic-search` / `tavily-crawl` / `tavily-map` / `tavily-extract` / `tavily-research` / `exa-search` / `context7` / `codegraph` / `figma` / `playwright` / `prisma` / `pdf-viewer` / `product-management:linear` / `product-management:asana` / `product-management:notion` / `product-management:atlassian` / `product-management:clickup` / `product-management:slack` / `product-management:intercom` / `videodb` / `fal-ai-media` / `nutrient-document-processing`

## 九、设计 / UI

`ui-ux-pro-max` / `frontend-design` / `design-system` / `accessibility` / `liquid-glass-design` / `design-handoff` / `figma:figma-use`

## 十、趣味 / 精简 / 工具流

`caveman` / `caveman-help` / `caveman-review` / `codex:rescue` / `codex:setup` / `planning-with-files` / `ralph-loop` / `feature-dev` / `cowork-plugin-management` / `nanoclaw-repl` / `agent-sort` / `skill-creator` / `consolidate-memory` / `setup-cowork`

## 预设 (Preset)

```json
{
  "starter": {
    "name": "preset.starter.name",
    "skills": ["superpowers", "oh-my-claudecode", "codegraph",
               "tavily-dynamic-search", "caveman"],
    "mcp": ["codegraph", "context7"],
    "hooks": ["safety-net"],
    "statusline": true
  },
  "fullstack": {
    "extends": "starter",
    "skills": ["+", "frontend-design", "design-system", "tdd-workflow",
               "code-review", "security-review",
               "nextjs-turbopack", "springboot-patterns",
               "playwright"]
  },
  "lark-office": {
    "extends": "starter",
    "skills": ["+", "lark-mail", "lark-calendar", "lark-im", "lark-doc",
               "lark-sheets", "lark-base", "lark-wiki", "lark-minutes",
               "lark-vc", "lark-okr", "lark-approval", "lark-drive",
               "lark-task", "lark-event", "lark-contact",
               "lark-attendance", "lark-whiteboard", "lark-slides"]
  },
  "geek": {
    "extends": "fullstack",
    "skills": ["+", "python-review", "go-review", "rust-review",
               "java-review", "kotlin-review", "swift-protocol-di-testing",
               "cpp-reviewer", "deep-research", "agent-introspection-debugging",
               "codex:rescue", "ralph-loop", "santa-method"]
  },
  "designer": {
    "extends": "starter",
    "skills": ["+", "ui-ux-pro-max", "frontend-design", "design-system",
               "figma:figma-use", "design-shotgun", "design-html",
               "design-consultation", "accessibility"]
  }
}
```

`"+"` 语法 = 在父预设基础上追加。

## catalog 数据格式

```json
{
  "version": "1.0",
  "updated": "2026-05-26",
  "skills": [
    {
      "id": "tavily-dynamic-search",
      "name": "Tavily Dynamic Search",
      "category": "search",
      "description": "Programmatic web search with context isolation.",
      "version": "1.0.0",
      "source": "npm:clihub-skill-tavily",
      "supports": {
        "claude-code": "native",
        "codex": "bridge",
        "gemini-cli": "bridge"
      },
      "requires": { "env": ["TAVILY_API_KEY"] }
    }
  ],
  "tools": [
    { "id": "claude-code" },
    { "id": "codex" }
  ],
  "presets": {}
}
```

字段说明：

- `version` — catalog schema 版本
- `updated` — 最后更新日期 ISO YYYY-MM-DD
- `id` — 稳定唯一 kebab-case 标识
- `source` — 安装来源（npm: / git: / file:）
- `supports.<tool>` — `native | bridge | steering | unsupported`

## 来源与维护

- **内嵌**：`packages/catalog/skills.json` 跟仓库走
- **远端**：`https://catalog.clihub.dev/v1/catalog.json`，`clihub catalog sync` 拉取
- **本地覆盖**：`~/.clihub/catalog-overrides.json` 用户私有源
