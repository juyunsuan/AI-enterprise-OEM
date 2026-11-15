'use strict';

/**
 * 本地代理认证转发：给指纹内核一个「无鉴权本地代理」，由管理器替它完成上游认证。
 *
 *   kernel --proxy-server=http://127.0.0.1:<relayPort>
 *     → relay（本机）
 *     → 上游 http/https（CONNECT + Proxy-Authorization）
 *        或 socks5（RFC1928 + RFC1929 账号密码）
 *
 * 直连模式不启 relay；IP 白名单模式不带凭据。
 * relay 只监听 127.0.0.1 临时端口，随窗口关闭回收，不记录流量内容。
 */

const http = require('node:http');
const net = require('node:net');
const tls = require('node:tls');

const CONNECT_TIMEOUT_MS = 15000;
const IP_CHECK_TIMEOUT_MS = 12000;

function basicAuth(user, password) {
  return 'Basic ' + Buffer.from(String(user || '') + ':' + String(password || ''), 'utf8').toString('base64');
}

function dial(proxy) {
  return new Promise((resolve, reject) => {
    const secure = proxy.type === 'https';
    const socket = secure
      ? tls.connect({ host: proxy.host, port: proxy.port, servername: proxy.host })
      : net.connect({ host: proxy.host, port: proxy.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('连接代理超时'));
    }, CONNECT_TIMEOUT_MS);
    socket.once(secure ? 'secureConnect' : 'connect', () => {
      clearTimeout(timer);
      socket.setNoDelay(true);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error('连接代理失败：' + (error.message || error.code || '未知错误')));
    });
  });
}

/** 通过 HTTP(S) 上游建立 CONNECT 隧道。 */
function httpTunnel(proxy, targetHost, targetPort) {
  return dial(proxy).then(
    (socket) =>
      new Promise((resolve, reject) => {
        let buffer = Buffer.alloc(0);
        const timer = setTimeout(() => {
          cleanup();
          socket.destroy();
          reject(new Error('代理隧道握手超时'));
        }, CONNECT_TIMEOUT_MS);
        const cleanup = () => {
          clearTimeout(timer);
          socket.removeListener('data', onData);
          socket.removeListener('error', onError);
        };
        const onError = (error) => {
          cleanup();
          socket.destroy();
          reject(new Error('代理隧道失败：' + (error.message || error.code || '未知错误')));
        };
        const onData = (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          const end = buffer.indexOf('\r\n\r\n');
          if (end < 0) {
            if (buffer.length > 64 * 1024) {
              cleanup();
              socket.destroy();
              reject(new Error('代理响应头过大'));
            }
            return;
          }
          cleanup();
          const head = buffer.subarray(0, end).toString('utf8');
          const status = Number((head.match(/^HTTP\/\d\.\d\s+(\d{3})/) || [])[1] || 0);
          if (status !== 200) {
            socket.destroy();
            reject(new Error('代理拒绝连接：HTTP ' + status + (status === 407 ? '（代理认证失败）' : '')));
            return;
          }
          const rest = buffer.subarray(end + 4);
          if (rest.length) socket.unshift(rest);
          resolve(socket);
        };
        socket.on('data', onData);
        socket.on('error', onError);
        const auth =
          proxy.authMode === 'password' && proxy.user
            ? 'Proxy-Authorization: ' + basicAuth(proxy.user, proxy.password) + '\r\n'
            : '';
        socket.write(
          'CONNECT ' + targetHost + ':' + targetPort + ' HTTP/1.1\r\n' +
            'Host: ' + targetHost + ':' + targetPort + '\r\n' +
            auth +
            'Proxy-Connection: keep-alive\r\n\r\n'
        );
      })
  );
}

/** SOCKS5 CONNECT（RFC1928），有账号时走用户名密码子协商（RFC1929）。 */
function socks5Tunnel(proxy, targetHost, targetPort) {
  return dial(proxy).then(
    (socket) =>
      new Promise((resolve, reject) => {
        const useAuth = proxy.authMode === 'password' && proxy.user;
        const methods = useAuth ? [0x00, 0x02] : [0x00];
        let stage = 'method';
        let buffer = Buffer.alloc(0);
        let timer = null;
        const stopTimer = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        };
        const fail = (message) => {
          stopTimer();
          socket.destroy();
          reject(new Error(message));
        };
        const sendConnect = () => {
          stage = 'connect';
          const hostBuf = Buffer.from(targetHost, 'utf8');
          const portBuf = Buffer.alloc(2);
          portBuf.writeUInt16BE(Number(targetPort) & 0xffff, 0);
          socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]), hostBuf, portBuf]));
        };
        const onData = (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          if (stage === 'method') {
            if (buffer.length < 2) return;
            const version = buffer[0];
            const method = buffer[1];
            buffer = buffer.subarray(2);
            if (version !== 0x05) return fail('SOCKS5 协议版本错误');
            if (method === 0xff) return fail('SOCKS5 上游没有可用的认证方式');
            if (method === 0x02) {
              stage = 'auth';
              const user = Buffer.from(String(proxy.user || ''), 'utf8');
              const pass = Buffer.from(String(proxy.password || ''), 'utf8');
              socket.write(
                Buffer.concat([
                  Buffer.from([0x01, user.length]),
                  user,
                  Buffer.from([pass.length]),
                  pass
                ])
              );
            } else {
              sendConnect();
            }
            return;
          }
          if (stage === 'auth') {
            if (buffer.length < 2) return;
            const ok = buffer[1] === 0x00;
            buffer = buffer.subarray(2);
            if (!ok) return fail('SOCKS5 账号密码认证失败');
            sendConnect();
            return;
          }
          if (stage === 'connect') {
            if (buffer.length < 4) return;
            const rep = buffer[1];
            if (rep !== 0x00) {
              return fail('SOCKS5 连接目标失败（代码 ' + rep + '）');
            }
            const atyp = buffer[3];
            let need = 0;
            if (atyp === 0x01) need = 4 + 2;
            else if (atyp === 0x03) {
              if (buffer.length < 5) return;
              need = 1 + buffer[4] + 2;
            } else if (atyp === 0x04) need = 16 + 2;
            else return fail('SOCKS5 返回了未知地址类型');
            if (buffer.length < 4 + need) return;
            const rest = buffer.subarray(4 + need);
            stopTimer();
            socket.removeListener('data', onData);
            if (rest.length) socket.unshift(rest);
            resolve(socket);
          }
        };
        socket.on('data', onData);
        socket.once('error', (error) => fail('SOCKS5 上游失败：' + (error.message || error.code || '未知错误')));
        timer = setTimeout(() => fail('SOCKS5 握手超时'), CONNECT_TIMEOUT_MS);
        socket.write(Buffer.from([0x05, methods.length, ...methods]));
      })
  );
}

function openTunnel(proxy, targetHost, targetPort) {
  if (!proxy || proxy.mode !== 'proxy') {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: targetHost, port: targetPort });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('连接目标超时'));
      }, CONNECT_TIMEOUT_MS);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.setNoDelay(true);
        resolve(socket);
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(new Error('连接目标失败：' + (error.message || error.code || '未知错误')));
      });
    });
  }
  return proxy.type === 'socks5'
    ? socks5Tunnel(proxy, targetHost, targetPort)
    : httpTunnel(proxy, targetHost, targetPort);
}

/** 启动本地认证转发；返回 127.0.0.1 上的端口与关闭函数。 */
async function startRelay(proxy) {
  const server = http.createServer();
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    return socket;
  };
  server.on('connection', track);

  server.on('connect', (req, clientSocket, head) => {
    track(clientSocket);
    // 兼容 IPv6 目标（CONNECT [::1]:443），按最后一个冒号拆分。
    const target = String(req.url || '');
    const splitAt = target.lastIndexOf(':');
    const rawHost = splitAt > 0 ? target.slice(0, splitAt) : target;
    const host = rawHost.replace(/^\[(.*)\]$/, '$1');
    const port = Number(target.slice(splitAt + 1)) || 443;
    if (!host) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    openTunnel(proxy, host, port)
      .then((upstream) => {
        track(upstream);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
        upstream.on('error', () => clientSocket.destroy());
        clientSocket.on('error', () => upstream.destroy());
      })
      .catch((error) => {
        try {
          clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n' + (error.message || ''));
        } catch {
          /* ignore */
        }
      });
  });

  server.on('request', (req, res) => {
    let target;
    try {
      target = new URL(req.url || '');
    } catch {
      res.writeHead(400);
      res.end('bad proxy request');
      return;
    }
    if (!/^https?:$/.test(target.protocol)) {
      res.writeHead(400);
      res.end('unsupported protocol');
      return;
    }
    const host = target.hostname;
    const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
    openTunnel(proxy, host, port)
      .then((upstream) => {
        track(upstream);
        const path = target.pathname + target.search;
        upstream.write(
          req.method + ' ' + path + ' HTTP/1.1\r\n' + 'Host: ' + target.host + '\r\n' +
            Object.entries(req.headers)
              .filter(
                ([key]) =>
                  ![
                    'proxy-authorization',
                    'proxy-connection',
                    'host',
                    'connection',
                    'keep-alive'
                  ].includes(String(key).toLowerCase())
              )
              .map(([key, value]) => key + ': ' + (Array.isArray(value) ? value.join(', ') : value) + '\r\n')
              .join('') +
            'Connection: close\r\n\r\n'
        );
        req.pipe(upstream);
        upstream.pipe(res);
        upstream.on('error', () => res.destroy());
      })
      .catch((error) => {
        res.writeHead(502);
        res.end(error.message || 'upstream failed');
      });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  return {
    port,
    close() {
      for (const socket of sockets) {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
      try {
        server.close();
      } catch {
        /* ignore */
      }
    }
  };
}

/** 用档案的代理配置探测出口 IP（默认 https://api.ipify.org?format=json）。 */
async function probeExitIp(proxy, checkUrl) {
  const startedAt = Date.now();
  const url = new URL(String(checkUrl || 'https://api.ipify.org?format=json'));
  const port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
  const socket = await openTunnel(proxy, url.hostname, port);
  try {
    const secure = url.protocol === 'https:';
    const stream = secure
      ? await new Promise((resolve, reject) => {
          const tlsSocket = tls.connect({ socket, servername: url.hostname }, () => resolve(tlsSocket));
          tlsSocket.once('error', reject);
        })
      : socket;
    const request =
      'GET ' + (url.pathname + url.search) + ' HTTP/1.1\r\n' +
      'Host: ' + url.host + '\r\n' +
      'User-Agent: BotBuddy-ProxyCheck/1.0\r\n' +
      'Accept: application/json,text/plain,*/*\r\n' +
      'Connection: close\r\n\r\n';
    const body = await new Promise((resolve, reject) => {
      let raw = '';
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error('检测出口 IP 超时'));
      }, IP_CHECK_TIMEOUT_MS);
      stream.on('data', (chunk) => {
        raw += chunk.toString('utf8');
        if (raw.length > 256 * 1024) {
          clearTimeout(timer);
          stream.destroy();
          resolve(raw);
        }
      });
      stream.once('end', () => {
        clearTimeout(timer);
        resolve(raw);
      });
      stream.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      stream.write(request);
    });
    const splitAt = body.indexOf('\r\n\r\n');
    const text = splitAt >= 0 ? body.slice(splitAt + 4) : body;
    let ip = '';
    try {
      const parsed = JSON.parse(text);
      ip = String(parsed.ip || parsed.query || '').trim();
    } catch {
      const ipv4 = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
      const ipv6 = text.match(/\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/i);
      ip = ipv4 ? ipv4[0] : ipv6 ? ipv6[0] : '';
    }
    if (!ip) throw new Error('检测地址没有返回可识别的 IP');
    return { ip, ms: Date.now() - startedAt };
  } finally {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }
}

module.exports = { startRelay, probeExitIp, openTunnel };