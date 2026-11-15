'use strict';

/**
 * platform-client.js
 *
 * Outbound-only HTTP client for the AIPDD enterprise platform device channel.
 * The client always initiates requests (poll model); the platform never calls in.
 *
 * Public device channel endpoints (see backend/src/bot-host/bot-host.public.ts):
 *   POST {baseUrl}/api/public/bot-host/login         (account password -> 30d bearer)
 *   POST {baseUrl}/api/public/bot-host/session       (bearer -> user/site/points)
 *   POST {baseUrl}/api/public/bot-host/pair          (bearer; get 6-digit code)
 *   POST {baseUrl}/api/public/bot-host/pair/poll     (bearer; take the one-time token)
 *   POST {baseUrl}/api/public/bot-host/heartbeat     (x-bot-token)
 *   POST {baseUrl}/api/public/bot-host/progress      (x-bot-token)
 *   POST {baseUrl}/api/public/bot-host/result        (x-bot-token)
 *   POST {baseUrl}/api/public/bot-host/model-settings (x-bot-token; local model -> platform)
 *   DELETE {baseUrl}/api/public/bot-host/model-settings (x-bot-token)
 *   POST {baseUrl}/api/public/bot-host/logout        (x-bot-token)
 *   GET  {baseUrl}/health
 *
 * Zero third-party dependencies: Node http/https only.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const CLIENT_VERSION = '1.0.0';
const TOKEN_HEADER = 'x-bot-token';

/**
 * Low-level JSON request. Never throws on non-2xx; resolves with
 * { httpStatus, ok, data } so callers can distinguish contract-level
 * failures ({ ok:false }) from transport failures.
 */
function request(baseUrl, method, pathname, options) {
  const opts = options || {};
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(pathname, normalizeBase(baseUrl));
    } catch (err) {
      resolve({ transportError: true, error: 'invalid baseUrl: ' + err.message });
      return;
    }

    const isHttps = target.protocol === 'https:';
    const lib = isHttps ? https : http;

    const body = opts.body ? JSON.stringify(opts.body) : null;
    const headers = Object.assign(
      {
        Accept: 'application/json',
        'User-Agent': 'botbuddy/' + CLIENT_VERSION
      },
      opts.headers || {}
    );
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    if (opts.token) {
      headers[TOKEN_HEADER] = opts.token;
    }
    if (opts.userToken) {
      headers.Authorization = 'Bearer ' + opts.userToken;
    }

    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: target.pathname + target.search,
        method,
        headers,
        timeout: opts.timeoutMs || 15000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (err) {
            data = { ok: false, message: 'non-JSON response', raw: text.slice(0, 500) };
          }
          resolve({
            httpStatus: res.statusCode,
            ok:
              res.statusCode >= 200 &&
              res.statusCode < 300 &&
              (!data || data.ok !== false),
            data
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', (err) => {
      resolve({ transportError: true, error: err.message });
    });

    if (body) req.write(body);
    req.end();
  });
}

function normalizeBase(baseUrl) {
  let base = String(baseUrl || '').trim();
  if (!/^https?:\/\//i.test(base)) base = 'http://' + base;
  return base.replace(/\/+$/, '');
}

/** The platform column is a closed set ('win' | 'mac'); Node's raw value won't match. */
function currentPlatform() {
  return process.platform === 'darwin' ? 'mac' : 'win';
}

// --- Contract endpoints -----------------------------------------------------

function health(baseUrl) {
  return request(baseUrl, 'GET', '/health', { timeoutMs: 6000 });
}

function login(baseUrl, username, password) {
  return request(baseUrl, 'POST', '/api/public/bot-host/login', {
    body: { username, password },
    timeoutMs: 20000
  });
}

function session(baseUrl, userToken) {
  return request(baseUrl, 'POST', '/api/public/bot-host/session', {
    userToken,
    body: {},
    timeoutMs: 15000
  });
}

function pairOpen(baseUrl, deviceInfo, userToken) {
  return request(baseUrl, 'POST', '/api/public/bot-host/pair', {
    userToken,
    body: { deviceInfo },
    timeoutMs: 15000
  });
}

function pairPoll(baseUrl, code, userToken) {
  return request(baseUrl, 'POST', '/api/public/bot-host/pair/poll', {
    userToken,
    body: { code },
    timeoutMs: 15000
  });
}

function heartbeat(baseUrl, token, payload) {
  return request(baseUrl, 'POST', '/api/public/bot-host/heartbeat', {
    token,
    body: payload,
    timeoutMs: 15000
  });
}

function progress(baseUrl, token, payload) {
  return request(baseUrl, 'POST', '/api/public/bot-host/progress', {
    token,
    body: payload,
    timeoutMs: 15000
  });
}

function result(baseUrl, token, payload) {
  return request(baseUrl, 'POST', '/api/public/bot-host/result', {
    token,
    body: payload,
    timeoutMs: 20000
  });
}

/** 本机模型设置 -> 平台：平台落一条「BotBuddy · 主机名」渠道并授权给本机。 */
function syncModel(baseUrl, token, payload) {
  return request(baseUrl, 'POST', '/api/public/bot-host/model-settings', {
    token,
    body: payload,
    timeoutMs: 15000
  });
}

/** 本机清空模型设置 -> 撤掉客户端同步的覆盖项。 */
function clearModel(baseUrl, token) {
  return request(baseUrl, 'DELETE', '/api/public/bot-host/model-settings', {
    token,
    body: {},
    timeoutMs: 10000
  });
}

function logout(baseUrl, token) {
  return request(baseUrl, 'POST', '/api/public/bot-host/logout', {
    token,
    body: {},
    timeoutMs: 10000
  });
}

module.exports = {
  CLIENT_VERSION,
  TOKEN_HEADER,
  request,
  normalizeBase,
  currentPlatform,
  health,
  login,
  session,
  pairOpen,
  pairPoll,
  heartbeat,
  progress,
  result,
  syncModel,
  clearModel,
  logout
};
