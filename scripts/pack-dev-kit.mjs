/**
 * 打包开发套件 → frontend/public/downloads/
 *
 * 产出：
 * - enterprise-dev-kit-v<version>.zip：根目录摊平（AGENTS.md / CLAUDE.md / GEMINI.md / llms.txt /
 *   .cursor/rules / .github/copilot-instructions.md）+ docs/dev-kit/ + 两套技能副本；
 * - <slug>-v<version>.zip：每个技能一个包，zip 根只有 SKILL.md 与可选 references/。
 *
 * 与 pack-insight-skills.mjs 同口径：POSIX 条目名、无反斜杠、文件名与契约声明一致。
 * 用法：node scripts/pack-dev-kit.mjs
 */
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { collectFiles, listZipEntries, writeStoreZip } from './lib/zip-store.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'package.json'));
const contracts = require(path.join(root, 'packages/contracts/dist/index.js'));
const skills = contracts.DEV_KIT_SKILLS;
if (!skills) {
  console.error('契约没有导出 DEV_KIT_SKILLS，先构建 contracts');
  process.exit(1);
}

const kitDir = path.join(root, 'docs', 'dev-kit');
const templatesDir = path.join(kitDir, 'templates');
const outDir = path.join(root, 'frontend', 'public', 'downloads');
const stageDir = path.join(root, 'scripts', 'tmp', 'dev-kit');

const version = readFileSync(path.join(kitDir, 'VERSION'), 'utf8').trim();
const kitZip = `enterprise-dev-kit-v${version}.zip`;

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(path.join(stageDir, 'kit'), { recursive: true });

/** 收集目录内所有文件（包含点目录），供「解压到仓库根即可用」的套件使用。 */
function collectAll(dir, prefix = '') {
  const out = [];
  for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (item.name === '__MACOSX') continue;
    const abs = path.join(dir, item.name);
    const name = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) out.push(...collectAll(abs, name));
    else out.push({ name, content: readFileSync(abs), mtime: statSync(abs).mtime });
  }
  return out;
}

const kitStage = path.join(stageDir, 'kit');
const entries = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'llms.txt',
  '.cursor/rules/enterprise.mdc',
  '.github/copilot-instructions.md',
];
for (const rel of entries) {
  const source = path.join(templatesDir, rel);
  if (!existsSync(source)) {
    console.error(`模板缺失：docs/dev-kit/templates/${rel}`);
    process.exit(1);
  }
  mkdirSync(path.dirname(path.join(kitStage, rel)), { recursive: true });
  cpSync(source, path.join(kitStage, rel));
}
cpSync(kitDir, path.join(kitStage, 'docs', 'dev-kit'), { recursive: true });
for (const rel of ['.agents/skills', '.claude/skills']) {
  const source = path.join(root, rel);
  if (!existsSync(source)) continue;
  mkdirSync(path.dirname(path.join(kitStage, rel)), { recursive: true });
  cpSync(source, path.join(kitStage, rel), { recursive: true });
}

const kitFiles = collectAll(kitStage);
const kitResult = writeStoreZip(path.join(outDir, kitZip), kitFiles);
const kitEntries = listZipEntries(path.join(outDir, kitZip));
console.log(`已打包开发套件 → frontend/public/downloads/${kitZip}（${kitResult.count} 个条目）`);
if (kitResult.backslash) {
  console.error('套件 zip 出现反斜杠条目名');
  process.exit(1);
}
for (const required of [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'llms.txt',
  '.cursor/rules/enterprise.mdc',
  '.github/copilot-instructions.md',
  'docs/dev-kit/AGENTS.md',
]) {
  if (!kitEntries.includes(required)) {
    console.error(`套件 zip 缺条目 ${required}`);
    process.exit(1);
  }
}

for (const key of Object.keys(skills)) {
  const skill = skills[key];
  const source = path.join(kitDir, 'skills', key);
  if (!existsSync(source)) {
    console.error(`技能目录缺失：docs/dev-kit/skills/${key}`);
    process.exit(1);
  }
  const files = collectFiles(source, '');
  const out = path.join(outDir, skill.zipFile);
  const result = writeStoreZip(out, files);
  console.log(`已打包 ${key} v${skill.version} → frontend/public/downloads/${skill.zipFile}（${result.count} 个条目）`);
  if (result.backslash) {
    console.error(`${skill.zipFile} 出现反斜杠条目名`);
    process.exit(1);
  }
}

rmSync(stageDir, { recursive: true, force: true });
