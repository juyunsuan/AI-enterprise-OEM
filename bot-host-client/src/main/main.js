'use strict';

/**
 * main.js — BotBuddy 客户端主进程。
 *
 * 职责：
 *   · 单实例锁；关窗不退出（托盘常驻）。
 *   · 一个窗口：左侧导航切换「概览 / 设备绑定 / Agent（模型·技能·分身·记忆）/ 工作区·权限 / 任务·日志」。
 *     设备绑定（连接码 + 主机令牌）并进 Agent 菜单，不再单独开配对窗口。
 *   · 心跳：每 N 秒 POST /heartbeat，取回平台下发的自然语言指令，交给本机 Agent 执行，
 *     过程与结果各自回传；同时把 Agent 状态与工作区候选上报给平台。
 *   · 本机 Agent（模型渠道、技能、数字分身、长期记忆、本地工具）完全在本机，
 *     与平台侧 Agent 没有任何关系：平台只说「做什么」。
 *   · 全部本机状态存 SQLite（~/.botbuddy/botbuddy.db）。
 *   · contextBridge 白名单 IPC（见 preload.js）。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, BrowserWindow, ipcMain, shell, clipboard, nativeTheme, dialog } = require('electron');

const db = require('./db');
const configStore = require('./config-store');
const platform = require('./platform-client');
const Pairing = require('./pairing');
const TaskRunner = require('./task-runner');
const selfcheck = require('./selfcheck');
const TrayController = require('./tray');
const workspaces = require('./workspaces');
const agentConfig = require('./agent/config');
const agentRuntime = require('./agent');
const chatStore = require('./chat-store');
const referenceStore = require('./references');
const plugins = require('./plugins');
const pluginPackage = require('./plugin-package');
const skillPackage = require('./skill-package');
const chromeBridge = require('./chrome-bridge');
const chromeExtensions = require('./chrome-extensions');
const builtinBrowser = require('./builtin-browser');
const crypto = require('crypto');

const PRODUCT_NAME = 'BotBuddy';
const LOG_LINES = [];
const WINDOW_ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');

let mainWindow = null;
let trayController = null;

let pairing = null;
let runner = null;

let heartbeatTimer = null;
let heartbeating = false;
let lastHeartbeat = null;
let connected = false;
let boundHostName = '';
let stopping = false;

/** 平台积分余额：登录/心跳/会话刷新时更新，只放内存（不每次心跳写库）。 */
let userPoints = null;
/** 本机改模型后的上报去抖：同步完再心跳，避免心跳把旧授权盖回来。 */
let localSyncTimer = null;
let localSyncSkipPlatform = true;

/** 最近一次执行失败的机器码：READY 与 FAILED 之间的唯一区分，配置一改就清掉。 */
let agentLastError = null;

/** 本机对话正在跑的轮次：conversationId → { cancel }。与平台任务共用一个执行位。 */
const chatRuns = new Map();

function agentBusy() {
  return (runner ? runner.isRunning() : false) || chatRuns.size > 0;
}

// --- logging ---------------------------------------------------------------

function log(level, msg) {
  const line = new Date().toISOString() + ' [' + level + '] ' + msg;
  LOG_LINES.unshift(line);
  if (LOG_LINES.length > 400) LOG_LINES.length = 400;
  process.stdout.write(line + '\n');
  broadcast('log:append', line);
}

function getLogs() {
  return LOG_LINES.slice(0, 300).join('\n');
}

// --- window ----------------------------------------------------------------

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, payload);
    } catch (err) {
      /* 窗口正在销毁 */
    }
  }
}

function baseWindowOptions(title) {
  return {
    title,
    icon: WINDOW_ICON,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f5f5f5',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
}

function createMainWindow(showImmediately) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (showImmediately) {
      mainWindow.show();
      mainWindow.focus();
    }
    return mainWindow;
  }
  mainWindow = new BrowserWindow(
    Object.assign(baseWindowOptions(PRODUCT_NAME), {
      width: 1080,
      height: 760,
      minWidth: 900,
      minHeight: 600,
      resizable: true,
      show: !!showImmediately
    })
  );
  mainWindow.loadFile(path.join(RENDERER_DIR, 'app.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('close', (e) => {
    // 关窗只是收进托盘：客户端要一直在后台接活。
    if (!stopping) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

/** 托盘「Agent 配置」：开窗并跳到 Agent 那一段。 */
function openWindowAt(target) {
  createMainWindow(true);
  if (mainWindow) {
    const send = () => broadcast('nav:go', target);
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }
}

// --- state snapshot for renderer -------------------------------------------

/** 本机 Agent 的状态摘要：只给客户端自己的界面看，模型与技能配置不上报平台。 */
function agentCaps() {
  const cfg = configStore.get();
  const channel = agentConfig.activeChannel();
  const stateInfo = agentRuntime.state({
    busy: agentBusy(),
    lastError: agentLastError
  });
  return {
    state: stateInfo.state,
    version: agentRuntime.CLIENT_VERSION,
    channel: channel ? channel.name : '',
    model: channel ? channel.model : '',
    skillCount: agentConfig.listSkills().length,
    personaCount: agentConfig.listPersonas().length,
    workspace: workspaces.defaultWorkspace(cfg),
    permissionPolicy: cfg.permissionPolicy,
    failReason: stateInfo.failReason,
    workspaces: workspaces.listWorkspaces(cfg).slice(0, 200)
  };
}

/**
 * 心跳上报的能力：平台只拿工作区与权限档。
 * 模型渠道、技能与数字分身是客户端本地配置，平台不需要也看不到，别塞进上报体。
 */
function heartbeatCaps() {
  const cfg = configStore.get();
  return {
    agent: {
      version: agentRuntime.CLIENT_VERSION,
      workspace: workspaces.defaultWorkspace(cfg),
      permissionPolicy: cfg.permissionPolicy,
      workspaces: workspaces.listWorkspaces(cfg).slice(0, 200)
    }
  };
}

function stateSnapshot() {
  const cfg = configStore.get();
  return {
    productName: PRODUCT_NAME,
    baseUrl: cfg.baseUrl,
    workingDir: cfg.workingDir,
    heartbeatSeconds: cfg.heartbeatSeconds,
    deviceName: cfg.deviceName,
    autoStart: cfg.autoStart,
    paired: configStore.isPaired(),
    connected,
    boundHostName,
    lastHeartbeat,
    running: agentBusy(),
    chatRunning: chatRuns.size > 0,
    queued: runner ? runner.pendingCount() : 0,
    permissionPolicy: cfg.permissionPolicy,
    agent: agentCaps(),
    loggedIn: !!cfg.userToken,
    userName: cfg.userName,
    userEmail: cfg.userEmail,
    userAvatar: cfg.userAvatar,
    points: userPoints,
    dbPath: db.DB_FILE
  };
}

/** Agent 页要的全量数据：渠道、技能、分身、记忆、工作区、权限。 */
function agentSnapshot() {
  const cfg = configStore.get();
  const conf = agentConfig.get();
  return {
    config: conf,
    channels: conf.channels,
    channel: agentConfig.activeChannel(),
    activeChannelId: conf.activeChannelId,
    skills: agentConfig.listSkills(),
    personas: agentConfig.listPersonas(),
    activeSkills: agentConfig.activeSkills().map((row) => row.id),
    persona: agentConfig.activePersona(),
    memory: agentConfig.readMemory(),
    workspaces: workspaces.listWorkspaces(cfg),
    workingDir: cfg.workingDir,
    permissionPolicy: cfg.permissionPolicy,
    agent: agentCaps(),
    dbPath: db.DB_FILE
  };
}

function refreshAgentSnapshot() {
  broadcast('agent:update', agentSnapshot());
}

function statusLabel() {
  if (!configStore.isPaired()) return '等待配对';
  if (connected) return '已连接';
  return '平台不可达';
}

// --- pairing ---------------------------------------------------------------

function setupPairing() {
  pairing = new Pairing({
    getConfig: () => configStore.get(),
    onUpdate: (s) => {
      broadcast('pair:update', Object.assign({}, s, { selfcheck: null }));
    },
    onPaired: (info) => {
      log('info', 'paired as ' + (info.hostName || 'device') + ' hostId=' + info.hostId);
      broadcast(
        'pair:update',
        Object.assign({}, pairing.snapshot(), { status: 'ok', message: '配对成功' })
      );
      adoptToken(info.token, info.hostName);
    },
    onLog: log
  });
}

/**
 * 拿到主机令牌后的统一动作（连接码认领 / 手动粘贴走同一条）：落盘、开机自启、
 * 起心跳，并把界面切到概览。
 */
function adoptToken(token, hostName) {
  configStore.save({ token: token || '', autoStart: true });
  boundHostName = hostName || '';
  applyAutoStart(true);
  startHeartbeat();
  broadcast('state:update', stateSnapshot());
  if (pairing) pairing.stopTimers();
  createMainWindow(true);
  broadcast('nav:go', 'overview');
  if (trayController) trayController.updateMenu();
}

// --- 平台账号会话 ----------------------------------------------------------

/** 登录/会话接口返回的账号、站点与积分：账号与主机令牌分开，退出登录不拆已配对的主机。 */
function applyProfile(data) {
  if (!data) return;
  const user = data.user && typeof data.user === 'object' ? data.user : {};
  const balance = data.points ? Number(data.points.balance) : NaN;
  userPoints = Number.isFinite(balance) ? balance : 0;
  const patch = {};
  if (user.username) patch.userName = String(user.username).slice(0, 64);
  if (typeof user.avatar === 'string') patch.userAvatar = user.avatar.slice(0, 512);
  if (typeof user.email === 'string') patch.userEmail = user.email.slice(0, 160);
  if (Object.keys(patch).length) configStore.save(patch);
}

/** 启动时用已存会话换最新昵称与积分；401 视为登录过期，清掉会话等用户重登。 */
async function refreshUserSession() {
  const cfg = configStore.get();
  if (!cfg.userToken) return;
  const res = await platform.session(cfg.baseUrl, cfg.userToken);
  if (res.transportError) return;
  if (res.httpStatus === 401) {
    configStore.clearUser();
    userPoints = null;
    log('warn', 'platform session expired; please sign in again');
    if (pairing) void pairing.refresh();
    broadcast('state:update', stateSnapshot());
    return;
  }
  if (res.ok) {
    applyProfile(res.data);
    broadcast('state:update', stateSnapshot());
  }
}

async function platformLogin(input) {
  const body = input && typeof input === 'object' ? input : {};
  const rawUrl = String(body.baseUrl || '').trim();
  if (!/^https?:\/\//i.test(rawUrl)) {
    return { ok: false, error: '平台地址要以 http:// 或 https:// 开头' };
  }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return { ok: false, error: '请输入账号和密码' };
  const saved = configStore.save({ baseUrl: rawUrl });
  const res = await platform.login(saved.baseUrl, username, password);
  if (res.transportError) return { ok: false, error: '平台不可达：' + res.error };
  if (!res.ok || !res.data || !res.data.token) {
    return { ok: false, error: (res.data && res.data.message) || '登录失败' };
  }
  configStore.save({ userToken: String(res.data.token) });
  applyProfile(res.data);
  log('info', 'platform login ok as ' + (configStore.get().userName || username));
  broadcast('state:update', stateSnapshot());
  if (!configStore.isPaired() && pairing) void pairing.refresh();
  return { ok: true, state: stateSnapshot() };
}

function platformLogout() {
  configStore.clearUser();
  userPoints = null;
  if (pairing) pairing.stop();
  log('info', 'platform logout');
  broadcast('state:update', stateSnapshot());
  if (!configStore.isPaired() && pairing) void pairing.refresh();
  return { ok: true };
}

// --- heartbeat -------------------------------------------------------------

function startHeartbeat() {
  stopHeartbeat();
  if (!configStore.isPaired()) return;
  const cfg = configStore.get();
  const interval = Math.max(2, cfg.heartbeatSeconds) * 1000;
  log('info', 'heartbeat started every ' + cfg.heartbeatSeconds + 's');
  heartbeatTimer = setInterval(() => {
    doHeartbeat().catch((err) => log('error', 'heartbeat error: ' + err.message));
  }, interval);
  doHeartbeat().catch((err) => log('error', 'heartbeat error: ' + err.message));
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/** 真正跑过的目录攒成「最近使用」，作为候选表的补充项（最多 20 条）。 */
function rememberWorkspace(dir) {
  const target = String(dir || '').trim().replace(/[\\/]+$/, '');
  if (!target) return;
  const cfg = configStore.get();
  const key = target.toLowerCase();
  const rest = cfg.recentWorkspaces.filter((row) => row.path.toLowerCase() !== key);
  rest.unshift({ path: target, lastUsedAt: new Date().toISOString() });
  configStore.save({ recentWorkspaces: rest.slice(0, workspaces.RECENT_KEEP) });
}

/**
 * 平台模型授权（B 方案）：平台把渠道真实密钥下发过来，客户端就把它当一条「平台渠道」用。
 * 明文只在内存与本机库里；授权撤掉时把这条渠道的 Key 清空并切回本地渠道。
 */
const PLATFORM_CHANNEL_ID = 'platform';
const PLATFORM_CHANNEL_NAME = '平台授权渠道';

function applyModelGrant(grant, unchanged) {
  const list = agentConfig.listChannels();
  const existing =
    list.find((row) => row.id === PLATFORM_CHANNEL_ID) ||
    list.find((row) => row.name === PLATFORM_CHANNEL_NAME) ||
    null;
  if (grant && grant.baseUrl && grant.apiKey && grant.model) {
    // 「未变化」只是幂等标记：旧内容还在本地就不动，避免每次心跳反复落库。
    if (unchanged) return;
    const next = {
      id: existing ? existing.id : PLATFORM_CHANNEL_ID,
      name: PLATFORM_CHANNEL_NAME,
      protocol: grant.protocol === 'anthropic' ? 'anthropic' : 'openai',
      baseUrl: String(grant.baseUrl),
      apiKey: String(grant.apiKey),
      model: String(grant.model)
    };
    const same =
      existing &&
      existing.baseUrl === next.baseUrl &&
      existing.apiKey === next.apiKey &&
      existing.model === next.model &&
      existing.protocol === next.protocol;
    if (!same) {
      agentConfig.saveChannel(next);
      agentConfig.setActiveChannel(next.id);
      log('info', 'platform model grant applied: ' + next.model);
      refreshAgentSnapshot();
    }
    return;
  }
  if (unchanged || !existing) return;
  // 授权撤销：清空 Key（保留行占位），再把激活渠道切回第一条本地渠道。
  if (existing.apiKey) {
    agentConfig.saveChannel({ id: existing.id, name: PLATFORM_CHANNEL_NAME + '（已撤销）', protocol: existing.protocol, baseUrl: existing.baseUrl, apiKey: '', model: existing.model });
    const local = agentConfig.listChannels().find((row) => row.id !== existing.id && row.apiKey);
    if (local) agentConfig.setActiveChannel(local.id);
    log('info', 'platform model grant revoked');
    refreshAgentSnapshot();
  }
}

/**
 * 本机模型设置改了之后同步到平台（双向同步的上行）：
 * 平台会把这份设置落成「BotBuddy · 主机名」渠道并覆盖授权，之后平台侧看到的以本机为准。
 * 只上报「当前生效」的本地渠道；平台渠道本身是下行结果，不往平台回写（除非用户直接改了它）。
 */
function scheduleLocalModelSync(skipPlatform) {
  localSyncSkipPlatform = skipPlatform !== false;
  if (!configStore.isPaired()) return;
  if (localSyncTimer) clearTimeout(localSyncTimer);
  localSyncTimer = setTimeout(() => {
    localSyncTimer = null;
    void pushLocalModel().finally(() => {
      doHeartbeat().catch((err) => log('error', 'heartbeat error: ' + err.message));
    });
  }, 400);
}

async function pushLocalModel() {
  const cfg = configStore.get();
  if (!cfg.token) return;
  const active = agentConfig.activeChannel();
  if (!active) return;
  if (localSyncSkipPlatform && active.id === PLATFORM_CHANNEL_ID) return;
  if (!active.baseUrl || !active.model || !active.apiKey) return;
  const res = await platform.syncModel(cfg.baseUrl, cfg.token, {
    baseUrl: active.baseUrl,
    model: active.model,
    apiKey: active.apiKey,
    protocol: active.protocol
  });
  if (res.transportError) {
    log('warn', 'model sync unreachable: ' + res.error);
    return;
  }
  if (!res.ok) {
    log('warn', 'model sync rejected: ' + ((res.data && res.data.message) || '平台返回异常'));
    return;
  }
  log('info', 'local model synced to platform: ' + active.model);
}

async function doHeartbeat() {
  if (heartbeating || stopping) return;
  heartbeating = true;
  try {
    const cfg = configStore.get();
    if (!cfg.token) return;
    const report = {
      clientVersion: platform.CLIENT_VERSION,
      platform: platform.currentPlatform(),
      workingDir: cfg.workingDir,
      caps: {
        agent: heartbeatCaps().agent,
        os: process.platform,
        hostname: os.hostname()
      }
    };
    const res = await platform.heartbeat(cfg.baseUrl, cfg.token, report);

    if (res.transportError) {
      connected = false;
      log('warn', 'heartbeat unreachable: ' + res.error);
      broadcast('state:update', stateSnapshot());
      return;
    }

    // 只有 401 才代表「配对已失效」；后端闪断/重启窗口里的 502、限流、非 JSON
    // 响应等也会形成 ok:false 信封，这些一律只告警重试，不能清配对令牌——
    // 否则后端每重启一次，客户端就永久掉线一次（实测发生过）。
    if (res.httpStatus === 401) {
      log('warn', 'token rejected: ' + ((res.data && res.data.message) || 'unauthorized'));
      handleTokenRejected();
      return;
    }
    if (res.data && res.data.ok === false) {
      log('warn', 'heartbeat rejected: ' + ((res.data && res.data.message) || '平台返回异常'));
      broadcast('state:update', stateSnapshot());
      return;
    }

    connected = true;
    lastHeartbeat = new Date().toISOString();
    const data = res.data || {};
    if (typeof data.points === 'number' && Number.isFinite(data.points)) {
      userPoints = data.points;
    }
    applyModelGrant(data.modelGrant, data.grantUnchanged === true);

    if (data.heartbeatSeconds && data.heartbeatSeconds !== cfg.heartbeatSeconds) {
      configStore.save({ heartbeatSeconds: data.heartbeatSeconds });
      startHeartbeat();
    }

    if (Array.isArray(data.commands)) {
      data.commands.forEach((cmd) => {
        if (!cmd || !cmd.commandCode) return;
        if (runner.enqueue(cmd)) {
          rememberWorkspace(cmd.cwd);
          try {
            db.receiveTaskRecord({
              commandCode: cmd.commandCode,
              title: cmd.title || '',
              kind: cmd.kind || '',
              instruction: cmd.instruction || '',
              cwd: cmd.cwd || '',
              status: '已领取'
            });
          } catch (err) {
            log('warn', 'task record failed: ' + err.message);
          }
        }
      });
    }
    if (Array.isArray(data.stop)) runner.applyStop(data.stop);

    broadcast('state:update', stateSnapshot());
  } catch (err) {
    log('error', 'heartbeat failed: ' + err.message);
  } finally {
    heartbeating = false;
  }
}

function handleTokenRejected() {
  configStore.clearToken();
  connected = false;
  boundHostName = '';
  stopHeartbeat();
  broadcast('state:update', stateSnapshot());
  if (pairing) void pairing.refresh();
}

// --- auto start ------------------------------------------------------------

function applyAutoStart(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled });
  } catch (err) {
    log('warn', 'setLoginItemSettings failed: ' + err.message);
  }
}

// --- task runner -----------------------------------------------------------

function setupRunner() {
  runner = new TaskRunner({
    runAgent: (input) => {
      const cfg = configStore.get();
      // 平台的目录优先（命中本机白名单才用）；没给、不在白名单、目录已删，一律落到默认工作区。
      const resolved = workspaces.resolveForRun(cfg, input.cwd);
      if (!resolved) {
        return Promise.resolve({
          status: 'error',
          text: '',
          errorMessage: '本机没有可用的工作区目录',
          failReason: 'WORKSPACE_MISSING'
        });
      }
      return agentRuntime.run({
        instruction: input.instruction,
        cwd: resolved,
        policy: cfg.permissionPolicy,
        timeoutSec: input.timeoutSec,
        onProgress: input.onChunk,
        shouldCancel: input.shouldCancel,
        onLog: log
      });
    },
    onProgress: async (commandCode, text) => {
      const cfg = configStore.get();
      const res = await platform.progress(cfg.baseUrl, cfg.token, { commandCode, text });
      if (res.data && res.data.ok === false) {
        log('warn', 'progress rejected: ' + (res.data.message || ''));
      }
      return { cancelRequested: !!(res.data && res.data.cancelRequested) };
    },
    onAck: async (commandCode, payload) => {
      const cfg = configStore.get();
      if (payload && payload.ok) agentLastError = null;
      else if (payload && !payload.canceled) {
        agentLastError = {
          failReason: payload.failReason || '',
          detail: payload.errorMessage || ''
        };
      }
      const res = await platform.result(
        cfg.baseUrl,
        cfg.token,
        Object.assign(
          {
            commandCode,
            ok: false,
            canceled: false,
            text: '',
            errorMessage: '',
            elapsedMs: 0,
            effectiveWorkspace: '',
            failReason: ''
          },
          payload
        )
      );
      if (payload && payload.effectiveWorkspace) rememberWorkspace(payload.effectiveWorkspace);
      if (res.data && res.data.ok === false) {
        log('warn', 'result rejected: ' + (res.data.message || ''));
      }
      broadcast('state:update', stateSnapshot());
      refreshAgentSnapshot();
    },
    onRecord: (record) => {
      try {
        db.updateTaskRecord(record);
      } catch (err) {
        log('warn', 'task record failed: ' + err.message);
      }
    },
    onLog: log
  });
}

// --- 本机对话 ---------------------------------------------------------------

/** 本机对话与平台任务共用一个执行位：任一在跑，另一条就先排队等（这里直接提示）。 */
function chatPrecheck() {
  if (chatRuns.size > 0) return { error: '本机 Agent 正在回复上一条，等它结束再发' };
  if (runner && runner.isRunning()) {
    return { error: '本机 Agent 正在执行平台下发的任务，等它结束后再发' };
  }
  if (!agentConfig.activeChannel()) {
    return { error: '还没配置文本模型：到「模型渠道」填渠道地址、密钥与模型名' };
  }
  return { cfg: configStore.get() };
}

async function runChatTurn(conversationId, text, cfg, workspace, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const conversation = chatStore.getConversation(conversationId) || chatStore.createConversation();
  const history = chatStore.historyForModel(conversation.id, chatStore.HISTORY_LIMIT);
  const userMessage = chatStore.appendMessage(conversation.id, 'user', text, 'ok', '', opts.attachments);
  if (!conversation.title) chatStore.setTitle(conversation.id, chatStore.titleOf(text));
  const assistant = chatStore.appendMessage(conversation.id, 'assistant', '', 'streaming');
  if (!userMessage || !assistant) return;

  const run = { cancel: false };
  chatRuns.set(conversation.id, run);
  broadcast('chat:event', {
    type: 'run-start',
    conversationId: conversation.id,
    userMessage,
    assistant,
    title: (chatStore.getConversation(conversation.id) || {}).title || ''
  });
  broadcast('state:update', stateSnapshot());
  refreshAgentSnapshot();

  let content = '';
  let dirty = false;
  let timer = null;
  const flush = () => {
    if (!dirty) return;
    dirty = false;
    chatStore.updateMessage(assistant.id, { content });
    broadcast('chat:event', {
      type: 'delta',
      conversationId: conversation.id,
      messageId: assistant.id,
      content
    });
  };

  const toolStack = [];
  let result = { status: 'error', errorMessage: '本机执行失败' };
  try {
    timer = setInterval(flush, 120);
    result = await agentRuntime.run({
      instruction: text,
      cwd: workspace,
      channelId: conversation.channelId || '',
      policy: cfg.permissionPolicy,
      timeoutSec: 300,
      history,
      skillIds: conversation.skillIds || [],
      pluginIds: conversation.pluginIds || [],
      personaId: conversation.personaId || '',
      references: opts.references,
      onDelta: (chunk) => {
        content += chunk;
        dirty = true;
      },
      onTool: (evt) => {
        if (evt.phase === 'start') {
          const row = chatStore.appendMessage(conversation.id, 'tool', evt.name, 'running', evt.name);
          if (!row) return;
          toolStack.push(row);
          broadcast('chat:event', { type: 'tool', conversationId: conversation.id, message: row });
          return;
        }
        const row = toolStack.pop();
        if (!row) return;
        const updated = chatStore.updateMessage(row.id, { status: evt.ok ? 'ok' : 'failed' });
        if (updated) {
          broadcast('chat:event', { type: 'tool', conversationId: conversation.id, message: updated });
        }
      },
      shouldCancel: () => run.cancel,
      onLog: log
    });
  } catch (error) {
    result = { status: 'error', errorMessage: error.message || '本机执行失败' };
  } finally {
    if (timer) clearInterval(timer);
    flush();
    chatRuns.delete(conversation.id);
  }

  let finalText = content;
  let status = 'ok';
  if (result.status === 'canceled') {
    status = 'canceled';
    if (!finalText.trim()) finalText = '（已停止）';
  } else if (result.status === 'error' || result.status === 'timeout') {
    status = 'error';
    const reason =
      result.errorMessage || (result.status === 'timeout' ? '本机执行超时' : '本机执行失败');
    finalText = (finalText ? finalText + '\n\n' : '') + '执行失败：' + reason;
  } else if (!finalText.trim()) {
    finalText = result.text || '（模型没有返回正文）';
  }

  const done = chatStore.updateMessage(assistant.id, { content: finalText, status });
  log(result.status === 'ok' ? 'info' : 'warn', 'chat turn ' + conversation.id + ' → ' + status);
  broadcast('chat:event', {
    type: 'done',
    conversationId: conversation.id,
    message: done,
    title: (chatStore.getConversation(conversation.id) || {}).title || ''
  });
  broadcast('state:update', stateSnapshot());
  refreshAgentSnapshot();
}

// --- IPC (whitelisted via preload) -----------------------------------------

function setupIpc() {
  ipcMain.handle('state:get', () => stateSnapshot());
  ipcMain.handle('agent:get', () => agentSnapshot());

  ipcMain.handle('config:saveBaseUrl', (e, url) => {
    const before = configStore.get().baseUrl;
    const saved = configStore.save({ baseUrl: url });
    // 换平台地址＝换账号体系：上一个平台的会话与主机令牌都不再通用。
    if (saved.baseUrl !== before && configStore.isLoggedIn()) {
      configStore.clearUser();
      userPoints = null;
    }
    log('info', 'baseUrl updated -> ' + saved.baseUrl);
    broadcast('state:update', stateSnapshot());
    if (pairing && !configStore.isPaired()) void pairing.refresh();
    return { ok: true, baseUrl: saved.baseUrl };
  });

  ipcMain.handle('config:saveDeviceName', (e, name) => {
    const saved = configStore.save({ deviceName: name });
    broadcast('state:update', stateSnapshot());
    return { ok: true, deviceName: saved.deviceName };
  });

  ipcMain.handle('config:saveToken', (e, token) => {
    const value = String(token || '').trim();
    if (!configStore.isHostToken(value)) {
      return { ok: false, error: '令牌应以 bot_ 开头，请确认从平台复制完整' };
    }
    log('info', 'host token pasted manually');
    if (pairing) pairing.stop();
    adoptToken(value, '');
    return { ok: true };
  });

  ipcMain.handle('config:savePermissionPolicy', (e, policy) => {
    const saved = configStore.save({ permissionPolicy: policy });
    log('info', 'permissionPolicy -> ' + saved.permissionPolicy);
    broadcast('state:update', stateSnapshot());
    refreshAgentSnapshot();
    void doHeartbeat().catch(() => {});
    return { ok: true, permissionPolicy: saved.permissionPolicy };
  });

  ipcMain.handle('pair:refresh', async () => {
    if (!pairing) return { ok: false };
    pairing.stopTimers();
    const snap = await pairing.refresh();
    return { ok: true, state: snap };
  });

  ipcMain.handle('pair:status', () => (pairing ? pairing.snapshot() : null));

  // --- 平台账号（登录后才能申请连接码）---------------------------------------
  ipcMain.handle('platform:login', (e, input) =>
    platformLogin(input).catch((err) => ({ ok: false, error: err.message }))
  );

  ipcMain.handle('platform:logout', () => platformLogout());

  ipcMain.handle('platform:session', async () => {
    await refreshUserSession();
    return { ok: true, state: stateSnapshot() };
  });

  ipcMain.handle('copy:text', (e, text) => {
    clipboard.writeText(String(text || ''));
    return { ok: true };
  });

  ipcMain.handle('open:site', async () => {
    const cfg = configStore.get();
    try {
      await shell.openExternal(cfg.baseUrl);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('selfcheck:run', async () => {
    const result = await selfcheck.runAll(() => configStore.get());
    broadcast('state:update', stateSnapshot());
    return result;
  });

  ipcMain.handle('app:reconnect', async () => {
    log('info', 'manual reconnect requested');
    connected = false;
    startHeartbeat();
    const result = await selfcheck.runAll(() => configStore.get());
    return { ok: true, selfcheck: result, state: stateSnapshot() };
  });

  // --- Agent 配置（模型渠道 / 技能 / 分身 / 记忆）----------------------------

  ipcMain.handle('agent:save', (e, partial) => {
    const saved = agentConfig.save(partial || {});
    agentLastError = null;
    log('info', 'agent config updated');
    broadcast('state:update', stateSnapshot());
    refreshAgentSnapshot();
    void doHeartbeat().catch(() => {});
    return { ok: true, config: saved };
  });

  ipcMain.handle('agent:saveChannel', (e, channel) => {
    const row = agentConfig.saveChannel(channel || {});
    agentLastError = null;
    log('info', 'agent channel saved: ' + row.name + ' · ' + row.model);
    broadcast('state:update', stateSnapshot());
    refreshAgentSnapshot();
    const active = agentConfig.activeChannel();
    // 动的是当前生效的渠道：先把新设置推给平台，再心跳（避免心跳把旧授权盖回来）。
    if (active && active.id === row.id) scheduleLocalModelSync(false);
    else doHeartbeat().catch(() => {});
    return { ok: true, channel: row };
  });

  ipcMain.handle('agent:removeChannel', (e, id) => {
    const res = agentConfig.removeChannel(id);
    if (res.ok) {
      agentLastError = null;
      log('info', 'agent channel removed: ' + id);
      broadcast('state:update', stateSnapshot());
      refreshAgentSnapshot();
      const active = agentConfig.activeChannel();
      if (active && active.id !== PLATFORM_CHANNEL_ID) scheduleLocalModelSync(true);
      else doHeartbeat().catch(() => {});
    }
    return res;
  });

  ipcMain.handle('agent:activeChannel', (e, id) => {
    const res = agentConfig.setActiveChannel(id);
    if (res.ok) {
      agentLastError = null;
      broadcast('state:update', stateSnapshot());
      refreshAgentSnapshot();
      if (String(id || '') === PLATFORM_CHANNEL_ID) doHeartbeat().catch(() => {});
      else scheduleLocalModelSync(true);
    }
    return res;
  });

  ipcMain.handle('agent:probe', async () => {
    const result = await agentRuntime.probe();
    agentLastError = result.ok
      ? null
      : { failReason: result.failReason, detail: result.detail };
    log(result.ok ? 'info' : 'warn', 'agent probe: ' + (result.detail || result.failReason));
    broadcast('state:update', stateSnapshot());
    refreshAgentSnapshot();
    void doHeartbeat().catch(() => {});
    return result;
  });

  ipcMain.handle('agent:readSkill', (e, id) => agentConfig.readSkill(id));

  ipcMain.handle('agent:saveSkill', (e, payload) => {
    const res = agentConfig.saveSkill(payload && payload.id, payload || {});
    if (res.ok) refreshAgentSnapshot();
    return res;
  });

  ipcMain.handle('agent:removeSkill', (e, id) => {
    const res = agentConfig.removeSkill(id);
    if (res.ok) refreshAgentSnapshot();
    return res;
  });

  // 技能包导入：ZIP 或文件夹只在本机解析成 name / description / 正文后入库，
  // 不解压落盘、也不往平台同步（平台的技能是另一套账号级技能库）。
  ipcMain.handle('agent:importSkillPackage', async (e, mode) => {
    const kind = mode === 'folder' ? 'folder' : 'zip';
    const picked = await dialog.showOpenDialog(
      mainWindow,
      kind === 'folder'
        ? { title: '选择技能包文件夹', properties: ['openDirectory'] }
        : {
            title: '选择技能包 ZIP',
            properties: ['openFile'],
            filters: [{ name: '技能包', extensions: ['zip'] }]
          }
    );
    if (picked.canceled || !picked.filePaths.length) {
      return { ok: false, canceled: true };
    }
    try {
      const skill =
        kind === 'folder'
          ? skillPackage.importFromDir(picked.filePaths[0])
          : skillPackage.importFromZip(picked.filePaths[0]);
      const saved = agentConfig.saveSkill(skill.id, skill);
      if (!saved.ok) return saved;
      log('info', 'skill package imported: ' + skill.id + ' · ' + skill.name);
      refreshAgentSnapshot();
      return { ok: true, skill };
    } catch (error) {
      return { ok: false, error: error.message || '技能包解析失败' };
    }
  });

  // 插件包导入：ZIP 或文件夹里的 plugin.json 在本机解析后直接入插件库，
// 不加载任意 JS、不向平台同步（插件只在本机可见）。
  ipcMain.handle('plugin:importPackage', async (e, mode) => {
    const kind = mode === 'folder' ? 'folder' : 'zip';
    const picked = await dialog.showOpenDialog(
      mainWindow,
      kind === 'folder'
        ? { title: '选择插件包文件夹', properties: ['openDirectory'] }
        : {
            title: '选择插件包 ZIP',
            properties: ['openFile'],
            filters: [{ name: '插件包', extensions: ['zip'] }]
          }
    );
    if (picked.canceled || !picked.filePaths.length) {
      return { ok: false, canceled: true };
    }
    try {
      const manifest =
        kind === 'folder'
          ? pluginPackage.readFromDir(picked.filePaths[0])
          : pluginPackage.readFromZip(picked.filePaths[0]);
      const saved = plugins.save(manifest);
      if (!saved.ok) return saved;
      log('info', 'plugin package imported: ' + saved.plugin.id + ' · ' + saved.plugin.name);
      refreshAgentSnapshot();
      return { ok: true, plugin: saved.plugin };
    } catch (error) {
      return { ok: false, error: error.message || '插件包解析失败' };
    }
  });

  ipcMain.handle('agent:readPersona', (e, id) => agentConfig.readPersona(id));

  ipcMain.handle('agent:savePersona', (e, payload) => {
    const res = agentConfig.savePersona(payload && payload.id, payload || {});
    if (res.ok) refreshAgentSnapshot();
    return res;
  });

  ipcMain.handle('agent:removePersona', (e, id) => {
    const res = agentConfig.removePersona(id);
    if (res.ok) {
      broadcast('state:update', stateSnapshot());
      void doHeartbeat().catch(() => {});
      refreshAgentSnapshot();
    }
    return res;
  });

  ipcMain.handle('agent:saveMemory', (e, text) => {
    const res = agentConfig.writeMemory(text);
    if (res.ok) refreshAgentSnapshot();
    return res;
  });

  ipcMain.handle('agent:appendMemory', (e, text) => {
    const ok = agentConfig.appendMemory(text);
    if (ok) refreshAgentSnapshot();
    return { ok };
  });

  // --- 工作区 --------------------------------------------------------------

  ipcMain.handle('workspace:list', () => {
    const cfg = configStore.get();
    return { ok: true, list: workspaces.listWorkspaces(cfg) };
  });

  // 原生目录选择：Electron 里 window.prompt 不可用，添加目录必须走系统选择框。
  ipcMain.handle('workspace:pick', async () => {
    if (!mainWindow) return { ok: false, error: '窗口不可用' };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: '选择工作区目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (picked.canceled || !picked.filePaths.length) return { ok: false, canceled: true };
    return addWorkspaceDir(picked.filePaths[0]);
  });

  // 手动添加的工作区只校验「是个存在的目录」；能不能派活仍由执行前那道闸门统一裁决。
  ipcMain.handle('workspace:add', (e, wsPath) => addWorkspaceDir(wsPath));

  function addWorkspaceDir(wsPath) {
    const dir = String(wsPath || '').trim().replace(/[\\/]+$/, '');
    if (!dir) return { ok: false, error: '请填写工作区的绝对路径' };
    if (!path.isAbsolute(dir)) return { ok: false, error: '请填写绝对路径：' + dir };
    if (!workspaces.existsDir(dir)) return { ok: false, error: '这个目录不存在或不可读：' + dir };
    const cfg = configStore.get();
    const list = cfg.workspaces.slice();
    if (!list.some((p) => workspaces.keyOf(p) === workspaces.keyOf(dir))) list.push(dir);
    configStore.save({ workspaces: list });
    log('info', 'workspace added: ' + dir);
    broadcast('state:update', stateSnapshot());
    refreshAgentSnapshot();
    void doHeartbeat().catch(() => {});
    return { ok: true, path: dir };
  }

  ipcMain.handle('workspace:remove', (e, wsPath) => {
    const key = workspaces.keyOf(wsPath);
    if (!key) return { ok: false, error: '请指定要移除的工作区' };
    const cfg = configStore.get();
    const next = cfg.workspaces.filter((p) => workspaces.keyOf(p) !== key);
    configStore.save({ workspaces: next });
    log('info', 'workspace removed: ' + wsPath);
    broadcast('state:update', stateSnapshot());
    refreshAgentSnapshot();
    void doHeartbeat().catch(() => {});
    return { ok: true };
  });

  // --- 插件与 Chrome 桥接 --------------------------------------------------

  ipcMain.handle('plugins:list', () => ({ ok: true, list: plugins.list() }));

  ipcMain.handle('plugins:save', (e, payload) => {
    const res = plugins.save(payload);
    if (res.ok) {
      log('info', 'plugin saved: ' + res.plugin.name + ' (' + res.plugin.kind + ')');
      refreshAgentSnapshot();
    }
    return res;
  });

  ipcMain.handle('plugins:remove', (e, id) => {
    const res = plugins.remove(id);
    if (res.ok) refreshAgentSnapshot();
    return res;
  });

  ipcMain.handle('bridge:status', () => ({ ok: true, status: chromeBridge.shared.status() }));

  // --- Chrome 插件包管理（客户端内完成导入/删除/自动加载） ---
  ipcMain.handle('chromeExt:list', () => ({ ok: true, list: chromeExtensions.list() }));

  ipcMain.handle('chromeExt:importPackage', async (e, mode) => {
    const kind = mode === 'folder' ? 'folder' : 'zip';
    const picked = await dialog.showOpenDialog(
      mainWindow,
      kind === 'folder'
        ? { title: '选择 Chrome 插件文件夹', properties: ['openDirectory'] }
        : {
            title: '选择 Chrome 插件 ZIP',
            properties: ['openFile'],
            filters: [{ name: '插件包', extensions: ['zip'] }]
          }
    );
    if (picked.canceled || !picked.filePaths.length) {
      return { ok: false, canceled: true };
    }
    try {
      const item =
        kind === 'folder'
          ? chromeExtensions.importFromDirectory(picked.filePaths[0])
          : chromeExtensions.importFromZip(picked.filePaths[0]);
      log('info', 'chrome extension installed: ' + item.name + ' v' + item.version);
      return { ok: true, item };
    } catch (error) {
      return { ok: false, error: error.message || '插件包导入失败' };
    }
  });

  ipcMain.handle('chromeExt:remove', (e, id) => chromeExtensions.remove(id));

  // Agent 浏览器：打开/聚焦客户端自带浏览器，并返回当前页面清单。
  ipcMain.handle('browser:open', async (e, url) => {
    try {
      await builtinBrowser.loadManagedExtensions();
      const result = await builtinBrowser.focusOrOpen(url || 'about:blank');
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error.message || '打开客户端浏览器失败' };
    }
  });
  ipcMain.handle('browser:pages', () => ({ ok: true, list: builtinBrowser.listWindows() }));
  ipcMain.handle('browser:goto', async (e, url) => {
    try {
      await builtinBrowser.loadManagedExtensions();
      const result = await builtinBrowser.goto(url);
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error.message || '打开网址失败' };
    }
  });

  ipcMain.handle('chromeExt:openFolder', async () => {
    fs.mkdirSync(chromeExtensions.DIR, { recursive: true });
    const result = await shell.openPath(chromeExtensions.DIR);
    return result ? { ok: false, error: result } : { ok: true };
  });

  // 打开客户端自带浏览器：Agent 的浏览器操作默认发生在这里，不需要外部浏览器。
  ipcMain.handle('chromeExt:launch', async () => {
    try {
      const loaded = await builtinBrowser.loadManagedExtensions();
      await builtinBrowser.open('about:blank');
      if (loaded.loaded.length) {
        log('info', 'client browser opened with ' + loaded.loaded.length + ' extension(s)');
      }
      return { ok: true, loaded: loaded.loaded.length, errors: loaded.errors };
    } catch (error) {
      return { ok: false, error: error.message || '打开客户端浏览器失败' };
    }
  });

  // 插件包随安装包一起发（extraResources）；开发态就打开仓库里的源目录。
  ipcMain.handle('bridge:openFolder', async () => {
    const packaged = path.join(process.resourcesPath || '', 'chrome-bridge-extension');
    const dev = path.join(__dirname, '..', '..', 'chrome-bridge-extension');
    const target = fs.existsSync(packaged) ? packaged : dev;
    if (!fs.existsSync(target)) return { ok: false, error: '找不到插件目录：' + target };
    const error = await shell.openPath(target);
    return error ? { ok: false, error } : { ok: true, path: target };
  });

  ipcMain.handle('bridge:restart', async (e, payload) => {
    const cfg = configStore.get();
    // 端口可在界面里改：1024-65535，改完重启桥接，插件弹窗里同步改地址。
    const wanted = Number(payload && payload.port);
    const port =
      Number.isInteger(wanted) && wanted >= 1024 && wanted <= 65535
        ? wanted
        : cfg.chromeBridgePort;
    if (port !== cfg.chromeBridgePort) configStore.save({ chromeBridgePort: port });
    // 重启即换令牌：旧令牌立即失效，插件要在弹窗里填新的那串。
    const token = crypto.randomBytes(18).toString('hex');
    configStore.save({ chromeBridgeToken: token });
    chromeBridge.shared.stop();
    const result = await chromeBridge.shared.start({ token, port });
    broadcast('bridge:update', chromeBridge.shared.status());
    return result.ok ? { ok: true, status: chromeBridge.shared.status() } : result;
  });

  // --- 窗口 / 日志 ---------------------------------------------------------

  ipcMain.handle('log:get', () => getLogs());

  ipcMain.handle('window:show', (e, target) => {
    openWindowAt(target || 'overview');
    return { ok: true };
  });

  ipcMain.handle('app:quit', () => {
    quitApp();
    return { ok: true };
  });

  ipcMain.handle('tasks:recent', () => (runner ? runner.getRecent() : []));
  ipcMain.handle('tasks:records', (e, limit) => {
    try {
      return db.listTaskRecords(Number(limit) || 100);
    } catch (err) {
      log('warn', 'task records read failed: ' + err.message);
      return [];
    }
  });

  // --- 本机对话 ------------------------------------------------------------

  ipcMain.handle('chat:list', () => ({ ok: true, list: chatStore.listConversations() }));

  ipcMain.handle('chat:messages', (e, id) => ({ ok: true, list: chatStore.listMessages(id, 500) }));

  ipcMain.handle('chat:pickFiles', async () => {
    if (!mainWindow) return { ok: false, files: [], skipped: [], error: '窗口不可用' };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: '选择参考文件',
      properties: ['openFile', 'multiSelections'],
      filters: referenceStore.FILTERS
    });
    if (picked.canceled) return { ok: true, files: [], skipped: [] };
    return Object.assign({ ok: true }, referenceStore.describePicked(picked.filePaths));
  });

  ipcMain.handle('chat:update', (e, payload) => {
    const id = String((payload && payload.conversationId) || '');
    if (!id) return { ok: true, conversation: null };
    const conversation = chatStore.updateConversation(id, {
      personaId: payload.personaId,
      skillIds: payload.skillIds,
      pluginIds: payload.pluginIds,
      channelId: payload.channelId,
      workspacePath: payload.workspacePath
    });
    return { ok: !!conversation, conversation };
  });

  ipcMain.handle('chat:send', (e, payload) => {
    const text = String((payload && payload.text) || '').trim().slice(0, 20000);
    if (!text) return { ok: false, error: '先输入要发给 Agent 的内容' };
    const conversation =
      chatStore.getConversation(payload && payload.conversationId) || chatStore.createConversation();
    const checked = chatPrecheck();
    if (checked.error) return { ok: false, error: checked.error, conversationId: conversation.id };
    const personaId = String((payload && payload.personaId) || '').slice(0, 80);
    const skillIds = Array.isArray(payload && payload.skillIds)
      ? payload.skillIds.map((id) => String(id || '')).filter(Boolean).slice(0, 100)
      : [];
    const pluginIds = Array.isArray(payload && payload.pluginIds)
      ? payload.pluginIds.map((id) => String(id || '')).filter(Boolean).slice(0, 100)
      : [];
    const channelId = String((payload && payload.channelId) || '').trim().slice(0, 40);
    // 会话级工作区优先；没选就落到默认工作区。目录被删或不在候选表内时同样回落。
    const wanted = String((payload && payload.workspacePath) || conversation.workspacePath || '').trim();
    const workspace = workspaces.resolveForRun(checked.cfg, wanted);
    chatStore.updateConversation(conversation.id, {
      personaId,
      skillIds,
      pluginIds,
      channelId,
      workspacePath: wanted && workspaces.existsDir(wanted) ? wanted : ''
    });
    const read = referenceStore.readReferences(payload && payload.attachments);
    const attachments = read.references.map((row) => ({ name: row.name, path: row.path, size: row.size }));
    void runChatTurn(conversation.id, text, checked.cfg, workspace, {
      references: read.references,
      attachments
    });
    return { ok: true, conversationId: conversation.id, workspace, skipped: read.skipped };
  });

  ipcMain.handle('chat:cancel', (e, id) => {
    const run = chatRuns.get(String(id || ''));
    if (run) run.cancel = true;
    return { ok: !!run };
  });

  ipcMain.handle('chat:remove', (e, id) => {
    const key = String(id || '');
    const run = chatRuns.get(key);
    if (run) run.cancel = true;
    const ok = chatStore.removeConversation(key);
    if (ok) broadcast('state:update', stateSnapshot());
    return { ok };
  });
}

// --- lifecycle -------------------------------------------------------------

function quitApp() {
  stopping = true;
  stopHeartbeat();
  if (pairing) pairing.stop();
  if (trayController) trayController.destroy();
  announceOffline();
}

/** 退出前告知平台本机下线；网络结果不影响退出，最多等 3 秒。 */
function announceOffline() {
  const cfg = configStore.get();
  const done = () => {
    db.close();
    app.quit();
  };
  if (!cfg.token) {
    done();
    return;
  }
  const guard = setTimeout(done, 3000);
  platform.logout(cfg.baseUrl, cfg.token).then(() => {
    clearTimeout(guard);
    done();
  });
}

/** Chrome 桥接：令牌缺了就现场生成一串，端口被占用只记日志、不影响其它功能。 */
function startChromeBridge() {
  const cfg = configStore.get();
  let token = cfg.chromeBridgeToken;
  if (!token) {
    token = crypto.randomBytes(18).toString('hex');
    configStore.save({ chromeBridgeToken: token });
  }
  chromeBridge.shared.start({ token, port: cfg.chromeBridgePort }).then((result) => {
    if (result.ok) log('info', 'chrome bridge listening on 127.0.0.1:' + result.port);
    else log('warn', 'chrome bridge: ' + result.error);
    broadcast('bridge:update', chromeBridge.shared.status());
  });
}

function bootstrap() {
  db.open();
  // 默认工作区开箱即用：目录不存在就当场建出来，后面心跳/对话/平台指令都直接用它。
  const defaultWs = workspaces.ensureDefaultWorkspace(configStore.get());
  if (defaultWs) log('info', 'default workspace: ' + defaultWs);
  startChromeBridge();
  setupRunner();
  setupPairing();
  setupIpc();

  trayController = new TrayController({
    onShow: () => openWindowAt('overview'),
    onAgent: () => openWindowAt('models'),
    onQuit: () => quitApp()
  });
  trayController.create();

  createMainWindow(true);
  if (configStore.isLoggedIn()) void refreshUserSession();
  if (configStore.isPaired()) {
    log('info', 'already paired; starting heartbeat');
    startHeartbeat();
  } else if (configStore.isLoggedIn()) {
    log('info', 'not paired; waiting for pairing code');
    setTimeout(() => {
      if (pairing) void pairing.refresh();
    }, 400);
  } else {
    log('info', 'not signed in; waiting for platform login');
  }

  selfcheck
    .runAll(() => configStore.get())
    .then((r) => broadcast('selfcheck:result', r))
    .catch((err) => log('warn', 'selfcheck failed: ' + err.message));

  // 未绑定期间定期重跑自检：用户在填地址/配 Agent 时能立刻看到变化。
  setInterval(() => {
    if (!configStore.isPaired()) {
      selfcheck
        .runAll(() => configStore.get())
        .then((r) => broadcast('selfcheck:result', r))
        .catch(() => {});
    }
  }, 15000);
}

// Single instance lock: focus existing window instead of launching a second app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openWindowAt('overview');
  });

  app.on('window-all-closed', () => {
    // Tray app: do NOT quit when all windows close.
    if (stopping) app.quit();
  });

  app.on('before-quit', () => {
    stopping = true;
    stopHeartbeat();
  });

  app.whenReady().then(() => {
    try {
      nativeTheme.themeSource = 'light';
    } catch (err) {
      /* ignore */
    }
    bootstrap();
  });
}

module.exports = { stateSnapshot, statusLabel, agentCaps };