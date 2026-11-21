'use strict';

/** 弹窗：保存桥接地址与令牌，并显示后台脚本的连接状态。 */

const DEFAULTS = { bridgeUrl: 'http://127.0.0.1:35911', token: '' };

function $(id) {
  return document.getElementById(id);
}

function paint(status) {
  const box = $('state');
  if (!status) {
    box.textContent = '后台脚本未响应';
    box.className = 'bad';
    return;
  }
  if (status.lastError) {
    box.textContent = status.lastError;
    box.className = 'bad';
    return;
  }
  box.textContent = status.lastSeenAt ? '已连接（' + new Date(status.lastSeenAt).toLocaleTimeString() + '）' : '等待客户端桥接';
  box.className = status.lastSeenAt ? 'ok' : '';
}

async function refresh() {
  chrome.runtime.sendMessage({ type: 'status' }, (status) => paint(status));
}

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(DEFAULTS);
  $('url').value = stored.bridgeUrl;
  $('token').value = stored.token;
  refresh();
  setInterval(refresh, 3000);
});

$('save').addEventListener('click', async () => {
  const bridgeUrl = $('url').value.trim().replace(/\/+$/, '') || DEFAULTS.bridgeUrl;
  const token = $('token').value.trim();
  if (!token) {
    paint({ lastError: '请先粘贴桥接令牌' });
    return;
  }
  await chrome.storage.local.set({ bridgeUrl, token });
  chrome.runtime.sendMessage({ type: 'reconnect' });
  setTimeout(refresh, 800);
});