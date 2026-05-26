# TUI 交互流程

## 库选择

`@clack/prompts` — 现代、跨平台、外观漂亮、键位约定一致。

## 启动流（首次）

```
$ clihub
◆ clihub
│
│ 首次使用！先选语言:
◇  ❯ 中文（简体）
│    English
│    日本語
│    한국어
│    其它...
│
◇ 检测到系统:
│   平台: macOS 14.5 (arm64)
│   Node: v20.11.0
│   Claude Code: 未安装
│   Codex CLI: 未安装
│
◇ 想做啥？
│  ❯ 一键全装（推荐预设：新手包）
│    手动选要装的东西
│    只装 Claude Code 本体
│    我是老手，进高级模式
│    退出
```

## 主菜单

```
$ clihub
◆ clihub          [zh-CN]
│
◇ 想做啥?
│  ❯ 装 / 卸 CLI 工具
│    管 skill 包
│    管 MCP server
│    管 Permission
│    设 Hook
│    切模型 / effort
│    Statusline 调整
│    备份 / 回滚
│    语言 / 偏好
│    体检 (doctor)
│    退出
```

## 子菜单：CLI 工具

```
◇ CLI 工具状态:
│  状态  ID            版本       说明
│  [✓]   claude-code   4.7.0      Anthropic 官方
│  [✗]   codex         -          OpenAI Codex CLI
│  [✗]   kiro-cli      -          AWS Kiro CLI
│  [✗]   gemini-cli    -          Google Gemini CLI
│  [✓]   aider         0.55.0     开源 pair programmer
│
◇ 操作:
│  ❯ 装新工具
│    更新已装
│    卸载
│    体检
│    返回
```

## 子菜单：skill 管理

```
◇ Skill 操作:
│  ❯ 浏览目录 / 按分类挑
│    搜索 skill
│    应用预设
│    已装列表
│    检查更新
│    从 URL / git 装
│    返回
```

浏览目录：

```
◇ 选分类:
│  ❯ 必备核心      (4)   superpowers, omc, ecc, claude-api
│    文档生产      (8)   anthropic-skills 全家桶
│    代码质量      (12)  review / security / tdd 系
│    语言专项      (10)
│    框架专项      (15)
│    Web 流水线    (8)   gstack 全家桶
│    飞书办公      (18)  lark 全家桶
│    搜索 / MCP    (10)
│    设计 / UI     (6)
│    趣味 / 精简   (4)
│    返回
```

进具体分类（多选）：

```
◇ 选 skill (空格多选, 回车确认):
│   [x] superpowers
│   [x] oh-my-claudecode
│   [ ] everything-claude-code
│   [ ] claude-api
│
◇ 装到哪些工具? (默认全部已装的)
│   [x] Claude Code
│   [x] Codex CLI
│   [ ] Gemini CLI
│
◇ 预览改动:
│   将装 2 个 skill 到 2 个工具
│   → ~/.claude/skills/superpowers/
│   → ~/.claude/skills/oh-my-claudecode/
│   → ~/.codex/skills/superpowers/  + ~/.codex/prompts/superpowers.md
│   → ~/.codex/skills/oh-my-claudecode/ + ~/.codex/prompts/oh-my-claudecode.md
│   备份目录: ~/.clihub/backups/20260526-110512/
│
◇ 确认?
│  ❯ 是
│    返回修改
│    取消
```

## 一键预设流

```
◇ 选预设:
│   ❯ 新手包       最小可用 (5 skill)
│     全栈包       新手包 + 框架 / 设计 (15 skill)
│     中文办公包   新手包 + lark 全家桶 (20 skill)
│     极客包       全栈 + 全语言 review + codex (40 skill)
│     自定义...
│
◇ 预览: 新手包 将装：
│   工具:  claude-code (若未装)
│   skill: superpowers, oh-my-claudecode, codegraph,
│          tavily-dynamic-search, caveman
│   MCP:   codegraph, context7
│   hook:  PreToolUse 安全网模板
│   statusline: 默认双行
│
◇ 估算耗时: ~90 秒
◇ 确认?  ❯ 是 / 否
```

## doctor 流

```
◇ 体检中...
│  ✓ Node.js 20.11.0
│  ✓ jq 1.7
│  ✓ git 2.45
│  ✓ Claude Code 4.7.0
│  ✗ Codex CLI 未装
│  ✓ ~/.claude/settings.json 有效
│  ⚠ MCP: codegraph 索引超过 3 天未更新
│  ✓ Skill: 12 个已装，全部 SKILL.md 有效
│  ✓ Statusline 安装且通过烟雾测试
│
◇ 发现 2 个问题，要修?
│  ❯ 自动修
│    手动逐个看
│    跳过
```

## 报错流

任何步骤异常自动：

1. 立即停止
2. 显示完整错误 + 当前已做的改动
3. 询问是否回滚（默认是）
4. 写日志到 `~/.clihub/logs/<ts>.log`
5. 退出码 ≠ 0

## 键位

- `↑ ↓` 移动
- `空格` 多选切换
- `回车` 确认
- `Esc / Ctrl+C` 取消（弹确认）
- `Tab` 在多选 / 单选间切换
- `?` 显示当前页帮助
- `/` 进入搜索（长列表）
