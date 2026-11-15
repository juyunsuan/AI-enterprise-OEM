'use strict';

/**
 * BotBuddy 浏览器桥接：后台脚本。
 *
 * 只做三件事：
 *   1. 长轮询本机 BotBuddy 客户端的桥接端点，领取 Agent 发来的浏览器动作；
 *   2. 用 chrome.tabs / chrome.scripting 执行动作（不读 Cookie、不改请求头）；
 *   3. 把结果回传。连接参数（地址 + 令牌）在插件弹窗里设置。
 */

const DEFAULTS = { bridgeUrl: 'http://127.0.0.1:35911', token: '' };
const POLL_WAIT_MS = 20000;

let running = false;
let lastError = '';
let lastSeenAt = '';

async function settings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return {
    bridgeUrl: String(stored.bridgeUrl || DEFAULTS.bridgeUrl).replace(/\/+$/, ''),
    token: String(stored.token || '')
  };
}

async function activeTabId(explicit) {
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) throw new Error('找不到当前标签页');
  return tab.id;
}

async function runAction(action, params) {
  const p = params || {};
  if (action === 'tabs.list') {
    const tabs = await chrome.tabs.query({});
    return tabs.map((tab) => ({
      id: tab.id,
      title: tab.title || '',
      url: tab.url || '',
      active: Boolean(tab.active),
      windowId: tab.windowId
    }));
  }
  if (action === 'tab.open') {
    const url = String(p.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('只允许打开 http(s) 地址');
    const tab = await chrome.tabs.create({ url, active: true });
    return { id: tab.id, url: tab.url || url };
  }
  if (action === 'tab.close') {
    const id = await activeTabId(Number(p.tabId));
    await chrome.tabs.remove(id);
    return { closed: id };
  }
  if (action === 'page.text') {
    const id = await activeTabId(Number(p.tabId));
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => ({
        title: document.title,
        url: location.href,
        text: (document.body ? document.body.innerText : '').slice(0, 20000)
      })
    });
    return result.result;
  }
  if (action === 'page.click') {
    const id = await activeTabId(Number(p.tabId));
    const selector = String(p.selector || '').trim();
    if (!selector) throw new Error('缺少 CSS 选择器');
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: id },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { ok: false, error: '页面上没有匹配元素：' + sel };
        el.click();
        return { ok: true, tag: el.tagName, text: (el.innerText || '').slice(0, 200) };
      },
      args: [selector]
    });
    if (!result.result || result.result.ok === false) {
      throw new Error((result.result && result.result.error) || '点击失败');
    }
    return result.result;
  }
  if (action === 'page.fill') {
    const id = await activeTabId(Number(p.tabId));
    const selector = String(p.selector || '').trim();
    if (!selector) throw new Error('缺少 CSS 选择器');
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: id },
      func: (sel, value) => {
        const el = document.querySelector(sel);
        if (!el) return { ok: false, error: '页面上没有匹配元素：' + sel };
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, tag: el.tagName };
      },
      args: [selector, String(p.value == null ? '' : p.value)]
    });
    if (!result.result || result.result.ok === false) {
      throw new Error((result.result && result.result.error) || '填写失败');
    }
    return result.result;
  }
  throw new Error('未知浏览器动作：' + action);
}

async function report(bridgeUrl, token, id, payload) {
  await fetch(bridgeUrl + '/result', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bridge-token': token },
    body: JSON.stringify(Object.assign({ id }, payload))
  }).catch(() => {});
}

async function loop() {
  if (running) return;
  running = true;
  while (running) {
    const { bridgeUrl, token } = await settings();
    if (!token) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    try {
      const response = await fetch(
        bridgeUrl + '/poll?token=' + encodeURIComponent(token) + '&wait=' + POLL_WAIT_MS,
        { headers: { 'x-bridge-token': token } }
      );
      if (response.status === 204) continue;
      if (!response.ok) {
        lastError = '桥接返回 ' + response.status;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      const data = await response.json();
      lastSeenAt = new Date().toISOString();
      lastError = '';
      const job = data && data.job;
      if (!job || !job.id) continue;
      try {
        const result = await runAction(job.action, job.params);
        await report(bridgeUrl, token, job.id, { ok: true, data: result });
      } catch (error) {
        await report(bridgeUrl, token, job.id, { ok: false, error: error.message });
      }
    } catch (error) {
      lastError = error.message || '连不上客户端桥接';
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULTS).then((stored) => {
    chrome.storage.local.set({
      bridgeUrl: stored.bridgeUrl || DEFAULTS.bridgeUrl,
      token: stored.token || ''
    });
  });
  void loop();
});

chrome.runtime.onStartup.addListener(() => void loop());

// service worker 被唤醒时也重连；loop 自带重入保护。
void loop();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'status') {
    sendResponse({ running, lastError, lastSeenAt });
    return true;
  }
  if (message && message.type === 'reconnect') {
    running = false;
    void loop();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});