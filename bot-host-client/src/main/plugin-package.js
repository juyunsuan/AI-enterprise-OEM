'use strict';

/**
 * 插件包导入：ZIP 或文件夹 → 插件清单 { id, name, kind, description, params, config, enabled }。
 *
 * 插件是声明式配置（HTTP 接口 / 本机命令），包格式就是一份 plugin.json：
 *   { "id": "weather", "name": "查天气", "kind": "http",
 *     "description": "按城市查天气",
 *     "params": { "city": { "type": "string", "required": true } },
 *     "config": { "method": "GET", "url": "https://.../weather?city={{city}}" } }
 * ZIP 只在内存读 plugin.json 一个条目，不解压落盘；导入只写本机库，不向平台同步。
 */

const fs = require('node:fs');
const path = require('node:path');
const { readEntryFromZip } = require('./zip-reader');

const MAX_MANIFEST = 256 * 1024;
const MAX_ZIP = 20 * 1024 * 1024;
const KINDS = ['http', 'command'];

function slug(raw) {
  const text = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!text) return '';
  return /^[a-z]/.test(text) ? text : 'p-' + text;
}

function normalizeManifest(raw, fallbackName) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const resolvedName = (name || String(fallbackName || '').trim()).slice(0, 60);
  if (!resolvedName) throw new Error('plugin.json 缺少 name');
  const kind = KINDS.includes(input.kind) ? input.kind : 'http';
  const id = (
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : slug(resolvedName) || 'plugin'
  ).slice(0, 40);
  const config =
    input.config && typeof input.config === 'object' && !Array.isArray(input.config)
      ? input.config
      : {};
  const params =
    input.params && typeof input.params === 'object' && !Array.isArray(input.params)
      ? input.params
      : {};
  if (kind === 'http' && !/^https?:\/\//i.test(String(config.url || ''))) {
    throw new Error('HTTP 插件包要在 config.url 里填 http(s) 开头的完整地址');
  }
  if (kind === 'command' && !String(config.command || '').trim()) {
    throw new Error('命令插件包要在 config.command 里填要执行的命令');
  }
  return {
    id,
    name: resolvedName,
    kind,
    description:
      typeof input.description === 'string' ? input.description.slice(0, 300) : '',
    params,
    config,
    enabled: input.enabled !== false,
  };
}

function parseManifest(text, fallbackName) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error('plugin.json 不是合法 JSON：' + error.message);
  }
  return normalizeManifest(raw, fallbackName);
}

function readFromDir(dir, depth = 0) {
  if (depth > 2) throw new Error('插件包目录层级过深，找不到 plugin.json');
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const manifest = entries.find(
    (row) => row.isFile() && /^plugin\.json$/i.test(row.name),
  );
  if (manifest) {
    const file = path.join(dir, manifest.name);
    if (fs.statSync(file).size > MAX_MANIFEST) {
      throw new Error('plugin.json 超过 256KB，无法导入');
    }
    return parseManifest(fs.readFileSync(file, 'utf8'), path.basename(dir));
  }
  const dirs = entries.filter((row) => row.isDirectory());
  if (dirs.length === 1) return readFromDir(path.join(dir, dirs[0].name), depth + 1);
  throw new Error(
    '插件包缺少 plugin.json：请把 plugin.json 放到文件夹根目录（或只套一层目录）',
  );
}

function readFromZip(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('不是文件');
  if (stat.size > MAX_ZIP) {
    throw new Error('插件包 ZIP 超过 20MB，请只保留 plugin.json 后重试');
  }
  const hit = readEntryFromZip(
    fs.readFileSync(file),
    (name) => /(^|\/)plugin\.json$/i.test(name),
    { maxBytes: MAX_MANIFEST },
  );
  if (!hit) {
    throw new Error('插件包缺少 plugin.json：请把 plugin.json 放到 ZIP 根目录或一层目录里');
  }
  const base = path.basename(file, path.extname(file));
  const parent = hit.name.includes('/')
    ? hit.name.slice(0, hit.name.lastIndexOf('/')).split('/').pop()
    : base;
  return parseManifest(hit.text, parent || base);
}

module.exports = { readFromDir, readFromZip, normalizeManifest, slug };