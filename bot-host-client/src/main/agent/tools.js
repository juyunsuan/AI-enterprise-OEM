'use strict';

/**
 * agent/tools.js
 *
 * 本地 Agent 的「手脚」：读写文件、列目录、搜索、执行命令、记长期记忆、读技能正文。
 * 所有路径都先过工作区沙箱：
 *   · 只允许落在当前工作区内（含子目录），越界一律拒；
 *   · 权限档（permissionPolicy）决定写操作与命令能不能跑：
 *       deny        读放行，写与命令一律拒
 *       allow-edits 读 + 工作区内写放行，命令拒
 *       allow-all   读 + 写 + 命令放行（命令仍在工作区内起进程）
 *
 * 工具定义按 OpenAI function-calling 形状写一份，anthropic 侧由 model-client 转 input_schema。
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const READ_MAX_BYTES = 200_000;
const WRITE_MAX_BYTES = 1_000_000;
const LIST_MAX = 300;
const GREP_MAX_HITS = 100;
const COMMAND_TIMEOUT_MS = 120_000;
const COMMAND_OUTPUT_MAX = 20_000;

/** 沙箱：把相对路径解析到工作区内，越界抛错。 */
function resolveInWorkspace(root, requested) {
  const base = path.resolve(root || '');
  const raw = String(requested || '').trim();
  if (!raw) return base;
  const target = path.resolve(base, raw);
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('路径超出当前工作区：' + raw);
  }
  return target;
}

function clampText(value, max) {
  const text = String(value == null ? '' : value);
  return text.length > max ? text.slice(0, max) + '\n…（截断，共 ' + text.length + ' 字符）' : text;
}

function listDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries.slice(0, LIST_MAX).map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'dir' : 'file'
  }));
}

function walkFiles(root, out, limit) {
  if (out.length >= limit) return;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (err) {
    return;
  }
  for (const entry of entries) {
    if (out.length >= limit) return;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkFiles(full, out, limit);
    else out.push(full);
  }
}

function grepFiles(root, keyword, limit) {
  const files = [];
  walkFiles(root, files, 2000);
  const hits = [];
  for (const file of files) {
    if (hits.length >= limit) break;
    let stat = null;
    try {
      stat = fs.statSync(file);
    } catch (err) {
      continue;
    }
    if (stat.size > READ_MAX_BYTES) continue;
    let raw = '';
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      continue;
    }
    if (raw.indexOf('\u0000') >= 0) continue;
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].includes(keyword)) {
        hits.push({
          file: path.relative(root, file),
          line: i + 1,
          text: lines[i].trim().slice(0, 240)
        });
        if (hits.length >= limit) break;
      }
    }
  }
  return hits;
}

function runCommand(cwd, command) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const shell = isWin ? process.env.ComSpec || 'cmd.exe' : '/bin/sh';
    const args = isWin ? ['/d', '/s', '/c', command] : ['-c', command];
    execFile(
      shell,
      args,
      { cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const out = clampText(stdout || '', COMMAND_OUTPUT_MAX);
        const err = clampText(stderr || '', COMMAND_OUTPUT_MAX);
        if (error) {
          resolve({
            ok: false,
            exitCode: typeof error.code === 'number' ? error.code : -1,
            stdout: out,
            stderr: err || error.message
          });
          return;
        }
        resolve({ ok: true, exitCode: 0, stdout: out, stderr: err });
      }
    );
  });
}

/**
 * 工具定义：name / description / parameters(JSON Schema) / run(args, ctx)。
 * ctx = { root, policy, memory, skills }
 */
function definitions() {
  return [
    {
      name: 'list_dir',
      description: '列出当前工作区某个目录下的文件与子目录。path 省略时为工作区根目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对工作区的目录路径，省略＝根目录' }
        }
      },
      run: (args, ctx) => {
        const target = resolveInWorkspace(ctx.root, args.path);
        const stat = fs.statSync(target);
        if (!stat.isDirectory()) throw new Error('不是目录：' + args.path);
        return listDir(target);
      }
    },
    {
      name: 'read_file',
      description: '读取工作区内一个文本文件。超大文件会被截断，可用 offset/limit 分段读。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对工作区的文件路径' },
          offset: { type: 'number', description: '起始行号（从 1 开始），可选' },
          limit: { type: 'number', description: '最多读多少行，可选' }
        },
        required: ['path']
      },
      run: (args, ctx) => {
        const target = resolveInWorkspace(ctx.root, args.path);
        const stat = fs.statSync(target);
        if (stat.isDirectory()) throw new Error('这是目录，不是文件');
        const raw = fs.readFileSync(target, 'utf8').slice(0, READ_MAX_BYTES);
        const lines = raw.split(/\r?\n/);
        const offset = Math.max(1, Number(args.offset) || 1);
        const limit = Math.max(1, Math.min(2000, Number(args.limit) || lines.length));
        return {
          path: args.path,
          totalLines: lines.length,
          content: lines.slice(offset - 1, offset - 1 + limit).join('\n')
        };
      }
    },
    {
      name: 'write_file',
      description: '在工作区内写入（覆盖）一个文本文件，必要时创建上级目录。需要写权限。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对工作区的文件路径' },
          content: { type: 'string', description: '完整文件内容' }
        },
        required: ['path', 'content']
      },
      run: (args, ctx) => {
        if (ctx.policy === 'deny') throw new Error('当前权限档不允许写文件（deny）');
        const content = String(args.content == null ? '' : args.content);
        if (Buffer.byteLength(content, 'utf8') > WRITE_MAX_BYTES) {
          throw new Error('内容超过 1MB 上限，请拆分为多次写入');
        }
        const target = resolveInWorkspace(ctx.root, args.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf8');
        return { path: args.path, bytes: Buffer.byteLength(content, 'utf8') };
      }
    },
    {
      name: 'search_files',
      description: '在当前工作区内按关键字搜索文件内容，返回命中的文件、行号与该行文本。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '要搜索的字面量关键字' },
          path: { type: 'string', description: '限定搜索的子目录（相对工作区），可选' }
        },
        required: ['keyword']
      },
      run: (args, ctx) => {
        const keyword = String(args.keyword || '');
        if (!keyword) throw new Error('请提供要搜索的关键字');
        const root = resolveInWorkspace(ctx.root, args.path);
        return { hits: grepFiles(root, keyword, GREP_MAX_HITS) };
      }
    },
    {
      name: 'run_command',
      description:
        '在当前工作区目录下执行一条 shell 命令并返回输出。需要完整权限。要让用户在浏览器里打开网页，用 `start <完整URL>`（Windows）或 `open <URL>`（macOS）；curl 只用来读取内容，不会让用户看到页面。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的命令（单行；Windows 走 cmd.exe，其余走 /bin/sh）' }
        },
        required: ['command']
      },
      run: (args, ctx) => {
        if (ctx.policy !== 'allow-all') {
          throw new Error('当前权限档不允许执行命令（需要 allow-all）');
        }
        const command = String(args.command || '').trim();
        if (!command) throw new Error('命令为空');
        return runCommand(ctx.root, command);
      }
    },
    {
      name: 'load_skill',
      description: '读取一条技能的完整说明（技能清单里只有摘要）。要按技能办事时先读它。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '技能 id' }
        },
        required: ['id']
      },
      run: (args, ctx) => {
        const skill = ctx.skills.readSkill(args.id);
        if (!skill) throw new Error('没有这条技能：' + args.id);
        return skill;
      }
    },
    {
      name: 'remember',
      description: '把一条值得长期记住的结论写进本机记忆（跨对话生效）。只在确实会反复用到时调用。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '一句话结论，写清楚是什么、为什么' }
        },
        required: ['text']
      },
      run: (args, ctx) => {
        const ok = ctx.memory.append(args.text);
        return { saved: ok };
      }
    }
  ];
}

/**
 * 给模型看的工具清单：去掉 run，只留协议需要的三个字段。
 * extra 是运行期外挂的工具（Agent 插件、Chrome 桥接），形状与内置工具一致；
 * 它们不在清单里时模型根本看不到，也就不会去调。
 */
function schemaList(extra) {
  const base = definitions().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
  const appended = (Array.isArray(extra) ? extra : []).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
  return base.concat(appended);
}

/**
 * 执行一次工具调用。
 * 返回 { ok, content }：content 一律序列化成字符串回灌给模型。
 */
async function run(name, argsRaw, ctx) {
  const extra = ctx && Array.isArray(ctx.extraTools) ? ctx.extraTools : [];
  const tool = definitions().find((row) => row.name === name) || extra.find((row) => row.name === name);
  if (!tool) return { ok: false, content: JSON.stringify({ error: '未知工具：' + name }) };
  let args = {};
  try {
    args = typeof argsRaw === 'string' ? JSON.parse(argsRaw || '{}') : argsRaw || {};
  } catch (err) {
    return { ok: false, content: JSON.stringify({ error: '工具参数不是合法 JSON：' + err.message }) };
  }
  try {
    const result = await tool.run(args, ctx);
    return { ok: true, content: clampText(JSON.stringify(result), COMMAND_OUTPUT_MAX) };
  } catch (error) {
    return { ok: false, content: JSON.stringify({ error: error.message || '工具执行失败' }) };
  }
}

module.exports = { definitions, schemaList, run, resolveInWorkspace };
