/**
 * 面向 AI 的接口索引：从契约派生「按业务域分片」的可读索引。
 *
 * 为什么不用 docs/api/openapi.json：它是完整 schema 的机器可读来源，体积大且 schema 内联，
 * 直接整份读入会爆上下文。这里只给 method / path / 动作名 / 读写 / 通道 / 字段名摘要，
 * 需要完整参数与响应结构时再去 openapi.json 按 path 精确查找。
 *
 * 用法：
 *   node scripts/gen-api-index.mjs            # 写 docs/dev-kit/api/
 *   node scripts/gen-api-index.mjs --check    # 逐字节比对，不一致退出码 1
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'docs', 'dev-kit', 'api');
const check = process.argv.includes('--check');
const require = createRequire(path.join(root, 'package.json'));
const contractsPath = path.join(root, 'packages', 'contracts', 'dist', 'index.js');

const HEADER = [
  '<!-- 自动生成，请勿手改。源：packages/contracts/src；命令：pnpm api:index -->',
  '',
];

if (!existsSync(contractsPath)) {
  console.error('缺少 packages/contracts/dist/index.js，先运行 pnpm --filter @enterprise/contracts build');
  process.exit(1);
}

const contracts = require(contractsPath);
const { endpoints } = contracts;
if (!endpoints) {
  console.error('契约没有导出 endpoints');
  process.exit(1);
}

const safe = (fn, ...args) => {
  try {
    return fn(...args);
  } catch {
    return '';
  }
};

const shapeKeys = (schema) => {
  try {
    const shape = schema?.shape;
    if (!shape || typeof shape !== 'object') return [];
    return Object.keys(shape);
  } catch {
    return [];
  }
};

const fieldSummary = (schema) => {
  if (!schema) return '';
  const keys = shapeKeys(schema);
  if (keys.length) return keys.join(', ');
  try {
    const inner = schema?._def?.innerType ?? schema?._def?.schema;
    if (inner) return fieldSummary(inner);
  } catch {
    // 联合 / 递归 schema 不展开
  }
  return '';
};

const responseSummary = (schema) => {
  const keys = shapeKeys(schema)?.filter((key) => key !== 'code' && key !== 'message');
  const out = [];
  for (const key of keys) {
    if (key === 'data') {
      const dataKeys = shapeKeys(schema.shape?.data);
      out.push(dataKeys.length ? `data{${dataKeys.join(', ')}}` : 'data');
    } else {
      out.push(key);
    }
  }
  return out.join(', ');
};

const channelOf = (endpointPath) => {
  if (endpointPath.startsWith('/api/v1/')) return 'key(API Key)';
  if (endpointPath.startsWith('/api/public/')) return 'public(公开)';
  if (endpointPath.startsWith('/enterprise/admin/')) return 'admin(平台管理员)';
  if (endpointPath.startsWith('/enterprise/')) return 'session(会话)';
  return 'other';
};

const fileSafe = (domain) =>
  String(domain || 'root')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'root';

const rows = [];
for (const [operationId, definition] of Object.entries(endpoints)) {
  if (!definition || typeof definition !== 'object') continue;
  const method = String(definition.method || '').toLowerCase();
  const endpointPath = String(definition.path || '');
  if (!method || !endpointPath.startsWith('/')) continue;
  const domain = safe(contracts.mcpDomainOfPath, endpointPath) || 'root';
  rows.push({
    operationId,
    method,
    path: endpointPath,
    domain,
    domainLabel: safe(contracts.agentDomainLabel, domain) || domain,
    label: safe(contracts.agentActionLabel, operationId) || operationId,
    write: method !== 'get',
    channel: channelOf(endpointPath),
    params: fieldSummary(definition.params),
    query: fieldSummary(definition.query),
    body: method === 'get' ? '' : fieldSummary(definition.body),
    response: responseSummary(definition.response),
  });
}

const byDomain = new Map();
for (const row of rows) {
  const list = byDomain.get(row.domain) || [];
  list.push(row);
  byDomain.set(row.domain, list);
}

const domains = [...byDomain.keys()].sort((a, b) => a.localeCompare(b));
const expected = new Map();

const cell = (value) => String(value || '').replace(/\|/g, '\\|');

const indexLines = [
  ...HEADER,
  '# 接口索引（按业务域）',
  '',
  '> 本目录由 `packages/contracts` 自动派生，只提供可读摘要。需要完整参数 / 响应 schema 时，',
  '> 在 `docs/api/openapi.json` 里按 path 精确查找，不要整份加载。',
  '',
  '| 业务域 | 说明 | 端点数 | 打开 |',
  '|---|---|---:|---|',
];
for (const domain of domains) {
  const list = byDomain.get(domain);
  const label = list[0]?.domainLabel || domain;
  const file = `${fileSafe(domain)}.md`;
  indexLines.push(`| \`${domain}\` | ${cell(label)} | ${list.length} | \`${file}\` |`);
}
indexLines.push(
  '',
  '重生成：`pnpm api:index`。完整 schema：`docs/api/openapi.json`（由 `pnpm api:docs` 生成）。',
  '',
);
expected.set('INDEX.md', `${indexLines.join('\n')}\n`);

for (const domain of domains) {
  const list = [...byDomain.get(domain)].sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );
  const file = `${fileSafe(domain)}.md`;
  const lines = [
    ...HEADER,
    `# 业务域：${list[0]?.domainLabel || domain}（\`${domain}\`）`,
    '',
    '> 自动派生摘要。完整 schema 在 `docs/api/openapi.json` 按 path 查找；不要整份加载。',
    '',
    '| 操作 ID | 方法 | 路径 | 动作 | 读写 | 通道 | 路径参数 | 查询 | 请求体 | 响应 |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of list) {
    lines.push(
      `| \`${row.operationId}\` | ${row.method.toUpperCase()} | \`${row.path}\` | ${cell(row.label)} | ${
        row.write ? '写' : '读'
      } | ${cell(row.channel)} | ${cell(row.params)} | ${cell(row.query)} | ${cell(row.body)} | ${cell(row.response)} |`,
    );
  }
  lines.push('', '返回 `INDEX.md`。', '');
  expected.set(file, `${lines.join('\n')}\n`);
}

let errors = 0;
const existing = existsSync(outDir)
  ? readdirSync(outDir).filter((name) => name.endsWith('.md'))
  : [];
for (const name of existing) {
  if (!expected.has(name)) {
    errors += 1;
    console.error(`多余生成文件：docs/dev-kit/api/${name}（重跑 pnpm api:index 清理）`);
    if (!check) rmSync(path.join(outDir, name), { force: true });
  }
}
for (const [name, content] of expected) {
  const file = path.join(outDir, name);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === content) continue;
  if (check) {
    errors += 1;
    console.error(`生成物不一致：docs/dev-kit/api/${name}（运行 pnpm api:index）`);
  } else {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
}

if (check) {
  if (errors) process.exitCode = 1;
  else console.log(`接口索引一致（${domains.length} 个业务域，${rows.length} 个端点）`);
} else {
  console.log(`已生成接口索引：docs/dev-kit/api/（${domains.length} 个业务域，${rows.length} 个端点）`);
}
