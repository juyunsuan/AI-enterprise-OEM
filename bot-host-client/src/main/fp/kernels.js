'use strict';

/**
 * 指纹内核管理：fingerprint-chromium（或同协议内核）的安装、版本与校验。
 *
 * 目录：~/.botbuddy/kernels/<version>/
 *   chrome.exe
 *   manifest.json  { version, exe, source, zipSha256, installedAt }
 *
 * 只从受管目录启动；安装来源为 ZIP（浏览器页导入）或已有文件夹（开发用）。
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const db = require('../db');
const { extractZipToDir } = require('../zip-extract');

const DIR = path.join(db.DATA_DIR, 'kernels');
const ZIP_MAX = 600 * 1024 * 1024;
const EXTRACT_LIMITS = {
  entries: 20000,
  // Chrome 150 的 chrome.dll 已超过 300MB，内核包需要更大的单文件与总量上限。
  file: 512 * 1024 * 1024,
  total: 2048 * 1024 * 1024
};

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

function safeVersion(raw) {
  const text = String(raw || '').trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(text) ? text : '';
}

function findExe(root, depth = 0) {
  if (depth > 2) return '';
  const direct = path.join(root, 'chrome.exe');
  if (fs.existsSync(direct)) return direct;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return '';
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hit = findExe(path.join(root, entry.name), depth + 1);
    if (hit) return hit;
  }
  return '';
}

function detectVersion(srcDir) {
  const match = path.basename(srcDir).match(/(\d+\.\d+\.\d+\.\d+)/);
  return match ? match[1] : '';
}

function readManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const version = safeVersion(raw.version);
    const root = path.resolve(dir) + path.sep;
    const exe = path.resolve(dir, String(raw.exe || 'chrome.exe'));
    const inside = exe.startsWith(root);
    if (!version || !inside || !fs.existsSync(exe)) return null;
    return {
      version,
      dir,
      exe,
      source: String(raw.source || ''),
      zipSha256: String(raw.zipSha256 || ''),
      installedAt: String(raw.installedAt || '')
    };
  } catch {
    return null;
  }
}

function list() {
  ensureDir();
  const items = [];
  for (const entry of fs.readdirSync(DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const manifest = readManifest(path.join(DIR, entry.name));
    if (manifest) items.push(manifest);
  }
  return items.sort((a, b) => String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
}

/** 取内核：指定版本优先，否则用最新已安装版本。 */
function resolve(version) {
  const wanted = safeVersion(version);
  const items = list();
  if (!items.length) {
    throw new Error('还没有安装指纹内核：请在「浏览器 → 指纹窗口」里导入内核 ZIP');
  }
  if (!wanted) return items[0];
  const hit = items.find((row) => row.version === wanted);
  if (!hit) throw new Error('指定的内核版本未安装：' + wanted);
  return hit;
}

function installFromDir(srcDir, options = {}) {
  const exe = findExe(srcDir);
  if (!exe) throw new Error('内核包里没有找到 chrome.exe');
  const version =
    safeVersion(options.version) ||
    safeVersion(detectVersion(srcDir)) ||
    safeVersion(detectVersion(path.dirname(exe))) ||
    'custom-' + Date.now().toString(36);
  ensureDir();
  const dest = path.join(DIR, version);
  const staging = path.join(DIR, '.staging-' + process.pid + '-' + Date.now().toString(36));
  const backup = path.join(DIR, '.backup-' + process.pid + '-' + Date.now().toString(36));
  let movedOld = false;
  try {
    fs.cpSync(srcDir, staging, { recursive: true });
    const stagedExe = findExe(staging);
    if (!stagedExe) throw new Error('内核复制不完整（缺 chrome.exe）');
    const relativeExe = path.relative(staging, stagedExe).split(path.sep).join('/');
    fs.writeFileSync(
      path.join(staging, 'manifest.json'),
      JSON.stringify(
        {
          version,
          exe: relativeExe,
          source: String(options.source || srcDir),
          zipSha256: String(options.zipSha256 || ''),
          installedAt: new Date().toISOString()
        },
        null,
        2
      )
    );
    // 先备份旧版本再替换，避免 rename 失败时把已装内核丢掉。
    if (fs.existsSync(dest)) {
      fs.renameSync(dest, backup);
      movedOld = true;
    }
    fs.renameSync(staging, dest);
    if (movedOld) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (movedOld && !fs.existsSync(dest)) {
      try {
        fs.renameSync(backup, dest);
      } catch {
        /* 恢复失败时保留 backup 目录供人工处理 */
      }
    }
    if (error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES') {
      throw new Error('内核文件被占用（可能有窗口正在使用该版本），请关闭窗口后重试');
    }
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    if (fs.existsSync(dest)) fs.rmSync(backup, { recursive: true, force: true });
  }
  const manifest = readManifest(dest);
  if (!manifest) throw new Error('内核安装后校验失败');
  return manifest;
}

function importFromZip(file, options = {}) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('不是文件');
  if (stat.size > ZIP_MAX) throw new Error('内核包超过 600MB');
  const buffer = fs.readFileSync(file);
  const zipSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-kernel-'));
  try {
    extractZipToDir(buffer, temp, EXTRACT_LIMITS);
    let root = temp;
    if (!findExe(root)) {
      const subs = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());
      if (subs.length === 1) root = path.join(root, subs[0].name);
    }
    const exe = findExe(root);
    const version =
      safeVersion(options.version) ||
      safeVersion(detectVersion(root)) ||
      safeVersion(exe ? detectVersion(path.dirname(exe)) : '') ||
      safeVersion(detectVersion(file));
    return installFromDir(root, { version, source: path.basename(file), zipSha256 });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function remove(version) {
  const key = safeVersion(version);
  if (!key) return { ok: false, error: '内核版本不合法' };
  const dir = path.join(DIR, key);
  if (!fs.existsSync(dir)) return { ok: false, error: '内核不存在' };
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true };
}

module.exports = { DIR, list, resolve, importFromZip, installFromDir, remove };