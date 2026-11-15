'use strict';

/**
 * _plugin-package-unit.js — 插件包导入（ZIP / 文件夹）的静态回归：
 *   plugin.json 清单归一化、文件夹（含套一层目录）、ZIP（store / deflate /
 *   反斜杠条目名）、缺清单与非法 JSON 的报错、命令类插件必填 command。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { readFromDir, readFromZip, normalizeManifest } = require('../src/main/plugin-package');

function ok(name) {
  console.log('  ok   ' + name);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-plugin-pkg-'));
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const plain = Buffer.from(entry.data, 'utf8');
    const method = entry.deflate ? 8 : 0;
    const data = method === 8 ? zlib.deflateRawSync(plain) : plain;
    const crc = crc32(plain);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

const MANIFEST = JSON.stringify(
  {
    id: 'weather',
    name: '查天气',
    kind: 'http',
    description: '按城市查当天天气',
    params: { city: { type: 'string', description: '城市名', required: true } },
    config: { method: 'GET', url: 'https://api.example.com/weather?city={{city}}' },
  },
  null,
  2,
);

try {
  const parsed = normalizeManifest(JSON.parse(MANIFEST), 'fallback');
  assert.equal(parsed.id, 'weather');
  assert.equal(parsed.name, '查天气');
  assert.equal(parsed.kind, 'http');
  assert.equal(parsed.config.method, 'GET');
  ok('清单归一化：id / name / kind / params / config');

  const fallback = normalizeManifest(
    { name: 'ping', kind: 'command', config: { command: 'echo {{text}}' } },
    '',
  );
  assert.equal(fallback.id, 'ping');
  assert.equal(fallback.enabled, true);
  ok('清单兜底：id 由名称生成，默认启用');

  assert.throws(
    () => normalizeManifest({ name: 'x', kind: 'command', config: {} }, ''),
    /command/,
  );
  assert.throws(
    () => normalizeManifest({ name: 'x', kind: 'http', config: {} }, ''),
    /config\.url/,
  );
  ok('非法清单：命令缺 command / HTTP 缺 url 直接报错');

  const dir = path.join(tmpRoot, 'weather-pack');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), MANIFEST);
  const fromDir = readFromDir(dir);
  assert.equal(fromDir.id, 'weather');
  ok('文件夹导入：根目录 plugin.json');

  const wrapped = path.join(tmpRoot, 'wrapped');
  fs.mkdirSync(path.join(wrapped, 'inner-plugin'), { recursive: true });
  fs.writeFileSync(path.join(wrapped, 'inner-plugin', 'plugin.json'), MANIFEST);
  const fromWrapped = readFromDir(wrapped);
  assert.equal(fromWrapped.id, 'weather');
  ok('文件夹导入：只套一层子目录也能找到');

  const zipPath = path.join(tmpRoot, 'pack.zip');
  fs.writeFileSync(
    zipPath,
    buildZip([
      { name: 'weather-pack/plugin.json', data: MANIFEST, deflate: true },
      { name: 'weather-pack/README.md', data: 'ignored' },
    ]),
  );
  const fromZip = readFromZip(zipPath);
  assert.equal(fromZip.id, 'weather');
  ok('ZIP 导入：deflate + 非根目录 plugin.json');

  const winZipPath = path.join(tmpRoot, 'win-pack.zip');
  fs.writeFileSync(
    winZipPath,
    buildZip([{ name: 'win-pack\\plugin.json', data: MANIFEST, deflate: true }]),
  );
  const fromWinZip = readFromZip(winZipPath);
  assert.equal(fromWinZip.id, 'weather');
  ok('ZIP 导入：反斜杠条目名（PowerShell Compress-Archive）');

  const badZipPath = path.join(tmpRoot, 'bad.zip');
  fs.writeFileSync(badZipPath, buildZip([{ name: 'README.md', data: 'x' }]));
  assert.throws(() => readFromZip(badZipPath), /plugin\.json/);
  ok('ZIP 缺 plugin.json：报可执行的错误');

  const malformedPath = path.join(tmpRoot, 'malformed.zip');
  fs.writeFileSync(
    malformedPath,
    buildZip([{ name: 'plugin.json', data: '{ not json' }]),
  );
  assert.throws(() => readFromZip(malformedPath), /JSON/);
  ok('plugin.json 非法 JSON：报可执行的错误');
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}