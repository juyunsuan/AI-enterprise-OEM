'use strict';

/**
 * config-store.js
 *
 * 客户端「连哪台平台、在哪干活、能干什么」这部分配置，存在本机 SQLite 里。
 *   settings 表：baseUrl / token / deviceName / workingDir / heartbeatSeconds
 *                / autoStart / permissionPolicy
 *   workspaces 表：source='whitelist' 是用户手填的白名单，
 *                  source='recent' 是实际干过活的目录（带 last_used_at）
 *
 * 与 Agent 自己的配置（模型渠道、技能、数字分身、记忆）分开落表，由 agent/config.js 管理。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const db = require('./db');

/** 同目录下旧版 JSON（改名前的临时过渡格式），只在本机同目录读取。 */
const LEGACY_CONFIG_FILE = path.join(db.DATA_DIR, 'config.json');

const SETTING_KEYS = [
  'baseUrl',
  'apiBasePath',
  'token',
  'deviceName',
  'hostId',
  'workingDir',
  'heartbeatSeconds',
  'autoStart',
  'permissionPolicy',
  'chromeBridgeToken',
  'chromeBridgePort',
  'disabledChromeExtIds',
  // 平台账号会话：连接码只在登录后申请；令牌与主机令牌分开存，退出登录不影响已配对的主机。
  'userToken',
  'userName',
  'userEmail',
  'userAvatar',
  // RPA「AWBotDSH 浏览器」设备：本机是否自动领取并执行平台派发的 Automa 任务。
  'rpaAutoRun'
];

const RECENT_KEEP = 20;

/* ------------------------------------------------------------ 敏感设置加密 */

/** 令牌类设置由主进程注入系统密钥环加密；单测没有 Electron，默认原样存取。 */
const SECRET_KEYS = new Set(['token', 'userToken']);
const PLAIN_CIPHER = {
  active: false,
  encrypt: (value) => value,
  decrypt: (value) => value
};
let secretCipher = PLAIN_CIPHER;

function encodeSecret(key, value) {
  return SECRET_KEYS.has(key) ? secretCipher.encrypt(value) : value;
}

function decodeSecret(key, value) {
  return SECRET_KEYS.has(key) ? secretCipher.decrypt(value) : value;
}

/** 明文旧值就地升级为密文：只在加密可用时执行一次。 */
function migrateSecrets() {
  if (!secretCipher.active) return;
  SECRET_KEYS.forEach((key) => {
    const raw = db.getSetting(key, '');
    if (typeof raw === 'string' && raw && !raw.startsWith('enc:')) {
      db.setSetting(key, secretCipher.encrypt(raw));
    }
  });
}

function setSecretCipher(cipher) {
  secretCipher = cipher && cipher.active ? cipher : PLAIN_CIPHER;
  migrateSecrets();
}

const DEFAULTS = {
  // Platform base URL. Prefilled only — always fully editable by the user.
  baseUrl: 'http://127.0.0.1:1690',
  // 平台通道前缀：AWBotDSH 走独立通道；找不到时 platform-client 会回退旧 /api/public/bot-host。
  apiBasePath: '/api/public/awbotdsh',
  // Token is only written after a successful pair.
  token: '',
  // Friendly device name shown in the UI.
  deviceName: os.hostname() || 'AWBotDSH Host',
  // 平台主机 ID：扫码配对时写进二维码，手机据此同时绑定这台电脑。
  hostId: 0,
  // 默认工作区：Agent 缺省在这里干活。
  workingDir: path.join(os.homedir(), 'AWBotDSH', 'Workspace'),
  // Heartbeat interval in seconds.
  heartbeatSeconds: 5,
  // Whether to open at login. Defaults false until paired.
  autoStart: false,
  // 本地工具权限档：deny（只读）/ allow-edits（限工作区内写）/ allow-all（放开命令）。
  // 默认全开，用户可以在「工作区与权限」里按需下调。
  permissionPolicy: 'allow-all',
  // Chrome 桥接：只监听 127.0.0.1；令牌首次启动自动生成，插件侧要填同一串。
  chromeBridgeToken: '',
  chromeBridgePort: 35911,
  // 内置 Chrome 扩展的禁用清单（按目录 id）；默认三者全开。
  disabledChromeExtIds: [],
  // 平台账号会话（登录平台后由 /bot-host/login 换回，30 天有效）。
  userToken: '',
  userName: '',
  userEmail: '',
  userAvatar: '',
  // 默认开：任务本来就是用户在这台主机上选定后才建的，到点不跑等于没交付。
  rpaAutoRun: true
};
function stripSlash(value) {
  return typeof value === 'string' ? value.trim().replace(/[\\/]+$/, '') : '';
}

function cleanPathList(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const p = stripSlash(item);
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 100) break;
  }
  return out;
}

/* ------------------------------------------------------- 老 JSON 一次性导入 */

function readLegacyJson() {
  const file = LEGACY_CONFIG_FILE;
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('[config-store] legacy config unreadable:', file, err.message);
  }
  return null;
}

function replaceRows(source, rows) {
  const stmt = db.db().prepare("DELETE FROM workspaces WHERE source = ?");
  stmt.run(source);
  const insert = db
    .db()
    .prepare('INSERT OR REPLACE INTO workspaces (path_key, path, source, last_used_at) VALUES (?, ?, ?, ?)');
  rows.forEach((row) => insert.run(row.path.toLowerCase(), row.path, source, row.lastUsedAt || null));
}

/** 只在库里还没有任何配置时迁移一次：标量进 settings，目录进 workspaces。 */
function migrateLegacyOnce() {
  if (db.hasSetting('baseUrl')) return;

  const raw = readLegacyJson();
  if (raw && typeof raw === 'object') {
    SETTING_KEYS.forEach((key) => {
      if (raw[key] !== undefined) db.setSetting(key, raw[key]);
    });

    // 老版本白名单是 { workbuddy: [], codex: [] }，并成一份，别让用户目录凭空消失。
    const wsRaw = raw.workspaces && typeof raw.workspaces === 'object' ? raw.workspaces : {};
    const white = Array.isArray(raw.workspaces)
      ? raw.workspaces
      : [].concat(
          Array.isArray(wsRaw.workbuddy) ? wsRaw.workbuddy : [],
          Array.isArray(wsRaw.codex) ? wsRaw.codex : []
        );
    replaceRows(
      'whitelist',
      cleanPathList(white).map((p) => ({ path: p }))
    );

    const recent = (Array.isArray(raw.recentWorkspaces) ? raw.recentWorkspaces : [])
      .map((row) => {
        const p = row && stripSlash(row.path);
        return p ? { path: p, lastUsedAt: row.lastUsedAt ? String(row.lastUsedAt) : new Date().toISOString() } : null;
      })
      .filter(Boolean);
    replaceRows('recent', recent.slice(0, RECENT_KEEP));
  }

  // 补齐缺省值：只写没有的键，不覆盖用户已改过的。
  SETTING_KEYS.forEach((key) => {
    if (!db.hasSetting(key)) db.setSetting(key, DEFAULTS[key]);
  });
}

/* --------------------------------------------------------------- 读数与写数 */

function readWorkspaceRows() {
  const rows = db.db().prepare('SELECT path, source, last_used_at FROM workspaces').all();
  const whitelist = [];
  const recent = [];
  for (const row of rows) {
    if (row.source === 'whitelist') whitelist.push(row.path);
    else if (row.source === 'recent') {
      recent.push({
        path: row.path,
        lastUsedAt: row.last_used_at || new Date().toISOString()
      });
    }
  }
  recent.sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)));
  return { whitelist, recent: recent.slice(0, RECENT_KEEP) };
}

function normalize(raw) {
  const cfg = Object.assign({}, DEFAULTS, raw || {});

  if (typeof cfg.baseUrl !== 'string' || !cfg.baseUrl.trim()) {
    cfg.baseUrl = DEFAULTS.baseUrl;
  }
  // Tolerate a user typing the URL without a scheme.
  cfg.baseUrl = cfg.baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(cfg.baseUrl)) {
    cfg.baseUrl = 'http://' + cfg.baseUrl;
  }

  cfg.token = typeof cfg.token === 'string' ? cfg.token.trim() : '';
  cfg.apiBasePath =
    typeof cfg.apiBasePath === 'string' && cfg.apiBasePath.trim()
      ? '/' + cfg.apiBasePath.trim().replace(/^\/+|\/+$/g, '')
      : DEFAULTS.apiBasePath;
  cfg.deviceName =
    typeof cfg.deviceName === 'string' && cfg.deviceName.trim()
      ? cfg.deviceName.trim()
      : DEFAULTS.deviceName;
  cfg.hostId = Number(cfg.hostId) || 0;

  cfg.workingDir = stripSlash(cfg.workingDir) || DEFAULTS.workingDir;

  const hb = Number(cfg.heartbeatSeconds);
  cfg.heartbeatSeconds = Number.isFinite(hb) && hb >= 1 ? Math.floor(hb) : DEFAULTS.heartbeatSeconds;

  cfg.autoStart = !!cfg.autoStart;

  cfg.permissionPolicy = ['deny', 'allow-edits', 'allow-all'].includes(cfg.permissionPolicy)
    ? cfg.permissionPolicy
    : DEFAULTS.permissionPolicy;

  cfg.chromeBridgeToken =
    typeof cfg.chromeBridgeToken === 'string' ? cfg.chromeBridgeToken.trim().slice(0, 64) : '';
  const bridgePort = Number(cfg.chromeBridgePort);
  cfg.chromeBridgePort =
    Number.isInteger(bridgePort) && bridgePort >= 1024 && bridgePort <= 65535
      ? bridgePort
      : DEFAULTS.chromeBridgePort;

  cfg.disabledChromeExtIds = Array.from(
    new Set(
      (Array.isArray(cfg.disabledChromeExtIds) ? cfg.disabledChromeExtIds : [])
        .filter((id) => typeof id === 'string' && id.trim())
        .map((id) => id.trim().slice(0, 80))
    )
  ).slice(0, 100);

  cfg.userToken = typeof cfg.userToken === 'string' ? cfg.userToken.trim() : '';
  cfg.userName = typeof cfg.userName === 'string' ? cfg.userName.trim().slice(0, 64) : '';
  cfg.userEmail = typeof cfg.userEmail === 'string' ? cfg.userEmail.trim().slice(0, 160) : '';
  cfg.userAvatar = typeof cfg.userAvatar === 'string' ? cfg.userAvatar.trim().slice(0, 512) : '';

  cfg.workspaces = cleanPathList(cfg.workspaces);
  cfg.recentWorkspaces = Array.isArray(cfg.recentWorkspaces) ? cfg.recentWorkspaces : [];
  return cfg;
}

let cached = null;

function load() {
  if (cached) return cached;
  migrateLegacyOnce();
  const raw = {};
  SETTING_KEYS.forEach((key) => {
    raw[key] = decodeSecret(key, db.getSetting(key, DEFAULTS[key]));
  });
  const rows = readWorkspaceRows();
  raw.workspaces = rows.whitelist;
  raw.recentWorkspaces = rows.recent;
  cached = normalize(raw);
  return cached;
}

function save(partial) {
  const merged = normalize(Object.assign({}, load(), partial || {}));
  const patch = partial || {};
  db.tx(() => {
    SETTING_KEYS.forEach((key) => {
      if (key in patch) db.setSetting(key, encodeSecret(key, merged[key]));
    });
    if ('workspaces' in patch) {
      replaceRows(
        'whitelist',
        merged.workspaces.map((p) => ({ path: p }))
      );
    }
    if ('recentWorkspaces' in patch) {
      replaceRows(
        'recent',
        merged.recentWorkspaces.slice(0, RECENT_KEEP).map((row) => ({
          path: row.path,
          lastUsedAt: row.lastUsedAt
        }))
      );
    }
  })();
  cached = null;
  return load();
}

function get() {
  return Object.assign({}, load());
}

function isPaired() {
  const cfg = load();
  return !!(cfg.token && isHostToken(cfg.token));
}

/** 新令牌是 bot_，更名前配对过的老客户端是 wb_，两种都认。 */
function isHostToken(value) {
  const text = String(value || '');
  return text.indexOf('bot_') === 0 || text.indexOf('wb_') === 0;
}

function clearToken() {
  return save({ token: '' });
}

/** 退出平台账号：清会话与昵称，不动已配对的主机令牌。 */
function clearUser() {
  return save({ userToken: '', userName: '', userEmail: '', userAvatar: '', hostId: 0 });
}

function isLoggedIn() {
  return !!load().userToken;
}

module.exports = {
  DATA_DIR: db.DATA_DIR,
  DB_FILE: db.DB_FILE,
  LEGACY_CONFIG_FILE,
  DEFAULTS,
  RECENT_KEEP,
  setSecretCipher,
  load,
  get,
  save,
  isPaired,
  isHostToken,
  isLoggedIn,
  clearToken,
  clearUser
};
