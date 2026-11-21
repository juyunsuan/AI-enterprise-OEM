// 浏览器代理侧边栏 Agent（方案 §四 D1：编排在插件、模型与工具在平台）。
// 由 background.js 顶部 importScripts 载入，与分发 / 获客 / 设备通道共用同一个 SW 全局作用域。
//
// 本模块只做「编排」：
//   1) 每一步读当前页面观测（闭集动作 snapshot，复用 rpa-executor.js 的页面地图）；
//   2) 把目标 + 观测 + 最近历史发到设备通道 /decide，由平台调一次本系统模型拿「下一步动作」；
//   3) 敏感动作先在侧边栏等本人点「允许本次」，再落到本机执行（与云端指令同一条执行路径）；
//   4) 全过程记成消息卡，侧边栏轮询读出渲染。
// 目标平台口令永不经过这里：只传「做什么」与页面观测，不读 Cookie、不碰登录态。
(() => {
  if (self.AIPDD_AGENT) return;

  const MAX_STEP_TIMEOUT_MS = 10 * 60_000; // 敏感动作等待人工确认的上限
  const MAX_CONSECUTIVE_FAILURES = 3;
  const MAX_MESSAGES = 200;
  const HISTORY_LINES = 6;
  const STEP_TIMEOUT_SECONDS_FALLBACK = 60;
  // 观测正文预算（方案 K3）：act 看操作面够用，crawl/extract 要看到整页列表，否则长条目会被静默截断。
  const OBSERVE_MAX_CHARS = { act: 6000, crawl: 12000, extract: 12000 };
  const PERSIST_MODES = ["none", "extract", "table"];
  const PERSIST_LABELS = { none: "只回对话", extract: "存采集台账", table: "落多维表格" };
  // 插件本地偏好（唯一键）：目前只有「执行方式」——autoRun=true 自动执行，false 确认后执行。
  const PREFS_KEY = "AIPDD_AGENT_PREFS";

  const phaseOf = {
    idle: "空闲",
    running: "执行中",
    "waiting-confirm": "等待你确认敏感动作",
    done: "已完成",
    stopped: "已停止",
    error: "出错停止",
  };

  const state = {
    running: false,
    phase: "idle",
    goal: "",
    mode: "act",
    modelKey: "",
    autoRun: false, // 执行方式：false＝确认后执行（先给方案等用户确认），true＝自动执行
    stepIndex: 0,
    maxSteps: 25,
    messages: [],
    attachments: [],
    pendingConfirm: null, // { action, stepIndex, thought }
    errorMsg: "",
    startedAt: 0,
    endedAt: 0,
    // 采集产物流向（D8）：none 只在会话里展示 / extract 落采集台账 / table 落多维表格。
    persist: "none",
    tableId: 0,
    landing: { tableName: "", fields: [], dedupBy: [] },
  };

  // 录制态：录在页面里（rpa-executor.js），这里只留「哪一页、录了几步」的账。
  const recording = { on: false, tabId: 0, count: 0, actions: [] };

  let seq = 0;
  let localSessionId = 0;
  let stopRequested = false;
  let confirmResolver = null;
  // 幂等锚：同一会话内同 code 的平台工具只执行一次（另有 code 时生效）。
  const executedCodes = new Set();

  const errMsg = (error) => String((error && error.message) || error || "未知错误");
  const clip = (value, max) => String(value == null ? "" : value).slice(0, max);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

  /** 缺口回报要带的插件版本：与心跳同一来源，平台台账据此判断是不是老版本缺能力。 */
  const manifestVersion = () => String(chrome.runtime.getManifest().version || "");

  /** 页面地址 → hostname（解析失败就回空，平台按「与站点无关」记档）。 */
  function hostOfUrl(url) {
    try {
      return new URL(String(url || "")).hostname.toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function pushMessage(message) {
    seq += 1;
    const item = { seq, createdAt: new Date().toISOString(), role: "agent", kind: "text", content: "", payload: {}, ...message };
    state.messages.push(item);
    if (state.messages.length > MAX_MESSAGES) {
      state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    }
    return item;
  }

  function setPhase(phase, errorMsgText) {
    state.phase = phase;
    if (errorMsgText !== undefined) state.errorMsg = errorMsgText;
  }

  function snapshot() {
    return {
      ok: true,
      running: state.running,
      phase: state.phase,
      phaseLabel: phaseOf[state.phase] || state.phase,
      goal: state.goal,
      mode: state.mode,
      modelKey: state.modelKey,
      autoRun: state.autoRun,
      stepIndex: state.stepIndex,
      maxSteps: state.maxSteps,
      messages: state.messages.slice(),
      attachments: state.attachments.slice(),
      pendingConfirm: state.pendingConfirm
        ? {
            stepIndex: state.pendingConfirm.stepIndex,
            action: state.pendingConfirm.action,
            plan: state.pendingConfirm.plan || "",
            thought: state.pendingConfirm.thought || "",
          }
        : null,
      errorMsg: state.errorMsg,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      persist: state.persist,
      persistLabel: PERSIST_LABELS[state.persist] || state.persist,
      tableId: state.tableId,
      // 落表口径摘要：侧边栏「存到哪里」据此显示当前表名/表头/查重锚，不整包回传字段清单。
      landing: {
        tableName: state.landing.tableName,
        fieldCount: state.landing.fields.length,
        dedupBy: state.landing.dedupBy.slice(),
      },
      recording: { on: recording.on, count: recording.count, tabId: recording.tabId },
    };
  }

  /** 采集产物流向：只认闭集档位，其余按 none（话里没要求存就不落库）。 */
  function pickPersistMode(raw) {
    const value = clip(raw, 16).trim().toLowerCase();
    return PERSIST_MODES.includes(value) ? value : "none";
  }

  /** 落表口径（表名/表头/幂等锚）：与契约 rcLandingSpecSchema 同形，插件只做长度收敛。 */
  function pickLanding(input) {
    const fields = (Array.isArray(input && input.fields) ? input.fields : [])
      .slice(0, 40)
      .map((item) => {
        const field = item && typeof item === "object" ? item : {};
        const name = clip(field.name, 40).trim();
        if (!name) return null;
        const key = clip(field.key, 40).trim();
        const type = clip(field.type, 16).trim();
        return { name, ...(key ? { key } : {}), ...(type ? { type } : {}) };
      })
      .filter(Boolean);
    const dedupBy = (Array.isArray(input && input.dedupBy) ? input.dedupBy : [])
      .map((item) => clip(item, 40).trim())
      .filter(Boolean)
      .slice(0, 5);
    return {
      tableName: clip(input && input.tableName, 60).trim(),
      fields,
      dedupBy,
    };
  }

  // 执行方式：true＝自动执行（跳过方案确认，直接动手）；false＝确认后执行（先给方案等用户点确认）。
  let prefsPromise = null;
  function loadPrefs() {
    prefsPromise = (async () => {
      try {
        const stored = await chrome.storage.local.get(PREFS_KEY);
        const prefs = stored && stored[PREFS_KEY] && typeof stored[PREFS_KEY] === "object" ? stored[PREFS_KEY] : {};
        state.autoRun = prefs.autoRun === true;
      } catch (_) {
        state.autoRun = false;
      }
    })();
    return prefsPromise;
  }
  function ensurePrefs() {
    return prefsPromise || loadPrefs();
  }
  async function setAutoRun(value) {
    state.autoRun = value === true;
    try {
      await chrome.storage.local.set({ [PREFS_KEY]: { autoRun: state.autoRun } });
    } catch (_) {
      // 存不上不影响本次会话生效，下次冷启动回落默认。
    }
    return { ok: true, status: snapshot() };
  }

  /** 采集产物流向：会话中途也能改（选表/换档位），下一决策步生效。 */
  function setPersist(input) {
    const src = input && typeof input === "object" ? input : {};
    if (src.persist !== undefined) state.persist = pickPersistMode(src.persist);
    if (src.tableId !== undefined) state.tableId = Math.max(0, Math.round(Number(src.tableId) || 0));
    const landing = pickLanding(src);
    // 合并语义：界面一次只改一个字段（选表 / 起名 / 查重列），不能用部分字段把整份落表口径覆盖掉。
    state.landing = {
      tableName: src.tableName !== undefined ? landing.tableName : state.landing.tableName,
      fields: landing.fields.length ? landing.fields : state.landing.fields,
      dedupBy: src.dedupBy !== undefined ? landing.dedupBy : state.landing.dedupBy,
    };
    return { ok: true, status: snapshot() };
  }

  /** 侧边栏 Header 引导：可用模型 + 额度 + 安全设置（同一设备令牌）。 */
  async function bootstrap() {
    try {
      const data = await self.AIPDD_RPA.agentRequest("/bootstrap", {});
      if (data && data.limits) {
        state.maxSteps = Math.max(1, Math.round(Number(data.limits.maxSteps) || 25));
      }
      return {
        ok: true,
        models: data.models || [],
        balance: Number(data.balance) || 0,
        rate: Number(data.rate) || 0,
        defaultModelKey: data.defaultModelKey || "",
        limits: data.limits || null,
        // 能力面板（方案 C2）：这台插件此刻会什么 + 版本指纹，面板据此展示并拦截不支持的动作。
        primitives: Array.isArray(data.primitives) ? data.primitives : [],
        caps: data.caps || null,
        local: self.AIPDD_RPA.caps ? self.AIPDD_RPA.caps() : null,
      };
    } catch (error) {
      return { ok: false, errorMsg: errMsg(error), models: [], balance: 0, rate: 0, limits: null, primitives: [], caps: null };
    }
  }

  async function decide(payload) {
    try {
      const data = await self.AIPDD_RPA.agentRequest("/decide", payload);
      return { ok: true, decision: data };
    } catch (error) {
      return { ok: false, errorMsg: errMsg(error) };
    }
  }

  async function currentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch (_) {
      return null;
    }
  }

  /** 读当前页面观测：先归属一个页面，再跑一条 snapshot（失败也给出 url/标题兜底）。 */
  async function observe() {
    const tabId = await self.AIPDD_RPA.agentEnsureTab(localSessionId);
    if (!tabId) return null;
    const result = await self.AIPDD_RPA.agentExec(localSessionId, {
      action: "snapshot",
      maxChars: OBSERVE_MAX_CHARS[state.mode] || OBSERVE_MAX_CHARS.act,
    });
    if (result && result.ok && result.data) return { tabId, ...result.data };
    const tab = await currentTab();
    return { tabId, url: clip(tab && tab.url, 500), title: clip(tab && tab.title, 200), elements: [], note: clip(result && result.errorMessage, 300) };
  }

  function actionLine(stepIndex, action, result) {
    const status = result && result.ok ? "DONE" : "FAILED";
    const err = result && result.errorMessage ? ` 错误=${clip(result.errorMessage, 160)}` : "";
    return `#${stepIndex + 1} 动作=${JSON.stringify(action)} 结果=${status}${resultData(result)}${err}`;
  }

  /** 回执里进历史的关键数据：open_tab 的 tabId 不回灌，模型下一步就关不掉自己开的页签。 */
  function resultData(result) {
    const data = result && result.data;
    if (!data || typeof data !== "object") return "";
    const picked = [];
    if (Number(data.tabId) > 0) picked.push(`tabId=${Number(data.tabId)}`);
    if (typeof data.count === "number") picked.push(`count=${data.count}`);
    return picked.length ? ` 数据=${picked.join(" ")}` : "";
  }

  /** 调用平台工具（RPA 账号/脚本/矩阵任务、工作流、技能等）：与站内 Agent / MCP 同一条授权闸。 */
  async function callTool(call) {
    try {
      const data = await self.AIPDD_RPA.agentRequest("/tool", {
        tool: clip(call && call.tool, 120),
        args: (call && call.args) || {},
        code: clip(call && call.code, 64),
      });
      return { ok: Boolean(data && data.ok), data: (data && data.data) || {}, errorMessage: clip(data && data.errorMessage, 300), needsGrant: Boolean(data && data.needsGrant), elapsedMs: Number((data && data.elapsedMs) || 0) };
    } catch (error) {
      return { ok: false, data: {}, errorMessage: errMsg(error), needsGrant: false, elapsedMs: 0 };
    }
  }

  function toolLine(stepIndex, call, result) {
    const status = result && result.ok ? (result.needsGrant ? "NEEDS_GRANT" : "DONE") : "FAILED";
    const err = result && result.errorMessage ? ` 错误=${clip(result.errorMessage, 160)}` : "";
    return `#${stepIndex + 1} 工具=${clip(call && call.tool, 120)} 结果=${status}${err}`;
  }

  /**
   * 侧边栏自己的台账与库（会话 / 消息 / 技能 / 录制 / 抽取）：走同一条设备通道 /tool 网关。
   * 这些是本人私有数据，按设备令牌直连内部执行器，不套 MCP 勾选闸；别的平台工具仍走授权闸。
   */
  async function library(operation, args) {
    try {
      const data = await self.AIPDD_RPA.agentRequest("/tool", {
        tool: clip(operation, 120),
        args: args || {},
      });
      return {
        ok: Boolean(data && data.ok),
        data: (data && data.data) || {},
        errorMsg: clip(data && data.errorMessage, 300),
      };
    } catch (error) {
      return { ok: false, data: {}, errorMsg: errMsg(error) };
    }
  }

  /**
   * 收割到的行直传落库（方案 D8）：行数据不经模型复述，插件按会话口径调平台工具。
   * persist=table 落多维表格（指定表或按名建表），persist=extract 落采集台账；
   * 每步一个 code，重放/回灌不会把同一批行落两次。
   */
  async function landHarvest(stepIndex, result) {
    if (state.persist === "none") return null;
    const data = (result && result.data) || {};
    const rows = (Array.isArray(data.items) ? data.items : [])
      .filter((row) => row && typeof row === "object" && Object.keys(row).length)
      .slice(0, 500);
    if (!rows.length) return null;
    const url = clip(data.url, 2000);
    const code = `land:${localSessionId}:${stepIndex}`;

    if (state.persist === "extract") {
      const note = clip(data.note, 500);
      const called = await callTool({
        tool: "RpaChrome_saveExtract",
        args: {
          body: {
            url,
            schemaNote: clip(state.goal, 2000),
            data: { total: Number(data.total) || rows.length, ...(note ? { note } : {}) },
            rows,
          },
        },
        code,
      });
      pushMessage({
        role: "system",
        kind: called.ok ? "result" : "error",
        content: called.ok
          ? `已存采集台账：${rows.length} 行（可在「采集结果」里查看）。`
          : `采集结果存台账失败：${called.errorMessage || "未知错误"}`,
      });
      return called;
    }

    if (!state.tableId && !state.landing.tableName) {
      pushMessage({
        role: "system",
        kind: "note",
        content: `收割到 ${rows.length} 行，但还没指定目标多维表格：请在「存到哪里」里选一张已有表或给出新表名。`,
      });
      return null;
    }
    const body = {
      rows,
      tableId: state.tableId,
      fields: state.landing.fields,
      dedupBy: state.landing.dedupBy,
      source: clip(`浏览器代理 · ${url}`, 120),
    };
    if (state.landing.tableName) body.tableName = state.landing.tableName;
    // 走本人台账通道（RpaChrome_*）而不是通用写工具闸：这是用户在自己浏览器里点的落表，
    // 不是 Agent 无人值守写业务数据；同一份后端原子落表实现，两种发起入口。
    const called = await callTool({ tool: "RpaChrome_landRows", args: { body }, code });
    const landed = (called && called.data) || {};
    pushMessage({
      role: "system",
      kind: called.ok ? "result" : "error",
      content: called.ok
        ? `已落多维表格「${clip(landed.tableName, 60)}」：新增 ${Number(landed.created) || 0} 行、更新 ${Number(landed.updated) || 0} 行、跳过 ${Number(landed.skipped) || 0} 行。`
        : `落表失败：${called.errorMessage || "未知错误"}`,
      payload: called.ok ? { tableId: Number(landed.tableId) || 0, tableUrl: `/data-table?table=${Number(landed.tableId) || 0}`, rows: rows.length } : {},
    });
    if (called.ok && Number(landed.tableId) > 0) state.tableId = Number(landed.tableId);
    return called;
  }

  /** 卡片里只留可读的结果摘要：太大就截断成预览，避免消息流被整页 JSON 撑爆。 */
  function clipData(data, max) {
    try {
      const json = JSON.stringify(data == null ? {} : data);
      if (json.length <= max) return data && typeof data === "object" ? data : {};
      return { truncated: true, preview: json.slice(0, max) };
    } catch (_) {
      return {};
    }
  }

  function waitConfirm(pending) {
    state.pendingConfirm = pending;
    setPhase("waiting-confirm");
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (confirmResolver === resolve) {
          confirmResolver = null;
          state.pendingConfirm = null;
          resolve(false);
        }
      }, MAX_STEP_TIMEOUT_MS);
      confirmResolver = (allow) => {
        clearTimeout(timer);
        confirmResolver = null;
        state.pendingConfirm = null;
        resolve(allow === true);
      };
    });
  }

  function resolveConfirm(allow) {
    if (!confirmResolver) return { ok: false, errorMsg: "当前没有待确认的敏感动作" };
    const resolver = confirmResolver;
    resolver(allow);
    return { ok: true, status: snapshot() };
  }

  /**
   * 连跑校验（N14=A）：按只读断言核「这一步做完是不是真到位了」。
   * 只读、不新开执行面；任一断言不成立即算偏离。
   */
  async function verifyExpect(expect) {
    if (!expect || typeof expect !== "object") return { ok: true, why: "" };
    const why = [];
    const urlIncludes = clip(expect.urlIncludes, 200);
    const wantText = clip(expect.text, 200);
    const wantSelector = clip(expect.selector, 300);
    const wantGone = clip(expect.gone, 300);
    if (urlIncludes) {
      const info = self.AIPDD_RPA.agentTabInfo ? await self.AIPDD_RPA.agentTabInfo(localSessionId) : null;
      const url = String((info && info.url) || "").toLowerCase();
      if (!url.includes(urlIncludes.toLowerCase())) why.push(`地址未包含「${urlIncludes}」`);
    }
    const countOf = async (selector) => {
      const read = await self.AIPDD_RPA.agentExec(localSessionId, { action: "read", mode: "count", selector });
      return { ok: Boolean(read && read.ok), count: Number(read && read.data && read.data.count) || 0 };
    };
    if (wantSelector) {
      const hit = await countOf(wantSelector);
      if (!hit.ok || hit.count <= 0) why.push(`未出现「${wantSelector}」`);
    }
    if (wantGone) {
      const hit = await countOf(wantGone);
      if (hit.ok && hit.count > 0) why.push(`「${wantGone}」仍然在`);
    }
    if (wantText) {
      const read = await self.AIPDD_RPA.agentExec(localSessionId, { action: "read", selector: "body" });
      const value = String((read && read.data && read.data.value) || "");
      if (!value.includes(wantText)) why.push(`正文未出现「${wantText}」`);
    }
    return why.length ? { ok: false, why: why.join("；") } : { ok: true, why: "" };
  }

  /**
   * 连跑队列（N14=A）：把一次规划的多步按顺序跑完，逐步校验 expect，偏离即回脑。
   * ctx = { history, failures }（history 是数组按引用共享，failures 由本函数回写）。
   * 返回 { count, deviated, stopped, failed }：count＝已跑掉的步数，外层按它推进步额。
   */
  async function runQueue(steps, stepBase, ctx) {
    for (let index = 0; index < steps.length; index += 1) {
      if (stopRequested) return { count: index, deviated: false, stopped: true };
      const item = steps[index] || {};
      const action = item.action;
      if (!action || String(action.action) === "finish") return { count: index, deviated: false };
      const stepNo = stepBase + index;
      if (item.thought) pushMessage({ role: "agent", kind: "thought", content: item.thought });
      if (item.needsConfirm) {
        const allow = await waitConfirm({ action, stepIndex: stepNo, thought: item.thought });
        if (!allow) {
          pushMessage({ role: "system", kind: "note", content: `已跳过第 ${stepNo + 1} 步敏感动作（未允许），计划中止。` });
          return { count: index, deviated: true };
        }
      }
      const result = await self.AIPDD_RPA.agentExec(localSessionId, action);
      const message = pushMessage({
        role: "agent",
        kind: String(action.action) === "screenshot" ? "screenshot" : "action",
        content: item.thought || "",
        payload: { action, result: result && result.data ? result.data : {}, ok: Boolean(result && result.ok), errorMessage: clip(result && result.errorMessage, 300) },
      });
      if (message.kind === "screenshot" && result && result.data && result.data.screenshot) {
        message.payload.screenshot = result.data.screenshot;
      }
      if (String(action.action) === "harvest" && result && result.ok) {
        await landHarvest(stepNo, result);
      }
      ctx.history.push(actionLine(stepNo, action, result));
      if (ctx.history.length > HISTORY_LINES) ctx.history.shift();
      ctx.failures = result && result.ok ? 0 : ctx.failures + 1;
      if (ctx.failures >= MAX_CONSECUTIVE_FAILURES) return { count: index + 1, deviated: true, failed: true };
      // 逐步校验：给了预期就核；不成立即「偏离」，立刻停下回脑（剩余计划作废，已做的动作不回滚）。
      if (item.expect) {
        const check = await verifyExpect(item.expect);
        if (!check.ok) {
          pushMessage({ role: "system", kind: "note", content: `第 ${stepNo + 1} 步的实际结果与计划不符（${clip(check.why, 200)}），已停下重新规划。` });
          ctx.history.push(`#${stepNo + 1} 预期未达成=${clip(check.why, 160)}（偏离，回大脑重规划）`);
          if (ctx.history.length > HISTORY_LINES) ctx.history.shift();
          return { count: index + 1, deviated: true };
        }
      }
    }
    return { count: steps.length, deviated: false };
  }

  async function run(goal, mode, modelKey) {
    const history = [];
    let failures = 0;
    // 自动执行＝直接开跑；确认后执行＝先让模型给方案、等用户点确认再动手。
    let confirmed = state.autoRun === true;
    for (let step = 0; step < state.maxSteps; step += 1) {
      if (stopRequested) {
        pushMessage({ role: "system", kind: "error", content: "已按你的请求停止。" });
        setPhase("stopped");
        return;
      }
      state.stepIndex = step;
      const observation = await observe();

      const decided = await decide({
        goal,
        mode,
        modelKey,
        stepIndex: step,
        confirmed,
        persist: state.persist,
        tableId: state.tableId,
        observation: observation || {},
        history: history.join("\n"),
        attachments: state.attachments,
      });
      if (!decided.ok) {
        pushMessage({ role: "system", kind: "error", content: `决策失败：${decided.errorMsg}` });
        setPhase("error", decided.errorMsg);
        return;
      }
      const decision = decided.decision || {};
      if (decision.thought) pushMessage({ role: "agent", kind: "thought", content: decision.thought });
      if (decision.gap) {
        // 缺口先落平台台账（本人私有 RpaChrome_* 通道，不套授权闸）：卡片据回执说「已回报」还是给重试入口。
        const gapBody = {
          need: clip(decision.gap.need, 200),
          why: clip(decision.gap.why, 500),
          site: clip(decision.gap.site || hostOfUrl(observation && observation.url), 200),
          attempted: (Array.isArray(decision.gap.attempted) ? decision.gap.attempted : []).slice(0, 10),
          want: clip(decision.gap.want, 300),
          version: manifestVersion(),
        };
        const gapCall = gapBody.need
          ? await callTool({ tool: "RpaChrome_reportGap", args: { body: gapBody }, code: `gap-${Date.now()}` })
          : { ok: false, errorMessage: "缺少 need" };
        pushMessage({
          role: "agent",
          kind: "gap",
          content: clip(decision.thought || "这一步需要的能力插件还不具备。", 500),
          payload: {
            ...gapBody,
            reported: gapCall.ok === true,
            reportError: gapCall.ok === true ? "" : clip(gapCall.errorMessage || "回报失败", 200),
          },
        });
      }

      // 对话轮次：Agent 直接回答（纯提问/闲聊/要规划、不需操作页面）或反问澄清。
      if (decision.reply) pushMessage({ role: "agent", kind: "reply", content: decision.reply });
      if (decision.question) {
        pushMessage({ role: "agent", kind: "question", content: decision.question });
        setPhase("done");
        return;
      }
      if (decision.reply) {
        setPhase("done");
        return;
      }

      // 「确认后执行」的第一个闸：模型给了方案就复述方案、直接给了动作/连跑队列就拿它当方案，都要等用户点确认。
      if (!confirmed) {
        const hasPlan = decision.action || decision.tool || (Array.isArray(decision.queue) && decision.queue.length >= 2);
        const plan = decision.confirm || (hasPlan ? decision.thought || "我准备按你的目标操作页面，请确认后执行。" : "");
        if (plan) {
          const allow = await waitConfirm({ plan, stepIndex: step, thought: decision.thought });
          if (!allow) {
            pushMessage({ role: "system", kind: "note", content: "已取消本次操作。" });
            setPhase("done");
            return;
          }
          confirmed = true;
          history.push(`#${step + 1} 用户已确认按上述说明执行`);
          if (history.length > HISTORY_LINES) history.shift();
          continue;
        }
      }

      // 连跑队列（N14=A）：一次规划 2–8 步按序连跑，逐步核对预期；偏离 / 连续失败 / 待确认即回脑重规划。
      const queue = Array.isArray(decision.queue) ? decision.queue : [];
      if (!decision.tool && queue.length >= 2) {
        if (decision.plan) pushMessage({ role: "agent", kind: "thought", content: `连跑计划：${clip(decision.plan, 300)}` });
        const queueCtx = { history, failures };
        const ran = await runQueue(queue, step, queueCtx);
        failures = queueCtx.failures;
        if (ran.stopped) {
          pushMessage({ role: "system", kind: "error", content: "已按你的请求停止。" });
          setPhase("stopped");
          return;
        }
        if (ran.failed) {
          pushMessage({ role: "system", kind: "error", content: `连续 ${MAX_CONSECUTIVE_FAILURES} 步执行失败，已停止。` });
          setPhase("error", "连续执行失败");
          return;
        }
        step += Math.max(0, ran.count - 1);
        continue;
      }

      // 平台工具：与页面动作二选一。走本系统网关（授权闸同一口径），未授权只回草案。
      const tool = decision.tool;
      if (tool && tool.tool) {
        const code = clip(tool.code, 64);
        if (code && executedCodes.has(code)) {
          history.push(`#${step + 1} 工具=${clip(tool.tool, 120)} 结果=SKIPPED（重复指令，未重复执行）`);
          if (history.length > HISTORY_LINES) history.shift();
          continue;
        }
        const toolResult = await callTool(tool);
        pushMessage({
          role: "agent",
          kind: "tool",
          content: decision.thought || "",
          payload: {
            tool: clip(tool.tool, 120),
            args: tool.args || {},
            ok: toolResult.ok,
            needsGrant: toolResult.needsGrant,
            errorMessage: toolResult.errorMessage,
            data: clipData(toolResult.data, 4000),
          },
        });
        if (code) executedCodes.add(code);
        history.push(toolLine(step, tool, toolResult));
        if (history.length > HISTORY_LINES) history.shift();
        failures = toolResult.ok ? 0 : failures + 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          pushMessage({ role: "system", kind: "error", content: `连续 ${MAX_CONSECUTIVE_FAILURES} 步执行失败，已停止。` });
          setPhase("error", "连续执行失败");
          return;
        }
        continue;
      }

      // 只报了缺口、没给任何后续（无 reply/question/action/tool/finishReason）：
      // 缺口卡已说明情况，这里直接收口，不再补一张与「缺能力」语义打架的「目标已达成」。
      if (
        decision.gap &&
        !decision.reply &&
        !decision.question &&
        !decision.tool &&
        !decision.action &&
        !decision.finishReason
      ) {
        setPhase("done");
        return;
      }

      if (!decision.action || String(decision.action.action) === "finish") {
        pushMessage({ role: "system", kind: "result", content: decision.finishReason || "目标已达成。" });
        setPhase("done");
        return;
      }

      const action = decision.action;
      if (decision.needsConfirm) {
        const allow = await waitConfirm({ action, stepIndex: step, thought: decision.thought });
        if (!allow) {
          pushMessage({ role: "system", kind: "note", content: `已跳过第 ${step + 1} 步敏感动作（未允许）。` });
          setPhase("running");
          history.push(`#${step + 1} 动作=${JSON.stringify(action)} 结果=DENIED（用户未允许）`);
          continue;
        }
        setPhase("running");
      }

      const result = await self.AIPDD_RPA.agentExec(localSessionId, action);
      const message = pushMessage({
        role: "agent",
        kind: String(action.action) === "screenshot" ? "screenshot" : "action",
        content: decision.thought || "",
        payload: { action, result: result && result.data ? result.data : {}, ok: Boolean(result && result.ok), errorMessage: clip(result && result.errorMessage, 300) },
      });
      if (message.kind === "screenshot" && result && result.data && result.data.screenshot) {
        message.payload.screenshot = result.data.screenshot;
      }
      if (String(action.action) === "harvest" && result && result.ok) {
        await landHarvest(step, result);
      }
      history.push(actionLine(step, action, result));
      if (history.length > HISTORY_LINES) history.shift();

      failures = result && result.ok ? 0 : failures + 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        pushMessage({ role: "system", kind: "error", content: `连续 ${MAX_CONSECUTIVE_FAILURES} 步执行失败，已停止。` });
        setPhase("error", "连续执行失败");
        return;
      }
    }
    pushMessage({ role: "system", kind: "error", content: `已达最大步数 ${state.maxSteps}，已停止。` });
    setPhase("done");
  }

  async function start(input) {
    if (state.running) return { ok: false, errorMsg: "已有一个 Agent 会话在进行中，请先停止" };
    const goal = clip(input && input.goal, 1000).trim();
    if (!goal) return { ok: false, errorMsg: "请写下要完成的目标" };
    const limits = self.AIPDD_RPA.limits ? self.AIPDD_RPA.limits() : null;
    state.running = true;
    state.phase = "running";
    state.goal = goal;
    state.mode = clip(input && input.mode, 16) || "act";
    state.modelKey = clip(input && input.modelKey, 128);
    state.stepIndex = 0;
    state.maxSteps = Math.max(1, Math.round(Number((limits && limits.maxSteps) || 25)));
    state.messages = [];
    state.attachments = [];
    state.pendingConfirm = null;
    state.errorMsg = "";
    state.startedAt = Date.now();
    state.endedAt = 0;
    state.persist = pickPersistMode(input && input.persist);
    state.tableId = Math.max(0, Math.round(Number(input && input.tableId) || 0));
    state.landing = pickLanding(input);
    seq = 0;
    stopRequested = false;
    executedCodes.clear();
    localSessionId = Math.floor(Date.now() / 1000) % 1_000_000;
    pushMessage({ role: "user", kind: "text", content: goal });
    void run(goal, state.mode, state.modelKey)
      .catch((error) => {
        pushMessage({ role: "system", kind: "error", content: `Agent 执行异常：${errMsg(error)}` });
        setPhase("error", errMsg(error));
      })
      .finally(() => {
        state.running = false;
        state.endedAt = Date.now();
      });
    return { ok: true, status: snapshot() };
  }

  function stop() {
    stopRequested = true;
    if (confirmResolver) {
      const resolver = confirmResolver;
      resolver(false);
    }
    if (state.running) pushMessage({ role: "system", kind: "note", content: "正在停止…" });
    else setPhase("stopped");
    return { ok: true, status: snapshot() };
  }

  function reset() {
    if (state.running) return { ok: false, errorMsg: "请先停止当前会话" };
    state.messages = [];
    state.attachments = [];
    state.pendingConfirm = null;
    state.errorMsg = "";
    setPhase("idle");
    return { ok: true, status: snapshot() };
  }

  /** 附件：存进本账号数字资产，记一条卡片；失败如实回报。 */
  async function attach(input) {    const name = clip(input && input.name, 200) || "附件";
    const data = String((input && input.data) || "");
    if (!data) return { ok: false, errorMsg: "附件内容为空" };
    try {
      const uploaded = await self.AIPDD_RPA.agentRequest("/upload", { name, data });
      const item = { name: uploaded.name || name, key: String(uploaded.key || "") };
      state.attachments.push(item);
      if (state.attachments.length > 10) state.attachments.shift();
      pushMessage({ role: "system", kind: "note", content: `已附上「${item.name}」（数字资产，Agent 可在结果里引用）。` });
      return { ok: true, name: item.name, key: item.key, status: snapshot() };
    } catch (error) {
      return { ok: false, errorMsg: errMsg(error) };
    }
  }

  // ---------------- 录制 → 工具 / 回放 ----------------

  /** 开始录制：在当前活动页装上录制器，之后你在页面上的点击/输入/选择都会被拍成闭集动作。 */
  async function startRecording() {
    if (state.running) return { ok: false, errorMsg: "Agent 正在运行，请先停止再录制" };
    const tabId = await self.AIPDD_RPA.agentEnsureTab(localSessionId);
    if (!tabId) return { ok: false, errorMsg: "没有可录制的页面：请先打开要录制的站点" };
    const begun = await self.AIPDD_RPA.agentTabExec(tabId, { action: "record", on: true });
    if (!begun.ok) return { ok: false, errorMsg: begun.errorMessage || "录制未能开始" };
    recording.on = true;
    recording.tabId = tabId;
    recording.count = 0;
    recording.actions = [];
    pushMessage({ role: "system", kind: "note", content: "已开始录制：在页面上正常操作即可，录完点「停止并保存」。" });
    return { ok: true, tabId, status: snapshot() };
  }

  async function stopRecording() {
    if (!recording.on) {
      return { ok: true, actions: recording.actions.slice(), count: recording.actions.length, status: snapshot() };
    }
    const tabId = recording.tabId || (await self.AIPDD_RPA.agentEnsureTab(localSessionId));
    const done = tabId
      ? await self.AIPDD_RPA.agentTabExec(tabId, { action: "record", on: false })
      : { ok: false, data: {} };
    const actions = done.ok && Array.isArray(done.data && done.data.actions)
      ? done.data.actions
      : recording.actions.slice();
    recording.on = false;
    recording.actions = actions;
    recording.count = actions.length;
    pushMessage({ role: "system", kind: "note", content: `已停止录制：共 ${actions.length} 步。` });
    return { ok: true, actions, count: actions.length, status: snapshot() };
  }

  /** 存成可复用工具（落本账号库表，跨设备一致）。 */
  async function saveRecording(input) {
    const name = clip(input && input.name, 120).trim();
    if (!name) return { ok: false, errorMsg: "请给这个工具起个名字" };
    const actions = Array.isArray(input && input.actions) ? input.actions : recording.actions;
    if (!actions.length) return { ok: false, errorMsg: "还没有录到任何动作" };
    const site = clip(input && input.site, 200);
    const saved = await library("RpaChrome_saveRecording", { body: { name, site, actions } });
    if (!saved.ok) return { ok: false, errorMsg: saved.errorMsg || "保存失败" };
    recording.on = false;
    recording.actions = [];
    recording.count = 0;
    return { ok: true, recording: saved.data.recording || {} };
  }

  /** 回放一个录制工具：逐条走与 Agent 同一条本机执行路径，如实回报每一步。 */
  async function replayRecording(input) {
    if (state.running) return { ok: false, errorMsg: "有会话在执行，请先停止再回放工具" };
    const actions = Array.isArray(input && input.actions) ? input.actions : [];
    if (!actions.length) return { ok: false, errorMsg: "这个工具没有可回放的动作" };
    const name = clip(input && input.name, 120) || "录制工具";
    const tabId = await self.AIPDD_RPA.agentEnsureTab(localSessionId);
    if (!tabId) return { ok: false, errorMsg: "没有可操作的页面：请先打开要回放的站点" };
    state.running = true;
    state.phase = "running";
    state.goal = `回放工具：${name}`;
    state.stepIndex = 0;
    state.messages = [];
    state.errorMsg = "";
    state.startedAt = Date.now();
    state.endedAt = 0;
    seq = 0;
    stopRequested = false;
    pushMessage({ role: "user", kind: "text", content: `回放「${name}」（${actions.length} 步）` });
    void (async () => {
      try {
        for (let index = 0; index < actions.length; index += 1) {
          if (stopRequested) {
            pushMessage({ role: "system", kind: "error", content: "已按你的请求停止。" });
            setPhase("stopped");
            return;
          }
          state.stepIndex = index;
          const action = actions[index] || {};
          const result = await self.AIPDD_RPA.agentTabExec(tabId, action);
          pushMessage({
            role: "agent",
            kind: "action",
            content: "",
            payload: {
              action,
              result: (result && result.data) || {},
              ok: Boolean(result && result.ok),
              errorMessage: clip(result && result.errorMessage, 300),
            },
          });
          if (!result || !result.ok) {
            setPhase("error", clip(result && result.errorMessage, 300) || "回放中断");
            return;
          }
          await sleep(400);
        }
        pushMessage({ role: "system", kind: "result", content: `工具「${name}」回放完成，共 ${actions.length} 步。` });
        setPhase("done");
      } catch (error) {
        pushMessage({ role: "system", kind: "error", content: `回放异常：${errMsg(error)}` });
        setPhase("error", errMsg(error));
      } finally {
        state.running = false;
        state.endedAt = Date.now();
      }
    })();
    return { ok: true, status: snapshot() };
  }

  function handle(message, sender, sendResponse) {
    const type = String((message && message.type) || "");
    if (!type.startsWith("AIPDD_AGENT_")) return false;
    (async () => {
      await ensurePrefs();
      // 页面里的录制器每拍到一个动作就推一条：只记当前正在录的那一页。
      if (type === "AIPDD_AGENT_RECORD_EVENT") {
        const tabId = sender && sender.tab ? sender.tab.id : 0;
        if (recording.on && (!recording.tabId || tabId === recording.tabId)) {
          recording.actions.push(message.action);
          recording.count = recording.actions.length;
        }
        sendResponse({ ok: true });
        return;
      }
      if (type === "AIPDD_AGENT_LIBRARY") {
        sendResponse(await library(message.operation, message.args));
        return;
      }
      if (type === "AIPDD_AGENT_RECORD_START") {
        sendResponse(await startRecording());
        return;
      }
      if (type === "AIPDD_AGENT_RECORD_STOP") {
        sendResponse(await stopRecording());
        return;
      }
      if (type === "AIPDD_AGENT_RECORD_SAVE") {
        sendResponse(await saveRecording(message));
        return;
      }
      if (type === "AIPDD_AGENT_REPLAY") {
        sendResponse(await replayRecording(message));
        return;
      }
      if (type === "AIPDD_AGENT_START") {
        sendResponse(await start(message));
        return;
      }
      if (type === "AIPDD_AGENT_STOP") {
        sendResponse(stop());
        return;
      }
      if (type === "AIPDD_AGENT_RESET") {
        sendResponse(reset());
        return;
      }
      if (type === "AIPDD_AGENT_STATE") {
        sendResponse(snapshot());
        return;
      }
      if (type === "AIPDD_AGENT_BOOTSTRAP") {
        sendResponse(await bootstrap());
        return;
      }
      if (type === "AIPDD_AGENT_CONFIRM") {
        sendResponse(resolveConfirm(message.allow === true));
        return;
      }
      if (type === "AIPDD_AGENT_SET_AUTORUN") {
        sendResponse(await setAutoRun(message.autoRun === true));
        return;
      }
      if (type === "AIPDD_AGENT_SET_PERSIST") {
        sendResponse(setPersist(message));
        return;
      }
      if (type === "AIPDD_AGENT_ATTACH") {
        sendResponse(await attach(message));
        return;
      }
      if (type === "AIPDD_AGENT_ENHANCE") {
        try {
          const data = await self.AIPDD_RPA.agentRequest("/enhance", { goal: message.goal, modelKey: state.modelKey });
          sendResponse({ ok: true, goal: data.goal || message.goal });
        } catch (error) {
          sendResponse({ ok: false, errorMsg: errMsg(error) });
        }
        return;
      }
      sendResponse({ ok: false, errorMsg: `未知指令 ${type}` });
    })();
    return true;
  }

  self.AIPDD_AGENT = { handle, state: snapshot };
})();
