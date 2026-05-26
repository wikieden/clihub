# 测试策略

## 本地隔离测试（Mac）

覆盖 `$HOME` 到临时目录，不污染真实 `~/.claude/`：

```bash
# 单次手动
mkdir -p /tmp/clihub-test/.claude
HOME=/tmp/clihub-test bash install.sh
ls /tmp/clihub-test/.claude/
rm -rf /tmp/clihub-test
```

标准测试脚本 `scripts/test-install.sh`：

```bash
#!/usr/bin/env bash
set -e
TMPDIR=$(mktemp -d)
echo "→ Testing in: $TMPDIR"
HOME="$TMPDIR" bash install.sh
echo "--- Installed files ---"
find "$TMPDIR" -type f
rm -rf "$TMPDIR"
echo "PASS"
```

## Linux 测试（Docker）

```bash
docker run --rm -it \
  -v "$(pwd):/clihub" \
  ubuntu:24.04 \
  bash -c "apt-get update -q && apt-get install -y jq && cd /clihub && HOME=/root bash install.sh"
```

常用镜像矩阵：

| 镜像 | 用途 |
|---|---|
| `ubuntu:24.04` | 主流 Debian 系 |
| `ubuntu:22.04` | LTS 兼容验证 |
| `debian:bookworm-slim` | 精简环境 |
| `fedora:40` | RPM 系 |

## CI 矩阵（GitHub Actions）

目标：每次 PR 自动跑 3 平台 × 2 包管理器：

```yaml
# .github/workflows/test.yml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-24.04, ubuntu-22.04, macos-14]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Install jq
        run: |
          if [[ "$RUNNER_OS" == "Linux" ]]; then
            sudo apt-get install -y jq
          else
            brew install jq
          fi
      - name: Run isolated install test
        run: |
          TMPDIR=$(mktemp -d)
          HOME="$TMPDIR" bash install.sh
          rm -rf "$TMPDIR"
```

## 烟雾测试矩阵

per ROADMAP v0.1 验收标准：

```
3 平台 (mac / ubuntu / debian) × 2 包管 (npm / bun) × 1 工具 (claude-code)
```

```bash
# npm 安装
npm install -g clihub
HOME=/tmp/t1 clihub tool install claude-code
HOME=/tmp/t1 clihub doctor

# bun 安装
bun add -g clihub
HOME=/tmp/t2 clihub tool install claude-code
HOME=/tmp/t2 clihub doctor
```
