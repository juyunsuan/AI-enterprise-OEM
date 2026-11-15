'use strict';

/**
 * 指纹窗口启动器：每个档案一个独立内核进程。
 *
 *   kernel.exe --user-data-dir=<档案目录> --fingerprint=<seed> ...
 *     --proxy-server=http://127.0.0.1:<relayPort>（有代理时）
 *     --remote-debugging-port=<cdpPort>（仅回环）
 *
 * 管理器用 CDP 感知页面、导航与操作；关闭时先 Browser.close，再兜底杀进程树。
 * 同时打开上限默认 20（设置 fp.maxOpen 可调，最大 100）。
 */

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const db = require('../db');
const kernels = require('./kernels');
const profiles = require('./profiles');
const fingerprint = require('./fingerprint');
const relay = require('./proxy-relay');
const startPage = require('./start-page');
const wsClient = require('../ws-client');

const windows = new Map();
const opening = new Map();
const OPEN_DEFAULT = 20;
let shuttingDown = false;

function maxOpen() {
  const raw = Number(db.getSetting('fp.maxOpen', OPEN_DEFAULT));
  if (!Number.isFinite(raw)) return OPEN_DEFAULT;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

function setMaxOpen(value) {
  const next = Math.max(1, Math.min(100, Math.round(Number(value) || OPEN_DEFAULT)));
  db.setSetting('fp.maxOpen', next);
  return next;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function stateSummary(state) {
  return {
    profileId: state.profileId,
    profileName: state.profileName,
    kernelVersion: state.kernelVersion,
    status: state.status,
    pid: state.child && state.child.pid ? state.child.pid : 0,
    cdpPort: state.cdpPort,
    relayPort: state.relayPort,
    startedAt: state.startedAt,
    error: state.error || ''
  };
}

/** 同一档案的并发打开只拉起一个内核；上限按「已开 + 启动中」计算。 */
function open(profileId) {
  const id = String(profileId || '');
  if (shuttingDown) return Promise.reject(new Error('应用正在退出，无法打开指纹窗口'));
  const pending = opening.get(id);
  if (pending) return pending;
  const existing = windows.get(id);
  if (existing) {
    return Promise.resolve({
      ...stateSummary(existing),
      reused: true,
      wsEndpoint: 'http://127.0.0.1:' + existing.cdpPort
    });
  }
  if (windows.size + opening.size >= maxOpen()) {
    return Promise.reject(
      new Error('同时打开的指纹窗口已达上限（' + maxOpen() + '），请先关闭一些窗口')
    );
  }
  const task = doOpen(id).finally(() => opening.delete(id));
  opening.set(id, task);
  return task;
}

async function doOpen(id) {
  const profile = profiles.get(id);
  if (!profile) throw new Error('指纹窗口不存在');
  const kernel = kernels.resolve(profile.kernelVersion);
  const profileDir = path.join(db.DATA_DIR, 'fp-profiles', profile.id);
  fs.mkdirSync(profileDir, { recursive: true });
  const cdpPort = await freePort();
  const creds = profiles.proxyCredentials(profile.id);
  let relayHandle = null;
  let relayPort = 0;
  if (profile.proxy.mode === 'proxy') {
    relayHandle = await relay.startRelay(creds);
    relayPort = relayHandle.port;
  }
  const extensionDirs = [];
  for (const extensionId of profile.extensionIds) {
    const dir = path.join(require('../chrome-extensions').DIR, extensionId);
    if (fs.existsSync(dir)) extensionDirs.push(dir);
  }
  const args = fingerprint.buildArgs(profile, {
    profileDir,
    relayPort,
    cdpPort,
    extensionDirs,
    startUrl: 'about:blank'
  });
  let child;
  try {
    child = spawn(kernel.exe, args, {
      cwd: path.dirname(kernel.exe),
      stdio: 'ignore',
      windowsHide: false
    });
  } catch (error) {
    if (relayHandle) relayHandle.close();
    throw new Error('启动指纹内核失败：' + error.message);
  }
  const state = {
    profileId: profile.id,
    profileName: profile.name,
    kernelVersion: kernel.version,
    cdpPort,
    relayPort,
    relay: relayHandle,
    child,
    cdp: null,
    startedAt: Date.now(),
    status: 'starting',
    error: ''
  };
  windows.set(profile.id, state);
  const forget = () => {
    if (windows.get(profile.id) !== state) return;
    windows.delete(profile.id);
    if (state.relay) state.relay.close();
    if (state.cdp) {
      state.cdp.close();
      state.cdp = null;
    }
  };
  child.once('exit', forget);
  child.once('error', (error) => {
    state.status = 'error';
    state.error = '指纹内核进程启动失败：' + (error.message || error.code || '未知错误');
    forget();
  });
  try {
    const spawnFailed = new Promise((resolve) => child.once('error', () => resolve(null)));
    const pages = await Promise.race([wsClient.waitReady(cdpPort, 25000), spawnFailed]);
    if (!pages) throw new Error(state.error || '内核没有在预期时间内就绪（CDP 无页面）');
    state.cdp = await wsClient.browserSession(cdpPort, 10000);
    const ready = await primeKernelPage(state, pages);
    state.status = 'open';
    profiles.markOpened(profile.id, profile.lastIp || '');
    return {
      ...stateSummary(state),
      reused: false,
      wsEndpoint: 'http://127.0.0.1:' + cdpPort,
      pages: (ready || pages).map((page) => ({ id: page.id, title: page.title, url: page.url }))
    };
  } catch (error) {
    state.error = state.error || error.message;
    await teardown(state);
    throw new Error('指纹内核启动失败：' + state.error);
  }
}

function waitExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function teardown(state) {
  if (!state) return;
  windows.delete(state.profileId);
  state.status = 'closing';
  if (state.cdp) {
    state.cdp.close();
    state.cdp = null;
  }
  try {
    await wsClient.closeBrowser(state.cdpPort);
  } catch {
    /* 内核可能已退出 */
  }
  try {
    state.child.kill();
  } catch {
    /* ignore */
  }
  await waitExit(state.child, 1500);
  if (state.child && state.child.exitCode === null) {
    try {
      spawn('taskkill', ['/PID', String(state.child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
    await waitExit(state.child, 1500);
  }
  if (state.relay) state.relay.close();
}

async function close(profileId) {
  const key = String(profileId || '');
  const pending = opening.get(key);
  if (pending) {
    try {
      await pending;
    } catch {
      /* 启动失败时 doOpen 已自行回收 */
    }
  }
  const state = windows.get(key);
  if (!state) return { ok: true, reused: false };
  await teardown(state);
  return { ok: true };
}

async function closeAll() {
  const ids = Array.from(windows.keys());
  await Promise.all(ids.map((id) => close(id).catch(() => {})));
  return { closed: ids.length };
}

/** 应用退出：先标记停止接收新窗口，再并行回收全部内核。 */
async function shutdown() {
  shuttingDown = true;
  await closeAll();
}

function listOpen() {
  return Array.from(windows.values()).map(stateSummary);
}

/** 汇总所有已打开窗口的页面（Agent chrome_tabs 与 UI 都用它）。 */
async function pages() {
  const out = [];
  for (const state of windows.values()) {
    try {
      const list = await wsClient.listPages(state.cdpPort);
      for (const page of list) {
        out.push({
          profileId: state.profileId,
          profileName: state.profileName,
          targetId: page.id,
          title: page.title || '',
          url: page.url || ''
        });
      }
    } catch {
      /* 窗口正在关闭 */
    }
  }
  return out;
}

/**
 * 内核命令行打开的 about:blank 没有 Runtime 上下文（CDP 命令会阻塞），
 * 用常驻会话导航到内置起始页，并等上下文可执行后再返回页面列表。
 */
async function primeKernelPage(state, fallback) {
  let startUrl = '';
  try {
    startUrl = await startPage.ensure();
  } catch {
    /* 起始页不可用时保留 about:blank，Agent 首次导航后仍可驱动 */
  }
  const session = state.cdp;
  if (!session) return fallback;
  if (startUrl) {
    try {
      await session.call('Page.navigate', { url: startUrl }, 10000);
    } catch {
      /* 保留原页面 */
    }
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const result = await session.call(
        'Runtime.evaluate',
        { expression: 'document.readyState', returnByValue: true },
        2500
      );
      if (result && result.result && result.result.value) break;
    } catch {
      /* 上下文尚未建立 */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  try {
    return await wsClient.listPages(state.cdpPort);
  } catch {
    return fallback;
  }
}

/** 常驻会话缺失时补建（内核重开或连接被回收）。 */
async function ensureSession(state) {
  if (state.cdp) return state.cdp;
  state.cdp = await wsClient.browserSession(state.cdpPort, 10000);
  return state.cdp;
}

/** Agent 默认窗口：显式设置优先；没设置就取最近使用档案；没有任何档案时自动建一个。 */
async function agentWindow() {
  let profile = profiles.agentProfile();
  if (!profile) {
    profile = profiles.create({ name: '默认窗口', platform: 'win' });
    profiles.setAgentProfile(profile.id);
  }
  if (!windows.has(profile.id)) {
    await open(profile.id);
  }
  return windows.get(profile.id);
}

async function navigateAgent(rawUrl) {
  const state = await agentWindow();
  const target = fingerprintUrl(rawUrl);
  const session = await ensureSession(state);
  await session.call('Page.navigate', { url: target }, 20000);
  profiles.markOpened(state.profileId, '');
  return { profileId: state.profileId, url: target };
}

async function evaluateAgent(expression, timeoutMs) {
  const state = await agentWindow();
  const session = await ensureSession(state);
  const result = await session.call(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    timeoutMs || 20000
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || '页面执行异常');
  }
  return result.result ? result.result.value : undefined;
}

function fingerprintUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('请输入网址');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) {
    if (!/^https?:\/\//i.test(text) && !/^about:/i.test(text)) throw new Error('只支持 http(s) 网址');
    return text;
  }
  return 'https://' + text;
}

module.exports = {
  open,
  close,
  closeAll,
  shutdown,
  listOpen,
  pages,
  agentWindow,
  navigateAgent,
  evaluateAgent,
  maxOpen,
  setMaxOpen,
  fingerprintUrl
};