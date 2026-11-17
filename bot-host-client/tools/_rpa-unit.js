'use strict';

/**
 * _rpa-unit.js — RPA 执行端与 Automa 的通信契约回归（不起内核、不连平台）。
 *
 * 这里守的是三段最容易腐坏的东西：
 *   1) 发给 Automa 的消息名与报文形状（改了就等于换契约，插件收不到）；
 *   2) 读执行台账的表达式（库名 logs / 表名 items / workflowId + startedAt 判重）；
 *   3) 工作流正文的下线判断（缺区块 / 缺触发区块 / 超时收口）。
 */

const assert = require('node:assert/strict');

const HOME = process.env.BOTBUDDY_HOME;
if (HOME) process.env.BOTBUDDY_HOME = HOME;

const rpa = require('../src/main/rpa-runner');

function ok(name) {
  console.log('  ok   ' + name);
}

const WORKFLOW = {
  id: 'wf-demo',
  name: '演示流程',
  drawflow: { nodes: [{ id: 'n1', label: 'trigger', data: {} }, { id: 'n2', label: 'new-tab', data: {} }], edges: [] }
};

/* 1. 触发报文：必须是 background--workflow:execute + data 里就是工作流本体 */

const trigger = rpa.buildTriggerExpression(WORKFLOW, { keyword: '手机壳' }, 42);
assert.ok(trigger.includes('background--workflow:execute'), '消息名要对');
const payloadStart = trigger.indexOf('data: ');
const payloadJson = trigger.slice(payloadStart + 6, trigger.indexOf(' }, () => resolve'));
const data = JSON.parse(payloadJson);
assert.equal(data.id, 'wf-demo', '工作流本体直接放在 data 里');
assert.equal(data.drawflow.nodes.length, 2, '区块原样带上，客户端不解释');
assert.equal(data.options.checkParams, false, '不弹参数框');
assert.equal(data.options.tabId, 42, '指定落脚点标签页');
assert.deepEqual(data.options.variables, { keyword: '手机壳' }, '任务参数当 Automa 变量注入');
assert.deepEqual(data.options.data.variables, { keyword: '手机壳' }, '离屏执行路径读 options.data.variables');
ok('触发报文 = background--workflow:execute，正文与参数形状不变');

/* 没有标签页时不要塞 tabId：Automa 会自己开页，塞 0 会让它找不到活动标签 */

const noTab = JSON.parse(
  rpa.buildTriggerExpression(WORKFLOW, {}, 0).match(/data: (\{.*?\}) \}, \(\) => resolve/s)[1]
);
assert.ok(!('tabId' in noTab.options), '没落脚点时不传 tabId');
ok('tabId 缺省时不写入报文');

/* 2. 台账表达式：库 logs / 表 items / 按 workflowId + startedAt 取本次 */

const outcome = rpa.buildOutcomeExpression('wf-demo', 1700000000000);
assert.ok(outcome.includes('indexedDB.open("logs", 1)'), '读 Automa 的 logs 库');
assert.ok(outcome.includes('"items"'), '读 items 台账表');
assert.ok(outcome.includes('chrome.storage.local.get("workflowStates")'), '同时读运行中状态表');
assert.ok(outcome.includes('value.workflowId === "wf-demo"'), '按工作流 ID 取本次记录');
assert.ok(outcome.includes('Number(value.startedAt) >= 1700000000000'), '早于本次触发的历史记录不算');
assert.ok(outcome.includes('openCursor(null, "prev")'), '从最新一条往前扫');
assert.ok(outcome.includes('scanned >= 200'), '扫描有上限，不给历史大的库雪崩');
ok('台账表达式锁定 logs/items/workflowStates 三处依赖');

/* 3. 正文下线判断 */

assert.throws(() => rpa.assertWorkflow(null), /不是 Automa 工作流 JSON 对象/, '空正文要拦');
assert.throws(
  () => rpa.assertWorkflow({ id: 'x', drawflow: { nodes: [] } }),
  /没有任何区块/,
  '空流程要拦'
);
assert.throws(
  () => rpa.assertWorkflow({ id: 'x', drawflow: { nodes: [{ id: 'a', label: 'new-tab' }] } }),
  /没有触发区块/,
  '缺 trigger 区块 Automa 起不来，要提前说清'
);
rpa.assertWorkflow(WORKFLOW);
ok('正文校验：空对象 / 无区块 / 无触发区块都有明确中文原因');

/* 4. 超时收口：任务没填、填得离谱都不能把本机拖死 */

assert.equal(rpa.limitSecondsOf({}), 3600, '没填按默认一小时');
assert.equal(rpa.limitSecondsOf({ timeoutSeconds: 5 }), 30, '过短抬到 30 秒');
assert.equal(rpa.limitSecondsOf({ timeoutSeconds: 999999999 }), 86400, '过长压到一天');
assert.equal(rpa.limitSecondsOf({ timeoutSeconds: 'abc' }), 3600, '非数字回落默认');
ok('超时窗口有上下限');

/* 5. 本机串行闸：忙时不再领第二条 */

assert.equal(rpa.isBusy(), false, '初始空闲');
assert.equal(rpa.status().active, false, '状态快照可读');
ok('空闲状态一致');

console.log('\n_rpa-unit: 5 组断言全部通过');
