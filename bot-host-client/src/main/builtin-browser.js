'use strict';

/**
 * 客户端自带浏览器：Agent 的浏览器就是它。
 *
 *   · 每个窗口 = 顶栏（后退/前进/刷新/地址栏）+ 页面视图（WebContentsView）；
 *   · 页面的独立持久会话是 persist:botbuddy-browser，登录状态跨重启保留；
 *   · Agent 的浏览器工具（chrome_tabs / open / read / click / fill）直接驱动页面视图；
 *   · 不启动、不扫描本机 Chrome / Edge，也不需要 chrome://extensions；
 *   · 插件管理导入的 Chrome 插件会尝试装载进这个会话，装不了的会给出原因。
 */

const path = require('node:path');
const { BrowserWindow, WebContentsView, ipcMain, session } = require('electron');

const PARTITION = 'persist:botbuddy-browser';
const TOOLBAR_H = 52;
const MAX_TEXT = 20000;

let seq = 0;
const states = new Map();
const loadedExtensionPaths = new Set();

function browserSession() {
  return session.fromPartition(PARTITION);
}

function aliveStates() {
  return Array.from(states.values()).filter((state) => state.win && !state.win.isDestroyed());
}

function normalizeUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('请输入网址');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) {
    if (!/^https?:\/\//i.test(text) && !/^about:/i.test(text)) {
      throw new Error('只支持 http(s) 网址');
    }
    return text;
  }
  return 'https://' + text;
}

function stateSnapshot(state) {
  const wc = state.view.webContents;
  return {
    id: state.id,
    title: wc.getTitle() || '',
    url: wc.getURL() || '',
    loading: wc.isLoading(),
    // Electron 31 的 navigationHistory 只有索引读取；前进/后退在 webContents 上。
    canGoBack: typeof wc.canGoBack === 'function' ? wc.canGoBack() : false,
    canGoForward: typeof wc.canGoForward === 'function' ? wc.canGoForward() : false,
  };
}

function sendState(state) {
  if (!state.win || state.win.isDestroyed()) return;
  try {
    state.win.webContents.send('browserChrome:state', stateSnapshot(state));
  } catch {
    /* 窗口正在关闭 */
  }
}

function layout(state) {
  const [width, height] = state.win.getContentSize();
  state.view.setBounds({
    x: 0,
    y: TOOLBAR_H,
    width,
    height: Math.max(0, height - TOOLBAR_H),
  });
}

function track(state) {
  const wc = state.view.webContents;
  for (const event of [
    'did-navigate',
    'did-navigate-in-page',
    'did-start-loading',
    'did-stop-loading',
  ]) {
    wc.on(event, () => sendState(state));
  }
  wc.on('page-title-updated', (_event, title) => {
    try {
      state.win.setTitle(title ? title + ' — BotBuddy 浏览器' : 'BotBuddy 浏览器');
    } catch {
      /* ignore */
    }
    sendState(state);
  });
  state.win.on('resize', () => layout(state));
}

async function loadInState(state, url) {
  const target = normalizeUrl(url);
  await state.view.webContents.loadURL(target);
  sendState(state);
  return target;
}

async function open(url) {
  const raw = String(url || '').trim();
  const target = raw ? normalizeUrl(raw) : '';
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    title: 'BotBuddy 浏览器',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'browser-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'browser-shell.html'));
  const view = new WebContentsView({
    webPreferences: {
      session: browserSession(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.contentView.addChildView(view);
  const id = ++seq;
  const state = { id, win, view };
  states.set(id, state);
  win.on('closed', () => states.delete(id));
  layout(state);
  track(state);
  if (target) {
    try {
      await view.webContents.loadURL(target);
    } catch {
      /* 地址打不开时保留窗口，用户可换地址 */
    }
  }
  sendState(state);
  return {
    id,
    url: view.webContents.getURL() || target,
    title: view.webContents.getTitle() || '',
  };
}

async function goto(rawUrl) {
  const target = normalizeUrl(rawUrl);
  const alive = aliveStates();
  if (alive.length) {
    const state = alive[alive.length - 1];
    state.win.show();
    state.win.focus();
    try {
      await loadInState(state, target);
    } catch (error) {
      throw new Error('打开失败：' + (error.message || target));
    }
    return { id: state.id, reused: true, url: target };
  }
  return open(target);
}

async function focusOrOpen(url) {
  const alive = aliveStates();
  if (alive.length) {
    const state = alive[alive.length - 1];
    state.win.show();
    state.win.focus();
    return { id: state.id, reused: true, url: state.view.webContents.getURL() || '' };
  }
  return open(url);
}

function activeState() {
  const focused = BrowserWindow.getFocusedWindow();
  for (const state of aliveStates()) {
    if (state.win === focused) return state;
  }
  const alive = aliveStates();
  return alive[alive.length - 1] || null;
}

function stateById(id) {
  const state = states.get(Number(id));
  return state && state.win && !state.win.isDestroyed() ? state : null;
}

function listWindows() {
  const focused = BrowserWindow.getFocusedWindow();
  // 还没导航过的空白页不算「打开的页面」：列表里不出现 about:blank。
  return aliveStates()
    .map((state) => ({ ...stateSnapshot(state), active: state.win === focused }))
    .filter((row) => row.url && row.url !== 'about:blank');
}

async function loadManagedExtensions() {
  const { list } = require('./chrome-extensions');
  const items = list();
  const loaded = [];
  const errors = [];
  const ses = browserSession();
  for (const item of items) {
    if (loadedExtensionPaths.has(item.path)) continue;
    try {
      const extension = await ses.loadExtension(item.path);
      loadedExtensionPaths.add(item.path);
      loaded.push(extension.name || item.name);
    } catch (error) {
      errors.push(item.name + '：' + (error.message || '该浏览器内核不支持这个扩展'));
    }
  }
  return { loaded, errors };
}

async function readText(tabId) {
  const state = tabId ? stateById(tabId) : activeState();
  if (!state) throw new Error('客户端浏览器还没有打开的页面，先用 chrome_open 打开一个网址');
  const wc = state.view.webContents;
  const text = await wc.executeJavaScript('document.body ? document.body.innerText : ""');
  return {
    tabId: state.id,
    url: wc.getURL() || '',
    title: wc.getTitle() || '',
    text: String(text || '').slice(0, MAX_TEXT),
  };
}

async function click(selector, tabId) {
  const state = tabId ? stateById(tabId) : activeState();
  if (!state) throw new Error('客户端浏览器还没有打开的页面，先用 chrome_open 打开一个网址');
  const clicked = await state.view.webContents.executeJavaScript(
    `(() => { const el = document.querySelector(${JSON.stringify(String(selector || ''))}); if (!el) return false; el.click(); return true; })()`,
  );
  return { clicked: !!clicked };
}

async function fill(selector, value, tabId) {
  const state = tabId ? stateById(tabId) : activeState();
  if (!state) throw new Error('客户端浏览器还没有打开的页面，先用 chrome_open 打开一个网址');
  const filled = await state.view.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector(${JSON.stringify(String(selector || ''))});
      if (!el) return false;
      el.focus();
      el.value = ${JSON.stringify(String(value == null ? '' : value))};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  );
  return { filled: !!filled };
}

function toolDefs() {
  return [
    {
      name: 'chrome_tabs',
      description:
        '列出客户端自带浏览器里的页面（标题、地址、是否当前）。Agent 的浏览器就是这个客户端浏览器。',
      parameters: { type: 'object', properties: {} },
      call: async () => ({ tabs: listWindows() }),
    },
    {
      name: 'chrome_open',
      description:
        '在客户端自带浏览器里打开一个网址（新页面），用于查看网页、继续操作。不需要外部 Chrome / Edge。',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'http(s) 完整地址' } },
        required: ['url'],
      },
      call: (args) => open(args && args.url),
    },
    {
      name: 'chrome_read',
      description: '读取客户端自带浏览器里某个页面（默认当前页）的正文文本。',
      parameters: {
        type: 'object',
        properties: { tabId: { type: 'number', description: '页面 id，省略＝当前页面' } },
      },
      call: (args) => readText(args && args.tabId),
    },
    {
      name: 'chrome_click',
      description: '在客户端自带浏览器的当前页面里按 CSS 选择器点击一个元素。',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS 选择器' } },
        required: ['selector'],
      },
      call: (args) => click(args && args.selector, args && args.tabId),
    },
    {
      name: 'chrome_fill',
      description: '在客户端自带浏览器的当前页面里往一个输入框填值（触发 input/change）。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          value: { type: 'string', description: '要填的内容' },
        },
        required: ['selector', 'value'],
      },
      call: (args) => fill(args && args.selector, args && args.value, args && args.tabId),
    },
  ];
}

// 内置浏览器顶栏的导航动作：按发送方窗口定位到对应页面视图。
if (ipcMain) {
  ipcMain.on('browserChrome:action', (event, payload) => {
    const state = aliveStates().find((row) => row.win.webContents.id === event.sender.id);
    if (!state) return;
    const type = payload && payload.type;
    const wc = state.view.webContents;
    if (type === 'navigate') {
      void loadInState(state, payload.url).catch(() => undefined);
    } else if (type === 'back') {
      if (typeof wc.canGoBack === 'function' && wc.canGoBack()) wc.goBack();
    } else if (type === 'forward') {
      if (typeof wc.canGoForward === 'function' && wc.canGoForward()) wc.goForward();
    } else if (type === 'reload') {
      wc.reload();
    }
  });
}

module.exports = {
  open,
  goto,
  normalizeUrl,
  focusOrOpen,
  toolDefs,
  loadManagedExtensions,
  listWindows,
};