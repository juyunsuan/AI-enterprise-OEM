// 本仓库后端体量（v1.6.0 起新增 bot-host / geo-site / miniprogram 等大模块）在默认约 4GB 的
// V8 堆下，tsc --noEmit、类型感知的 eslint 与 jest --runInBand 都会以退出码 134 OOM
// （CI runner 上已实测），因此与前端 scripts/with-heap.mjs 同款统一抬高堆上限：
//   - 已显式配置 --max-old-space-size 的 NODE_OPTIONS 原样透传，不覆盖使用者设置；
//   - 需要调整时用 NODE_HEAP_MB（例如 8192）临时覆盖。
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 只暴露本包实际用到的入口，避免变成任意命令执行器。
const BINS = {
  tsc: '../node_modules/typescript/bin/tsc',
  eslint: '../node_modules/eslint/bin/eslint.js',
  jest: '../node_modules/jest/bin/jest.js',
};

const [name, ...args] = process.argv.slice(2);
const target = BINS[name];
if (!target) {
  console.error(`不支持的入口：${name}（可用：${Object.keys(BINS).join('、')}）`);
  process.exit(1);
}

const heapMb = process.env.NODE_HEAP_MB || '10240';
const current = process.env.NODE_OPTIONS || '';
const nodeOptions = /--max-old-space-size=/.test(current)
  ? current
  : `${current} --max-old-space-size=${heapMb}`.trim();

const result = spawnSync(process.execPath, [fileURLToPath(new URL(target, import.meta.url)), ...args], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});
process.exit(result.status ?? 1);
