'use strict';

/**
 * selfcheck.js
 *
 * 配对窗口里的环境自检。每条产出 { id, label, ok, detail, fix }，fix 是一句可执行引导。
 *
 * 检查项：
 *   1. 本机 Agent 是否配好文本模型（渠道 + 模型 + 密钥）
 *   2. 默认工作区是否可用（不存在就引导去建）
 *   3. 平台是否可达（GET {baseUrl}/health）
 *
 * 模型渠道本身通不通不在这里打——那要真花一次调用，放到 Agent 页的「测试连通」按钮上。
 */

const fs = require('fs');
const agentConfig = require('./agent/config');
const workspaces = require('./workspaces');
const platform = require('./platform-client');

function checkAgent() {
  const channel = agentConfig.activeChannel();
  if (!channel) {
    return {
      id: 'agent',
      label: '本机 Agent 已配置模型',
      ok: false,
      detail: '还没填渠道地址或模型',
      fix: '打开「Agent 配置」，填渠道地址、密钥与模型名'
    };
  }
  const named = (channel.name || '渠道') + ' · ' + channel.model;
  if (!channel.apiKey) {
    return {
      id: 'agent',
      label: '本机 Agent 已配置模型',
      ok: false,
      detail: named + '：密钥为空',
      fix: '本地模型服务可留空，公网渠道请填 API Key'
    };
  }
  return { id: 'agent', label: '本机 Agent 已配置模型', ok: true, detail: named, fix: '' };
}

function workspaceCheck(cfg) {
  const dir = workspaces.defaultWorkspace(cfg);
  if (!dir) {
    return {
      id: 'workspace',
      label: '工作区可用',
      ok: false,
      detail: '还没有可用的工作目录',
      fix: '在「工作区」里添加一个本机目录'
    };
  }
  try {
    if (!fs.statSync(dir).isDirectory()) throw new Error('not a dir');
  } catch (err) {
    return {
      id: 'workspace',
      label: '工作区可用',
      ok: false,
      detail: '目录不存在：' + dir,
      fix: '换个已存在的目录，或在状态窗口里新建'
    };
  }
  const count = workspaces.listWorkspaces(cfg).length;
  return {
    id: 'workspace',
    label: '工作区可用',
    ok: true,
    detail: dir + (count > 1 ? '（另有 ' + (count - 1) + ' 个候选）' : ''),
    fix: ''
  };
}

async function checkPlatform(baseUrl) {
  const res = await platform.health(baseUrl);
  if (!res.transportError && res.httpStatus === 200) {
    return {
      id: 'platform',
      label: '平台可达',
      ok: true,
      detail: baseUrl + '/health 返回 200',
      fix: ''
    };
  }
  return {
    id: 'platform',
    label: '平台可达',
    ok: false,
    detail: res.transportError ? res.error : 'HTTP ' + res.httpStatus,
    fix: '请检查「平台地址」是否正确、网络是否连通'
  };
}

/**
 * Run all checks. Returns { checks: [...], allOk }.
 * getConfig 是 config-store.get，manager 参数保留旧签名但已不再使用。
 */
async function runAll(getConfig) {
  const cfg = getConfig ? getConfig() : {};
  const agent = checkAgent();
  const workspace = workspaceCheck(cfg);
  const platformCheck = await checkPlatform(cfg.baseUrl);

  return {
    checks: [agent, workspace, platformCheck],
    allOk: agent.ok && workspace.ok && platformCheck.ok,
    acpPort: 0
  };
}

module.exports = { runAll };
