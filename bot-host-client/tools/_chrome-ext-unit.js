'use strict';

/**
 * _chrome-ext-unit.js — Chrome 插件包管理的静态回归：
 *   清单校验、文件夹导入/覆盖、ZIP 导入、越界路径拒绝、列表与删除。
 * 不启动浏览器（受控浏览器在真机联调时验证），全部落在临时 HOME 里。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-chrome-ext-home-'));
process.env.AWBOTDSH_HOME = HOME;

const chromeExtensions = require('../src/main/chrome-extensions');

function ok(name) {
  console.log('  ok   ' + name);
}

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
    manifest_version: 3,
    name: '测试采集插件',
    version: '2.1.0',
    action: { default_title: 'test' },
    background: { service_worker: 'background.js' },
  },
  null,
  2,
);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-chrome-ext-src-'));
try {
  // --- 内置插件（builtin-extensions/ 随包分发） ---
  const builtins = chromeExtensions.builtins();
  assert.ok(builtins.length >= 1, '内置插件应随包存在（builtin-extensions/）');
  for (const item of builtins) {
    assert.equal(item.builtin, true);
    const dir = chromeExtensions.resolveDir(item.id);
    assert.ok(dir && fs.existsSync(path.join(dir, 'manifest.json')));
  }
  const automa = builtins.find((item) => item.id === 'automa');
  assert.ok(automa, '内置插件应包含 Automa');
  assert.equal(automa.builtin, true);
  assert.equal(chromeExtensions.remove('automa').ok, false);
  ok('内置插件：随包可见、目录可解析、不可删除');

  // 用户插件列表要在内置之外单算：先确认导入前没有用户插件。
  const userList = () => chromeExtensions.list().filter((item) => !item.builtin);
  assert.equal(userList().length, 0);

  const src = path.join(tmp, 'my-ext');
  fs.mkdirSync(path.join(src, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(src, 'manifest.json'), MANIFEST);
  fs.writeFileSync(path.join(src, 'background.js'), 'console.log("bg");\n');
  fs.writeFileSync(path.join(src, 'icons', 'icon.txt'), 'icon');

  const imported = chromeExtensions.importFromDirectory(src);
  assert.match(imported.id, /^[a-z0-9-]+$/);
  assert.equal(imported.name, '测试采集插件');
  const listed = userList();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, imported.id);
  assert.ok(fs.existsSync(path.join(chromeExtensions.DIR, imported.id, 'icons', 'icon.txt')));
  ok('文件夹导入：校验清单、复制子目录、列表可见');

  const again = chromeExtensions.importFromDirectory(src);
  assert.equal(again.id, imported.id);
  assert.equal(userList().length, 1);
  ok('重复导入：同 id 覆盖，不新增');

  // 与内置插件重名的包拒绝导入（内置目录只读，不能被子目录覆盖）。
  const clashDir = path.join(tmp, 'clash');
  fs.mkdirSync(clashDir, { recursive: true });
  fs.writeFileSync(
    path.join(clashDir, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Automa',
      version: '9.9.9',
      action: { default_title: 'x' },
      background: { service_worker: 'background.js' },
    }),
  );
  assert.throws(() => chromeExtensions.importFromDirectory(clashDir), /内置/);
  ok('重名内置：拒绝导入');

  const zipPath = path.join(tmp, 'ext.zip');
  fs.writeFileSync(
    zipPath,
    buildZip([
      { name: 'wrapped/manifest.json', data: MANIFEST, deflate: true },
      { name: 'wrapped/background.js', data: 'console.log("bg2");' },
    ]),
  );
  const fromZip = chromeExtensions.importFromZip(zipPath);
  assert.equal(fromZip.id, imported.id);
  ok('ZIP 导入：允许只套一层目录');

  const evilZip = path.join(tmp, 'evil.zip');
  fs.writeFileSync(
    evilZip,
    buildZip([
      { name: 'manifest.json', data: MANIFEST },
      { name: '../evil.txt', data: 'boom' },
    ]),
  );
  assert.throws(() => chromeExtensions.importFromZip(evilZip), /越界/);
  ok('ZIP 越界路径：拒绝导入');

  const badDir = path.join(tmp, 'bad-ext');
  fs.mkdirSync(badDir, { recursive: true });
  fs.writeFileSync(path.join(badDir, 'manifest.json'), JSON.stringify({ name: 'x' }));
  assert.throws(() => chromeExtensions.importFromDirectory(badDir), /version|manifest_version|扩展/);
  ok('非法清单：缺少必填字段直接报错');

  const removed = chromeExtensions.remove(imported.id);
  assert.deepEqual(removed, { ok: true });
  assert.equal(userList().length, 0);
  ok('删除：目录移除，列表同步');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(HOME, { recursive: true, force: true });
}