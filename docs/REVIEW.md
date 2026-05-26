# 总体目标 Review

## TL;DR

项目野心从「CC 状态栏一键装」扩到「跨 AI CLI 工具的 skill / 配置生态管家」。范围 5×，但架构清晰，可分阶段交付。**主要风险在范围管理和外部工具机制变更**。

## 一、目标一致性

| 原始诉求 | 当前设计满足度 | 评 |
|---|---|---|
| 一键安装 CC | ✅ `clihub tool install claude-code` | OK |
| 交互式菜单选插件 / skill | ✅ TUI + clack/prompts | OK |
| 小白友好 | ✅ 预设 + 中文 + 默认值 + dry-run | OK |
| 安装 CC 本体 | ✅ ToolProvider 抽象 | OK |
| clihub 作 skill 装 CC 内 | ✅ skill 包 + /clihub | OK |
| clihub CLI npm / bun 装 | ✅ 单文件 bundle | OK |
| 多语言 | ✅ i18n 极简自造 | OK |
| 未来追加 codex / kiro-cli | ✅ ToolProvider + plugin | OK |

诉求 100% 覆盖。

## 二、架构亮点

1. **三身位统一内核**：CLI / skill / slash 共享 `@clihub/core`，行为不漂移
2. **ToolProvider 抽象**：新工具只写 1 个文件 + 几个 adapter
3. **skill 跨工具同步**：manifest `supports.<tool>` 矩阵 + adapter 转译，能力降级显式
4. **dry-run + backup + rollback 一等公民**
5. **i18n 极简自造**：50 行实现 + 类型安全 + 翻译门槛低
6. **bun 优先 + Node 兼容**

## 三、风险与对策

### 高

1. **范围扩张** — 4 工具 × 80 skill × 10 语言 × 3 平台 = 矩阵爆炸
   - 对策：v0.1 严守 1 工具 + 5 skill + 2 语言

2. **外部工具机制变化** — Anthropic / OpenAI 可能改 skill / prompt 格式
   - 对策：adapter 层薄、可替换；订阅 changelog

3. **维护成本** — 80 skill 元数据需持续同步上游
   - 对策：catalog 与 skill 源解耦；社区 PR；自动化检测失效

### 中

4. **Codex / Kiro skill 模拟体验差** — 桥接 prompts 不如原生
   - 对策：文档明示「在 codex 中需 /<skill> 显式唤起」；adapter `mode` 标签可见

5. **Windows 兼容**
   - 对策：核心走 Node API；statusline 等 bash 文件标 macOS/Linux only

6. **i18n 质量** — 机翻塞 PR
   - 对策：贡献协议明示「母语 review」；CI lint + 维护者 gate

### 低

7. **首装失败** — 用户网络 / 包管不一致
   - 对策：curl 安装器探测多 runtime；详细错误 + 日志路径

8. **品牌冲突** — npm `clihub` 可能被占
   - 对策：早抢注 + 域名

## 四、必须早决的设计点

1. **第三方 skill 包格式**：与 CC 原生一致 vs clihub 中性
   - **建议**：以 CC 原生为基线 + manifest.json 加 clihub 元数据。社区已有 CC skill 可直接被 clihub 装

2. **CLI 与 skill 谁先稳**：先稳 CLI vs 先稳 skill
   - **建议**：CLI 先 — skill 本质是 CLI 壳

3. **catalog 治理**：维护者审核 vs 社区自由
   - **建议**：核心 catalog 维护者审；插件包 npm 自由发，搜索按下载量 / 审核标签排

## 五、可延后

- 远端 catalog schema 演进策略
- 遥测（默认 opt-in）
- CodeQL / 安全扫描 CI
- monorepo 工具选择（已选 bun）

## 六、文档完整性自检

| 维度 | 覆盖 | 文件 |
|---|---|---|
| 愿景 / 目标 | ✓ | 00-VISION |
| 架构 / 分层 | ✓ | 01-ARCHITECTURE |
| CLI 命令 | ✓ | 02-CLI-COMMANDS |
| TUI 交互 | ✓ | 03-TUI-FLOW |
| 多工具抽象 | ✓ | 04-TOOL-PROVIDERS |
| clihub skill | ✓ | 05-CLIHUB-SKILL |
| skill 跨工具同步 | ✓ | 06-SKILL-CROSS-TOOL |
| i18n | ✓ | 07-I18N |
| skill 目录 | ✓ | 08-SKILL-CATALOG |
| 发布安装 | ✓ | 09-DISTRIBUTION |
| 安全备份 | ✓ | 10-SECURITY-BACKUP |
| 路线图 | ✓ | 11-ROADMAP |
| 总评 | ✓ | REVIEW |

待补：

- [ ] CONTRIBUTING.md — 翻译 / 插件 / skill 贡献流程
- [ ] ADR/ — 关键决策记录
- [ ] API.md — `@clihub/core` 公开 API
- [ ] TESTING.md — 测试矩阵

## 七、立即可动手的最小切片

按依赖排序，每项 1-2 天：

1. **改仓库名**：`clihub` → `clihub`（typo + 反映新定位）
2. **搭 monorepo 骨架**：`package.json` 工作区 + 三个 package
3. **i18n 极简实现** + en/zh-CN locale (覆盖 50 个 key 起步)
4. **`core/backup.ts` + `core/settings.ts`** (claude-code adapter)
5. **CLI 接通 `doctor` + `config show`** 跑通最小闭环
6. **TUI 主菜单 + 语言选择**
7. **`tool install claude-code`**（brew / npm / curl 三路径）
8. **skill install superpowers**（manifest + CC 落盘）跑通
9. **`clihub` skill 包** + `/clihub` 命令
10. **发首版到 npm test tag**

合计约 2-3 周可有可演示 MVP。

## 八、关于现仓库 statusline

现 `statusline.sh` + `install.sh` 保留为 `packages/statusline/`。新 `clihub statusline install` 命令调它，本质包装。不重写。

## 九、最终判断

设计**自洽、分层清晰、可演进**，靠抽象（ToolProvider / SkillSyncAdapter / SettingsAdapter / i18n）承接未来变化。

**最大变量**是各 AI CLI 工具自身扩展机制演进 — 保持 adapter 薄、紧跟 changelog 即可。

**建议下一步**：

1. 确认仓库改名 `clihub`
2. 同意 v0.1 范围（1 工具 + 5 skill + 双语 + 单一预设）
3. 开始 monorepo 骨架与 i18n 底座

可干。
