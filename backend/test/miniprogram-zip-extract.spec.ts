import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { extractZipBufferToDir } from '../src/miniprogram/zip-extract';

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

type Entry = { name: string; content: Buffer; method: 0 | 8 };

/** 构造最小合法 zip（store / deflate 混合），用于解包器的往返验证。 */
function buildZip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data =
      entry.method === 8 ? deflateRawSync(entry.content) : entry.content;
    const crc = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(entry.method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const localBlob = Buffer.concat(locals);
  const centralBlob = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlob.length, 12);
  eocd.writeUInt32LE(localBlob.length, 16);
  return Buffer.concat([localBlob, centralBlob, eocd]);
}

describe('extractZipBufferToDir', () => {
  let dirs: string[] = [];

  const makeDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zip-extract-test-'));
    dirs.push(dir);
    return dir;
  };

  afterEach(async () => {
    await Promise.all(
      dirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    dirs = [];
  });

  it('解出 store 与 deflate 条目，并按需创建嵌套目录', async () => {
    const dir = await makeDir();
    const zip = buildZip([
      { name: 'app.json', content: Buffer.from('{"pages":[]}'), method: 0 },
      {
        name: 'pages/index/index.js',
        content: Buffer.from('Page({})'),
        method: 8,
      },
      { name: 'pages/', content: Buffer.alloc(0), method: 0 },
    ]);

    const count = await extractZipBufferToDir(zip, dir);

    expect(count).toBe(2);
    await expect(readFile(join(dir, 'app.json'), 'utf8')).resolves.toBe(
      '{"pages":[]}',
    );
    await expect(
      readFile(join(dir, 'pages', 'index', 'index.js'), 'utf8'),
    ).resolves.toBe('Page({})');
  });

  it('跳过目录穿越条目，不写目标目录之外', async () => {
    const dir = await makeDir();
    const zip = buildZip([
      { name: '../evil.txt', content: Buffer.from('boom'), method: 0 },
      {
        name: 'nested/../../evil2.txt',
        content: Buffer.from('boom'),
        method: 0,
      },
      { name: 'ok.txt', content: Buffer.from('fine'), method: 0 },
    ]);

    const count = await extractZipBufferToDir(zip, dir);

    expect(count).toBe(1);
    await expect(readFile(join(dir, 'ok.txt'), 'utf8')).resolves.toBe('fine');
    await expect(stat(resolve(dir, '..', 'evil.txt'))).rejects.toThrow();
    await expect(stat(resolve(dir, '..', 'evil2.txt'))).rejects.toThrow();
  });

  it('非 zip 字节直接报错', async () => {
    const dir = await makeDir();
    await expect(
      extractZipBufferToDir(Buffer.from('not a zip at all'), dir),
    ).rejects.toThrow(/不是有效的 zip/);
  });

  it('不支持的压缩方式报错而不是静默产出坏工程', async () => {
    const dir = await makeDir();
    const content = Buffer.from('x');
    const zip = buildZip([{ name: 'a.js', content, method: 0 }]);
    // 中央目录 method 字段（偏移 +10）：本地记录 = 30 + 名称长 + 数据长。
    const centralOffset =
      30 + Buffer.from('a.js', 'utf8').length + content.length;
    zip.writeUInt16LE(9, centralOffset + 10);

    await expect(extractZipBufferToDir(zip, dir)).rejects.toThrow(
      /不支持的压缩方式/,
    );
  });
});
