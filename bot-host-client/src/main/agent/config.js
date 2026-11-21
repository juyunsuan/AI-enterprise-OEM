'use strict';

/**
 * agent/config.js
 *
 * 本机 Agent 的配置与资源，全部落在 SQLite（~/.awbotdsh/botbuddy.db）：
 *   settings    agent.channels / agent.temperature / agent.maxTokens /
 *               agent.enabledSkills / agent.personaId
 *   channels    模型渠道（openai / anthropic，密钥只在本机）
 *   skills      技能（正文按需用 load_skill 取，不进每轮上下文）
 *   personas    数字分身（选中一个，正文进系统提示词）
 *   memories    长期记忆（Agent 用 remember 工具追加，每轮进系统提示词）
 *
 * 与平台侧 Agent 没有任何关系：平台只看得到状态摘要，看不到这里任何内容。
 */

const db = require('../db');

const PROTOCOLS = ['openai', 'anthropic'];
const MEMORY_MAX = 20_000;

const DEFAULT_CHANNEL = {
  id: 'default',
  name: '默认渠道',
  protocol: 'openai',
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat'
};

const DEFAULTS = {
  activeChannelId: 'default',
  temperature: 0.3,
  maxTokens: 4000,
  /** 启用的技能 id；空数组＝全部可用。 */
  enabledSkills: [],
  /** 启用的数字分身 id；空串＝不附加人格提示词。 */
  personaId: ''
};

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function nowIso() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ 渠道 */

function normalizeChannel(raw, index) {
  const row = raw && typeof raw === 'object' ? raw : {};
  const protocol = PROTOCOLS.includes(row.protocol) ? row.protocol : 'openai';
  const id = str(row.id, 40) || 'channel-' + (index + 1);
  return {
    id,
    name: str(row.name, 60) || '渠道 ' + (index + 1),
    protocol,
    baseUrl: str(row.baseUrl, 300).replace(/\/+$/, ''),
    apiKey: typeof row.apiKey === 'string' ? row.apiKey.trim() : '',
    model: str(row.model, 120)
  };
}

/** 第一次启动：插一条默认可用的渠道记录，用户只要补密钥就能用。 */
function seedChannelOnce() {
  const hit = db.db().prepare('SELECT COUNT(*) AS n FROM channels').get();
  if (hit && hit.n > 0) return;
  const ch = DEFAULT_CHANNEL;
  db.db()
    .prepare(
      'INSERT INTO channels (id, name, protocol, base_url, api_key, model, position) VALUES (?, ?, ?, ?, ?, ?, 0)'
    )
    .run(ch.id, ch.name, ch.protocol, ch.baseUrl, ch.apiKey, ch.model);
  db.setSetting('agent.activeChannelId', ch.id);
}

function listChannels() {
  seedChannelOnce();
  return db
    .db()
    .prepare('SELECT id, name, protocol, base_url, api_key, model FROM channels ORDER BY position, id')
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      model: row.model
    }));
}

/** 当前选中的渠道；没有可用渠道时返回 null（Agent 状态即「未配置模型」）。 */
function activeChannel() {
  const list = listChannels();
  const activeId = str(getSetting('agent.activeChannelId', DEFAULTS.activeChannelId), 40);
  const hit = list.find((row) => row.id === activeId) || list[0] || null;
  if (!hit || !hit.baseUrl || !hit.model) return null;
  return Object.assign({}, hit);
}

/**
 * 存一条渠道：带 id 就是改，不带就是新增（自动生成 id）。
 * 返回规范化后的那条，界面立刻能拿它刷新列表而不必重新读库。
 */
function saveChannel(raw) {
  seedChannelOnce();
  const cfg = getConfig();
  const input = raw && typeof raw === 'object' ? raw : {};
  const id = str(input.id, 40);
  const existing = id
    ? db.db().prepare('SELECT id FROM channels WHERE id = ?').get(id)
    : null;
  const nextId = existing ? existing.id : 'ch-' + Date.now().toString(36);
  const position = existing
    ? db.db().prepare('SELECT position FROM channels WHERE id = ?').get(nextId).position
    : Number(db.db().prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM channels').get().pos);
  const row = normalizeChannel(Object.assign({}, input, { id: nextId }), position);

  db.db()
    .prepare(
      `INSERT INTO channels (id, name, protocol, base_url, api_key, model, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, protocol = excluded.protocol, base_url = excluded.base_url,
         api_key = excluded.api_key, model = excluded.model`
    )
    .run(row.id, row.name, row.protocol, row.baseUrl, row.apiKey, row.model, position);

  if (!existing || !str(cfg.activeChannelId, 40)) db.setSetting('agent.activeChannelId', row.id);
  return row;
}

function removeChannel(id) {
  const key = str(id, 40);
  const total = db.db().prepare('SELECT COUNT(*) AS n FROM channels').get().n;
  if (total <= 1) return { ok: false, error: '至少要留一条渠道' };
  const hit = db.db().prepare('SELECT id FROM channels WHERE id = ?').get(key);
  if (!hit) return { ok: false, error: '没有这条渠道' };
  db.db().prepare('DELETE FROM channels WHERE id = ?').run(key);
  const remain = db.db().prepare('SELECT id FROM channels ORDER BY position, id LIMIT 1').get();
  if (str(getSetting('agent.activeChannelId', ''), 40) === key && remain) {
    db.setSetting('agent.activeChannelId', remain.id);
  }
  return { ok: true };
}

function setActiveChannel(id) {
  const key = str(id, 40);
  const hit = db.db().prepare('SELECT id FROM channels WHERE id = ?').get(key);
  if (!hit) return { ok: false, error: '没有这条渠道' };
  db.setSetting('agent.activeChannelId', key);
  return { ok: true };
}

/* -------------------------------------------------------------- 采样参数 */

function getSetting(key, fallback) {
  return db.getSetting(key, fallback);
}

function getConfig() {
  return {
    activeChannelId: getSetting('agent.activeChannelId', DEFAULTS.activeChannelId),
    channels: listChannels(),
    temperature: clampNumber(getSetting('agent.temperature', DEFAULTS.temperature), 0, 2, DEFAULTS.temperature),
    maxTokens: Math.round(
      clampNumber(getSetting('agent.maxTokens', DEFAULTS.maxTokens), 256, 32_000, DEFAULTS.maxTokens)
    ),
    enabledSkills: cleanIds(getSetting('agent.enabledSkills', DEFAULTS.enabledSkills)),
    personaId: str(getSetting('agent.personaId', DEFAULTS.personaId), 80)
  };
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}

function cleanIds(list) {
  return (Array.isArray(list) ? list : []).map((id) => str(id, 80)).filter(Boolean);
}

function save(partial) {
  const patch = partial && typeof partial === 'object' ? partial : {};
  db.tx(() => {
    if ('temperature' in patch) {
      db.setSetting('agent.temperature', clampNumber(patch.temperature, 0, 2, DEFAULTS.temperature));
    }
    if ('maxTokens' in patch) {
      db.setSetting('agent.maxTokens', Math.round(clampNumber(patch.maxTokens, 256, 32_000, DEFAULTS.maxTokens)));
    }
    if ('enabledSkills' in patch) db.setSetting('agent.enabledSkills', cleanIds(patch.enabledSkills));
    if ('personaId' in patch) db.setSetting('agent.personaId', str(patch.personaId, 80));
  })();
  return getConfig();
}

const get = getConfig;

/* ---------------------------------------------------------------- 技能 */

function idOk(id) {
  return /^[A-Za-z0-9._-]{1,80}$/.test(String(id || '').trim());
}

/** 技能清单：不带正文，心跳与状态窗口只关心条数。 */
function listSkills() {
  return db
    .db()
    .prepare('SELECT id, name, description, length(body) AS chars FROM skills ORDER BY name COLLATE NOCASE')
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name || row.id,
      description: row.description || '',
      chars: row.chars || 0
    }));
}

function readSkill(id) {
  const key = String(id || '').trim();
  if (!idOk(key)) return null;
  const row = db.db().prepare('SELECT id, name, body FROM skills WHERE id = ?').get(key);
  if (!row) return null;
  return { id: row.id, name: row.name || row.id, body: String(row.body || '').slice(0, 200_000) };
}

function saveSkill(id, fields) {
  const key = String(id || '').trim();
  if (!idOk(key)) return { ok: false, error: '技能 id 只能用小写字母、数字、点、横线' };
  const name = str(fields && fields.name, 80) || key;
  const description = str(fields && fields.description, 300);
  const body = String((fields && fields.body) || '').slice(0, 200_000);
  db.db()
    .prepare(
      `INSERT INTO skills (id, name, description, body, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, description = excluded.description,
         body = excluded.body, updated_at = excluded.updated_at`
    )
    .run(key, name, description, body, nowIso());
  return { ok: true, id: key };
}

function removeSkill(id) {
  const key = String(id || '').trim();
  if (!idOk(key)) return { ok: false, error: '技能 id 不合法' };
  db.db().prepare('DELETE FROM skills WHERE id = ?').run(key);
  const enabled = cleanIds(getSetting('agent.enabledSkills', []));
  if (enabled.includes(key)) db.setSetting('agent.enabledSkills', enabled.filter((row) => row !== key));
  return { ok: true };
}

/** 当前可用的技能：显式勾选优先，一个都没勾就全部可用。 */
function activeSkills() {
  const all = listSkills();
  const enabled = cleanIds(getSetting('agent.enabledSkills', []));
  if (!enabled.length) return all;
  return all.filter((row) => enabled.includes(row.id));
}

/* ------------------------------------------------------------ 数字分身 */

function listPersonas() {
  return db
    .db()
    .prepare('SELECT id, name, description, length(body) AS chars FROM personas ORDER BY name COLLATE NOCASE')
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name || row.id,
      description: row.description || '',
      chars: row.chars || 0
    }));
}

function readPersona(id) {
  const key = String(id || '').trim();
  if (!idOk(key)) return null;
  const row = db.db().prepare('SELECT id, name, body FROM personas WHERE id = ?').get(key);
  if (!row) return null;
  return { id: row.id, name: row.name || row.id, prompt: String(row.body || '').slice(0, 20_000) };
}

/** 当前生效的分身提示词；没选或已删就是空。 */
function activePersona() {
  const pid = str(getSetting('agent.personaId', ''), 80);
  if (!pid) return null;
  return readPersona(pid);
}

function savePersona(id, fields) {
  const key = String(id || '').trim();
  if (!idOk(key)) return { ok: false, error: '分身 id 只能用小写字母、数字、点、横线' };
  const name = str(fields && fields.name, 80) || key;
  const description = str(fields && fields.description, 300);
  const body = String((fields && fields.body) || '').slice(0, 200_000);
  db.db()
    .prepare(
      `INSERT INTO personas (id, name, description, body, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, description = excluded.description,
         body = excluded.body, updated_at = excluded.updated_at`
    )
    .run(key, name, description, body, nowIso());
  return { ok: true, id: key };
}

function removePersona(id) {
  const key = String(id || '').trim();
  if (!idOk(key)) return { ok: false, error: '分身 id 不合法' };
  db.db().prepare('DELETE FROM personas WHERE id = ?').run(key);
  if (str(getSetting('agent.personaId', ''), 80) === key) db.setSetting('agent.personaId', '');
  return { ok: true };
}

/* ---------------------------------------------------------------- 记忆 */

function readMemory() {
  const rows = db.db().prepare('SELECT text FROM memories ORDER BY id').all();
  const text = rows.map((row) => row.text).join('\n');
  return text.slice(-MEMORY_MAX);
}

function writeMemory(text) {
  const body = String(text || '');
  const run = db.tx(() => {
    db.db().prepare('DELETE FROM memories').run();
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const insert = db.db().prepare('INSERT INTO memories (text, created_at) VALUES (?, ?)');
    lines.slice(-500).forEach((line) => insert.run(line.slice(0, 1000), nowIso()));
  });
  run();
  return { ok: true };
}

function appendMemory(text) {
  const line = String(text || '').trim();
  if (!line) return false;
  db.db()
    .prepare('INSERT INTO memories (text, created_at) VALUES (?, ?)')
    .run(line.slice(0, 1000), nowIso());
  // 只留最近一段，避免库无限长。
  db.db()
    .prepare('DELETE FROM memories WHERE id NOT IN (SELECT id FROM memories ORDER BY id DESC LIMIT 500)')
    .run();
  return true;
}

module.exports = {
  DB_FILE: db.DB_FILE,
  PROTOCOLS,
  MEMORY_MAX,
  DEFAULT_CHANNEL,
  load: getConfig,
  get: getConfig,
  save,
  activeChannel,
  listChannels,
  saveChannel,
  removeChannel,
  setActiveChannel,
  listSkills,
  readSkill,
  saveSkill,
  removeSkill,
  activeSkills,
  listPersonas,
  readPersona,
  savePersona,
  removePersona,
  activePersona,
  writeMemory,
  readMemory,
  appendMemory
};
