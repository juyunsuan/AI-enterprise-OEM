'use strict';

/**
 * _db-unit.js — 本机库（SQLite）的静态回归：全部在临时目录里跑，不碰用户真实数据。
 *
 * 钉住这些会直接影响线上行为的点：
 *   1. 老 config.json 一次性导入（含 workbuddy/codex 两桶白名单合并）；
 *   2. 标量配置往返、白名单去重、最近目录覆盖；
 *   3. 渠道增删改与「至少留一条」；
 *   4. 技能 / 数字分身的增删改，删分身会清掉正在用的 personaId；
 *   5. 记忆追加与整段替换；
 *   6. 工作区闸门仍按库里白名单裁决。
 *
 * 原生模块是 Electron ABI：用本机 Node 直跑若报 ABORT，会自动用 electron 以 Node 模式重跑。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-db-test-'));
process.env.BOTBUDDY_HOME = HOME;

function reexecUnderElectron(err) {
  if (process.env.BOTBUDDY_DB_REEXEC) return false;
  if (!/NODE_MODULE_VERSION|compiled against a different Node|was compiled against/.test(err.message)) {
    return false;
  }
  const electronBin = require('electron');
  if (typeof electronBin !== 'string') return false;
  const res = spawnSync(electronBin, [__filename], {
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
      ELECTRON_RUN_AS_NODE: '1',
      BOTBUDDY_DB_REEXEC: '1',
      BOTBUDDY_HOME: HOME
    })
  });
  process.exit(res.status === null ? 1 : res.status);
}

try {
  // require 本身不加载 .node，构造时才校验 ABI，所以探针必须真建一个库。
  new (require('better-sqlite3'))(':memory:').close();
} catch (err) {
  if (!reexecUnderElectron(err)) {
    console.error('  FAIL 无法加载 better-sqlite3：' + err.message.split('\n')[0]);
    process.exit(1);
  }
}

const assert = require('assert');

const db = require('../src/main/db');
const configStore = require('../src/main/config-store');
const agentConfig = require('../src/main/agent/config');
const workspaces = require('../src/main/workspaces');
const chatStore = require('../src/main/chat-store');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  ok   ' + name);
  } catch (err) {
    failed += 1;
    console.log('  FAIL ' + name + ' — ' + err.message);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log('  ok   ' + name);
  } catch (err) {
    failed += 1;
    console.log('  FAIL ' + name + ' — ' + err.message);
  }
}

console.log('库文件');

// 先按 v3 的老结构铺一个库：验证 v4 是补列，而不是把用户已有会话刷掉。
check('v3 老库预置：对话两张表没有会话能力列', () => {
  const Legacy = require('better-sqlite3');
  const legacy = new Legacy(path.join(HOME, 'botbuddy.db'));
  legacy.exec(
    `CREATE TABLE chat_conversations (
       id         TEXT PRIMARY KEY,
       title      TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  );
  legacy.exec(
    `CREATE TABLE chat_messages (
       id              INTEGER PRIMARY KEY AUTOINCREMENT,
       conversation_id TEXT NOT NULL,
       role            TEXT NOT NULL,
       content         TEXT NOT NULL DEFAULT '',
       status          TEXT NOT NULL DEFAULT '',
       tool_name       TEXT NOT NULL DEFAULT '',
       created_at      TEXT NOT NULL
     )`
  );
  const now = new Date().toISOString();
  legacy
    .prepare("INSERT INTO chat_conversations (id, title, created_at, updated_at) VALUES ('old-conv', '老会话', ?, ?)")
    .run(now, now);
  legacy.pragma('user_version = 3');
  legacy.close();
});

check('库落在 BOTBUDDY_HOME/botbuddy.db', () => {
  assert.strictEqual(db.DB_FILE, path.join(HOME, 'botbuddy.db'));
  db.open();
  assert.ok(fs.existsSync(db.DB_FILE), '库文件应当已创建');
});

check('v5 迁移给老库补上分身 / 技能 / 插件 / 渠道 / 工作区 / 参考文件列，老会话还在', () => {
  const convColumns = db.db().prepare('PRAGMA table_info(chat_conversations)').all().map((row) => row.name);
  const msgColumns = db.db().prepare('PRAGMA table_info(chat_messages)').all().map((row) => row.name);
  assert.ok(convColumns.includes('persona_id'), 'chat_conversations 缺 persona_id');
  assert.ok(convColumns.includes('skill_ids'), 'chat_conversations 缺 skill_ids');
  assert.ok(convColumns.includes('plugin_ids'), 'chat_conversations 缺 plugin_ids');
  assert.ok(convColumns.includes('channel_id'), 'chat_conversations 缺 channel_id');
  assert.ok(convColumns.includes('workspace_path'), 'chat_conversations 缺 workspace_path');
  assert.ok(msgColumns.includes('attachments'), 'chat_messages 缺 attachments');
  assert.strictEqual(db.db().prepare('SELECT COUNT(*) AS n FROM chat_conversations').get().n, 1);
  const old = chatStore.getConversation('old-conv');
  assert.strictEqual(old.title, '老会话');
  assert.deepStrictEqual(old.skillIds, []);
  assert.deepStrictEqual(old.pluginIds, []);
  assert.strictEqual(old.personaId, '');
  assert.strictEqual(old.channelId, '');
  assert.strictEqual(old.workspacePath, '');
});

console.log('老配置导入');

check('config.json 迁移：标量进 settings、两桶白名单并成一份', () => {
  const wsA = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-db-ws-a-'));
  const wsB = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-db-ws-b-'));
  fs.writeFileSync(
    path.join(HOME, 'config.json'),
    JSON.stringify({
      baseUrl: 'http://10.0.0.9:1690/',
      deviceName: '办公机',
      workspaces: { workbuddy: [wsA], codex: [wsB, wsA] },
      recentWorkspaces: [{ path: wsB, lastUsedAt: '2026-01-01T00:00:00.000Z' }]
    }),
    'utf8'
  );
  // 迁移发生在第一次读配置时。
  const cfg = configStore.get();
  assert.strictEqual(cfg.baseUrl, 'http://10.0.0.9:1690');
  assert.strictEqual(cfg.deviceName, '办公机');
  assert.deepStrictEqual(cfg.workspaces, [wsA, wsB]);
  assert.strictEqual(cfg.recentWorkspaces.length, 1);
});

console.log('配置往返');

check('保存标量后立即可读', () => {
  const saved = configStore.save({ baseUrl: 'aipdd.example.com', heartbeatSeconds: 9 });
  assert.strictEqual(saved.baseUrl, 'http://aipdd.example.com');
  assert.strictEqual(configStore.get().heartbeatSeconds, 9);
});

check('白名单去重（大小写与尾分隔符不敏感）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-db-ws-c-'));
  const saved = configStore.save({ workspaces: [dir, dir + path.sep, dir.toUpperCase()] });
  assert.strictEqual(saved.workspaces.length, 1);
});

check('最近目录按时间覆盖，只留一条同名', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-db-ws-d-'));
  configStore.save({ recentWorkspaces: [{ path: dir, lastUsedAt: '2026-01-01T00:00:00.000Z' }] });
  configStore.save({ recentWorkspaces: [{ path: dir, lastUsedAt: '2026-02-02T00:00:00.000Z' }] });
  const rows = configStore.get().recentWorkspaces;
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].lastUsedAt, '2026-02-02T00:00:00.000Z');
});

console.log('模型渠道');

check('缺省渠道自动播种，改一条不新增', () => {
  const list = agentConfig.listChannels();
  assert.strictEqual(list.length, 1);
  const saved = agentConfig.saveChannel({ id: list[0].id, name: '内网网关', baseUrl: 'http://127.0.0.1:8000', model: 'qwen' });
  assert.strictEqual(saved.name, '内网网关');
  assert.strictEqual(agentConfig.listChannels().length, 1);
  assert.strictEqual(agentConfig.activeChannel().model, 'qwen');
});

check('新增渠道自动成为当前，删除后回落第一条', () => {
  const added = agentConfig.saveChannel({ name: '备用', baseUrl: 'http://127.0.0.1:9000', model: 'x' });
  assert.strictEqual(agentConfig.activeChannel().id, added.id);
  agentConfig.removeChannel(added.id);
  assert.strictEqual(agentConfig.listChannels().length, 1);
  assert.notStrictEqual(agentConfig.activeChannel().id, added.id);
});

check('最后一条渠道不允许删', () => {
  const only = agentConfig.listChannels()[0];
  const res = agentConfig.removeChannel(only.id);
  assert.strictEqual(res.ok, false);
});

console.log('技能与分身');

check('技能保存、读取、删除', () => {
  agentConfig.saveSkill('code-review', { name: '代码审查', description: '看改动', body: '逐行看' });
  const hit = agentConfig.readSkill('code-review');
  assert.strictEqual(hit.name, '代码审查');
  assert.strictEqual(hit.body, '逐行看');
  assert.ok(agentConfig.listSkills().some((row) => row.id === 'code-review'));
  agentConfig.removeSkill('code-review');
  assert.strictEqual(agentConfig.readSkill('code-review'), null);
});

check('分身保存后启用、删除会清掉 personaId', () => {
  agentConfig.savePersona('writer', { name: '技术写手', description: '', body: '写清楚' });
  agentConfig.save({ personaId: 'writer' });
  assert.strictEqual(agentConfig.activePersona().name, '技术写手');
  agentConfig.removePersona('writer');
  assert.strictEqual(agentConfig.activePersona(), null);
});

check('启用的技能为空＝全部可用', () => {
  agentConfig.saveSkill('a', { name: 'A', body: 'a' });
  agentConfig.saveSkill('b', { name: 'B', body: 'b' });
  agentConfig.save({ enabledSkills: [] });
  assert.strictEqual(agentConfig.activeSkills().length, 2);
  agentConfig.save({ enabledSkills: ['a'] });
  assert.deepStrictEqual(agentConfig.activeSkills().map((row) => row.id), ['a']);
});

console.log('记忆');

check('追加与整段替换', () => {
  assert.strictEqual(agentConfig.appendMemory('第一条'), true);
  assert.ok(agentConfig.readMemory().includes('第一条'));
  agentConfig.writeMemory('只剩这一行\n还有这一行');
  const text = agentConfig.readMemory();
  assert.ok(text.includes('只剩这一行'));
  assert.ok(!text.includes('第一条'));
});

console.log('对话存储');

check('空的「新对话」来回复用，不堆空壳', () => {
  const first = chatStore.createConversation();
  const second = chatStore.createConversation();
  assert.strictEqual(first.id, second.id);
  assert.strictEqual(chatStore.listConversations().filter((row) => row.title === '').length, 1);
});

check('消息正序、标题取首条用户消息', () => {
  const conv = chatStore.createConversation();
  const user = chatStore.appendMessage(conv.id, 'user', '  帮我看下 README 的标题  ', 'ok');
  chatStore.appendMessage(conv.id, 'assistant', '标题是 X', 'ok');
  chatStore.setTitle(conv.id, chatStore.titleOf(user.content));
  const list = chatStore.listMessages(conv.id);
  assert.deepStrictEqual(list.map((row) => row.role), ['user', 'assistant']);
  assert.strictEqual(chatStore.getConversation(conv.id).title, '帮我看下 README 的标题');
});

check('上下文只带正常回合：工具行、失败与停止的回复不进模型', () => {
  const conv = chatStore.createConversation();
  chatStore.appendMessage(conv.id, 'user', 'q1', 'ok');
  chatStore.appendMessage(conv.id, 'assistant', 'a1', 'ok');
  chatStore.appendMessage(conv.id, 'tool', 'list_dir', 'ok', 'list_dir');
  chatStore.appendMessage(conv.id, 'assistant', '渠道连不上', 'error');
  chatStore.appendMessage(conv.id, 'assistant', '说到一半', 'canceled');
  chatStore.appendMessage(conv.id, 'user', 'q2', 'ok');
  assert.deepStrictEqual(chatStore.historyForModel(conv.id), [
    { role: 'user', content: 'q1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'q2' }
  ]);
});

check('会话可单独挂技能与分身，留空即跟随全局', () => {
  const conv = chatStore.createConversation();
  const saved = chatStore.updateConversation(conv.id, {
    personaId: 'tech-writer',
    skillIds: [' code-review ', '', 'deploy', 'deploy'],
    pluginIds: [' p1 ', 'p2', 'p1'],
    channelId: 'ch-1'
  });
  assert.strictEqual(saved.personaId, 'tech-writer');
  assert.deepStrictEqual(saved.skillIds, ['code-review', 'deploy']);
  assert.deepStrictEqual(saved.pluginIds, ['p1', 'p2']);
  assert.strictEqual(saved.channelId, 'ch-1');
  const reread = chatStore.getConversation(conv.id);
  assert.deepStrictEqual(reread.skillIds, ['code-review', 'deploy']);
  assert.deepStrictEqual(reread.pluginIds, ['p1', 'p2']);
  const cleared = chatStore.updateConversation(conv.id, {
    personaId: '',
    skillIds: [],
    pluginIds: [],
    channelId: ''
  });
  assert.strictEqual(cleared.personaId, '');
  assert.deepStrictEqual(cleared.skillIds, []);
  assert.deepStrictEqual(cleared.pluginIds, []);
  assert.strictEqual(cleared.channelId, '');
});

check('会话工作区只收绝对路径，清空即跟随默认', () => {
  const conv = chatStore.createConversation();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-db-ws-conv-'));
  const saved = chatStore.updateConversation(conv.id, { workspacePath: dir + path.sep });
  assert.strictEqual(saved.workspacePath, dir);
  const bad = chatStore.updateConversation(conv.id, { workspacePath: 'relative/workspace' });
  assert.strictEqual(bad.workspacePath, '');
  const reread = chatStore.getConversation(conv.id);
  assert.strictEqual(reread.workspacePath, '');
});

check('参考文件只留名字 / 路径 / 大小，历史里带一行文件名', () => {
  const conv = chatStore.createConversation();
  chatStore.appendMessage(conv.id, 'user', '看下这两份资料', 'ok', '', [
    { name: 'a.md', path: 'C:\\tmp\\a.md', size: 12 },
    { name: 'b.txt', path: '/tmp/b.txt', size: 30, content: '正文不落库' },
    null,
    { path: 'C:\\tmp\\noname' }
  ]);
  chatStore.appendMessage(conv.id, 'assistant', '看完了', 'ok');
  const messages = chatStore.listMessages(conv.id);
  assert.deepStrictEqual(messages[0].attachments.map((row) => row.name), ['a.md', 'b.txt']);
  assert.strictEqual(messages[0].attachments[0].content, undefined);
  assert.deepStrictEqual(messages[1].attachments, []);
  assert.deepStrictEqual(chatStore.historyForModel(conv.id), [
    { role: 'user', content: '看下这两份资料\n（本轮参考文件：a.md、b.txt）' },
    { role: 'assistant', content: '看完了' }
  ]);
});

check('删除会话连带消息', () => {
  const conv = chatStore.createConversation();
  chatStore.appendMessage(conv.id, 'user', 'x', 'ok');
  assert.strictEqual(chatStore.removeConversation(conv.id), true);
  assert.strictEqual(chatStore.getConversation(conv.id), null);
  assert.strictEqual(chatStore.listMessages(conv.id).length, 0);
});

console.log('工作区闸门');

check('只认库里的白名单与默认目录', () => {
  const allowed = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-db-ws-ok-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-db-ws-no-'));
  configStore.save({ workingDir: allowed, workspaces: [allowed] });
  const cfg = configStore.get();
  assert.strictEqual(workspaces.resolveWorkspace(cfg, allowed), allowed);
  assert.strictEqual(workspaces.resolveWorkspace(cfg, outside), null);
});

(async function finish() {
  console.log('对话上下文');

  await checkAsync('Agent 把本机历史与本轮指令一起送进模型', async () => {
    const agentRuntime = require('../src/main/agent');
    const modelClient = require('../src/main/agent/model-client');
    const original = modelClient.complete;
    let captured = null;
    let streamed = '';
    modelClient.complete = async (opts) => {
      captured = opts.messages;
      if (typeof opts.onDelta === 'function') opts.onDelta('好');
      return { text: '好', toolCalls: [] };
    };
    try {
      const cfg = configStore.get();
      const result = await agentRuntime.run({
        instruction: '第二问',
        cwd: cfg.workingDir,
        policy: 'deny',
        timeoutSec: 30,
        history: [
          { role: 'user', content: '第一问' },
          { role: 'assistant', content: '第一答' }
        ],
        onDelta: (chunk) => {
          streamed += chunk;
        }
      });
      assert.strictEqual(result.status, 'ok');
      assert.strictEqual(streamed, '好');
      assert.deepStrictEqual(captured.slice(0, 3), [
        { role: 'user', content: '第一问' },
        { role: 'assistant', content: '第一答' },
        { role: 'user', content: '第二问' }
      ]);
    } finally {
      modelClient.complete = original;
    }
  });

  await checkAsync('会话可以只挂勾选的技能与指定分身，参考文件正文随本轮进模型', async () => {
    const agentRuntime = require('../src/main/agent');
    const modelClient = require('../src/main/agent/model-client');
    agentConfig.saveSkill('sk-a', { name: 'A 技能', description: '做 A', body: 'A 的正文' });
    agentConfig.saveSkill('sk-b', { name: 'B 技能', description: '做 B', body: 'B 的正文' });
    agentConfig.savePersona('pe-a', { name: 'A 分身', body: 'A 的人设口径' });
    agentConfig.savePersona('pe-b', { name: 'B 分身', body: 'B 的人设口径' });
    const globalPersonaBefore = agentConfig.get().personaId;
    agentConfig.save({ personaId: 'pe-b' });

    const original = modelClient.complete;
    let lastSystem = '';
    let lastMessages = null;
    try {
      const cfg = configStore.get();
      modelClient.complete = async (opts) => {
        lastSystem = opts.system;
        lastMessages = opts.messages;
        return { text: '好', toolCalls: [] };
      };
      const res = await agentRuntime.run({
        instruction: '按 A 技能看这份资料',
        cwd: cfg.workingDir,
        policy: 'deny',
        timeoutSec: 30,
        skillIds: ['sk-a'],
        personaId: 'pe-a',
        references: [{ name: 'note.md', content: '资料正文在这里' }]
      });
      assert.strictEqual(res.status, 'ok');
      assert.ok(lastSystem.includes('sk-a'), '勾选的技能要进清单');
      assert.ok(!lastSystem.includes('sk-b'), '没勾选的技能不该进清单');
      assert.ok(lastSystem.includes('A 的人设口径'), '会话分身要作为附加人设');
      assert.ok(!lastSystem.includes('B 的人设口径'), '会话指定分身时不该用全局分身');
      const last = lastMessages[lastMessages.length - 1];
      assert.ok(last.content.includes('note.md'), '参考文件要标明文件名');
      assert.ok(last.content.includes('资料正文在这里'), '参考文件正文要随本轮指令进模型');

      await agentRuntime.run({
        instruction: '还是这句',
        cwd: cfg.workingDir,
        policy: 'deny',
        timeoutSec: 30,
        skillIds: [],
        personaId: 'none'
      });
      assert.ok(lastSystem.includes('sk-b'), '一个都没勾＝全部技能可用');
      assert.ok(!lastSystem.includes('B 的人设口径'), "'none' 应当不启用任何分身");

      // 没勾选的技能，模型就算点名也读不到正文。
      let round = 0;
      modelClient.complete = async (opts) => {
        round += 1;
        lastMessages = opts.messages;
        if (round === 1) {
          return { text: '', toolCalls: [{ id: 't1', name: 'load_skill', arguments: { id: 'sk-b' } }] };
        }
        return { text: '知道了', toolCalls: [] };
      };
      await agentRuntime.run({
        instruction: '读 B 技能',
        cwd: cfg.workingDir,
        policy: 'deny',
        timeoutSec: 30,
        skillIds: ['sk-a']
      });
      const toolRow = lastMessages.find((row) => row.role === 'tool');
      assert.ok(toolRow, '应当有一条工具回执');
      assert.ok(toolRow.content.includes('没有这条技能'), '未启用的技能不该被 load_skill 读到');
    } finally {
      modelClient.complete = original;
      agentConfig.save({ personaId: globalPersonaBefore });
    }
  });

  db.close();
  fs.rmSync(HOME, { recursive: true, force: true });

  if (failed) {
    console.log('\n' + failed + ' 项未通过');
    process.exit(1);
  }
  console.log('\n全部通过');
})();