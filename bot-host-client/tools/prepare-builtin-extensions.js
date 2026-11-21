'use strict';

/**
 * prepare-builtin-extensions.js — 构建前把本项目扩展同步进随包目录，并固定扩展 ID。
 *
 * 目录：bot-host-client/builtin-extensions/{automa,aipdd-enterprise,chrome-bridge-extension}
 * 来源：extensions/aipdd-enterprise、bot-host-client/chrome-bridge-extension
 *
 * 固定 ID：把 RSA 公钥（DER）写入 manifest.key；解包加载时 Chrome 用
 * SHA-256(公钥) 前 16 字节映射 a–p 得到 ID，与安装路径无关。
 * 只生成一次；已有 key 时保持不变（换 key 会换 ID，RPA 找不到 Automa 扩展页）。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CLIENT_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(CLIENT_ROOT, '..');
const BUILTIN_ROOT = path.join(CLIENT_ROOT, 'builtin-extensions');

const SOURCES = [
  {
    name: 'aipdd-enterprise',
    from: path.join(REPO_ROOT, 'extensions', 'aipdd-enterprise')
  },
  {
    name: 'chrome-bridge-extension',
    from: path.join(CLIENT_ROOT, 'chrome-bridge-extension')
  }
];

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

function extensionIdOf(publicKeyBase64) {
  const der = Buffer.from(publicKeyBase64, 'base64');
  const hash = crypto.createHash('sha256').update(der).digest();
  let id = '';
  for (const byte of hash.subarray(0, 16)) {
    id += String.fromCharCode(97 + (byte >> 4));
    id += String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

function ensureKey(manifestFile) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (typeof manifest.key === 'string' && manifest.key.trim()) {
    return { changed: false, id: extensionIdOf(manifest.key.trim()), version: manifest.version };
  }
  // 只保留公钥：解包加载不需要私钥，私钥不落仓库。
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' }
  });
  const key = publicKey.toString('base64');
  manifest.key = key;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { changed: true, id: extensionIdOf(key), version: manifest.version };
}

function main() {
  const rows = [];
  for (const source of SOURCES) {
    if (!fs.existsSync(source.from)) {
      console.warn('skip missing source: ' + source.from);
      continue;
    }
    const target = path.join(BUILTIN_ROOT, source.name);
    copyDir(source.from, target);
    rows.push({ name: source.name, dir: target });
  }
  for (const entry of fs.readdirSync(BUILTIN_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const manifestFile = path.join(BUILTIN_ROOT, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestFile)) continue;
    const result = ensureKey(manifestFile);
    rows.push({ name: entry.name, id: result.id, version: result.version, keyChanged: result.changed });
  }
  for (const row of rows) {
    console.log([row.name, row.version || '', row.id || '', row.keyChanged ? '(key added)' : ''].join('  '));
  }
}

main();
