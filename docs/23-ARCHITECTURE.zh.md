# clihub 架构（转型后）

> 🌐 English: [`23-ARCHITECTURE.md`](23-ARCHITECTURE.md) ｜ 本文为同步中文版，正文以英文版为准。

> clihub 作为**可复现控制平面**的技术设计 = 一内核、多薄壳、一个 opt-in 本地网关、一个
> 桌面 GUI。配套 [`00-VISION.md`](00-VISION.md)、[`11-ROADMAP.md`](11-ROADMAP.md)（阶段）、
> [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md)（威胁模型）、
> [`24-VERSION-PLAN.md`](24-VERSION-PLAN.md)（逐版本规约）。

## 1. 唯一铁律：一内核，不分叉逻辑

`@clihub/core` 是**单一事实来源**。每个前端 —— CLI、TUI、Claude-Code skill、桌面 GUI、
网关守护进程 —— 都是薄壳，导入同一份来自 `packages/core/src/index.ts` 的公开 API（约 50
个导出）。任何壳都绝不重新实现领域逻辑。这由**golden 一致性测试**强制：
*GUI 路由结果 == CLI 命令结果 == 直接内核调用*。CLI 已体现这点 ——
`packages/cli/src/cli.ts` "将所有领域逻辑委托给 @clihub/core"；守护进程与网关复制该映射模式。

```
                       ┌──────────────────────────────┐
                       │        @clihub/core           │  ← 单一事实来源
                       │  providers · settings adapters │     （约 50 导出的公开 API）
                       │  catalog(+sign/trust) · skill  │
                       │  mcp · memory · sysprompt      │
                       │  profile · baseurls · proxy    │
                       │  auth(keychain/OAuth) · apply  │
                       │  lock · status · diff · sync   │
                       │  usage · import · audit · i18n │
                       └──────────────────────────────┘
            ┌───────────────┬───────────┴───────────┬────────────────┐
            ▼               ▼                       ▼                ▼
   @wikieden/clihub   clihub skill /         @clihub/daemon     @clihub/gateway
   (CLI + Clack TUI)  /clihub command        (Bun HTTP+WS        (opt-in local
   first-class,       (in-agent)             sidecar)            data-plane,
   headless/CI                                   │               OFF by default)
                                                 ▼
                                          clihub-desktop
                                          (Tauri 2 Rust shell
                                          + WebView SPA)
```

## 2. 包布局（monorepo）

| 包 | 角色 | 新? |
|---|---|---|
| `@clihub/core` | 内核 —— 所有领域逻辑 | 已存在 |
| `@wikieden/clihub` | CLI (cac) + Clack **TUI**；打包 core | 已存在 |
| `@clihub/catalog` | 已签名 manifest：`skills/tools/presets/mcp/plugins.json` + **`endpoints.json`** | 已存在（+endpoints） |
| `@clihub/gateway` | opt-in 回环 HTTP 守护进程（路由/故障转移/池）；**不在默认安装内** | **新（P2）** |
| `@clihub/daemon` | 薄 Bun HTTP+WS sidecar —— 1:1 内核→JSON 路由表；GUI 唯一 IPC 面 | **新（P3）** |
| `clihub-desktop` | Tauri 2 Rust 壳 + WebView SPA（约 9 面板） | **新（P3）** |

## 3. 内核模块图（逻辑在哪）

`packages/core/src/` 下的领域模块 —— 每个新特性都是**一个模块 + 一张 targets/registry
表**，而非新的架构层：

- **tools/** `registry.ts`（`getProvider`/`listProviders`）、`types.ts`
  （`ToolProvider`、`SettingsAdapter`、`SkillSyncAdapter`）、声明式 provider SDK。
- **settings/** JSON / TOML / YAML 适配器（`read`/`write`/`backup`、
  `snapshotBeforeWrite`）。
- **catalog/** `CatalogLoader`（bundled→user→federated 按 id 合并）、`signing.ts`
  （ed25519 `canonicalPayload`）、`trust.ts`、一致性。
- **skill/** 6 适配器 + `registry.ts`（单一 `SKILL_ADAPTERS` map）、`search`、
  `auditSkills`。
- **mcp/** `manage.ts`（`addMcp`/`listMcp`/`removeMcp`、`MCP_RELPATHS`、
  `adapterFor`/`dialectFor`）、Json/Toml 适配器。**+ `reconcile.ts`（新，P1）。**
- **memory/** 托管块引擎（`applyManagedBlock`/`planMemory`/`MEMORY_TARGETS`）。
  **`sysprompt/`（新，P1）是其近乎逐字的第二实例，有自己的 targets。**
- **profile/** 多账号 profile、`profileEnvVector`、`baseurls.ts`
  （`applyProfileBaseUrls` INJECTORS）、符号链接激活。
- **auth/** `keychain.ts`（`getSecret`/`listSecrets`）、`login.ts`（device/PKCE/
  refresh）、`credentials.ts`（`inspectCredentials`）。
- **apply/** `planApply`/`runApply`/`generateLockfile`/`Lockfile`/`lockfileToConfig`。
- **status/ · diff/** 漂移门禁 + lockfile diff。**sync/** E2E bundle。**+ `sync/transport.ts`（新，P1）。**
- **usage/**（新，P1）只读逐 CLI 遥测汇总。**import/**（新，P1）
  反向摄入。**proxy/ · doctor/ · version/ · backup/ · team/ · audit/ · errors/ · i18n/。**

## 4. 配置面超集（Phase 1 —— 无新层）

全部六项 CC-Switch 对标特性都**组合既有原语**：

| 特性 | 机制 | 复用 | 新 |
|---|---|---|---|
| 端点预设 + 一键切换 ✅ v1.51–52 | `endpoints.json` = 第 6 个已签名 catalog 数组；`clihub endpoint use` 经既有 `baseurls.ts` 注入器把 baseURL 写入各 CLI 原生配置 | `CatalogLoader`、`signing`/`trust`、`baseurls.ts`、keychain | `EndpointPreset` 类型；7 预设已验证种子；anthropic/openai/google 注入器（qwen/kiro/cursor/goose 延后） |
| `clihub import` | 同一批写入器的读方向 → 规范化模型 → `clihub.yaml`/preset | `SettingsAdapter.read`、`inspectCredentials`、`listMcp`、`skillAdapter.list`、`generateClihubYaml` | `src/import/index.ts` + `--link` 解码器（clihub:// + 尽力 ccswitch://） |
| 双向 MCP reconcile | 三方合并：desired vs 各 CLI live（`listMcp`）vs lockfile-base | `listMcp`、`diff.ts` 比较器 | `src/mcp/reconcile.ts` + 冲突策略（`--union` 默认，`--source-wins` 给 CI） |
| 用量/成本汇总 | 逐 CLI `USAGE_SOURCES` 解析器 → 类型化行（只读） | `inspectCredentials`/`runHealthMatrix` 形状 | `src/usage/index.ts`（**脆弱**的逐 CLI 解析器）；**仅 token，绝不把 $ 数字断言为事实** |
| 系统提示管理 | 第二张托管块 targets 表 | `memory/` 引擎逐字 | `src/sysprompt/index.ts`（小） |
| 云文件夹同步 | `encryptBundle` PEM 输出**之下**的 `SyncTransport` 接口 | `sync/` 加密不动 | `FsFolderTransport`（iCloud/Dropbox/OneDrive 文件夹）+ `WebDavTransport` |

**护城河钩子：** `Lockfile` 增加 `provider` + `systemPromptHash`，故 `status --strict`
与 `clihub diff` 也门禁 provider/系统提示漂移。

## 5. 网关（Phase 2 —— 唯一新增运行时子系统）

opt-in `@clihub/gateway`，仅回环、**默认关闭、不在默认安装内**、**仅透传**（无格式转换）。
建于 Node `http`（Node 18 / bun），无原生依赖。

- **进程模型。** `clihub gateway start|stop|status|restart|logs`；默认分离守护进程，
  PID+port+token 存于 `~/.clihub/gateway/gateway.json`（0600）+ flock。仅绑定
  `127.0.0.1`/`::1`；无 `--unsafe-bind` 则拒绝 `0.0.0.0`。
- **把 CLI 指向它 = 复用配置适配器。** `gateway/takeover.ts` 调用**同一**
  `baseurls.ts` 机件把 `http://127.0.0.1:PORT/<provider>` 写为各 CLI base URL，并用
  `clearProfileBaseUrl` 还原。**修正（相对首版草案）：** 今天仅 `anthropic/openai/google`
  有注入器 —— qwen/kiro/cursor/goose 是**净新增**，且 **goose/YAML 在既有缝隙上抛错**
  （需 YAML base-URL 写入器或显式排除）。
- **仅同格式透传。** v1 仅转发同格式；中性 IR + 转换**超出范围**（正确性责任让给
  claude-code-router/LiteLLM）。
- **路由 / 故障转移 / 熔断。** `clihub.yaml` 中 `gateway:` 块（+ `~/.clihub/config.json`
  中全局默认）解析为内存路由表；每目标熔断器（closed/open/half-open）于 429/5xx/超时；
  有序回退链。
- **账号池。** key 经 `getSecret(profile, key)` **按请求**取，注入上游头，**请求后清零** ——
  绝不持久化。**仅 API-key 账号**（无 OAuth/订阅池化 —— ToS/封号风险）。
- **出口是净新增。** 一个真实出站 HTTP 客户端（undici/fetch），尊重代理 URL +
  `NODE_EXTRA_CA_CERTS` —— `proxy/inject.ts` 只*写*配置。
- **可观测性。** 追加写 `requests.jsonl`（key 脱敏）+ `gateway stats`；安全事件经 `audit/`。
- **安全。** 每个端点（含 `/health`、`/metrics`）的逐守护进程 256-bit bearer；Host/Origin
  DNS-rebind 守卫；**强制 keychain 底线**（硬拒绝 `file` 后端）；**已签名上游 host pinset
  于网关启动时重校验**（反 SSRF/key 外泄的支点）。完整模型 + 威胁表见
  [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md)。网关在一次**独立通道**安全 review
  通过前不得离开 `experimental`。

## 6. 桌面 GUI（Phase 3 —— 护城河之上的脸面）

原生 **Tauri 2**（owner 决策）：Rust 壳（窗口/托盘/单实例/深链/自动更新/sidecar 监督）
+ WebView SPA（约 9 面板）。内核是 TS/ESM，跑在 Rust WebView 无法进程内承载的 Bun/Node
进程里，故：

- **`@clihub/daemon`** —— 薄 Bun HTTP+WS sidecar，约 300 行**1:1 路由表**覆盖内核导出
  （与 `cli.ts` 的 cac→内核映射同形）。回环绑定 + 逐会话 bearer；SSE/WS 供 live
  doctor/gateway/watch 流。**唯一**新 IPC 面；所有秘密处理留在内核，绝不在 Rust 重复。
- **面板绑定既有内核函数** —— Dashboard→`runHealthMatrix`、
  Switch→`listProviders`+`applyProfileBaseUrls`+presets、MCP→`listMcp`/reconcile、
  Skills→适配器+`auditSkills`、Gateway→`@clihub/gateway` start/stop/health、
  Versions→`recordVersion`/`diffLockfiles`/`BackupManager`、yaml-editor→`computeStatus`
  漂移横幅。**主打面板 = 漂移 / lockfile / 网关仪表盘** —— 绝不把 provider 下拉放第一位
  （那会让我们成为更差的 CC Switch）。
- **打包：** `tauri-action` → 公证 dmg / 签名 nsis+msi / AppImage+deb；Tauri updater
  JSON + minisign。Apple Developer ID + Windows EV 证书 = 一次性**有预算**投入。从内核继承
  i18n（zh/ja/ko/es）与"回滚神圣"不变量。**CLI/TUI 保持平级 —— GUI 绝非唯一入口。**

## 7. 横切不变量

1. **不分叉逻辑** —— 每个面动作都映射到一个已发布的 `@clihub/core` 函数；golden 一致性
   测试证明 GUI == CLI == 内核。
2. **key 永不持久化于 OS keychain 之外** —— 请求时读取，按请求清零，绝不写入
   `~/.clihub`/`clihub.yaml`/`lock`/日志/sync bundle。
3. **每个新面都被钉定 + 签名 + 漂移门禁**（providers、网关拓扑、系统提示哈希全部进入
   `clihub.lock` + `status --strict`），否则它就是商品化的跟风特性。这是护城河，统一施加。
4. 对任何运行时持有 key 的东西（网关），采取 **opt-in、默认关闭、独立包** —— 配置适配器
   身份在转型后存续。
5. **原子写**（`.tmp`+rename）+ 每次配置变更 `snapshotBeforeWrite` 自动备份；
   `--dry-run`/`rollback` 无处不在。
