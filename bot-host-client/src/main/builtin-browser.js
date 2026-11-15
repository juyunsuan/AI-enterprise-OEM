'use strict';

/**
 * 客户端自带浏览器：Agent 的浏览器就是它。
 *
 *   · 每个窗口＝一个页面（标签），使用独立持久会话 persist:botbuddy-browser；
 *   · 插件管理导入的 Chrome 插件会尝试装进这个会话（受 Electron 对扩展格式支持范围限制，
 *     装不进去的会在结果里列出原因）；
 *   · Agent 的浏览器工具（chrome_tabs / open / read / click / fill）直接驱动这里的窗口，
 *     不启动、也不扫描本机 Chrome / Edge，不需要 chrome://extensions。
 */

const { BrowserWindow, session } = require('electron');

const PARTITION = 'persist:botbuddy-browser';
const MAX_TEXT = 20000;
let seq = 0;
const windows = new Map();
const loadedExtensionPaths = new Set();

function browserSession() {
  return session.fromPartition(PARTITION);
}

function aliveWindows() {
  return Array.from(windows.entries()).filter(([, win]) => !win.isDestroyed());
}

function listWindows() {
  const focused = BrowserWindow.getFocusedWindow();
  return aliveWindows().map(([id, win]) => ({
    id,
    title: win.getTitle() || '',
    url: win.webContents.getURL() || '',
    active: win === focused
  }));
}

function activeWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && Array.from(windows.values()).includes(focused)) return focused;
  const alive = aliveWindows().map(([, win]) => win);
  return alive[alive.length - 1] || null;
}

function windowById(id) {
  const win = windows.get(Number(id));
  return win && !win.isDestroyed() ? win : null;
}

async function open(url) {
  const target =
    typeof url === 'string' && /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : 'about:blank';
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    title: 'BotBuddy 浏览器',
    webPreferences: {
      session: browserSession(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const id = ++seq;
  windows.set(id, win);
  win.on('closed', () => windows.delete(id));
  try {
    await win.loadURL(target);
  } catch {
    /* 打不开的地址保留窗口，Agent 可继续换地址 */
  }
  return { id, url: target, title: win.getTitle() || '' };
}

/** 把受管插件装进内置浏览器会话；重复调用只尝试未装过的目录。 */
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
  const win = tabId ? windowById(tabId) : activeWindow();
  if (!win) throw new Error('客户端浏览器还没有打开的页面，先用 chrome_open 打开一个网址');
  const text = await win.webContents.executeJavaScript(
    'document.body ? document.body.innerText : ""'
  );
  return {
    tabId: Number(tabId) || 0,
    url: win.webContents.getURL() || '',
    title: win.getTitle() || '',
    text: String(text || '').slice(0, MAX_TEXT)
  };
}

async function click(selector, tabId) {
  const win = tabId ? windowById(tabId) : activeWindow();
  if (!win) throw new Error('客户端浏览器还没有打开的页面，先用 chrome_open 打开一个网址');
  const clicked = await win.webContents.executeJavaScript(
    `(() => { const el = document.querySelector(${JSON.stringify(String(selector || ''))}); if (!el) return false; el.click(); return true; })()`
  );
  return { clicked: !!clicked };
}

async function fill(selector, value, tabId) {
  const win = tabId ? windowById(tabId) : activeWindow();
  if (!win) throw new Error('客户端浏览器还没有打开的页面，先用 chrome_open 打开一个网址');
  const filled = await win.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector(${JSON.stringify(String(selector || ''))});
      if (!el) return false;
      el.focus();
      el.value = ${JSON.stringify(String(value == null ? '' : value))};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`
  );
  return { filled: !!filled };
}

function toolDefs() {
  return [
    {
      name: 'chrome_tabs',
      description: '列出客户端自带浏览器里的页面（标题、地址、是否当前）。Agent 的浏览器就是这个客户端浏览器。',
      parameters: { type: 'object', properties: {} },
      call: async () => ({ tabs: listWindows() })
    },
    {
      name: 'chrome_open',
      description: '在客户端自带浏览器里打开一个网址（新页面），用于查看网页、继续操作。不需要外部 Chrome / Edge。',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'http(s) 完整地址' } },
        required: ['url']
      },
      call: (args) => open(args && args.url)
    },
    {
      name: 'chrome_read',
      description: '读取客户端自带浏览器里某个页面（默认当前页）的正文文本。',
      parameters: {
        type: 'object',
        properties: { tabId: { type: 'number', description: '页面 id，省略＝当前页面' } }
      },
      call: (args) => readText(args && args.tabId)
    },
    {
      name: 'chrome_click',
      description: '在客户端自带浏览器的当前页面里按 CSS 选择器点击一个元素。',
      parameters: {
        type: 'object',
        properties: { selector: { type: 'string', description: 'CSS 选择器' } },
        required: ['selector']
      },
      call: (args) => click(args && args.selector, args && args.tabId)
    },
    {
      name: 'chrome_fill',
      description: '在客户端自带浏览器的当前页面里往一个输入框填值（触发 input/change）。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          value: { type: 'string', description: '要填的内容' }
        },
        required: ['selector', 'value']
      },
      call: (args) => fill(args && args.selector, args && args.value, args && args.tabId)
    }
  ];
}

/** 菜单/按钮打开浏览器：已有窗口就聚焦最后一个，没有才新开。 */
async function focusOrOpen(url) {
  const alive = aliveWindows();
  if (alive.length) {
    const [id, win] = alive[alive.length - 1];
    win.show();
    win.focus();
    return { id, reused: true, url: win.webContents.getURL() || '' };
  }
  return open(url);
}

module.exports = { open, focusOrOpen, toolDefs, loadManagedExtensions, listWindows };