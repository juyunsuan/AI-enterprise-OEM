'use strict';

/**
 * db.js — BotBuddy 客户端的本地库（SQLite）。
 *
 * 一个文件装下所有本机状态：平台绑定、Agent 渠道、技能、数字分身、记忆、
 * 工作区、任务流水。全部只在本机，平台看不到内容。
 *
 * 位置：~/.botbuddy/botbuddy.db（测试可用 BOTBUDDY_HOME 指到临时目录）
 * 驱动：better-sqlite3（同步 API，主进程直接用，无需线程池）
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA_VERSION = 5;

const DATA_DIR = process.env.BOTBUDDY_HOME || path.join(os.homedir(), '.botbuddy');
const DB_FILE = path.join(DATA_DIR, 'botbuddy.db');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS channels (
     id         TEXT PRIMARY KEY,
     name       TEXT NOT NULL,
     protocol   TEXT NOT NULL,
     base_url   TEXT NOT NULL,
     api_key    TEXT NOT NULL DEFAULT '',
     model      TEXT NOT NULL,
     position   INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS skills (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     body        TEXT NOT NULL DEFAULT '',
     updated_at  TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS personas (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     body        TEXT NOT NULL DEFAULT '',
     updated_at  TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS memories (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     text       TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
     path_key     TEXT NOT NULL,
     source       TEXT NOT NULL,
     path         TEXT NOT NULL,
     last_used_at TEXT,
     PRIMARY KEY (path_key, source)
   )`,
  `CREATE TABLE IF NOT EXISTS tasks (
     command_code  TEXT PRIMARY KEY,
     title         TEXT NOT NULL DEFAULT '',
     status        TEXT NOT NULL,
     error_message TEXT NOT NULL DEFAULT '',
     started_at    TEXT NOT NULL,
     updated_at    TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS chat_conversations (
     id             TEXT PRIMARY KEY,
     title          TEXT NOT NULL DEFAULT '',
     persona_id     TEXT NOT NULL DEFAULT '',
     skill_ids      TEXT NOT NULL DEFAULT '[]',
     plugin_ids     TEXT NOT NULL DEFAULT '[]',
     channel_id     TEXT NOT NULL DEFAULT '',
     workspace_path TEXT NOT NULL DEFAULT '',
     created_at     TEXT NOT NULL,
     updated_at     TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     conversation_id TEXT NOT NULL,
     role            TEXT NOT NULL,
     content         TEXT NOT NULL DEFAULT '',
     status          TEXT NOT NULL DEFAULT '',
     tool_name       TEXT NOT NULL DEFAULT '',
     attachments     TEXT NOT NULL DEFAULT '[]',
     created_at      TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
     ON chat_messages (conversation_id, id)`,
  `CREATE TABLE IF NOT EXISTS plugins (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     kind        TEXT NOT NULL DEFAULT 'http',
     description TEXT NOT NULL DEFAULT '',
     params_json TEXT NOT NULL DEFAULT '{}',
     config_json TEXT NOT NULL DEFAULT '{}',
     enabled     INTEGER NOT NULL DEFAULT 1,
     created_at  TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS fp_profiles (
     id                    TEXT PRIMARY KEY,
     name                  TEXT NOT NULL,
     group_name            TEXT NOT NULL DEFAULT '',
     seed                  TEXT NOT NULL,
     kernel_version        TEXT NOT NULL DEFAULT '',
     platform              TEXT NOT NULL DEFAULT 'win',
     timezone              TEXT NOT NULL DEFAULT '',
     languages_json        TEXT NOT NULL DEFAULT '[]',
     canvas_noise          TEXT NOT NULL DEFAULT 'off',
     audio_noise           TEXT NOT NULL DEFAULT 'light',
     webrtc_mode           TEXT NOT NULL DEFAULT 'proxy',
     hardware_concurrency  INTEGER NOT NULL DEFAULT 0,
     proxy_mode            TEXT NOT NULL DEFAULT 'direct',
     proxy_type            TEXT NOT NULL DEFAULT '',
     proxy_host            TEXT NOT NULL DEFAULT '',
     proxy_port            INTEGER NOT NULL DEFAULT 0,
     proxy_auth_mode       TEXT NOT NULL DEFAULT 'password',
     proxy_user            TEXT NOT NULL DEFAULT '',
     proxy_password_cipher TEXT NOT NULL DEFAULT '',
     extension_ids_json    TEXT NOT NULL DEFAULT '[]',
     last_open_at          TEXT,
     last_ip               TEXT,
     created_at            TEXT NOT NULL,
     updated_at            TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS fp_profiles_updated_idx
     ON fp_profiles (updated_at DESC)`
];

let handle = null;
let Database = null;

function driver() {
  // 延迟加载：纯静态检查（node --check）与不需要库的测试不必拉起原生模块。
  if (!Database) Database = require('better-sqlite3');
  return Database;
}

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('[db] cannot create data dir:', err.message);
  }
}

function open() {
  if (handle) return handle;
  ensureDir();
  const Db = driver();
  handle = new Db(DB_FILE);
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');
  const version = handle.pragma('user_version', { simple: true });
  // v1 的 workspaces 只有 path_key 单列主键：同一目录既是白名单又是「最近使用」时，
  // 两条记录会互相覆盖，白名单被静默降级成最近项。v2 换成 (path_key, source)。
  if (version === 1) handle.exec('DROP TABLE IF EXISTS workspaces');
  for (const sql of SCHEMA) handle.exec(sql);
  // v5：会话可以单独指定工作区、插件与模型渠道。
  // CREATE TABLE IF NOT EXISTS 不会给老库补列，这里逐列探测后 ALTER。
  ensureColumn('chat_conversations', 'persona_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('chat_conversations', 'skill_ids', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('chat_conversations', 'plugin_ids', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('chat_conversations', 'channel_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('chat_conversations', 'workspace_path', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('chat_messages', 'attachments', "TEXT NOT NULL DEFAULT '[]'");
  // 任务记录：平台原文与本机回复要能在重启后回看。
  ensureColumn('tasks', 'kind', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('tasks', 'instruction', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('tasks', 'cwd', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('tasks', 'reply', "TEXT NOT NULL DEFAULT ''");
  if (version !== SCHEMA_VERSION) handle.pragma('user_version = ' + SCHEMA_VERSION);
  return handle;
}

function ensureColumn(table, column, ddl) {
  const columns = handle
    .prepare('PRAGMA table_info(' + table + ')')
    .all()
    .map((row) => row.name);
  if (!columns.includes(column)) handle.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + ddl);
}

function close() {
  if (!handle) return;
  try {
    handle.close();
  } catch (err) {
    /* 已经关了 */
  }
  handle = null;
}

/** 整库句柄：调用方自己 prepare；边界模块统一走这里，不各自 require 驱动。 */
function db() {
  return open();
}

function tx(fn) {
  return open().transaction(fn);
}

/* ---------------------------------------------------------------- settings */

function getSetting(key, fallback) {
  const row = open().prepare('SELECT value FROM settings WHERE key = ?').get(String(key));
  if (!row) return fallback;
  try {
    const parsed = JSON.parse(row.value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
}

function setSetting(key, value) {
  open()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(String(key), JSON.stringify(value === undefined ? null : value));
}

function hasSetting(key) {
  return !!open().prepare('SELECT 1 AS hit FROM settings WHERE key = ?').get(String(key));
}

/* ---------------------------------------------------------------- tasks */

/** 平台指令领取时入库：存平台原文；状态变化走 updateTaskRecord，不覆盖原文。 */
function receiveTaskRecord(record) {
  const code = String((record && record.commandCode) || '');
  if (!code) return;
  const at = (record && record.at) || new Date().toISOString();
  open()
    .prepare(
      `INSERT INTO tasks (command_code, title, kind, instruction, cwd, status, error_message, reply, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?)
       ON CONFLICT(command_code) DO UPDATE SET
         title = excluded.title, kind = excluded.kind, instruction = excluded.instruction,
         cwd = excluded.cwd, status = excluded.status, updated_at = excluded.updated_at`
    )
    .run(
      code,
      String(record.title || '').slice(0, 200),
      String(record.kind || ''),
      String(record.instruction || '').slice(0, 20_000),
      String(record.cwd || ''),
      String(record.status || '已领取'),
      at,
      at
    );
}

/** 状态/回复更新：只动状态相关列，保留平台原文。 */
function updateTaskRecord(record) {
  const code = String((record && record.commandCode) || '');
  if (!code) return;
  const at = (record && record.at) || new Date().toISOString();
  open()
    .prepare(
      `INSERT INTO tasks (command_code, title, status, error_message, reply, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(command_code) DO UPDATE SET
         title = excluded.title, status = excluded.status,
         error_message = excluded.error_message, reply = excluded.reply, updated_at = excluded.updated_at`
    )
    .run(
      code,
      String(record.title || '').slice(0, 200),
      String(record.status || ''),
      String(record.errorMessage || '').slice(0, 2_000),
      String(record.reply || '').slice(0, 20_000),
      at,
      at
    );
}

function listTaskRecords(limit) {
  const cap = Math.max(1, Math.min(500, Number(limit) || 100));
  return open()
    .prepare(
      `SELECT command_code AS commandCode, title, kind, instruction, cwd, status,
              error_message AS errorMessage, reply, started_at AS startedAt, updated_at AS updatedAt
         FROM tasks ORDER BY updated_at DESC LIMIT ?`
    )
    .all(cap);
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  SCHEMA_VERSION,
  db,
  tx,
  open,
  close,
  getSetting,
  setSetting,
  hasSetting,
  receiveTaskRecord,
  updateTaskRecord,
  listTaskRecords
};
