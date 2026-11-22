'use strict';

/**
 * AWBotDSH 浏览器桥接：后台脚本。
 *
 * 同一份扩展同时服务「AWBotDSH 内置指纹浏览器」与「本机 Chrome 兜底」：
 * 内置浏览器走 /bootstrap 自助取令牌；本机 Chrome 的扩展 ID 不同，需在弹窗手填令牌。
 * 页面动作只做确定性步骤（查找 / 读写 / 点击 / 按键 / 等待），不 eval、不读凭据。
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

/**
 * 注入到目标页的步骤执行器。DSH 内置浏览器通过 CDP 复用的同口径逻辑在
 * awbotdsh-browser/src/webchat/step.ts，改动时两边一起改。
 */
async function stepRunner(step) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clip = (value, max) => String(value == null ? '' : value).slice(0, max);
  const visible = (el) => Boolean(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const textOf = (el) => clip(el.innerText != null ? el.innerText : el.textContent, 20000).replace(/\s+/g, ' ').trim();

  const matchOne = (selectors) => {
    for (const selector of selectors || []) {
      try {
        const el = document.querySelector(selector);
        if (el) return { el, selector };
      } catch (_) { /* 非法选择器跳过 */ }
    }
    return null;
  };
  const matchAll = (selectors) => {
    const seen = new Set();
    const out = [];
    for (const selector of selectors || []) {
      try {
        for (const el of document.querySelectorAll(selector)) {
          if (seen.has(el)) continue;
          seen.add(el);
          out.push(el);
        }
      } catch (_) { /* 非法选择器跳过 */ }
    }
    // 推荐追问 / 猜你想问这类 chips 不是答案本体，直接排除。
    const noise = '[class*="recommend"],[class*="suggestion"],[class*="suggest"],[class*="guess"],[class*="chip"]';
    return out.filter((el) => {
      try { return !(el.closest && el.closest(noise)); } catch (_) { return true; }
    });
  };
  const setNative = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
  };
  const fireInput = (el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const fill = (el, value) => {
    try { el.focus(); } catch (_) { /* 忽略 */ }
    if (el.isContentEditable) {
      // Lexical / ProseMirror 只认原生输入：全选后走 insertText，失败再退回 beforeinput。
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, value); } catch (_) { /* 退回 */ }
      if (!inserted) {
        try {
          el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
        } catch (_) { /* 老内核 */ }
        el.textContent = value;
      }
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      } catch (_) { fireInput(el); }
    } else {
      setNative(el, value);
      fireInput(el);
    }
  };
  const click = (el) => {
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) { /* 忽略 */ }
    try { el.focus && el.focus(); } catch (_) { /* 忽略 */ }
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch (_) { /* 忽略 */ }
    }
    try { el.click && el.click(); } catch (_) { /* 忽略 */ }
  };
  const press = (el, key, options) => {
    const target = el || document.activeElement || document.body;
    const init = Object.assign({ key, bubbles: true, cancelable: true, code: key === 'Enter' ? 'Enter' : undefined }, options || {});
    for (const type of ['keydown', 'keypress', 'keyup']) {
      try { target.dispatchEvent(new KeyboardEvent(type, init)); } catch (_) { /* 忽略 */ }
    }
  };

  const op = String(step && step.op);
  if (op === 'scroll') {
    const up = String(step.direction || '').toLowerCase() === 'up';
    window.scrollBy({ top: (up ? -1 : 1) * Math.round(window.innerHeight * 0.9), behavior: 'instant' });
    return { ok: true, matched: true };
  }
  if (op === 'count') {
    return { ok: true, count: matchAll(step.selectors).length };
  }
  if (op === 'read') {
    const nodes = matchAll(step.selectors);
    const values = nodes.map(textOf).filter(Boolean);
    const mode = String(step.mode || 'last');
    if (mode === 'count') return { ok: true, count: nodes.length, values };
    if (mode === 'all') return { ok: true, values, count: nodes.length };
    if (mode === 'attribute') {
      const attr = String(step.attribute || 'value');
      const first = nodes[0];
      let value = '';
      if (first) {
        value = first[attr] == null ? String(first.getAttribute ? first.getAttribute(attr) || '' : '') : String(first[attr]);
      }
      return { ok: true, value: value.slice(0, 20000), count: nodes.length };
    }
    if (mode === 'longest') {
      const longest = values.reduce((best, item) => (item.length > (best || '').length ? item : best), '');
      return { ok: true, value: longest, values, count: nodes.length };
    }
    return { ok: true, value: values.length ? values[values.length - 1] : '', values, count: nodes.length };
  }
  if (op === 'wait') {
    const timeoutMs = Math.min(20000, Math.max(500, Number(step.timeoutMs) || 10000));
    const startedAt = Date.now();
    for (;;) {
      const nodes = matchAll(step.selectors).filter((el) => (step.visible ? visible(el) : true));
      const hit = step.gone ? nodes.length === 0 : nodes.length > 0;
      if (hit) return { ok: true, matched: true, elapsedMs: Date.now() - startedAt, count: nodes.length };
      if (Date.now() - startedAt >= timeoutMs) {
        return { ok: false, matched: false, elapsedMs: Date.now() - startedAt, error: '等待超时' };
      }
      await sleep(250);
    }
  }
  if (op === 'press') {
    const wanted = step.selectors && step.selectors.length ? matchOne(step.selectors) : null;
    press(wanted ? wanted.el : null, String(step.key || 'Enter'), step.options || {});
    return { ok: true, matched: Boolean(wanted) || !(step.selectors || []).length, tag: wanted ? wanted.el.tagName : '' };
  }

  const found = matchOne(step.selectors);
  if (!found) {
    return { ok: false, matched: false, error: '页面没有匹配元素：' + (step.selectors || []).join(' | ') };
  }
  if (op === 'focus') {
    try { found.el.focus(); } catch (_) { /* 忽略 */ }
    return { ok: true, matched: true, tag: found.el.tagName };
  }
  if (op === 'fill') {
    fill(found.el, String(step.value == null ? '' : step.value));
    return { ok: true, matched: true, tag: found.el.tagName, contentEditable: Boolean(found.el.isContentEditable) };
  }
  if (op === 'click') {
    click(found.el);
    return { ok: true, matched: true, tag: found.el.tagName, text: textOf(found.el).slice(0, 200) };
  }
  return { ok: false, matched: false, error: '不支持的动作：' + op };
}
async function runStep(tabId, step) {
  const id = await activeTabId(Number(tabId));
  await chrome.tabs.update(id, { active: true }).catch(() => undefined);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: id },
    func: stepRunner,
    args: [step]
  });
  const value = result && result.result;
  if (!value) throw new Error('页面没有返回结果');
  return value;
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
  if (action === 'tab.activate') {
    const id = await activeTabId(Number(p.tabId));
    const tab = await chrome.tabs.update(id, { active: true });
    if (tab && tab.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
    return { active: id };
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
  if (action === 'page.step') {
    const value = await runStep(p.tabId, p.step || p);
    if (value.ok === false && value.error) throw new Error(value.error);
    return value;
  }
  if (action === 'page.read') {
    return runStep(p.tabId, { op: 'read', selectors: p.selectors || [p.selector], mode: p.mode || 'last' });
  }
  if (action === 'page.wait') {
    const value = await runStep(p.tabId, {
      op: 'wait',
      selectors: p.selectors || [p.selector],
      gone: Boolean(p.gone),
      visible: Boolean(p.visible),
      timeoutMs: p.timeoutMs
    });
    if (!value.ok) throw new Error(value.error || '等待超时');
    return value;
  }
  if (action === 'page.press') {
    return runStep(p.tabId, {
      op: 'press',
      selectors: p.selectors || (p.selector ? [p.selector] : []),
      key: p.key || 'Enter',
      options: p.options || {}
    });
  }
  if (action === 'page.click') {
    return runStep(p.tabId, { op: 'click', selectors: p.selectors || [p.selector] });
  }
  if (action === 'page.fill') {
    return runStep(p.tabId, {
      op: 'fill',
      selectors: p.selectors || [p.selector],
      value: String(p.value == null ? '' : p.value)
    });
  }
  if (action === 'page.focus') {
    return runStep(p.tabId, { op: 'focus', selectors: p.selectors || [p.selector] });
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

/** 预装扩展自助取令牌：客户端只认内置副本的 Origin，无需用户手填。 */
async function bootstrapToken(bridgeUrl) {
  try {
    const response = await fetch(bridgeUrl + '/bootstrap', { cache: 'no-store' });
    if (!response.ok) return '';
    const data = await response.json();
    if (!data || !data.ok || !data.token) return '';
    await chrome.storage.local.set({
      bridgeUrl: String(data.bridgeUrl || bridgeUrl).replace(/\/+$/, ''),
      token: String(data.token)
    });
    return String(data.token);
  } catch (error) {
    return '';
  }
}

async function loop() {
  if (running) return;
  running = true;
  while (running) {
    let { bridgeUrl, token } = await settings();
    if (!token) {
      token = await bootstrapToken(bridgeUrl);
      if (!token) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
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
