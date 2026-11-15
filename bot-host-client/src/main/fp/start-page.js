'use strict';

/**
 * 指纹窗口的内置起始页（仅本机回环，不联网、不含外部资源）。
 *
 * 内核以 about:blank 启动时页面没有可用的 Runtime 执行上下文，Agent 的
 * 读页/点击/填表会阻塞；这里给每个窗口一个稳定的 http 起始页，
 * 同时作为后续「指纹自检页」的宿主。
 */

const http = require('node:http');

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>BotBuddy 指纹窗口</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    background: #0f1115; color: #e6e9ef;
    font: 14px/1.6 "Segoe UI", "Microsoft YaHei", sans-serif;
  }
  .box { text-align: center; opacity: .92; }
  .dot { color: #4ade80; }
  h1 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
  p { margin: 0; color: #8b93a3; }
</style>
</head>
<body>
  <div class="box">
    <h1><span class="dot">●</span> BotBuddy 指纹窗口已就绪</h1>
    <p>在地址栏输入网址开始，或让 Agent 在当前窗口里操作页面。</p>
  </div>
</body>
</html>`;

let server = null;
let startUrl = '';
let pending = null;

function ensure() {
  if (server) return Promise.resolve(startUrl);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const next = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
          'x-content-type-options': 'nosniff'
        });
        res.end(HTML);
        return;
      }
      if (req.url === '/favicon.ico') {
        res.writeHead(204, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    });
    next.once('error', (error) => {
      pending = null;
      reject(error);
    });
    next.listen(0, '127.0.0.1', () => {
      server = next;
      startUrl = 'http://127.0.0.1:' + next.address().port + '/';
      pending = null;
      resolve(startUrl);
    });
  });
  return pending;
}

function close() {
  if (!server) return Promise.resolve();
  const target = server;
  server = null;
  startUrl = '';
  pending = null;
  return new Promise((resolve) => target.close(() => resolve()));
}

module.exports = { ensure, close };