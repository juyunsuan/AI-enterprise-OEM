'use strict';

/**
 * chrome-bridge.js
 *
 * 本机 Chrome 插件的桥接端点：Agent ↔ 浏览器。
 *
 *   · 只监听 127.0.0.1，不对外网开放；
 *   · 用一次性随机令牌（`chromeBridgeToken`）区分插件，插件请求必须带 `x-bridge-token`；
 *   · 长轮询：插件 GET /poll 挂着等活，Agent 要浏览器做事时把动作入队，插件取走后
 *     POST /result 回结果，Agent 侧 await 拿到。
 *
 * 动作清单（插件侧实现）：
 *   tabs.list / tab.open / tab.close / page.text / page.click / page.fill / page.eval
 *
 * 这一层只做搬运与超时，不解析网页、不读 Cookie、不注入账号凭据。
 */

const http = require('http');
const { URL } = require('url');

const DEFAULT_PORT = 35911;
const LONG_POLL_MS = 25000;
const ACTION_TIMEOUT_MS = 30000;
const MAX_QUEUE = 20;

function json(res, status, body) {
  const text = JSON.stringify(body == null ? {} : body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'x-bridge-token, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS'
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const value = JSON.parse(raw || '{}');
        resolve(value && typeof value === 'object' ? value : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

class ChromeBridge {
  constructor() {
    this.server = null;
    this.port = DEFAULT_PORT;
    this.token = '';
    this.waiters = [];
    this.queue = [];
    this.pending = new Map();
    this.connected = false;
    this.lastSeenAt = null;
    this.extension = { name: '', version: '' };
    this.seq = 0;
  }

  /** 起桥接；端口被占用时返回 error，不影响客户端其它功能。 */
  start(options) {
    const opts = options || {};
    if (this.server) return Promise.resolve({ ok: true, port: this.port });
    this.token = String(opts.token || '').trim();
    this.port = Number(opts.port) > 0 ? Number(opts.port) : DEFAULT_PORT;
    if (!this.token) return Promise.resolve({ ok: false, error: '缺少桥接令牌' });
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => void this.handle(req, res));
      server.on('error', (error) => {
        this.server = null;
        resolve({ ok: false, error: '桥接端口 ' + this.port + ' 起不来：' + error.message });
      });
      server.listen(this.port, '127.0.0.1', () => {
        this.server = server;
        resolve({ ok: true, port: this.port });
      });
    });
  }

  stop() {
    for (const waiter of this.waiters.splice(0)) {
      try {
        json(waiter, 204, {});
      } catch (err) {
        /* 已断开 */
      }
    }
    for (const [, job] of this.pending) job.reject(new Error('桥接已停止'));
    this.pending.clear();
    this.queue = [];
    this.connected = false;
    if (this.server) this.server.close();
    this.server = null;
  }

  status() {
    return {
      running: Boolean(this.server),
      port: this.port,
      token: this.token,
      connected: this.connected,
      lastSeenAt: this.lastSeenAt,
      extension: this.extension,
      pending: this.queue.length
    };
  }

  authorized(req, url) {
    const header = String(req.headers['x-bridge-token'] || '').trim();
    const query = String(url.searchParams.get('token') || '').trim();
    return Boolean(this.token) && (header === this.token || query === this.token);
  }

  touch(extra) {
    this.connected = true;
    this.lastSeenAt = new Date().toISOString();
    if (extra) {
      this.extension = {
        name: String(extra.name || this.extension.name || '').slice(0, 60),
        version: String(extra.version || this.extension.version || '').slice(0, 20)
      };
    }
  }

  async handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (!this.authorized(req, url)) return json(res, 401, { ok: false, error: '桥接令牌无效' });

    if (req.method === 'POST' && url.pathname === '/hello') {
      const body = await readBody(req);
      this.touch({ name: body.name, version: body.version });
      return json(res, 200, { ok: true, port: this.port });
    }

    if (req.method === 'GET' && url.pathname === '/poll') {
      this.touch();
      if (this.queue.length) return json(res, 200, { ok: true, job: this.queue.shift() });
      // 长轮询：有活立刻回，没活挂到超时回 204，插件再接着 poll。
      const wait = Math.min(LONG_POLL_MS, Math.max(1000, Number(url.searchParams.get('wait')) || LONG_POLL_MS));
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        try {
          json(res, 204, {});
        } catch (err) {
          /* 已断开 */
        }
      }, wait);
      const waiter = { res, timer };
      this.waiters.push(waiter);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/result') {
      const body = await readBody(req);
      this.touch();
      const job = this.pending.get(String(body.id || ''));
      if (job) {
        this.pending.delete(String(body.id));
        if (body.ok === false) job.reject(new Error(String(body.error || '浏览器插件执行失败').slice(0, 500)));
        else job.resolve(body.data === undefined ? null : body.data);
      }
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, { ok: true, status: this.status() });
    }

    return json(res, 404, { ok: false, error: '未知桥接路由' });
  }

  /** 把动作交给插件并等结果；插件不在线 / 超时都给一句人话。 */
  call(action, params) {
    if (!this.server) return Promise.reject(new Error('Chrome 桥接未启动：到客户端「插件」页开启'));
    if (!this.connected) return Promise.reject(new Error('Chrome 插件还没连上桥接：先在浏览器里打开插件'));
    if (this.queue.length >= MAX_QUEUE) return Promise.reject(new Error('浏览器动作排队过多，请稍后再试'));
    this.seq += 1;
    const id = 'c' + Date.now().toString(36) + '-' + this.seq;
    const job = { id, action, params: params || {} };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.queue = this.queue.filter((item) => item.id !== id);
        reject(new Error('浏览器插件 ' + Math.round(ACTION_TIMEOUT_MS / 1000) + ' 秒内没有回结果'));
      }, ACTION_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      const waiter = this.waiters.shift();
      this.queue.push(job);
      if (waiter) {
        clearTimeout(waiter.timer);
        const next = this.queue.shift();
        try {
          json(waiter.res, 200, { ok: true, job: next });
        } catch (err) {
          /* 已断开 */
        }
      }
    });
  }
}

/** 给模型看的浏览器工具：只有桥接在线时才注入，离线时模型不会假装能操作浏览器。 */
function toolDefs(bridge) {
  if (!bridge || !bridge.status().connected) return [];
  return [
    {
      name: 'chrome_tabs',
      description: '列出当前浏览器窗口里的标签页（标题、地址、是否当前激活）。',
      parameters: { type: 'object', properties: {} },
      call: () => bridge.call('tabs.list', {})
    },
    {
      name: 'chrome_open',
      description: '在浏览器里打开一个网址（新标签页），用于查看网页、继续人工操作。',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'http(s) 完整地址' } },
        required: ['url']
      },
      call: (args) => bridge.call('tab.open', { url: String(args.url || '') })
    },
    {
      name: 'chrome_read',
      description: '读取某个标签页的正文文本（默认当前激活标签）；读不到时先 chrome_tabs 拿 id。',
      parameters: {
        type: 'object',
        properties: { tabId: { type: 'number', description: '标签页 id，省略＝当前激活标签' } }
      },
      call: (args) => bridge.call('page.text', { tabId: args.tabId })
    },
    {
      name: 'chrome_click',
      description: '在当前标签页里按 CSS 选择器点击一个元素。',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS 选择器' } },
        required: ['selector']
      },
      call: (args) => bridge.call('page.click', { selector: String(args.selector || '') })
    },
    {
      name: 'chrome_fill',
      description: '在当前标签页里往一个输入框填值（触发 input/change 事件）。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          value: { type: 'string', description: '要填的内容' }
        },
        required: ['selector', 'value']
      },
      call: (args) =>
        bridge.call('page.fill', { selector: String(args.selector || ''), value: String(args.value || '') })
    }
  ];
}

/** 进程内单例：主进程起桥接、Agent 运行时查同一份状态。 */
const shared = new ChromeBridge();

module.exports = { ChromeBridge, toolDefs, DEFAULT_PORT, shared };