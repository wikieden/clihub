# clihub 网关 — 威胁模型与安全设计

> 🌐 English: [`22-GATEWAY-SECURITY.md`](22-GATEWAY-SECURITY.md) ｜ 本文为同步中文版，正文以英文版为准。

> **先设计，非发版后补。** clihub 本地网关是**第一个在请求路径中持有实时 provider
> API key** 的组件，反转了此前"key 永不离开 keychain"的姿态。本威胁模型是一条
> **设计约束**，门禁架构本身 —— 网关在一次**独立通道（绝不自审）**安全 review
> 确认下列每一条控制项之前，不得离开 `experimental`。配套
> [`00-VISION.md`](00-VISION.md)（非目标）与 [`11-ROADMAP.md`](11-ROADMAP.md)（Phase 2）。

## 网关是什么（范围）

一个**可选、默认关闭、仅回环**的本地守护进程（`@clihub/gateway`，**独立包** —— **不**在
默认 `clihub` 安装内）。它在 `http://127.0.0.1:PORT/<provider>` 接收来自各 AI CLI 的
请求，从 OS keychain 选取一个账号/key，附加到上游调用，并施加
故障转移 / 熔断器 / 账号池。**仅同格式透传** —— 不做跨 provider 格式转换。它绝不绑定
非回环地址，绝不为其他用户代理，绝不作为托管服务运行。

## 修订后的密钥不变量

旧：*key 永不离开 OS keychain。* 新：**key 永不*持久化*于 OS keychain 之外。** 它们：
- 在**请求时**经 `getSecret(profile, key)` 读入网关堆，
- 注入上游 `Authorization` / `x-api-key` 头，
- 上游请求完成后**立即清零**（按请求，**而非**关机时 —— 持到关机的 key 整个会话都驻留内存），
- 绝不写入 `~/.clihub`、`clihub.yaml`、`clihub.lock.json`、日志或 sync bundle（`sync`
  中既有的 keychain 排除规则原样保留）。

下游 CLI 永不持有该 key —— 这相对今天（每个 CLI 各存自己的 key）是一项安全*改进*。

## 威胁模型

| # | 威胁 | 控制 | 残余风险 |
|---|---|---|---|
| T1 | 远程 / 局域网访问守护进程 | 仅绑定 `127.0.0.1`/`::1`；无 `--unsafe-bind` + 确认则拒绝 `0.0.0.0` | 回环成立则无 |
| T2 | 浏览器驱动访问（DNS-rebind / CSRF） | 拒绝任何非回环 `Host`/`Origin`；解析并校验映射到回环的 Host 名；无 `Access-Control-Allow-Origin`；**每个端点（含 `/health` `/metrics`）都要求 bearer** | 对浏览器无 |
| T3 | 同用户进程读取 `gateway.json` token | 256-bit token，`0600`，常量时间比较，绑定守护进程 PID+start-nonce；**每次已认证请求均审计** | **已接受、已记录**：同用户不是真正边界 |
| T4 | 经投毒预设的 key 外泄（SSRF） | **关键支点** —— 上游 host 仅从**已签名预设字节**读取，签名在**网关启动时**重新校验（不止 catalog-sync 时）；允许上游 host 的 pinset；不受信/未签名预设 → 空 pinset → 拒绝拨号 | 签名覆盖预设正文则无 |
| T5 | keychain 底线过弱（`file` 后端） | 网关在 `file` 后端上**硬拒绝启动**（scrypt-over-`hostname:username`，无用户秘密 → 可离线推导）。网关模式无 `--insecure-keychain` 逃逸 | 无（拒绝） |
| T6 | key 泄入日志 / 错误正文 | 对请求/响应**正文默认拒绝**（仅元数据）；审计路径用可记录字段**白名单**；在任何错误到达日志或返还 CLI 的 HTTP 错误前剥离注入的 `Authorization`/`x-api-key` | 模式 glob 脱敏仅作兜底 |
| T7 | 内存中 key 暴露（core dump、swap、`/proc/pid/mem`） | `setrlimit(RLIMIT_CORE, 0)`；按请求清零；绝不记录进程内存 | 同用户 root 的 swap/ptrace：已接受 |
| T8 | 跨账号 key 泄漏 | 按请求 profile 绑定 + `CliPolicy` 对未知 tool id 默认拒绝；一个 CLI 不能被服务另一账号的 key | 无 |
| T9 | OAuth/订阅池化 → 供应商封号 | **v1.x 不发布，连 opt-in 都没有。** 池化**仅限 API-key 账号。** ToS 警告无法保护用户免遭封号 | 移出范围 |
| T10 | 审计被篡改 | 追加写审计是**幸存即取证**，非安全控制；能驱动网关的同用户攻击者同样能截断它。**不得作为控制项宣传** | 已接受、已记录 |
| T11 | 上游 MITM | 默认经既有 `caBundle` → `NODE_EXTRA_CA_CERTS` 开启 TLS 校验；出口尊重 `resolveProxy()`（企业代理/CA） | 无 |

## 可复现性作为安全特性（护城河）

网关的差异点不是故障转移 —— 而是它的**整套配置**（路由规则、池成员、熔断阈值、
**固定的上游 host**）存于 `clihub.yaml`，钉入已签名的 `clihub.lock.json`，并由
`status --strict` 强制执行。"你团队的整套 LLM 路由拓扑是一份可审查、已签名、可复现的
产物" —— 这是无竞品敢宣称的。一次 `status --strict` 检查会在**网关预设配置于不受信
catalog 源时令 CI 失败**。

## 折回的修正（相对首版设计草案）

下列"纯复用"假设对照实际代码是错的，现在明确为新增工作，而非复用：
- `profile/baseurls.ts` 的 INJECTORS **仅**覆盖 `anthropic`/`openai`/`google`。把
  qwen/kiro/cursor/goose 指向网关是**净新增**的逐 CLI 工作。
- **goose / YAML CLI 无法**经既有缝隙指向网关（`proxy/inject.ts` 对 YAML 配置抛错；
  无 YAML base-URL 写入器）。要么构建 YAML 写入器，要么**显式将 goose 排除**于网关接管。
- 网关**出口是净新增 HTTP 客户端**（undici/fetch，尊重代理 URL + `NODE_EXTRA_CA_CERTS`）。
  `proxy/inject.ts` 只*写*配置；`proxy/detect.ts` 只*读*系统代理。两者都不是 HTTP 客户端。
- `providers.json` **尚不存在** —— ed25519 签名机件可复用，但 providers 数组、其一致性
  schema、以及它进入已签名校验集，都是净新增的已签名内容。
- `canonicalPayload` 对 `{source, version, sorted checksums}` 签名 —— **是文件哈希，
  非字段正文。** 上游 host pinset 仅在以下三者同时成立时可信：含该 host 的预设**字节**
  位于已签名校验集内，且网关从已校验字节读取该 host，且在启动时重新校验（T4）。

## 退出标准

Phase 2 仅在一次独立通道安全 review（按项目代码 review 规则 —— 绝不自审）确认以下各项
后离开 `experimental`：仅回环强制、不持久化不变量（在 `~/.clihub` / `audit.log` /
`session.json` / sync bundle / 日志中 grep 一个植入的秘密 → 不存在）、按请求清零、
默认不记录正文、每个端点 bearer、已签名 host pinset 启动时重校验、强制 keychain 底线、
仅 API-key 池化、每次已认证请求审计。
