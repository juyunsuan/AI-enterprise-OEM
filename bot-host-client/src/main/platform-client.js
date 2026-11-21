'use strict';

/**
 * platform-client.js
 *
 * Outbound-only HTTP client for the AIPDD enterprise platform device channel.
 * The client always initiates requests (poll model); the platform never calls in.
 *
 * Public device channel endpoints (see backend/src/bot-host/bot-host.public.ts):
 *   新客户端默认 {baseUrl}/api/public/awbotdsh/**；旧平台回退 /api/public/bot-host/**。
 *   POST {baseUrl}{apiBase}/login         (account password -> 30d bearer)
 *   POST {baseUrl}{apiBase}/session       (bearer -> user/site/points)
 *   POST {baseUrl}{apiBase}/pair          (bearer; get 6-digit code)
 *   POST {baseUrl}{apiBase}/pair/poll     (bearer; take the one-time token)
 *   POST {baseUrl}{apiBase}/heartbeat     (x-bot-token)
 *   POST {baseUrl}{apiBase}/progress      (x-bot-token)
 *   POST {baseUrl}{apiBase}/result        (x-bot-token)
 *   POST {baseUrl}{apiBase}/model-settings (x-bot-token; legacy only)
 *   DELETE {baseUrl}{apiBase}/model-settings (x-bot-token)
 *   POST {baseUrl}{apiBase}/logout        (x-bot-token)
 *   GET  {baseUrl}{apiBase}/skills          (x-bot-token; keyword/page/pageSize)
 *   GET  {baseUrl}{apiBase}/skills/:slug     (x-bot-token)
 *   GET  {baseUrl}{apiBase}/skills/:slug/download (x-bot-token; zip bytes)
 *   GET  {baseUrl}/health
 *
 * Zero third-party dependencies: Node http/https only.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const CLIENT_VERSION = '1.8.0';
const TOKEN_HEADER = 'x-bot-token';

/** AWBotDSH 走独立通道；平台版本不支持时回退旧桌面通道。 */
const API_CHANNEL = {
  current: '/api/public/awbotdsh',
  legacy: '/api/public/bot-host'
};
let apiBase = API_CHANNEL.current;

function setApiBase(path) {
  const value = typeof path === 'string' ? path.trim() : '';
  if (!value) return;
  apiBase = '/' + value.replace(/^\/+|\/+$/g, '');
}

function getApiBase() {
  return apiBase;
}

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
        'User-Agent': 'awbotdsh/' + CLIENT_VERSION
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

/**
 * 连接级请求（登录/会话/心跳）：新通道返回 404 说明平台还是旧版本，
 * 自动回退到旧桌面通道并记住选择，避免用户手工改配置。
 */
async function requestWithFallback(baseUrl, method, suffix, options) {
  const first = await request(baseUrl, method, apiBase + suffix, options);
  if (first.httpStatus !== 404 || apiBase === API_CHANNEL.legacy) return first;
  apiBase = API_CHANNEL.legacy;
  return request(baseUrl, method, apiBase + suffix, options);
}

/**
 * 二进制 GET（技能包 zip）。与 request() 一样不抛异常：非 2xx 或 JSON 错误体
 * 统一回 { ok:false, error }，成功才回 { ok:true, bytes, filename }。
 */
function requestBytes(baseUrl, pathname, options) {
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

    const headers = Object.assign(
      {
        Accept: 'application/zip,application/octet-stream',
        'User-Agent': 'awbotdsh/' + CLIENT_VERSION
      },
      opts.headers || {}
    );
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
        method: 'GET',
        headers,
        timeout: opts.timeoutMs || 60000
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const bytes = Buffer.concat(chunks);
          const type = String(res.headers['content-type'] || '');
          if (res.statusCode < 200 || res.statusCode >= 300 || /json/i.test(type)) {
            let message = 'HTTP ' + res.statusCode;
            try {
              const parsed = JSON.parse(bytes.toString('utf8'));
              if (parsed && parsed.message) message = parsed.message;
            } catch (err) {
              // 二进制错误体：拿不到 message，就用状态码兜底
            }
            resolve({ httpStatus: res.statusCode, ok: false, error: message });
            return;
          }
          resolve({
            httpStatus: res.statusCode,
            ok: true,
            bytes,
            contentType: type,
            filename: filenameOf(res.headers['content-disposition'])
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
    req.end();
  });
}

function filenameOf(disposition) {
  const raw = String(disposition || '');
  const star = /filename\*=UTF-8''([^;]+)/i.exec(raw);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch (err) {
      // 非法的百分号编码，退回普通 filename
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(raw);
  return plain ? plain[1].trim() : '';
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
  return requestWithFallback(baseUrl, 'POST', '/login', {
    body: { username, password },
    timeoutMs: 20000
  });
}

function session(baseUrl, userToken) {
  return requestWithFallback(baseUrl, 'POST', '/session', {
    userToken,
    body: {},
    timeoutMs: 15000
  });
}

function pairOpen(baseUrl, deviceInfo, userToken) {
  return request(baseUrl, 'POST', apiBase + '/pair', {
    userToken,
    body: { deviceInfo },
    timeoutMs: 15000
  });
}

function pairPoll(baseUrl, code, userToken) {
  return request(baseUrl, 'POST', apiBase + '/pair/poll', {
    userToken,
    body: { code },
    timeoutMs: 15000
  });
}

/** 手机扫码配对码：登录态业务接口，返回二维码原文与 PNG data URL。 */
function createPairQr(baseUrl, userToken, body) {
  return request(baseUrl, 'POST', '/enterprise/bot-hosts/pair-qr', {
    userToken,
    body,
    timeoutMs: 20000
  });
}

function heartbeat(baseUrl, token, payload) {
  return requestWithFallback(baseUrl, 'POST', '/heartbeat', {
    token,
    body: payload,
    timeoutMs: 15000
  });
}

function progress(baseUrl, token, payload) {
  return request(baseUrl, 'POST', apiBase + '/progress', {
    token,
    body: payload,
    timeoutMs: 15000
  });
}

function result(baseUrl, token, payload) {
  return request(baseUrl, 'POST', apiBase + '/result', {
    token,
    body: payload,
    timeoutMs: 20000
  });
}

/** 本机模型设置 -> 平台：平台落一条「BotBuddy · 主机名」渠道并授权给本机。 */
function syncModel(baseUrl, token, payload) {
  return request(baseUrl, 'POST', apiBase + '/model-settings', {
    token,
    body: payload,
    timeoutMs: 15000
  });
}

/** 本机清空模型设置 -> 撤掉客户端同步的覆盖项。 */
function clearModel(baseUrl, token) {
  return request(baseUrl, 'DELETE', apiBase + '/model-settings', {
    token,
    body: {},
    timeoutMs: 10000
  });
}

function logout(baseUrl, token) {
  return request(baseUrl, 'POST', apiBase + '/logout', {
    token,
    body: {},
    timeoutMs: 10000
  });
}

// --- RPA（AWBotDSH 浏览器设备）：主机令牌通道，与技能中心同一份令牌 ---

/** 这台主机可跑的待办清单（界面展示用；领取仍按 taskId 单条来）。 */
function rpaTasks(baseUrl, token) {
  return request(baseUrl, 'GET', apiBase + '/rpa/tasks', {
    token,
    timeoutMs: 15000
  });
}

/** 领取一条任务：不传 taskId＝让平台按队列派一条；报文里带回 Automa 工作流正文。 */
function rpaClaim(baseUrl, token, taskId) {
  return request(baseUrl, 'POST', apiBase + '/rpa/claim', {
    token,
    body: taskId ? { taskId: Number(taskId) } : {},
    timeoutMs: 20000
  });
}

/** 回传终态：executionId 由领取报文给出，重复回传由平台按 CAS 拒绝。 */
function rpaFinish(baseUrl, token, payload) {
  return request(baseUrl, 'POST', apiBase + '/rpa/finish', {
    token,
    body: payload,
    timeoutMs: 20000
  });
}

/** 本机起不来窗口时把已抢到的任务退回待执行，别让它卡在「执行中」。 */
function rpaRelease(baseUrl, token, taskId) {
  return request(baseUrl, 'POST', apiBase + '/rpa/release', {
    token,
    body: { taskId: Number(taskId) || 0 },
    timeoutMs: 15000
  });
}

// --- 技能中心（SkillHub）：平台转发，客户端只负责展示与安装 ---

function skillList(baseUrl, token, query) {
  const q = query || {};
  const params = new URLSearchParams();
  params.set('keyword', String(q.keyword || ''));
  params.set('page', String(q.page || 1));
  params.set('pageSize', String(q.pageSize || 16));
  return request(baseUrl, 'GET', apiBase + '/skills?' + params.toString(), {
    token,
    timeoutMs: 30000
  });
}

function skillDetail(baseUrl, token, slug) {
  return request(
    baseUrl,
    'GET',
    apiBase + '/skills/' + encodeURIComponent(slug),
    { token, timeoutMs: 30000 }
  );
}

function skillDownload(baseUrl, token, slug) {
  return requestBytes(
    baseUrl,
    apiBase + '/skills/' + encodeURIComponent(slug) + '/download',
    { token, timeoutMs: 60000 }
  );
}

module.exports = {
  CLIENT_VERSION,
  TOKEN_HEADER,
  setApiBase,
  getApiBase,
  request,
  requestBytes,
  normalizeBase,
  currentPlatform,
  health,
  login,
  session,
  pairOpen,
  pairPoll,
  createPairQr,
  heartbeat,
  progress,
  result,
  syncModel,
  clearModel,
  logout,
  skillList,
  skillDetail,
  skillDownload,
  rpaTasks,
  rpaClaim,
  rpaFinish,
  rpaRelease
};
