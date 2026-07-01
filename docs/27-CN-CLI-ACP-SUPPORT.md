# 27 — 国产 CLI/GUI 支持 + ACP 协议接入计划

> 状态:计划(未实施)。调研日期 2026-06-29。落地前须复核「待核清单」。

## 0. TL;DR

- clihub 接入工具有两条路:**Endpoint 行**(模型 API,复用现有 binding,0 新代码)与 **ToolProvider**(工具自带 CLI/GUI binary)。
- 目标工具:DeepSeek、GLM(智谱/z.ai)、Kimi(Moonshot)、MiniMax、Qoder(阿里)。
- 大头是 **4 个 endpoint 行** —— 立即让 6 个已支持 CLI 跑国产模型。只有 **Kimi Code CLI** 和 **Qoder CLI** 值得做新 provider。
- 战略发现:**ACP(Agent Client Protocol)** —— 43+ agent 支持,clihub 现有 8 个 provider 全在名单内。新增 `clihub acp wire` 功能可把已装 CLI 一键注册进 Zed/JetBrains,统一覆盖 GUI 用户。

---

## 1. 现状 — clihub 两个扩展点

| 扩展点 | 文件 | 适用 | 工作量 |
|---|---|---|---|
| **Endpoint** | [`packages/catalog/endpoints.json`](../packages/catalog/endpoints.json) → [`binding/index.ts`](../packages/core/src/binding/index.ts) | 工具是**模型 API**;加一行 endpoint,`clihub use <id> --for <cli>` 把已支持 CLI 指过去 | 纯 catalog 行 |
| **ToolProvider** | [`providers/`](../packages/core/src/tools/providers/) + [`registry.ts`](../packages/core/src/tools/registry.ts) | 工具**自带 CLI/GUI binary**;实现 detect/install/uninstall/update/doctor + settingsAdapter | 新 provider 文件 |
| **BindingAdapter** | 同 `binding/index.ts` | 新 CLI 想**当 endpoint 切换目标**,需写它的原生 config | 新 adapter |

现有 binding 可切的 CLI:claude-code / codex / qwen / opencode / goose / gemini(kiro/cursor 为专有后端,仅 model-only)。

---

## 2. 工具分类(已查证 2026-06)

| 工具 | 厂商 | 官方 CLI | 官方 GUI | API 方言 | clihub 接法 |
|---|---|---|---|---|---|
| **DeepSeek** | DeepSeek | ❌ 无官方(社区版多) | ❌ 仅 web | anthropic `api.deepseek.com/anthropic` + openai | Endpoint ✅(已在表里,刷新 models) |
| **GLM / z.ai** | 智谱 | ❌ 无独立 CLI | ✅ ZCode 桌面 ADE(mac/win) | anthropic `api.z.ai/api/anthropic` + openai | Endpoint(主)+ 可选 ZCode GUI |
| **Kimi** | Moonshot | ✅ Kimi Code CLI(官方/MIT/TS) | web | anthropic `api.moonshot.cn/anthropic` + openai | ToolProvider + BindingAdapter + Endpoint |
| **MiniMax** | MiniMax | ❓ 无明确官方独立 CLI | web agent | anthropic `api.minimax.io/anthropic`(国际)/`api.minimaxi.com/anthropic`(国内) | Endpoint(国际+国内两行) |
| **Qoder** | 阿里 | ✅ Qoder CLI(+IDE+JetBrains) | ✅ 桌面 IDE | 专有后端(Coding/Token Plan) | ToolProvider(下载装,model-only) |
| **Qwen** | 阿里 | ✅ 已支持 | — | — | 完成 |

---

## 3. 落地细节

### 3.1 Endpoints — 4 行(照 endpoints.json 现有 schema)

```jsonc
{ "id": "glm", "label": "Zhipu GLM (z.ai)",
  "urls": { "anthropic": "https://api.z.ai/api/anthropic",
            "openai": "https://api.z.ai/api/paas/v4" },   // openai 路径待核(或 /api/coding/paas/v4)
  "family": "openai", "baseURL": "https://api.z.ai/api/paas/v4",
  "models": ["glm-5.2", "glm-5-turbo", "glm-4.6"], "authEnv": "ZAI_API_KEY" }

{ "id": "moonshot", "label": "Moonshot Kimi",
  "urls": { "anthropic": "https://api.moonshot.cn/anthropic",
            "openai": "https://api.moonshot.cn/v1" },
  "family": "openai", "baseURL": "https://api.moonshot.cn/v1",
  "models": ["kimi-k2.7", "kimi-latest"], "authEnv": "MOONSHOT_API_KEY" }   // 国际站 api.moonshot.ai

{ "id": "minimax", "label": "MiniMax (intl)",
  "urls": { "anthropic": "https://api.minimax.io/anthropic", "openai": "https://api.minimax.io/v1" },
  "family": "openai", "baseURL": "https://api.minimax.io/v1",
  "models": ["MiniMax-M2.7", "MiniMax-M2"], "authEnv": "MINIMAX_API_KEY" }

{ "id": "minimax-cn", "label": "MiniMax (China)",
  "urls": { "anthropic": "https://api.minimaxi.com/anthropic", "openai": "https://api.minimaxi.com/v1" },
  "family": "openai", "baseURL": "https://api.minimaxi.com/v1",
  "models": ["MiniMax-M2.7", "MiniMax-M2"], "authEnv": "MINIMAX_API_KEY" }
```

附带:`authEnv`(ZAI/MOONSHOT/MINIMAX_API_KEY)接进 `clihub auth set`;DeepSeek 行刷新 model 名。**无其他新代码** —— binding 机器已就绪。

### 3.2 Kimi Code CLI — 新 ToolProvider(细节全确认)

| 项 | 值 |
|---|---|
| npm | `@moonshot-ai/kimi-code`(需 Node ≥22.19) |
| curl | `curl -fsSL https://install.kimi.ai \| bash` |
| binary | `kimi`(`kimi --version`) |
| config | `~/.kimi-code/config.toml`(**TOML**),可被 `KIMI_CODE_HOME` 改写 |
| 平台 | mac/linux/win |
| 自定义 endpoint | config.toml `[providers.x]` type=anthropic/openai + base_url + api_key;**不读 shell 环境变量**,凭据必须写文件 |

实现:provider 照 [`qwen.ts`](../packages/core/src/tools/providers/qwen.ts)(install/detect)+ [`antigravity.ts`](../packages/core/src/tools/providers/antigravity.ts)(curl)。BindingAdapter 用 **TomlSettingsAdapter** 写 `[providers]`/`[models]`(参 codex adapter 的 TOML 处理),不是 claude 的 env 块。

### 3.3 Qoder CLI — 新 ToolProvider(专有后端,优先级低)

| 项 | 值 |
|---|---|
| binary | `qoder`;ACP 启动 `qoder acp` |
| config | `~/.qoder-cn/settings.json`(国内/Lingma 版)+ 项目级 `.qoder/settings.json` |
| 平台 | mac/linux/win(arm64+amd64),Qoder 1.0(2026-05) |
| 安装 | **待核** —— 官网下载,非 npm(docs.qoder.com 多页 404,AUR 有 `qoder-cli`) |
| endpoint | 专有 Coding/Token Plan 后端 → binding 大概率 model-only(像 kiro/cursor) |

### 3.4 GLM / ZCode / DeepSeek / MiniMax

- **GLM = 纯 endpoint**(无独立 CLI),3.1 已覆盖。
- **ZCode** = z.ai 桌面 ADE(GUI,mac/win),可选 GUI provider,最低优先,与 Cursor 类处理重叠。
- **DeepSeek / MiniMax** = endpoint-only(无官方 CLI)。

### 3.5 每个新 provider 的必改清单

provider 文件 + [`registry.ts`](../packages/core/src/tools/registry.ts) + GUI 表 [`gui/index.ts`](../packages/core/src/gui/index.ts) + 桌面 [`lib.rs`](../clihub-desktop/src-tauri/src/lib.rs) + 测试 + 双语 README([README.md](../README.md) / [README.zh-CN.md](../README.zh-CN.md))。漏了桌面端就列不出来。

---

## 4. ACP(Agent Client Protocol)调研

**ACP** = Zed + JetBrains 共建协议,JSON-RPC over stdio。编辑器用一条 `command + args` 拉起任意 agent。截至 2026-03 已 **43+ agent** 支持([registry](https://github.com/agentclientprotocol/registry) 38 目录)。

clihub 现有 8 个 provider **全部 ∈ ACP**,本次新增候选也几乎全在:

| clihub 状态 | ACP 名单 |
|---|---|
| 已支持 | Claude、Codex、Gemini、Qwen、Goose、Cursor、Kiro、OpenCode |
| 新增候选 | **Kimi CLI**、**Qoder CLI**、**GLM Agent**(glm-acp-agent) |
| 未来可扩 | Codebuddy(腾讯)、Cline、GitHub Copilot、Grok Build、Mistral Vibe、Devin、Factory Droid、Kilo、Amp… |

DeepSeek、MiniMax **不在** ACP 名单 → 继续 endpoint-only。

### 4.1 新功能机会:`clihub acp wire`

clihub 已管这些 CLI 的「装 + 配」。ACP 补上缺失一环:**把已装 CLI 注册进编辑器**。

> `clihub acp wire <tool> --editor zed` → 写 Zed `settings.json` 的 `agent_servers`(或 JetBrains 配置),让编辑器用 ACP 拉起该 CLI。

技术:每个 provider 加可选元数据 `acp?: { command, args }`。

| provider | ACP 启动命令 | 状态 |
|---|---|---|
| qoder | `qoder acp` | ✅ 确认 |
| gemini | `gemini --experimental-acp` | ✅ 确认 |
| claude-code | `npx @zed-industries/claude-code-acp`(适配器,CC 非原生) | ✅ 确认 |
| codex / qwen / goose / cursor / kiro / opencode / kimi / glm | registry 各目录有 server 清单 | 待逐一核 |

价值:clihub 从「装 CLI + 切模型」升级成「装 CLI + 切模型 + **一键接入 Zed/JetBrains**」,覆盖 GUI 用户。统一用 ACP 把 CLI 喂给编辑器,免去逐个做 GUI provider。

---

## 5. 分阶段排序

| 阶段 | 内容 | 工作量 | 风险 |
|---|---|---|---|
| **P1** | 4 个 endpoint 行 + auth env + DeepSeek model 刷新 | 半天 | 0 |
| **P2** | Kimi Code CLI provider + TOML binding adapter | 1–2 天 | 低 |
| **P3** | ACP wiring(`acp` 元数据 + `clihub acp wire --editor zed`) | 2–3 天 | 中(战略杠杆) |
| **P4** | Qoder provider(待核安装,model-only) | 1–2 天 | 中 |
| **P5(可选)** | GLM Agent ACP entry / ZCode GUI provider | — | 低优先 |

---

## 6. 待核清单(动工前)

- [ ] GLM 的 openai 路径(`/api/paas/v4` vs `/api/coding/paas/v4`)
- [ ] MiniMax 国内/国际精确 model 名 + 当前版本
- [ ] Kimi 当前 model 名(kimi-k2.7 等)
- [ ] Qoder CLI 安装命令(官网下载 / brew / AUR)
- [ ] 各 ACP agent 精确 launch 命令(逐个查 registry 目录:codex/qwen/goose/cursor/kiro/opencode/kimi/glm)
- [ ] 各家 base URL 国内/国际差异是否需拆独立 endpoint 行

## 7. 来源

- Endpoints / binding 机制:[`binding/index.ts`](../packages/core/src/binding/index.ts)、[`endpoints.json`](../packages/catalog/endpoints.json)
- Kimi:[MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code)、[Kimi Code Docs](https://www.kimi.com/code/docs/en/)
- GLM:[z.ai/subscribe](https://z.ai/subscribe)、[ZCODE Docs](https://zcode.z.ai/en/docs/configuration)
- MiniMax:[platform.minimax.io coding tools](https://platform.minimax.io/docs/guides/text-ai-coding-tools)
- Qoder:[qoder.com/cli](https://qoder.com/cli)、[Zed ACP: qoder-cli](https://zed.dev/acp/agent/qoder-cli)
- ACP:[zed.dev/acp](https://zed.dev/acp)、[agentclientprotocol/registry](https://github.com/agentclientprotocol/registry)、[jetbrains.com/acp](https://www.jetbrains.com/acp/)
