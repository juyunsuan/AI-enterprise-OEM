'use strict';

/**
 * skill-installer.js — 把技能包按 SKILL.md 约定装到本机技能目录。
 *
 * 目录：<data>/skills/<name>/SKILL.md（+ manifest 映射的附加文件）
 * 约束：
 *   - 路径白名单：目标只能是相对路径，不允许绝对路径、盘符与 ..
 *   - 单文件 512 KiB、总量 1 MiB、文件数 64
 *   - SKILL.md 最后写入；先写 staging 目录再原子替换
 *   - SKILL.md 带 `# …:managed` 行才算托管；用户删掉后视为自有，不再覆盖
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_FILES = 64;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isManaged(markdown) {
  return /#\s*(?:dsh-go|awbotdsh):managed/.test(String(markdown || ''));
}

function safeRelative(rel) {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  const normalized = rel.replace(/\\/g, '/').trim();
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return normalized;
}

function readManifest(sourceDir) {
  const file = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error('manifest.json 不是合法 JSON：' + path.basename(sourceDir));
  }
  const name = String((parsed && parsed.name) || '').trim().toLowerCase();
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error('技能名必须是 kebab-case：' + path.basename(sourceDir));
  }
  const map = parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : {};
  const entries = Object.entries(map)
    .map(([from, to]) => {
      const target = safeRelative(String(to || ''));
      return target ? { from: String(from), target } : null;
    })
    .filter(Boolean);
  if (!entries.length) throw new Error('manifest.json 没有可安装的文件：' + name);
  return { name, entries };
}

function collectBundle(sourceDir) {
  const manifest = readManifest(sourceDir);
  if (!manifest) throw new Error('技能目录缺少 manifest.json：' + path.basename(sourceDir));
  const files = [];
  let total = 0;
  for (const entry of manifest.entries) {
    const source = path.join(sourceDir, entry.from);
    const resolved = path.resolve(source);
    if (!resolved.startsWith(path.resolve(sourceDir) + path.sep)) {
      throw new Error('技能包路径越界：' + entry.from);
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error('技能包缺少文件：' + entry.from);
    }
    const size = fs.statSync(resolved).size;
    if (size > MAX_FILE_BYTES) throw new Error('技能文件超过 512KiB：' + entry.from);
    total += size;
    files.push({ source: resolved, target: entry.target, size });
  }
  if (files.length > MAX_FILES) throw new Error('技能包文件数超过 ' + MAX_FILES);
  if (total > MAX_TOTAL_BYTES) throw new Error('技能包总量超过 1MiB');
  const skill = files.find((item) => item.target.toLowerCase() === 'skill.md');
  if (!skill) throw new Error('技能包缺少 SKILL.md：' + manifest.name);
  return { name: manifest.name, files, skill };
}

function replaceDir(staging, dest) {
  const backup = dest + '.old-' + process.pid + '-' + Date.now();
  const hadDest = fs.existsSync(dest);
  if (hadDest) fs.renameSync(dest, backup);
  try {
    fs.renameSync(staging, dest);
  } catch (err) {
    if (hadDest && fs.existsSync(backup) && !fs.existsSync(dest)) {
      fs.renameSync(backup, dest);
    }
    throw err;
  }
  if (hadDest && fs.existsSync(backup)) {
    fs.rmSync(backup, { recursive: true, force: true });
  }
}

/**
 * 安装一个随包技能目录（含 manifest.json）。
 * 返回 { installed, skipped, reason }。
 */
function installBundle(options) {
  const opts = options || {};
  const sourceDir = path.resolve(opts.sourceDir);
  const targetRoot = path.resolve(opts.targetRoot);
  const bundle = collectBundle(sourceDir);
  const dest = path.join(targetRoot, bundle.name);

  if (fs.existsSync(dest) && !opts.force) {
    const current = path.join(dest, 'SKILL.md');
    const text = fs.existsSync(current) ? fs.readFileSync(current, 'utf8') : '';
    if (text && !isManaged(text)) {
      return { installed: false, skipped: true, reason: 'userOwned' };
    }
  }

  fs.mkdirSync(targetRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(targetRoot, '.staging-' + bundle.name + '-'));
  try {
    for (const file of bundle.files) {
      if (file.target.toLowerCase() === 'skill.md') continue;
      const out = path.join(staging, file.target);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(file.source, out);
    }
    // SKILL.md 最后写：中断时不会留下“看起来完整”的半成品。
    const skillOut = path.join(staging, bundle.skill.target);
    fs.mkdirSync(path.dirname(skillOut), { recursive: true });
    fs.copyFileSync(bundle.skill.source, skillOut);
    replaceDir(staging, dest);
    return { installed: true, skipped: false, name: bundle.name, files: bundle.files.length };
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }
}

/**
 * 写入单个 SKILL.md（SkillHub 在线安装用；附加文件暂不落盘）。
 * 已有同名技能且不是托管技能时拒绝覆盖。
 */
function writeSkill(options) {
  const opts = options || {};
  const name = String(opts.name || '').trim().toLowerCase();
  if (!SKILL_NAME_RE.test(name)) return { ok: false, error: '技能名必须是 kebab-case' };
  const markdown = String(opts.markdown || '');
  if (!markdown.trim()) return { ok: false, error: 'SKILL.md 内容为空' };
  if (Buffer.byteLength(markdown, 'utf8') > MAX_FILE_BYTES) {
    return { ok: false, error: 'SKILL.md 超过 512KiB' };
  }
  const targetRoot = path.resolve(opts.targetRoot);
  const dest = path.join(targetRoot, name);
  if (fs.existsSync(dest) && !opts.force) {
    const current = path.join(dest, 'SKILL.md');
    const text = fs.existsSync(current) ? fs.readFileSync(current, 'utf8') : '';
    if (text && !isManaged(text)) return { ok: false, error: '同名技能由用户维护，不覆盖' };
  }
  fs.mkdirSync(targetRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(targetRoot, '.staging-' + name + '-'));
  try {
    fs.writeFileSync(path.join(staging, 'SKILL.md'), markdown, 'utf8');
    replaceDir(staging, dest);
    return { ok: true, name };
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    return { ok: false, error: err.message || '技能写入失败' };
  }
}

/** 首启随包 seed：版本未变时整体跳过，用户删改过的目录不覆盖。 */
function seedBuiltins(options) {
  const opts = options || {};
  const sourceRoot = path.resolve(opts.sourceRoot);
  const targetRoot = path.resolve(opts.targetRoot);
  const version = String(opts.version || '');
  const marker = path.join(targetRoot, '.builtins.seed.json');
  if (version && fs.existsSync(marker) && !opts.force) {
    try {
      const state = JSON.parse(fs.readFileSync(marker, 'utf8'));
      if (state && state.version === version) {
        return { seeded: 0, skipped: 0, unchanged: true, items: [] };
      }
    } catch (err) {
      /* marker 损坏按未 seed 处理 */
    }
  }
  if (!fs.existsSync(sourceRoot)) {
    return { seeded: 0, skipped: 0, missing: true, items: [] };
  }
  const items = [];
  const dirs = fs
    .readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(sourceRoot, entry.name));
  for (const dir of dirs) {
    try {
      items.push({ source: path.basename(dir), ...installBundle({ sourceDir: dir, targetRoot }) });
    } catch (err) {
      items.push({ source: path.basename(dir), installed: false, error: err.message });
    }
  }
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.writeFileSync(
    marker,
    JSON.stringify({ version, seededAt: new Date().toISOString(), items }, null, 2),
    'utf8'
  );
  return { seeded: items.filter((item) => item.installed).length, items };
}

function removeSkill(name, targetRoot) {
  const key = String(name || '').trim().toLowerCase();
  if (!SKILL_NAME_RE.test(key)) return { ok: false, error: '技能名不合法' };
  const root = path.resolve(targetRoot);
  const dest = path.join(root, key);
  if (!dest.startsWith(root + path.sep) || !fs.existsSync(dest)) {
    return { ok: true, removed: false };
  }
  fs.rmSync(dest, { recursive: true, force: true });
  return { ok: true, removed: true };
}

/** 列出已落盘技能（给 ＋ 面板与 DSH 发现做兜底）。 */
function listInstalled(targetRoot) {
  const root = path.resolve(targetRoot);
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const file = path.join(root, entry.name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    out.push({
      name: entry.name,
      managed: isManaged(text),
      path: path.join(root, entry.name)
    });
  }
  return out;
}

module.exports = {
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  isManaged,
  safeRelative,
  installBundle,
  writeSkill,
  seedBuiltins,
  removeSkill,
  listInstalled
};
