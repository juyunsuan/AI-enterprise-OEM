'use strict';

/**
 * workspaces.js
 *
 * 本机工作区候选：客户端 Agent 能干活的范围，上报给平台供对话框/定时表单选择。
 * 三个来源：
 *   · 配置里的默认工作目录（workingDir）
 *   · 用户手动加入的白名单（config.workspaces）
 *   · 最近一次实际用过的目录（config.recentWorkspaces）
 *
 * 只有真实存在的目录才会出现在清单里；平台只认这份清单，
 * 客户端执行前还会用 resolveWorkspace 再校验一次。
 * 零第三方依赖：只用 Node 内置模块。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_LIST = 60;
const RECENT_KEEP = 20;

function existsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (err) {
    return false;
  }
}

function isGit(p) {
  try {
    return fs.existsSync(path.join(p, '.git'));
  } catch (err) {
    return false;
  }
}

function labelOf(p) {
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : p;
}

function keyOf(p) {
  return String(p || '')
    .trim()
    .toLowerCase()
    .replace(/[\\/]+$/, '');
}

function normalize(rows) {
  const byKey = new Map();
  for (const row of rows) {
    if (!row || !row.path || !existsDir(row.path)) continue;
    const key = keyOf(row.path);
    const prev = byKey.get(key);
    // 同一目录被多个来源发现：白名单/默认目录的可信度高于「最近使用」。
    if (!prev || (!prev.trusted && row.trusted)) byKey.set(key, row);
  }
  const list = Array.from(byKey.values()).map((row) => ({
    path: row.path,
    label: labelOf(row.path),
    exists: true,
    isGit: isGit(row.path),
    trust: row.trusted ? 'trusted' : 'known',
    source: row.source || '',
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null
  }));
  list.sort((a, b) => {
    if (a.trust !== b.trust) return a.trust === 'trusted' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  return list.slice(0, MAX_LIST);
}

function listWorkspaces(cfg) {
  const rows = [];
  const defaultDir = cfg && cfg.workingDir ? cfg.workingDir : '';
  if (defaultDir) rows.push({ path: defaultDir, trusted: true, source: 'config' });
  for (const p of (cfg && cfg.workspaces) || []) {
    rows.push({ path: p, trusted: true, source: 'whitelist' });
  }
  for (const row of (cfg && cfg.recentWorkspaces) || []) {
    if (!row || !row.path) continue;
    rows.push({
      path: row.path,
      trusted: false,
      source: 'recent',
      lastUsedAt: row.lastUsedAt
    });
  }
  return normalize(rows);
}

/**
 * 执行前的工作区闸门：命中候选表才算数（大小写不敏感、尾分隔符忽略）。
 * 返回候选表里的真实路径；不在表内返回 null——平台会收到 WORKSPACE_NOT_ALLOWED。
 */
function resolveWorkspace(cfg, requested) {
  const wanted = keyOf(requested);
  if (!wanted) return null;
  const hit = listWorkspaces(cfg).find((row) => keyOf(row.path) === wanted);
  return hit ? hit.path : null;
}

/**
 * 默认工作区：配置里的工作目录真实存在就用它，否则用候选表第一条，再否则用用户主目录。
 * 不用要求用户先「保存一个存在的目录」——目录不存在就当场建出来，建不出来才退到主目录。
 */
function defaultWorkspace(cfg) {
  const preferred = cfg && cfg.workingDir ? cfg.workingDir : '';
  if (preferred && ensureDir(preferred)) return preferred;
  const list = listWorkspaces(cfg);
  if (list.length) return list[0].path;
  const home = os.homedir();
  return existsDir(home) ? home : '';
}

/**
 * 建目录（已存在直接算成功）。
 * 默认工作区是「开箱即用」的前提，缺了就补，不让用户先去设置里存一遍。
 */
function ensureDir(dir) {
  if (!dir) return false;
  if (existsDir(dir)) return true;
  try {
    fs.mkdirSync(dir, { recursive: true });
    return existsDir(dir);
  } catch (err) {
    return false;
  }
}

/**
 * 执行时选目录（唯一实现）：平台给了目录且命中本机白名单就用它，
 * 否则（没给 / 不在白名单 / 目录已删）一律落到默认工作区。
 */
function resolveForRun(cfg, requested) {
  const wanted = String(requested || '').trim();
  return (wanted && resolveWorkspace(cfg, wanted)) || defaultWorkspace(cfg) || '';
}

/** 启动时确保默认工作区目录落地，供心跳上报与执行回落。 */
function ensureDefaultWorkspace(cfg) {
  const dir = defaultWorkspace(cfg);
  if (dir && existsDir(dir)) return dir;
  return '';
}

module.exports = {
  listWorkspaces,
  resolveWorkspace,
  resolveForRun,
  defaultWorkspace,
  ensureDefaultWorkspace,
  ensureDir,
  existsDir,
  keyOf,
  RECENT_KEEP
};
