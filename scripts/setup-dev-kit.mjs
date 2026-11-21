/**
 * 开发套件一键配置：幂等生成工具薄入口、同步技能副本、生成接口索引。
 *
 * 口径（照抄项目既有 init/sync 范式）：
 * - 目标已存在 → 保留，不覆盖（避免把用户自定义入口冲掉）；--force-sync 只覆盖技能副本；
 * - 不用软链接：Windows 检出与 zip 解压都会退化，入库副本 + 脚本同步 + diff 校验更可靠；
 * - --check 不写任何文件，逐字节比对生成物与入口，不一致退出码 1；
 * - --dry-run 只打印将要做什么。
 *
 * 用法：
 *   node scripts/setup-dev-kit.mjs [--dry-run] [--check] [--force-sync]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const kitDir = path.join(root, 'docs', 'dev-kit');
const templatesDir = path.join(kitDir, 'templates');
const skillsDir = path.join(kitDir, 'skills');

const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const dryRun = args.has('--dry-run');
const forceSync = args.has('--force-sync');

const POINTER = 'docs/dev-kit/AGENTS.md';
const SKILL_TARGETS = ['.agents/skills', '.claude/skills'];
const ENTRY_TARGETS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'llms.txt',
  '.cursor/rules/enterprise.mdc',
  '.github/copilot-instructions.md',
];

let failed = false;
const fail = (message) => {
  failed = true;
  console.error(message);
};

const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function listFiles(dir, prefix = '') {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((item) => {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      const abs = path.join(dir, item.name);
      return item.isDirectory() ? listFiles(abs, rel) : [rel];
    })
    .sort();
}

function diffDirs(source, target) {
  const files = listFiles(source);
  const missing = [];
  const changed = [];
  for (const rel of files) {
    const targetFile = path.join(target, rel);
    if (!existsSync(targetFile)) {
      missing.push(rel);
      continue;
    }
    if (readFileSync(path.join(source, rel)).compare(readFileSync(targetFile)) !== 0) changed.push(rel);
  }
  return { missing, changed, extra: listFiles(target).filter((rel) => !files.includes(rel)) };
}

function validateSkill(name, file) {
  if (!existsSync(file)) {
    fail(`技能 ${name} 缺少 SKILL.md`);
    return;
  }
  const markdown = read(file);
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    fail(`技能 ${name} 的 SKILL.md 没有 frontmatter（技能装载方无法识别）`);
    return;
  }
  const declared = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (declared !== name) fail(`技能 ${name} 的 frontmatter name=${declared ?? '缺失'} 与目录名不一致`);
  if (!frontmatter[1].match(/^description:\s*\S/m)) fail(`技能 ${name} 的 SKILL.md 缺 description`);
}

// 1) 工具薄入口
for (const rel of ENTRY_TARGETS) {
  const source = path.join(templatesDir, rel);
  const target = path.join(root, rel);
  if (!existsSync(source)) {
    fail(`模板缺失：docs/dev-kit/templates/${rel}`);
    continue;
  }
  if (existsSync(target)) {
    const current = read(target);
    if (!current.includes(POINTER)) {
      const message = `已存在 ${rel} 但未包含真源指针 ${POINTER}，请人工合并（不自动覆盖）`;
      if (check) fail(message);
      else console.warn(`保留 ${rel}；警告：${message}`);
    } else {
      console.log(`保留已有 ${rel}`);
    }
    continue;
  }
  if (check) {
    fail(`缺少入口 ${rel}（运行 pnpm setup:dev-kit）`);
    continue;
  }
  if (dryRun) {
    console.log(`将创建 ${rel}`);
    continue;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(source));
  console.log(`已创建 ${rel}`);
}

// 2) 技能真源校验 + 双目录同步
const skillNames = existsSync(skillsDir)
  ? readdirSync(skillsDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort()
  : [];
if (!skillNames.length) fail('docs/dev-kit/skills/ 下没有任何技能');
for (const name of skillNames) validateSkill(name, path.join(skillsDir, name, 'SKILL.md'));

for (const targetBase of SKILL_TARGETS) {
  const base = path.join(root, targetBase);
  for (const name of skillNames) {
    const source = path.join(skillsDir, name);
    const target = path.join(base, name);
    if (!existsSync(target)) {
      if (check) {
        fail(`缺少技能副本 ${targetBase}/${name}（运行 pnpm setup:dev-kit）`);
      } else if (dryRun) {
        console.log(`将同步 ${targetBase}/${name}`);
      } else {
        mkdirSync(base, { recursive: true });
        cpSync(source, target, { recursive: true });
        console.log(`已同步 ${targetBase}/${name}`);
      }
      continue;
    }
    const diff = diffDirs(source, target);
    const same = !diff.missing.length && !diff.changed.length && !diff.extra.length;
    if (same) {
      console.log(`技能副本一致 ${targetBase}/${name}`);
      continue;
    }
    if (forceSync && !check && !dryRun) {
      cpSync(source, target, { recursive: true, force: true });
      console.log(`已强制同步 ${targetBase}/${name}`);
      continue;
    }
    const detail = [
      diff.missing.length ? `缺少 ${diff.missing.join(', ')}` : '',
      diff.changed.length ? `内容不同 ${diff.changed.join(', ')}` : '',
      diff.extra.length ? `多余 ${diff.extra.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('；');
    const message = `${targetBase}/${name} 与真源不一致：${detail}（运行 pnpm setup:dev-kit --force-sync）`;
    if (check) fail(message);
    else console.warn(`保留 ${targetBase}/${name}；${message}`);
  }
}

// 3) 接口索引
if (dryRun) {
  console.log('将生成 docs/dev-kit/api/（运行 node scripts/gen-api-index.mjs）');
} else {
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'gen-api-index.mjs'), ...(check ? ['--check'] : [])],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.status !== 0) failed = true;
}

if (failed) {
  process.exitCode = 1;
} else if (!dryRun) {
  console.log('下一步：pnpm typecheck && pnpm lint && pnpm check:architecture');
}
