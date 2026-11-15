'use strict';

/**
 * app.js — 单窗口外壳的全部交互。
 *
 * 左侧分组导航（概览 / 设备绑定 / Agent 模型·技能·分身·记忆 / 工作区·权限 / 任务·日志），
 * 右侧一屏一个面板。所有数据走 window.aipdd（contextBridge），渲染层不认识 electron。
 */

(function () {
  const api = window.aipdd;

  const $ = (id) => document.getElementById(id);

  const PAGE_TITLE = {
    overview: '概览',
    binding: '设备绑定',
    chat: '对话',
    models: '模型渠道',
    skills: '技能',
    personas: '数字分身',
    memory: '长期记忆',
    plugins: '插件',
    browser: '浏览器',
    workspace: '工作区与权限'
  };

  const STATE_LABEL = {
    READY: '可派活',
    BUSY: '执行中',
    UNCONFIGURED: '未配置模型',
    FAILED: '上次执行失败'
  };
  const STATE_CLASS = { READY: 'ok', BUSY: 'info', UNCONFIGURED: 'warn', FAILED: 'bad' };
  const FAIL_HINT = {
    NO_MODEL: '还没有可用的文本模型：到「模型渠道」填渠道地址、密钥与模型名',
    MODEL_UNREACHABLE: '模型渠道连不上：检查渠道地址与本机网络，公网渠道需要出网',
    MODEL_AUTH: '模型渠道拒绝鉴权：检查 API Key 是否填对、是否已过期',
    WORKSPACE_MISSING: '默认工作区目录不存在：到「工作区与权限」添加一个本机目录',
    WORKSPACE_NOT_ALLOWED: '平台下发的工作区不在本机白名单内，请先把那个目录加进来',
    TOOL_DENIED: '本地工具调用被权限策略拒绝：按需把权限档调到允许改文件'
  };

  const state = {
    snapshot: null,
    agent: null,
    pair: null,
    channels: [],
    skills: [],
    personas: [],
    plugins: [],
    activeChannelId: '',
    editingChannelId: '',
    editingSkillId: '',
    editingPersonaId: '',
    baseUrlDirty: false,
    deviceNameDirty: false,
    policyDirty: false,
    skillsLoaded: false,
    personasLoaded: false,
    chat: {
      list: [],
      activeId: '',
      messages: [],
      running: false,
      skillIds: [],
      pluginIds: [],
      personaId: '',
      channelId: '',
      workspacePath: '',
      attachments: []
    }
  };

  /* ------------------------------------------------------------ 工具函数 */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch (err) {
      return iso;
    }
  }

  function fmtClock(iso) {
    if (!iso) return '--:--';
    try {
      const d = new Date(iso);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch (err) {
      return '--:--';
    }
  }

  function taskBadgeClass(status) {
    if (status === '成功' || status === 'ok' || status === '完成') return 'ok';
    if (status === '执行中' || status === '排队中' || status === '已领取') return 'info';
    if (status === '超时' || status === '已取消') return 'warn';
    return 'bad';
  }

  function note(node, text, kind) {
    node.textContent = text || '';
    node.className = 'card-note' + (kind ? ' ' + kind : '');
  }

  /* ---------------------------------------------------------------- 导航 */

  function showPane(name) {
    const target = PAGE_TITLE[name] ? name : 'overview';
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.go === target);
    });
    document.querySelectorAll('.pane').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === target);
    });
    $('pageTitle').textContent = PAGE_TITLE[target];
    document.querySelector('.content').scrollTop = 0;
    if (target === 'binding' && !state.pair && isLoggedIn()) void refreshPair();
    if (target === 'browser') {
      void openBuiltinBrowser();
      void loadBrowserPages();
    }
    if (target === 'chat') {
      void loadChatList();
      renderChatAttachments();
      $('chatInput').focus();
    }
  }

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showPane(btn.dataset.go));
  });

  $('goBinding').addEventListener('click', () => showPane('binding'));
  $('goModels').addEventListener('click', () => showPane('models'));

  /* ------------------------------------------------------------ 顶部状态 */

  function renderTopbar(s) {
    const pill = $('connPill');
    let text = '未绑定';
    let cls = 'muted';
    if (s && s.paired && s.connected) {
      text = s.running ? '执行中' : '已连接';
      cls = s.running ? 'info' : 'ok';
    } else if (s && s.paired) {
      text = '平台不可达';
      cls = 'bad';
    }
    clear(pill);
    pill.className = 'pill ' + cls;
    pill.appendChild(el('span', 'dot'));
    pill.appendChild(document.createTextNode(text));
  }

  /* ------------------------------------------------------------- 概览页 */

  function renderOverview(s) {
    if (!s) return;
    $('ovUser').textContent = s.loggedIn ? s.userName || '已登录' : '未登录';
    $('ovHost').textContent = s.boundHostName || (s.paired ? '已绑定' : '未绑定');
    $('ovPoints').textContent = s.loggedIn
      ? s.points === null || s.points === undefined
        ? '同步中…'
        : Number(s.points).toLocaleString('zh-CN')
      : '登录后显示';
    $('ovBaseUrl').textContent = s.baseUrl || '—';
    $('ovHeartbeat').textContent = fmtTime(s.lastHeartbeat);
    $('ovDevice').textContent = s.deviceName || '—';
    $('topbarMeta').textContent = (s.deviceName || '') + (s.paired ? ' · ' + (s.baseUrl || '') : '');

    const agent = s.agent || null;
    if (!agent) {
      $('ovAgentState').textContent = '未初始化';
      return;
    }
    const st = agent.state || 'UNCONFIGURED';
    const pill = el('span', 'pill ' + (STATE_CLASS[st] || 'muted'), STATE_LABEL[st] || st);
    clear($('ovAgentState'));
    $('ovAgentState').appendChild(pill);
    $('ovAgentModel').textContent = agent.model ? (agent.channel || '渠道') + ' · ' + agent.model : '模型未配置';
    $('ovAgentCounts').textContent =
      '技能 ' + (agent.skillCount || 0) + ' 条 · 数字分身 ' + (agent.personaCount || 0) + ' 个';
    $('ovWorkspace').textContent = agent.workspace || '—';
    $('ovWorkspace').title = agent.workspace || '';

    const hint = $('ovAgentHint');
    if (st === 'UNCONFIGURED') note(hint, FAIL_HINT.NO_MODEL, 'bad');
    else if (agent.failReason) note(hint, FAIL_HINT[agent.failReason] || agent.failReason, 'bad');
    else note(hint, '');
  }

  /** 平台→本机的完整记录：平台原文 + 本机回复，按更新时间倒序。 */
  async function loadTaskRecords() {
    const rows = (await api.getTaskRecords(100)) || [];
    const box = $('taskRecords');
    clear(box);
    if (!rows.length) {
      box.appendChild(el('div', 'empty', '暂无任务记录：平台下发指令后这里会出现完整内容'));
      return;
    }
    rows.forEach((row) => {
      const details = document.createElement('details');
      details.className = 'task-record';
      const summary = document.createElement('summary');
      summary.appendChild(el('span', 't', fmtClock(row.updatedAt || row.startedAt)));
      summary.appendChild(el('span', 'title', row.title || row.commandCode || '(无标题)'));
      summary.appendChild(el('span', 'badge ' + taskBadgeClass(row.status), row.status || ''));
      details.appendChild(summary);
      const body = el('div', 'task-record-body');
      const addBlock = (label, text, mono) => {
        const line = el('div', 'kv-row');
        line.appendChild(el('span', 'k', label));
        line.appendChild(el('pre', 'record-text' + (mono ? ' mono' : ''), text || '—'));
        body.appendChild(line);
      };
      addBlock('平台下发', row.instruction);
      addBlock('本机回复', row.reply || row.errorMessage || '（未回复）');
      if (row.cwd) addBlock('工作区', row.cwd, true);
      details.appendChild(body);
      box.appendChild(details);
    });
  }

  async function loadLogs() {
    const logs = await api.getLogs();
    $('logText').textContent = logs || '(无日志)';
  }

  /* --------------------------------------------------------- 设备绑定页 */

  function isLoggedIn() {
    return !!(state.snapshot && state.snapshot.loggedIn);
  }

  /** 登录前只显示账号密码表单；登录后换成账号摘要 + 退出按钮。 */
  function renderLogin(s) {
    if (!s) return;
    const logged = !!s.loggedIn;
    $('loginForm').classList.toggle('hidden', logged);
    $('loggedInBox').classList.toggle('hidden', !logged);
    if (logged) {
      $('loginName').textContent = s.userName || '已登录';
      $('loginBaseUrl').textContent = s.baseUrl || '—';
      $('loginPoints').textContent =
        s.points === null || s.points === undefined
          ? '同步中…'
          : Number(s.points).toLocaleString('zh-CN') + ' 分';
    }
    const refresh = $('pairRefresh');
    refresh.disabled = !logged;
    $('bindLockHint').textContent = logged
      ? '连接码只在本账号下认领，先在平台「Bot 主机」页输入该码'
      : '登录平台账号后自动生成连接码';
  }

  function renderPair(pair) {
    if (!pair) return;
    state.pair = pair;
    const codeNode = $('pairCode');
    const code = pair.pairCode || '';
    codeNode.textContent = code || '------';
    codeNode.className = 'bind-code' + (code ? '' : ' empty');

    const title = $('pairTitle');
    const desc = $('pairDesc');
    if (pair.status === 'waiting') {
      title.textContent = '等待在平台确认';
      desc.textContent = '在平台「Bot 主机」页输入上面的连接码，' + (pair.expiresInSec || 0) + ' 秒内有效';
    } else if (pair.status === 'ok') {
      title.textContent = '已绑定';
      desc.textContent = '本机已连上平台，接下来平台下发的指令会直接交给本机 Agent';
    } else if (pair.status === 'expired') {
      title.textContent = '连接码已过期';
      desc.textContent = pair.message || '点「刷新连接码」重新获取';
    } else if (pair.status === 'locked') {
      title.textContent = '先登录平台账号';
      desc.textContent = pair.message || '登录后会自动申请连接码，再到平台「Bot 主机」页认领';
    } else if (pair.status === 'error') {
      title.textContent = '获取连接码失败';
      desc.textContent = pair.message || '检查平台地址与本机网络后重试';
    } else {
      title.textContent = '正在获取连接码…';
      desc.textContent = '稍候，正在联系平台';
    }
  }

  async function refreshPair() {
    if (!isLoggedIn()) {
      $('pairTitle').textContent = '先登录平台账号';
      $('pairDesc').textContent = '登录后会自动申请连接码，再到平台「Bot 主机」页认领';
      return;
    }
    $('pairTitle').textContent = '正在获取连接码…';
    const res = await api.refreshPairCode();
    if (res && res.state) renderPair(res.state);
  }

  $('pairRefresh').addEventListener('click', () => void refreshPair());

  $('saveBaseUrl').addEventListener('click', async () => {
    const url = $('baseUrl').value.trim();
    if (!url) return;
    const res = await api.saveBaseUrl(url);
    if (res && res.ok) {
      $('baseUrl').value = res.baseUrl;
      state.baseUrlDirty = false;
      await reloadState();
      if (isLoggedIn()) void refreshPair();
    }
  });
  $('baseUrl').addEventListener('input', () => {
    state.baseUrlDirty = true;
  });

  async function doLogin() {
    const url = $('baseUrl').value.trim();
    const username = $('loginUser').value.trim();
    const password = $('loginPass').value;
    if (!/^https?:\/\//i.test(url)) {
      note($('loginHint'), '平台地址要以 http:// 或 https:// 开头', 'bad');
      return;
    }
    if (!username || !password) {
      note($('loginHint'), '请输入账号和密码', 'bad');
      return;
    }
    const btn = $('doLogin');
    btn.disabled = true;
    btn.textContent = '登录中…';
    try {
      const res = await api.platformLogin({ baseUrl: url, username, password });
      if (res && res.ok) {
        $('loginPass').value = '';
        note($('loginHint'), '登录成功，正在申请连接码', 'ok');
        if (res.state) applyState(res.state);
        state.baseUrlDirty = false;
        void refreshPair();
      } else {
        note($('loginHint'), (res && res.error) || '登录失败', 'bad');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '登录';
    }
  }

  $('doLogin').addEventListener('click', () => void doLogin());
  $('loginPass').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') void doLogin();
  });

  $('doLogout').addEventListener('click', async () => {
    if (!window.confirm('退出平台账号？连接码会停用，已配对的主机不受影响。')) return;
    await api.platformLogout();
    note($('loginHint'), '已退出登录，重新登录后才能继续配对', 'ok');
    await reloadState();
  });

  $('saveDeviceName').addEventListener('click', async () => {
    const name = $('deviceName').value.trim();
    if (!name) return;
    const res = await api.saveDeviceName(name);
    if (res && res.ok) {
      $('deviceName').value = res.deviceName;
      state.deviceNameDirty = false;
    }
  });
  $('deviceName').addEventListener('input', () => {
    state.deviceNameDirty = true;
  });

  $('saveToken').addEventListener('click', async () => {
    const value = $('tokenInput').value.trim();
    if (!value) return;
    const res = await api.saveToken(value);
    if (res && res.ok) {
      $('tokenInput').value = '';
      note($('tokenHint'), '已绑定，令牌已保存在本机。', 'ok');
    } else {
      note($('tokenHint'), (res && res.error) || '绑定失败', 'bad');
    }
  });

  function renderChecks(result) {
    const list = $('checkList');
    clear(list);
    const checks = (result && result.checks) || [];
    if (!checks.length) {
      list.appendChild(el('div', 'empty', '尚未检测'));
      return;
    }
    checks.forEach((check) => {
      const row = el('div', 'check ' + (check.ok ? 'ok' : 'bad'));
      row.appendChild(el('span', 'mark', check.ok ? '✓' : '!'));
      const body = el('div', 'body');
      body.appendChild(el('div', 'name', check.label));
      if (check.detail) body.appendChild(el('div', 'detail', check.detail));
      if (!check.ok && check.fix) body.appendChild(el('div', 'fix', check.fix));
      row.appendChild(body);
      list.appendChild(row);
    });
  }

  async function runSelfCheck() {
    const result = await api.runSelfCheck();
    renderChecks(result);
    return result;
  }

  $('runCheck').addEventListener('click', () => void runSelfCheck());
  $('recheck').addEventListener('click', async () => {
    await runSelfCheck();
    showPane('binding');
  });

  /* ------------------------------------------------------------ 模型渠道 */

  function renderChannels(list, activeId) {
    const box = $('channelList');
    clear(box);
    if (!Array.isArray(list) || !list.length) {
      box.appendChild(el('div', 'empty', '还没有渠道：点右上「新增渠道」填一条'));
      return;
    }
    list.forEach((ch) => {
      const row = el('div', 'row' + (ch.id === activeId ? ' active' : ''));
      row.appendChild(el('span', 'row-icon', (ch.protocol === 'anthropic' ? 'A' : 'O')));

      const main = el('div', 'row-main');
      const isPlatform = ch.id === 'platform';
      const title = el('div', 'row-title', ch.name || ch.id);
      if (ch.id === activeId) title.appendChild(el('span', 'tag on', '当前'));
      if (isPlatform) title.appendChild(el('span', 'tag', '平台下发'));
      main.appendChild(title);
      main.appendChild(el('div', 'row-sub', ch.baseUrl + ' · ' + ch.model));
      row.appendChild(main);

      const actions = el('div', 'row-actions');
      if (ch.id !== activeId) {
        const use = el('button', 'btn small ghost', '设为当前');
        use.addEventListener('click', async () => {
          await api.setActiveChannel(ch.id);
          await reloadAgent();
        });
        actions.appendChild(use);
      }
      if (!isPlatform) {
        const edit = el('button', 'btn small ghost', '编辑');
        edit.addEventListener('click', () => fillChannelForm(ch));
        actions.appendChild(edit);
      }
      if (!isPlatform) {
        const remove = el('button', 'btn small ghost', '删除');
        remove.addEventListener('click', async () => {
          if (!window.confirm('删除渠道「' + (ch.name || ch.id) + '」？')) return;
          const res = await api.removeChannel(ch.id);
          if (res && res.ok === false) window.alert(res.error || '删除失败');
          if (state.editingChannelId === ch.id) clearChannelForm();
          await reloadAgent();
        });
        actions.appendChild(remove);
      }
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function fillChannelForm(ch) {
    state.editingChannelId = (ch && ch.id) || '';
    $('channelMode').textContent = ch ? '修改 · ' + (ch.name || ch.id) : '新增';
    $('chName').value = (ch && ch.name) || '';
    $('chProtocol').value = (ch && ch.protocol) || 'openai';
    $('chBaseUrl').value = (ch && ch.baseUrl) || '';
    $('chApiKey').value = (ch && ch.apiKey) || '';
    $('chModel').value = (ch && ch.model) || '';
    note($('channelHint'), '');
  }

  function clearChannelForm() {
    fillChannelForm(null);
    $('channelMode').textContent = '新增';
  }

  $('newChannel').addEventListener('click', () => {
    clearChannelForm();
    $('chName').focus();
  });
  $('cancelChannel').addEventListener('click', () => clearChannelForm());

  $('saveChannel').addEventListener('click', async () => {
    const payload = {
      name: $('chName').value,
      protocol: $('chProtocol').value,
      baseUrl: $('chBaseUrl').value,
      apiKey: $('chApiKey').value,
      model: $('chModel').value
    };
    if (state.editingChannelId) payload.id = state.editingChannelId;
    if (!payload.baseUrl.trim() || !payload.model.trim()) {
      note($('channelHint'), '渠道地址与模型名必填', 'bad');
      return;
    }
    const res = await api.saveChannel(payload);
    if (res && res.ok) {
      note($('channelHint'), '已保存：' + res.channel.name + ' · ' + res.channel.model, 'ok');
      clearChannelForm();
      await reloadAgent();
    } else {
      note($('channelHint'), (res && res.error) || '保存失败', 'bad');
    }
  });

  $('probe').addEventListener('click', async () => {
    note($('probeHint'), '正在用当前渠道发一次最小调用…');
    const res = await api.probeAgent();
    if (res && res.ok) note($('probeHint'), '连通正常：' + (res.detail || '模型有应答') + '（' + (res.model || '') + '）', 'ok');
    else note($('probeHint'), (res && res.detail) || '连不上渠道', 'bad');
    await reloadState();
  });

  function renderParams(cfg) {
    if (!cfg) return;
    $('temperature').value = cfg.temperature;
    $('maxTokens').value = cfg.maxTokens;
  }

  $('saveParams').addEventListener('click', async () => {
    const res = await api.saveAgent({
      temperature: Number($('temperature').value),
      maxTokens: Number($('maxTokens').value)
    });
    if (res && res.ok) renderParams(res.config);
  });

  /* ---------------------------------------------------------------- 技能 */

  function renderSkills(list, enabled) {
    const box = $('skillList');
    clear(box);
    state.skills = Array.isArray(list) ? list : [];
    if (!state.skills.length) {
      box.appendChild(
        el(
          'div',
          'empty',
          '还没有技能：点右上「上传 ZIP / 选择文件夹」导入技能包；Agent 需要时自己读正文'
        )
      );
      return;
    }
    const on = Array.isArray(enabled) ? enabled : [];
    state.skills.forEach((skill) => {
      const row = el('div', 'row');
      const checked = on.includes(skill.id);
      const flag = document.createElement('input');
      flag.type = 'checkbox';
      flag.checked = checked;
      flag.title = '不勾选任何一项＝全部可用';
      flag.addEventListener('change', async () => {
        const box2 = $('skillList');
        const ids = [];
        box2.querySelectorAll('input[type="checkbox"]').forEach((input, index) => {
          if (input.checked && state.skills[index]) ids.push(state.skills[index].id);
        });
        await api.saveAgent({ enabledSkills: ids });
        await reloadAgent();
      });
      row.appendChild(flag);

      const main = el('div', 'row-main');
      const title = el('div', 'row-title', skill.name || skill.id);
      title.appendChild(el('span', 'tag', skill.id));
      main.appendChild(title);
      main.appendChild(el('div', 'row-sub', skill.description || '（没有说明）'));
      row.appendChild(main);

      const actions = el('div', 'row-actions');
      const edit = el('button', 'btn small ghost', '编辑');
      edit.addEventListener('click', async () => {
        const full = await api.readSkill(skill.id);
        if (!full) return;
        state.editingSkillId = skill.id;
        $('skillEditorCard').classList.remove('hidden');
        $('skillMode').textContent = '修改 · ' + skill.id;
        $('skId').value = skill.id;
        $('skId').disabled = true;
        $('skName').value = full.name || '';
        $('skDesc').value = skill.description || '';
        $('skBody').value = full.body || '';
        note($('skillHint'), '');
      });
      actions.appendChild(edit);
      const remove = el('button', 'btn small ghost', '删除');
      remove.addEventListener('click', async () => {
        if (!window.confirm('删除技能「' + skill.name + '」？')) return;
        await api.removeSkill(skill.id);
        if (state.editingSkillId === skill.id) clearSkillForm();
        await reloadAgent();
      });
      actions.appendChild(remove);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function clearSkillForm() {
    state.editingSkillId = '';
    $('skillMode').textContent = '';
    $('skId').disabled = false;
    $('skId').value = '';
    $('skName').value = '';
    $('skDesc').value = '';
    $('skBody').value = '';
    note($('skillHint'), '');
    $('skillEditorCard').classList.add('hidden');
  }

  $('cancelSkill').addEventListener('click', () => clearSkillForm());

  // 技能包导入：只读本机 ZIP / 文件夹里的 SKILL.md，导入后立即可勾选使用。
  async function importSkillPackage(mode) {
    const res = await api.importSkillPackage(mode);
    if (!res || res.canceled) return;
    if (res.ok) {
      note(
        $('skillImportHint'),
        '已导入：' + (res.skill.name || res.skill.id) + '（' + res.skill.id + '）',
        'ok'
      );
      clearSkillForm();
      await reloadAgent();
    } else {
      note($('skillImportHint'), res.error || '技能包导入失败', 'bad');
    }
  }
  $('importSkillZip').addEventListener('click', () => importSkillPackage('zip'));
  $('importSkillFolder').addEventListener('click', () => importSkillPackage('folder'));

  $('saveSkill').addEventListener('click', async () => {
    const id = state.editingSkillId;
    if (!id) {
      note($('skillImportHint'), '新建技能请用「上传 ZIP / 选择文件夹」导入技能包', 'bad');
      return;
    }
    const res = await api.saveSkill({
      id,
      name: $('skName').value,
      description: $('skDesc').value,
      body: $('skBody').value
    });
    if (res && res.ok) {
      note($('skillImportHint'), '已保存：' + id, 'ok');
      clearSkillForm();
      await reloadAgent();
    } else {
      note($('skillHint'), (res && res.error) || '保存失败', 'bad');
    }
  });

  /* ------------------------------------------------------------ 数字分身 */

  function renderPersonas(list, activeId) {
    const box = $('personaList');
    clear(box);
    state.personas = Array.isArray(list) ? list : [];

    const none = el('div', 'row' + (activeId ? '' : ' active'));
    const noneMain = el('div', 'row-main');
    const noneTitle = el('div', 'row-title', '不启用分身');
    if (!activeId) noneTitle.appendChild(el('span', 'tag on', '当前'));
    noneMain.appendChild(noneTitle);
    noneMain.appendChild(el('div', 'row-sub', '只跑基础人设，不加额外口径'));
    none.appendChild(noneMain);
    const noneActions = el('div', 'row-actions');
    const useNone = el('button', 'btn small ghost', '设为当前');
    useNone.addEventListener('click', async () => {
      await api.saveAgent({ personaId: '' });
      await reloadAgent();
    });
    noneActions.appendChild(useNone);
    none.appendChild(noneActions);
    box.appendChild(none);

    if (!state.personas.length) {
      box.appendChild(el('div', 'empty', '还没有数字分身：点右上「新建分身」写一段人设与口径'));
      return;
    }

    state.personas.forEach((persona) => {
      const row = el('div', 'row' + (persona.id === activeId ? ' active' : ''));
      const main = el('div', 'row-main');
      const title = el('div', 'row-title', persona.name || persona.id);
      if (persona.id === activeId) title.appendChild(el('span', 'tag on', '当前'));
      title.appendChild(el('span', 'tag', persona.id));
      main.appendChild(title);
      main.appendChild(el('div', 'row-sub', persona.description || '（没有说明）'));
      row.appendChild(main);

      const actions = el('div', 'row-actions');
      if (persona.id !== activeId) {
        const use = el('button', 'btn small ghost', '启用');
        use.addEventListener('click', async () => {
          await api.saveAgent({ personaId: persona.id });
          await reloadAgent();
        });
        actions.appendChild(use);
      }
      const edit = el('button', 'btn small ghost', '编辑');
      edit.addEventListener('click', async () => {
        const full = await api.readPersona(persona.id);
        if (!full) return;
        state.editingPersonaId = persona.id;
        $('personaMode').textContent = '修改 · ' + persona.id;
        $('peId').value = persona.id;
        $('peId').disabled = true;
        $('peName').value = full.name || '';
        $('peDesc').value = persona.description || '';
        $('peBody').value = full.prompt || '';
        note($('personaHint'), '');
      });
      actions.appendChild(edit);
      const remove = el('button', 'btn small ghost', '删除');
      remove.addEventListener('click', async () => {
        if (!window.confirm('删除数字分身「' + persona.name + '」？')) return;
        await api.removePersona(persona.id);
        if (state.editingPersonaId === persona.id) clearPersonaForm();
        await reloadAgent();
      });
      actions.appendChild(remove);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function clearPersonaForm() {
    state.editingPersonaId = '';
    $('personaMode').textContent = '新建';
    $('peId').disabled = false;
    $('peId').value = '';
    $('peName').value = '';
    $('peDesc').value = '';
    $('peBody').value = '';
    note($('personaHint'), '');
  }

  $('newPersona').addEventListener('click', () => {
    clearPersonaForm();
    $('peId').focus();
  });
  $('cancelPersona').addEventListener('click', () => clearPersonaForm());

  $('savePersona').addEventListener('click', async () => {
    const id = state.editingPersonaId || $('peId').value.trim();
    if (!id) {
      note($('personaHint'), '分身 id 必填', 'bad');
      return;
    }
    const res = await api.savePersona({
      id,
      name: $('peName').value,
      description: $('peDesc').value,
      body: $('peBody').value
    });
    if (res && res.ok) {
      note($('personaHint'), '已保存：' + id, 'ok');
      clearPersonaForm();
      await reloadAgent();
    } else {
      note($('personaHint'), (res && res.error) || '保存失败', 'bad');
    }
  });

  /* ---------------------------------------------------------------- 记忆 */

  $('saveMemory').addEventListener('click', async () => {
    const res = await api.saveMemory($('memory').value);
    if (res && res.ok) note($('memoryHint'), '已保存', 'ok');
  });

  $('clearMemory').addEventListener('click', async () => {
    if (!window.confirm('清空全部长期记忆？')) return;
    $('memory').value = '';
    await api.saveMemory('');
    note($('memoryHint'), '已清空', 'ok');
  });

  /* ---------------------------------------------------------------- 插件 */

  const PLUGIN_DEFAULT_CONFIG = {
    http: '{"method":"GET","url":"https://api.example.com/items?q={{q}}"}',
    command: '{"command":"echo {{text}}"}'
  };

  function pluginIdOf() {
    return $('pluginMode').dataset.id || '';
  }

  function resetPluginForm() {
    $('pluginMode').textContent = '';
    delete $('pluginMode').dataset.id;
    $('plgName').value = '';
    $('plgKind').value = 'http';
    $('plgDesc').value = '';
    $('plgParams').value = '';
    $('plgConfig').value = PLUGIN_DEFAULT_CONFIG.http;
    note($('pluginHint'), '');
    $('pluginEditorCard').classList.add('hidden');
  }

  function renderPlugins(list) {
    state.plugins = Array.isArray(list) ? list : [];
    renderChatContext();
    const box = $('pluginList');
    clear(box);
    if (!state.plugins.length) {
      box.appendChild(
        el(
          'span',
          'muted',
          '还没有插件：点右上「上传 ZIP / 选择文件夹」导入插件包（含 plugin.json）。'
        )
      );
      return;
    }
    state.plugins.forEach((plugin) => {
      const row = el('div', 'list-row');
      const main = el('div', 'list-main');
      main.appendChild(el('span', 'list-title', plugin.name));
      main.appendChild(
        el('span', 'muted', (plugin.kind === 'http' ? 'HTTP' : '命令') + ' · ' + plugin.toolName + (plugin.enabled ? '' : ' · 已停用'))
      );
      if (plugin.description) main.appendChild(el('span', 'muted', plugin.description));
      row.appendChild(main);
      const actions = el('div', 'list-actions');
      const edit = el('button', 'btn small', '编辑');
      edit.addEventListener('click', () => {
        $('pluginEditorCard').classList.remove('hidden');
        $('pluginMode').textContent = '编辑：' + plugin.name;
        $('pluginMode').dataset.id = plugin.id;
        $('plgName').value = plugin.name;
        $('plgKind').value = plugin.kind;
        $('plgDesc').value = plugin.description || '';
        $('plgParams').value = JSON.stringify(plugin.params || {}, null, 2);
        $('plgConfig').value = JSON.stringify(plugin.config || {}, null, 2);
      });
      const remove = el('button', 'btn small ghost', '删除');
      remove.addEventListener('click', async () => {
        const ok = window.confirm('删除插件「' + plugin.name + '」？Agent 随即失去这个工具。');
        if (!ok) return;
        await api.removePlugin(plugin.id);
        await loadPlugins();
      });
      actions.appendChild(edit);
      actions.appendChild(remove);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  async function loadPlugins() {
    const res = await api.listPlugins();
    renderPlugins(res && res.list ? res.list : []);
  }

  $('plgKind').addEventListener('change', () => {
    if (!pluginIdOf()) $('plgConfig').value = PLUGIN_DEFAULT_CONFIG[$('plgKind').value] || '';
  });

  $('cancelPlugin').addEventListener('click', () => resetPluginForm());

  // 插件包导入：只读本机 ZIP / 文件夹里的 plugin.json，导入后立即可用作 Agent 工具。
  async function importPluginPackage(mode) {
    const res = await api.importPluginPackage(mode);
    if (!res || res.canceled) return;
    if (res.ok) {
      note(
        $('pluginImportHint'),
        '已导入：' + (res.plugin.name || res.plugin.id) + '（' + res.plugin.toolName + '）',
        'ok'
      );
      resetPluginForm();
      await loadPlugins();
    } else {
      note($('pluginImportHint'), res.error || '插件包导入失败', 'bad');
    }
  }
  $('importPluginZip').addEventListener('click', () => importPluginPackage('zip'));
  $('importPluginFolder').addEventListener('click', () => importPluginPackage('folder'));

  $('savePlugin').addEventListener('click', async () => {
    const id = pluginIdOf();
    if (!id) {
      note($('pluginImportHint'), '新建插件请用「上传 ZIP / 选择文件夹」导入插件包', 'bad');
      return;
    }
    let params;
    let config;
    try {
      params = $('plgParams').value.trim() ? JSON.parse($('plgParams').value) : {};
      config = $('plgConfig').value.trim() ? JSON.parse($('plgConfig').value) : {};
    } catch (err) {
      note($('pluginHint'), 'JSON 不合法：' + err.message, 'bad');
      return;
    }
    const res = await api.savePlugin({
      id,
      name: $('plgName').value,
      kind: $('plgKind').value,
      description: $('plgDesc').value,
      params,
      config
    });
    if (!res || !res.ok) {
      note($('pluginHint'), (res && res.error) || '保存失败', 'bad');
      return;
    }
    note($('pluginImportHint'), '已保存：' + res.plugin.name + ' → 工具 ' + res.plugin.toolName, 'ok');
    resetPluginForm();
    await loadPlugins();
  });

  /* ------------------------------------------------------------ Chrome 桥接 */

  function bridgeAddress(status) {
    return 'http://127.0.0.1:' + ((status && status.port) || 35911);
  }

  function renderBridge(status) {
    state.bridge = status || {};
    // 新版浏览器界面不再展示桥接面板；元素不在时只保留状态供内部使用。
    if (!$('bridgeState')) return;
    $('bridgeState').textContent = !status || !status.running
      ? '未启动'
      : status.connected
        ? '插件已连接' + (status.extension && status.extension.version ? '（v' + status.extension.version + '）' : '')
        : '等插件连接';
    $('bridgeAddr').textContent = bridgeAddress(status);
    $('bridgeToken').textContent = (status && status.token) || '—';
    if (status && status.port && document.activeElement !== $('bridgePort')) {
      $('bridgePort').value = String(status.port);
    }
  }

  async function loadBridge() {
    const res = await api.bridgeStatus();
    renderBridge(res && res.status ? res.status : null);
  }

  $('openChromeExtFolder').addEventListener('click', async () => {
    const res = await api.openChromeExtFolder();
    if (!res || !res.ok) window.alert((res && res.error) || '打开失败');
  });

  /* ---------------------------------------------------------- Agent 浏览器 */

  async function openBuiltinBrowser() {
    const res = await api.openBrowser();
    if (!res || !res.ok) {
      window.alert((res && res.error) || '打开客户端浏览器失败');
      return;
    }
    setTimeout(() => void loadBrowserPages(), 600);
  }

  async function loadBrowserPages() {
    const res = await api.browserPages();
    const box = $('builtinPageList');
    if (!box) return;
    clear(box);
    const rows = (res && res.list) || [];
    if (!rows.length) {
      box.appendChild(el('div', 'empty', '还没有打开的页面：点「打开浏览器」，或让 Agent 打开一个网址'));
      return;
    }
    rows.forEach((row) => {
      const item = el('div', 'list-row');
      const main = el('div', 'list-main');
      const title = el('span', 'list-title', row.title || '未命名页面');
      title.appendChild(el('span', 'tag' + (row.active ? ' on' : ''), row.active ? '当前' : '#' + row.id));
      main.appendChild(title);
      main.appendChild(el('span', 'muted', row.url || 'about:blank'));
      item.appendChild(main);
      box.appendChild(item);
    });
  }

  function renderBrowserExts(list) {
    const box = $('browserExtList');
    if (!box) return;
    clear(box);
    const rows = (Array.isArray(list) ? list : []).filter((row) => !row.builtin);
    if (!rows.length) {
      box.appendChild(el('div', 'empty', '暂无插件'));
      return;
    }
    rows.forEach((item) => {
      const row = el('div', 'list-row');
      const main = el('div', 'list-main');
      main.appendChild(el('span', 'list-title', item.name + ' · v' + item.version));
      main.appendChild(el('span', 'muted', item.id));
      row.appendChild(main);
      box.appendChild(row);
    });
  }

  $('openBuiltinBrowser').addEventListener('click', () => void openBuiltinBrowser());
  $('reloadBrowserPages').addEventListener('click', () => void loadBrowserPages());
  $('goPluginsFromBrowser').addEventListener('click', () => showPane('plugins'));

  /* ------------------------------------------------------ Chrome 插件包管理 */

  function renderChromeExts(list) {
    const box = $('chromeExtList');
    clear(box);
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) {
      box.appendChild(el('div', 'empty', '还没有导入 Chrome 插件：点右上「上传 ZIP / 选择文件夹」'));
      return;
    }
    rows.forEach((item) => {
      const row = el('div', 'list-row');
      const main = el('div', 'list-main');
      const title = el('span', 'list-title', item.name);
      title.appendChild(el('span', 'tag' + (item.builtin ? ' on' : ''), item.builtin ? '内置' : 'v' + item.version));
      main.appendChild(title);
      main.appendChild(
        el('span', 'muted', item.id)
      );
      row.appendChild(main);
      if (!item.builtin) {
        const actions = el('div', 'list-actions');
        const remove = el('button', 'btn small ghost', '删除');
        remove.addEventListener('click', async () => {
          if (!window.confirm('删除插件包「' + item.name + '」？')) return;
          const res = await api.removeChromeExtension(item.id);
          if (res && res.ok) {
            note($('chromeExtHint'), '已删除：' + item.name, 'ok');
            await loadChromeExts();
          } else {
            note($('chromeExtHint'), (res && res.error) || '删除失败', 'bad');
          }
        });
        actions.appendChild(remove);
        row.appendChild(actions);
      }
      box.appendChild(row);
    });
  }

  async function loadChromeExts() {
    const res = await api.listChromeExtensions();
    const rows = (res && res.list) || [];
    renderChromeExts(rows);
    renderBrowserExts(rows);
  }

  async function importChromeExt(mode) {
    const res = await api.importChromeExtension(mode);
    if (!res || res.canceled) return;
    if (res.ok) {
      note($('chromeExtHint'), '已导入：' + res.item.name + ' v' + res.item.version, 'ok');
      await loadChromeExts();
    } else {
      note($('chromeExtHint'), res.error || '插件包导入失败', 'bad');
    }
  }

  $('importChromeZip').addEventListener('click', () => void importChromeExt('zip'));
  $('importChromeFolder').addEventListener('click', () => void importChromeExt('folder'));

  $('launchChrome').addEventListener('click', async () => {
    const btn = $('launchChrome');
    btn.disabled = true;
    note($('chromeExtHint'), '正在打开客户端浏览器并加载插件…');
    try {
      const res = await api.launchChromeBrowser();
      if (res && res.ok) {
        const errors = Array.isArray(res.errors) ? res.errors : [];
        note(
          $('chromeExtHint'),
          '客户端浏览器已打开' +
            (res.loaded ? '，已加载 ' + res.loaded + ' 个插件' : '') +
            (errors.length ? '；未能加载：' + errors.join('；') : ''),
          errors.length ? 'bad' : 'ok'
        );
      } else {
        note($('chromeExtHint'), (res && res.error) || '启动失败', 'bad');
      }
    } finally {
      btn.disabled = false;
    }
  });

  /* -------------------------------------------------------- 工作区与权限 */

  function renderWorkspaces(list) {
    const box = $('wsList');
    clear(box);
    if (!Array.isArray(list) || !list.length) {
      box.appendChild(el('span', 'muted', '还没添加额外目录。不选工作区时，Agent 在默认工作区干活。'));
      return;
    }
    list.forEach((ws) => {
      const chip = el('span', 'chip' + (ws.source === 'whitelist' ? ' manual' : ''));
      chip.title = ws.path;
      chip.appendChild(el('span', '', ws.label || ws.path));
      if (ws.source === 'whitelist') {
        const rm = el('button', 'chip-remove', '×');
        rm.type = 'button';
        rm.title = '移出白名单';
        rm.addEventListener('click', async () => {
          await api.removeWorkspace(ws.path);
          await reloadAll();
        });
        chip.appendChild(rm);
      }
      box.appendChild(chip);
    });
  }

  $('addWs').addEventListener('click', async () => {
    const res = await api.pickWorkspace();
    if (!res || res.ok === false) {
      if (res && res.canceled) return;
      window.alert((res && res.error) || '添加失败');
      return;
    }
    await reloadAll();
  });

  $('policy').addEventListener('change', async () => {
    const res = await api.savePermissionPolicy($('policy').value);
    if (res && res.ok) {
      state.policyDirty = false;
      note($('policyHint'), policyHintText(res.permissionPolicy), 'ok');
    }
  });
  $('policy').addEventListener('input', () => {
    state.policyDirty = true;
  });

  function policyHintText(policy) {
    if (policy === 'deny') return '当前只读：Agent 只能看文件，写入与命令一律拒绝。';
    if (policy === 'allow-edits') return '当前允许改当前工作区内的文件，但不执行命令。';
    return '当前允许改文件并执行命令，注意命令会产生真实后果。';
  }

  /* ---------------------------------------------------------------- 对话 */

  function fmtChatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return '今天 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return d.getMonth() + 1 + '月' + d.getDate() + '日';
  }

  function chatHint(text, kind) {
    const node = $('chatHint');
    node.textContent = text;
    node.className = 'chat-hint' + (kind ? ' ' + kind : '');
  }

  function chatTitleOf(conv) {
    return (conv && conv.title) || '新对话';
  }

  function scrollChatToEnd(force) {
    const box = $('chatThread');
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (force || nearBottom) box.scrollTop = box.scrollHeight;
  }

  function setChatBusy(busy) {
    state.chat.running = !!busy;
    $('chatSend').disabled = !!busy;
    $('chatStop').disabled = !busy;
    const pill = $('chatState');
    pill.className = 'pill ' + (busy ? 'info' : 'muted');
    clear(pill);
    pill.appendChild(el('span', 'dot'));
    pill.appendChild(document.createTextNode(busy ? '回复中' : '待命'));
  }

  function syncChatHeader() {
    const conv = state.chat.list.find((row) => row.id === state.chat.activeId);
    $('chatTitle').textContent = chatTitleOf(conv);
    $('chatTitle').title = chatTitleOf(conv);
    const custom = state.chat.workspacePath || '';
    const def = (state.agent && (state.agent.workingDir || (state.agent.workspace || ''))) || '';
    const ws = custom || def;
    $('chatMeta').textContent = ws ? '本机 Agent · 工作区 ' + ws : '本机 Agent';
    $('chatMeta').title = custom ? '本会话工作区：' + custom : def ? '默认工作区：' + def : '';
  }

  /* —— 会话能力：＋ 菜单（技能 / 插件 / 分身 / 工作区）· 模型 · 参考文件 —— */

  const CHAT_REF_MAX = 8;

  function fmtBytes(size) {
    const num = Number(size) || 0;
    if (num <= 0) return '';
    if (num < 1024) return num + ' B';
    if (num < 1024 * 1024) return Math.round(num / 1024) + ' KB';
    return (num / 1024 / 1024).toFixed(1) + ' MB';
  }

  function personaNameOf(id) {
    const hit = (state.personas || []).find((row) => row.id === id);
    return hit ? hit.name || hit.id : id;
  }

  function globalPersonaId() {
    return (state.agent && state.agent.persona && state.agent.persona.id) || '';
  }

  function skillNameOf(id) {
    const hit = (state.skills || []).find((row) => row.id === id);
    return hit ? hit.name || hit.id : id;
  }

  function pluginNameOf(id) {
    const hit = (state.plugins || []).find((row) => row.id === id);
    return hit ? hit.name || hit.id : id;
  }

  function idsSummary(ids, nameOf) {
    const names = (ids || []).map(nameOf).filter(Boolean);
    if (names.length <= 2) return names.join('、');
    return names.slice(0, 2).join('、') + ' 等 ' + names.length + ' 项';
  }

  function chatSkillText() {
    const ids = state.chat.skillIds || [];
    return ids.length ? idsSummary(ids, skillNameOf) : '全部技能';
  }

  function chatPluginText() {
    const ids = state.chat.pluginIds || [];
    return ids.length ? idsSummary(ids, pluginNameOf) : '全部启用';
  }

  function chatWorkspaceText() {
    const custom = state.chat.workspacePath || '';
    return custom ? wsLabel(custom) : '默认';
  }

  function wsKey(p) {
    return String(p || '').trim().replace(/[\\/]+$/, '').toLowerCase();
  }

  function wsLabel(p) {
    const parts = String(p || '').split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : String(p || '');
  }

  function chatWorkspaceTitle() {
    const custom = state.chat.workspacePath || '';
    if (custom) return '本会话工作区：' + custom;
    const def = (state.agent && state.agent.workingDir) || '';
    return def ? '跟随默认工作区：' + def : '跟随默认工作区';
  }

  function chatPersonaText() {
    const pid = state.chat.personaId || '';
    if (pid === 'none') return '不启用分身';
    if (pid) return personaNameOf(pid);
    const gid = globalPersonaId();
    return gid ? '跟随全局 · ' + personaNameOf(gid) : '跟随全局 · 未选分身';
  }

  function activeChannelRow() {
    return (state.channels || []).find((row) => row.id === state.activeChannelId) || null;
  }

  function chatModelRow() {
    const cid = state.chat.channelId || '';
    const pinned = cid ? (state.channels || []).find((row) => row.id === cid) : null;
    return pinned || activeChannelRow();
  }

  function chatModelText() {
    const row = chatModelRow();
    return row ? row.model || row.name || row.id : '未配置模型';
  }

  function chatModelTitle() {
    const cid = state.chat.channelId || '';
    const pinned = cid ? (state.channels || []).find((row) => row.id === cid) : null;
    const row = pinned || activeChannelRow();
    if (!row) return cid ? '本会话选择的渠道已不存在，本机也没有可用渠道' : '还没有可用的模型渠道';
    const prefix = pinned ? '本会话模型' : cid ? '本会话渠道已不存在，回退当前渠道' : '跟随当前渠道';
    return prefix + '：' + (row.name || row.id) + ' · ' + (row.model || '') + (row.baseUrl ? ' · ' + row.baseUrl : '');
  }

  function renderChatContext() {
    renderCtxChips();
    const modelBtn = $('chatModelBtn');
    $('chatModelVal').textContent = chatModelText();
    modelBtn.title = chatModelTitle();
    modelBtn.classList.toggle('on', !!state.chat.channelId);
    const refCount = (state.chat.attachments || []).length;
    $('chatRefBtn').title = refCount ? '添加参考文件（已带 ' + refCount + ' 个）' : '添加参考文件';
  }

  /** 已添加的会话上下文用 Qoder 式 chip 展示；点 chip 直接回到对应选择面板。 */
  function renderCtxChips() {
    const box = $('chatCtxChips');
    clear(box);
    const add = (key, value, view, title) => {
      const chip = el('button', 'ctx-chip');
      chip.type = 'button';
      chip.title = title || value;
      chip.appendChild(el('span', 'ctx-chip-key', key));
      chip.appendChild(el('span', 'ctx-chip-val', value));
      chip.addEventListener('click', () => openAddPop(view));
      box.appendChild(chip);
    };
    if (state.chat.workspacePath) add('工作区', chatWorkspaceText(), 'workspace', chatWorkspaceTitle());
    if ((state.chat.skillIds || []).length) add('技能', chatSkillText(), 'skills', '本会话启用的技能');
    if ((state.chat.pluginIds || []).length) add('插件', chatPluginText(), 'plugins', '本会话启用的插件');
    if (state.chat.personaId) add('分身', chatPersonaText(), 'persona', '本会话的数字分身');
  }

  function renderChatAttachments() {
    const box = $('chatAttachments');
    clear(box);
    const files = state.chat.attachments || [];
    if (!files.length) {
      box.classList.add('hidden');
      renderChatContext();
      return;
    }
    box.classList.remove('hidden');
    files.forEach((file, index) => {
      const chip = el('span', 'ref-chip');
      chip.title = file.path || file.name;
      chip.appendChild(el('span', 'ref-chip-name', file.name));
      const size = el('span', 'ref-chip-size', fmtBytes(file.size));
      if (size.textContent) chip.appendChild(size);
      const remove = el('button', 'ref-chip-remove', '×');
      remove.type = 'button';
      remove.title = '不带这个文件';
      remove.addEventListener('click', () => {
        state.chat.attachments.splice(index, 1);
        renderChatAttachments();
      });
      chip.appendChild(remove);
      box.appendChild(chip);
    });
    renderChatContext();
  }

  function closeChatPops(exceptId) {
    ['chatAddPop', 'chatModelPop'].forEach((id) => {
      if (id !== exceptId) $(id).classList.add('hidden');
    });
  }

  function toggleChatPop(popId, render) {
    const node = $(popId);
    const opening = node.classList.contains('hidden');
    closeChatPops(opening ? popId : '');
    node.classList.toggle('hidden', !opening);
    if (opening) render();
  }

  /* —— Qoder 式「＋」：一级菜单 + 二级选择面板 —— */

  let addView = '';

  function openAddPop(view) {
    addView = view || '';
    const node = $('chatAddPop');
    closeChatPops('chatAddPop');
    node.classList.remove('hidden');
    node.scrollTop = 0;
    renderAddPop();
  }

  function popHeader(box, title) {
    const head = el('div', 'ctx-pop-head ctx-pop-headline');
    const back = el('button', 'ctx-pop-back', '‹');
    back.type = 'button';
    back.title = '返回';
    back.addEventListener('click', () => {
      addView = '';
      renderAddPop();
    });
    head.appendChild(back);
    head.appendChild(document.createTextNode(title));
    box.appendChild(head);
  }

  function addMenuRow(box, title, sub, view) {
    const row = el('div', 'ctx-opt');
    const main = el('div', 'ctx-opt-main');
    main.appendChild(el('div', 'ctx-opt-name', title));
    main.appendChild(el('div', 'ctx-opt-sub', sub));
    row.appendChild(main);
    row.appendChild(el('i', 'ctx-caret', '›'));
    row.addEventListener('click', () => {
      addView = view;
      $('chatAddPop').scrollTop = 0;
      renderAddPop();
    });
    box.appendChild(row);
  }

  function renderAddPop() {
    const box = $('chatAddPop');
    clear(box);
    if (addView === 'skills') return renderSkillPicker(box);
    if (addView === 'plugins') return renderPluginPicker(box);
    if (addView === 'persona') return renderPersonaPicker(box);
    if (addView === 'workspace') return renderWorkspacePicker(box);
    box.appendChild(el('div', 'ctx-pop-head', '添加会话上下文'));
    box.appendChild(el('div', 'ctx-pop-note', '只影响当前会话；不选就跟随全局设置。'));
    addMenuRow(box, '技能', chatSkillText(), 'skills');
    addMenuRow(box, '插件', chatPluginText(), 'plugins');
    addMenuRow(box, '数字分身', chatPersonaText(), 'persona');
    addMenuRow(box, '工作区', chatWorkspaceText(), 'workspace');
  }

  function toggleId(list, id, on) {
    const next = (Array.isArray(list) ? list : []).slice();
    const index = next.indexOf(id);
    if (on && index < 0) next.push(id);
    if (!on && index >= 0) next.splice(index, 1);
    return next;
  }

  function renderSkillPicker(box) {
    popHeader(box, '技能');
    box.appendChild(el('div', 'ctx-pop-note', '不勾选＝全部技能可用；只影响这个会话。'));
    const skills = state.skills || [];
    if (!skills.length) {
      box.appendChild(el('div', 'ctx-pop-empty', '还没有技能，先到「技能」页新建一条。'));
      return;
    }
    skills.forEach((skill) => {
      const label = el('label', 'ctx-opt');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = (state.chat.skillIds || []).includes(skill.id);
      input.addEventListener('change', () => {
        state.chat.skillIds = toggleId(state.chat.skillIds, skill.id, input.checked);
        void persistChatContext();
      });
      const main = el('div', 'ctx-opt-main');
      const name = el('div', 'ctx-opt-name', skill.name || skill.id);
      name.title = skill.id;
      main.appendChild(name);
      main.appendChild(el('div', 'ctx-opt-sub', skill.description || (skill.chars ? skill.chars + ' 字' : skill.id)));
      label.appendChild(input);
      label.appendChild(main);
      box.appendChild(label);
    });
  }

  function renderPluginPicker(box) {
    popHeader(box, '插件');
    box.appendChild(
      el('div', 'ctx-pop-note', '不勾选＝全部已启用插件；只影响这个会话。命令类插件仍需「允许全部」权限档。')
    );
    const list = (state.plugins || []).filter((plugin) => plugin.enabled);
    if (!list.length) {
      box.appendChild(el('div', 'ctx-pop-empty', '还没有启用的插件，先到「插件」页新建并启用。'));
      return;
    }
    list.forEach((plugin) => {
      const label = el('label', 'ctx-opt');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = (state.chat.pluginIds || []).includes(plugin.id);
      input.addEventListener('change', () => {
        state.chat.pluginIds = toggleId(state.chat.pluginIds, plugin.id, input.checked);
        void persistChatContext();
      });
      const main = el('div', 'ctx-opt-main');
      const name = el('div', 'ctx-opt-name', plugin.name || plugin.id);
      name.title = plugin.toolName || plugin.id;
      main.appendChild(name);
      main.appendChild(
        el('div', 'ctx-opt-sub', (plugin.kind === 'http' ? 'HTTP' : '命令') + ' · ' + (plugin.description || plugin.toolName || plugin.id))
      );
      label.appendChild(input);
      label.appendChild(main);
      box.appendChild(label);
    });
  }

  function renderPersonaPicker(box) {
    popHeader(box, '数字分身');
    box.appendChild(el('div', 'ctx-pop-note', '分身正文作为附加人设，进本会话每一轮。'));
    const gid = globalPersonaId();
    const options = [
      { value: '', name: '跟随全局', sub: gid ? '全局正用「' + personaNameOf(gid) + '」' : '全局也没选分身' },
      { value: 'none', name: '不启用分身', sub: '只用 BotBuddy 默认人设' }
    ];
    (state.personas || []).forEach((persona) => {
      options.push({
        value: persona.id,
        name: persona.name || persona.id,
        sub: persona.description || persona.id
      });
    });
    options.forEach((option) => {
      const row = el('div', 'ctx-opt' + (option.value === (state.chat.personaId || '') ? ' active' : ''));
      const main = el('div', 'ctx-opt-main');
      main.appendChild(el('div', 'ctx-opt-name', option.name));
      main.appendChild(el('div', 'ctx-opt-sub', option.sub));
      row.appendChild(main);
      row.addEventListener('click', () => {
        state.chat.personaId = option.value;
        closeChatPops('');
        void persistChatContext();
      });
      box.appendChild(row);
    });
  }

  function renderWorkspacePicker(box) {
    popHeader(box, '工作区');
    box.appendChild(el('div', 'ctx-pop-note', '本会话的读写与命令都限制在这个目录内；不选＝默认工作区。'));
    const def = (state.agent && state.agent.workingDir) || '';
    const current = state.chat.workspacePath || '';
    const options = [{ value: '', name: '默认工作区', sub: def || '启动时自动创建' }];
    (state.agent && state.agent.workspaces ? state.agent.workspaces : []).forEach((row) => {
      if (!row || !row.path) return;
      if (def && wsKey(row.path) === wsKey(def)) return;
      options.push({
        value: row.path,
        name: row.label || wsLabel(row.path),
        sub: row.path + (row.trust === 'trusted' ? '' : ' · 最近使用')
      });
    });
    if (current && !options.some((row) => wsKey(row.value) === wsKey(current))) {
      options.push({
        value: current,
        name: wsLabel(current),
        sub: current + ' · 不在候选目录，执行时会回落默认工作区'
      });
    }
    options.forEach((option) => {
      const row = el('div', 'ctx-opt' + (wsKey(option.value) === wsKey(current) ? ' active' : ''));
      const main = el('div', 'ctx-opt-main');
      const name = el('div', 'ctx-opt-name', option.name);
      name.title = option.value || option.sub;
      main.appendChild(name);
      main.appendChild(el('div', 'ctx-opt-sub', option.sub));
      row.appendChild(main);
      row.addEventListener('click', () => applyChatWorkspace(option.value));
      box.appendChild(row);
    });
    const pick = el('div', 'ctx-opt action');
    const main = el('div', 'ctx-opt-main');
    main.appendChild(el('div', 'ctx-opt-name', '选择文件夹…'));
    main.appendChild(el('div', 'ctx-opt-sub', '从本机选一个目录，选完会加入工作区候选'));
    pick.appendChild(main);
    pick.addEventListener('click', () => void pickChatWorkspace());
    box.appendChild(pick);
  }

  function applyChatWorkspace(value) {
    state.chat.workspacePath = String(value || '').trim();
    addView = '';
    closeChatPops('');
    renderChatContext();
    syncChatHeader();
    void persistChatContext();
  }

  async function pickChatWorkspace() {
    const res = await api.pickWorkspace();
    if (!res || !res.ok) {
      if (!res || !res.canceled) chatHint((res && res.error) || '没能打开目录选择', 'bad');
      return;
    }
    applyChatWorkspace(res.path);
    chatHint('本会话工作区：' + res.path, 'ok');
  }

  function renderModelPop() {
    const box = $('chatModelPop');
    clear(box);
    box.appendChild(el('div', 'ctx-pop-head', '本会话的模型'));
    box.appendChild(el('div', 'ctx-pop-note', '只列本机配置的 LLM 渠道；换模型只影响这个会话。'));
    const channels = (state.channels || []).filter((row) => row && row.baseUrl && row.model);
    const active = activeChannelRow();
    const current = state.chat.channelId || '';
    const options = [
      {
        value: '',
        name: '跟随当前渠道',
        sub: active ? (active.name || active.id) + ' · ' + active.model : '还没有可用的渠道'
      }
    ];
    channels.forEach((row) => {
      options.push({ value: row.id, name: row.name || row.id, sub: row.model + (row.baseUrl ? ' · ' + row.baseUrl : '') });
    });
    options.forEach((option) => {
      const row = el('div', 'ctx-opt' + (option.value === current ? ' active' : ''));
      const main = el('div', 'ctx-opt-main');
      main.appendChild(el('div', 'ctx-opt-name', option.name));
      main.appendChild(el('div', 'ctx-opt-sub', option.sub));
      row.appendChild(main);
      row.addEventListener('click', () => {
        state.chat.channelId = option.value;
        closeChatPops('');
        renderChatContext();
        void persistChatContext();
      });
      box.appendChild(row);
    });
  }

  /** 选完就落库：会话还没建（新对话）时先留在内存，发第一条消息时随消息一起保存。 */
  async function persistChatContext() {
    renderChatContext();
    const conv = state.chat.list.find((row) => row.id === state.chat.activeId);
    if (!conv) return;
    conv.skillIds = (state.chat.skillIds || []).slice();
    conv.pluginIds = (state.chat.pluginIds || []).slice();
    conv.personaId = state.chat.personaId || '';
    conv.channelId = state.chat.channelId || '';
    conv.workspacePath = state.chat.workspacePath || '';
    await api.chatUpdate({
      conversationId: conv.id,
      skillIds: conv.skillIds,
      pluginIds: conv.pluginIds,
      personaId: conv.personaId,
      channelId: conv.channelId,
      workspacePath: conv.workspacePath
    });
  }

  function applyChatContext(conv) {
    state.chat.skillIds = conv && Array.isArray(conv.skillIds) ? conv.skillIds.slice() : [];
    state.chat.pluginIds = conv && Array.isArray(conv.pluginIds) ? conv.pluginIds.slice() : [];
    state.chat.personaId = (conv && conv.personaId) || '';
    state.chat.channelId = (conv && conv.channelId) || '';
    state.chat.workspacePath = (conv && conv.workspacePath) || '';
    state.chat.attachments = [];
    addView = '';
    renderChatAttachments();
    syncChatHeader();
  }

  async function pickChatFiles() {
    if ((state.chat.attachments || []).length >= CHAT_REF_MAX) {
      chatHint('一轮最多带 ' + CHAT_REF_MAX + ' 个参考文件', 'bad');
      return;
    }
    const res = await api.chatPickFiles();
    if (!res || !res.ok) {
      chatHint((res && res.error) || '没能打开文件选择', 'bad');
      return;
    }
    const known = new Set((state.chat.attachments || []).map((row) => row.path));
    const next = (state.chat.attachments || []).slice();
    ((res && res.files) || []).forEach((file) => {
      if (known.has(file.path) || next.length >= CHAT_REF_MAX) return;
      next.push(file);
    });
    state.chat.attachments = next;
    renderChatAttachments();
    const skipped = (res && res.skipped) || [];
    if (skipped.length) chatHint('已跳过：' + skipped.join('、'), 'bad');
    else if (next.length) chatHint('已带上 ' + next.length + ' 个参考文件', 'ok');
  }

  $('chatAddBtn').addEventListener('click', () => {
    const node = $('chatAddPop');
    if (node.classList.contains('hidden')) openAddPop('');
    else closeChatPops('');
  });
  $('chatModelBtn').addEventListener('click', () => toggleChatPop('chatModelPop', renderModelPop));
  $('chatRefBtn').addEventListener('click', () => void pickChatFiles());
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && typeof target.closest === 'function' && target.closest('.ctx-zone')) return;
    closeChatPops('');
  });

  function renderChatList() {
    const box = $('chatList');
    clear(box);
    if (!state.chat.list.length) {
      box.appendChild(el('div', 'chat-empty-list', '还没有会话。右侧发第一条消息，就会自动建一个会话。'));
      return;
    }
    state.chat.list.forEach((conv) => {
      const row = el('div', 'chat-item' + (conv.id === state.chat.activeId ? ' active' : ''));
      const main = el('div', 'chat-item-main');
      const title = el('div', 'chat-item-title', chatTitleOf(conv));
      title.title = chatTitleOf(conv);
      main.appendChild(title);
      main.appendChild(el('div', 'chat-item-sub', fmtChatTime(conv.updatedAt)));
      row.appendChild(main);

      const remove = el('button', 'chat-item-remove', '×');
      remove.type = 'button';
      remove.title = '删除会话';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        void removeChat(conv);
      });
      row.appendChild(remove);

      row.addEventListener('click', () => {
        if (conv.id !== state.chat.activeId) void selectChat(conv.id);
      });
      box.appendChild(row);
    });
  }

  function chatMessageNode(msg) {
    if (msg.role === 'tool') {
      const kind = msg.status === 'failed' ? 'bad' : msg.status === 'running' ? 'running' : 'ok';
      const row = el('div', 'chat-tool ' + kind);
      row.dataset.msgId = String(msg.id);
      row.appendChild(el('span', 'chat-tool-name', msg.toolName || msg.content || '工具'));
      row.appendChild(
        el('span', 'chat-tool-status', msg.status === 'running' ? '执行中' : msg.status === 'failed' ? '失败' : '完成')
      );
      return row;
    }
    const wrap = el('div', 'chat-msg ' + (msg.role === 'user' ? 'user' : 'assistant'));
    if (msg.role === 'assistant' && msg.status === 'error') wrap.classList.add('bad');
    if (msg.role === 'assistant' && msg.status === 'canceled') wrap.classList.add('muted-msg');
    wrap.dataset.msgId = String(msg.id);
    const bubble = el('div', 'chat-bubble');
    if (msg.role === 'user' && Array.isArray(msg.attachments) && msg.attachments.length) {
      const files = el('div', 'chat-files');
      msg.attachments.forEach((file) => {
        const chip = el('span', 'chat-file');
        chip.title = file.path || file.name;
        chip.appendChild(document.createTextNode(file.name));
        const size = el('em', '', fmtBytes(file.size) ? ' ' + fmtBytes(file.size) : '');
        if (size.textContent) chip.appendChild(size);
        files.appendChild(chip);
      });
      bubble.appendChild(files);
    }
    bubble.appendChild(el('div', 'chat-text', msg.content || ''));
    if (msg.role === 'assistant' && msg.status === 'streaming') bubble.appendChild(el('span', 'chat-caret', '▌'));
    wrap.appendChild(bubble);
    return wrap;
  }

  function renderChatThread() {
    const box = $('chatThread');
    clear(box);
    if (!state.chat.messages.length) {
      const empty = el('div', 'chat-empty');
      empty.appendChild(el('div', 'chat-empty-title', '和本机 Agent 说点什么'));
      empty.appendChild(
        el(
          'div',
          'chat-empty-sub',
          '它运行在这台电脑上：读文件、改文件、执行命令都用你在本机配置的模型渠道与工作区；权限档决定它能改到什么程度。左下角 ＋ 可以添加技能、插件、数字分身和工作区，回形针按钮可以带上本机参考文件；右下角可以只为本会话换一个模型。'
        )
      );
      box.appendChild(empty);
      return;
    }
    state.chat.messages.forEach((msg) => box.appendChild(chatMessageNode(msg)));
    scrollChatToEnd(true);
  }

  function upsertChatMessage(msg) {
    if (!msg) return;
    const index = state.chat.messages.findIndex((row) => row.id === msg.id);
    if (index >= 0) state.chat.messages[index] = msg;
    else state.chat.messages.push(msg);
  }

  async function loadChatList() {
    const res = await api.chatList();
    state.chat.list = (res && res.list) || [];
    renderChatList();
    syncChatHeader();
    return state.chat.list;
  }

  async function selectChat(id) {
    state.chat.activeId = id;
    const res = await api.chatMessages(id);
    state.chat.messages = (res && res.list) || [];
    renderChatList();
    renderChatThread();
    syncChatHeader();
    applyChatContext(state.chat.list.find((row) => row.id === id));
    closeChatPops('');
    setChatBusy(state.chat.running);
  }

  async function removeChat(conv) {
    if (!window.confirm('删除会话「' + chatTitleOf(conv) + '」？消息只在本机，删除后无法恢复。')) return;
    const res = await api.chatRemove(conv.id);
    if (!res || !res.ok) {
      window.alert('删除失败');
      return;
    }
    if (state.chat.activeId === conv.id) {
      state.chat.activeId = '';
      state.chat.messages = [];
      renderChatThread();
      syncChatHeader();
    }
    await loadChatList();
  }

  async function sendChat() {
    if (state.chat.running) return;
    const input = $('chatInput');
    const text = input.value.trim();
    if (!text) {
      chatHint('先输入要发给 Agent 的内容', 'bad');
      return;
    }
    chatHint('Enter 发送 · Shift+Enter 换行');
    const res = await api.chatSend({
      conversationId: state.chat.activeId || '',
      text,
      skillIds: (state.chat.skillIds || []).slice(),
      pluginIds: (state.chat.pluginIds || []).slice(),
      personaId: state.chat.personaId || '',
      channelId: state.chat.channelId || '',
      workspacePath: state.chat.workspacePath || '',
      attachments: (state.chat.attachments || []).slice()
    });
    if (!res || !res.ok) {
      chatHint((res && res.error) || '发送失败', 'bad');
      return;
    }
    const skipped = (res && res.skipped) || [];
    const effectiveWs = typeof res.workspace === 'string' ? res.workspace : '';
    const wsFellBack = !!(
      state.chat.workspacePath &&
      effectiveWs &&
      wsKey(effectiveWs) !== wsKey(state.chat.workspacePath)
    );
    if (wsFellBack) {
      state.chat.workspacePath = '';
      renderChatContext();
      syncChatHeader();
    }
    input.value = '';
    input.focus();
    state.chat.attachments = [];
    renderChatAttachments();
    if (skipped.length) chatHint('这些文件没带上：' + skipped.join('、'), 'bad');
    else if (wsFellBack) chatHint('所选工作区不可用，已回落到 ' + effectiveWs, 'bad');
  }

  $('newChat').addEventListener('click', () => {
    state.chat.activeId = '';
    state.chat.messages = [];
    renderChatList();
    renderChatThread();
    syncChatHeader();
    applyChatContext(null);
    closeChatPops('');
    chatHint('Enter 发送 · Shift+Enter 换行');
    $('chatInput').focus();
  });

  $('chatSend').addEventListener('click', () => void sendChat());
  $('chatInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void sendChat();
    }
  });
  $('chatStop').addEventListener('click', async () => {
    if (!state.chat.activeId) return;
    chatHint('正在停止当前这一轮…');
    await api.chatCancel(state.chat.activeId);
  });

  function applyChatEvent(ev) {
    if (!ev || !ev.type) return;
    if (ev.type === 'run-start') {
      state.chat.activeId = ev.conversationId;
      state.chat.messages.push(ev.userMessage, ev.assistant);
      setChatBusy(true);
      chatHint('Enter 发送 · Shift+Enter 换行');
      syncChatHeader();
      renderChatThread();
      const conv = state.chat.list.find((row) => row.id === ev.conversationId);
      if (conv && ev.title) conv.title = ev.title;
      renderChatList();
      return;
    }
    if (ev.conversationId !== state.chat.activeId) {
      if (ev.type === 'done') {
        setChatBusy(false);
        void loadChatList();
      }
      return;
    }
    if (ev.type === 'delta') {
      const target = state.chat.messages.find((row) => row.id === ev.messageId);
      if (target) target.content = ev.content;
      const node = document.querySelector('.chat-msg[data-msg-id="' + ev.messageId + '"] .chat-text');
      if (node) {
        node.textContent = ev.content;
        scrollChatToEnd(false);
      }
      return;
    }
    if (ev.type === 'tool') {
      upsertChatMessage(ev.message);
      renderChatThread();
      return;
    }
    if (ev.type === 'done') {
      setChatBusy(false);
      upsertChatMessage(ev.message);
      const conv = state.chat.list.find((row) => row.id === ev.conversationId);
      if (conv && ev.title) conv.title = ev.title;
      renderChatList();
      syncChatHeader();
      renderChatThread();
      void loadChatList();
    }
  }

  /* ------------------------------------------------------------ 任务/操作 */

  $('reloadActive').addEventListener('click', () => {
    const active = document.querySelector('[data-logs-tab].active');
    if (active && active.dataset.logsTab === 'log') void loadLogs();
    else void loadTaskRecords();
  });

  // 任务与日志页的两个 Tab：默认 Bot 任务记录，切到日志时补一次全量刷新。
  function showLogsTab(tab) {
    const name = tab === 'log' ? 'log' : 'records';
    document.querySelectorAll('[data-logs-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.logsTab === name);
    });
    document.querySelectorAll('[data-logs-panel]').forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.logsPanel !== name);
    });
    if (name === 'log') void loadLogs();
    else void loadTaskRecords();
  }
  document.querySelectorAll('[data-logs-tab]').forEach((btn) => {
    btn.addEventListener('click', () => showLogsTab(btn.dataset.logsTab));
  });
  showLogsTab('records');

  $('reconnect').addEventListener('click', async () => {
    await api.reconnect();
    await reloadState();
    await loadLogs();
  });

  $('quit').addEventListener('click', () => {
    if (window.confirm('退出 BotBuddy？退出后平台将无法向本机派活。')) api.quit();
  });

  /* ---------------------------------------------------------------- 数据 */

  async function reloadState() {
    const snap = await api.getState();
    applyState(snap);
    return snap;
  }

  function applyState(snap) {
    if (!snap) return;
    state.snapshot = snap;
    renderTopbar(snap);
    renderOverview(snap);
    renderLogin(snap);

    if (!state.baseUrlDirty) $('baseUrl').value = snap.baseUrl || '';
    if (!state.deviceNameDirty) $('deviceName').value = snap.deviceName || '';
    $('bindStatus').textContent = snap.paired
      ? snap.connected
        ? '已绑定 · 已连接'
        : '已绑定 · 平台不可达'
      : snap.loggedIn
        ? '账号已登录 · 未绑定'
        : '未登录';

    const agent = snap.agent || {};
    $('navSkillCount').textContent = String(agent.skillCount || 0);
    $('navPersonaCount').textContent = String(agent.personaCount || 0);
    $('pathVersion').textContent = snap.agent ? 'v' + (snap.agent.version || '1.0.0') : 'v1.0.0';
    $('pathDb').textContent = snap.dbPath || '—';
    $('pathDb').title = snap.dbPath || '';

    // 任务记录 Tab 可见时跟随状态广播刷新（完成/失败会立刻反映出来）。
    const activePane = document.querySelector('.pane.active');
    const recordsPanel = document.querySelector('[data-logs-panel="records"]');
    if (
      activePane &&
      activePane.dataset.pane === 'overview' &&
      recordsPanel &&
      !recordsPanel.classList.contains('hidden')
    ) {
      void loadTaskRecords();
    }
  }

  async function reloadAll() {
    await reloadState();
    await reloadAgent();
    await loadTaskRecords();
    const pair = await api.getPairStatus();
    if (pair) renderPair(pair);
  }

  async function reloadAgent() {
    const data = await api.getAgent();
    if (!data) return;
    state.agent = data;
    state.channels = data.channels || [];
    state.activeChannelId = (data.channel && data.channel.id) || (data.activeChannelId || '');
    renderChannels(data.channels || [], state.activeChannelId);
    renderSkills(data.skills || [], data.activeSkills || []);
    renderPersonas(data.personas || [], (data.persona && data.persona.id) || '');
    renderParams(data.config || {});
    $('memory').value = data.memory || '';
    renderWorkspaces(data.workspaces || []);
    void loadPlugins();
    void loadBridge();
    void loadChromeExts();
    if (!state.policyDirty && data.permissionPolicy) $('policy').value = data.permissionPolicy;
    note($('policyHint'), policyHintText(data.permissionPolicy));
    syncChatHeader();
    renderChatContext();
    return data;
  }

  /* ---------------------------------------------------------------- 事件 */

  api.onStateUpdate((snap) => applyState(snap));
  api.onAgentUpdate(() => void reloadAgent());
  api.onChatEvent((ev) => applyChatEvent(ev));

  api.onPairUpdate((pair) => renderPair(pair));

  let checkTimer = null;
  api.onSelfCheck((result) => {
    renderChecks(result);
    window.clearTimeout(checkTimer);
    checkTimer = window.setTimeout(() => void runSelfCheck(), 12000);
  });

  api.onLog((line) => {
    const pane = document.querySelector('.pane[data-pane="overview"]');
    const panel = document.querySelector('[data-logs-panel="log"]');
    if (!pane || !pane.classList.contains('active') || !panel || panel.classList.contains('hidden')) return;
    const cur = $('logText').textContent === '(无日志)' ? '' : $('logText').textContent;
    $('logText').textContent = line + '\n' + cur;
  });

  api.onNavigate((target) => showPane(target));
  api.onBridgeUpdate((status) => renderBridge(status));

  /* ---------------------------------------------------------------- 启动 */

  (async function init() {
    const snap = await reloadState();
    await reloadAgent();
    await loadTaskRecords();
    await loadChatList();
    const pair = await api.getPairStatus();
    if (pair) renderPair(pair);
    if (!snap || !snap.paired) {
      showPane('binding');
      if (snap && snap.loggedIn) void refreshPair();
    }
    void runSelfCheck();
  })();
})();