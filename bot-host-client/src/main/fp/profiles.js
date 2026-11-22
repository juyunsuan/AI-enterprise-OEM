'use strict';

/**
 * 指纹档案：本机 SQLite 里的 fp_profiles 表。
 *
 *   · 最多 100 个档案（存储上限）；
 *   · seed 决定内核生成的一整套指纹，跨重启稳定；
 *   · 代理密码用本机密钥（~/.awbotdsh/fp-secret.key）AES-256-GCM 加密，
 *     视图只回 hasPassword，明文只在启动内核/转发代理时短暂使用。
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');

const MAX_PROFILES = 100;
const PLATFORMS = ['win', 'mac', 'linux'];
const CANVAS_MODES = ['off', 'light', 'strict'];
const AUDIO_MODES = ['off', 'light', 'strict'];
const WEBRTC_MODES = ['proxy', 'disable', 'real'];
const PROXY_TYPES = ['http', 'https', 'socks5'];
const AUTH_MODES = ['password', 'whitelist'];

function nowIso() {
  return new Date().toISOString();
}

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseJson(raw, fallback) {
  try {
    const value = JSON.parse(raw || '');
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

function secretKey() {
  const file = path.join(db.DATA_DIR, 'fp-secret.key');
  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(db.DATA_DIR, { recursive: true });
      fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    }
    return crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').trim()).digest();
  } catch (error) {
    throw new Error('指纹档案加密密钥不可用：' + error.message);
  }
}

function encrypt(plain) {
  const text = String(plain || '');
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64')).join(':');
}

function decrypt(payload) {
  const text = String(payload || '');
  if (!text) return '';
  try {
    const [iv, tag, body] = text.split(':').map((part) => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function languagesOf(raw) {
  const list = Array.isArray(raw) ? raw : parseJson(raw, []);
  const out = [];
  for (const item of list) {
    const value = str(item, 20);
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)) continue;
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= 8) break;
  }
  return out;
}

function proxyOf(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const mode = input.mode === 'proxy' ? 'proxy' : 'direct';
  if (mode === 'direct') {
    return { mode, type: '', host: '', port: 0, authMode: 'password', user: '', password: '' };
  }
  const type = PROXY_TYPES.includes(input.type) ? input.type : 'http';
  const host = str(input.host, 200);
  const port = clampInt(input.port, 1, 65535, 0);
  if (!host) throw new Error('代理地址不能为空');
  if (!/^[A-Za-z0-9._:[\]-]+$/.test(host)) throw new Error('代理地址只支持主机名或 IP');
  if (!port) throw new Error('代理端口必须是 1–65535');
  return {
    mode,
    type,
    host,
    port,
    authMode: AUTH_MODES.includes(input.authMode) ? input.authMode : 'password',
    user: str(input.user, 200),
    password: typeof input.password === 'string' ? input.password.slice(0, 500) : undefined
  };
}

function validate(input) {
  const name = str(input && input.name, 60);
  if (!name) throw new Error('请填写窗口名称');
  const seedRaw = Number(input && input.seed);
  const seed =
    Number.isInteger(seedRaw) && seedRaw > 0 && seedRaw <= 2147483647
      ? String(seedRaw)
      : String(crypto.randomInt(1, 2147483647));
  const platform = PLATFORMS.includes(input && input.platform) ? input.platform : 'win';
  const canvasNoise = CANVAS_MODES.includes(input && input.canvasNoise) ? input.canvasNoise : 'off';
  const audioNoise = AUDIO_MODES.includes(input && input.audioNoise) ? input.audioNoise : 'off';
  const webrtcMode = WEBRTC_MODES.includes(input && input.webrtcMode) ? input.webrtcMode : 'proxy';
  const hardwareConcurrency = clampInt(input && input.hardwareConcurrency, 0, 64, 0);
  const timezone = str(input && input.timezone, 64);
  const languages = languagesOf(input && input.languages);
  const proxy = proxyOf(input && input.proxy);
  const kernelVersion = str(input && input.kernelVersion, 64);
  const groupName = str(input && input.groupName, 40);
  const extensionIds = Array.isArray(input && input.extensionIds)
    ? input.extensionIds
        .map((id) => str(id, 64))
        .filter((id) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id))
        .slice(0, 50)
    : [];
  return { name, seed, platform, canvasNoise, audioNoise, webrtcMode, hardwareConcurrency, timezone, languages, proxy, kernelVersion, groupName, extensionIds };
}

function toView(row) {
  return {
    id: row.id,
    name: row.name,
    groupName: row.group_name,
    seed: row.seed,
    kernelVersion: row.kernel_version,
    platform: row.platform,
    timezone: row.timezone,
    languages: parseJson(row.languages_json, []),
    canvasNoise: row.canvas_noise,
    audioNoise: row.audio_noise,
    webrtcMode: row.webrtc_mode,
    hardwareConcurrency: row.hardware_concurrency,
    proxy: {
      mode: row.proxy_mode,
      type: row.proxy_type,
      host: row.proxy_host,
      port: row.proxy_port,
      authMode: row.proxy_auth_mode,
      user: row.proxy_user,
      hasPassword: !!row.proxy_password_cipher
    },
    extensionIds: parseJson(row.extension_ids_json, []),
    lastOpenAt: row.last_open_at,
    lastIp: row.last_ip,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function count() {
  return db.open().prepare('SELECT COUNT(*) AS n FROM fp_profiles').get().n;
}

function list() {
  return db
    .open()
    .prepare('SELECT * FROM fp_profiles ORDER BY updated_at DESC')
    .all()
    .map(toView);
}

function get(id) {
  const row = db.open().prepare('SELECT * FROM fp_profiles WHERE id = ?').get(String(id || ''));
  return row ? toView(row) : null;
}

function create(input) {
  if (count() >= MAX_PROFILES) {
    throw new Error('最多只能创建 ' + MAX_PROFILES + ' 个指纹窗口，请先删除不用的');
  }
  const v = validate(input || {});
  const id = 'fp' + crypto.randomBytes(6).toString('hex');
  const at = nowIso();
  db.open()
    .prepare(
      `INSERT INTO fp_profiles (
         id, name, group_name, seed, kernel_version, platform, timezone, languages_json,
         canvas_noise, audio_noise, webrtc_mode, hardware_concurrency,
         proxy_mode, proxy_type, proxy_host, proxy_port, proxy_auth_mode, proxy_user,
         proxy_password_cipher, extension_ids_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      v.name,
      v.groupName,
      v.seed,
      v.kernelVersion,
      v.platform,
      v.timezone,
      JSON.stringify(v.languages),
      v.canvasNoise,
      v.audioNoise,
      v.webrtcMode,
      v.hardwareConcurrency,
      v.proxy.mode,
      v.proxy.type,
      v.proxy.host,
      v.proxy.port,
      v.proxy.authMode,
      v.proxy.user,
      typeof v.proxy.password === 'string' && v.proxy.password ? encrypt(v.proxy.password) : '',
      JSON.stringify(v.extensionIds),
      at,
      at
    );
  return get(id);
}

function update(id, input) {
  const current = db.open().prepare('SELECT * FROM fp_profiles WHERE id = ?').get(String(id || ''));
  if (!current) throw new Error('指纹窗口不存在');
  const merged = {
    name: input && input.name !== undefined ? input.name : current.name,
    seed: input && input.seed !== undefined ? input.seed : current.seed,
    platform: input && input.platform !== undefined ? input.platform : current.platform,
    canvasNoise: input && input.canvasNoise !== undefined ? input.canvasNoise : current.canvas_noise,
    audioNoise: input && input.audioNoise !== undefined ? input.audioNoise : current.audio_noise,
    webrtcMode: input && input.webrtcMode !== undefined ? input.webrtcMode : current.webrtc_mode,
    hardwareConcurrency:
      input && input.hardwareConcurrency !== undefined ? input.hardwareConcurrency : current.hardware_concurrency,
    timezone: input && input.timezone !== undefined ? input.timezone : current.timezone,
    languages: input && input.languages !== undefined ? input.languages : parseJson(current.languages_json, []),
    kernelVersion: input && input.kernelVersion !== undefined ? input.kernelVersion : current.kernel_version,
    groupName: input && input.groupName !== undefined ? input.groupName : current.group_name,
    extensionIds:
      input && input.extensionIds !== undefined ? input.extensionIds : parseJson(current.extension_ids_json, []),
    proxy:
      input && input.proxy !== undefined
        ? input.proxy
        : {
            mode: current.proxy_mode,
            type: current.proxy_type,
            host: current.proxy_host,
            port: current.proxy_port,
            authMode: current.proxy_auth_mode,
            user: current.proxy_user,
            password: undefined
          }
  };
  const v = validate(merged);
  // 密码留空＝沿用已保存的密文（界面不回显密码，清空不等于删除）。
  const cipher =
    typeof v.proxy.password === 'string' && v.proxy.password
      ? encrypt(v.proxy.password)
      : v.proxy.mode === 'proxy'
        ? current.proxy_password_cipher
        : '';
  db.open()
    .prepare(
      `UPDATE fp_profiles SET
         name = ?, group_name = ?, seed = ?, kernel_version = ?, platform = ?, timezone = ?,
         languages_json = ?, canvas_noise = ?, audio_noise = ?, webrtc_mode = ?,
         hardware_concurrency = ?, proxy_mode = ?, proxy_type = ?, proxy_host = ?,
         proxy_port = ?, proxy_auth_mode = ?, proxy_user = ?, proxy_password_cipher = ?,
         extension_ids_json = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      v.name,
      v.groupName,
      v.seed,
      v.kernelVersion,
      v.platform,
      v.timezone,
      JSON.stringify(v.languages),
      v.canvasNoise,
      v.audioNoise,
      v.webrtcMode,
      v.hardwareConcurrency,
      v.proxy.mode,
      v.proxy.type,
      v.proxy.host,
      v.proxy.port,
      v.proxy.authMode,
      v.proxy.user,
      cipher,
      JSON.stringify(v.extensionIds),
      nowIso(),
      String(id)
    );
  return get(id);
}

function duplicate(id) {
  const source = get(id);
  if (!source) throw new Error('指纹窗口不存在');
  const copy = create({
    ...source,
    name: source.name + ' 副本',
    seed: undefined,
    proxy: { ...source.proxy, password: undefined },
    extensionIds: source.extensionIds
  });
  // 代理密码密文直接复用本机密钥，无需解密；副本否则会丢代理凭据。
  const row = db.open().prepare('SELECT proxy_password_cipher FROM fp_profiles WHERE id = ?').get(String(id));
  if (row && row.proxy_password_cipher) {
    db.open()
      .prepare('UPDATE fp_profiles SET proxy_password_cipher = ? WHERE id = ?')
      .run(row.proxy_password_cipher, copy.id);
  }
  return get(copy.id);
}

/** 删除档案：先由调用方关闭窗口，再删库并清掉本机 user-data-dir（Cookie/存储）。 */
function remove(id) {
  const key = String(id || '');
  if (!/^fp[A-Za-z0-9]+$/.test(key)) return { ok: false, error: '指纹窗口不存在' };
  const info = db.open().prepare('DELETE FROM fp_profiles WHERE id = ?').run(key);
  if (!info.changes) return { ok: false, error: '指纹窗口不存在' };
  try {
    fs.rmSync(path.join(db.DATA_DIR, 'fp-profiles', key), { recursive: true, force: true });
  } catch {
    /* 目录可能仍被内核占用，留待下次删除；档案本身已移除 */
  }
  if (agentProfileId() === key) db.setSetting('fp.agentProfileId', '');
  return { ok: true };
}

/** 启动内核时取真实代理凭据（仅主进程内部使用，不经过 IPC）。 */
function proxyCredentials(id) {
  const row = db.open().prepare('SELECT * FROM fp_profiles WHERE id = ?').get(String(id || ''));
  if (!row) return null;
  return {
    mode: row.proxy_mode,
    type: row.proxy_type,
    host: row.proxy_host,
    port: row.proxy_port,
    authMode: row.proxy_auth_mode,
    user: row.proxy_user,
    password: decrypt(row.proxy_password_cipher)
  };
}

function markOpened(id, ip) {
  const at = nowIso();
  db.open()
    .prepare('UPDATE fp_profiles SET last_open_at = ?, last_ip = ?, updated_at = ? WHERE id = ?')
    .run(at, str(ip, 64), at, String(id));
}

function markChecked(id, ip) {
  db.open()
    .prepare('UPDATE fp_profiles SET last_ip = ?, updated_at = ? WHERE id = ?')
    .run(str(ip, 64), nowIso(), String(id));
}

function agentProfileId() {
  return str(db.getSetting('fp.agentProfileId', ''), 64);
}

function setAgentProfile(id) {
  const key = str(id, 64);
  if (key && !get(key)) throw new Error('指定的 Agent 默认窗口不存在');
  db.setSetting('fp.agentProfileId', key);
  return { ok: true, agentProfileId: key };
}

/** 取 Agent 默认档案：显式设置优先，其次最近使用，最后最早创建。 */
function agentProfile() {
  const explicit = agentProfileId();
  if (explicit) {
    const row = get(explicit);
    if (row) return row;
  }
  const rows = list();
  if (!rows.length) return null;
  const opened = rows
    .filter((row) => row.lastOpenAt)
    .sort((a, b) => String(b.lastOpenAt).localeCompare(String(a.lastOpenAt)));
  return opened[0] || rows[rows.length - 1];
}

module.exports = {
  MAX_PROFILES,
  list,
  get,
  create,
  update,
  duplicate,
  remove,
  count,
  proxyCredentials,
  markOpened,
  markChecked,
  agentProfileId,
  setAgentProfile,
  agentProfile,
  encrypt,
  decrypt
};