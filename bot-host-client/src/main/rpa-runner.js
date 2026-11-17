'use strict';

/**
 * RPA 执行端：把平台派发的 Automa 工作流跑在这台机器的指纹窗口里。
 *
 * 链路：平台「RPA 任务」目标设备＝BotBuddy 浏览器 → 主机令牌通道领取 →
 * 打开（或复用）任务指定的指纹窗口 → 经 CDP 进 Automa 自己的扩展页发
 * `background--workflow:execute` → 盯 Automa 的执行台账到终态 → 回传结果。
 *
 * 四条底线：
 *  - 只连本机内核（127.0.0.1 上的 CDP 端口），不监听也不外连；
 *  - 不回传任何目标平台口令（平台侧本来就没存）；
 *  - 工作流正文原样交给 Automa，客户端不解释业务语义；
 *  - 发信方必须是「插件自己的页面」：Automa 后台只在 chrome.runtime.onMessage 上收
 *    `background--*`，而 service worker 自己 sendMessage 收不到自己（实测如此），
 *    所以这里找插件页面当发信方，不去调插件内部函数。
 */

const wsClient = require('./ws-client');
const launch = require('./fp/launch');
const profiles = require('./fp/profiles');

/**
 * 盯台账的间隔；「压根没开始跑」的判定窗口（秒）。
 *
 * 判定要留够余量：Automa 的运行中状态表只在状态被改写时才落存储，
 * 一次真的开始完全可能先只出现在执行台账里。窗口太短会把一次正常执行误判成失败。
 */
const POLL_MS = 1500;
const START_GRACE_SECONDS = 90;
/** 单条任务最长等待的兜底上限（秒）：任务自己没填或填得离谱时按它收口。 */
const DEFAULT_LIMIT_SECONDS = 3600;
const MAX_LIMIT_SECONDS = 24 * 3600;

const state = {
  active: false,
  taskId: 0,
  executionId: 0,
  name: '',
  profileId: '',
  note: '',
  startedAt: 0
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clip(value, max) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw.length > max ? raw.slice(0, max) : raw;
}

/** 一次只跑一条：平台侧抢单已经是原子的，本机再串行一遍，避免互相抢标签页。 */
function isBusy() {
  return state.active;
}

function status() {
  return { ...state };
}

/**
 * 浏览器级 CDP 会话：既能按 target 挂接调用，也能收事件。
 * ws-client.browserSession 只认 type==='page' 的第一个页面，这里需要自己挑发信页。
 */
function makeSession(client) {
  let seq = 0;
  const pending = new Map();
  client.onText((raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object' || !message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(message.error.message || 'CDP 调用失败'));
    else entry.resolve(message.result || {});
  });
  function call(method, params, sessionId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = (seq += 1);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('CDP 调用超时：' + method));
      }, timeoutMs || 10000);
      pending.set(id, { resolve, reject, timer });
      const payload = { id, method, params: params || {} };
      if (sessionId) payload.sessionId = sessionId;
      client.sendText(JSON.stringify(payload));
    });
  }
  return {
    call: (method, params, timeoutMs) => call(method, params, '', timeoutMs),
    callIn: (sessionId, method, params, timeoutMs) =>
      call(method, params, sessionId, timeoutMs),
    attach: async (targetId) => {
      const attached = await call('Target.attachToTarget', { targetId, flatten: true }, '', 8000);
      return attached.sessionId;
    },
    detach: (targetId) => call('Target.detachToTarget', { targetId }, '', 4000).catch(() => null),
    targets: async () => {
      const result = await call('Target.getTargets', {}, '', 8000);
      return Array.isArray(result.targetInfos) ? result.targetInfos : [];
    },
    close: () => client.close()
  };
}

/** 在某个 target 里执行表达式：表达式自己返回字符串，避免 CDP 远程对象跨上下文。 */
async function evalIn(session, targetId, expression, timeoutMs) {
  const sessionId = await session.attach(targetId);
  try {
    const result = await session.callIn(
      sessionId,
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      timeoutMs || 10000
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || '插件页执行异常');
    }
    return result.result ? result.result.value : undefined;
  } finally {
    await session.detach(targetId);
  }
}

function parseJson(raw, fallback) {
  try {
    const parsed = JSON.parse(String(raw ?? ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** 发信用的扩展页面：优先用内核里已经开着的插件页（Automa 的 newtab/popup）。 */
async function findSenderTarget(session) {
  const infos = await session.targets();
  const page = infos.find(
    (item) => item.type === 'page' && /^chrome-extension:\/\//.test(String(item.url || ''))
  );
  return page ? page.targetId : '';
}

/**
 * 一个插件页面都没有时，临时开一个当发信方。
 * 扩展 ID 不硬编码：解包加载时 ID 由内核按目录算，这里直接从已有插件相关 target 里取，
 * 完全没有线索才按商店 ID 试一次（内置包就是它）。
 */
async function openSenderTarget(session) {
  const infos = await session.targets();
  const ids = new Set();
  for (const item of infos) {
    const match = /^chrome-extension:\/\/([a-p]{32})\//.exec(String(item.url || ''));
    if (match) ids.add(match[1]);
  }
  if (!ids.size) ids.add('kfefaponhdnhhcggeamejckaddlkjmed');
  for (const id of ids) {
    for (const page of ['newtab.html', 'popup.html', 'params.html']) {
      try {
        const created = await session.call('Target.createTarget', {
          url: 'chrome-extension://' + id + '/' + page
        }, 8000);
        if (created && created.targetId) return created.targetId;
      } catch {
        /* 这个页面打不开就换下一个 */
      }
    }
  }
  return '';
}

/** 触发 Automa 跑这份流程：正文原样带上，任务参数当 Automa 变量注入，不弹参数框。 */
function triggerExpression(workflow, variables, tabId) {
  const options = { checkParams: false, variables, data: { variables } };
  if (tabId) options.tabId = tabId;
  const payload = JSON.stringify({ ...workflow, options });
  return (
    'new Promise((resolve) => {' +
    'try {' +
    'chrome.runtime.sendMessage({ name: "background--workflow:execute", data: ' +
    payload +
    ' }, () => resolve(JSON.stringify({ sent: true, error: chrome.runtime.lastError ? String(chrome.runtime.lastError.message) : "" })));' +
    '} catch (error) { resolve(JSON.stringify({ sent: false, error: String((error && error.message) || error) })); }' +
    '})'
  );
}

/**
 * 一次读回「还在跑吗」+「跑成什么样」：
 * workflowStates 是 Automa 的运行中状态表，logs 库的 items 表是它的执行台账（历史页同源）。
 */
function outcomeExpression(workflowId, notBefore) {
  return (
    '(async () => {' +
    'const out = { running: false, item: null, error: "" };' +
    'try {' +
    'const stored = await chrome.storage.local.get("workflowStates");' +
    'const raw = stored ? stored.workflowStates : null;' +
    // Automa 在不同版本里把这个表存成数组或按 id 索引的对象，两种都要认
    'const rows = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : []);' +
    'out.running = rows.some((row) => row && row.workflowId === ' +
    JSON.stringify(workflowId) +
    ');' +
    '} catch (error) { out.error += "状态表读取失败:" + String((error && error.message) || error); }' +
    'out.item = await new Promise((resolve) => {' +
    'let request;' +
    'try { request = indexedDB.open("logs", 1); }' +
    'catch (error) { out.error += " 台账打不开:" + String(error); return resolve(null); }' +
    'request.onerror = () => resolve(null);' +
    'request.onsuccess = () => {' +
    'const database = request.result;' +
    'try {' +
    'if (!database.objectStoreNames.contains("items")) { resolve(null); return; }' +
    'const store = database.transaction("items", "readonly").objectStore("items");' +
    'const cursorRequest = store.openCursor(null, "prev");' +
    'let scanned = 0;' +
    'cursorRequest.onsuccess = (event) => {' +
    'const cursor = event.target.result;' +
    'if (!cursor || scanned >= 200) { resolve(null); return; }' +
    'scanned += 1;' +
    'const value = cursor.value;' +
    'if (value && value.workflowId === ' +
    JSON.stringify(workflowId) +
    ' && Number(value.startedAt) >= ' +
    Number(notBefore) +
    ') { resolve({ status: String(value.status || ""), message: String(value.message || ""), startedAt: Number(value.startedAt) || 0, endedAt: Number(value.endedAt) || 0 }); return; }' +
    'cursor.continue();' +
    '};' +
    'cursorRequest.onerror = () => resolve(null);' +
    '} catch (error) { out.error += " 台账读取异常:" + String((error && error.message) || error); resolve(null); } finally { try { database.close(); } catch (ignored) {} }' +
    '};' +
    '});' +
    'return JSON.stringify(out);' +
    '})()'
  );
}

/** 窗口里的真实网页标签：有起始地址先去起始地址，再挑一个当工作流的落脚点。 */
async function pickWorkTab(session, senderTargetId, startUrl) {
  const query = startUrl ? { url: startUrl } : {};
  const expression =
    '(async () => { try { let tabs = await chrome.tabs.query(' +
    JSON.stringify(query) +
    '); if (!tabs.length && ' +
    (startUrl ? 'true' : 'false') +
    ') tabs = await chrome.tabs.query({ currentWindow: true, active: true });' +
    'return JSON.stringify(tabs.map((tab) => ({ id: tab.id, url: String(tab.url || ""), active: !!tab.active })));' +
    '} catch (error) { return JSON.stringify({ error: String((error && error.message) || error) }); } })()';
  const parsed = parseJson(await evalIn(session, senderTargetId, expression, 8000), null);
  if (!parsed || !Array.isArray(parsed)) {
    if (parsed && parsed.error) throw new Error('取标签页失败：' + parsed.error);
    return 0;
  }
  const usable = parsed.filter(
    (tab) => tab.id && /^https?:\/\//.test(tab.url)
  );
  if (!usable.length) return 0;
  const hit = usable.find((tab) => tab.url === startUrl) || usable.find((tab) => tab.active) || usable[0];
  return Number(hit.id) || 0;
}

/** 任务没指定窗口时：用 Agent 默认窗口，没有就取最近更新的一个（列表按 updated_at 倒序）。 */
function autoPickProfile() {
  const agent = profiles.agentProfile();
  if (agent && agent.id) return agent.id;
  const list = profiles.list();
  return list.length ? list[0].id : '';
}

function limitSecondsOf(task) {
  const raw = Number(task.timeoutSeconds);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT_SECONDS;
  return Math.min(Math.max(Math.round(raw), 30), MAX_LIMIT_SECONDS);
}

function assertWorkflow(workflow) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    throw new Error('派发正文不是 Automa 工作流 JSON 对象');
  }
  const drawflow = workflow.drawflow;
  if (!drawflow || !Array.isArray(drawflow.nodes) || !drawflow.nodes.length) {
    throw new Error('这份 Automa 流程里没有任何区块：请在 Automa 画布补齐后重新导出');
  }
  const labels = drawflow.nodes.map((node) => String((node && node.label) || ''));
  if (!labels.includes('trigger')) {
    throw new Error('这份 Automa 流程里没有触发区块（Trigger）：Automa 无法开始执行');
  }
}

/** 起窗口 → 找发信页 → 触发工作流 → 盯台账到终态。 */
async function execute(task) {
  assertWorkflow(task.workflow);
  const requested = clip(task.profileId, 64);
  const profileId = requested || autoPickProfile();
  const profile = profiles.get(profileId);
  if (!profile) {
    throw new Error(
      '指纹窗口「' + (requested || '（本机还没有任何窗口）') + '」不存在：请在客户端「浏览器」页新建后重试'
    );
  }
  state.note = '正在打开指纹窗口「' + (profile.name || profileId) + '」';
  const opened = await launch.open(profileId);
  const port = Number(opened.cdpPort) || 0;
  if (!port) throw new Error('指纹窗口没有可用的调试端口');

  const endpoint = await wsClient.browserWs(port);
  if (!endpoint) throw new Error('指纹内核 CDP 不可用');
  const client = await wsClient.connect(endpoint, { timeoutMs: 8000 });
  const session = makeSession(client);
  try {
    let senderTargetId = await findSenderTarget(session);
    if (!senderTargetId) senderTargetId = await openSenderTarget(session);
    if (!senderTargetId) {
      throw new Error(
        '这个窗口里找不到 Automa 插件页面：请确认客户端内置插件已随包分发（「浏览器」页打开窗口后手动点一次插件图标），再重开该窗口'
      );
    }
    state.note = '已连上 Automa，正在准备落脚点';

    const startUrl = clip(task.startUrl, 2000);
    if (startUrl) {
      try {
        await session.call('Target.createTarget', { url: startUrl }, 8000);
        await sleep(1000);
      } catch {
        state.note = '起始地址没打开，继续按流程自身跑';
      }
    }
    const tabId = startUrl ? await pickWorkTab(session, senderTargetId, startUrl) : 0;

    const workflow = task.workflow;
    const workflowId = clip(workflow.id, 64) || 'botbuddy-' + state.executionId;
    const notBefore = Date.now() - 2000;
    state.note = '已触发工作流，等待执行结果';
    const triggered = parseJson(
      await evalIn(
        session,
        senderTargetId,
        triggerExpression({ ...workflow, id: workflowId }, task.params || {}, tabId),
        8000
      ),
      {}
    );
    if (!triggered || !triggered.sent) {
      throw new Error('触发 Automa 失败：' + ((triggered && triggered.error) || '插件没有响应'));
    }
    if (triggered.error) {
      throw new Error('Automa 后台拒了这次触发：' + triggered.error);
    }
    return await waitForOutcome(session, senderTargetId, workflowId, notBefore, task);
  } finally {
    client.close();
  }
}

/** 触发之后到终态：读台账、认「没开始」、按 timeoutSeconds 收口。 */
async function waitForOutcome(session, senderTargetId, workflowId, notBefore, task) {
  const limit = limitSecondsOf(task);
  const deadline = Date.now() + limit * 1000;
  const startedBy = Date.now() + START_GRACE_SECONDS * 1000;
  let seenRunning = false;
  for (;;) {
    if (Date.now() > deadline) {
      return {
        status: 'failed',
        message: '超过 ' + limit + ' 秒仍未跑完，客户端已停止等待',
        output: { workflowId, seenRunning }
      };
    }
    await sleep(POLL_MS);
    const outcome = parseJson(
      await evalIn(session, senderTargetId, outcomeExpression(workflowId, notBefore), 10000),
      null
    );
    if (!outcome) continue;
    if (outcome.item) {
      const status = String(outcome.item.status || '').toLowerCase();
      const durationMs =
        outcome.item.endedAt && outcome.item.startedAt
          ? outcome.item.endedAt - outcome.item.startedAt
          : null;
      return {
        status: status === 'success' ? 'success' : 'failed',
        message:
          status === 'success'
            ? ''
            : outcome.item.message || 'Automa 把这次执行记为「' + outcome.item.status + '」',
        output: { workflowId, automaStatus: outcome.item.status, durationMs }
      };
    }
    if (outcome.running) {
      seenRunning = true;
      continue;
    }
    if (!seenRunning && Date.now() > startedBy) {
      return {
        status: 'failed',
        message:
          'Automa 没有开始执行这份工作流：通常是流程正文里缺触发区块、或这个窗口的插件没有响应。' +
          (outcome.error ? '（插件侧提示：' + outcome.error + '）' : ''),
        output: { workflowId }
      };
    }
  }
}

module.exports = {
  isBusy,
  status,
  // 与 Automa 的通信契约（消息名与报文形状）单独导出：改动这几串字符就等于改契约，
  // 需要 tools/_rpa-unit.js 里那条假 CDP 回归一起过。
  buildTriggerExpression: triggerExpression,
  buildOutcomeExpression: outcomeExpression,
  assertWorkflow,
  limitSecondsOf,
  /** 跑一条已认领的任务：任何异常都收口成一次 failed 回传，绝不让任务卡在「执行中」。 */
  run: async (task) => {
    if (state.active) throw new Error('本机正在跑另一条 RPA 任务，请等它结束');
    state.active = true;
    state.taskId = Number(task.taskId) || 0;
    state.executionId = Number(task.executionId) || 0;
    state.name = clip(task.taskName, 200);
    state.profileId = clip(task.profileId, 64);
    state.startedAt = Date.now();
    state.note = '已领取，正在准备窗口';
    try {
      const outcome = await execute(task);
      state.note = outcome.status === 'success' ? '执行完成' : '执行结束（失败）';
      return outcome;
    } catch (error) {
      const message = clip((error && error.message) || '执行失败', 500);
      state.note = message;
      return { status: 'failed', message, output: {} };
    } finally {
      state.active = false;
    }
  }
};
