'use strict';

/**
 * plugins.js
 *
 * Agent 插件：用户给本机 Agent 额外加的工具，按声明式配置执行，不加载任意 JS。
 *   · http    把一个 HTTP 接口包成工具（method / url / headers / body 模板）；
 *   · command 把一条本机命令包成工具（需要 allow-all 权限档）。
 *
 * 插件只在本机落库（~/.botbuddy/botbuddy.db），平台看不到清单也调不到。
 * 工具名固定加 `plugin_` 前缀，避免和内置工具（read_file 等）撞名。
 */

const { execFile } = require('child_process');
const db = require('./db');

const KINDS = ['http', 'command'];
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{1,39}$/;
const HTTP_TIMEOUT_MS = 60000;
const OUTPUT_MAX = 20000;

function nowIso() {
  return new Date().toISOString();
}

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function toolNameOf(id) {
  return 'plugin_' + String(id).replace(/[^A-Za-z0-9_]/g, '_');
}

function parseJson(raw, fallback) {
  try {
    const value = JSON.parse(raw || '');
    return value && typeof value === 'object' ? value : fallback;
  } catch (err) {
    return fallback;
  }
}

function normalizeParams(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const properties = {};
  const required = [];
  for (const [key, value] of Object.entries(input)) {
    const name = str(key, 64);
    if (!NAME_RE.test(name)) continue;
    const def = value && typeof value === 'object' ? value : {};
    properties[name] = {
      type: ['string', 'number', 'boolean', 'array', 'object'].includes(def.type)
        ? def.type
        : 'string',
      description: str(def.description, 300)
    };
    if (def.required === true) required.push(name);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

/** 配置归一化：只留这一种插件真正用得到的字段，脏值直接丢弃。 */
function normalizeConfig(kind, raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  if (kind === 'command') {
    return { command: str(input.command, 500) };
  }
  return {
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(input.method || '').toUpperCase())
      ? String(input.method).toUpperCase()
      : 'GET',
    url: str(input.url, 500),
    headers: input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)
      ? Object.fromEntries(
          Object.entries(input.headers)
            .map(([k, v]) => [str(k, 64), str(v, 1000)])
            .filter(([k]) => k)
        )
      : {},
    body: str(input.body, 4000)
  };
}

function rowToView(row) {
  const params = parseJson(row.params_json, {});
  const config = parseJson(row.config_json, {});
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    // 参数与请求配置在界面上按 JSON 编辑；这里原样回，避免保存一次丢一层结构
    params,
    config,
    enabled: row.enabled === 1,
    toolName: toolNameOf(row.id)
  };
}

function list() {
  return db
    .db()
    .prepare('SELECT * FROM plugins ORDER BY created_at DESC')
    .all()
    .map(rowToView);
}

function save(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const kind = KINDS.includes(raw.kind) ? raw.kind : 'http';
  const name = str(raw.name, 60);
  if (!name) return { ok: false, error: '请给插件起个名字' };
  const id = str(raw.id, 40) || 'p' + Date.now().toString(36);
  const config = normalizeConfig(kind, raw.config);
  if (kind === 'http' && !/^https?:\/\//i.test(config.url)) {
    return { ok: false, error: 'HTTP 插件要填 http(s) 开头的完整地址' };
  }
  if (kind === 'command' && !config.command) {
    return { ok: false, error: '命令插件要填要执行的命令' };
  }
  const params = normalizeParams(raw.params);
  db.db()
    .prepare(
      `INSERT INTO plugins (id, name, kind, description, params_json, config_json, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, kind = excluded.kind, description = excluded.description,
         params_json = excluded.params_json, config_json = excluded.config_json,
         enabled = excluded.enabled`
    )
    .run(
      id,
      name,
      kind,
      str(raw.description, 300),
      JSON.stringify(params),
      JSON.stringify(config),
      raw.enabled === false ? 0 : 1,
      nowIso()
    );
  return { ok: true, plugin: rowToView(db.db().prepare('SELECT * FROM plugins WHERE id = ?').get(id)) };
}

function remove(id) {
  const key = str(id, 40);
  if (!key) return { ok: false, error: '请指定要删除的插件' };
  db.db().prepare('DELETE FROM plugins WHERE id = ?').run(key);
  return { ok: true };
}

/** 把模板里的 {{参数名}} 换成实参值（只做字符串替换，不执行表达式）。 */
function render(template, args) {
  return String(template || '').replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (m, key) =>
    args[key] === undefined || args[key] === null ? '' : String(args[key])
  );
}

async function runHttp(plugin, args) {
  const config = plugin.config;
  let url = render(config.url, args);
  const headers = {};
  for (const [key, value] of Object.entries(config.headers || {})) {
    headers[key] = render(value, args);
  }
  const method = config.method;
  const init = { method, headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) };
  if (method !== 'GET' && method !== 'DELETE') {
    const body = render(config.body, args);
    if (body) {
      init.body = body;
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['content-type'] = 'application/json';
      }
    }
  } else {
    // GET/DELETE 的参数拼到查询串上，省得让用户自己拼 ?a={{b}}
    const query = Object.entries(args)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    if (query) url += (url.includes('?') ? '&' : '?') + query;
  }
  const response = await fetch(url, init);
  const text = (await response.text()).slice(0, OUTPUT_MAX);
  return { status: response.status, ok: response.ok, body: text };
}

function runCommand(plugin, args) {
  return new Promise((resolve, reject) => {
    const command = render(plugin.config.command, args);
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const argv = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command];
    execFile(
      shell,
      argv,
      { timeout: HTTP_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && !stdout && !stderr) {
          reject(new Error(error.message || '命令执行失败'));
          return;
        }
        resolve({
          exitCode: error && typeof error.code === 'number' ? error.code : 0,
          stdout: String(stdout || '').slice(0, OUTPUT_MAX),
          stderr: String(stderr || '').slice(0, OUTPUT_MAX)
        });
      }
    );
  });
}

/** 给模型看的工具定义：只有启用的插件才出现在清单里。 */
function toolDefs() {
  return list()
    .filter((plugin) => plugin.enabled)
    .map((plugin) => ({
      name: plugin.toolName,
      description:
        plugin.description ||
        `${plugin.name}（本机${plugin.kind === 'http' ? ' HTTP 接口' : '命令'}插件）`,
      parameters: plugin.params && plugin.params.type ? plugin.params : { type: 'object', properties: {} },
      plugin
    }));
}

/** 执行一次插件调用；命令类插件要 allow-all 权限档。 */
async function runTool(plugin, args, ctx) {
  if (plugin.kind === 'command') {
    if (!ctx || ctx.policy !== 'allow-all') {
      throw new Error('命令类插件需要 allow-all 权限档');
    }
    return runCommand(plugin, args || {});
  }
  return runHttp(plugin, args || {});
}

module.exports = {
  KINDS,
  list,
  save,
  remove,
  toolDefs,
  runTool,
  toolNameOf
};