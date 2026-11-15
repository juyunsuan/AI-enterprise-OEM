'use strict';

/**
 * ZIP 解压到目录：只解压普通文件，带完整的路径越界防护与体积上限。
 *
 * 与 zip-reader（只读单个条目）不同，这里会真的落盘——用于 Chrome 插件包导入。
 * 安全边界：
 *   · 拒绝绝对路径、盘符、`..` 越界段；
 *   · 解压目标必须落在目标目录内（路径二次校验）；
 *   · 最多 2000 个条目 / 单文件 10MB / 总量 50MB；
 *   · 跳过 __MACOSX 与 .DS_Store；
 *   · 仅支持 store(0) / deflate(8)，ZIP64 直接拒绝。
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MAX_ENTRIES = 2000;
const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 50 * 1024 * 1024;

function findEnd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function safeRelative(rawName) {
  const name = String(rawName || '').replace(/\\/g, '/');
  if (!name || name.endsWith('/')) return '';
  if (/^[A-Za-z]:/.test(name) || name.startsWith('/')) {
    throw new Error('插件包里有绝对路径：' + name);
  }
  const parts = [];
  for (const segment of name.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') throw new Error('插件包里有越界路径：' + name);
    parts.push(segment);
  }
  if (!parts.length) return '';
  if (parts[0] === '__MACOSX' || parts[parts.length - 1] === '.DS_Store') return '';
  return parts.join('/');
}

function extractZipToDir(buf, targetDir) {
  const eocd = findEnd(buf);
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件（找不到目录尾）');
  const total = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (!total || cdOffset >= buf.length) throw new Error('ZIP 里没有文件');
  if (total > MAX_ENTRIES) throw new Error('插件包文件数超过 ' + MAX_ENTRIES + ' 个');
  const root = path.resolve(targetDir);
  fs.mkdirSync(root, { recursive: true });
  let cursor = cdOffset;
  let written = 0;
  let totalBytes = 0;
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
    const rawName = buf.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    if (
      compSize === 0xffffffff ||
      uncompSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new Error('暂不支持 ZIP64 插件包，请重新压缩为标准 ZIP');
    }
    cursor += 46 + nameLen + extraLen + commentLen;
    const relative = safeRelative(rawName);
    if (!relative) continue;
    if (uncompSize > MAX_FILE) {
      throw new Error(relative + ' 超过 10MB，插件包过大');
    }
    totalBytes += uncompSize;
    if (totalBytes > MAX_TOTAL) throw new Error('插件包解压后超过 50MB');
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('ZIP 文件头损坏：' + relative);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compSize);
    if (raw.length !== compSize) throw new Error('ZIP 数据不完整：' + relative);
    let content;
    if (method === 0) content = raw;
    else if (method === 8) {
      content = zlib.inflateRawSync(raw, { maxOutputLength: MAX_FILE });
    } else {
      throw new Error('不支持的 ZIP 压缩方式（仅支持 store / deflate）');
    }
    const dest = path.resolve(root, relative);
    if (dest !== root && !dest.startsWith(root + path.sep)) {
      throw new Error('解压路径越界：' + relative);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    written += 1;
  }
  if (!written) throw new Error('插件包里没有可解压的文件');
  return written;
}

module.exports = { extractZipToDir };