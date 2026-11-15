'use strict';

/**
 * 技能包导入：ZIP 或文件夹 → { id, name, description, body }。
 *
 * 与平台无关，只在本机解析：ZIP 只在内存里读 SKILL.md 这一个条目，
 * 不解压到磁盘（顺带没有 zip-slip 风险）；其余素材文件不落库——本地技能
 * 只保存 name / description / 正文，Agent 用 load_skill 读这段正文。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX_SKILL_FILE = 1024 * 1024;
const MAX_BODY = 200_000;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;

function normalizeId(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function firstParagraph(text) {
  const plain = String(text || '').replace(/^#.*$/gm, '');
  const hit = plain
    .split(/\n{2,}/)
    .map((part) => part.replace(/[#>*`_\[\]()]/g, '').trim())
    .find(Boolean);
  return hit || '';
}

/** 解析 SKILL.md：YAML frontmatter 的 name/description + 正文；没有就用标题/首段兜底。 */
function parseSkillMarkdown(markdown, fallbackId, fallbackName) {
  const text = String(markdown || '').replace(/^\uFEFF/, '');
  let name = '';
  let description = '';
  let body = text;
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatter) {
    body = text.slice(frontmatter[0].length);
    for (const line of frontmatter[1].split(/\r?\n/)) {
      const pair = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*)\s*$/);
      if (!pair) continue;
      const key = pair[1].toLowerCase();
      let value = pair[2].trim();
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      if (key === 'name') name = value;
      if (key === 'description') description = value;
    }
  }
  if (!name) {
    const title = text.match(/^#\s+(.+)$/m);
    if (title) name = title[1].trim();
  }
  if (!name) name = fallbackName || fallbackId || 'skill';
  if (!description) description = firstParagraph(body);
  const id = normalizeId(name) || normalizeId(fallbackId) || 'skill';
  return {
    id,
    name: name.slice(0, MAX_NAME),
    description: description.slice(0, MAX_DESCRIPTION),
    body: body.replace(/^\s*\n/, '').slice(0, MAX_BODY),
  };
}

function readSkillFile(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('SKILL.md 不是文件');
  if (stat.size > MAX_SKILL_FILE) throw new Error('SKILL.md 超过 1MB，无法导入');
  return fs.readFileSync(file, 'utf8');
}

/** 文件夹导入：根目录找 SKILL.md；没有就向下找唯一子目录（打一层包的常见形态）。 */
function importFromDir(dir, depth = 0) {
  if (depth > 2) throw new Error('技能包目录层级过深，找不到 SKILL.md');
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const skillFile = entries.find(
    (row) => row.isFile() && /^skill\.md$/i.test(row.name),
  );
  if (skillFile) {
    const dirName = path.basename(dir);
    return parseSkillMarkdown(
      readSkillFile(path.join(dir, skillFile.name)),
      dirName,
      dirName,
    );
  }
  const dirs = entries.filter((row) => row.isDirectory());
  if (dirs.length === 1) {
    return importFromDir(path.join(dir, dirs[0].name), depth + 1);
  }
  throw new Error(
    '技能包缺少 SKILL.md：请在文件夹根目录放 SKILL.md（或只套一层目录）',
  );
}

function findZipEnd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/** 只读解析 ZIP 中央目录，挑出最靠根目录的 SKILL.md。 */
function readSkillFromZip(buf, zipPath) {
  const eocd = findZipEnd(buf);
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件（找不到目录尾）');
  const total = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0 || cdOffset >= buf.length) throw new Error('ZIP 里没有文件');
  let cursor = cdOffset;
  const skills = [];
  for (let i = 0; i < total; i += 1) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('ZIP 目录结构损坏');
    }
    const method = buf.readUInt16LE(cursor + 10);
    const compSize = buf.readUInt32LE(cursor + 20);
    const uncompSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    // Windows 的 PowerShell Compress-Archive 会把条目名写成反斜杠，先归一化再匹配。
    const name = buf
      .subarray(cursor + 46, cursor + 46 + nameLen)
      .toString('utf8')
      .replace(/\\/g, '/');
    if (
      compSize === 0xffffffff ||
      uncompSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new Error('暂不支持 ZIP64 技能包，请重新压缩为标准 ZIP');
    }
    if (/(^|\/)skill\.md$/i.test(name)) {
      skills.push({ name, method, compSize, uncompSize, localOffset });
    }
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  if (!skills.length) {
    throw new Error('技能包缺少 SKILL.md：请把 SKILL.md 放到 ZIP 根目录或一层目录里');
  }
  skills.sort((a, b) => a.name.length - b.name.length);
  const hit = skills[0];
  if (hit.uncompSize > MAX_SKILL_FILE) throw new Error('SKILL.md 超过 1MB，无法导入');
  if (hit.localOffset + 30 > buf.length || buf.readUInt32LE(hit.localOffset) !== 0x04034b50) {
    throw new Error('ZIP 文件头损坏');
  }
  const localNameLen = buf.readUInt16LE(hit.localOffset + 26);
  const localExtraLen = buf.readUInt16LE(hit.localOffset + 28);
  const start = hit.localOffset + 30 + localNameLen + localExtraLen;
  const raw = buf.subarray(start, start + hit.compSize);
  if (raw.length !== hit.compSize) throw new Error('ZIP 数据不完整');
  let content;
  if (hit.method === 0) {
    content = raw;
  } else if (hit.method === 8) {
    content = zlib.inflateRawSync(raw, { maxOutputLength: MAX_SKILL_FILE });
  } else {
    throw new Error('不支持的 ZIP 压缩方式（仅支持 store / deflate）');
  }
  const parent = hit.name.includes('/')
    ? hit.name.slice(0, hit.name.lastIndexOf('/')).split('/').pop()
    : path.basename(zipPath, path.extname(zipPath));
  return parseSkillMarkdown(
    content.toString('utf8'),
    parent || path.basename(zipPath, path.extname(zipPath)),
    parent || path.basename(zipPath, path.extname(zipPath)),
  );
}

function importFromZip(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('不是文件');
  if (stat.size > 20 * 1024 * 1024) {
    throw new Error('技能包 ZIP 超过 20MB，请只保留 SKILL.md 后重试');
  }
  return readSkillFromZip(fs.readFileSync(file), file);
}

module.exports = {
  importFromDir,
  importFromZip,
  parseSkillMarkdown,
  normalizeId,
};