'use strict';

/**
 * Chrome 插件包管理：上传 ZIP / 文件夹 → 校验 manifest.json → 落到受管目录
 * `~/.awbotdsh/chrome-extensions/<id>/`，列表展示与删除都在客户端内完成。
 *
 * 真正加载发生在「客户端自带浏览器」里：启动指纹窗口时按勾选加载。
 * 全程不需要打开 chrome://extensions，也不会启动或扫描本机 Chrome / Edge。
 *
 * 另一类是随安装包一起发的「内置插件」（builtin-extensions/，见 electron-builder
 * extraResources）：只读、不可删除，且每个浏览器窗口都默认加载——Automa 就是这一类。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./db');
const { extractZipToDir } = require('./zip-extract');

const DIR = path.join(db.DATA_DIR, 'chrome-extensions');

/** 内置插件目录：安装态取 extraResources（resources/builtin-extensions），开发态取仓库目录。 */
function builtinRoot() {
  const packaged = path.join(process.resourcesPath || '', 'builtin-extensions');
  if (packaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', '..', 'builtin-extensions');
}
const MAX_ZIP = 50 * 1024 * 1024;
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 50 * 1024 * 1024;

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true });
}

function readManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) throw new Error('缺少 manifest.json');
  if (fs.statSync(file).size > 256 * 1024) throw new Error('manifest.json 超过 256KB');
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('manifest.json 不是合法 JSON');
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  const manifestVersion = Number(raw.manifest_version);
  if (!name) throw new Error('manifest.json 缺少 name');
  if (!version) throw new Error('manifest.json 缺少 version');
  if (manifestVersion !== 2 && manifestVersion !== 3) {
    throw new Error('仅支持 Manifest V2 / V3 插件包');
  }
  if (!raw.background && !raw.action && !raw.browser_action && !raw.content_scripts) {
    throw new Error('这个包不像浏览器扩展（缺少 background / action / content_scripts）');
  }
  return { name, version, manifestVersion };
}

/** 目录 id：英文名转 slug；中文等无法转写时用名称哈希，保证重复导入是覆盖而不是新增。 */
function slugOf(name) {
  const text = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (text) return text;
  return 'ext-' + crypto.createHash('sha1').update(String(name)).digest('hex').slice(0, 10);
}

/** 内置插件：只读目录，id 取目录名（Automa → automa），每个窗口都默认加载。 */
function builtins() {
  const root = builtinRoot();
  if (!fs.existsSync(root)) return [];
  const items = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(root, entry.name);
    try {
      const manifest = readManifest(dir);
      items.push({
        id: entry.name,
        name: manifest.name,
        version: manifest.version,
        manifestVersion: manifest.manifestVersion,
        path: dir,
        builtin: true
      });
    } catch {
      /* 内置包损坏属于打包问题，静默跳过以免拖垮整个列表 */
    }
  }
  return items;
}

/** 内置插件 id 集合：这些 id 不允许删除或覆盖。 */
function builtinIds() {
  return builtins().map((item) => item.id);
}

function list() {
  ensureDir();
  const items = builtins();
  const taken = new Set(items.map((item) => item.id));
  for (const entry of fs.readdirSync(DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (taken.has(entry.name)) continue;
    const dir = path.join(DIR, entry.name);
    try {
      const manifest = readManifest(dir);
      items.push({
        id: entry.name,
        name: manifest.name,
        version: manifest.version,
        manifestVersion: manifest.manifestVersion,
        path: dir,
        builtin: false
      });
    } catch {
      /* 损坏的包不展示，导入时会给原因 */
    }
  }
  return items;
}

/**
 * 解析插件目录供启动内核时 --load-extension 使用：
 * 内置插件优先，其次用户导入的受管目录；都找不到返回空串。
 */
function resolveDir(id) {
  const key = String(id || '');
  if (!key || key.includes('/') || key.includes('\\') || key.includes('..')) return '';
  const builtin = path.join(builtinRoot(), key);
  if (fs.existsSync(path.join(builtin, 'manifest.json'))) return builtin;
  const managed = path.join(DIR, key);
  if (fs.existsSync(path.join(managed, 'manifest.json'))) return managed;
  return '';
}

function copyDir(src, dest, budget) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '__MACOSX' || entry.name === '.DS_Store') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to, budget);
    } else if (entry.isFile()) {
      const size = fs.statSync(from).size;
      if (size > MAX_FILE) throw new Error(entry.name + ' 超过 10MB');
      budget.bytes += size;
      if (budget.bytes > MAX_TOTAL) throw new Error('插件包超过 50MB');
      fs.copyFileSync(from, to);
    }
  }
}

function installFromDir(srcDir) {
  const manifest = readManifest(srcDir);
  ensureDir();
  const id = slugOf(manifest.name);
  if (builtinIds().includes(id)) {
    throw new Error('「' + manifest.name + '」与内置插件重名，请改名后再导入');
  }
  const dest = path.join(DIR, id);
  const staging = path.join(DIR, '.staging-' + process.pid + '-' + Date.now().toString(36));
  try {
    copyDir(srcDir, staging, { bytes: 0 });
    if (!fs.existsSync(path.join(staging, 'manifest.json'))) {
      throw new Error('插件包缺少 manifest.json');
    }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(staging, dest);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return {
    id,
    name: manifest.name,
    version: manifest.version,
    manifestVersion: manifest.manifestVersion,
    builtin: false
  };
}

function importFromDirectory(folder) {
  return installFromDir(folder);
}

function importFromZip(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('不是文件');
  if (stat.size > MAX_ZIP) throw new Error('插件包 ZIP 超过 50MB');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-chrome-ext-'));
  try {
    extractZipToDir(fs.readFileSync(file), temp);
    let root = temp;
    if (!fs.existsSync(path.join(root, 'manifest.json'))) {
      const subs = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());
      if (subs.length === 1) root = path.join(root, subs[0].name);
    }
    return installFromDir(root);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function remove(id) {
  const key = String(id || '');
  if (builtinIds().includes(key)) {
    return { ok: false, error: '内置插件不能删除' };
  }
  if (!/^[a-z0-9-]{1,64}$/.test(key)) {
    return { ok: false, error: '插件包 id 不合法' };
  }
  const dir = path.join(DIR, key);
  if (!fs.existsSync(dir)) return { ok: false, error: '插件包不存在' };
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true };
}

module.exports = {
  DIR,
  builtinRoot,
  builtins,
  builtinIds,
  resolveDir,
  list,
  importFromDirectory,
  importFromZip,
  remove
};