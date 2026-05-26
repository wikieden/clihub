# Tool Provider — 多 AI CLI 工具抽象

## 设计目标

让 clihub 用统一接口装 / 配 / 卸任何 AI CLI 工具，初期内置三大主流，社区可写 `clihub-plugin-*` 扩展。

## ToolProvider 接口

```ts
export interface ToolProvider {
  id: string                          // 唯一稳定 ID, kebab-case
  name: string                        // 显示名 i18n key
  description: string                 // 简介 i18n key
  homepage: string
  supportedPlatforms: ('darwin' | 'linux' | 'win32')[]
  installMethods: InstallMethod[]

  detect(): Promise<DetectResult>
  install(opts: InstallOpts): Promise<void>
  uninstall(): Promise<void>
  update(): Promise<void>
  doctor(): Promise<HealthReport>
  configure?(): Promise<void>

  settingsAdapter: SettingsAdapter
  skillAdapter?: SkillSyncAdapter
  mcpAdapter?: McpAdapter
  hookAdapter?: HookAdapter
  permissionAdapter?: PermissionAdapter
}

type InstallMethod =
  | { kind: 'brew', formula: string, cask?: boolean }
  | { kind: 'npm', pkg: string, global?: boolean }
  | { kind: 'bun', pkg: string }
  | { kind: 'curl', url: string, sha256?: string }
  | { kind: 'winget', id: string }
  | { kind: 'pip', pkg: string }
  | { kind: 'binary', url: { darwin: string, linux: string, win32?: string } }
```

## 内置 Provider 矩阵

| ID | 名称 | install 方式 | settings | skill | MCP | hook | perm |
|---|---|---|---|---|---|---|---|
| `claude-code` | Anthropic Claude Code | brew cask / npm / curl | ✓ | ✓ 原生 | ✓ | ✓ | ✓ |
| `codex` | OpenAI Codex CLI | npm / curl | ✓ | ⚠ 模拟 | ✓ | ✗ | ⚠ sandbox |
| `kiro-cli` | AWS Kiro CLI | curl / brew | ✓ | ⚠ 转译 | ⚠ | ✗ | ⚠ |
| `gemini-cli` | Google Gemini CLI | npm / curl | ✓ | ⚠ 模拟 | ✓ | ✗ | ⚠ |
| `aider` | Open-source pair-prog | pip / brew | ✓ | ✗ | ✗ | ✗ | ✗ |
| `opencode` | Anthropic-compat OSS | npm | ✓ | ⚠ 模拟 | ✓ | ✗ | ⚠ |
| `cursor-agent` | Cursor agent CLI | curl | ✓ | ✗ | ⚠ | ✗ | ⚠ |

图例：✓ 原生 / ⚠ clihub 模拟 / ✗ 无支持

## claude-code provider 实现要点

```ts
class ClaudeCodeProvider implements ToolProvider {
  id = 'claude-code'

  async detect() {
    const path = which('claude')
    if (!path) return { installed: false }
    const version = await exec('claude --version')
    return { installed: true, version, path, configPath: '~/.claude/settings.json' }
  }

  async install(opts) {
    if (platform === 'darwin' && hasCommand('brew')) {
      await exec('brew install --cask claude-code')
    } else {
      await exec('curl -fsSL https://claude.ai/install.sh | bash')
    }
    await this.postInstall()
  }

  settingsAdapter = new ClaudeCodeSettingsAdapter()
  skillAdapter = new ClaudeCodeSkillAdapter()
  mcpAdapter = new ClaudeCodeMcpAdapter()
  hookAdapter = new ClaudeCodeHookAdapter()
  permissionAdapter = new ClaudeCodePermissionAdapter()
}
```

## codex provider 实现要点

```ts
class CodexProvider implements ToolProvider {
  id = 'codex'

  installMethods = [
    { kind: 'npm', pkg: '@openai/codex', global: true },
    { kind: 'curl', url: 'https://...' }
  ]

  skillAdapter = new CodexSkillAdapter()    // 桥接, 见 06
  hookAdapter = undefined                    // codex 无 hook
  permissionAdapter = new CodexSandboxAdapter()  // config.toml [sandbox]
}
```

## 第三方 Plugin

```bash
clihub plugin add clihub-plugin-kiro
```

要求：

1. npm 包名以 `clihub-plugin-` 开头（或 `@scope/clihub-plugin-*`）
2. 默认 export 一个 `ToolProvider` 数组
3. peer dependency `@clihub/core@^x`

```ts
// clihub-plugin-myai/src/index.ts
import type { ToolProvider } from '@clihub/core'

export default [
  {
    id: 'my-ai-cli',
    name: 'tool.my-ai-cli.name',
    ...
  } satisfies ToolProvider
]
```

加载顺序：核心内置 → 用户全局 plugins → 项目本地 `.clihub/plugins/`，后者覆盖前者。

## detect 算法

```
1. which <bin-name>
2. 各 install method 的副产物路径 (e.g. brew --prefix)
3. ~/.config/<tool>/ 存在性
4. 版本探测: <bin> --version 解析 semver
5. 配置完整性: configPath() 文件存在?
```

## install 算法

```
1. 检查平台是否 supported
2. 按 installMethods 顺序探测可用包管理
3. 选定方法 → 执行 → 验证 exit code
4. detect() 二次确认装上了
5. 提示 postInstall (登录 / 设 API key / ...)
```

## 平台特定行为

| 平台 | 默认包管 | 备注 |
|---|---|---|
| macOS | brew | 无 brew 则 fallback npm/curl |
| Linux | npm / curl | 优先 npm 因依赖少 |
| Windows | winget / npm | bash 需 WSL 或 git-bash |

## 错误处理

- 装失败：自动 `tool uninstall` 清理残留，恢复到装前状态
- 检测失败：不假设未装，提示用户手动确认
- 版本不兼容：警告但不阻塞
