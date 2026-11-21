// 本地 Chrome RPA 后台模块（方案 §4.2/§4.4、D1-C/D2-C/D4-A/D5-A）。
// 由 background.js 顶部 importScripts 载入，与分发/获客共用同一个 Service Worker 全局作用域。
//
// 本模块只做三件事：
//   1) 用本站账号在弹窗里登录 → 换长期设备令牌（明文只在登录响应里出现一次，存 chrome.storage.local）；
//   2) 定时心跳（chrome.alarms）→ 领取云端指令 → 在本机浏览器执行闭集动作 → 按 commandCode 回执；
//   3) 敏感动作先挂起等本人在弹窗点「允许本次」，拿不到云端指令时只等不做、绝不自由发挥。
// 目标平台的口令永不经过服务端：插件用用户自己已登录的浏览器会话执行动作，云端只下发「做什么」。
(() => {
  if (self.AIPDD_RPA) return;

  const API_PREFIX = "/api/public/rpa-chrome";
  const CONFIG_KEY = "rpaConfig";
  const TOKEN_KEY = "rpaToken";
  const ALARM_NAME = "rpa-heartbeat";
  const HEARTBEAT_SECONDS = 30;
  const RESULT_RETRY_MAX = 3;
  const PAGE_REPORT_MAX = 20;
  const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  const TAB_REPORT_MAX = 40;
  // 跨框架聚合（N7=A）：快照正文沿用契约上限，正方形/广告等极端页面最多聚合这么多框架。
  const SNAPSHOT_TEXT_MAX = 12000;
  const FRAME_MAX = 12;

  /**
   * 能力指纹（docs/Agent编排与插件能力契约方案.md §三 2 / K5）：这台插件实际带什么。
   * 名字必须是契约闭集里的原语——服务端与目录取交集后才决定派发，自报的新名字一律过滤；
   * 缺项只会让大脑拿到降级菜单，不会放大权限。
   */
  const PROTOCOL_VERSION = 2;
  const CAPABILITY_FAMILIES = ["distribution", "acquisition", "chrome"];
  const IMPLEMENTED_PRIMITIVES = [
    "open_tab",
    "close_tab",
    "navigate",
    "snapshot",
    "read",
    "act",
    "wait",
    "wait_for",
    "harvest",
    "fill_form",
    "upload_file",
    "list_tabs",
    "tab_select",
    "screenshot",
    "finish",
  ];

  const state = {
    beating: false,
    phase: "signed-out", // signed-out | online | waiting-confirm | offline | error
    message: "",
    devices: [], // 打开中的页面（上报给云端展示）
    sessionTabs: new Map(), // sessionId -> Set<tabId>（只登记本会话开的页，close_tab 只关这些）
    // 跨框架快照给每个元素编了全局序号：tabId -> [{ frameId, index }]，act/read 用 elementIndex 指回来时按它路由到归属框架。
    frameTargets: new Map(),
    confirms: [], // 待人工确认的敏感动作
    lastSeenAt: 0,
    limits: null,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const errMsg = (error) => String(error?.message || error || "未知错误");
  const clipText = (value, max) => String(value == null ? "" : value).slice(0, max);

  async function readConfig() {
    const stored = await chrome.storage.local.get([CONFIG_KEY, TOKEN_KEY]);
    const config = stored?.[CONFIG_KEY] && typeof stored[CONFIG_KEY] === "object" ? stored[CONFIG_KEY] : {};
    return {
      domain: String(config.domain || "").replace(/\/+$/, ""),
      clientId: String(config.clientId || ""),
      deviceName: String(config.deviceName || ""),
      username: String(config.username || ""),
      remember: config.remember !== false,
      token: String(stored?.[TOKEN_KEY] || ""),
    };
  }

  async function writeConfig(patch) {
    const stored = await chrome.storage.local.get(CONFIG_KEY);
    const current = stored?.[CONFIG_KEY] && typeof stored[CONFIG_KEY] === "object" ? stored[CONFIG_KEY] : {};
    await chrome.storage.local.set({ [CONFIG_KEY]: { ...current, ...patch } });
  }

  function ensureClientId(config) {
    if (config.clientId && /^[A-Za-z0-9_-]{8,64}$/.test(config.clientId)) return config.clientId;
    return `c${self.crypto.randomUUID().replace(/-/g, "")}`.slice(0, 32);
  }

  /** 本站域名归一化：与契约 normalizeLoginDomain 同口径，保留用户填写的 http/https（缺协议默认 https），剥掉路径尾斜杠。 */
  function normalizeDomain(input) {
    let raw = String(input == null ? "" : input).trim();
    if (!raw) return "";
    const scheme = /^http:\/\//i.test(raw) ? "http://" : "https://";
    raw = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    const hostPart = raw.split("/")[0];
    if (!hostPart) return "";
    return `${scheme}${raw}`;
  }

  function apiUrl(config, path) {
    return `${config.domain}${API_PREFIX}${path}`;
  }

  async function call(config, path, body, method = "POST") {
    const response = await fetch(apiUrl(config, path), {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-chrome-token": config.token,
      },
      body: method === "POST" ? JSON.stringify(body || {}) : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) {
      const error = new Error(String(payload?.message || `HTTP ${response.status}`));
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function setPhase(phase, message) {
    state.phase = phase;
    state.message = message || "";
  }

  // ---------- 登录 / 退出 ----------

  async function connect(input) {
    const domain = normalizeDomain(input?.domain);
    if (!domain) {
      return { ok: false, phase: state.phase, errorMsg: "请填写本系统的 https 域名（只填域名，不用带路径）" };
    }
    const username = String(input?.username || "").trim();
    const password = String(input?.password || "");
    if (!username || !password) {
      return { ok: false, phase: state.phase, errorMsg: "请填写本系统的账号与密码" };
    }
    // 站点访问权限需要用户手势：由侧边栏账号浮层的登录按钮申请（见 sidepanel.js），后台这里不再请求，
    // 未授权时后续注入会被浏览器拦下并如实回报，不静默失败。
    const saved = await readConfig();
    const clientId = ensureClientId(saved);
    const deviceName = String(input?.deviceName || saved.deviceName || "").trim().slice(0, 80);
    const config = { domain, clientId, deviceName, username: saved.username, remember: saved.remember !== false };
    try {
      const payload = await call(
        { ...config, token: "" },
        "/login",
        {
          domain,
          clientId,
          username,
          password,
          deviceName,
          extensionVersion: chrome.runtime.getManifest().version,
        },
      );
      await chrome.storage.local.set({
        [CONFIG_KEY]: { ...config, username: String(payload.username || username), deviceName: String(payload.deviceName || deviceName) },
        [TOKEN_KEY]: String(payload.token || ""),
      });
      state.limits = payload.limits || null;
      state.confirms = [];
      setPhase("online", "已连接，正在等待指令");
      await ensureAlarm();
      void beat();
      return { ok: true, phase: state.phase, status: await status() };
    } catch (error) {
      // 口令只用于这一次请求：失败也不留在存储里。
      setPhase("error", errMsg(error));
      return { ok: false, phase: state.phase, errorMsg: errMsg(error) };
    }
  }

  async function disconnect() {
    const config = await readConfig();
    if (config.token && config.domain) {
      await call(config, "/logout", {}).catch(() => undefined);
    }
    await chrome.storage.local.remove(TOKEN_KEY);
    state.confirms = [];
    state.sessionTabs.clear();
    clearBanners().catch(() => undefined);
    setPhase("signed-out", "已断开连接");
    return { ok: true, phase: state.phase, status: await status() };
  }

  async function ensureAlarm() {
    try {
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
    } catch (_) {
      await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 }).catch(() => undefined);
    }
  }

  // ---------- 心跳 + 指令执行 ----------

  async function listOpenPages() {
    try {
      const tabs = await chrome.tabs.query({});
      return tabs
        .filter((tab) => tab.url && /^https?:/.test(tab.url))
        .slice(0, PAGE_REPORT_MAX)
        .map((tab) => ({ tabId: tab.id, url: tab.url, title: clipText(tab.title, 120) }));
    } catch (_) {
      return [];
    }
  }

  /** FNV-1a（两轮拼 64 位十六进制）：站点矩阵指纹用，纯本地、可复算。 */
  function fnv1a(input, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
  }

  /**
   * 站点矩阵指纹：以 manifest 的内容脚本声明为准（哪些站点真的装了页面侧能力）。
   * 服务端目录另有自己的口径，插件自报值只作比对线索——声明与实现漂移就在这里露出来。
   */
  function siteMatrixHash() {
    try {
      const rows = (chrome.runtime.getManifest().content_scripts || [])
        .map((row) => `${(row.js || []).join(",")}@${(row.matches || []).sort().join(",")}`)
        .sort()
        .join("|");
      if (!rows) return "";
      return `${fnv1a(rows, 2166136261).toString(16).padStart(8, "0")}${fnv1a(
        `${rows}#${chrome.runtime.getManifest().version}`,
        0x811c9dc5,
      )
        .toString(16)
        .padStart(8, "0")}`;
    } catch (_) {
      return "";
    }
  }

  /** 心跳与侧边栏能力面板共用的指纹体。 */
  function capabilityFingerprint() {
    return {
      protocol: PROTOCOL_VERSION,
      capabilities: CAPABILITY_FAMILIES.slice(),
      primitives: IMPLEMENTED_PRIMITIVES.slice(),
      siteMatrixHash: siteMatrixHash(),
    };
  }

  async function beat() {
    if (state.beating) return;
    const config = await readConfig();
    if (!config.token || !config.domain) {
      setPhase("signed-out", "未登录");
      return;
    }
    state.beating = true;
    try {
      const payload = await call(config, "/heartbeat", {
        version: chrome.runtime.getManifest().version,
        ...capabilityFingerprint(),
        pages: await listOpenPages(),
      });
      state.lastSeenAt = Date.now();
      if (payload.limits) state.limits = payload.limits;
      // 云端停掉的会话：收横幅、清本地登记。
      for (const sessionId of payload.stoppedSessionIds || []) {
        await finishLocalSession(Number(sessionId));
      }
      const confirms = Array.isArray(payload.pendingConfirms) ? payload.pendingConfirms : [];
      state.confirms = confirms;
      // 待确认与待执行都在同一次心跳里下发：确认优先，先挂起等人工点。
      const commands = Array.isArray(payload.commands) ? payload.commands : [];
      setPhase(confirms.length ? "waiting-confirm" : "online", confirms.length ? "有敏感动作待你确认" : "");
      for (const command of commands) {
        await executeCommand(config, command);
      }
    } catch (error) {
      if (error?.status === 401) {
        // 令牌失效（改密/离职/被停用）：清令牌，要求重新登录。
        await chrome.storage.local.remove(TOKEN_KEY);
        state.confirms = [];
        clearBanners().catch(() => undefined);
        setPhase("signed-out", "登录已失效，请在插件里重新登录本系统");
      } else {
        setPhase("offline", errMsg(error));
      }
    } finally {
      state.beating = false;
    }
  }

  async function sendResult(config, commandCode, result) {
    const body = {
      commandCode,
      ok: result.ok === true,
      data: result.data || {},
      errorMessage: clipText(result.errorMessage, 500),
      elapsedMs: Math.max(0, Math.round(Number(result.elapsedMs) || 0)),
      code: clipText(result.code, 40),
    };
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await call(config, "/result", body);
      } catch (error) {
        if (error?.status === 401 || attempt >= RESULT_RETRY_MAX) return null;
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  function registerSessionTab(sessionId, tabId) {
    if (!state.sessionTabs.has(sessionId)) state.sessionTabs.set(sessionId, new Set());
    state.sessionTabs.get(sessionId).add(tabId);
  }

  function sessionOwnsTab(sessionId, tabId) {
    const set = state.sessionTabs.get(sessionId);
    return Boolean(set && set.has(tabId));
  }

  async function finishLocalSession(sessionId) {
    state.sessionTabs.delete(sessionId);
    setBannerInOpenTabs(false).catch(() => undefined);
  }

  function hostBlocked(url) {
    const list = Array.isArray(state.limits?.blockedHosts) ? state.limits.blockedHosts : [];
    if (!list.length) return false;
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch (_) {
      return true;
    }
    return list.some((item) => host === item || host.endsWith(`.${item}`));
  }

  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + chunk)));
    }
    return self.btoa(binary);
  }

  function fileNameFromUrl(url) {
    try {
      const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
      return clipText(name || "upload.bin", 200);
    } catch (_) {
      return "upload.bin";
    }
  }

  /** 元素截图：视口截图按页面回传的矩形裁剪（设备像素比换算 + 边界收敛），拿不到画布就原样回视口图。 */
  async function cropDataUrl(dataUrl, box, ratio) {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const scale = Math.max(0.1, Math.min(4, Number(ratio) || 1));
    const left = Math.max(0, Math.min(bitmap.width - 1, Math.round(box.left * scale)));
    const top = Math.max(0, Math.min(bitmap.height - 1, Math.round(box.top * scale)));
    const width = Math.max(1, Math.min(bitmap.width - left, Math.round(box.width * scale)));
    const height = Math.max(1, Math.min(bitmap.height - top, Math.round(box.height * scale)));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const out = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
    return out || dataUrl;
  }

  /** 在目标页执行一条闭集动作，返回给服务端的回执载荷。 */
  async function runAction(config, sessionId, action) {
    const started = Date.now();
    const name = String(action?.action || "");
    if (name === "finish") {
      return { ok: true, data: { finished: true, reason: clipText(action.reason, 200) }, elapsedMs: Date.now() - started };
    }
    if (name === "open_tab" || name === "navigate") {
      const url = String(action.url || "");
      if (!/^https?:/i.test(url)) {
        return { ok: false, data: {}, errorMessage: "只允许打开 http(s) 页面", code: "BAD_URL", elapsedMs: Date.now() - started };
      }
      if (hostBlocked(url)) {
        return { ok: false, data: {}, errorMessage: "该域名在拒绝接管的黑名单里", code: "BLOCKED_HOST", elapsedMs: Date.now() - started };
      }
      try {
        let tab;
        if (name === "open_tab") {
          tab = await chrome.tabs.create({ url, active: action.focus === true });
        } else {
          const tabId = Number(action.tabId) || Number(action.target?.tabId) || 0;
          if (!tabId || !sessionOwnsTab(sessionId, tabId)) {
            // 没给 tabId 时落到本会话最近开的页，避免误操作任意标签页。
            tab = await chrome.tabs.create({ url, active: false });
          } else {
            tab = await chrome.tabs.update(tabId, { url });
          }
        }
        registerSessionTab(sessionId, tab.id);
        await waitForTabComplete(tab.id);
        await injectExecutor(tab.id).catch(() => undefined);
        await runInPage(tab.id, { action: "banner", show: true }).catch(() => undefined);
        return {
          ok: true,
          data: { tabId: tab.id, url: tab.url || url, title: clipText(tab.title, 160) },
          elapsedMs: Date.now() - started,
        };
      } catch (error) {
        return { ok: false, data: {}, errorMessage: errMsg(error), code: "OPEN_FAILED", elapsedMs: Date.now() - started };
      }
    }
    if (name === "close_tab") {
      const tabId = Number(action.tabId) || Number(action.target?.tabId) || 0;
      if (!tabId || !sessionOwnsTab(sessionId, tabId)) {
        return { ok: false, data: {}, errorMessage: "只允许关闭本会话打开的页面", code: "NOT_OWNED", elapsedMs: Date.now() - started };
      }
      await chrome.tabs.remove(tabId).catch(() => undefined);
      state.sessionTabs.get(sessionId)?.delete(tabId);
      return { ok: true, data: { closed: true, tabId }, elapsedMs: Date.now() - started };
    }
    if (name === "list_tabs") {
      try {
        const owned = sessionId ? state.sessionTabs.get(sessionId) : null;
        const tabs = await chrome.tabs.query({});
        return {
          ok: true,
          data: {
            tabs: tabs
              .filter((tab) => tab.url && /^https?:/i.test(tab.url))
              .slice(0, TAB_REPORT_MAX)
              .map((tab) => ({
                tabId: tab.id,
                url: clipText(tab.url, 300),
                title: clipText(tab.title, 120),
                active: tab.active === true,
                owned: Boolean(owned && owned.has(tab.id)),
              })),
          },
          elapsedMs: Date.now() - started,
        };
      } catch (error) {
        return { ok: false, data: {}, errorMessage: errMsg(error), code: "EXEC_ERROR", elapsedMs: Date.now() - started };
      }
    }
    if (name === "tab_select") {
      const wanted = Number(action.tabId) || 0;
      const includes = clipText(action.urlIncludes, 200).toLowerCase();
      if (!wanted && !includes) {
        return { ok: false, data: {}, errorMessage: "切换工作页要给 tabId 或 urlIncludes", code: "NO_MATCH", elapsedMs: Date.now() - started };
      }
      try {
        const tabs = await chrome.tabs.query({});
        const hit = wanted
          ? tabs.find((tab) => tab.id === wanted)
          : tabs.find((tab) => String(tab.url || "").toLowerCase().includes(includes));
        if (!hit || !/^https?:/i.test(String(hit.url || ""))) {
          return { ok: false, data: {}, errorMessage: "没找到可切过去的 http(s) 页面", code: "NO_MATCH", elapsedMs: Date.now() - started };
        }
        if (hostBlocked(hit.url)) {
          return { ok: false, data: {}, errorMessage: "该域名在拒绝接管的黑名单里", code: "BLOCKED_HOST", elapsedMs: Date.now() - started };
        }
        registerSessionTab(sessionId, hit.id);
        await chrome.tabs.update(hit.id, { active: true });
        await waitForTabComplete(hit.id);
        await injectExecutor(hit.id).catch(() => undefined);
        await runInPage(hit.id, { action: "banner", show: true }).catch(() => undefined);
        return {
          ok: true,
          data: { tabId: hit.id, url: hit.url, title: clipText(hit.title, 160), adopted: true },
          elapsedMs: Date.now() - started,
        };
      } catch (error) {
        return { ok: false, data: {}, errorMessage: errMsg(error), code: "EXEC_ERROR", elapsedMs: Date.now() - started };
      }
    }
    if (name === "upload_file") {
      const fileUrl = String(action.fileUrl || "");
      if (!/^https?:/i.test(fileUrl)) {
        return { ok: false, data: {}, errorMessage: "只允许上传 http(s) 地址的文件", code: "BAD_URL", elapsedMs: Date.now() - started };
      }
      if (hostBlocked(fileUrl)) {
        return { ok: false, data: {}, errorMessage: "文件域名在拒绝接管的黑名单里", code: "BLOCKED_HOST", elapsedMs: Date.now() - started };
      }
      const tabId = Number(action.tabId) || Number(action.target?.tabId) || firstSessionTab(sessionId);
      if (!tabId) {
        return { ok: false, data: {}, errorMessage: "没有可操作的页面，请先用 open_tab 打开目标页", code: "NO_TAB", elapsedMs: Date.now() - started };
      }
      try {
        // 内容由后台取回并校验大小后随动作下发：执行器只做「注入 input[type=file]」，不自己发请求。
        const response = await fetch(fileUrl);
        if (!response.ok) {
          return { ok: false, data: {}, errorMessage: `下载文件失败：HTTP ${response.status}`, code: "UPLOAD_FAILED", elapsedMs: Date.now() - started };
        }
        const declared = Number(response.headers.get("content-length") || 0);
        if (declared > UPLOAD_MAX_BYTES) {
          return {
            ok: false,
            data: {},
            errorMessage: `文件 ${declared} 字节，超过 ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB 上限`,
            code: "TOO_LARGE",
            elapsedMs: Date.now() - started,
          };
        }
        const buffer = await response.arrayBuffer();
        if (!buffer.byteLength) {
          return { ok: false, data: {}, errorMessage: "文件内容为空", code: "UPLOAD_FAILED", elapsedMs: Date.now() - started };
        }
        if (buffer.byteLength > UPLOAD_MAX_BYTES) {
          return {
            ok: false,
            data: {},
            errorMessage: `文件 ${buffer.byteLength} 字节，超过 ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB 上限`,
            code: "TOO_LARGE",
            elapsedMs: Date.now() - started,
          };
        }
        const payload = await runInPage(tabId, {
          ...action,
          action: "upload_file",
          content: bufferToBase64(buffer),
          fileName: clipText(action.fileName || fileNameFromUrl(fileUrl), 200),
          mimeType: clipText(action.mimeType || response.headers.get("content-type") || "", 100),
        });
        return { ...payload, elapsedMs: payload.elapsedMs || Date.now() - started };
      } catch (error) {
        return { ok: false, data: {}, errorMessage: errMsg(error), code: "INJECT_FAILED", elapsedMs: Date.now() - started };
      }
    }
    if (name === "screenshot") {
      const tabId = Number(action.tabId) || Number(action.target?.tabId) || firstSessionTab(sessionId);
      if (!tabId) {
        return { ok: false, data: {}, errorMessage: "没有可截图的页面", code: "NO_TAB", elapsedMs: Date.now() - started };
      }
      const wantsElement =
        action.elementIndex != null || Boolean(action.selector) || Boolean(action.target && typeof action.target === "object");
      try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.tabs.update(tabId, { active: true });
        await sleep(200);
        let box = null;
        let ratio = 1;
        if (wantsElement) {
          const rectAction = {
            action: "rect",
            elementIndex: action.elementIndex,
            selector: action.selector,
            target: action.target,
            tabId,
          };
          const route = routeByElementIndex(tabId, action);
          const geometry = await runInPage(tabId, rectAction, route ? route.frameId : undefined);
          if (geometry && geometry.failed) {
            return {
              ok: false,
              data: {},
              errorMessage: clipText(geometry.errorMessage || "没有匹配到目标元素", 300),
              code: clipText(geometry.code, 40) || "NO_MATCH",
              elapsedMs: Date.now() - started,
            };
          }
          box = geometry && geometry.rect ? geometry.rect : null;
          ratio = Number(geometry && geometry.devicePixelRatio) || 1;
        }
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        const shot = box ? await cropDataUrl(dataUrl, box, ratio).catch(() => dataUrl) : dataUrl;
        return {
          ok: true,
          data: { screenshot: shot, tabId, cropped: Boolean(box) && shot !== dataUrl },
          elapsedMs: Date.now() - started,
        };
      } catch (error) {
        return { ok: false, data: {}, errorMessage: errMsg(error), code: "SHOT_FAILED", elapsedMs: Date.now() - started };
      }
    }
    // snapshot / read / act / wait：注入执行器后在页面上下文里跑。
    const tabId = Number(action.tabId) || Number(action.target?.tabId) || firstSessionTab(sessionId);
    if (!tabId) {
      return { ok: false, data: {}, errorMessage: "没有可操作的页面，请先用 open_tab 打开目标页", code: "NO_TAB", elapsedMs: Date.now() - started };
    }
    try {
      // 快照与收割跨框架聚合（N7=A）：正文/条目落在 iframe 里时也能读到。
      if (name === "snapshot" || name === "harvest") {
        const result = name === "snapshot" ? await aggregatedSnapshot(tabId, action) : await aggregatedHarvest(tabId, action);
        return { ...result, elapsedMs: result.elapsedMs || Date.now() - started };
      }
      const route = routeByElementIndex(tabId, action);
      const result = route ? await runInPage(tabId, route.action, route.frameId) : await runInPage(tabId, action);
      return { ...result, elapsedMs: result.elapsedMs || Date.now() - started };
    } catch (error) {
      return { ok: false, data: {}, errorMessage: errMsg(error), code: "INJECT_FAILED", elapsedMs: Date.now() - started };
    }
  }

  function firstSessionTab(sessionId) {
    const set = state.sessionTabs.get(sessionId);
    if (!set || !set.size) return 0;
    return Array.from(set).pop() || 0;
  }

  /** 注入执行器。默认只注入顶层帧；跨框架聚合时用 allFrames，返回实际注入到的框架 id。 */
  async function injectExecutor(tabId, allFrames) {
    const results = await chrome.scripting.executeScript({
      target: allFrames ? { tabId, allFrames: true } : { tabId },
      files: ["rpa-executor.js"],
    });
    const frameIds = results.map((item) => item.frameId).filter((id) => Number.isInteger(id));
    return frameIds.length ? frameIds : [0];
  }

  async function runInPage(tabId, action, frameId) {
    const message = { type: "AIPDD_RPA_EXEC", action };
    const options = Number.isInteger(frameId) ? { frameId } : undefined;
    try {
      return await chrome.tabs.sendMessage(tabId, message, options);
    } catch {
      // 执行器还没注入（新开的标签页等）：动态注入一次再重发
    }
    await chrome.scripting
      .executeScript({
        target: Number.isInteger(frameId) ? { tabId, frameIds: [frameId] } : { tabId },
        files: ["rpa-executor.js"],
      })
      .catch(() => undefined);
    return chrome.tabs.sendMessage(tabId, message, options);
  }

  /**
   * 跨框架只读动作（N7=A）：每个框架各注入一次执行器、各跑一遍，收集逐帧回执。
   * 页面里没有 iframe 时天然只回一帧，行为与单帧完全一致；取不到的帧跳过，不当失败。
   */
  async function runInFrames(tabId, action) {
    let frameIds;
    try {
      frameIds = (await injectExecutor(tabId, true)).slice(0, FRAME_MAX);
    } catch {
      frameIds = [0];
    }
    const per = [];
    for (const frameId of frameIds) {
      try {
        const result = await chrome.tabs.sendMessage(tabId, { type: "AIPDD_RPA_EXEC", action }, { frameId });
        if (result) per.push({ frameId, result });
      } catch {
        // 该帧没有执行器（about:blank / 已卸载）或跨域受限：跳过
      }
    }
    return per;
  }

  /** 快照聚合：正文按框架分段并标注来源，元素清单合并成一份全局序号，供 act/read 指回来。 */
  async function aggregatedSnapshot(tabId, action) {
    const per = await runInFrames(tabId, { ...action, action: "snapshot" });
    const ok = per.filter((item) => item.result && item.result.ok);
    if (!ok.length) {
      return (
        (per[0] && per[0].result) || {
          ok: false,
          data: {},
          errorMessage: "没有可读取的页面",
          code: "NO_TAB",
          elapsedMs: 0,
        }
      );
    }
    // 只有一帧（页面没有 iframe，或其它帧取不到）：保持单帧回执原样。
    if (ok.length === 1) return ok[0].result;
    const top = ok.find((item) => item.frameId === 0) || ok[0];
    const pageMap = [];
    const frameTargets = [];
    const frames = [];
    const texts = [];
    for (const { frameId, result } of ok) {
      const data = result.data || {};
      const elements = Array.isArray(data.pageMap) ? data.pageMap : [];
      for (let index = 0; index < elements.length; index += 1) {
        pageMap.push({ ...elements[index], i: pageMap.length, frame: frameId });
        frameTargets.push({ frameId, index });
      }
      frames.push({
        frameId,
        url: clipText(data.url || "", 300),
        title: clipText(data.title || "", 120),
        elements: elements.length,
      });
      if (data.text) texts.push(`【框架 ${frameId}】${data.text}`);
    }
    state.frameTargets.set(String(tabId), frameTargets);
    const topData = top.result.data || {};
    return {
      ok: true,
      data: {
        url: topData.url || "",
        title: topData.title || "",
        pageMap,
        text: clipText(texts.join("\n"), SNAPSHOT_TEXT_MAX),
        frames,
        frameCount: frames.length,
      },
      errorMessage: "",
      code: "",
      elapsedMs: 0,
    };
  }

  /**
   * 收割聚合：在每一帧各收一遍，取「收得最多」的那一帧。
   * 条目落在 iframe 里时顶层帧会一无所获——只看顶层会把「框架内的列表」误判成页面改版。
   */
  async function aggregatedHarvest(tabId, action) {
    const per = await runInFrames(tabId, { ...action, action: "harvest" });
    const results = per.filter((item) => item.result);
    if (!results.length) {
      return { ok: false, data: {}, errorMessage: "没有可读取的页面", code: "NO_TAB", elapsedMs: 0 };
    }
    const totalOf = (item) => Number((item.result.data && item.result.data.total) || 0) || 0;
    let best = results.find((item) => item.frameId === 0) || results[0];
    for (const item of results) if (totalOf(item) > totalOf(best)) best = item;
    const result = best.result;
    if (!result.ok || best.frameId === 0) return result;
    const data = { ...(result.data || {}) };
    data.frameId = best.frameId;
    data.note = clipText(`${data.note ? `${data.note}；` : ""}条目取自页面内框架（frame ${best.frameId}）`, 500);
    return { ...result, data };
  }

  /** act / read 用全局 elementIndex 指回来时，按聚合快照记下的归属框架路由；顶层帧与选择器类动作照旧。 */
  function routeByElementIndex(tabId, action) {
    const entries = state.frameTargets.get(String(tabId));
    if (!entries || !entries.length) return null;
    let index = null;
    if (action.elementIndex !== undefined && action.elementIndex !== null) index = Number(action.elementIndex);
    else if (action.target && typeof action.target === "object" && action.target.elementIndex !== undefined)
      index = Number(action.target.elementIndex);
    else if (typeof action.target === "number") index = Number(action.target);
    if (!Number.isInteger(index) || index < 0) return null;
    const hit = entries[index];
    if (!hit || hit.frameId === 0) return null;
    const next = { ...action, elementIndex: hit.index };
    if (next.target && typeof next.target === "object" && next.target.elementIndex !== undefined) {
      next.target = { ...next.target, elementIndex: hit.index };
    }
    return { frameId: hit.frameId, action: next };
  }

  async function setBannerInOpenTabs(show) {
    for (const set of state.sessionTabs.values()) {
      for (const tabId of set) {
        await runInPage(tabId, { action: "banner", show }).catch(() => undefined);
      }
    }
  }

  async function clearBanners() {
    await setBannerInOpenTabs(false);
  }

  async function executeCommand(config, command) {
    const sessionId = Number(command?.sessionId) || 0;
    const action = command?.action || {};
    let result;
    try {
      result = await runAction(config, sessionId, action);
    } catch (error) {
      result = { ok: false, data: {}, errorMessage: errMsg(error), code: "EXEC_ERROR", elapsedMs: 0 };
    }
    await sendResult(config, String(command?.commandCode || ""), result);
  }

  // ---------- 人工确认 / 停止 ----------

  async function confirm(commandCode, allow) {
    const config = await readConfig();
    if (!config.token) return { ok: false, errorMsg: "未登录" };
    try {
      await call(config, "/confirm", { commandCode: String(commandCode || ""), allow: allow === true });
      state.confirms = state.confirms.filter((item) => item.commandCode !== commandCode);
      setPhase(state.confirms.length ? "waiting-confirm" : "online");
      void beat();
      return { ok: true, status: await status() };
    } catch (error) {
      return { ok: false, errorMsg: errMsg(error), status: await status() };
    }
  }

  async function stop(sessionId) {
    const config = await readConfig();
    if (!config.token) return { ok: false, errorMsg: "未登录" };
    try {
      await call(config, "/stop", { sessionId: Number(sessionId) || 0 });
      if (sessionId) await finishLocalSession(Number(sessionId));
      else {
        state.sessionTabs.clear();
        await clearBanners();
      }
      setPhase("online", "已请求停止");
      return { ok: true, status: await status() };
    } catch (error) {
      return { ok: false, errorMsg: errMsg(error), status: await status() };
    }
  }

  // ---------- 状态（弹窗 / 页面桥接用）----------

  async function status() {
    const config = await readConfig();
    const manifest = chrome.runtime.getManifest();
    return {
      ok: true,
      phase: config.token ? state.phase : "signed-out",
      message: state.message,
      domain: config.domain,
      clientId: config.clientId,
      deviceName: config.deviceName,
      username: config.username,
      remember: config.remember !== false,
      hasToken: Boolean(config.token),
      confirms: state.confirms.map((item) => ({
        commandCode: item.commandCode,
        sessionId: Number(item.sessionId) || 0,
        stepIndex: Number(item.stepIndex) || 0,
        action: item.action || {},
      })),
      limits: state.limits,
      version: manifest.version,
      lastSeenAt: state.lastSeenAt,
    };
  }

  function handle(message, sender, sendResponse) {
    const type = String(message?.type || "");
    if (!type.startsWith("AIPDD_RPA_")) return false;
    (async () => {
      if (type === "AIPDD_RPA_CONNECT") {
        sendResponse(await connect(message));
        return;
      }
      if (type === "AIPDD_RPA_DISCONNECT") {
        sendResponse(await disconnect());
        return;
      }
      if (type === "AIPDD_RPA_STATUS") {
        sendResponse(await status());
        return;
      }
      if (type === "AIPDD_RPA_TICK") {
        void beat();
        sendResponse({ ok: true });
        return;
      }
      if (type === "AIPDD_RPA_CONFIRM") {
        sendResponse(await confirm(message.commandCode, message.allow));
        return;
      }
      if (type === "AIPDD_RPA_STOP") {
        sendResponse(await stop(message.sessionId));
        return;
      }
      sendResponse({ ok: false, errorMsg: `未知指令 ${type}` });
    })();
    return true;
  }

  // ---------- 生命周期 ----------

  async function bootFromStorage() {
    const config = await readConfig();
    if (config.token && config.domain) {
      await ensureAlarm();
      void beat();
    }
  }

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === ALARM_NAME) void beat();
  });
  chrome.runtime.onStartup.addListener(() => void bootFromStorage());
  chrome.runtime.onInstalled.addListener(() => void bootFromStorage());

  // ---------- 供侧边栏 Agent 复用（chrome-agent.js） ----------

  /** 用设备令牌调设备通道的任意路径（返回已解包的载荷；失败抛错）。 */
  async function agentRequest(path, body, method = "POST") {
    const config = await readConfig();
    if (!config.token || !config.domain) {
      const error = new Error("未连接本系统：请先在插件弹窗登录");
      error.status = 401;
      throw error;
    }
    return call(config, path, body, method);
  }

  /** 在会话归属的页面里执行一条闭集动作（与云端指令同一条执行路径）。 */
  async function agentExec(sessionId, action) {
    const config = await readConfig();
    if (!config.token) {
      return { ok: false, data: {}, errorMessage: "未连接本系统", code: "NO_TOKEN", elapsedMs: 0 };
    }
    return runAction(config, Number(sessionId) || 0, action || {});
  }

  /** 本会话还没有归属于它的页面时，把当前活动页登记进来（Agent 的「从当前页开始」）。 */
  async function agentEnsureTab(sessionId) {
    const owned = firstSessionTab(sessionId);
    if (owned) return owned;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && tab.url && /^https?:/.test(tab.url)) {
      registerSessionTab(sessionId, tab.id);
      await injectExecutor(tab.id).catch(() => undefined);
      return tab.id;
    }
    return 0;
  }

  /** 会话当前工作页的地址与标题（连跑队列校验 expect.urlIncludes 用）：没有归属页时回空值。 */
  async function agentTabInfo(sessionId) {
    const tabId = firstSessionTab(sessionId);
    if (!tabId) return { tabId: 0, url: "", title: "" };
    try {
      const tab = await chrome.tabs.get(tabId);
      return { tabId, url: String(tab?.url || ""), title: clipText(tab?.title, 200) };
    } catch {
      return { tabId, url: "", title: "" };
    }
  }

  /** 在指定标签页里执行一条动作（先确保执行器已注入）：录制与确定性回放用。 */
  async function agentTabExec(tabId, action) {
    const id = Number(tabId) || 0;
    if (!id) return { ok: false, data: {}, errorMessage: "没有可操作的页面", code: "NO_TAB", elapsedMs: 0 };
    const started = Date.now();
    try {
      await injectExecutor(id).catch(() => undefined);
      const result = await runInPage(id, action || {});
      return { ...result, elapsedMs: (result && result.elapsedMs) || Date.now() - started };
    } catch (error) {
      return { ok: false, data: {}, errorMessage: errMsg(error), code: "INJECT_FAILED", elapsedMs: Date.now() - started };
    }
  }

  self.AIPDD_RPA = {
    handle,
    status,
    beat,
    ensureClientId,
    agentRequest,
    agentExec,
    agentEnsureTab,
    agentTabExec,
    agentTabInfo,
    limits: () => state.limits,
    caps: capabilityFingerprint,
  };
})();
