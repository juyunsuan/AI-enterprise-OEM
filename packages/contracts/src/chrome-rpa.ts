import { z } from "zod";

/**
 * 本地 Chrome 插件 RPA 控制（docs/本地Chrome插件RPA控制方案.md）。
 *
 * 与「分发 / 获客 / 浏览器任务」同一套插件能力底座（extension.ts / browser-task.ts）：
 * 插件登录本系统后成为该账号名下的一台「本地 Chrome 设备」，云端把动作写进指令队列，
 * 插件心跳顺带领取、动态注入的内容脚本执行、按 commandCode 回执；会话由云端 LLM 逐步决策。
 * 本文件只放插件与本页面共用的形状；端点定义在 automation.ts（RpaChrome_* / OpenApi_rpaChrome*）。
 */

/** 设备令牌前缀：形态对齐 `hw_` / `ek_`，明文只在登录响应里出现一次。 */
export const RC_DEVICE_TOKEN_PREFIX = "rc_";
/** 插件调用设备通道时携带令牌的请求头。 */
export const RC_DEVICE_TOKEN_HEADER = "x-chrome-token";

/* ---------------------------------------------------------------- 设备状态 */

/** ONLINE＝90 秒内有心跳；OFFLINE＝心跳超时；DISABLED＝被停用或被撤销（复权失败）。 */
export const RC_DEVICE_STATUSES = ["ONLINE", "OFFLINE", "DISABLED"] as const;
export type RcDeviceStatus = (typeof RC_DEVICE_STATUSES)[number];
export const RC_DEVICE_STATUS_LABELS: Record<string, string> = {
  ONLINE: "在线",
  OFFLINE: "离线",
  DISABLED: "已停用",
};
/** 在线判定：3 个心跳周期（默认 30 秒/次）。 */
export const RC_ONLINE_TIMEOUT_MS = 90_000;
/** 每次心跳最多下发的指令条数。 */
export const RC_HEARTBEAT_BATCH = 10;

/** 设备当前心跳展示：服务端按 lastSeenAt 折算，不落冗余状态更新。 */
export function rcDeviceOnline(row: {
  status: string;
  lastSeenAt: Date | string | null;
  now?: number;
}): boolean {
  if (row.status !== "ONLINE") return false;
  if (!row.lastSeenAt) return false;
  const seen =
    row.lastSeenAt instanceof Date
      ? row.lastSeenAt.getTime()
      : new Date(row.lastSeenAt).getTime();
  return Number.isFinite(seen) && (row.now ?? Date.now()) - seen <= RC_ONLINE_TIMEOUT_MS;
}

/* ---------------------------------------------------------------- 指令与动作 */

/**
 * 动作闭集（插件与云端共用）。未知动作一律回 FAILED，不做「尽力而为」。
 * stop 由插件侧主动入队（用户在弹窗/页面横幅点停止），云端只读不派发。
 */
export const RC_ACTIONS = [
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
] as const;
export type RcActionName = (typeof RC_ACTIONS)[number];
export const RC_ACTION_LABELS: Record<string, string> = {
  open_tab: "打开标签页",
  close_tab: "关闭标签页",
  navigate: "跳转页面",
  snapshot: "读取页面",
  read: "读取元素",
  act: "操作页面",
  wait: "等待",
  wait_for: "等待条件",
  harvest: "收割列表",
  fill_form: "批量填写",
  upload_file: "上传文件",
  list_tabs: "列出页签",
  tab_select: "切换工作页",
  screenshot: "截图",
  finish: "结束会话",
};

/** 页面内动作（act 的子动作）：命中敏感词的 click 与 submit 需人工确认。 */
export const RC_ACT_INTERACTIONS = [
  "click",
  "type",
  "select",
  "check",
  "scroll",
  "key",
  "submit",
] as const;
export type RcActInteraction = (typeof RC_ACT_INTERACTIONS)[number];

/** read 的读法：单元素文本 / 属性 / 命中条数 / 整组文本数组。 */
export const RC_READ_MODES = ["text", "attribute", "count", "all"] as const;
export type RcReadMode = (typeof RC_READ_MODES)[number];

/** harvest 的两种模式：按配方收（item）/ 先探测页面重复结构（discover）。 */
export const RC_HARVEST_MODES = ["item", "discover"] as const;
export type RcHarvestMode = (typeof RC_HARVEST_MODES)[number];

/** 内置值形态（class 混淆的 SPA 靠值形态而不是类名定位字段）。 */
export const RC_HARVEST_PATTERNS = [
  "phone",
  "mobile",
  "email",
  "url",
  "date",
  "money",
  "idno",
  "postcode",
] as const;
export type RcHarvestPattern = (typeof RC_HARVEST_PATTERNS)[number];

/** 标签邻接取值的落点：命中标签后取哪一个节点。 */
export const RC_FIELD_TAKES = [
  "self",
  "next",
  "parent",
  "before",
  "after",
  "line",
] as const;
export type RcFieldTake = (typeof RC_FIELD_TAKES)[number];

/** wait_for 的等待条件。 */
export const RC_WAIT_FOR_MODES = ["text", "text_gone", "url"] as const;
export type RcWaitForMode = (typeof RC_WAIT_FOR_MODES)[number];

/* -------------------------------------------------- 限额（大脑按限额排产） */

/** 单次 harvest 最多收多少行（对齐 RpaChromeExtract.rows 500 与 createRows 200 的口径）。 */
export const RC_HARVEST_LIMIT = 200;
/** 单次 harvest 最多带回的字段数。 */
export const RC_HARVEST_FIELDS = 24;
/** discover 最多回几个候选组。 */
export const RC_DISCOVER_TOP = 8;
/** snapshot 正文上限：12000 字（旧值 6000 会让长列表静默丢条目）。 */
export const RC_SNAPSHOT_TEXT_MAX = 12000;
/** 收割时单字段值上限。 */
export const RC_HARVEST_VALUE_MAX = 300;
/** 单次 fill_form 最多填几个字段。 */
export const RC_FILL_FIELDS = 40;
/** 上传文件大小上限（字节）：只在用户本机内网/公开地址之间搬运，不做中转存储。 */
export const RC_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** 等待类动作的超时上限（毫秒）。 */
export const RC_WAIT_MAX_MS = 30000;

/** 目标定位的通用字段：act/read/wait/wait_for/upload_file/screenshot 都接受。 */
const TARGET_FIELDS = ["tabId", "target", "elementIndex", "selector"] as const;

/**
 * 动作参数形状（协议层唯一真源）。
 *
 * `fields` 决定服务端 `normalizeChromeAction` 允许哪些键——历史上 `timeoutMs`、`mode`
 * 就是这样被白名单静默吃掉，表现为「插件会做但永远不生效」。新增参数必须写进这里。
 * `usage` 是决策提示词的一行：菜单由本表生成，不再手写第二份清单。
 */
export type RcActionSpec = {
  fields: readonly string[];
  /** 该原语首次可用的插件版本（低于它的设备拿不到，走降级菜单）。 */
  minVersion: string;
  /** 可能回的错误码（除通用 EXEC_ERROR / NO_TAB）。 */
  errors: readonly string[];
  /** 给大脑的一行用法（含参数示例）。 */
  usage: string;
  /** 限额说明（提示词与界面同源）。 */
  limits?: Record<string, number>;
};

/** 1.4.0 起就有的动作（老插件也有）。 */
export const RC_BASE_MIN_VERSION = "1.4.0";
/** 1.5.1 新增的动作（旧插件一律不派发，回 CAPABILITY_MISSING）。 */
export const RC_NEW_MIN_VERSION = "1.5.1";

export const RC_ACTION_SPECS: Record<RcActionName, RcActionSpec> = {
  open_tab: {
    fields: ["url", "focus"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: ["BAD_URL", "BLOCKED_HOST", "OPEN_FAILED"],
    usage:
      '{ "action": "open_tab", "url": "https://..." }  打开新标签页（回执 data.tabId 是本会话唯一可关闭/可切换的页签号）；focus:true 才切到前台',
  },
  close_tab: {
    fields: ["tabId"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: ["NOT_OWNED"],
    usage: '{ "action": "close_tab", "tabId": 123 }  关闭本会话打开的第 123 号标签页（只能关 open_tab 回来的那个 id）',
  },
  navigate: {
    fields: ["url", "tabId"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: ["BAD_URL", "BLOCKED_HOST", "OPEN_FAILED"],
    usage: '{ "action": "navigate", "url": "https://..." }  当前工作页跳转到该地址',
  },
  snapshot: {
    fields: ["maxChars"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: ["EXEC_ERROR"],
    usage:
      '{ "action": "snapshot", "maxChars": 12000 }  读取页面地图（可见交互元素清单）与正文；maxChars 缺省 2000，长列表要显式给大（上限 12000）。正文与元素清单跨 iframe 聚合（逐帧标注 frame / frames），元素序号对全帧统一编号，act/read 可直接指回来',
    limits: { elements: 120, maxChars: RC_SNAPSHOT_TEXT_MAX },
  },
  read: {
    fields: [...TARGET_FIELDS, "mode", "attribute"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: ["NO_MATCH", "EXEC_ERROR"],
    usage:
      '{ "action": "read", "elementIndex": 3 }  读第 3 号元素文本；{ "action": "read", "mode": "all", "selector": ".item" } 整组文本数组；{ "action": "read", "mode": "attribute", "selector": "a.more", "attribute": "href" }；{ "action": "read", "mode": "count", "selector": ".item" } 命中条数',
  },
  act: {
    fields: [...TARGET_FIELDS, "act", "value", "key", "clearFirst", "elementName"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: ["NO_MATCH", "NEED_CONFIRM", "EXEC_ERROR"],
    usage:
      '{ "action": "act", "act": "click|type|select|check|scroll|key|submit", "elementIndex": 3, "value": "...", "key": "Enter", "elementName": "页面地图里该元素的名称" }  操作第 3 号元素；scroll 用 value:"up|down"；check 用 value:true/false；key 省略 elementIndex 时作用于当前焦点；clearFirst:false 表示追加而不清空',
  },
  wait: {
    fields: [...TARGET_FIELDS, "ms", "timeoutMs"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: ["WAIT_TIMEOUT"],
    usage:
      '{ "action": "wait", "ms": 1500 }  死等毫秒数；{ "action": "wait", "target": { "selector": ".result-item" }, "timeoutMs": 8000 }  等元素出现再继续（页面异步出结果时优先用这个，selector 也可换成 { "elementIndex": 3 }）',
    limits: { ms: RC_WAIT_MAX_MS },
  },
  wait_for: {
    fields: ["mode", "text", "urlIncludes", "timeoutMs"],
    minVersion: RC_NEW_MIN_VERSION,
    errors: ["WAIT_TIMEOUT"],
    usage:
      '{ "action": "wait_for", "mode": "text", "text": "共找到", "timeoutMs": 10000 }  等页面出现某段文字（mode 也可 "text_gone" 等文字消失 / "url" 等地址变化，配 urlIncludes）',
    limits: { timeoutMs: RC_WAIT_MAX_MS },
  },
  harvest: {
    fields: ["mode", "item", "fields", "region", "scroll", "limit", "top", "minCount"],
    minVersion: RC_NEW_MIN_VERSION,
    errors: ["NO_MATCH", "PAGE_CHANGED", "EXEC_ERROR"],
    usage:
      '{ "action": "harvest", "mode": "discover", "top": 5 }  陌生页面：先回「重复出现的元素组」候选（count/item/signature/sampleText/fieldPaths），你只决定选哪一组、字段是第几个子节点；' +
      '{ "action": "harvest", "item": { "selector": "li.poi", "candidates": ["...","..."] }, "region": "#resultPanel", "fields": [ { "key": "name", "candidates": ["h3"] }, { "key": "phone", "afterLabel": "电话", "take": "next" }, { "key": "tel", "pattern": "phone", "optional": true } ], "scroll": { "rounds": 6, "ms": 1200 }, "limit": 200 }  按配方收成行数组。' +
      "字段三种取法：candidates 选择器候选 / afterLabel+take 标签邻接 / pattern 内置形态（" +
      RC_HARVEST_PATTERNS.join("|") +
      "）；返回 { url, total, items[], missed[], truncated }，行数据直传不要复述。条目落在 iframe 里也会逐帧试收并取收得最多的一帧（note 标注来源 frame）",
    limits: { limit: RC_HARVEST_LIMIT, fields: RC_HARVEST_FIELDS, top: RC_DISCOVER_TOP },
  },
  fill_form: {
    fields: ["fields", "submit"],
    minVersion: RC_NEW_MIN_VERSION,
    errors: ["NO_MATCH", "NEED_CONFIRM", "EXEC_ERROR"],
    usage:
      '{ "action": "fill_form", "fields": [ { "elementIndex": 4, "value": "张三" }, { "selector": "input[name=city]", "value": "昆明" } ] }  一次填多字段并回报未命中项（missed[]）；submit:true 会触发表单提交（属敏感动作，需用户确认）',
    limits: { fields: RC_FILL_FIELDS },
  },
  upload_file: {
    fields: [...TARGET_FIELDS, "fileUrl", "fileName", "mimeType"],
    minVersion: RC_NEW_MIN_VERSION,
    errors: ["NO_MATCH", "BAD_URL", "BLOCKED_HOST", "TOO_LARGE", "NEED_CONFIRM"],
    usage:
      '{ "action": "upload_file", "elementIndex": 8, "fileUrl": "https://.../a.pdf", "fileName": "a.pdf" }  把文件注入第 8 号 input[type=file]（只允许 http(s)，上限 10MB，属敏感动作需用户确认）',
    limits: { bytes: RC_UPLOAD_MAX_BYTES },
  },
  list_tabs: {
    fields: [],
    minVersion: RC_NEW_MIN_VERSION,
    errors: ["EXEC_ERROR"],
    usage: '{ "action": "list_tabs" }  列出本机打开的 http(s) 页签（tabId/url/title），用来接管用户「右边已经开着的那个页面」',
  },
  tab_select: {
    fields: ["tabId", "urlIncludes"],
    minVersion: RC_NEW_MIN_VERSION,
    errors: ["NO_MATCH", "BLOCKED_HOST"],
    usage:
      '{ "action": "tab_select", "tabId": 123 }  把某个已开页签设成本会话的工作页（之后的 snapshot/act 都打在它上面）；也可 { "urlIncludes": "map.baidu.com" } 按地址片段匹配',
  },
  screenshot: {
    fields: ["tabId", "elementIndex", "selector", "target"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: ["NO_TAB", "SHOT_FAILED"],
    usage:
      '{ "action": "screenshot" }  视口截图；{ "action": "screenshot", "elementIndex": 3 } 只截某个元素（用于确认视觉结果）',
  },
  finish: {
    fields: ["reason"],
    minVersion: RC_BASE_MIN_VERSION,
    errors: [],
    usage: '{ "action": "finish", "reason": "完成原因" }  目标已达成或无法继续时结束',
  },
};

/** 动作名→规格的宽表：名字可能来自模型/页面输入，未必在闭集里，用它查以免越界。 */
const RC_ACTION_SPEC_BY_NAME: Readonly<
  Record<string, RcActionSpec | undefined>
> = RC_ACTION_SPECS;

/** 按名字取动作规格；不在闭集内返回 undefined。 */
export function rcActionSpec(name: string): RcActionSpec | undefined {
  return RC_ACTION_SPEC_BY_NAME[name];
}

/** 动作里除参数形状外还要认的固定键（动作名、act 子动作、确认标记）。 */
const RC_ACTION_META_FIELDS = ["action", "act", "confirmed"] as const;

/** 某动作允许携带的字段（服务端动作白名单由此派生，不再手写）。 */
export function rcActionFields(name: string): string[] {
  const spec = rcActionSpec(name);
  if (!spec) return [];
  return Array.from(new Set([...RC_ACTION_META_FIELDS, ...spec.fields]));
}

/** 全部动作字段的并集（工具面/校验用）。 */
export function rcAllActionFields(): string[] {
  return Array.from(
    new Set(RC_ACTIONS.flatMap((name) => rcActionFields(name))),
  );
}

/** 语义化版本比较：a ≥ b 返回 true（只比 major.minor.patch，非数字段按 0）。 */
export function rcVersionAtLeast(a: string, b: string): boolean {
  const left = String(a || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b || "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < 3; index += 1) {
    const x = left[index] ?? 0;
    const y = right[index] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/**
 * 某插件版本可用的动作原语（旧插件不上报指纹时的降级依据）：
 * 高于它引入的原语一律不给，避免「菜单里有、执行必失败」。
 */
export function rcPrimitivesForVersion(version: string): string[] {
  return RC_ACTIONS.filter((name) =>
    rcVersionAtLeast(version, RC_ACTION_SPECS[name].minVersion),
  );
}

/**
 * 决策提示词的动作菜单：由契约派生（改闭集只改 RC_ACTION_SPECS）。
 * `available` 给出时按设备能力裁剪——旧插件不会拿到只有新版才支持的原语。
 */
export function rcActionMenuLines(available?: readonly string[]): string[] {
  const list = available?.length
    ? RC_ACTIONS.filter((name) => available.includes(name))
    : RC_ACTIONS;
  return list.map((name) => RC_ACTION_SPECS[name].usage);
}

/**
 * 能力缺口的提示词一行：告诉大脑「这台插件做不到什么」，
 * 省得它反复试不存在的动作，也省得它把做不到的目标硬凑成能做的样子。
 */
export function rcCapabilityGapNote(available?: readonly string[]): string {
  if (!available?.length) return "";
  const missing = RC_ACTIONS.filter((name) => !available.includes(name));
  if (!missing.length) return "";
  return `这台插件当前不支持这些动作：${missing.join("、")}。需要它们时直接说明做不到并回报能力缺口，不要改用其他动作硬凑。`;
}

/** 该动作是否需要人工确认（动作级固定口径，与关键词判定叠加）。 */
const RC_ALWAYS_CONFIRM: readonly string[] = ["upload_file"];

/** 敏感动作判定：提交类动作与命中关键词的点击必须由本人在插件弹窗点「允许本次」。 */
export const RC_SENSITIVE_KEYWORDS = [
  "支付",
  "付款",
  "转账",
  "删除",
  "发布",
  "发送",
  "提交",
  "授权",
  "确认付款",
  "pay",
  "transfer",
  "delete",
  "publish",
  "send",
  "submit",
  "authorize",
] as const;

export function rcActionNeedsConfirm(
  action: {
    action?: unknown;
    act?: unknown;
    target?: unknown;
    value?: unknown;
    elementIndex?: unknown;
    elementName?: unknown;
    submit?: unknown;
    fields?: unknown;
  },
  /** 最近一次页面地图（snapshot 的 pageMap）：模型只给 elementIndex 时用它补出元素名。 */
  observation?: unknown,
): boolean {
  const type = String(action.action || "").trim();
  if (type === "finish" || type === "reply") return false;
  if (RC_ALWAYS_CONFIRM.includes(type)) return true;
  // fill_form 带 submit 等价于替用户点提交。
  if (type === "fill_form") return action.submit === true;
  if (type !== "act") return false;
  const interaction = String(action.act || "").trim();
  if (interaction === "submit") return true;
  if (interaction !== "click") return false;
  const haystack = [
    textOf(action.target),
    typeof action.value === "string" ? action.value : "",
    // 元素名来自页面地图：按 elementIndex 定位时，服务端只能靠它判断是不是「发布/删除」按钮。
    typeof action.elementName === "string" ? action.elementName : "",
    elementNameFromMap(actionIndex(action), observation),
  ]
    .join(" ")
    .toLowerCase();
  return RC_SENSITIVE_KEYWORDS.some((word) => haystack.includes(word.toLowerCase()));
}

/** 动作里的元素编号：扁平 elementIndex 与嵌套 target.elementIndex 两种写法都认。 */
function actionIndex(action: { elementIndex?: unknown; target?: unknown }): number {
  if (action.elementIndex !== undefined) return Number(action.elementIndex);
  const target = action.target;
  if (target && typeof target === "object" && "elementIndex" in target) {
    return Number(target.elementIndex);
  }
  return -1;
}

/** 按编号从页面地图补出元素名：漏了这一步，「点第 3 号元素＝发布」就弹不出确认。 */
function elementNameFromMap(index: number, observation: unknown): string {
  if (!Number.isInteger(index) || index < 0) return "";
  if (!observation || typeof observation !== "object") return "";
  const pageMap = "pageMap" in observation ? observation.pageMap : undefined;
  const elements = "elements" in observation ? observation.elements : undefined;
  const map = pageMap ?? elements;
  if (!Array.isArray(map)) return "";
  const entry: unknown = map[index];
  if (!entry || typeof entry !== "object" || !("name" in entry)) return "";
  const name = entry.name;
  return typeof name === "string" ? name : "";
}

/**
 * 决策只给 elementIndex 时，按最近一次页面地图把元素名补进动作（K20）。
 * 补出来的名字既让敏感闸门认得出「发布/删除」，也随动作一起下发，插件与回执都能核对。
 */
export function rcWithElementName(
  action: Record<string, unknown> | null,
  observation: unknown,
): Record<string, unknown> | null {
  if (!action || typeof action !== "object") return action;
  const existing = action.elementName;
  if (typeof existing === "string" && existing.trim()) return action;
  const name = elementNameFromMap(actionIndex(action), observation)
    .trim()
    .slice(0, 120);
  return name ? { ...action, elementName: name } : action;
}

/** 元素键名是否属口令/凭据类：收割与落表的字段名一律拒绝。 */
export function rcSensitiveFieldKey(key: string): boolean {
  const value = String(key || "").toLowerCase();
  if (!value) return false;
  return ["password", "passwd", "pwd", "token", "secret", "cookie", "credential", "验证码"]
    .some((word) => value.includes(word));
}

/** 动作里的目标可能是字符串，也可能是页面地图元素对象：两种形态都取出一段可读文本。 */
function textOf(target: unknown): string {
  if (typeof target === "string") return target;
  if (!target || typeof target !== "object") return "";
  const bag = new Map<string, unknown>(Object.entries(target));
  return ["selector", "name", "text", "role"]
    .map((key) => bag.get(key))
    .filter((item): item is string => typeof item === "string")
    .join(" ");
}

/* ---------------------------------------------------------------- 指令状态 */

/** PENDING＝待插件领取；DISPATCHED＝已随心跳下发；PENDING_CONFIRM＝等人工允许；终态见下。 */
export const RC_COMMAND_STATUSES = [
  "PENDING",
  "DISPATCHED",
  "PENDING_CONFIRM",
  "DONE",
  "FAILED",
  "TIMEOUT",
  "CANCELLED",
] as const;
export type RcCommandStatus = (typeof RC_COMMAND_STATUSES)[number];
export const RC_COMMAND_STATUS_LABELS: Record<string, string> = {
  PENDING: "待下发",
  DISPATCHED: "已下发",
  PENDING_CONFIRM: "等待确认",
  DONE: "已完成",
  FAILED: "失败",
  TIMEOUT: "超时",
  CANCELLED: "已取消",
};

/* ---------------------------------------------------------------- 会话状态 */

export const RC_SESSION_STATUSES = [
  "RUNNING",
  "WAITING_CONFIRM",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMEOUT",
] as const;
export type RcSessionStatus = (typeof RC_SESSION_STATUSES)[number];
export const RC_SESSION_STATUS_LABELS: Record<string, string> = {
  RUNNING: "执行中",
  WAITING_CONFIRM: "等待确认",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
  TIMEOUT: "已超时",
};

export function rcSessionTerminal(status: string): boolean {
  return (
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "TIMEOUT"
  );
}

/* ---------------------------------------------------------------- 页面观测 */

/** 收割字段：三种取法（选择器候选 / 标签邻接 / 内置值形态）叠用，命中即取。 */
export const rcHarvestFieldSchema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().max(40).default(""),
  candidates: z.array(z.string().max(300)).max(8).optional(),
  afterLabel: z.string().max(40).optional(),
  take: z.enum(RC_FIELD_TAKES).optional(),
  pattern: z.enum(RC_HARVEST_PATTERNS).optional(),
  optional: z.boolean().optional(),
  /** 从属性取值（如 href/src），不给＝取可见文本。 */
  attribute: z.string().max(40).optional(),
});
export type RcHarvestField = z.infer<typeof rcHarvestFieldSchema>;

/** harvest 动作入参（mode=discover 时不需要 item/fields）。 */
export const rcHarvestActionSchema = z.object({
  action: z.literal("harvest"),
  mode: z.enum(RC_HARVEST_MODES).default("item"),
  item: z
    .object({
      selector: z.string().max(300).default(""),
      candidates: z.array(z.string().max(300)).max(8).default([]),
    })
    .optional(),
  fields: z.array(rcHarvestFieldSchema).max(RC_HARVEST_FIELDS).optional(),
  region: z.string().max(300).optional(),
  scroll: z
    .object({ rounds: z.number().int().min(0).max(20).default(0), ms: z.number().int().min(0).max(5000).default(1200) })
    .optional(),
  limit: z.number().int().min(1).max(RC_HARVEST_LIMIT).default(RC_HARVEST_LIMIT),
  top: z.number().int().min(1).max(RC_DISCOVER_TOP).default(5),
  minCount: z.number().int().min(2).max(20).default(3),
});
export type RcHarvestAction = z.infer<typeof rcHarvestActionSchema>;

/** discover 回的一个重复结构候选组。 */
export const rcHarvestGroupSchema = z.object({
  count: z.number(),
  /** 可直接当 harvest.item.selector 用的 css 路径。 */
  item: z.string(),
  signature: z.string(),
  sampleText: z.array(z.string().max(300)).max(6).default([]),
  fieldPaths: z
    .array(z.object({ i: z.number(), role: z.string().max(24).default(""), text: z.string().max(300).default("") }))
    .max(30)
    .default([]),
});
export type RcHarvestGroup = z.infer<typeof rcHarvestGroupSchema>;

/** harvest 回执载荷（行数据全程直传，不经模型复述）。 */
export const rcHarvestResultSchema = z.object({
  url: z.string().max(2000).default(""),
  total: z.number().default(0),
  items: z.array(z.record(z.string(), z.unknown())).max(RC_HARVEST_LIMIT).default([]),
  missed: z.array(z.string().max(40)).max(RC_HARVEST_FIELDS).default([]),
  groups: z.array(rcHarvestGroupSchema).max(RC_DISCOVER_TOP).default([]),
  truncated: z.boolean().default(false),
  note: z.string().max(500).default(""),
});
export type RcHarvestResult = z.infer<typeof rcHarvestResultSchema>;

/** 采集产物的去向：none 只回对话 / extract 落采集台账 / table 落多维表格。 */
export const RC_PERSIST_MODES = ["none", "extract", "table"] as const;
export type RcPersistMode = (typeof RC_PERSIST_MODES)[number];
export const RC_PERSIST_MODE_LABELS: Record<string, string> = {
  none: "只回对话",
  extract: "存采集台账",
  table: "落多维表格",
};

/**
 * 落表口径（会话/计划级留档）：目标表名 + 期望表头 + 幂等锚。
 * 引擎在 harvest 回执后按它把行直传 `DataTable_landRows`，定时重跑靠 dedupBy 不产生重复行。
 */
export const rcLandingSpecSchema = z.object({
  /** tableId=0 时用它定位同名已有表，找不到就新建。 */
  tableName: z.string().max(60).default(""),
  fields: z
    .array(
      z.object({
        name: z.string().max(40),
        key: z.string().max(40).optional(),
        type: z.string().max(16).optional(),
      }),
    )
    .max(40)
    .default([]),
  /** 查重列（列键或表头名均可）：命中同值更新而非重复插行。 */
  dedupBy: z.array(z.string().max(40)).max(5).default([]),
});
export type RcLandingSpec = z.infer<typeof rcLandingSpecSchema>;

/** 页面地图里的一项可见交互元素：LLM 用 elementIndex 指定比猜选择器稳。 */
export const rcPageElementSchema = z.object({
  i: z.number(),
  role: z.string().max(24),
  name: z.string().max(120),
  selector: z.string().max(300),
  value: z.string().max(200).optional(),
  href: z.string().max(500).optional(),
});
export type RcPageElement = z.infer<typeof rcPageElementSchema>;

/** 一次动作的统一回执：ok + data（含页面地图/截图的 key）+ 错误码与文案。 */
export const rcActionResultSchema = z.object({
  commandCode: z.string(),
  ok: z.boolean(),
  data: z.record(z.string(), z.unknown()).default({}),
  errorMessage: z.string().max(500).default(""),
  elapsedMs: z.number().int().nonnegative().default(0),
  /** 网关错误码：沿用 BROWSER_TASK_ERROR_CODES + 本通道的 NEED_CONFIRM。 */
  code: z.string().max(40).default(""),
});
export type RcActionResultInput = z.infer<typeof rcActionResultSchema>;

/* ---------------------------------------------------------------- 设备通道（插件用） */

export const rcDeviceSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  domain: z.string(),
  extensionVersion: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  online: z.boolean(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
  /** 该设备当前在跑的会话编号（没有则 0）。 */
  activeSessionId: z.number().default(0),
});
export type RcDeviceView = z.infer<typeof rcDeviceSchema>;

export const rcLoginBodySchema = z.object({
  domain: z.string().min(1).max(200),
  clientId: z.string().min(8).max(64),
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  deviceName: z.string().max(80).optional(),
  extensionVersion: z.string().max(24).optional(),
});
export type RcLoginBody = z.infer<typeof rcLoginBodySchema>;

export const rcLoginResultSchema = z.object({
  token: z.string(),
  clientId: z.string(),
  deviceName: z.string(),
  username: z.string(),
  /** 插件侧兜底上限（服务端为准）：单会话最大步数 / 单动作超时 / 会话总时长。 */
  limits: z.object({
    maxSteps: z.number(),
    stepTimeoutSeconds: z.number(),
    sessionTimeoutSeconds: z.number(),
  }),
  /** 高风险站点黑名单（已折叠为 hostname 后缀匹配）。 */
  blockedHosts: z.array(z.string()),
  /** 是否要求敏感动作人工确认。 */
  confirmSensitive: z.boolean(),
  heartbeatSeconds: z.number(),
});
export type RcLoginResult = z.infer<typeof rcLoginResultSchema>;

/**
 * 心跳请求：插件带版本与当前打开的页面（供 UI 展示），顺带领取指令。
 *
 * `primitives` 是这台设备**实际带**的动作原语（插件导出自身常量，而不是自报新名字）：
 * 服务端与能力目录取交集后决定派发与降级菜单，旧插件不再被派到跑不动的新动作。
 */
export const rcHeartbeatBodySchema = z.object({
  version: z.string().max(24).optional(),
  /** 插件通信协议版本（与 BROWSER_TASK_PROTOCOL_VERSION 对齐）。 */
  protocol: z.number().int().nonnegative().optional(),
  /** 本插件带的能力族（distribution/acquisition/chrome）。 */
  capabilities: z.array(z.string().max(32)).max(10).optional(),
  /** 本插件实现的动作原语名（RC_ACTIONS 的子集）。 */
  primitives: z.array(z.string().max(32)).max(40).optional(),
  /** 站点矩阵指纹（服务端以目录为准，插件自报值仅作比对线索）。 */
  siteMatrixHash: z.string().max(64).optional(),
  pages: z
    .array(z.object({ tabId: z.number(), url: z.string().max(500), title: z.string().max(200).default("") }))
    .max(20)
    .optional(),
});
export type RcHeartbeatBody = z.infer<typeof rcHeartbeatBodySchema>;

/** 设备能力指纹：服务端落库，派发门与降级菜单的唯一依据。 */
export const rcDeviceCapsSchema = z.object({
  version: z.string().max(24).default(""),
  protocol: z.number().default(0),
  capabilities: z.array(z.string().max(32)).default([]),
  primitives: z.array(z.string().max(32)).default([]),
  siteMatrixHash: z.string().max(64).default(""),
  /** 指纹采集时刻（ISO）。 */
  at: z.string().default(""),
});
export type RcDeviceCaps = z.infer<typeof rcDeviceCapsSchema>;

export const rcCommandSchema = z.object({
  commandCode: z.string(),
  sessionId: z.number(),
  stepIndex: z.number(),
  action: z.record(z.string(), z.unknown()),
});
export type RcCommand = z.infer<typeof rcCommandSchema>;

export const rcHeartbeatResultSchema = z.object({
  received: z.boolean(),
  serverTime: z.string(),
  /** 需要人工确认的动作：插件弹窗列出来，点允许后调 confirm。 */
  pendingConfirms: z.array(
    z.object({
      commandCode: z.string(),
      sessionId: z.number(),
      stepIndex: z.number(),
      action: z.record(z.string(), z.unknown()),
    }),
  ),
  commands: z.array(rcCommandSchema),
  /** 被强制停止的会话编号：插件收到即终止本地执行与横幅。 */
  stoppedSessionIds: z.array(z.number()).default([]),
  /** 令牌已失效（复权失败/被停用）：插件清令牌并要求重新登录。 */
  revoked: z.boolean().default(false),
  /**
   * 服务端认定的「这台设备当前跑得动的动作原语」（自报指纹与能力目录的交集）：
   * 插件据此裁剪本地菜单与侧边栏 Agent 的动作面，不再出现「菜单里有、执行必失败」。
   */
  primitives: z.array(z.string().max(32)).default([]),
  limits: z
    .object({
      maxSteps: z.number(),
      stepTimeoutSeconds: z.number(),
      sessionTimeoutSeconds: z.number(),
      /** 拒绝接管的域名（银行/支付/内网等）：插件在打开跳转前先拦下。 */
      blockedHosts: z.array(z.string()).default([]),
      /** 敏感动作是否需要本人在侧边栏逐条确认（账号级设置）。 */
      confirmSensitive: z.boolean().default(true),
    })
    .optional(),
});
export type RcHeartbeatResult = z.infer<typeof rcHeartbeatResultSchema>;

export const rcConfirmBodySchema = z.object({
  commandCode: z.string().min(4).max(40),
  allow: z.boolean(),
});

/** 插件侧主动入队的中断（不改会话终态，由会话引擎收口）。 */
export const rcStopBodySchema = z.object({
  sessionId: z.number().int().positive().optional(),
});

/* ---------------------------------------------------------------- 会话（页面 / Agent 用） */

/** 能力档：Act 操作页面 / Crawl 遍历抓取 / Extract 抽取结构化结果。 */
export const RC_AGENT_MODES = ["act", "crawl", "extract"] as const;
export type RcAgentMode = (typeof RC_AGENT_MODES)[number];
export const RC_AGENT_MODE_LABELS: Record<string, string> = {
  act: "操作",
  crawl: "抓取",
  extract: "抽取",
};

export const rcSessionStartBodySchema = z.object({
  clientId: z.string().min(8).max(64),
  goal: z.string().min(2).max(1000),
  /** 能力档（默认 act）：extract 追求结构化结果、crawl 顺着链接批量抓取。 */
  mode: z.enum(RC_AGENT_MODES).optional(),
  /** 起始地址（可选）：不给就让 LLM 先用当前活动页。 */
  startUrl: z.string().max(2000).optional(),
  taskId: z.number().int().nonnegative().optional(),
  maxSteps: z.number().int().min(1).max(60).optional(),
  /** 采集产物的去向（缺省 none：话里没要求存就不落库）。 */
  persist: z.enum(RC_PERSIST_MODES).optional(),
  /**
   * persist=table 的目标表编号（0＝按 tableName 找同名已有表，找不到就新建）。
   * 会话级留档：计划任务定时重跑与脚本回放都按它落表，收割到的行不经模型复述。
   */
  tableId: z.number().int().nonnegative().optional(),
  /** 目标表名称（tableId 为 0 时用它定位/新建）。 */
  tableName: z.string().max(60).optional(),
  /** 期望表头：新建表时全部建列，已有表时只补缺失列（形状同 DataTable_landRows 的 fields）。 */
  fields: z
    .array(
      z.object({
        name: z.string().max(40),
        key: z.string().max(40).optional(),
        type: z.string().max(16).optional(),
        required: z.boolean().optional(),
      }),
    )
    .max(40)
    .optional(),
  /** 幂等锚列（列键或表头名均可）：命中同值则更新而非重复插行。 */
  dedupBy: z.array(z.string().max(40)).max(5).optional(),
  modelKey: z.string().max(128).optional(),
  /** 确定性脚本：给出动作序列时按序回放，不调用 LLM、不产生 AI 积分。 */
  actions: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
});
export type RcSessionStartBody = z.infer<typeof rcSessionStartBodySchema>;

export const rcStepSchema = z.object({
  id: z.number(),
  stepIndex: z.number(),
  commandCode: z.string(),
  action: z.record(z.string(), z.unknown()),
  thought: z.string(),
  observation: z.record(z.string(), z.unknown()).nullable(),
  screenshotUrl: z.string(),
  status: z.string(),
  elapsedMs: z.number(),
  errorMessage: z.string(),
  createdAt: z.string(),
});
export type RcStepView = z.infer<typeof rcStepSchema>;

export const rcSessionSchema = z.object({
  id: z.number(),
  clientId: z.string(),
  deviceName: z.string(),
  goal: z.string(),
  mode: z.string(),
  modeLabel: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  stepCount: z.number(),
  maxSteps: z.number(),
  model: z.string(),
  /** 采集产物去向（none 只展示 / extract 落采集台账 / table 落多维表格）。 */
  persist: z.string().default("none"),
  persistLabel: z.string().default("只回对话"),
  /** persist=table 时的目标表编号（0＝按表名定位或新建）。 */
  tableId: z.number().default(0),
  stopReason: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
  steps: z.array(rcStepSchema).optional(),
});
export type RcSessionView = z.infer<typeof rcSessionSchema>;

export const rcSettingsSchema = z.object({
  /** 单会话最大步数（默认 25）。 */
  maxSteps: z.number(),
  /** 单动作超时（秒）。 */
  stepTimeoutSeconds: z.number(),
  /** 会话总时长上限（秒）。 */
  sessionTimeoutSeconds: z.number(),
  /** 高风险站点（hostname 或后缀，逗号/换行分隔）。 */
  blockedHosts: z.array(z.string()),
  /** 敏感动作是否要求人工确认（默认 true）。 */
  confirmSensitive: z.boolean(),
  /** 截图/观测保留天数（超期删除对象与记录）。 */
  retainDays: z.number(),
});
export type RcSettings = z.infer<typeof rcSettingsSchema>;

/** 插件登录目标是本系统自身地址：http / https 均可（本机开发常是 http），缺协议默认 https，路径前缀与当前站点一致。 */
export function normalizeLoginDomain(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || url.hostname.includes(" ")) return null;
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

/** 目标是否命中高风险站点黑名单（hostname 相等或为其子域）。 */
export function rcHostBlocked(
  url: string | null | undefined,
  blockedHosts: readonly string[],
): boolean {
  if (!url || !blockedHosts.length) return false;
  let host = "";
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  return blockedHosts.some((entry) => {
    const target = String(entry || "").trim().toLowerCase();
    if (!target) return false;
    return host === target || host.endsWith(`.${target}`);
  });
}

/* ---------------------------------------------------------------- 浏览器代理（侧边栏 Agent） */

/**
 * 浏览器代理 = 侧边栏里的「聊天式 Agent」：一句话目标 → 插件侧循环（规划/选工具/执行/观测/再规划）。
 * 决策循环在插件（贴页面、低延迟），模型与平台工具走本系统网关（模型广场 ek_ + 工具目录 + 授权闸）。
 * 本段只放插件与页面共用的形状；服务端台账表见 §数据模型。
 */

/** 代理会话状态：与云端会话同一套终态口径，编排在插件、台账在云端。 */
export const RC_AGENT_STATUSES = [
  "RUNNING",
  "WAITING_CONFIRM",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMEOUT",
] as const;
export type RcAgentStatus = (typeof RC_AGENT_STATUSES)[number];
export const RC_AGENT_STATUS_LABELS: Record<string, string> = {
  RUNNING: "执行中",
  WAITING_CONFIRM: "等待确认",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
  TIMEOUT: "已超时",
};
export function rcAgentTerminal(status: string): boolean {
  return (
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "TIMEOUT"
  );
}

/** 消息角色：user 用户 / agent 代理 / tool 工具回执 / system 系统提示。 */
export const RC_MESSAGE_ROLES = ["user", "agent", "tool", "system"] as const;
export type RcMessageRole = (typeof RC_MESSAGE_ROLES)[number];

/**
 * 消息卡片种类（侧边栏按 kind 渲染对应卡片）：
 * text 文本、thought 思考（可折叠）、action 浏览器动作、tool 平台工具调用、
 * result 结构化结果、screenshot 截图、error 错误、question Agent 反问澄清。
 */
export const RC_MESSAGE_KINDS = [
  "text",
  "thought",
  "action",
  "tool",
  "result",
  "screenshot",
  "error",
  "question",
  "gap",
] as const;
export type RcMessageKind = (typeof RC_MESSAGE_KINDS)[number];
export const RC_MESSAGE_KIND_LABELS: Record<string, string> = {
  text: "文本",
  thought: "思考",
  action: "动作",
  tool: "工具",
  result: "结果",
  screenshot: "截图",
  error: "错误",
  question: "追问",
  gap: "能力缺口",
};

/** 一条会话消息（消息流卡片）。payload 承载卡片结构化内容，content 为可读文本。 */
export const rcAgentMessageSchema = z.object({
  id: z.number(),
  agentId: z.number(),
  /** 会话内自增序号（界面排序与断点续传的锚点）。 */
  seq: z.number(),
  role: z.string(),
  kind: z.string(),
  content: z.string().max(8000),
  payload: z.record(z.string(), z.unknown()).default({}),
  screenshotKey: z.string().max(200).default(""),
  createdAt: z.string(),
});
export type RcAgentMessageView = z.infer<typeof rcAgentMessageSchema>;

/** 代理会话台账：目标、状态、模型、步数、额度消耗。 */
export const rcAgentSchema = z.object({
  id: z.number(),
  clientId: z.string(),
  deviceName: z.string(),
  mode: z.string(),
  modeLabel: z.string(),
  goal: z.string(),
  status: z.string(),
  statusLabel: z.string(),
  stepCount: z.number(),
  maxSteps: z.number(),
  model: z.string(),
  /** 本会话累计消耗（先时长卡后积分，与站内 AI 用量同口径）。 */
  credits: z.number(),
  stopReason: z.string(),
  errorMessage: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
  messages: z.array(rcAgentMessageSchema).optional(),
});
export type RcAgentView = z.infer<typeof rcAgentSchema>;

/** 技能种类：personal 个人偏好/工作流，site 站点操作知识。 */
export const RC_SKILL_KINDS = ["personal", "site"] as const;
export type RcSkillKind = (typeof RC_SKILL_KINDS)[number];
export const RC_SKILL_KIND_LABELS: Record<string, string> = {
  personal: "个人技能",
  site: "站点技能",
};

/** 技能（markdown）：Agent 学到长期有用的东西写进来，可读可编辑；site 类默认本账号私有。 */
export const rcSkillSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: z.string(),
  kindLabel: z.string(),
  description: z.string(),
  /** markdown 正文：偏好 / 站点操作知识 / 工作流步骤。 */
  content: z.string().max(20000),
  /** site 类技能的归属站点（hostname）；personal 为空。 */
  site: z.string().max(200).default(""),
  enabled: z.boolean(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RcSkillView = z.infer<typeof rcSkillSchema>;

/** 录制 → 生成的工具：把一次成功操作沉淀为可复用动作序列（chrome_actions）。 */
export const rcRecordingSchema = z.object({
  id: z.number(),
  name: z.string(),
  site: z.string().max(200).default(""),
  /** 录制得到的动作序列（闭集动作），可直接作为确定性脚本回放。 */
  actions: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
  stepCount: z.number(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RcRecordingView = z.infer<typeof rcRecordingSchema>;

/** 抽取结果：一次 Extract 的结构化产物（落库供导出/投递）。 */
export const rcExtractResultSchema = z.object({
  /** 台账编号：界面按它把某一次采集直接投递成多维表格行。 */
  id: z.number().default(0),
  agentId: z.number(),
  url: z.string().max(2000),
  schemaNote: z.string().max(2000),
  data: z.record(z.string(), z.unknown()).default({}),
  rows: z.array(z.record(z.string(), z.unknown())).max(500).default([]),
  screenshotKey: z.string().max(200).default(""),
  createdAt: z.string(),
});
export type RcExtractResultView = z.infer<typeof rcExtractResultSchema>;

/* ---------------------------------------------------------------- 计划任务（浏览器代理定时） */

/** 计划任务开关：enabled 到点执行；paused 不进入调度。 */
export const RC_SCHEDULE_STATUS_LABELS: Record<string, string> = {
  enabled: "已启用",
  paused: "已暂停",
};
/** 最近一次执行结果标签；空串＝还没跑过。 */
export const RC_SCHEDULE_LAST_STATUS_LABELS: Record<string, string> = {
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  skipped: "已跳过",
};

/**
 * 浏览器代理的计划任务：到点让本人某台「在线」设备按同一套会话引擎跑一个目标。
 * 绿灯闸——设备离线（插件没开）当轮跳过、不排队补跑；账号停用即自动暂停。
 */
export const rcScheduleSchema = z.object({
  id: z.number(),
  clientId: z.string(),
  deviceName: z.string(),
  title: z.string(),
  goal: z.string(),
  mode: z.string(),
  modeLabel: z.string(),
  startUrl: z.string().max(2000).default(""),
  /** 确定性动作序列的步数（0＝走 LLM 决策）。 */
  scriptSteps: z.number(),
  /** 采集产物去向（none/extract/table）：每轮重跑都按它落库，缺省只回会话。 */
  persist: z.string().default("none"),
  persistLabel: z.string().default("只回对话"),
  /** persist=table 的目标多维表格编号（0＝按 landing.tableName 定位或新建）。 */
  tableId: z.number().default(0),
  /** 落表口径（表名 / 表头 / 幂等锚）：定时重跑靠 dedupBy 做到不产生重复行。 */
  landing: rcLandingSpecSchema.default({ tableName: "", fields: [], dedupBy: [] }),
  model: z.string(),
  maxSteps: z.number(),
  /** scheduled＝定时一次；recurring＝周期重复。 */
  scheduleType: z.string(),
  scheduleTypeLabel: z.string(),
  scheduleConfig: z.record(z.string(), z.unknown()).default({}),
  /** 下一次执行时刻（ISO）；定时一次跑完即置空。 */
  scheduledAt: z.string().nullable(),
  status: z.string(),
  statusLabel: z.string(),
  lastRunAt: z.string().nullable(),
  lastStatus: z.string(),
  lastStatusLabel: z.string(),
  lastError: z.string(),
  /** 最近一次执行产生的会话 id（0＝无）。 */
  lastSessionId: z.number(),
  runCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RcScheduleView = z.infer<typeof rcScheduleSchema>;

/* ---------------------------------------------------------------- 代理语义层工具名 */

/**
 * 「Agent 语义层」工具（供外部 MCP 客户端也能用同一套浏览器代理）。
 * 浏览器侧会话已有 rc* 一组；这里补一层的名字固定，契约、MCP 目录、插件提示词共用。
 */
export const RC_AGENT_TOOL_NAMES = [
  "browser_agent_start",
  "browser_agent_status",
  "browser_agent_result",
  "browser_agent_stop",
  "browser_extract",
  "browser_collect_to_table",
  "browser_skill_list",
  "browser_skill_run",
] as const;
export type RcAgentToolName = (typeof RC_AGENT_TOOL_NAMES)[number];

/**
 * 这八个工具的 MCP 参数：走专用业务字段，不走通用 read_data / write_data。
 * 设备用 client_id 指定（不给就取本人唯一在线的绿灯设备）；会话生命周期用 session_id。
 */
export const browserMcpToolArgs = {
  browser_agent_start: z
    .object({
      goal: z.string().trim().min(1).max(1000),
      client_id: z.string().trim().max(64).optional(),
      mode: z.enum(RC_AGENT_MODES).default("act"),
      start_url: z.string().trim().max(2000).optional(),
      max_steps: z.number().int().min(1).max(60).optional(),
    })
    .strict(),
  browser_agent_status: z
    .object({ session_id: z.number().int().positive() })
    .strict(),
  browser_agent_result: z
    .object({ session_id: z.number().int().positive() })
    .strict(),
  browser_agent_stop: z
    .object({ session_id: z.number().int().positive() })
    .strict(),
  browser_extract: z
    .object({
      instruction: z.string().trim().min(1).max(1000),
      client_id: z.string().trim().max(64).optional(),
      start_url: z.string().trim().max(2000).optional(),
      schema_note: z.string().trim().max(2000).optional(),
    })
    .strict(),
  browser_collect_to_table: z
    .object({
      goal: z.string().trim().min(1).max(1000),
      client_id: z.string().trim().max(64).optional(),
      start_url: z.string().trim().max(2000).optional(),
      /** 期望表头（不填＝由 Agent 从页面重复结构推断后再确认）。 */
      fields: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(40),
            key: z.string().trim().max(40).optional(),
            type: z.string().trim().max(16).optional(),
          }),
        )
        .max(40)
        .optional(),
      /** 目标表编号（不填＝按 table_name 找到已有表，找不到就新建）。 */
      table_id: z.number().int().nonnegative().optional(),
      table_name: z.string().trim().max(60).optional(),
      /** 幂等锚列（按名或列键均可）：命中同值则更新而非重复插入。 */
      dedup_by: z.array(z.string().trim().max(40)).max(5).optional(),
      max_steps: z.number().int().min(1).max(60).optional(),
    })
    .strict(),
  browser_skill_list: z
    .object({
      kind: z.enum(["all", "personal", "site"]).default("all"),
      keyword: z.string().trim().max(100).optional(),
    })
    .strict(),
  browser_skill_run: z
    .object({
      skill: z.string().trim().min(1).max(120),
      goal: z.string().trim().max(1000).optional(),
      client_id: z.string().trim().max(64).optional(),
      start_url: z.string().trim().max(2000).optional(),
    })
    .strict(),
};
export type BrowserMcpToolName = keyof typeof browserMcpToolArgs;

/** 工具文案：与其余 MCP 工具同源，`tools/list` 与界面「MCP Server」页读这一份。 */
export const browserMcpTools: Record<
  RcAgentToolName,
  {
    title: string;
    description: string;
    annotations: Record<string, boolean>;
  }
> = {
  browser_agent_start: {
    title: "浏览器代理·发起",
    description:
      "在用户本机「在线（绿灯）」的 Chrome 设备上发起一次浏览器代理会话：给一个自然语言目标，云端逐步决策、插件在用户已登录的页面里执行。client_id 不给就取本人唯一在线的设备；有多台在线时会回列表要求指定。mode 为 act（操作）/ crawl（顺链接批量抓取）/ extract（抽取结构化）。会话异步执行，用 browser_agent_status / browser_agent_result 查进展，browser_agent_stop 可随时停。",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  browser_agent_status: {
    title: "浏览器代理·进度",
    description:
      "查看一次浏览器代理会话的当前状态：状态标签、已执行步数/上限、结束原因与错误。只读，不需要设备在线。",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  browser_agent_result: {
    title: "浏览器代理·结果",
    description:
      "取一次浏览器代理会话的完整结果：逐步回放（闭集动作、模型理由、页面观测、截图地址）与收尾原因。抽取类目标的结构化数据也在各步的观测里。只读。",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  browser_agent_stop: {
    title: "浏览器代理·停止",
    description:
      "停止一次浏览器代理会话：会话置为已取消，未执行的在途指令作废。用户说「停下那个浏览器操作」时调用。",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  browser_extract: {
    title: "浏览器代理·抽取",
    description:
      "按抽取要求（instruction，可附 schema_note 说明字段口径）在在线设备上发起一次「抽取」会话，把页面内容整理成结构化结果。与 browser_agent_start 的差别是能力档固定为 extract；结果用 browser_agent_result 取。",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  browser_collect_to_table: {
    title: "浏览器代理·采集落表",
    description:
      "在在线设备上把一页可见清单采集成结构化行并原子落到多维表格：fields 声明表头（不声明则由代理从页面重复结构推断），table_id 指定已有表、table_name 按名找表或新建，dedup_by 给幂等锚列（命中同值更新而非重复插入）。收割到的行全程按结构化通道写入，不由模型复述；发起后用 browser_agent_status / browser_agent_result 跟进，结果里回表编号与新建/更新/跳过行数。",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  browser_skill_list: {
    title: "浏览器技能·列表",
    description:
      "列出本账号沉淀的浏览器技能（personal 个人偏好/工作流、site 站点操作知识），返回名称、种类、归属站点、说明与启用状态。技能正文是长期知识，Agent 每次决策都会读到；需要正文时按名称调 browser_skill_run 或到插件技能库查看。只读。",
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  browser_skill_run: {
    title: "浏览器技能·运行",
    description:
      "用一条已沉淀的技能在在线设备上跑一次浏览器任务：按技能名（或技能编号）取该技能正文作为目标（给了 goal 就用 goal），技能的归属站点作为起始地址（也可用 start_url 覆盖）。返回发起的会话编号，用 browser_agent_status / browser_agent_result 跟进。",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
};

/** 插件 → 平台的工具调用（走设备令牌；只允许工具目录内已登记的写类工具，默认受授权闸约束）。 */
export const rcToolCallSchema = z.object({
  /** 契约工具名（如 Mark... / Help_search / wf__<id> / Rpa_accounts）。 */
  tool: z.string().min(1).max(120),
  args: z.record(z.string(), z.unknown()).default({}),
  /** 幂等锚：同一会话内同 code 只执行一次。 */
  code: z.string().max(64).default(""),
});
export type RcToolCall = z.infer<typeof rcToolCallSchema>;

export const rcToolResultSchema = z.object({
  tool: z.string(),
  ok: z.boolean(),
  /** 结果 JSON（被授权闸拦下时为草案：needsGrant=true）。 */
  data: z.record(z.string(), z.unknown()).default({}),
  errorMessage: z.string().max(500).default(""),
  needsGrant: z.boolean().default(false),
  elapsedMs: z.number().int().nonnegative().default(0),
});
export type RcToolResult = z.infer<typeof rcToolResultSchema>;

/* ---------------------------------------------------------------- 侧边栏 Agent（插件侧循环） */

/**
 * 插件侧 Agent 循环（hybrid）：编排在插件（贴页面、延迟低），
 * 模型与工具在平台（复用模型广场的 Key/计量/时长卡与授权闸）。
 * 每一步插件把「目标 + 页面观测 + 最近历史」发到 `/decide`，平台调一次 LLM 回一个动作。
 */
/**
 * 能力缺口：Agent 判定「这个目标要用到插件当前没有的动作/取值方式」时的结构化说明。
 * 会话里以 kind=gap 的消息留痕，同时可回报到平台后台（RpaChrome_reportGap）作为能力补齐的输入。
 */
export const rcAgentGapSchema = z.object({
  /** 缺口一句话（如「需要把拖拽滑块也当作一种动作」）。 */
  need: z.string().min(1).max(200),
  /** 为什么现有动作做不到。 */
  why: z.string().max(500).default(""),
  /** 发生缺口时的站点 hostname（空＝与站点无关）。 */
  site: z.string().max(200).default(""),
  /** 已经尝试过哪些动作与参数（避免重复建议）。 */
  attempted: z.array(z.string().max(120)).max(10).default([]),
  /** 期望插件补什么（动作名/参数形态/取值方式）。 */
  want: z.string().max(300).default(""),
});
export type RcAgentGap = z.infer<typeof rcAgentGapSchema>;

/**
 * 缺口回报入参：插件（设备令牌）与页面（会话号）都能提交。
 * 落 `RpaChromeMessage.kind='gap'`，平台后台按 site + need 聚合，作为能力补齐的输入清单。
 */
export const rcGapReportBodySchema = rcAgentGapSchema.extend({
  /** 关联的代理会话（0＝无会话上下文，例如用户在侧边栏手动反馈）。 */
  sessionId: z.number().int().nonnegative().default(0),
  /** 关联的插件会话（云端指令通道）。 */
  agentId: z.number().int().nonnegative().default(0),
  /** 回报插件版本（空＝服务端按设备台账补）。 */
  version: z.string().max(24).default(""),
});
export type RcGapReportBody = z.infer<typeof rcGapReportBodySchema>;

export const rcAgentDecideBodySchema = z.object({
  goal: z.string().min(1).max(1000),
  /** act | crawl | extract（与 RC_AGENT_MODES 同源）。 */
  mode: z.string().max(16).default("act"),
  /** 选中的模型（空 = 跟随本账号默认模型）。 */
  modelKey: z.string().max(128).default(""),
  /** 从 0 起的步序号（第 N+1 步）。 */
  stepIndex: z.number().int().nonnegative().default(0),
  /** 当前页面的「页面地图」观测（可见交互元素清单 + 截断正文）。 */
  observation: z.record(z.string(), z.unknown()).default({}),
  /** 最近几步的执行历史（文本行）。 */
  history: z.string().max(4000).default(""),
  /** 用户是否已确认过本轮要执行的操作（首次动作前的「先确认再执行」闸）。 */
  confirmed: z.boolean().default(false),
  /**
   * 插件侧会话台账编号（RpaChromeAgent.id，0＝还没落台账）。
   * 能力缺口回报按它挂到同一段对话里，侧边栏「已回报」与对话回放对得上。
   */
  agentId: z.number().int().nonnegative().default(0),
  /** 用户随目标附上的数字资产（已存 OSS，key 可在结果里引用）。 */
  attachments: z
    .array(z.object({ name: z.string().max(200), key: z.string().max(400) }))
    .max(10)
    .default([]),
  /**
   * 结果留存档位（none | extract | table，见 RC_PERSIST_MODES）：
   * 决定 harvest/extract 成功后平台是否自动落抽取台账或直接落多维表格。缺省 none＝只在会话里展示。
   */
  persist: z.enum(RC_PERSIST_MODES).default("none"),
  /** persist=table 时的目标表（0 或缺省＝由 Agent 先调 DataTable_landRows 时再定/新建）。 */
  tableId: z.number().int().nonnegative().default(0),
});
export type RcAgentDecideBody = z.infer<typeof rcAgentDecideBodySchema>;

/** 连跑队列上限（N14=A）：一次规划 2–8 步连跑，超出即截断（宁可多回一次大脑，也不放任长串盲跑）。 */
export const RC_AGENT_QUEUE_MAX = 8;

/**
 * 连跑队列里一步执行完要成立的「预期」（N14=A：偏离即回脑）。
 * 只给这四种只读断言，不引入新的执行面；四个都空视为没给预期（该步不做校验）。
 */
export const rcAgentExpectSchema = z.object({
  /** 地址应包含该片段（SPA 跳转后用）。 */
  urlIncludes: z.string().max(200).default(""),
  /** 页面正文应出现该文字。 */
  text: z.string().max(200).default(""),
  /** 该选择器应至少命中一个元素。 */
  selector: z.string().max(300).default(""),
  /** 该选择器应不再命中（弹层关闭、加载遮罩消失等）。 */
  gone: z.string().max(300).default(""),
});
export type RcAgentExpect = z.infer<typeof rcAgentExpectSchema>;

/**
 * 意图队列里的一步：动作 + 可选预期 + 可选敏感确认。
 * 上一步的预期不成立即判「偏离」，立刻停下回大脑重新规划——丢掉的只是剩余计划，已做的动作不回滚。
 */
export const rcAgentPlanStepSchema = z.object({
  action: z.record(z.string(), z.unknown()),
  thought: z.string().max(1000).default(""),
  needsConfirm: z.boolean().default(false),
  expect: rcAgentExpectSchema.nullable().default(null),
});
export type RcAgentPlanStep = z.infer<typeof rcAgentPlanStepSchema>;

export const rcAgentDecisionSchema = z.object({
  thought: z.string().default(""),
  /** 浏览器闭集动作（与 RC_ACTIONS 同源）；与 tool 二选一。 */
  action: z.record(z.string(), z.unknown()).nullable().default(null),
  /** 平台工具调用（与 rcToolCallSchema 同形）；与 action 二选一。 */
  tool: rcToolCallSchema.nullable().default(null),
  /**
   * 意图队列（N14=A）：一次规划 2–8 步连跑，逐步用 expect 校验，偏离即回脑。
   * 给队列时 action 为空——插件按队列顺序执行并逐步校验，不再每步一问大脑。
   */
  queue: z.array(rcAgentPlanStepSchema).max(RC_AGENT_QUEUE_MAX).default([]),
  /** 连跑计划的整体思路（一句话），侧边栏展示成「连跑 N 步」说明。 */
  plan: z.string().max(500).default(""),
  /** 敏感动作：需本人在侧边栏确认后才执行（账号设置 confirmSensitive 开启时）。 */
  needsConfirm: z.boolean().default(false),
  /** 目标已达成或无法继续时给出结束原因。 */
  finishReason: z.string().default(""),
  /** 待用户确认的操作说明：非空时插件展示成确认卡，点「确认执行」后才继续动作。 */
  confirm: z.string().default(""),
  /** Agent 直接回复用户（纯提问/闲聊/要规划、不需要操作页面时给出，插件展示成对话卡）。 */
  reply: z.string().default(""),
  /** Agent 反问澄清（信息不足时给出，插件展示成追问卡）。 */
  question: z.string().default(""),
  /** 实际选用的模型（回显，供界面展示）。 */
  model: z.string().default(""),
  /**
   * 能力缺口：当前插件能力集做不到这个目标时给出（不落错误、不硬凑）。
   * 插件据此在侧边栏展示「能力缺口」卡，并可一键回报给平台（RpaChrome_reportGap）。
   */
  gap: rcAgentGapSchema.nullable().default(null),
});
export type RcAgentDecision = z.infer<typeof rcAgentDecisionSchema>;

/** Agent 引导信息：模型清单 + 额度 + 安全设置（侧边栏 Header / 敏感闸用）。 */
export const rcAgentBootstrapSchema = z.object({
  models: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      modelKey: z.string(),
    }),
  ),
  /** 当前余额（积分）。 */
  balance: z.number(),
  /** 积分换算率（1 元 = N 积分）。 */
  rate: z.number(),
  defaultModelKey: z.string().default(""),
  limits: z.object({
    maxSteps: z.number(),
    stepTimeoutSeconds: z.number(),
    sessionTimeoutSeconds: z.number(),
    blockedHosts: z.array(z.string()).default([]),
    confirmSensitive: z.boolean().default(true),
  }),
  /**
   * 本设备插件支持的动作原语（由心跳能力指纹折算）：
   * 侧边栏能力面板据此展示「这台插件会什么」，也用于把不支持的动作提前拦下。
   */
  primitives: z.array(z.string()).default([]),
  /** 插件上报的版本与协议指纹（面板展示用）。 */
  caps: rcDeviceCapsSchema.nullable().default(null),
});
export type RcAgentBootstrap = z.infer<typeof rcAgentBootstrapSchema>;

/** 缺口回报的台账视图（平台后台 / 侧边栏「已回报」列表）。 */
export const rcGapViewSchema = z.object({
  id: z.number(),
  userId: z.string(),
  site: z.string(),
  need: z.string(),
  why: z.string(),
  attempted: z.array(z.string()),
  want: z.string(),
  version: z.string(),
  sessionId: z.number(),
  createdAt: z.string(),
});
export type RcGapView = z.infer<typeof rcGapViewSchema>;
