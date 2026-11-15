'use strict';

/**
 * chat-store.js — 本机 Agent 对话的落库层。
 *
 * 一个会话一行 chat_conversations，消息按自增 id 排；全部只在本机，
 * 平台看不到任何对话内容。消息角色：
 *   user / assistant（正文，status: streaming|ok|error|canceled）
 *   tool（工具调用记录，content=工具名，status: running|ok|failed）
 *
 * 模型上下文只取最近一段 user/assistant 正文：工具流水是给人看的，
 * 不占上下文；失败与取消的回复也不回灌，避免把错误当事实再喂回去。
 *
 * 每个会话可单独挂技能与数字分身（persona_id / skill_ids）；空值表示跟随
 * 「技能 / 数字分身」页的全局设置。参考文件只存名字、路径与大小，
 * 正文在发送时读取并只进这一轮的模型上下文，不落库。
 *
 * 会话也可以单独指定工作区（workspace_path，空＝跟随默认工作区）：
 * 读写文件与执行命令都限制在这个目录内，换会话不会串目录。
 */

const path = require('path');
const db = require('./db');

const TITLE_MAX = 24;
const CONTENT_MAX = 200_000;
const HISTORY_LIMIT = 20;
const HISTORY_CHAR_BUDGET = 40_000;

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return 'conv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function titleOf(text) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  return line.slice(0, TITLE_MAX);
}

function parseIdList(text) {
  try {
    const value = JSON.parse(String(text || '[]'));
    return Array.isArray(value) ? value.map((row) => String(row || '')).filter(Boolean).slice(0, 100) : [];
  } catch (err) {
    return [];
  }
}

function cleanIdList(input) {
  const seen = new Set();
  const ids = [];
  (Array.isArray(input) ? input : []).forEach((row) => {
    const id = String(row || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return JSON.stringify(ids.slice(0, 100));
}

function parseAttachments(text) {
  try {
    const value = JSON.parse(String(text || '[]'));
    if (!Array.isArray(value)) return [];
    return value
      .filter((row) => row && typeof row === 'object')
      .slice(0, 20)
      .map((row) => ({
        name: String(row.name || '').slice(0, 200),
        path: String(row.path || '').slice(0, 1000),
        size: Number(row.size) || 0
      }));
  } catch (err) {
    return [];
  }
}

function rowToConversation(row) {
  return {
    id: row.id,
    title: row.title || '',
    personaId: row.persona_id || '',
    skillIds: parseIdList(row.skill_ids),
    pluginIds: parseIdList(row.plugin_ids),
    channelId: row.channel_id || '',
    workspacePath: row.workspace_path || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    toolName: row.tool_name,
    attachments: parseAttachments(row.attachments),
    createdAt: row.created_at
  };
}

const CONVERSATION_COLUMNS =
  'id, title, persona_id, skill_ids, plugin_ids, channel_id, workspace_path, created_at, updated_at';
const MESSAGE_COLUMNS = 'id, conversation_id, role, content, status, tool_name, attachments, created_at';

function listConversations() {
  return db
    .db()
    .prepare(
      'SELECT ' + CONVERSATION_COLUMNS + ' FROM chat_conversations ORDER BY updated_at DESC'
    )
    .all()
    .map(rowToConversation);
}

function getConversation(id) {
  const key = String(id || '');
  if (!key) return null;
  const row = db
    .db()
    .prepare('SELECT ' + CONVERSATION_COLUMNS + ' FROM chat_conversations WHERE id = ?')
    .get(key);
  return row ? rowToConversation(row) : null;
}

/** 新建会话；已经有一个还没说过话的「新对话」就复用它，避免列表空壳堆积。 */
function createConversation() {
  const empty = db
    .db()
    .prepare(
      `SELECT c.id, c.title, c.persona_id, c.skill_ids, c.plugin_ids, c.channel_id,
              c.workspace_path, c.created_at, c.updated_at
       FROM chat_conversations c
       WHERE c.title = '' AND NOT EXISTS (
         SELECT 1 FROM chat_messages m WHERE m.conversation_id = c.id
       )
       ORDER BY c.updated_at DESC LIMIT 1`
    )
    .get();
  if (empty) return rowToConversation(empty);

  const id = uid();
  const now = nowIso();
  db.db()
    .prepare('INSERT INTO chat_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, '', now, now);
  return {
    id,
    title: '',
    personaId: '',
    skillIds: [],
    pluginIds: [],
    channelId: '',
    workspacePath: '',
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 会话级能力：技能、插件、数字分身、模型渠道与工作区只对这一个会话生效，
 * 留空即跟随全局设置（技能/插件空数组＝全部可用，渠道空＝当前渠道）。
 * personaId 允许 'none' 表示「本会话明确不启用分身」；workspacePath 只收绝对路径，
 * 目录此时已不存在也照存——执行前的闸门会回落默认工作区。
 */
function updateConversation(id, fields) {
  const key = String(id || '');
  if (!key) return null;
  const patch = fields && typeof fields === 'object' ? fields : {};
  const sets = [];
  const values = [];
  if ('personaId' in patch) {
    sets.push('persona_id = ?');
    values.push(String(patch.personaId || '').slice(0, 80));
  }
  if ('workspacePath' in patch) {
    const dir = String(patch.workspacePath || '').trim().replace(/[\\/]+$/, '');
    sets.push('workspace_path = ?');
    values.push(dir && path.isAbsolute(dir) ? dir.slice(0, 1000) : '');
  }
  if ('skillIds' in patch) {
    sets.push('skill_ids = ?');
    values.push(cleanIdList(patch.skillIds));
  }
  if ('pluginIds' in patch) {
    sets.push('plugin_ids = ?');
    values.push(cleanIdList(patch.pluginIds));
  }
  if ('channelId' in patch) {
    sets.push('channel_id = ?');
    values.push(String(patch.channelId || '').trim().slice(0, 40));
  }
  if (!sets.length) return getConversation(key);
  sets.push('updated_at = ?');
  values.push(nowIso(), key);
  db.db()
    .prepare('UPDATE chat_conversations SET ' + sets.join(', ') + ' WHERE id = ?')
    .run(values);
  return getConversation(key);
}

function setTitle(id, title) {
  const key = String(id || '');
  const value = String(title || '').slice(0, TITLE_MAX);
  if (!key || !value) return false;
  db.db()
    .prepare('UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?')
    .run(value, nowIso(), key);
  return true;
}

function touch(id) {
  const key = String(id || '');
  if (!key) return;
  db.db().prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?').run(nowIso(), key);
}

function removeConversation(id) {
  const key = String(id || '');
  if (!key) return false;
  const hit = db.db().prepare('SELECT 1 AS hit FROM chat_conversations WHERE id = ?').get(key);
  if (!hit) return false;
  db.tx(() => {
    db.db().prepare('DELETE FROM chat_messages WHERE conversation_id = ?').run(key);
    db.db().prepare('DELETE FROM chat_conversations WHERE id = ?').run(key);
  })();
  return true;
}

function listMessages(conversationId, limit) {
  const key = String(conversationId || '');
  if (!key) return [];
  const size = Math.min(Math.max(Number(limit) || 200, 1), 500);
  return db
    .db()
    .prepare(
      'SELECT ' + MESSAGE_COLUMNS + ' FROM chat_messages WHERE conversation_id = ? ORDER BY id LIMIT ?'
    )
    .all(key, size)
    .map(rowToMessage);
}

function appendMessage(conversationId, role, content, status, toolName, attachments) {
  const key = String(conversationId || '');
  if (!key) return null;
  const files = (Array.isArray(attachments) ? attachments : [])
    .filter((row) => row && typeof row === 'object' && row.name)
    .slice(0, 20)
    .map((row) => ({
      name: String(row.name).slice(0, 200),
      path: String(row.path || '').slice(0, 1000),
      size: Number(row.size) || 0
    }));
  const info = db
    .db()
    .prepare(
      `INSERT INTO chat_messages (conversation_id, role, content, status, tool_name, attachments, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      key,
      String(role || 'assistant'),
      String(content || '').slice(0, CONTENT_MAX),
      String(status || ''),
      String(toolName || ''),
      JSON.stringify(files),
      nowIso()
    );
  touch(key);
  return rowToMessage(
    db.db().prepare('SELECT ' + MESSAGE_COLUMNS + ' FROM chat_messages WHERE id = ?').get(info.lastInsertRowid)
  );
}

function updateMessage(messageId, fields) {
  const id = Number(messageId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const patch = fields && typeof fields === 'object' ? fields : {};
  const sets = [];
  const values = [];
  if ('content' in patch) {
    sets.push('content = ?');
    values.push(String(patch.content || '').slice(0, CONTENT_MAX));
  }
  if ('status' in patch) {
    sets.push('status = ?');
    values.push(String(patch.status || ''));
  }
  if (!sets.length) return null;
  values.push(id);
  db.db().prepare('UPDATE chat_messages SET ' + sets.join(', ') + ' WHERE id = ?').run(values);
  const row = db
    .db()
    .prepare('SELECT ' + MESSAGE_COLUMNS + ' FROM chat_messages WHERE id = ?')
    .get(id);
  if (!row) return null;
  touch(row.conversation_id);
  return rowToMessage(row);
}

/**
 * 给模型的历史上下文：倒序取最近 N 条，只保留正常的 user / assistant 正文，
 * 再按总字数预算从旧到新裁掉头部。返回顺序是时间正序。
 */
function historyForModel(conversationId, limit) {
  const key = String(conversationId || '');
  if (!key) return [];
  const size = Math.min(Math.max(Number(limit) || HISTORY_LIMIT, 1), 50);
  const rows = db
    .db()
    .prepare(
      `SELECT role, content, status, attachments FROM chat_messages
       WHERE conversation_id = ? AND role IN ('user', 'assistant') AND status IN ('ok', 'streaming')
       ORDER BY id DESC LIMIT ?`
    )
    .all(key, size)
    .reverse();

  const out = [];
  let budget = HISTORY_CHAR_BUDGET;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    let content = String(rows[i].content || '').trim().slice(0, 8000);
    if (!content) continue;
    // 参考文件正文只在发送那一轮进模型；历史里留一行文件名，后续追问仍知道当时带了什么。
    const names = parseAttachments(rows[i].attachments)
      .map((row) => row.name)
      .filter(Boolean);
    if (rows[i].role === 'user' && names.length) {
      content += '\n（本轮参考文件：' + names.join('、') + '）';
    }
    if (content.length > budget) break;
    budget -= content.length;
    out.unshift({ role: rows[i].role, content });
  }
  return out;
}

module.exports = {
  TITLE_MAX,
  HISTORY_LIMIT,
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  setTitle,
  titleOf,
  touch,
  removeConversation,
  listMessages,
  appendMessage,
  updateMessage,
  historyForModel
};
