'use strict';

/**
 * _skill-install-unit.js — 技能落盘的确定性回归：
 *   manifest 映射、路径白名单、SKILL.md 最后写、原子替换、托管标记、
 *   用户自有技能不覆盖、seed 版本标记、在线安装单文件写入。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  seedBuiltins,
  installBundle,
  writeSkill,
  removeSkill,
  listInstalled,
  safeRelative
} = require('../src/main/skill-installer');

function ok(name) {
  console.log('  ok   ' + name);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-skill-install-'));
const sourceRoot = path.join(root, 'src');
const targetRoot = path.join(root, 'dst');

function makeSkill(name, manifestFiles, extra) {
  const dir = path.join(sourceRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} 演示\n---\n# awbotdsh:managed\n\n# ${name}\n`
  );
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ name, files: Object.assign({ 'SKILL.md': 'SKILL.md' }, manifestFiles) })
  );
  for (const [file, content] of Object.entries(extra || {})) {
    const out = path.join(dir, file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
  }
}

try {
  makeSkill('alpha', { 'ref.txt': 'references/ref.txt' }, { 'ref.txt': '参考内容' });
  makeSkill('beta', {}, {});

  // 1) seed 安装两个技能 + manifest 子目录映射
  const first = seedBuiltins({ sourceRoot, targetRoot, version: '1.0.0' });
  assert.equal(first.seeded, 2);
  assert.ok(fs.existsSync(path.join(targetRoot, 'alpha', 'SKILL.md')));
  assert.equal(
    fs.readFileSync(path.join(targetRoot, 'alpha', 'references', 'ref.txt'), 'utf8'),
    '参考内容'
  );
  ok('seed 安装技能并保留 manifest 子目录');

  // 2) 同版本二次启动直接跳过
  const second = seedBuiltins({ sourceRoot, targetRoot, version: '1.0.0' });
  assert.equal(second.unchanged, true);
  ok('同版本 seed 不重复安装');

  // 3) 用户删掉托管行后视为自有，升级不覆盖
  const alphaSkill = path.join(targetRoot, 'alpha', 'SKILL.md');
  fs.writeFileSync(alphaSkill, '---\nname: alpha\n---\n我的改动\n');
  const upgraded = seedBuiltins({ sourceRoot, targetRoot, version: '2.0.0' });
  assert.equal(upgraded.unchanged, undefined);
  assert.equal(fs.readFileSync(alphaSkill, 'utf8').includes('我的改动'), true);
  ok('用户自有技能不被覆盖');

  // 4) 路径白名单
  assert.equal(safeRelative('../etc/passwd'), null);
  assert.equal(safeRelative('/etc/passwd'), null);
  assert.equal(safeRelative('C:/Windows.ini'), null);
  assert.equal(safeRelative('references/a.txt'), 'references/a.txt');
  ok('路径白名单拒绝越界');

  // 5) manifest 越界直接拒绝
  makeSkill('evil', { '../escape.txt': 'SKILL.md' }, {});
  assert.throws(
    () => installBundle({ sourceDir: path.join(sourceRoot, 'evil'), targetRoot }),
    /manifest|路径|文件/
  );
  ok('manifest 越界被拒');

  // 6) 在线安装：单文件写入；同名用户自有拒绝覆盖
  const write = writeSkill({
    name: 'gamma',
    markdown: '---\nname: gamma\n---\n# awbotdsh:managed\n正文',
    targetRoot
  });
  assert.equal(write.ok, true);
  assert.ok(fs.existsSync(path.join(targetRoot, 'gamma', 'SKILL.md')));
  fs.writeFileSync(path.join(targetRoot, 'gamma', 'SKILL.md'), '---\nname: gamma\n---\n自有\n');
  const conflict = writeSkill({
    name: 'gamma',
    markdown: '---\nname: gamma\n---\n新内容',
    targetRoot
  });
  assert.equal(conflict.ok, false);
  ok('在线安装与用户自有冲突拒绝');

  // 7) 列表与删除
  const names = listInstalled(targetRoot).map((item) => item.name);
  assert.ok(names.includes('alpha'));
  assert.ok(names.includes('gamma'));
  removeSkill('gamma', targetRoot);
  assert.equal(fs.existsSync(path.join(targetRoot, 'gamma')), false);
  ok('列表与删除');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
