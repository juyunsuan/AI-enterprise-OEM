'use strict';

/**
 * preload.js
 *
 * Exposes a strict, whitelisted API to the renderer over contextBridge.
 * The renderer NEVER requires('electron') directly.
 *
 * All calls are invoke/handle or on/emit pairs backed by the main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // --- state ---
  getState: () => ipcRenderer.invoke('state:get'),

  // --- config ---
  saveBaseUrl: (url) => ipcRenderer.invoke('config:saveBaseUrl', url),
  saveDeviceName: (name) => ipcRenderer.invoke('config:saveDeviceName', name),
  saveToken: (token) => ipcRenderer.invoke('config:saveToken', token),
  savePermissionPolicy: (policy) => ipcRenderer.invoke('config:savePermissionPolicy', policy),

  // --- 平台账号（登录后才能激活连接码）---
  platformLogin: (payload) => ipcRenderer.invoke('platform:login', payload),
  platformLogout: () => ipcRenderer.invoke('platform:logout'),
  platformSession: () => ipcRenderer.invoke('platform:session'),

  // --- 设备绑定（连接码）---
  refreshPairCode: () => ipcRenderer.invoke('pair:refresh'),
  getPairStatus: () => ipcRenderer.invoke('pair:status'),

  // --- utilities ---
  copyText: (t) => ipcRenderer.invoke('copy:text', t),
  openSite: () => ipcRenderer.invoke('open:site'),

  // --- diagnostics ---
  runSelfCheck: () => ipcRenderer.invoke('selfcheck:run'),
  reconnect: () => ipcRenderer.invoke('app:reconnect'),
  getLogs: () => ipcRenderer.invoke('log:get'),
  getRecentTasks: () => ipcRenderer.invoke('tasks:recent'),
  getTaskRecords: (limit) => ipcRenderer.invoke('tasks:records', limit),

  // --- local agent config (channels / skills / personas / memory) ---
  getAgent: () => ipcRenderer.invoke('agent:get'),
  saveAgent: (partial) => ipcRenderer.invoke('agent:save', partial),
  saveChannel: (channel) => ipcRenderer.invoke('agent:saveChannel', channel),
  removeChannel: (id) => ipcRenderer.invoke('agent:removeChannel', id),
  setActiveChannel: (id) => ipcRenderer.invoke('agent:activeChannel', id),
  probeAgent: () => ipcRenderer.invoke('agent:probe'),
  readSkill: (id) => ipcRenderer.invoke('agent:readSkill', id),
  saveSkill: (payload) => ipcRenderer.invoke('agent:saveSkill', payload),
  removeSkill: (id) => ipcRenderer.invoke('agent:removeSkill', id),
  importSkillPackage: (mode) => ipcRenderer.invoke('agent:importSkillPackage', mode),
  skillHubList: (query) => ipcRenderer.invoke('skillhub:list', query),
  skillHubDetail: (slug) => ipcRenderer.invoke('skillhub:detail', slug),
  skillHubDownload: (slug) => ipcRenderer.invoke('skillhub:download', slug),
  skillHubInstall: (slug) => ipcRenderer.invoke('skillhub:install', slug),
  // RPA（BotBuddy 浏览器设备）：待办清单、手动跑一条、自动领取开关
  rpaTasks: () => ipcRenderer.invoke('rpa:tasks'),
  rpaRun: (taskId) => ipcRenderer.invoke('rpa:run', taskId),
  rpaSetAutoRun: (value) => ipcRenderer.invoke('rpa:setAutoRun', value),
  readPersona: (id) => ipcRenderer.invoke('agent:readPersona', id),
  savePersona: (payload) => ipcRenderer.invoke('agent:savePersona', payload),
  removePersona: (id) => ipcRenderer.invoke('agent:removePersona', id),
  saveMemory: (text) => ipcRenderer.invoke('agent:saveMemory', text),
  appendMemory: (text) => ipcRenderer.invoke('agent:appendMemory', text),

  // --- local agent chat ---
  chatList: () => ipcRenderer.invoke('chat:list'),
  chatMessages: (id) => ipcRenderer.invoke('chat:messages', id),
  chatUpdate: (payload) => ipcRenderer.invoke('chat:update', payload),
  chatPickFiles: () => ipcRenderer.invoke('chat:pickFiles'),
  chatSend: (payload) => ipcRenderer.invoke('chat:send', payload),
  chatCancel: (id) => ipcRenderer.invoke('chat:cancel', id),
  chatRemove: (id) => ipcRenderer.invoke('chat:remove', id),

  // --- workspaces ---
  listWorkspaces: () => ipcRenderer.invoke('workspace:list'),
  addWorkspace: (wsPath) => ipcRenderer.invoke('workspace:add', wsPath),
  /** 原生目录选择：选完即加入白名单（Electron 不支持 window.prompt）。 */
  pickWorkspace: () => ipcRenderer.invoke('workspace:pick'),
  removeWorkspace: (wsPath) => ipcRenderer.invoke('workspace:remove', wsPath),

  // --- agent 插件 ---
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  savePlugin: (payload) => ipcRenderer.invoke('plugins:save', payload),
  removePlugin: (id) => ipcRenderer.invoke('plugins:remove', id),
  importPluginPackage: (mode) => ipcRenderer.invoke('plugin:importPackage', mode),

  // --- Chrome 桥接 ---
  bridgeStatus: () => ipcRenderer.invoke('bridge:status'),
  listChromeExtensions: () => ipcRenderer.invoke('chromeExt:list'),
  importChromeExtension: (mode) => ipcRenderer.invoke('chromeExt:importPackage', mode),
  removeChromeExtension: (id) => ipcRenderer.invoke('chromeExt:remove', id),
  openChromeExtFolder: () => ipcRenderer.invoke('chromeExt:openFolder'),
  fpState: () => ipcRenderer.invoke('fp:state'),
  fpCreate: (body) => ipcRenderer.invoke('fp:create', body),
  fpUpdate: (id, body) => ipcRenderer.invoke('fp:update', id, body),
  fpRemove: (id) => ipcRenderer.invoke('fp:remove', id),
  fpDuplicate: (id) => ipcRenderer.invoke('fp:duplicate', id),
  fpOpen: (id) => ipcRenderer.invoke('fp:open', id),
  fpClose: (id) => ipcRenderer.invoke('fp:close', id),
  fpCloseAll: () => ipcRenderer.invoke('fp:closeAll'),
  fpPages: () => ipcRenderer.invoke('fp:pages'),
  fpCheckProxy: (body) => ipcRenderer.invoke('fp:checkProxy', body),
  fpSetAgent: (id) => ipcRenderer.invoke('fp:setAgent', id),
  fpSetMaxOpen: (value) => ipcRenderer.invoke('fp:setMaxOpen', value),
  fpSetIpCheckUrl: (value) => ipcRenderer.invoke('fp:setIpCheckUrl', value),
  fpImportKernel: (mode) => ipcRenderer.invoke('fp:kernelImport', mode),
  fpOpenKernelFolder: () => ipcRenderer.invoke('fp:openKernelFolder'),
  bridgeRestart: (options) => ipcRenderer.invoke('bridge:restart', options),
  openBridgeFolder: () => ipcRenderer.invoke('bridge:openFolder'),

  // --- window / app ---
  showWindow: (target) => ipcRenderer.invoke('window:show', target),
  quit: () => ipcRenderer.invoke('app:quit'),

  // --- events (main -> renderer) ---
  onStateUpdate: (cb) => subscribe('state:update', cb),
  onAgentUpdate: (cb) => subscribe('agent:update', cb),
  onChatEvent: (cb) => subscribe('chat:event', cb),
  onPairUpdate: (cb) => subscribe('pair:update', cb),
  onSelfCheck: (cb) => subscribe('selfcheck:result', cb),
  onLog: (cb) => subscribe('log:append', cb),
  onNavigate: (cb) => subscribe('nav:go', cb),
  onBridgeUpdate: (cb) => subscribe('bridge:update', cb),
  onRpaUpdate: (cb) => subscribe('rpa:update', cb)
};

function subscribe(channel, cb) {
  if (typeof cb !== 'function') return () => {};
  const listener = (_event, payload) => {
    try {
      cb(payload);
    } catch (err) {
      /* swallow renderer errors so the bridge stays alive */
    }
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('aipdd', api);