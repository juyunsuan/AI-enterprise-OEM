import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';

/**
 * 零依赖 zip 解包：把代码包 zip 落成一个项目目录，供 `miniprogram-ci` 上传。
 *
 * 只支持 store（method 0）与 deflate（method 8）——微信开发者工具导出与本站
 * `scripts/pack-miniprogram.mjs` 产出的包都在这两种之内；bzip2/lzma 直接报错，
 * 不静默产出坏工程。目录条目、反斜杠分隔符与越界路径一律规整/跳过，防目录穿越。
 */

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX_ENTRIES = 20000;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 从尾部回扫找中央目录结束记录（注释区最长 65535）。 */
function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 65557);
  for (let p = buf.length - 22; p >= min; p -= 1) {
    if (buf.readUInt32LE(p) === EOCD_SIG) return p;
  }
  return -1;
}

/** 条目名 → 落盘绝对路径；规范化后越出目标目录时返回 null（跳过）。 */
function safeJoin(base: string, name: string): string | null {
  const cleaned = name.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned) return null;
  const root = resolve(base);
  const target = resolve(root, cleaned);
  if (target === root || !target.startsWith(root + sep)) return null;
  return target;
}

export async function extractZipBufferToDir(
  bytes: Buffer,
  destDir: string,
): Promise<number> {
  const eocd = findEocd(bytes);
  if (eocd < 0) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '代码包不是有效的 zip（未找到中央目录）',
    );
  }
  const total = bytes.readUInt16LE(eocd + 10);
  const cdOffset = bytes.readUInt32LE(eocd + 16);
  if (total > MAX_ENTRIES) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      `代码包条目过多（${total}），已超过 ${MAX_ENTRIES}`,
    );
  }

  let p = cdOffset;
  let written = 0;
  let totalBytes = 0;
  for (let i = 0; i < total; i += 1) {
    if (p + 46 > bytes.length || bytes.readUInt32LE(p) !== CENTRAL_SIG) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '代码包中央目录损坏，请重新打包后再试',
      );
    }
    const flags = bytes.readUInt16LE(p + 8);
    const method = bytes.readUInt16LE(p + 10);
    const crc = bytes.readUInt32LE(p + 16);
    const compSize = bytes.readUInt32LE(p + 20);
    const uncompSize = bytes.readUInt32LE(p + 24);
    const nameLen = bytes.readUInt16LE(p + 28);
    const extraLen = bytes.readUInt16LE(p + 30);
    const commentLen = bytes.readUInt16LE(p + 32);
    const localOffset = bytes.readUInt32LE(p + 42);
    const name = bytes
      .subarray(p + 46, p + 46 + nameLen)
      .toString(flags & 0x0800 ? 'utf8' : 'latin1');
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // 目录条目：按需在写文件时创建
    const target = safeJoin(destDir, name);
    if (!target) continue; // 绝对路径 / 目录穿越：跳过

    if (
      localOffset + 30 > bytes.length ||
      bytes.readUInt32LE(localOffset) !== LOCAL_SIG
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `代码包条目头损坏：${name}`,
      );
    }
    const localNameLen = bytes.readUInt16LE(localOffset + 26);
    const localExtraLen = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);

    let content: Buffer;
    if (method === 0) {
      content = Buffer.from(raw);
    } else if (method === 8) {
      try {
        content = inflateRawSync(raw);
      } catch {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `代码包条目解压失败：${name}`,
        );
      }
    } else {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `代码包使用了不支持的压缩方式（method ${method}）：${name}`,
      );
    }
    if (content.length !== uncompSize) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `代码包条目大小不符：${name}`,
      );
    }
    if (crc32(content) !== crc) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `代码包条目校验失败（可能上传不完整）：${name}`,
      );
    }
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '代码包解压后体积过大，请确认压缩包内容',
      );
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    written += 1;
  }
  return written;
}
