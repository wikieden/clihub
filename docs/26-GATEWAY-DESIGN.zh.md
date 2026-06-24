# clihub 网关 — 可直接动工的实现设计

> 🌐 English: [`26-GATEWAY-DESIGN.md`](26-GATEWAY-DESIGN.md) ｜ 本文为同步中文版，正文以英文版为准。

> **门禁未开 —— 这是设计，不是动工令。** 按 [`24-VERSION-PLAN.md`](24-VERSION-PLAN.md)，
> P2 门禁仅在（a）Phase 1 显示真实 adoption **且**（b）有预算支撑一个 3–4 个月的持钥匙
> 守护进程项目（含 human-in-loop 实时 key 测试 + 独立通道安全 review）时开启。门禁开启前
> 不存在、也不得编写 `packages/gateway/` 代码。本文让工程师第一天即可上手，无需重做架构决策。
>
> 叠加阅读于：[`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md)（威胁模型 = 绑定约束）
> 与 [`23-ARCHITECTURE.md`](23-ARCHITECTURE.md) §5（网关所处位置）。本文是介于两者与代码
> 之间的**实现规约** —— 模块布局、类型契约、请求生命周期、配置 schema、出口客户端、
> 逐 CLI 接管矩阵、CLI 命令面、以及映射到验收门的测试计划。

## 0. 是什么 / 不是什么

- **是：** 一个可选、默认关闭、仅回环的本地守护进程（`@clihub/gateway`，**独立包，不在
  默认 `clihub` 安装内**）。在 `http://127.0.0.1:PORT/<provider>` 接收各 AI CLI 请求，
  按请求从 OS keychain 选一个 API-key 账号，附加到上游调用，施加
  账号池 / 故障转移 / 熔断器，并**同格式**转发到真实 provider。
- **不是：** 托管服务、多用户代理、跨 provider 格式转换器（无 Anthropic↔OpenAI↔Gemini IR
  —— 该正确性责任让给 claude-code-router / LiteLLM），也不是 OAuth/订阅池化器（仅
  API-key 账号 —— 见 [`22`](22-GATEWAY-SECURITY.md) T9）。

## 1. 复用 vs 净新增（对照真实代码已修正）

网关组合的已确认内核符号（今日皆存在）：

| 符号 | 文件 | 网关用途 |
|---|---|---|
| `getSecret(profile, key)` | `auth/keychain.ts:325` | 按请求取 key（随后清零） |
| `INJECTORS` / `applyProfileBaseUrls` / `clearProfileBaseUrl` | `profile/baseurls.ts:37,95,143` | `takeover` 写入/还原各 CLI base URL |
| `resolveProxy(...)` | `config/index.ts:140` | 出口尊重企业代理 |
| `canonicalPayload` / `verifyCatalogPayload` | `catalog/signing.ts:44,60` | 启动时重校验已签名上游 host pinset |
| `caBundle` → `NODE_EXTRA_CA_CERTS` | `config/index.ts` | 出口 TLS 信任 |

**净新增（非复用 —— 首版"纯复用"说法是错的）：**

1. **出口 HTTP 客户端。** `proxy/inject.ts` 只*写*配置；`proxy/detect.ts` 只*读*系统代理。
   两者都不拨号。网关需一个真实出站客户端（undici / `fetch`），尊重 `resolveProxy()` +
   `NODE_EXTRA_CA_CERTS`。
2. **逐 CLI 接管注入器。** `INJECTORS` **仅**覆盖 `anthropic`/`openai`/`google`。把
   qwen/kiro/cursor/goose 指向网关是净新增的逐 CLI 工作；**goose / YAML CLI 在既有缝隙上
   抛错**（`proxy/inject.ts` 拒绝 YAML；无 YAML base-URL 写入器）→ 要么构建 YAML 写入器，
   要么**显式排除 goose**。v1 发布 3 个已覆盖注入器 + 显式支持/排除矩阵（§7）。
3. **`providers.json` 已签名内容。** 尚不存在。ed25519 机件可复用，但 providers 数组 +
   其一致性 schema + 进入已签名校验集，都是净新增的已签名内容。**上游 host pinset 仅在
   以下成立时可信：携带该 host 的预设字节位于已签名校验集内，网关从已校验字节读取该 host，
   并在启动时重校验**（T4 支点 —— `canonicalPayload` 签的是文件哈希，非字段正文）。

## 2. 包骨架（`packages/gateway/`）

```
packages/gateway/
  package.json            @clihub/gateway —— 仅依赖 @clihub/core
  src/
    index.ts              公开 API：startGateway/stopGateway/gatewayStatus/health
    server.ts             Node http.Server 装配；逐请求 handler；认证门
    auth-guard.ts         bearer（常量时间）+ Host/Origin DNS-rebind 守卫（T1,T2,T3）
    lifecycle.ts          守护进程 spawn/detach、gateway.json (0600)+flock、PID+nonce（T3）
    routing.ts            clihub.yaml gateway: 块 → 内存 RoutingTable
    pool.ts               AccountPool：round-robin/LRU/weighted/sticky + cooldown
    breaker.ts            每目标 CircuitBreaker 状态机（closed/open/half-open）
    egress.ts             净新增出站客户端（undici）—— 代理 + caBundle 感知
    pinset.ts             已签名上游 host 白名单；启动时重校验（T4）
    keyflow.ts            按请求 getSecret → 注入头 → 清零（T6,T7）
    takeover.ts           经 core INJECTORS 指向/还原各 CLI base URL（§7）
    observe.ts            追加写 requests.jsonl（key 脱敏）+ stats（T6,T10）
    config.ts             GatewayConfig 加载/合并（clihub.yaml + ~/.clihub/config.json）
    types.ts              下列所有接口
  test/                   单元 + curl-vs-fake-upstream 集成
```

网关**仅**导入 `@clihub/core` —— **绝不**重新实现 keychain、签名、代理或配置逻辑（横切
不变量 #1）。CLI 动词住在既有 `@wikieden/clihub` 包内，作为对 `index.ts` 的薄委托，与其他
命令组一致。

## 3. 类型契约（`types.ts`）

```ts
// 持久化握手文件 —— ~/.clihub/gateway/gateway.json，权限 0600
interface GatewayHandshake {
  pid: number;
  port: number;
  host: '127.0.0.1' | '::1';
  token: string;          // 256-bit, base64url
  startNonce: string;     // 绑入认证；每次启动轮换（T3）
  startedAt: string;      // ISO
  pinsetDigest: string;   // 已校验上游 host pinset 的 sha256（T4 审计）
}

interface UpstreamTarget {
  id: string;             // 例如 "anthropic-acct-a"
  provider: 'anthropic' | 'openai' | 'google' | string;
  baseUrl: string;        // 必须匹配已签名 pinset 中的某个 host
  profile: string;        // 从哪个账号 profile getSecret
  keyRef: string;         // keychain key 名（非 key 本身）
  weight?: number;        // weighted 策略
}

type PoolStrategy = 'round-robin' | 'lru' | 'weighted' | 'sticky';

interface RouteRule {
  match: { provider: string; model?: string };  // 仅基于标签/头（不解析正文）
  targets: string[];      // UpstreamTarget id 的有序回退链
  strategy: PoolStrategy;
}

interface BreakerThresholds {
  failures: number;       // 连续失败 → open
  resetMs: number;        // open → half-open 间隔
  tripOn: number[];       // 状态码，默认 [429, 500, 502, 503, 504]
}

interface RoutingTable {
  rules: RouteRule[];
  targets: Record<string, UpstreamTarget>;
  breaker: BreakerThresholds;
}
```

## 4. 请求生命周期（清零点是承重的）

```
CLI → POST http://127.0.0.1:PORT/<provider>/...   (Authorization: Bearer <gateway-token>)
 1. auth-guard：常量时间 bearer 比较 + PID/nonce 绑定          → 不符 401（T3）
 2. auth-guard：Host/Origin 必须解析到回环                     → rebind 时 403（T2）
 3. routing.resolve(provider, 头/标签里的 model)               → RouteRule
 4. pool.pick(rule)  尊重熔断状态                              → UpstreamTarget（全开则 503）
 5. pinset.assert(target.baseUrl)  启动时重校验的 digest        → 不存在则拒绝拨号（T4）
 6. key = await getSecret(target.profile, target.keyRef)        → keychain 底线不满足则 502（T5）
 7. egress.forward(req, target, key)  同格式透传
 8. FINALLY：上游完成后立即 zeroize(key)                        → 按请求，非关机时（T6,T7）
 9. breaker.record(target, status); observe.append(redacted)    → requests.jsonl（T6,T10）
10. 把上游响应逐字流式/返还给 CLI
```

从 [`22`](22-GATEWAY-SECURITY.md) 折回的硬规则：每个端点（含 `/health` `/metrics`）都要
bearer（T2）；启动时 `setrlimit(RLIMIT_CORE, 0)`（T7）；日志中对请求/响应**正文默认拒绝**，
可记录字段白名单（T6）；在任何错误到达日志或 CLI 前剥离注入的 `Authorization`/`x-api-key`
（T6）；硬拒绝 keychain `file` 后端，网关模式无 `--insecure-keychain` 逃逸（T5）；无
`--unsafe-bind` + 确认则拒绝 `0.0.0.0`（T1）。

## 5. `gateway:` 配置 schema（护城河面）

在 `clihub.yaml`（逐项目）内，全局默认在 `~/.clihub/config.json`：

```yaml
gateway:
  bind: 127.0.0.1          # 无 --unsafe-bind 绝不 0.0.0.0
  port: 0                  # 0 = 自动选，持久化到 gateway.json
  strategy: round-robin
  breaker: { failures: 3, resetMs: 30000 }
  targets:
    - id: anthropic-a
      provider: anthropic
      baseUrl: https://api.anthropic.com   # 必须在已签名 pinset 内
      profile: work
      keyRef: anthropic_key
      weight: 2
    - id: anthropic-b
      provider: anthropic
      baseUrl: https://api.anthropic.com
      profile: personal
      keyRef: anthropic_key
  routes:
    - match: { provider: anthropic }
      targets: [anthropic-a, anthropic-b]   # 有序故障转移
```

**Lockfile 增加项**（`clihub.lock.json`）：解析后的网关拓扑 —— `targets`（去秘密）、
`routes`、`breaker`、以及**固定的上游 host** —— 进入已签名校验集。`status --strict` 随即
在**网关拓扑漂移 或 网关预设配置于不受信 catalog 源时令 CI 失败**
（[`22`](22-GATEWAY-SECURITY.md) §"可复现性作为安全特性"）。这是无竞品宣称的卖点：
*整套 LLM 路由拓扑是一份可审查、已签名、可复现的产物。*

## 6. 出口客户端（`egress.ts`，净新增）

- undici（或 Node `fetch`）出站。为企业代理尊重 `resolveProxy(...)`，为 TLS 信任尊重
  `NODE_EXTRA_CA_CERTS` ← `caBundle`（T11）。默认 TLS 校验**开**。
- 同格式透传：复制 method、path 后缀、query、白名单头；把认证头换成按请求的 key；把上游
  正文**流式**回传（不把正文缓冲进日志）。
- 超时 + abort 接到熔断器（步骤 9）。仅经故障转移链（下一个 target）重试，绝不静默同 target
  重试。

## 7. 逐 CLI 接管矩阵（已修正）

`takeover.ts` 复用 `applyProfileBaseUrls` / `clearProfileBaseUrl` 把某 CLI 的 base URL
指向网关并还原。

| CLI | 配置 | 注入器状态 | v1 计划 |
|---|---|---|---|
| Claude Code | JSON | 存在（`anthropic`） | ✅ 接管 |
| Codex | TOML | 存在（`openai`） | ✅ 接管 |
| Gemini | JSON | 存在（`google`） | ✅ 接管 |
| Qwen Code | JSON | 净新增 | ⏳ 加注入器 |
| Cursor | JSON | 净新增 | ⏳ 加注入器 |
| Kiro | JSON | 净新增 | ⏳ 加注入器 |
| Goose | **YAML** | 缝隙抛错 | ⛔ **排除**（或先建 YAML base-URL 写入器） |
| OpenCode | JSONC | 净新增 | ⏳ 加注入器 |

v1 验收仅要求 3 个既有注入器端到端可用；其余显式记为净新增，goose 在 YAML base-URL 写入器
落地前排除。**无静默部分覆盖** —— `gateway takeover` 准确列出它会与不会触碰哪些 CLI。

## 8. CLI 命令面（在 `@wikieden/clihub` 内，薄委托）

```
clihub gateway start [--bind ADDR] [--port N] [--unsafe-bind]
clihub gateway stop
clihub gateway status [--json]
clihub gateway restart
clihub gateway logs [--tail N]
clihub gateway health [--json]      # 主动上游探测 → doctor 矩阵
clihub gateway takeover <cli...>    # 把 CLI 指向网关（列出覆盖/排除）
clihub gateway restore  <cli...>    # 还原原始 base URL
clihub gateway stats                # 从 requests.jsonl 汇总
```

退出码遵循既有 `errors/` 分类。`start` 在 keychain 底线不满足或 pinset 不受信时**响亮失败**
（无降级启动）。

## 9. 动工顺序（门禁开启时）→ 映射 24-VERSION-PLAN P2 槽位

| 槽位（空缺 #） | 交付 | 验收门（来自 24） |
|---|---|---|
| MVP | lifecycle + server + auth-guard + 同格式转发 + takeover（3 注入器） | start/stop/PID/选端口；takeover 写入+还原 base URL+token；bearer 拒绝未认证/错 Host；拒绝 `0.0.0.0` |
| +pool | `pool.ts` 策略 + cooldown；qwen/kiro/cursor/opencode 注入器 | 池轮换 + cooldown；**不持久化不变量**：在 keychain/审计/日志/sync 中 grep 植入秘密 → 不存在 |
| +breaker | `breaker.ts` 故障转移 + 每目标熔断器（注入时钟） | 熔断状态迁移 + 故障转移顺序 |
| +health | 主动探测 → doctor 矩阵；`gateway health --json` | health 呈现；尊重 429 `Retry-After` |
| ⛔ review | **阻塞式独立通道安全 review**（绝不自审） | [`22`](22-GATEWAY-SECURITY.md) 每条控制确认 → 离开 `experimental` |

## 10. 测试计划

- **单元（headless，CI 安全 —— 绝不触碰真实 `~/.claude` 或 Keychain）：**
  路由解析、池策略 + cooldown、熔断状态机（注入时钟）、pinset 校验/拒绝、auth-guard
  bearer + Host/Origin 矩阵、keyflow 清零（断言转发后 buffer 已清）。
- **集成：** 用 `curl` 打网关对一个**假上游**（本地 http server）配**mock keychain** ——
  断言同格式转发、故障转移顺序、熔断触发、以及**不持久化不变量**（植入秘密，跑一次请求，
  grep `~/.clihub` / `requests.jsonl` / sync bundle / 日志 → 秘密不存在）。
- **golden 一致性：** `gateway status` / `health` 结果 == 直接内核调用结果（不变量 #1）。
- **安全 review（§9 ⛔）是独立通道**，也是退出标准 —— 绝不被这些自跑测试单独满足。
