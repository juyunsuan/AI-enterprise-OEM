'use strict';

/**
 * 最小 WebSocket + CDP 客户端：只服务本机指纹内核（127.0.0.1）。
 *
 * Electron 31 内置 Node 20 没有全局 WebSocket；这里实现 RFC6455 的必要子集
 * （握手、掩码文本帧、ping/pong、close）用于 Runtime/Page/Target/Browser 命令。
 */

const crypto = require('node:crypto');
const http = require('node:http');

function connect(wsUrl, options = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(wsUrl);
    } catch (error) {
      reject(error);
      return;
    }
    if (url.protocol !== 'ws:') {
      reject(new Error('仅支持本机 ws:// 地址'));
      return;
    }
    const key = crypto.randomBytes(16).toString('base64');
    const request = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    const timer = setTimeout(
      () => request.destroy(new Error('WebSocket 连接超时')),
      options.timeoutMs || 5000,
    );
    request.on('upgrade', (res, socket) => {
      clearTimeout(timer);
      socket.setNoDelay(true);
      resolve(makeClient(socket));
    });
    request.on('response', (res) => {
      clearTimeout(timer);
      reject(new Error('WebSocket 握手失败：HTTP ' + res.statusCode));
    });
    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.end();
  });
}

function makeClient(socket) {
  let buffer = Buffer.alloc(0);
  const listeners = [];
  let closed = false;

  function sendFrame(opcode, payload) {
    if (closed) return;
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    const mask = crypto.randomBytes(4);
    let header;
    if (data.length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | data.length;
    } else if (data.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(data.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    header[0] = 0x80 | opcode;
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 1) masked[i] = data[i] ^ mask[i % 4];
    try {
      socket.write(Buffer.concat([header, mask, masked]));
    } catch {
      /* closed */
    }
  }

  function close() {
    if (closed) return;
    try {
      sendFrame(0x8, Buffer.alloc(0));
    } catch {
      /* ignore */
    }
    closed = true;
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      const first = buffer[0];
      const second = buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) === 0x80;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      let mask = null;
      if (masked) {
        if (buffer.length < offset + 4) return;
        mask = buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (buffer.length < offset + length) return;
      let payload = buffer.subarray(offset, offset + length);
      if (mask) {
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i += 1) unmasked[i] = payload[i] ^ mask[i % 4];
        payload = unmasked;
      }
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x1) {
        for (const cb of listeners) {
          try {
            cb(payload.toString('utf8'));
          } catch {
            /* 单个监听器异常不影响其它 */
          }
        }
      } else if (opcode === 0x8) {
        close();
        return;
      } else if (opcode === 0x9) sendFrame(0xa, payload);
    }
  });
  socket.on('close', () => {
    closed = true;
  });
  socket.on('error', () => {
    closed = true;
  });

  return {
    sendText: (text) => sendFrame(0x1, text),
    onText: (cb) => listeners.push(cb),
    close,
  };
}

/** 发起一次 CDP 调用并等待同 id 的结果。 */
async function cdpCall(wsUrl, method, params, timeoutMs = 8000) {
  const client = await connect(wsUrl, { timeoutMs });
  return new Promise((resolve, reject) => {
    let seq = 0;
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('CDP 调用超时：' + method));
    }, timeoutMs);
    client.onText((text) => {
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      if (!message || message.id !== seq) return;
      clearTimeout(timer);
      client.close();
      if (message.error) {
        reject(new Error(message.error.message || 'CDP 调用失败：' + method));
        return;
      }
      resolve(message.result || {});
    });
    seq += 1;
    client.sendText(JSON.stringify({ id: seq, method, params: params || {} }));
  });
}

async function cdpEvaluate(wsUrl, expression, timeoutMs = 8000) {
  const result = await cdpCall(
    wsUrl,
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    timeoutMs,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'CDP 执行异常');
  }
  return result.result ? result.result.value : undefined;
}

function getJson(port, pathname, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      'http://127.0.0.1:' + port + pathname,
      { timeout: timeoutMs },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(null);
          }
        });
      },
    );
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('CDP HTTP 超时')));
  });
}

async function listPages(port) {
  const list = await getJson(port, '/json/list');
  return (Array.isArray(list) ? list : []).filter(
    (target) => target && target.type === 'page' && /^https?:|^about:/.test(String(target.url || '')),
  );
}

async function browserWs(port) {
  const version = await getJson(port, '/json/version');
  return version && version.webSocketDebuggerUrl ? version.webSocketDebuggerUrl : '';
}

async function closeBrowser(port) {
  const endpoint = await browserWs(port);
  if (!endpoint) return false;
  await cdpCall(endpoint, 'Browser.close', {}, 3000);
  return true;
}

async function waitReady(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const pages = await listPages(port);
      if (pages.length) return pages;
    } catch {
      /* 内核还没就绪 */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

module.exports = {
  connect,
  cdpCall,
  cdpEvaluate,
  listPages,
  browserWs,
  closeBrowser,
  waitReady,
};