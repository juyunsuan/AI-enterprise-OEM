'use strict';

/**
 * _fp-unit.js — 指纹窗口的纯逻辑回归：
 *   启动参数、内核安装/解析、代理本地转发（SOCKS5 认证 / HTTP CONNECT）、
 *   出口 IP 检测（直连与经代理）。
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-fp-home-'));
process.env.BOTBUDDY_HOME = HOME;

const fingerprint = require('../src/main/fp/fingerprint');
const kernels = require('../src/main/fp/kernels');
const relay = require('../src/main/fp/proxy-relay');

function ok(name) {
  console.log('  ok   ' + name);
}

function echoServer() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.pipe(socket));
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: server.address().port })
    );
  });
}

/** 最小 SOCKS5 服务端：支持无认证与用户名密码认证，CONNECT 到目标后透传。 */
function fakeSocks5(expected) {
  const seen = { auth: '', targets: [] };
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let stage = 'greeting';
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 'greeting') {
        if (buffer.length < 2) return;
        const nmethods = buffer[1];
        if (buffer.length < 2 + nmethods) return;
        const methods = buffer.subarray(2, 2 + nmethods);
        buffer = buffer.subarray(2 + nmethods);
        if (expected) {
          if (!methods.includes(0x02)) {
            socket.write(Buffer.from([0x05, 0xff]));
            socket.destroy();
            return;
          }
          socket.write(Buffer.from([0x05, 0x02]));
          stage = 'auth';
        } else {
          socket.write(Buffer.from([0x05, 0x00]));
          stage = 'connect';
        }
        return;
      }
      if (stage === 'auth') {
        if (buffer.length < 2) return;
        const ulen = buffer[1];
        if (buffer.length < 2 + ulen + 1) return;
        const user = buffer.subarray(2, 2 + ulen).toString('utf8');
        const plen = buffer[2 + ulen];
        if (buffer.length < 2 + ulen + 1 + plen) return;
        const pass = buffer.subarray(3 + ulen, 3 + ulen + plen).toString('utf8');
        buffer = buffer.subarray(3 + ulen + plen);
        seen.auth = user + ':' + pass;
        if (user !== expected.user || pass !== expected.password) {
          socket.end(Buffer.from([0x01, 0x01]));
          return;
        }
        socket.write(Buffer.from([0x01, 0x00]));
        stage = 'connect';
        return;
      }
      if (stage === 'connect') {
        if (buffer.length < 5) return;
        const atyp = buffer[3];
        let host = '';
        let offset = 4;
        if (atyp === 0x01) {
          if (buffer.length < 4 + 4 + 2) return;
          host = Array.from(buffer.subarray(4, 8)).join('.');
          offset = 8;
        } else if (atyp === 0x03) {
          const len = buffer[4];
          if (buffer.length < 5 + len + 2) return;
          host = buffer.subarray(5, 5 + len).toString('utf8');
          offset = 5 + len;
        } else {
          socket.destroy();
          return;
        }
        const port = buffer.readUInt16BE(offset);
        const rest = buffer.subarray(offset + 2);
        seen.targets.push(host + ':' + port);
        const upstream = net.connect({ host, port }, () => {
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          if (rest.length) upstream.write(rest);
          socket.pipe(upstream);
          upstream.pipe(socket);
        });
        upstream.once('error', () => socket.destroy());
        socket.removeListener('data', onData);
        stage = 'relay';
      }
    };
    socket.on('data', onData);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: server.address().port, seen })
    );
  });
}

/** 最小 HTTP CONNECT 代理：记录 Proxy-Authorization 后透传。 */
function fakeHttpProxy(expectedAuth) {
  const seen = { auth: '', targets: [] };
  const server = http.createServer();
  server.on('connect', (req, clientSocket, head) => {
    seen.auth = String(req.headers['proxy-authorization'] || '');
    if (expectedAuth && seen.auth !== expectedAuth) {
      clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      return;
    }
    const [host, portRaw] = String(req.url || '').split(':');
    seen.targets.push(req.url);
    const upstream = net.connect({ host, port: Number(portRaw) || 443 }, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) upstream.write(head);
      clientSocket.pipe(upstream);
      upstream.pipe(clientSocket);
    });
    upstream.once('error', () => clientSocket.destroy());
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: server.address().port, seen })
    );
  });
}

function relayConnect(relayPort, host, port, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: relayPort }, () => {
      socket.write('CONNECT ' + host + ':' + port + ' HTTP/1.1\r\nHost: ' + host + ':' + port + '\r\n\r\n');
    });
    let buffer = Buffer.alloc(0);
    let tunneled = false;
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!tunneled) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buffer.subarray(0, end).toString('utf8');
        if (!/ 200 /.test(head)) {
          socket.destroy();
          reject(new Error('relay 隧道失败：' + head.split('\r\n')[0]));
          return;
        }
        tunneled = true;
        buffer = buffer.subarray(end + 4);
        socket.write(payload);
      }
      if (buffer.length >= payload.length) {
        const echo = buffer.subarray(0, payload.length).toString('utf8');
        socket.destroy();
        resolve(echo);
      }
    });
    socket.once('error', reject);
    setTimeout(() => {
      socket.destroy();
      reject(new Error('relay 测试超时'));
    }, 6000);
  });
}

(async () => {
  const profile = {
    seed: '123456789',
    platform: 'win',
    timezone: 'Asia/Shanghai',
    languages: ['zh-CN', 'zh'],
    hardwareConcurrency: 8,
    canvasNoise: 'off',
    audioNoise: 'light',
    webrtcMode: 'proxy'
  };
  const args = fingerprint.buildArgs(profile, {
    profileDir: 'C:/tmp/fp',
    relayPort: 35901,
    cdpPort: 35902,
    extensionDirs: ['C:/ext/one'],
    startUrl: 'https://www.baidu.com'
  });
  assert.ok(args.includes('--fingerprint=123456789'));
  assert.ok(args.includes('--fingerprint-platform=windows'));
  assert.ok(args.includes('--fingerprint-brand=Chrome'));
  assert.ok(args.includes('--fingerprint-hardware-concurrency=8'));
  assert.ok(args.includes('--timezone=Asia/Shanghai'));
  assert.ok(args.includes('--lang=zh-CN'));
  assert.ok(args.includes('--accept-lang=zh-CN,zh'));
  assert.ok(args.includes('--disable-spoofing=canvas'));
  assert.ok(!args.some((arg) => arg.includes('audio')));
  assert.ok(args.includes('--disable-non-proxied-udp'));
  assert.ok(args.includes('--proxy-server=http://127.0.0.1:35901'));
  assert.ok(args.includes('--load-extension=C:/ext/one'));
  assert.ok(args.includes('--remote-debugging-port=35902'));
  assert.ok(args.includes('--remote-allow-origins=*'));
  assert.equal(args[args.length - 1], 'https://www.baidu.com');
  ok('启动参数：种子/平台/品牌/语言/时区/噪声/WebRTC/代理/扩展/调试端口');

  const lightArgs = fingerprint.buildArgs(
    { seed: 42, platform: 'win', canvasNoise: 'light', webrtcMode: 'proxy' },
    { profileDir: 'C:/tmp/fp', startUrl: 'about:blank' }
  );
  assert.ok(!lightArgs.some((arg) => arg.startsWith('--disable-spoofing=')));
  assert.ok(fingerprint.consistency({ canvasNoise: 'light' }).some((hint) => hint.includes('Canvas')));
  assert.equal(fingerprint.consistency({ canvasNoise: 'off', audioNoise: 'light' }).length, 0);
  ok('一致性提示：Canvas 噪声默认关闭，开启时明确告警');

  const kernelDir = path.join(HOME, 'fake-kernel', '150.0.7871.186');
  fs.mkdirSync(kernelDir, { recursive: true });
  fs.writeFileSync(path.join(kernelDir, 'chrome.exe'), 'fake');
  const installed = kernels.installFromDir(path.join(HOME, 'fake-kernel', '150.0.7871.186'), {
    version: '150.0.7871.186'
  });
  assert.equal(installed.version, '150.0.7871.186');
  assert.ok(fs.existsSync(installed.exe));
  const resolved = kernels.resolve('');
  assert.equal(resolved.version, '150.0.7871.186');
  assert.throws(() => kernels.resolve('999.0.0.0'), /未安装/);
  kernels.remove('150.0.7871.186');
  assert.equal(kernels.list().length, 0);

  const evilDir = path.join(HOME, 'kernels', 'evil-1.0.0.0');
  fs.mkdirSync(evilDir, { recursive: true });
  fs.writeFileSync(path.join(HOME, 'outside.exe'), 'fake');
  fs.writeFileSync(
    path.join(evilDir, 'manifest.json'),
    JSON.stringify({ version: 'evil-1.0.0.0', exe: '../../outside.exe' })
  );
  assert.ok(!kernels.list().some((row) => row.version === 'evil-1.0.0.0'));
  fs.rmSync(evilDir, { recursive: true, force: true });
  fs.rmSync(path.join(HOME, 'outside.exe'), { force: true });
  ok('内核：安装/解析/校验/删除（清单 exe 越界被拒绝）');

  const echo = await echoServer();
  const socks = await fakeSocks5({ user: 'u1', password: 'p1' });
  const socksRelay = await relay.startRelay({
    mode: 'proxy',
    type: 'socks5',
    host: '127.0.0.1',
    port: socks.port,
    authMode: 'password',
    user: 'u1',
    password: 'p1'
  });
  const echoText = await relayConnect(socksRelay.port, '127.0.0.1', echo.port, 'ping-socks');
  assert.equal(echoText, 'ping-socks');
  assert.equal(socks.seen.auth, 'u1:p1');
  assert.ok(socks.seen.targets.includes('127.0.0.1:' + echo.port));
  socksRelay.close();
  socks.server.close();
  echo.server.close();
  ok('代理转发：SOCKS5 账号密码认证 + 隧道透传');

  const echo2 = await echoServer();
  const authHeader = 'Basic ' + Buffer.from('u2:p2').toString('base64');
  const httpProxy = await fakeHttpProxy(authHeader);
  const httpRelay = await relay.startRelay({
    mode: 'proxy',
    type: 'http',
    host: '127.0.0.1',
    port: httpProxy.port,
    authMode: 'password',
    user: 'u2',
    password: 'p2'
  });
  const echoText2 = await relayConnect(httpRelay.port, '127.0.0.1', echo2.port, 'ping-http');
  assert.equal(echoText2, 'ping-http');
  assert.equal(httpProxy.seen.auth, authHeader);
  httpRelay.close();
  httpProxy.server.close();
  echo2.server.close();
  ok('代理转发：HTTP CONNECT + Proxy-Authorization');

  const ipServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ip: '203.0.113.7' }));
  });
  await new Promise((resolve) => ipServer.listen(0, '127.0.0.1', resolve));
  const ipPort = ipServer.address().port;
  const direct = await relay.probeExitIp({ mode: 'direct' }, 'http://127.0.0.1:' + ipPort + '/ip');
  assert.equal(direct.ip, '203.0.113.7');
  const socks2 = await fakeSocks5(null);
  const viaProxy = await relay.probeExitIp(
    {
      mode: 'proxy',
      type: 'socks5',
      host: '127.0.0.1',
      port: socks2.port,
      authMode: 'whitelist',
      user: '',
      password: ''
    },
    'http://127.0.0.1:' + ipPort + '/ip'
  );
  assert.equal(viaProxy.ip, '203.0.113.7');
  assert.ok(socks2.seen.targets.includes('127.0.0.1:' + ipPort));
  socks2.server.close();
  ipServer.close();
  ok('出口 IP 检测：直连 + 经 SOCKS5 代理');

  const startPage = require('../src/main/fp/start-page');
  const [startUrl, sameUrl] = await Promise.all([startPage.ensure(), startPage.ensure()]);
  assert.equal(startUrl, sameUrl);
  assert.match(startUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const html = await new Promise((resolve, reject) => {
    http
      .get(startUrl, (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => resolve(raw));
      })
      .on('error', reject);
  });
  assert.match(html, /BotBuddy 指纹窗口已就绪/);
  assert.equal(await startPage.ensure(), startUrl);
  await startPage.close();
  ok('起始页：回环地址 + 单例 + 页面内容');

  fs.rmSync(HOME, { recursive: true, force: true });
})().catch((error) => {
  console.error('  FAIL ' + error.message);
  process.exit(1);
});