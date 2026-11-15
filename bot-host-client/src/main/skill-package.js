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
const { readEntryFromZip } = require('./zip-reader');

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

function importFromZip(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('不是文件');
  if (stat.size > 20 * 1024 * 1024) {
    throw new Error('技能包 ZIP 超过 20MB，请只保留 SKILL.md 后重试');
  }
  const hit = readEntryFromZip(
    fs.readFileSync(file),
    (name) => /(^|\/)skill\.md$/i.test(name),
    { maxBytes: MAX_SKILL_FILE },
  );
  if (!hit) {
    throw new Error('技能包缺少 SKILL.md：请把 SKILL.md 放到 ZIP 根目录或一层目录里');
  }
  const base = path.basename(file, path.extname(file));
  const parent = hit.name.includes('/')
    ? hit.name.slice(0, hit.name.lastIndexOf('/')).split('/').pop()
    : base;
  return parseSkillMarkdown(hit.text, parent || base, parent || base);
}

module.exports = {
  importFromDir,
  importFromZip,
  parseSkillMarkdown,
  normalizeId,
};