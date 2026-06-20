// Compile the @clihub/daemon into a standalone, bun-less executable that the
// packaged desktop app ships as a Tauri resource and execs directly — so a
// user machine needs neither bun nor the repo source.
//
//   bun build --compile embeds the bun runtime, producing a ~64 MB self-
//   contained binary. We name it `clihub-daemon[.exe]` under src-tauri/binaries/
//   and ship it via the `resources` glob in tauri.conf.json.
//
// Host-arch build by default (covers dev + single-arch CI). The macOS universal
// CI build overrides this with two `--target` compiles + `lipo` (see
// desktop-release.yml).
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const daemonEntry = join(root, '..', 'packages', 'daemon', 'src', 'main.ts');
const outDir = join(root, 'src-tauri', 'binaries');
mkdirSync(outDir, { recursive: true });

// Map Node's process.platform/arch onto bun's --target triple.
const BUN_TARGET = {
  'darwin-arm64': 'bun-darwin-arm64',
  'darwin-x64': 'bun-darwin-x64',
  'linux-x64': 'bun-linux-x64',
  'linux-arm64': 'bun-linux-arm64',
  'win32-x64': 'bun-windows-x64',
};

const key = `${process.platform}-${process.arch}`;
const target = process.env.BUN_SIDECAR_TARGET ?? BUN_TARGET[key];
if (!target) {
  console.error(`build-sidecar: unsupported host ${key}`);
  process.exit(1);
}

const outName = process.platform === 'win32' ? 'clihub-daemon.exe' : 'clihub-daemon';
const outFile = process.env.BUN_SIDECAR_OUTFILE ?? join(outDir, outName);

// CI pre-builds a universal (lipo'd) macOS sidecar, then sets this so the
// beforeBuildCommand rebuild doesn't clobber it with a host-arch-only binary.
if (process.env.CLIHUB_SIDECAR_SKIP && existsSync(outFile)) {
  console.error(`build-sidecar: skip — ${outFile} already present`);
  process.exit(0);
}

const args = ['build', '--compile', `--target=${target}`, '--outfile', outFile, daemonEntry];
console.error(`build-sidecar: bun ${args.join(' ')}`);
const res = spawnSync('bun', args, { stdio: 'inherit' });
process.exit(res.status ?? 1);
