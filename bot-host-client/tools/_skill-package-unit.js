'use strict';

/**
 * _skill-package-unit.js — 技能包导入（ZIP / 文件夹）的静态回归：
 *   SKILL.md frontmatter 解析、无 frontmatter 兜底、文件夹（含套一层目录）、
 *   ZIP（store / deflate 两种压缩）、缺 SKILL.md 的报错。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {
  importFromDir,
  importFromZip,
  parseSkillMarkdown,
} = require('../src/main/skill-package');

function ok(name) {
  console.log('  ok   ' + name);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-skill-pkg-'));
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 假 ZIP 写入器：支持 store(0) / deflate(8)，足够覆盖解析路径。 */
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const plain = Buffer.from(entry.data, 'utf8');
    const method = entry.deflate ? 8 : 0;
    const data = method === 8 ? zlib.deflateRawSync(plain) : plain;
    const crc = crc32(plain);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

const SKILL_MD = [
  '---',
  'name: 代码审查',
  'description: 审查改动、指出风险',
  '---',
  '',
  '# 代码审查',
  '',
  '按清单逐项检查改动，先列风险再给修复建议。',
  '',
].join('\n');

try {
  const parsed = parseSkillMarkdown(SKILL_MD, 'code-review', 'code-review');
  assert.equal(parsed.id, 'code-review');
  assert.equal(parsed.name, '代码审查');
  assert.equal(parsed.description, '审查改动、指出风险');
  assert.match(parsed.body, /按清单逐项检查改动/);
  ok('frontmatter 解析：name / description / 正文');

  const noFrontmatter = parseSkillMarkdown(
    '# PDF 处理\n\n把 PDF 拆成图片并压缩。\n',
    '',
    '',
  );
  assert.equal(noFrontmatter.id, 'pdf');
  assert.equal(noFrontmatter.name, 'PDF 处理');
  assert.equal(noFrontmatter.description, '把 PDF 拆成图片并压缩。');
  ok('无 frontmatter：标题当名称、首段当说明');

  const dir = path.join(tmpRoot, 'my-skill');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), SKILL_MD);
  const fromDir = importFromDir(dir);
  // 中文 frontmatter 名称无法生成合法 id，按文件夹名回落（同名重复导入会覆盖同一条）。
  assert.equal(fromDir.id, 'my-skill');
  assert.equal(fromDir.name, '代码审查');
  ok('文件夹导入：根目录 SKILL.md（id 回落文件夹名）');

  const wrapped = path.join(tmpRoot, 'wrapped');
  fs.mkdirSync(wrapped, { recursive: true });
  fs.mkdirSync(path.join(wrapped, 'inner-skill'), { recursive: true });
  fs.writeFileSync(path.join(wrapped, 'inner-skill', 'SKILL.md'), SKILL_MD);
  const fromWrapped = importFromDir(wrapped);
  assert.equal(fromWrapped.id, 'inner-skill');
  ok('文件夹导入：只套一层子目录也能找到');

  const zipPath = path.join(tmpRoot, 'pack.zip');
  fs.writeFileSync(
    zipPath,
    buildZip([
      { name: 'pack/SKILL.md', data: SKILL_MD, deflate: true },
      { name: 'pack/notes.txt', data: 'ignored' },
    ]),
  );
  const fromZip = importFromZip(zipPath);
  assert.equal(fromZip.id, 'pack');
  assert.equal(fromZip.name, '代码审查');
  ok('ZIP 导入：deflate 压缩 + 非根目录 SKILL.md');

  const storeZipPath = path.join(tmpRoot, 'store.zip');
  fs.writeFileSync(
    storeZipPath,
    buildZip([{ name: 'SKILL.md', data: SKILL_MD }]),
  );
  const fromStoreZip = importFromZip(storeZipPath);
  assert.equal(fromStoreZip.id, 'store');
  ok('ZIP 导入：store 压缩 + 根目录 SKILL.md（id 回落包名）');

  // Windows 的 PowerShell Compress-Archive 用反斜杠写条目名，必须同样能导入。
  const winZipPath = path.join(tmpRoot, 'win-pack.zip');
  fs.writeFileSync(
    winZipPath,
    buildZip([{ name: 'win-pack\\SKILL.md', data: SKILL_MD, deflate: true }]),
  );
  const fromWinZip = importFromZip(winZipPath);
  assert.equal(fromWinZip.id, 'win-pack');
  ok('ZIP 导入：反斜杠条目名（PowerShell Compress-Archive）');

  const badZipPath = path.join(tmpRoot, 'bad.zip');
  fs.writeFileSync(badZipPath, buildZip([{ name: 'readme.txt', data: 'x' }]));
  assert.throws(() => importFromZip(badZipPath), /SKILL\.md/);
  ok('ZIP 缺 SKILL.md：报可执行的错误');

  const emptyDir = path.join(tmpRoot, 'empty');
  fs.mkdirSync(path.join(emptyDir, 'a'), { recursive: true });
  fs.mkdirSync(path.join(emptyDir, 'b'), { recursive: true });
  assert.throws(() => importFromDir(emptyDir), /SKILL\.md/);
  ok('文件夹缺 SKILL.md：报可执行的错误');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}