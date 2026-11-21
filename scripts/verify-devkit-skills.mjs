/**
 * 开发套件一致性守卫：真源 ↔ 技能副本 ↔ 下载 zip ↔ 契约声明。
 *
 * 不连库、不起实例。验收：
 *   1) VERSION 存在且是语义化版本；
 *   2) 每个技能 SKILL.md 的 frontmatter name 与目录名一致、description 非空；
 *   3) .agents/skills 与 .claude/skills 的副本与真源逐字节一致；
 *   4) 根目录薄入口都存在且包含真源指针 docs/dev-kit/AGENTS.md；
 *   5) 契约 DEV_KIT_SKILLS 的 slug/version/zipFile 自洽，zip 存在且根目录摊平；
 *   6) 完整套件 zip 存在，含 6 个入口与 docs/dev-kit/AGENTS.md；
 *   7) 所有 zip 条目名用 POSIX 分隔符。
 *
 * 用法：node scripts/verify-devkit-skills.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { listZipEntries } from './lib/zip-store.mjs';

const root = path.resolve(import.meta.dirname, '..');
const kitDir = path.join(root, 'docs', 'dev-kit');
const skillsDir = path.join(kitDir, 'skills');
const downloads = path.join(root, 'frontend', 'public', 'downloads');
const require = createRequire(path.join(root, 'package.json'));

const errors = [];
const fail = (message) => errors.push(message);
const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const versionFile = path.join(kitDir, 'VERSION');
if (!existsSync(versionFile)) fail('缺少 docs/dev-kit/VERSION');
const version = existsSync(versionFile) ? read(versionFile).trim() : '';
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`VERSION 不是语义化版本：${version || '(空)'}`);

const listFiles = (dir, prefix = '') => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((item) => {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      return item.isDirectory() ? listFiles(path.join(dir, item.name), rel) : [rel];
    })
    .sort();
};

const skillNames = existsSync(skillsDir)
  ? readdirSync(skillsDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort()
  : [];
if (!skillNames.length) fail('docs/dev-kit/skills/ 下没有技能');

for (const name of skillNames) {
  const file = path.join(skillsDir, name, 'SKILL.md');
  if (!existsSync(file)) {
    fail(`技能 ${name} 缺少 SKILL.md`);
    continue;
  }
  const frontmatter = read(file).match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    fail(`技能 ${name} 没有 frontmatter`);
    continue;
  }
  const declared = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (declared !== name) fail(`技能 ${name} 的 name=${declared ?? '缺失'} 与目录名不一致`);
  if (!frontmatter[1].match(/^description:\s*\S/m)) fail(`技能 ${name} 缺 description`);
}

for (const base of ['.agents/skills', '.claude/skills']) {
  for (const name of skillNames) {
    const source = path.join(skillsDir, name);
    const target = path.join(root, base, name);
    if (!existsSync(target)) {
      fail(`缺少技能副本 ${base}/${name}（运行 pnpm setup:dev-kit）`);
      continue;
    }
    const sourceFiles = listFiles(source);
    const targetFiles = listFiles(target);
    const missing = sourceFiles.filter((rel) => !targetFiles.includes(rel));
    const extra = targetFiles.filter((rel) => !sourceFiles.includes(rel));
    if (missing.length || extra.length) {
      fail(`${base}/${name} 文件集合与真源不一致（缺 ${missing.join(', ') || '无'}；多 ${extra.join(', ') || '无'}）`);
      continue;
    }
    for (const rel of sourceFiles) {
      if (readFileSync(path.join(source, rel)).compare(readFileSync(path.join(target, rel))) !== 0) {
        fail(`${base}/${name}/${rel} 与真源内容不一致（运行 pnpm setup:dev-kit --force-sync）`);
      }
    }
  }
}

const POINTER = 'docs/dev-kit/AGENTS.md';
for (const rel of [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'llms.txt',
  '.cursor/rules/enterprise.mdc',
  '.github/copilot-instructions.md',
]) {
  const file = path.join(root, rel);
  if (!existsSync(file)) {
    fail(`缺少工具入口 ${rel}`);
    continue;
  }
  if (!read(file).includes(POINTER)) fail(`${rel} 未包含真源指针 ${POINTER}`);
}

const apiIndex = path.join(kitDir, 'api', 'INDEX.md');
if (!existsSync(apiIndex)) fail('缺少 docs/dev-kit/api/INDEX.md（运行 pnpm api:index）');
else if (!read(apiIndex).includes('自动生成，请勿手改')) fail('docs/dev-kit/api/INDEX.md 缺自动生成头');

const contractsPath = path.join(root, 'packages', 'contracts', 'dist', 'index.js');
if (!existsSync(contractsPath)) {
  fail('缺少 packages/contracts/dist/index.js，先构建 contracts');
} else {
  const requireContracts = createRequire(path.join(root, 'package.json'));
  const contracts = requireContracts(contractsPath);
  const skills = contracts.DEV_KIT_SKILLS ?? {};
  const keys = Object.keys(skills);
  if (!keys.length) fail('契约没有 DEV_KIT_SKILLS');
  for (const key of keys) {
    const skill = skills[key];
    const expectedName = `${skill.slug}-v${skill.version}.zip`;
    if (skill.zipFile !== expectedName) {
      fail(`${key}: zipFile=${skill.zipFile} 与 slug/version 拼出的 ${expectedName} 不一致`);
    }
    if (!skillNames.includes(key)) fail(`${key}: 契约声明了技能但 docs/dev-kit/skills/ 下没有`);
    const file = path.join(downloads, skill.zipFile);
    if (!existsSync(file)) {
      fail(`${key}: 缺少 frontend/public/downloads/${skill.zipFile}（运行 pnpm pack:dev-kit）`);
      continue;
    }
    const entries = listZipEntries(file);
    if (entries.some((entry) => entry.includes('\\'))) fail(`${key}: zip 有反斜杠条目名`);
    if (!entries.includes('SKILL.md')) fail(`${key}: zip 根目录没有 SKILL.md`);
    const sourceFiles = listFiles(path.join(skillsDir, key));
    if (sourceFiles.length !== entries.length) {
      fail(`${key}: zip 条目数与真源不一致（${entries.length} vs ${sourceFiles.length}）`);
    }
  }
  for (const name of skillNames) {
    if (!skills[name]) fail(`技能 ${name} 未登记进契约 DEV_KIT_SKILLS`);
  }

  const kitFile = path.join(downloads, `enterprise-dev-kit-v${version}.zip`);
  if (!existsSync(kitFile)) {
    fail(`缺少 frontend/public/downloads/enterprise-dev-kit-v${version}.zip（运行 pnpm pack:dev-kit）`);
  } else {
    const entries = listZipEntries(kitFile);
    if (entries.some((entry) => entry.includes('\\'))) fail('完整套件 zip 有反斜杠条目名');
    for (const required of [
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
      'llms.txt',
      '.cursor/rules/enterprise.mdc',
      '.github/copilot-instructions.md',
      'docs/dev-kit/AGENTS.md',
      'docs/dev-kit/api/INDEX.md',
    ]) {
      if (!entries.includes(required)) fail(`完整套件 zip 缺条目 ${required}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `开发套件一致（v${version}；技能：${skillNames.join(' · ')}；入口与下载包齐全）`,
  );
}
