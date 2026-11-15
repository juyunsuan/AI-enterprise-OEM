'use strict';

/**
 * 从 ZIP 缓冲区里按名字取一个文本条目（内存读取，不解压落盘）。
 *
 * 技能包（SKILL.md）与插件包（plugin.json）共用：
 *   - 只读中央目录定位条目，再按本地文件头取数据；
 *   - 支持 store(0) / deflate(8)，保留 UTF-8 名称；
 *   - Windows PowerShell Compress-Archive 的反斜杠条目名先归一化再匹配；
 *   - 多条命中时取路径最短的（包根目录优先）；
 *   - 其它压缩方式、ZIP64、超限文件直接报可执行的错误。
 */

const zlib = require('node:zlib');

function findEnd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readEntryFromZip(buf, match, options = {}) {
  const maxBytes = options.maxBytes || 1024 * 1024;
  const eocd = findEnd(buf);
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件（找不到目录尾）');
  const total = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0 || cdOffset >= buf.length) throw new Error('ZIP 里没有文件');
  let cursor = cdOffset;
  const hits = [];
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
    const name = buf
      .subarray(cursor + 46, cursor + 46 + nameLen)
      .toString('utf8')
      .replace(/\\/g, '/');
    if (
      compSize === 0xffffffff ||
      uncompSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new Error('暂不支持 ZIP64 压缩包，请重新压缩为标准 ZIP');
    }
    if (match(name)) {
      hits.push({ name, method, compSize, uncompSize, localOffset });
    }
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.name.length - b.name.length);
  const hit = hits[0];
  if (hit.uncompSize > maxBytes) {
    throw new Error(`${hit.name} 超过 ${Math.round(maxBytes / 1024)}KB，无法导入`);
  }
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
    content = zlib.inflateRawSync(raw, { maxOutputLength: maxBytes });
  } else {
    throw new Error('不支持的 ZIP 压缩方式（仅支持 store / deflate）');
  }
  return { name: hit.name, text: content.toString('utf8') };
}

module.exports = { readEntryFromZip };