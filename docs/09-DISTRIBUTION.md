# 发布与安装

## 分发通道

| 通道 | 命令 | 阶段 |
|---|---|---|
| **curl 安装器** | `curl -fsSL clihub.dev/install \| sh` | v0.1 |
| **npm** | `npm i -g clihub` | v0.1 |
| **bun** | `bun add -g clihub` | v0.1 |
| **pnpm** | `pnpm add -g clihub` | v0.1 |
| **brew tap** | `brew install clihub/tap/clihub` | v0.3 |
| **winget** | `winget install clihub` | v0.4 |
| **scoop** | `scoop install clihub` | v0.4 |

## curl 安装器逻辑

```bash
#!/usr/bin/env bash
# scripts/install.sh

set -euo pipefail

detect_runtime() {
  if command -v bun >/dev/null;  then echo bun
  elif command -v pnpm >/dev/null; then echo pnpm
  elif command -v npm >/dev/null;  then echo npm
  else echo none
  fi
}

ensure_node_or_bun() {
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
}

runtime=$(detect_runtime)
[[ "$runtime" == "none" ]] && ensure_node_or_bun && runtime=bun

case "$runtime" in
  bun)  bun add -g clihub ;;
  pnpm) pnpm add -g clihub ;;
  npm)  npm install -g clihub ;;
esac

clihub --version
clihub
```

## package.json (cli 包)

```json
{
  "name": "clihub",
  "version": "0.1.0",
  "type": "module",
  "bin": { "clihub": "./dist/cli.js" },
  "scripts": {
    "build": "bun build src/cli.ts --outdir dist --target node --minify",
    "dev": "bun src/cli.ts",
    "test": "bun test",
    "postinstall": "node dist/postinstall.js || true"
  },
  "engines": { "node": ">=18" },
  "files": ["dist", "skill", "catalog", "README.md"],
  "dependencies": {
    "@clihub/core": "workspace:*",
    "cac": "^6",
    "@clack/prompts": "^0.7",
    "execa": "^9",
    "kleur": "^4"
  }
}
```

## postinstall 行为

```js
// dist/postinstall.js
import { existsSync } from 'fs'
import { homedir } from 'os'

const claudeExists = existsSync(`${homedir()}/.claude`)
const isCI = !!process.env.CI

if (claudeExists && !isCI) {
  console.log('')
  console.log('  clihub installed.')
  console.log('  ~/.claude detected. Run: clihub')
  console.log('  To install clihub skill in Claude Code: clihub skill install clihub')
  console.log('')
}
```

绝不自动改用户配置。

## 单文件 vs tree

`bun build --target node --minify` 出单文件 ~500KB，启动 < 100ms。

## 版本策略

- semver
- `dist-tag`：`latest` / `next` / `beta`
- `clihub self-update --tag next` 切预览
- monorepo workspace 同步发版，`@clihub/core` 与 `clihub` 同 major

## 平台特殊处理

### Windows

- 主推 npm/bun，不依赖 bash 工具
- statusline.sh 等 shell 脚本在 Win 走 Git-Bash / WSL 或 PowerShell 重写
- 路径处理用 `path.posix` vs `path.win32` 严格区分

### macOS

- brew tap 后期：`brew install clihub/tap/clihub`
- 注意 ARM / x64 分发（bun 自带处理）

### Linux

- 主推 npm/bun
- 检查 glibc 版本，bun 需 glibc 2.31+

## 卸载

```bash
clihub self uninstall
```

1. 撤销 clihub 写过的所有改动
2. 移除 `~/.clihub/`（询问是否保留备份）
3. 提示用 `npm uninstall -g clihub` 卸 binary

## 升级路径

```bash
clihub self-update
clihub self-update --tag next
clihub self-update --rollback
```

## 完整性校验

curl 安装器附 sha256：

```bash
curl -fsSL clihub.dev/install.sh -o install.sh
curl -fsSL clihub.dev/install.sh.sha256 -o install.sh.sha256
sha256sum -c install.sh.sha256 && sh install.sh
```

## 文档站

`clihub.dev` 内容：

- 安装
- CLI 参考
- TUI 截图
- skill catalog 在线浏览
- 插件开发指南
- 翻译贡献指南
- 故障排查

栈：astro / vitepress / docusaurus 任选。
