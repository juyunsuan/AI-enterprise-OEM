'use strict';

/**
 * _pipeline-unit.js — 客户端执行链路的端到端回归（不联网、用本机假模型）：
 *
 *   平台指令 → TaskRunner → 工作区回落 → Agent 主循环 → 模型（本地桩）
 *   → 技能（load_skill）/ 插件工具 → 回执文本与 effectiveWorkspace
 *
 * 另外单独钉住：
 *   · 不选工作区＝默认工作区，且默认目录不存在时会当场建出来；
 *   · Chrome 桥接的「入队 → 插件取活 → 回结果」闭环。
 *
 * 用法：node tools/_pipeline-unit.js
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// 必须最先指定数据目录：db.js 在 require 时就读 BOTBUDDY_HOME。
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-pipeline-'));
process.env.BOTBUDDY_HOME = HOME;

/** better-sqlite3 是 Electron ABI：本机 Node 直跑报 ABORT 时用 electron 以 Node 模式重跑。 */
function reexecUnderElectron(err) {
  if (process.env.BOTBUDDY_PIPELINE_REEXEC) return false;
  if (!/NODE_MODULE_VERSION|compiled against a different Node|was compiled against/.test(err.message)) {
    return false;
  }
  const electronBin = require('electron');
  if (typeof electronBin !== 'string') return false;
  const res = spawnSync(electronBin, [__filename], {
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
      ELECTRON_RUN_AS_NODE: '1',
      BOTBUDDY_PIPELINE_REEXEC: '1',
      BOTBUDDY_HOME: HOME
    })
  });
  process.exit(res.status === null ? 1 : res.status);
}

try {
  new (require('better-sqlite3'))(':memory:').close();
} catch (err) {
  if (!reexecUnderElectron(err)) {
    console.error('  FAIL 无法加载 better-sqlite3：' + err.message.split('\n')[0]);
    process.exit(1);
  }
}

const db = require('../src/main/db');
const configStore = require('../src/main/config-store');
const agentConfig = require('../src/main/agent/config');
const agentRuntime = require('../src/main/agent');
const workspaces = require('../src/main/workspaces');
const plugins = require('../src/main/plugins');
const TaskRunner = require('../src/main/task-runner');
const { ChromeBridge } = require('../src/main/chrome-bridge');

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('  ok   ' + name);
  } catch (err) {
    failed += 1;
    console.log('  FAIL ' + name + ' — ' + err.message);
  }
}

function sse(res, payloads) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache'
  });
  for (const payload of payloads) res.write('data: ' + JSON.stringify(payload) + '\n\n');
  res.write('data: [DONE]\n\n');
  res.end();
}

function delta(content) {
  return { choices: [{ delta: { content } }] };
}

function toolCall(name, args) {
  return {
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, id: 'call_1', function: { name, arguments: JSON.stringify(args) } }
          ]
        }
      }
    ]
  };
}

/** 假模型：按调用次数依次回放预设脚本，并记录每次收到的消息，供断言用。 */
function startModelStub(scripts) {
  const seen = [];
  let round = 0;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      let body = {};
      try {
        body = JSON.parse(raw || '{}');
      } catch (err) {
        body = {};
      }
      seen.push(body);
      const script = scripts[Math.min(round, scripts.length - 1)];
      round += 1;
      sse(res, Array.isArray(script) ? script : [script]);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, seen, baseUrl: 'http://127.0.0.1:' + server.address().port + '/v1' });
    });
  });
}

(async function main() {
  db.open();
  const cfg = configStore.get();

  console.log('工作区');

  await check('默认工作区目录不存在时自动建出来', () => {
    const dir = path.join(HOME, 'nested', 'ws');
    configStore.save({ workingDir: dir });
    const resolved = workspaces.defaultWorkspace(configStore.get());
    assert.strictEqual(resolved, dir);
    assert.ok(fs.statSync(dir).isDirectory());
  });

  await check('平台不选工作区 → 落到默认工作区', () => {
    const resolved = workspaces.resolveForRun(configStore.get(), '');
    assert.strictEqual(resolved, configStore.get().workingDir);
  });

  await check('平台给的目录不在白名单 → 回落默认工作区而不是报错', () => {
    const resolved = workspaces.resolveForRun(configStore.get(), '/definitely/not/here');
    assert.strictEqual(resolved, configStore.get().workingDir);
  });

  console.log('模型链路');

  const stub = await startModelStub([[delta('已收到平台指令：pipeline-ok')]]);
  configStore.save({ permissionPolicy: 'allow-edits' });
  agentConfig.saveChannel({
    id: 'stub',
    name: '测试渠道',
    protocol: 'openai',
    baseUrl: stub.baseUrl,
    apiKey: 'test',
    model: 'stub-model'
  });
  agentConfig.setActiveChannel('stub');

  await check('平台指令经 TaskRunner → Agent → 模型，结果与工作区原样回执', async () => {
    const acks = [];
    let okResolve;
    const done = new Promise((resolve) => (okResolve = resolve));
    const runner = new TaskRunner({
      // 与 main.js 同一口径：目录由 workspaces.resolveForRun 裁决。
      runAgent: (input) =>
        agentRuntime.run({
          instruction: input.instruction,
          cwd: workspaces.resolveForRun(configStore.get(), input.cwd),
          policy: configStore.get().permissionPolicy,
          timeoutSec: input.timeoutSec,
          onProgress: input.onChunk,
          shouldCancel: input.shouldCancel
        }),
      onProgress: async () => ({ cancelRequested: false }),
      onAck: async (code, payload) => {
        acks.push(payload);
        okResolve();
      }
    });
    runner.enqueue({
      commandCode: 'cmd-pipeline',
      instruction: '请回复 pipeline-ok',
      cwd: '',
      timeoutSec: 60
    });
    await done;
    assert.strictEqual(acks.length, 1);
    assert.strictEqual(acks[0].ok, true);
    assert.ok(acks[0].text.includes('pipeline-ok'), acks[0].text);
    assert.strictEqual(acks[0].effectiveWorkspace, configStore.get().workingDir);
    // 模型确实收到了平台那句话
    assert.ok(JSON.stringify(stub.seen[0]).includes('请回复 pipeline-ok'));
  });

  console.log('技能');

  agentConfig.saveSkill('daily-report', {
    name: '日报',
    description: '按固定格式写日报',
    body: '日报必须包含：今日完成、明日计划、风险三项。'
  });

  const skillStub = await startModelStub([
    [toolCall('load_skill', { id: 'daily-report' })],
    [delta('技能已读取：今日完成 / 明日计划 / 风险')]
  ]);
  agentConfig.saveChannel({
    id: 'stub',
    name: '测试渠道',
    protocol: 'openai',
    baseUrl: skillStub.baseUrl,
    apiKey: 'test',
    model: 'stub-model'
  });

  await check('技能进上下文并可被 load_skill 读出正文', async () => {
    const result = await agentRuntime.run({ instruction: '写今天的日报', cwd: configStore.get().workingDir });
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.text.includes('今日完成'));
    const system = JSON.stringify(skillStub.seen[0]);
    assert.ok(system.includes('日报'), '系统提示词应列出技能');
    // 第二轮请求里带着 load_skill 的工具结果（技能正文）
    assert.ok(JSON.stringify(skillStub.seen[1]).includes('今日完成、明日计划、风险'));
  });

  console.log('Agent 插件');

  const pluginServer = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ echo: req.url, ok: true }));
  });
  await new Promise((resolve) => pluginServer.listen(0, '127.0.0.1', resolve));
  const pluginBase = 'http://127.0.0.1:' + pluginServer.address().port;
  plugins.save({
    name: '回声接口',
    kind: 'http',
    description: '把查询参数原样回显',
    params: { q: { type: 'string', description: '要回显的词', required: true } },
    config: { method: 'GET', url: pluginBase + '/echo' }
  });

  const pluginStub = await startModelStub([
    [toolCall('plugin_p' + '', { q: 'hello' })],
    [delta('插件返回 hello')]
  ]);
  // 插件 id 由 save 自动生成，按实际工具名重跑一次断言
  const savedPlugin = plugins.list()[0];

  await check('插件工具进模型清单并真实发起请求', async () => {
    assert.ok(savedPlugin, '插件应已保存');
    assert.deepStrictEqual(
      plugins.toolDefs().map((row) => row.name),
      [savedPlugin.toolName]
    );
    const direct = await plugins.runTool(savedPlugin, { q: 'hello' }, { policy: 'allow-edits' });
    assert.strictEqual(direct.status, 200);
    assert.ok(direct.body.includes('q=hello'));
  });

  await check('模型能调用插件工具并把结果回灌', async () => {
    const callStub = await startModelStub([
      [toolCall(savedPlugin.toolName, { q: 'hello' })],
      [delta('插件返回 hello')]
    ]);
    agentConfig.saveChannel({
      id: 'stub',
      name: '测试渠道',
      protocol: 'openai',
      baseUrl: callStub.baseUrl,
      apiKey: 'test',
      model: 'stub-model'
    });
    const result = await agentRuntime.run({ instruction: '调用回声接口', cwd: configStore.get().workingDir });
    assert.strictEqual(result.status, 'ok');
    assert.ok(JSON.stringify(callStub.seen[1]).includes('q=hello'));
    // 工具清单里确实带上了插件
    assert.ok(JSON.stringify(callStub.seen[0].tools || []).includes(savedPlugin.toolName));
  });

  await check('会话勾选插件时只注入选中的插件', async () => {
    const second = plugins.save({
      name: '第二个插件',
      kind: 'http',
      description: '另一个接口',
      config: { method: 'GET', url: pluginBase + '/other' }
    });
    const filterStub = await startModelStub([[delta('只看选中的工具')]]);
    agentConfig.saveChannel({
      id: 'filter',
      name: '筛选测试渠道',
      protocol: 'openai',
      baseUrl: filterStub.baseUrl,
      apiKey: 'test',
      model: 'stub-model'
    });
    const result = await agentRuntime.run({
      instruction: '看下可用工具',
      cwd: configStore.get().workingDir,
      channelId: 'filter',
      pluginIds: [savedPlugin.id]
    });
    assert.strictEqual(result.status, 'ok');
    const tools = JSON.stringify(filterStub.seen[0].tools || []);
    assert.ok(tools.includes(savedPlugin.toolName), '选中的插件应在工具清单里');
    assert.ok(!tools.includes(second.plugin.toolName), '未勾选的插件不应注入');
    plugins.remove(second.plugin.id);
    filterStub.server.close();
  });

  await check('会话指定的模型渠道优先生效', async () => {
    const secondStub = await startModelStub([[delta('来自第二个渠道')]]);
    const saved = agentConfig.saveChannel({
      name: '第二通道',
      protocol: 'openai',
      baseUrl: secondStub.baseUrl,
      apiKey: 'test',
      model: 'second-model'
    });
    const result = await agentRuntime.run({
      instruction: '你好',
      cwd: configStore.get().workingDir,
      channelId: saved.id
    });
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.text, '来自第二个渠道');
    secondStub.server.close();
  });

  console.log('Chrome 桥接');

  await check('桥接闭环：Agent 入队 → 插件取活 → 回结果', async () => {
    const port = 40000 + Math.floor(Math.random() * 2000);
    const bridge = new ChromeBridge();
    const started = await bridge.start({ token: 'tk-test', port });
    assert.strictEqual(started.ok, true);
    const base = 'http://127.0.0.1:' + started.port;
    const hello = await fetch(base + '/hello', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bridge-token': 'tk-test' },
      body: JSON.stringify({ name: '测试插件', version: '1.0.0' })
    });
    assert.strictEqual(hello.status, 200);
    assert.strictEqual(bridge.status().connected, true);

    const call = bridge.call('tabs.list', {});
    const poll = await fetch(base + '/poll?token=tk-test&wait=2000');
    const polled = await poll.json();
    assert.ok(polled.job && polled.job.action === 'tabs.list');
    await fetch(base + '/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bridge-token': 'tk-test' },
      body: JSON.stringify({ id: polled.job.id, ok: true, data: [{ id: 1, title: '示例页' }] })
    });
    const result = await call;
    assert.strictEqual(result[0].title, '示例页');
    bridge.stop();
  });

  await check('离线时浏览器工具不注入，调用直接给出人话错误', async () => {
    const bridge = new ChromeBridge();
    assert.deepStrictEqual(require('../src/main/chrome-bridge').toolDefs(bridge), []);
    await assert.rejects(() => bridge.call('tabs.list', {}), /未启动/);
  });

  pluginServer.close();
  stub.server.close();
  skillStub.server.close();
  db.close();

  console.log('');
  if (failed) {
    console.log(failed + ' 项失败');
    process.exit(1);
  }
  console.log('全部通过');
  // 假模型/桥接服务用的是本地端口，句柄不一定随 close 立刻释放；测试跑完直接退出。
  process.exit(0);
})();