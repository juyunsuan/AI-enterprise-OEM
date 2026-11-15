'use strict';

/** 指纹窗口服务层：档案、内核、窗口、代理检测的统一入口（IPC 与 Agent 共用）。 */

const db = require('../db');
const kernels = require('./kernels');
const profiles = require('./profiles');
const launch = require('./launch');
const fingerprint = require('./fingerprint');
const relay = require('./proxy-relay');

function view(profile) {
  return profile ? { ...profile, hints: fingerprint.consistency(profile) } : null;
}

function state() {
  return {
    list: profiles.list().map(view),
    count: profiles.count(),
    limit: profiles.MAX_PROFILES,
    openLimit: launch.maxOpen(),
    open: launch.listOpen(),
    agentProfileId: profiles.agentProfileId(),
    kernels: kernels.list().map((row) => ({
      version: row.version,
      installedAt: row.installedAt,
      source: row.source
    }))
  };
}

function create(body) {
  return { profile: view(profiles.create(body || {})) };
}

function update(id, body) {
  return { profile: view(profiles.update(id, body || {})) };
}

function remove(id) {
  launch.close(id);
  return profiles.remove(id);
}

function duplicate(id) {
  return { profile: view(profiles.duplicate(id)) };
}

async function open(id) {
  return launch.open(id);
}

async function close(id) {
  return launch.close(id);
}

async function closeAll() {
  return launch.closeAll();
}

async function pages() {
  return { list: await launch.pages() };
}

function normalizeProxy(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const mode = raw.mode === 'proxy' ? 'proxy' : 'direct';
  if (mode === 'direct') {
    return { mode, type: '', host: '', port: 0, authMode: 'password', user: '', password: '' };
  }
  const type = ['http', 'https', 'socks5'].includes(raw.type) ? raw.type : 'http';
  const host = String(raw.host || '').trim().slice(0, 200);
  const port = Number(raw.port);
  if (!host) throw new Error('代理地址不能为空');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('代理端口必须是 1–65535');
  return {
    mode: 'proxy',
    type,
    host,
    port,
    authMode: raw.authMode === 'whitelist' ? 'whitelist' : 'password',
    user: String(raw.user || '').trim().slice(0, 200),
    password: typeof raw.password === 'string' ? raw.password.slice(0, 500) : ''
  };
}

/** 用档案/表单的代理配置探测出口 IP；不改动已保存的代理凭据。 */
async function checkProxy(body) {
  const input = body && typeof body === 'object' ? body : {};
  const checkUrl = String(db.getSetting('fp.ipCheckUrl', 'https://api.ipify.org?format=json') || '');
  let config;
  if (input.profileId) {
    const stored = profiles.proxyCredentials(input.profileId);
    if (!stored) throw new Error('指纹窗口不存在');
    if (input.proxy) {
      const next = normalizeProxy(input.proxy);
      if (next.mode === 'proxy' && !next.password && stored.user === next.user) {
        next.password = stored.password;
      }
      config = next;
    } else {
      config = stored;
    }
  } else {
    config = normalizeProxy(input.proxy);
  }
  const result = await relay.probeExitIp(config, checkUrl);
  if (input.profileId) profiles.markChecked(input.profileId, result.ip);
  return result;
}

function setAgentProfile(id) {
  return profiles.setAgentProfile(id);
}

function setMaxOpen(value) {
  return { openLimit: launch.setMaxOpen(value) };
}

function setIpCheckUrl(value) {
  const url = String(value || '').trim();
  if (url && !/^https?:\/\//i.test(url)) throw new Error('检测地址必须是 http(s) 开头');
  db.setSetting('fp.ipCheckUrl', url || 'https://api.ipify.org?format=json');
  return { ipCheckUrl: db.getSetting('fp.ipCheckUrl', '') };
}

function ipCheckUrl() {
  return String(db.getSetting('fp.ipCheckUrl', 'https://api.ipify.org?format=json') || '');
}

module.exports = {
  state,
  create,
  update,
  remove,
  duplicate,
  open,
  close,
  closeAll,
  pages,
  checkProxy,
  setAgentProfile,
  setMaxOpen,
  setIpCheckUrl,
  ipCheckUrl,
  kernels,
  profiles
};