// 本地 Chrome RPA 动作执行器（内容脚本，由后台 chrome.scripting.executeScript 动态注入到目标页）。
// 只做「闭集动作」：snapshot / read / act / wait，外加顶部横幅与停止按钮。
// 安全边界（方案 §4.4）：只接受扩展内部 chrome.runtime 消息，不监听页面 postMessage——
// 网页里的脚本无法指挥这台浏览器；不读 Cookie、不读密码框的值、不注入任意 JS（无 eval_script）。
(() => {
  if (self.__AIPDD_RPA_EXEC__) return;
  self.__AIPDD_RPA_EXEC__ = true;

  const MAX_ELEMENTS = 120;
  const BANNER_ID = "aipdd-rpa-banner";
  // 会话缓冲：snapshot 出的元素清单按 index 缓存，后续 act/read 的 elementIndex 指回同一份清单。
  let lastMap = [];

  const clip = (value, max) => String(value == null ? "" : value).slice(0, max);
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    try {
      if (typeof el.checkVisibility === "function") {
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      }
    } catch (_) {
      /* 老浏览器没有 checkVisibility：走下面的几何判断 */
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = self.getComputedStyle(el);
    if (!style || style.visibility === "hidden" || style.display === "none") return false;
    if (Number(style.opacity) === 0) return false;
    return true;
  }

  function cssPath(el) {
    const esc = (value) => (self.CSS && CSS.escape ? CSS.escape(value) : value);
    if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
      const sel = `#${esc(el.id)}`;
      try {
        if (document.querySelectorAll(sel).length === 1) return sel;
      } catch (_) {
        /* 忽略非法选择器 */
      }
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (node.id && /^[A-Za-z][\w-]*$/.test(node.id)) {
        parts.unshift(`#${esc(node.id)}`);
        break;
      }
      node = parent;
    }
    return parts.join(" > ");
  }

  function roleOf(el) {
    const explicit = clip(el.getAttribute && el.getAttribute("role"), 24);
    if (explicit) return explicit.toLowerCase();
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "submit" || type === "button") return "button";
      return "textbox";
    }
    if (el.isContentEditable) return "textbox";
    return tag;
  }

  function nameOf(el) {
    const candidates = [
      el.getAttribute && el.getAttribute("aria-label"),
      el.getAttribute && el.getAttribute("placeholder"),
      el.getAttribute && el.getAttribute("title"),
      el.getAttribute && el.getAttribute("name"),
      el.innerText,
      el.textContent,
    ];
    for (const value of candidates) {
      const text = clip(value, 120).replace(/\s+/g, " ").trim();
      if (text) return text;
    }
    return "";
  }

  const INTERACTIVE_SELECTOR = [
    "a[href]",
    "button",
    "input:not([type=hidden])",
    "select",
    "textarea",
    "[role=button]",
    "[role=link]",
    "[role=checkbox]",
    "[role=radio]",
    "[role=tab]",
    "[role=menuitem]",
    "[contenteditable='']",
    "[contenteditable=true]",
    "[onclick]",
  ].join(",");

  function collectElements() {
    const nodes = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR));
    const list = [];
    for (const el of nodes) {
      if (list.length >= MAX_ELEMENTS) break;
      if (!isVisible(el)) continue;
      const type = el.tagName.toLowerCase() === "input" ? (el.getAttribute("type") || "text") : "";
      // 密码框绝不回传 value（不读密码）。
      const value =
        type === "password" ? "" : clip(el.value != null ? el.value : el.textContent, 120);
      list.push({
        i: list.length,
        role: roleOf(el),
        name: nameOf(el),
        selector: cssPath(el),
        value,
        href: clip(el.getAttribute && el.getAttribute("href"), 300),
      });
    }
    return list;
  }

  function buildSnapshot(maxChars) {
    lastMap = collectElements();
    let text = "";
    try {
      text = clip(document.body ? document.body.innerText : "", maxChars);
    } catch (_) {
      text = "";
    }
    return {
      url: location.href,
      title: document.title,
      pageMap: lastMap,
      text,
    };
  }

  /** 目标解析：优先 elementIndex（指回最近一次 snapshot 的清单），其次 selector。 */
  function resolveTarget(target) {
    if (target == null) return null;
    if (typeof target === "number") {
      return elementByIndex(target);
    }
    if (typeof target === "string") {
      return query(target);
    }
    if (typeof target === "object") {
      if (target.elementIndex !== undefined) return elementByIndex(Number(target.elementIndex));
      if (target.selector) return query(String(target.selector));
    }
    return null;
  }

  /** 决策器习惯把目标写成扁平的 elementIndex/selector，执行器内部只认 target：这里统一收口。 */
  function targetOf(action) {
    if (action.target != null) return action.target;
    if (action.elementIndex !== undefined) return { elementIndex: Number(action.elementIndex) };
    if (action.selector) return { selector: String(action.selector) };
    return null;
  }

  function elementByIndex(index) {
    if (!Number.isInteger(index) || index < 0) return null;
    const entry = lastMap[index] || collectElements()[index];
    if (!entry) return null;
    try {
      return document.querySelector(entry.selector);
    } catch (_) {
      return null;
    }
  }

  function query(selector) {
    try {
      return document.querySelector(selector);
    } catch (_) {
      return null;
    }
  }

  function setNativeValue(el, value) {
    const proto =
      el instanceof self.HTMLTextAreaElement
        ? self.HTMLTextAreaElement.prototype
        : self.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function fireInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clickElement(el) {
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
    } catch (_) {
      /* 不可滚动时忽略 */
    }
    el.focus && el.focus();
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      try {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: self }));
      } catch (_) {
        /* 合成事件失败则退回到原生 click */
      }
    }
    el.click && el.click();
  }

  async function runAct(action) {
    const act = clip(action.act, 24);
    if (act === "scroll") {
      const dir = clip(action.value, 8).toLowerCase() === "up" ? -1 : 1;
      self.scrollBy({ top: dir * Math.round(self.innerHeight * 0.9), behavior: "instant" });
      return { matched: true, effect: dir < 0 ? "向上滚动一屏" : "向下滚动一屏" };
    }
    const el = resolveTarget(targetOf(action));
    if (act === "key") {
      // 不给元素时作用于当前焦点，这是「输入完按回车搜索」的常用形态。
      const target = el || document.activeElement || document.body;
      const key = clip(action.key || action.value, 24) || "Enter";
      for (const type of ["keydown", "keypress", "keyup"]) {
        target.dispatchEvent(
          new KeyboardEvent(type, { key, bubbles: true, cancelable: true }),
        );
      }
      return { matched: true, effect: `已按键 ${key}` };
    }
    if (!el) return { matched: false, effect: "没有匹配到目标元素" };
    if (act === "click") {
      clickElement(el);
      return { matched: true, effect: `已点击「${clip(nameOf(el), 60)}」` };
    }
    if (act === "type") {
      el.focus && el.focus();
      const value = clip(action.value, 2000);
      if (action.clearFirst !== false) setNativeValue(el, "");
      if (el.isContentEditable) {
        el.textContent = action.clearFirst === false ? `${el.textContent}${value}` : value;
      } else {
        setNativeValue(el, action.clearFirst === false ? `${el.value || ""}${value}` : value);
      }
      fireInput(el);
      return { matched: true, effect: `已在「${clip(nameOf(el), 60)}」输入 ${value.length} 字` };
    }
    if (act === "select") {
      const value = clip(action.value, 200);
      setNativeValue(el, value);
      fireInput(el);
      return { matched: true, effect: `已选择「${value}」` };
    }
    if (act === "check") {
      const next = action.value === false ? false : true;
      el.checked = next;
      fireInput(el);
      return { matched: true, effect: next ? "已勾选" : "已取消勾选" };
    }
    if (act === "submit") {
      const form = el.form || (el.tagName === "FORM" ? el : el.closest && el.closest("form"));
      if (form && typeof form.requestSubmit === "function") {
        form.requestSubmit();
        return { matched: true, effect: "已提交表单" };
      }
      clickElement(el);
      return { matched: true, effect: "已触发提交" };
    }
    return { matched: false, effect: `不支持的动作 act=${act}` };
  }

  function runRead(action) {
    const mode = clip(action.mode, 24) || "text";
    const wanted = targetOf(action);
    const target = resolveTarget(wanted);
    if (mode === "count") {
      const base = wanted && wanted.selector ? String(wanted.selector) : "";
      if (!base) return { value: "", count: 0 };
      try {
        return { value: "", count: document.querySelectorAll(base).length };
      } catch (_) {
        return { value: "", count: 0 };
      }
    }
    if (mode === "all") {
      // 整组文本数组：给 selector 就按组读，只有 elementIndex 时退化成单元素（如实回一条）。
      const base = wanted && wanted.selector ? String(wanted.selector) : "";
      if (!base) {
        if (!target) return { values: [], count: 0, errorMessage: "mode=all 需要 selector" };
        return { values: [clip(target.innerText != null ? target.innerText : target.textContent, 2000)], count: 1 };
      }
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(base));
      } catch (_) {
        nodes = [];
      }
      const values = nodes
        .map((node) => clip(node.innerText != null ? node.innerText : node.textContent, 2000).replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return { values, count: nodes.length };
    }
    if (!target) return { value: "" };
    if (mode === "attribute") {
      const attr = clip(action.value || action.attribute, 40) || "href";
      return { value: clip(target.getAttribute(attr), 2000) };
    }
    return { value: clip(target.innerText != null ? target.innerText : target.textContent, 2000) };
  }

  async function runWait(action) {
    const wanted = targetOf(action);
    if (wanted) {
      const timeoutMs = Math.min(30000, Math.max(0, Number(action.timeoutMs) || 10000));
      const start = Date.now();
      for (;;) {
        if (resolveTarget(wanted)) {
          return { ok: true, elapsedMs: Date.now() - start };
        }
        if (Date.now() - start >= timeoutMs) {
          return { ok: false, elapsedMs: Date.now() - start, errorMessage: "等待目标出现超时" };
        }
        await sleep(250);
      }
    }
    const ms = Math.min(30000, Math.max(0, Number(action.ms) || 1000));
    await sleep(ms);
    return { ok: true, elapsedMs: ms };
  }

  // ---------- 限额与取值口径（与 packages/contracts/src/chrome-rpa.ts 同源，verify-extension-caps.mjs 比对） ----------

  const SNAPSHOT_TEXT_MAX = 12000;
  const HARVEST_LIMIT_MAX = 200;
  const HARVEST_FIELDS_MAX = 24;
  const DISCOVER_TOP_MAX = 8;
  const FIELD_VALUE_MAX = 300;
  const FILL_FIELDS_MAX = 40;
  const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  const WAIT_MAX_MS = 30000;
  /** 标签邻接取值的落点（与契约 RC_FIELD_TAKES 同源）。 */
  const FIELD_TAKES = ["self", "next", "parent", "before", "after", "line"];
  /** 结构探测单次扫描的节点上限：再大就只扫前面这些，避免陌生页把执行器拖死。 */
  const DISCOVER_SCAN_MAX = 8000;

  /** 内置值形态：class 混淆的 SPA 靠值形态而不是类名定位字段。 */
  const VALUE_PATTERNS = {
    phone: /\b0\d{2,3}-\d{7,8}\b/,
    mobile: /\b1[3-9]\d{9}\b/,
    email: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
    url: /https?:\/\/[^\s"'<>（）]+/,
    date: /\b\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?/,
    money: /(?:[¥$€]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:元|万|亿))/,
    idno: /\b\d{17}[\dXx]\b/,
    postcode: /\b\d{6}\b/,
  };
  /** 口令类键名一律拒收（契约 rcSensitiveFieldKey 同口径）。 */
  const SENSITIVE_KEY_WORDS = [
    "password",
    "passwd",
    "pwd",
    "token",
    "secret",
    "cookie",
    "credential",
    "验证码",
  ];

  const clampInt = (value, min, max, fallback) => {
    const num = Math.round(Number(value));
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
  };
  const isSensitiveKey = (key) => {
    const value = String(key || "").toLowerCase();
    return SENSITIVE_KEY_WORDS.some((word) => value.includes(word));
  };

  /** 元素取值：属性优先，输入框取 value（口令框永远空），其余取可见文本。 */
  function nodeValue(el, attribute) {
    if (!el) return "";
    if (attribute) return clip(el.getAttribute(attribute), FIELD_VALUE_MAX);
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea") {
      if ((el.getAttribute("type") || "").toLowerCase() === "password") return "";
      return clip(el.value, FIELD_VALUE_MAX).replace(/\s+/g, " ").trim();
    }
    const text = el.innerText != null ? el.innerText : el.textContent;
    return clip(String(text || "").replace(/\s+/g, " ").trim(), FIELD_VALUE_MAX);
  }

  /** 只属于这个节点的文本：有子元素时不拿整段，否则容器会把整块吞成一个标签。 */
  function ownText(el) {
    let direct = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) direct += node.nodeValue || "";
    }
    direct = direct.replace(/\s+/g, " ").trim();
    if (direct) return direct;
    return el.children.length ? "" : clip(el.innerText || el.textContent, 200).replace(/\s+/g, " ").trim();
  }

  function findLabelNode(root, label) {
    const wanted = String(label || "").trim();
    if (!wanted) return null;
    const nodes = Array.from((root || document.body).querySelectorAll("*")).slice(0, 800);
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const own = ownText(el);
      if (own && own.includes(wanted)) return el;
    }
    return null;
  }

  /** 标签邻接取值的落点：self/next/parent/before/after/line，命中不到就回空串（缺值如实留空）。 */
  function takeFromLabel(labelEl, take, label) {
    if (!labelEl) return "";
    const wanted = String(label || "").trim();
    const strip = (text) =>
      clip(
        String(text || "")
          .replace(wanted, "")
          .replace(/^[：:.\s]+/, "")
          .trim(),
        FIELD_VALUE_MAX,
      );
    const sibling = (dir) => {
      const node = dir === "next" ? labelEl.nextElementSibling : labelEl.previousElementSibling;
      return node ? nodeValue(node, "") : "";
    };
    const mode = FIELD_TAKES.includes(take) ? take : "next";
    if (mode === "self") return strip(ownText(labelEl) || nodeValue(labelEl, ""));
    if (mode === "next") return sibling("next") || strip(nodeValue(labelEl, ""));
    if (mode === "before") return sibling("before") || strip(nodeValue(labelEl, ""));
    const parentText = labelEl.parentElement ? nodeValue(labelEl.parentElement, "") : "";
    if (mode === "parent") return strip(parentText);
    if (mode === "after") {
      const after = wanted ? parentText.slice(parentText.indexOf(wanted) + wanted.length) : parentText;
      return clip(String(after || "").replace(/^[：:.\s]+/, "").trim(), FIELD_VALUE_MAX);
    }
    const line = labelEl.closest && labelEl.closest("li,tr,dd,dt,p,div,section,article");
    return clip(
      String((line ? line.innerText || line.textContent : parentText) || "").replace(/\s+/g, " ").trim(),
      FIELD_VALUE_MAX,
    );
  }

  /** 单字段取值：选择器候选 → 标签邻接 → 内置值形态，叠用命中即取。 */
  function harvestFieldValue(field, itemEl) {
    const attribute = clip(field.attribute, 40);
    for (const raw of Array.isArray(field.candidates) ? field.candidates.slice(0, 8) : []) {
      const selector = clip(raw, 300);
      if (!selector) continue;
      let hit = null;
      try {
        hit = itemEl.querySelector(selector);
      } catch (_) {
        hit = null;
      }
      if (!hit || !isVisible(hit)) continue;
      const value = nodeValue(hit, attribute);
      if (value) return value;
    }
    const label = clip(field.afterLabel, 40);
    if (label) {
      const labelEl = findLabelNode(itemEl, label);
      if (labelEl) {
        const value = attribute
          ? clip(labelEl.getAttribute(attribute), FIELD_VALUE_MAX)
          : takeFromLabel(labelEl, field.take, label);
        if (value) return value;
      }
    }
    const pattern = VALUE_PATTERNS[String(field.pattern || "")];
    if (pattern) {
      const haystack = nodeValue(itemEl, "");
      const hit = haystack.match(pattern);
      if (hit) return clip(hit[0], FIELD_VALUE_MAX);
    }
    return "";
  }

  /** 兄弟节点的结构签名：标签 + 排序后的 class 词集 + 子节点标签序列 + 子节点数。 */
  function structureSignature(el) {
    const tag = el.tagName.toLowerCase();
    const classes = typeof el.className === "string"
      ? el.className.split(/\s+/).filter(Boolean).sort().join(".")
      : "";
    const kids = Array.from(el.children)
      .map((child) => child.tagName.toLowerCase())
      .join(">");
    return `${tag}${classes ? `.${classes}` : ""}|${kids}|${el.children.length}`;
  }

  /**
   * discover：把页面上「重复出现的元素组」列成候选（纯确定性，不经模型）。
   * 打分＝组数 × 文本量 × 特异度，取前 top 个；模型只决定选哪一组、字段是第几个子节点。
   */
  function discoverGroups(root, top, minCount) {
    const scope = root === document ? document.body : root;
    if (!scope) return [];
    const nodes = Array.from(scope.querySelectorAll("*")).slice(0, DISCOVER_SCAN_MAX);
    const buckets = new Map();
    for (const el of nodes) {
      if (!el.parentElement) continue;
      if (!isVisible(el)) continue;
      const signature = structureSignature(el);
      const key = `${parentId(el.parentElement)}\u0001${signature}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.items.push(el);
      else buckets.set(key, { parent: el.parentElement, signature, items: [el] });
    }
    const scored = [];
    for (const bucket of buckets.values()) {
      if (bucket.items.length < minCount) continue;
      const texts = bucket.items.map((item) => nodeValue(item, "")).filter(Boolean);
      const volume = texts.reduce((sum, item) => sum + item.length, 0);
      const specificity = bucket.signature.split(".").length;
      scored.push({
        count: bucket.items.length,
        item: cssPath(bucket.items[0]),
        signature: bucket.signature,
        sampleText: texts.slice(0, 6).map((item) => clip(item, 300)),
        fieldPaths: Array.from(bucket.items[0].children)
          .slice(0, 30)
          .map((child, index) => ({
            i: index,
            role: roleOf(child),
            text: clip(nodeValue(child, ""), 300),
          })),
        score: bucket.items.length * (volume / Math.max(1, texts.length)) * specificity,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, top).map(({ score, ...rest }) => rest);
  }

  let parentSeq = 0;
  const parentIds = new WeakMap();
  function parentId(el) {
    const known = parentIds.get(el);
    if (known) return known;
    parentSeq += 1;
    parentIds.set(el, parentSeq);
    return parentSeq;
  }

  function pickItemNodes(selectors, root) {
    let best = [];
    let used = "";
    for (const selector of selectors) {
      let found = [];
      try {
        found = Array.from(root.querySelectorAll(selector));
      } catch (_) {
        found = [];
      }
      const visible = found.filter(isVisible);
      if (visible.length > best.length) {
        best = visible;
        used = selector;
      }
    }
    return { nodes: best, used };
  }

  function scrollDeeper(root) {
    const target = root === document ? self : root;
    const step = Math.round((target === self ? self.innerHeight : root.clientHeight) * 0.9) || 600;
    try {
      target.scrollBy({ top: step, behavior: "instant" });
    } catch (_) {
      /* 不可滚动就只收当前可见条目 */
    }
  }

  /**
   * harvest：一条指令把「重复条目 × 字段」收成行数组（方案 §五 A/G）。
   * 全程确定性、不经模型；缺字段留空并如实进 missed，超上限带 truncated，绝不静丢。
   */
  async function runHarvest(action) {
    const mode = String(action.mode) === "discover" ? "discover" : "item";
    let root = document;
    let note = "";
    const region = clip(action.region, 300);
    if (region) {
      const found = query(region);
      if (found) root = found === document.documentElement ? document : found;
      else note = `区域「${region}」没命中，已按整页收`;
    }
    if (mode === "discover") {
      const groups = discoverGroups(
        root,
        clampInt(action.top, 1, DISCOVER_TOP_MAX, 5),
        clampInt(action.minCount, 2, 20, 3),
      );
      const tail = groups.length
        ? "把其中一组的 item 当条目选择器，按 fieldPaths 定字段再来一次 harvest"
        : "页面上没探到重复出现的元素组（非列表页、结构被打散或在框架内），改用 snapshot 正文抽取或交人工";
      return {
        url: location.href,
        total: groups.reduce((max, item) => Math.max(max, item.count), 0),
        items: [],
        missed: [],
        groups,
        truncated: false,
        note: note ? `${note}；${tail}` : tail,
      };
    }

    const recipe = action.item && typeof action.item === "object" ? action.item : {};
    const selectors = [
      clip(recipe.selector, 300),
      ...(Array.isArray(recipe.candidates) ? recipe.candidates.map((item) => clip(item, 300)) : []),
    ].filter(Boolean);
    const uniqueSelectors = [...new Set(selectors)];
    if (!uniqueSelectors.length) {
      return { failed: true, code: "NO_MATCH", errorMessage: "收割配方缺条目选择器：先 harvest mode:discover 探一组，再带 item.selector 来收" };
    }
    const fields = (Array.isArray(action.fields) ? action.fields : []).slice(0, HARVEST_FIELDS_MAX);
    if (!fields.length) {
      return { failed: true, code: "NO_MATCH", errorMessage: "收割配方缺字段（fields）：给出 key 与候选选择器／afterLabel／pattern" };
    }
    const dropped = fields
      .map((field) => clip(field && field.key, 40))
      .filter((key) => key && isSensitiveKey(key));
    const usable = fields.filter((field) => {
      const key = clip(field && field.key, 40);
      return key && !isSensitiveKey(key);
    });
    if (!usable.length) {
      return { failed: true, code: "NO_MATCH", errorMessage: "收割字段全部是口令类键名，已按安全边界拒收" };
    }

    const limit = clampInt(action.limit, 1, HARVEST_LIMIT_MAX, HARVEST_LIMIT_MAX);
    const picked = pickItemNodes(uniqueSelectors, root);
    if (!picked.nodes.length) {
      return {
        failed: true,
        code: "PLATFORM_CHANGED",
        errorMessage: `条目选择器全部落空（${uniqueSelectors.slice(0, 3).join(" / ")}）：页面可能改版、被风控或在框架内`,
      };
    }
    const items = [];
    const seen = new Set();
    const hits = new Set();
    let truncated = false;
    const collect = (nodes) => {
      for (const el of nodes) {
        if (items.length >= limit) {
          truncated = true;
          return;
        }
        const row = {};
        for (const field of usable) {
          const key = clip(field.key, 40);
          const value = harvestFieldValue(field, el);
          if (!value) continue;
          row[key] = value;
          hits.add(key);
        }
        const signature = JSON.stringify(row);
        if (seen.has(signature)) continue;
        seen.add(signature);
        items.push(row);
      }
    };
    collect(picked.nodes);

    const scrollCfg = action.scroll && typeof action.scroll === "object" ? action.scroll : {};
    const rounds = clampInt(scrollCfg.rounds, 0, 20, 0);
    const roundMs = clampInt(scrollCfg.ms, 0, 5000, 1200);
    let stale = 0;
    for (let round = 0; round < rounds && !truncated && stale < 2; round += 1) {
      const before = items.length;
      scrollDeeper(root);
      await sleep(roundMs);
      collect(pickItemNodes(uniqueSelectors, root).nodes);
      stale = items.length === before ? stale + 1 : 0;
    }

    const missed = usable
      .filter((field) => field.optional !== true && !hits.has(clip(field.key, 40)))
      .map((field) => clip(field.key, 40));
    const notes = [note];
    notes.push(`条目选择器=${picked.used}，收 ${items.length} 行`);
    if (truncated) notes.push(`已达单次上限 ${limit} 行，剩余请再跑一轮（按 dedupBy 幂等）`);
    if (rounds) notes.push(`滚动 ${rounds} 轮上限内`);
    if (dropped.length) notes.push(`口令类键名已拒收：${dropped.join("、")}`);
    if (missed.length) notes.push(`整批都没取到：${missed.join("、")}`);
    return {
      url: location.href,
      total: items.length,
      items,
      missed,
      groups: [],
      truncated,
      note: notes.filter(Boolean).join("；").slice(0, 500),
    };
  }

  /** wait_for：等文本出现／消失、等地址变化（SPA 异步渲染比死等秒数稳）。 */
  async function runWaitFor(action) {
    const modes = ["text", "text_gone", "url"];
    const mode = modes.includes(String(action.mode)) ? String(action.mode) : "text";
    const timeoutMs = clampInt(action.timeoutMs, 0, WAIT_MAX_MS, 10000);
    const wanted = clip(action.text, 200);
    const urlIncludes = clip(action.urlIncludes, 300);
    if ((mode === "text" || mode === "text_gone") && !wanted) {
      return { ok: false, mode, elapsedMs: 0, errorMessage: "等文本出现／消失要给出 text" };
    }
    if (mode === "url" && !urlIncludes) {
      return { ok: false, mode, elapsedMs: 0, errorMessage: "等地址变化要给出 urlIncludes" };
    }
    const hit = () => {
      if (mode === "url") return location.href.includes(urlIncludes);
      const body = document.body ? document.body.innerText || document.body.textContent || "" : "";
      const found = String(body).includes(wanted);
      return mode === "text_gone" ? !found : found;
    };
    const start = Date.now();
    for (;;) {
      if (hit()) return { ok: true, mode, elapsedMs: Date.now() - start };
      if (Date.now() - start >= timeoutMs) {
        const label = mode === "url" ? `地址含「${urlIncludes}」` : mode === "text_gone" ? `「${wanted}」消失` : `「${wanted}」出现`;
        return { ok: false, mode, elapsedMs: Date.now() - start, errorMessage: `等${label}超时（${timeoutMs}ms）：页面可能在登录、验证码或风控` };
      }
      await sleep(200);
    }
  }

  /** fill_form：一次填多字段并如实回报未命中项（20 步表单压到 1 步）。 */
  async function runFillForm(action) {
    const list = (Array.isArray(action.fields) ? action.fields : []).slice(0, FILL_FIELDS_MAX);
    if (!list.length) {
      return { failed: true, code: "NO_MATCH", errorMessage: "fill_form 需要 fields：[{elementIndex 或 selector, value}]" };
    }
    const filled = [];
    const missed = [];
    let lastElement = null;
    for (let index = 0; index < list.length; index += 1) {
      const field = list[index] || {};
      const label = clip(field.name || field.label || field.key, 60);
      const target =
        field.elementIndex !== undefined
          ? { elementIndex: Number(field.elementIndex) }
          : field.selector
            ? { selector: String(field.selector) }
            : null;
      const el = target ? resolveTarget(target) : null;
      if (!el) {
        missed.push(label || `第 ${index + 1} 项`);
        continue;
      }
      lastElement = el;
      const value = clip(field.value, 2000);
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      const inputType = (el.getAttribute && el.getAttribute("type") || "").toLowerCase();
      let sub;
      if (tag === "select") sub = { act: "select", value };
      else if (inputType === "checkbox" || inputType === "radio") sub = { act: "check", value: value !== "false" && value !== "" };
      else sub = { act: "type", value, clearFirst: field.clearFirst !== false };
      const done = await runAct({ ...sub, target });
      if (done.matched === false) missed.push(label || `第 ${index + 1} 项`);
      else filled.push({ name: label || clip(nameOf(el), 60), effect: done.effect });
    }
    let submitted = false;
    if (action.submit === true) {
      const form = lastElement && (lastElement.form || (lastElement.closest && lastElement.closest("form")));
      if (form && typeof form.requestSubmit === "function") {
        form.requestSubmit();
        submitted = true;
      } else if (lastElement) {
        clickElement(lastElement);
        submitted = true;
      }
    }
    const parts = [`填了 ${filled.length} 项`];
    if (missed.length) parts.push(`未命中：${missed.join("、")}`);
    if (submitted) parts.push("已提交表单");
    return { filled, missed, submitted, note: parts.join("；").slice(0, 500) };
  }

  function decodeBase64(value) {
    const clean = String(value || "").replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
    const binary = self.atob ? self.atob(clean) : "";
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  /** upload_file：把文件注入 input[type=file]（内容由后台取回并校验过大小与来源）。 */
  function runUploadFile(action) {
    const el = resolveTarget(targetOf(action));
    if (!el) {
      return { failed: true, code: "NO_MATCH", errorMessage: "没有匹配到上传控件，先 snapshot 找 input[type=file] 的 elementIndex" };
    }
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag !== "input" || (el.getAttribute("type") || "").toLowerCase() !== "file") {
      return { failed: true, code: "NO_MATCH", errorMessage: "目标不是 input[type=file]，无法注入文件" };
    }
    const bytes = decodeBase64(action.content);
    if (!bytes.byteLength) {
      return { failed: true, code: "EXEC_ERROR", errorMessage: "文件内容为空" };
    }
    if (bytes.byteLength > UPLOAD_MAX_BYTES) {
      return { failed: true, code: "TOO_LARGE", errorMessage: `文件 ${bytes.byteLength} 字节，超过 ${Math.round(UPLOAD_MAX_BYTES / 1024 / 1024)}MB 上限` };
    }
    const name = clip(action.fileName, 200) || "upload.bin";
    const file = new File([bytes], name, {
      type: clip(action.mimeType, 100) || "application/octet-stream",
    });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    el.files = transfer.files;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { uploaded: true, name, size: bytes.byteLength };
  }

  /** 元素几何：元素截图由后台截图后按这里回的矩形裁剪（先滚到可见再量）。 */
  async function runRect(action) {
    const el = resolveTarget(targetOf(action));
    if (!el) return { failed: true, code: "NO_MATCH", errorMessage: "没有匹配到目标元素" };
    try {
      el.scrollIntoView({ block: "center", inline: "center" });
    } catch (_) {
      /* 不可滚动时按当前位置量 */
    }
    await sleep(120);
    const rect = el.getBoundingClientRect();
    return {
      rect: {
        left: Math.max(0, Math.round(rect.left)),
        top: Math.max(0, Math.round(rect.top)),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      },
      devicePixelRatio: self.devicePixelRatio || 1,
      viewport: { width: self.innerWidth, height: self.innerHeight },
      url: location.href,
    };
  }

  // ---------- 顶部横幅（AI 正在控制此页面 · 停止）----------

  function showBanner() {
    if (document.getElementById(BANNER_ID)) return;
    const bar = document.createElement("div");
    bar.id = BANNER_ID;
    bar.setAttribute(
      "style",
      [
        "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
        "display:flex", "align-items:center", "gap:12px", "justify-content:center",
        "padding:8px 14px", "background:#1677ff", "color:#fff",
        "font:13px/1.5 'PingFang SC','Microsoft YaHei',sans-serif",
        "box-shadow:0 2px 8px rgba(0,0,0,.18)",
      ].join(";"),
    );
    const label = document.createElement("span");
    label.textContent = "AI 正在控制此页面";
    const button = document.createElement("button");
    button.textContent = "停止";
    button.setAttribute(
      "style",
      "padding:3px 12px;border:none;border-radius:5px;background:#fff;color:#1677ff;font-size:12px;cursor:pointer",
    );
    button.addEventListener("click", () => {
      // 停止指令只发给扩展后台，不经过页面（页面脚本无法伪造停止）。
      chrome.runtime.sendMessage({ type: "AIPDD_RPA_STOP" }).catch(() => undefined);
    });
    bar.appendChild(label);
    bar.appendChild(button);
    (document.body || document.documentElement).appendChild(bar);
  }

  function hideBanner() {
    const bar = document.getElementById(BANNER_ID);
    if (bar) bar.remove();
  }

  // ---------- 录制 → 工具（把本人在页面上的操作拍成闭集动作序列）----------
  // 只录交互（点击 / 输入 / 选择 / 勾选），用 selector 定位（回放时页面结构未必与录制时一致）；
  // 密码框一律不录，扩展自己的横幅不录，页面上限 200 步。

  const RECORD_MAX = 200;
  const recording = { on: false, actions: [], url: "" };

  function recordableNode(node) {
    let el = node && node.nodeType === 1 ? node : null;
    if (!el || typeof el.closest !== "function") return null;
    if (el.closest(`#${BANNER_ID}`)) return null;
    const hit = el.closest(INTERACTIVE_SELECTOR);
    return hit || null;
  }

  function pushRecord(action) {
    if (recording.actions.length >= RECORD_MAX) return;
    recording.actions.push(action);
    chrome.runtime.sendMessage({ type: "AIPDD_AGENT_RECORD_EVENT", action }).catch(() => undefined);
  }

  function onRecordClick(event) {
    const el = recordableNode(event.target);
    if (!el) return;
    pushRecord({ action: "act", act: "click", selector: cssPath(el), name: clip(nameOf(el), 80) });
  }

  function onRecordChange(event) {
    const el = recordableNode(event.target);
    if (!el) return;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "password") return; // 口令永不入库
    const selector = cssPath(el);
    if (tag === "select") {
      pushRecord({ action: "act", act: "select", selector, value: clip(el.value, 200) });
      return;
    }
    if (type === "checkbox" || type === "radio") {
      pushRecord({ action: "act", act: "check", selector, value: el.checked === true });
      return;
    }
    const value = clip(el.isContentEditable ? el.textContent : el.value, 2000);
    if (value) pushRecord({ action: "act", act: "type", selector, value });
  }

  function setRecording(on) {
    if (on === true) {
      if (recording.on) return { recording: true, count: recording.actions.length };
      recording.on = true;
      recording.actions = [];
      recording.url = location.href;
      document.addEventListener("click", onRecordClick, true);
      document.addEventListener("change", onRecordChange, true);
      return { recording: true, count: 0 };
    }
    if (recording.on) {
      document.removeEventListener("click", onRecordClick, true);
      document.removeEventListener("change", onRecordChange, true);
      recording.on = false;
    }
    return { recording: false, count: recording.actions.length };
  }

  // ---------- 消息入口（仅扩展内部）----------

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (String(message?.type || "") !== "AIPDD_RPA_EXEC") return false;
    const action = message.action && typeof message.action === "object" ? message.action : {};
    const started = Date.now();
    (async () => {
      try {
        const name = String(action.action || "");
        let data;
        if (name === "snapshot") {
          data = buildSnapshot(Math.min(SNAPSHOT_TEXT_MAX, Math.max(200, Number(action.maxChars) || 2000)));
        } else if (name === "read") {
          data = runRead(action);
        } else if (name === "act") {
          data = await runAct(action);
          if (data.matched === false) {
            sendResponse({
              ok: false,
              data,
              errorMessage: data.effect || "动作未生效",
              code: "NO_MATCH",
              elapsedMs: Date.now() - started,
            });
            return;
          }
        } else if (name === "wait") {
          data = await runWait(action);
          if (data.ok === false) {
            sendResponse({
              ok: false,
              data,
              errorMessage: data.errorMessage || "等待超时",
              code: "WAIT_TIMEOUT",
              elapsedMs: Date.now() - started,
            });
            return;
          }
        } else if (name === "wait_for") {
          data = await runWaitFor(action);
          if (data.ok === false) {
            sendResponse({
              ok: false,
              data,
              errorMessage: data.errorMessage || "等待条件超时",
              code: "WAIT_TIMEOUT",
              elapsedMs: Date.now() - started,
            });
            return;
          }
        } else if (name === "harvest") {
          data = await runHarvest(action);
        } else if (name === "fill_form") {
          data = await runFillForm(action);
        } else if (name === "upload_file") {
          data = runUploadFile(action);
        } else if (name === "rect") {
          // 内部动作：元素截图前量矩形用（由后台的 screenshot 分支调用，不在动作闭集里）。
          data = await runRect(action);
        } else if (name === "banner") {
          if (action.show === false) hideBanner();
          else showBanner();
          data = { shown: action.show !== false };
        } else if (name === "record") {
          data = setRecording(action.on === true);
          if (data.recording === false) data.actions = recording.actions.slice();
        } else {
          sendResponse({
            ok: false,
            data: {},
            errorMessage: `执行器不认识的动作：${name}`,
            code: "UNSUPPORTED_ACTION",
            elapsedMs: Date.now() - started,
          });
          return;
        }
        // 配方/目标层面的拒收：如实带回错误码，不当成成功回执。
        if (data && data.failed === true) {
          sendResponse({
            ok: false,
            data,
            errorMessage: data.errorMessage || "收割配方未能执行",
            code: data.code || "NO_MATCH",
            elapsedMs: Date.now() - started,
          });
          return;
        }
        sendResponse({ ok: true, data, errorMessage: "", code: "", elapsedMs: Date.now() - started });
      } catch (error) {
        sendResponse({
          ok: false,
          data: {},
          errorMessage: String(error?.message || error || "执行失败"),
          code: "EXEC_ERROR",
          elapsedMs: Date.now() - started,
        });
      }
    })();
    return true;
  });
})();
