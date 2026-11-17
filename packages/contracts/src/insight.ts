import { z } from "zod";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});
const passthroughBody = z.object({}).passthrough();
const idParam = z.object({ id: z.string() });

/**
 * 智慧分析板块契约（全域内容热点分析 + 流行趋势分析）。
 *
 * 设计口径见 `docs/智慧分析板块设计方案.md`：
 * - 采集不新建爬虫服务，行数据全程走既有 `DataTable_landRows`（预置多维表格「热点内容」）；
 * - 热点是聚合产物而非采集产物，可删可重算；
 * - 一切行/资产/订阅按账号（ownerUserId）归属，与 bigdata / bi / data-table 同口径。
 */

// ---------- 枚举 ----------

export const INSIGHT_PLATFORMS = [
  "xiaohongshu",
  "toutiao",
  "douyin",
  "shipinhao",
] as const;
export type InsightPlatform = (typeof INSIGHT_PLATFORMS)[number];
export const INSIGHT_PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: "小红书",
  toutiao: "头条",
  douyin: "抖音",
  shipinhao: "视频号",
};

/** 电商数据源平台：趋势·商业选品的采集源头只在这个闭集里选（页面对象决定打开列表页还是店铺页）。 */
export const INSIGHT_ECOM_PLATFORMS = [
  "taobao",
  "tmall",
  "jd",
  "pinduoduo",
  "1688",
  "douyinxiao",
] as const;
export type InsightEcomPlatform = (typeof INSIGHT_ECOM_PLATFORMS)[number];
export const INSIGHT_ECOM_PLATFORM_LABELS: Record<string, string> = {
  taobao: "淘宝",
  tmall: "天猫",
  jd: "京东",
  pinduoduo: "拼多多",
  "1688": "1688",
  douyinxiao: "抖音小店",
};

// ---------- 采集目的 / 数据源对象 / 页面对象（采集先行：先配目的与源头，再采集）----------

export const INSIGHT_PURPOSES = [
  "hotspot",
  "trend-element",
  "trend-color",
  "trend-commercial",
] as const;
export type InsightPurpose = (typeof INSIGHT_PURPOSES)[number];
export const INSIGHT_PURPOSE_LABELS: Record<InsightPurpose, string> = {
  hotspot: "内容互动热度",
  "trend-element": "趋势·元素",
  "trend-color": "趋势·色彩",
  "trend-commercial": "趋势·商业选品",
};

/**
 * 采集配置归属：两个工具用同一套采集模式与方法，但配置按采集目的分治——
 * hotspot 归「全域内容热点分析」，trend 归「流行趋势分析」，两侧的读写各只碰自己那组目的。
 */
export const INSIGHT_COLLECTION_SCOPES = ["hotspot", "trend"] as const;
export type InsightCollectionScope = (typeof INSIGHT_COLLECTION_SCOPES)[number];
export const INSIGHT_COLLECTION_SCOPE_LABELS: Record<
  InsightCollectionScope,
  string
> = {
  hotspot: "全域内容热点分析",
  trend: "流行趋势分析",
};

export const INSIGHT_PURPOSE_SCOPES: Record<
  InsightPurpose,
  InsightCollectionScope
> = {
  hotspot: "hotspot",
  "trend-element": "trend",
  "trend-color": "trend",
  "trend-commercial": "trend",
};

/** 某个归属下的采集目的闭集（后端校验、前端下拉、跨侧拒写共用这一份）。 */
export function insightPurposesInScope(
  scope: InsightCollectionScope,
): InsightPurpose[] {
  return INSIGHT_PURPOSES.filter((purpose) => INSIGHT_PURPOSE_SCOPES[purpose] === scope);
}

export function insightScopeOfPurpose(
  purpose: InsightPurpose,
): InsightCollectionScope {
  return INSIGHT_PURPOSE_SCOPES[purpose];
}

/** 数据源对象类型：平台闭集页面对象 / 电商页面 / 自定义网站源头。 */
export const INSIGHT_SOURCE_KINDS = [
  "platformSearch",
  "topic",
  "creator",
  "ecomList",
  "shopPage",
  "customSite",
] as const;
export type InsightSourceKind = (typeof INSIGHT_SOURCE_KINDS)[number];
export const INSIGHT_SOURCE_KIND_LABELS: Record<InsightSourceKind, string> = {
  platformSearch: "平台搜索页",
  topic: "平台话题页",
  creator: "博主主页",
  ecomList: "电商搜索列表页",
  shopPage: "电商店铺页",
  customSite: "自定义网站源头",
};

/**
 * 数据源类型归属：社媒三类只服务热点分析，电商两类只服务流行趋势分析，
 * 自定义网站源头两侧都能配（同一个泛化包，按采集目的落不同目的的记录）。
 */
export const INSIGHT_SOURCE_KIND_SCOPES: Record<
  InsightSourceKind,
  InsightCollectionScope[]
> = {
  platformSearch: ["hotspot"],
  topic: ["hotspot"],
  creator: ["hotspot"],
  ecomList: ["trend"],
  shopPage: ["trend"],
  customSite: ["hotspot", "trend"],
};

export function insightKindsInScope(
  scope: InsightCollectionScope,
): InsightSourceKind[] {
  return INSIGHT_SOURCE_KINDS.filter((kind) =>
    INSIGHT_SOURCE_KIND_SCOPES[kind].includes(scope),
  );
}

/** 页面对象是显式枚举（不是自由文本），采集包按它决定打开路径与字段抽取规则。 */
export const INSIGHT_PAGE_OBJECTS = [
  "searchPage",
  "topicPage",
  "creatorPage",
  "listPage",
  "shopPage",
  "categoryRanking",
] as const;
export type InsightPageObject = (typeof INSIGHT_PAGE_OBJECTS)[number];
export const INSIGHT_PAGE_OBJECT_LABELS: Record<InsightPageObject, string> = {
  searchPage: "搜索页",
  topicPage: "话题页",
  creatorPage: "博主主页",
  listPage: "列表页",
  shopPage: "店铺页",
  categoryRanking: "类目榜页",
};

/** URL 模板占位符：{keyword} 由数据源关键词替换；{page} 由翻页替换。 */
export const INSIGHT_URL_TEMPLATE_PLACEHOLDERS = ["{keyword}", "{page}"] as const;

export type InsightUrlTemplateIssue = { field: string; message: string };

/**
 * URL 模板校验（前后端共用，单一口径）：协议必须是 http/https、不得含 `..` 或盘符、
 * 去掉空白后非空。自定义网站源头（customSite）还必须带占位符——没有变化的输入，
 * 采集就退化成固定抓一屏，"源头"没了意义。
 */
export function validateInsightUrlTemplate(
  template: string,
  customSite = false,
): InsightUrlTemplateIssue[] {
  const issues: InsightUrlTemplateIssue[] = [];
  const value = String(template ?? '').trim();
  if (!value) {
    issues.push({ field: 'urlTemplate', message: 'URL 模板不能为空' });
    return issues;
  }
  if (!/^https?:\/\//i.test(value)) {
    issues.push({
      field: 'urlTemplate',
      message: 'URL 模板必须以 http:// 或 https:// 开头',
    });
  }
  if (/\.\./.test(value) || /^[a-zA-Z]:/.test(value)) {
    issues.push({
      field: 'urlTemplate',
      message: 'URL 模板不得包含 ".." 或盘符',
    });
  }
  if (customSite && !INSIGHT_URL_TEMPLATE_PLACEHOLDERS.some((ph) => value.includes(ph))) {
    issues.push({
      field: 'urlTemplate',
      message: `自定义网站源头必须带占位符（${INSIGHT_URL_TEMPLATE_PLACEHOLDERS.join(' / ')}）`,
    });
  }
  return issues;
}

export const INSIGHT_STAGES = [
  "emerging",
  "rising",
  "peak",
  "declining",
] as const;
export type InsightStage = (typeof INSIGHT_STAGES)[number];
export const INSIGHT_STAGE_LABELS: Record<string, string> = {
  emerging: "萌芽",
  rising: "上升",
  peak: "峰值",
  declining: "衰退",
};

export const INSIGHT_METRIC_TYPES = [
  "interaction",
  "visual",
  "commercial",
] as const;
export type InsightMetricType = (typeof INSIGHT_METRIC_TYPES)[number];

export const INSIGHT_FREQUENCIES = ["hourly", "daily", "weekly"] as const;
export type InsightFrequency = (typeof INSIGHT_FREQUENCIES)[number];
export const INSIGHT_FREQUENCY_LABELS: Record<string, string> = {
  hourly: "小时级",
  daily: "每日",
  weekly: "每周",
};

/** 采集批次的执行通道：host＝BotBuddy 主机托管窗口，local＝本机浏览器代理；其余为人工/导入留痕。 */
export const INSIGHT_RUN_CHANNELS = ["host", "local", "manual", "import"] as const;
export const INSIGHT_RUN_CHANNEL_LABELS: Record<string, string> = {
  host: "BotBuddy 主机",
  local: "浏览器代理",
  manual: "手动下发",
  import: "外部导入",
};

/** 批次状态沿用通道侧口径（queued/dispatched/succeeded/failed/skipped），不自造词。 */
export const INSIGHT_RUN_STATUS_LABELS: Record<string, string> = {
  queued: "已排队",
  dispatched: "执行中",
  succeeded: "成功",
  failed: "失败",
  skipped: "跳过",
};

// ---------- 预置多维表格列模板（单一实现点，后端建表 / 前端渲染共用，仿 BIGDATA_DATASETS）----------

export type InsightColumn = {
  fieldKey: string;
  name: string;
  fieldType: "text" | "number" | "date" | "url" | "select" | "json";
  /** select 列的可选项。 */
  choices?: string[];
  /** 是否作为 landRows 幂等锚（去重键）。 */
  dedup?: boolean;
};

export const INSIGHT_PRESET_TABLES = {
  /** 采集回来的原始内容行（一条内容一行），采集通道只管往里投，热点引擎从这里读。 */
  content: {
    key: "content",
    tableName: "热点内容",
    tableDescription:
      "「全域内容热点分析」的原始内容承载表：每行一条公开可访问内容（笔记/文章），字段来自订阅采集与手动导入，内容链接列用于跨任务去重。",
    columns: [
      { fieldKey: "title", name: "标题", fieldType: "text" },
      { fieldKey: "text", name: "正文摘要", fieldType: "text" },
      { fieldKey: "url", name: "内容链接", fieldType: "url", dedup: true },
      { fieldKey: "platform", name: "平台", fieldType: "text" },
      { fieldKey: "author", name: "作者", fieldType: "text" },
      { fieldKey: "topic", name: "话题标签", fieldType: "text" },
      { fieldKey: "keywords", name: "关键词", fieldType: "text" },
      { fieldKey: "publish_at", name: "发布时间", fieldType: "text" },
      { fieldKey: "likes", name: "点赞", fieldType: "number" },
      { fieldKey: "comments", name: "评论", fieldType: "number" },
      { fieldKey: "collects", name: "收藏", fieldType: "number" },
      { fieldKey: "shares", name: "转发", fieldType: "number" },
      { fieldKey: "emotion", name: "情感", fieldType: "text" },
      { fieldKey: "subscription_id", name: "来源订阅", fieldType: "number" },
      { fieldKey: "source_id", name: "来源数据源", fieldType: "number" },
      { fieldKey: "run_id", name: "采集批次", fieldType: "number" },
      { fieldKey: "channel", name: "采集通道", fieldType: "text" },
      { fieldKey: "collected_at", name: "采集时间", fieldType: "text" },
    ],
  } satisfies {
    key: string;
    tableName: string;
    tableDescription: string;
    columns: InsightColumn[];
  },
  /** 电商选品观测：趋势工具的采集承载表（价格/销量展示值/评价数/上新时间）。 */
  ecommerce: {
    key: "ecommerce",
    tableName: "电商选品观测",
    tableDescription:
      "「流行趋势分析」的电商采集承载表：每行一条商品列表/详情可见值（价格、销量展示值、评价数、上新时间、店铺），字段来自数据源采集与手动导入，商品链接列用于跨任务去重。销量为页面公开展示值，仅供业务参考。",
    columns: [
      { fieldKey: "title", name: "商品标题", fieldType: "text" },
      { fieldKey: "url", name: "商品链接", fieldType: "url", dedup: true },
      { fieldKey: "price", name: "价格", fieldType: "number" },
      { fieldKey: "sales_display", name: "销量(展示值)", fieldType: "text" },
      { fieldKey: "review_count", name: "评价数", fieldType: "number" },
      { fieldKey: "listed_at", name: "上新时间", fieldType: "text" },
      { fieldKey: "shop", name: "店铺", fieldType: "text" },
      { fieldKey: "keyword", name: "来源关键词", fieldType: "text" },
      { fieldKey: "source_id", name: "来源数据源", fieldType: "number" },
      { fieldKey: "run_id", name: "采集批次", fieldType: "number" },
      { fieldKey: "channel", name: "采集通道", fieldType: "text" },
      { fieldKey: "collected_at", name: "采集时间", fieldType: "text" },
    ],
  } satisfies {
    key: string;
    tableName: string;
    tableDescription: string;
    columns: InsightColumn[];
  },
  /** 热点引擎产出的热点事件台账（系统列 upsert，用户自定义列永不覆盖）。 */
  hotspotLedger: {
    key: "hotspotLedger",
    tableName: "热点追踪台账",
    tableDescription:
      "「全域内容热点分析」的选题跟进台账：热点引擎按当期结果 upsert 系统列，用户可自由加「选题优先级 / 负责人 / 跟进状态」等业务列，同步不会覆盖。",
    columns: [
      { fieldKey: "hotspot_name", name: "热点名称", fieldType: "text" },
      { fieldKey: "subscription", name: "所属订阅", fieldType: "text" },
      { fieldKey: "platforms", name: "覆盖平台", fieldType: "text" },
      { fieldKey: "stage", name: "阶段", fieldType: "text" },
      { fieldKey: "hot_score", name: "热点得分", fieldType: "number" },
      { fieldKey: "growth_rate", name: "增速", fieldType: "number" },
      { fieldKey: "content_count", name: "内容数", fieldType: "number" },
      { fieldKey: "sentiment", name: "情感分布", fieldType: "text" },
      { fieldKey: "keywords", name: "关联关键词", fieldType: "text" },
      { fieldKey: "synced_at", name: "同步时间", fieldType: "text" },
    ],
  },
} as const;

export type InsightPresetTableKey = keyof typeof INSIGHT_PRESET_TABLES;

/** 幂等锚列（landRows 去重键）。 */
export function insightDedupKeys(table: InsightPresetTableKey): string[] {
  return INSIGHT_PRESET_TABLES[table].columns
    .filter((column) => "dedup" in column && column.dedup)
    .map((column) => column.fieldKey);
}

// ---------- 采集 SKILL 包（单一来源：打包脚本 + 后端派发指令 + 前端下载清单共用）----------

export type InsightCollectionSkillKey = "hotspot" | "trend" | "site";

export type InsightCollectionSkill = {
  key: InsightCollectionSkillKey;
  slug: string;
  version: string;
  title: string;
  description: string;
  /** 落表目标（INSIGHT_PRESET_TABLES 的 key）。 */
  targetTable: "content" | "ecommerce";
  /** 幂等锚列键。 */
  dedupKeys: string[];
  /** 包内 field-mapping.json：站点字段 → 表列键。 */
  fieldMapping: Record<string, string>;
  /** 前端静态目录下的 zip 文件名（frontend/public/downloads/）。 */
  zipFile: string;
  /** SKILL.md 正文（frontmatter + 步骤），打包脚本原样写进 zip。 */
  skillMarkdown: string;
};

/**
 * 三个采集包：
 * - hotspot：平台闭集（搜索页/话题页/博主主页）→ 热点内容表；
 * - trend：电商闭集（搜索列表页/店铺页）→ 电商选品观测表；
 * - site：自定义网站源头（URL 模板 + 页面对象）→ 由站点技能兜底，识别不出如实回报。
 *
 * 版本号与 zip 文件名一致（`insight-collect-<key>-v<version>.zip`），
 * 升级采集包必须同时升 version 与 zipFile，守卫脚本会断言两者一致。
 */
export const INSIGHT_COLLECTION_SKILLS: Record<
  InsightCollectionSkillKey,
  InsightCollectionSkill
> = {
  hotspot: {
    key: 'hotspot',
    slug: 'insight-collect-hotspot',
    version: '1.0.0',
    title: '全域内容热点采集包',
    description:
      '按数据源对象在平台搜索页/话题页/博主主页收割公开内容，幂等写入「热点内容」表。',
    targetTable: 'content',
    dedupKeys: ['url'],
    fieldMapping: {
      标题: 'title',
      正文摘要: 'text',
      链接: 'url',
      作者: 'author',
      话题: 'topic',
      关键词: 'keywords',
      点赞: 'likes',
      评论: 'comments',
      收藏: 'collects',
      发布时间: 'publish_at',
    },
    zipFile: 'insight-collect-hotspot-v1.0.0.zip',
    skillMarkdown: [
      '---',
      'name: insight-collect-hotspot',
      'description: 按数据源对象在平台搜索页/话题页/博主主页收割公开内容的标题、正文摘要、互动数、作者、话题标签，并幂等写入「热点内容」表。',
      '---',
      '',
      '# 采集任务：热点内容',
      '',
      '本技能由平台定时调用（BotBuddy 主机托管窗口 / 本机浏览器代理）。按参数执行，不抓登录后可见的私有内容与私信。',
      '',
      '## 参数',
      '- source：数据源对象（平台 + 页面对象 + 关键词/账号）',
      '- keyword：关键词',
      '- limit：单次收割上限',
      '- tableId：目标表（热点内容）',
      '- dedupBy：幂等锚（内容链接）',
      '',
      '## 步骤',
      '1. 按页面对象打开目标站点：searchPage＝平台搜索页（关键词 {keyword}）、topicPage＝话题页、creatorPage＝博主主页。',
      '2. 等待列表加载完成，必要时滚动到上限。',
      '3. 逐条收割字段：标题 / 正文摘要 / 链接 / 作者 / 话题标签 / 点赞 / 评论 / 收藏 / 发布时间。',
      '4. 用 DataTable_landRows 写入目标表，字段映射见同目录 field-mapping.json，按 dedupBy 去重（已存在行不重复写入）。',
      '5. 回报本轮实收行数、去重行数与失败原因。',
      '',
      '## 红线',
      '- 只采公开可见内容，不存视频原文件。',
      '- 采集失败如实回报，不编造行数据。',
    ].join('\n'),
  },
  trend: {
    key: 'trend',
    slug: 'insight-collect-trend',
    version: '1.0.0',
    title: '电商选品趋势采集包',
    description:
      '从电商数据源（搜索列表页/店铺页）收割商品的价格、销量展示值、评价数、上新时间，写入「电商选品观测」表。',
    targetTable: 'ecommerce',
    dedupKeys: ['url'],
    fieldMapping: {
      商品标题: 'title',
      商品链接: 'url',
      价格: 'price',
      销量: 'sales_display',
      评价数: 'review_count',
      上新时间: 'listed_at',
      店铺: 'shop',
    },
    zipFile: 'insight-collect-trend-v1.0.0.zip',
    skillMarkdown: [
      '---',
      'name: insight-collect-trend',
      'description: 从电商数据源（搜索列表页/店铺页/类目榜页）收割商品的价格、销量展示值、评价数、上新时间，幂等写入「电商选品观测」表。',
      '---',
      '',
      '# 采集任务：电商选品观测',
      '',
      '## 参数',
      '- source：数据源对象（电商平台 + 页面对象 + 关键词/店铺）',
      '- keyword：关键词',
      '- limit：单次收割上限',
      '- tableId：目标表（电商选品观测）',
      '- dedupBy：幂等锚（商品链接）',
      '',
      '## 步骤',
      '1. 按页面对象打开目标站点：ecomList＝搜索列表页（关键词 {keyword}）、shopPage＝店铺页、listPage＝类目列表页。',
      '2. 等待列表加载完成，必要时滚动到上限。',
      '3. 逐条收割字段：商品标题 / 商品链接 / 价格 / 销量展示值 / 评价数 / 上新时间 / 店铺。',
      '4. 用 DataTable_landRows 写入目标表，字段映射见同目录 field-mapping.json，按 dedupBy 去重。',
      '5. 回报本轮实收行数、去重行数与失败原因。',
      '',
      '## 红线',
      '- 销量/评价只取页面公开可见值，不当作精准经营依据。',
      '- 采集失败如实回报，不编造行数据。',
    ].join('\n'),
  },
  site: {
    key: 'site',
    slug: 'insight-collect-site',
    version: '1.0.0',
    title: '自定义网站源头采集包',
    description:
      '从用户配置的网站源头（域名 + URL 模板 + 页面对象）收割列表内容；站点技能优先，识别不出列表时如实回报。',
    targetTable: 'content',
    dedupKeys: ['url'],
    fieldMapping: {
      标题: 'title',
      链接: 'url',
      正文摘要: 'text',
      时间: 'publish_at',
    },
    zipFile: 'insight-collect-site-v1.0.0.zip',
    skillMarkdown: [
      '---',
      'name: insight-collect-site',
      'description: 从用户配置的网站源头（域名 + URL 模板 + 页面对象）收割列表内容，站点技能优先，识别不出列表时如实回报。',
      '---',
      '',
      '# 采集任务：自定义网站源头',
      '',
      '## 参数',
      '- source：网站源头（站点 URL + 页面对象 + URL 模板）',
      '- keyword：URL 模板里的 {keyword} 占位符取值',
      '- limit：单次收割上限',
      '- tableId：目标表',
      '- dedupBy：幂等锚（内容链接）',
      '',
      '## 步骤',
      '1. 按 URL 模板打开目标页（把 {keyword} / {page} 替换为实际取值），协议必须为 http/https。',
      '2. 先看该站点是否有站点技能（site skill）：有则按站点技能的选择器与字段映射执行。',
      '3. 没有站点技能时做结构识别：找列表容器与条目（标题 + 链接）。',
      '4. 识别不出列表 → 回报「该页面结构未知，请补站点技能或换页面对象」，并给出「从当前页一键建数据源 / 补站点技能」入口；**不要硬猜选择器**。',
      '5. 字段映射见同目录 field-mapping.json，用 DataTable_landRows 写入目标表，按 dedupBy 去重。',
      '6. 回报本轮实收行数、去重行数与失败原因。',
      '',
      '## 红线',
      '- 只采用户显式配置的站点、且登录态下可访问的公开页面。',
      '- 不做全网扫描，不绕过登录与验证。',
    ].join('\n'),
  },
} as const;

/**
 * 由数据源对象与关键词拼出「采集指令」（自包含：SKILL 包 + 数据源 + 参数 + 目标表 + 幂等锚）。
 * 后端派发周期任务与「立即手动采集」深链共用这一个函数，避免文案两处手写走偏。
 */
export function insightCollectionGoal(
  skill: InsightCollectionSkill,
  source: {
    kind: string;
    platform: string;
    siteUrl: string;
    pageObject: string;
    urlTemplate: string;
    keyword: string;
    name: string;
  },
  keyword: string,
  tableId: number,
  dedupKeys: string[],
): string {
  const target = skill.targetTable === 'content' ? '「热点内容」表' : '「电商选品观测」表';
  const origin =
    source.kind === 'customSite' && source.siteUrl
      ? `网站源头 ${source.siteUrl}`
      : `${source.platform}（${source.pageObject || source.kind}）`;
  return [
    `按采集包 ${skill.slug}（v${skill.version}）执行采集：`,
    `数据源＝${source.name}（${origin}）`,
    `关键词＝${keyword}`,
    `目标＝${target}（tableId ${tableId}，按 ${dedupKeys.join('/')} 去重，幂等写回）`,
    `单次上限＝见订阅配额，采集失败如实回报。`,
  ].join('\n');
}

// ---------- 打分默认权重与阈值（contracts 声明、后台可配）----------

export const INSIGHT_SCORE_DEFAULTS = {
  weights: { interaction: 0.4, growth: 0.3, diffusion: 0.2, volume: 0.1 },
  // 阶段判定阈值（增速百分比 & 分位）
  thresholds: {
    emergingGrowthPct: 80,
    emergingBasePercentile: 30,
    risingGrowthMinPct: 20,
    risingGrowthMaxPct: 80,
    peakPercentile: 90,
    decliningGrowthPct: -20,
  },
  timeWindowDays: 90,
} as const;

// ---------- DTO ----------

const subscriptionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    /** 采集目的（无目的不采集）：闭集见 INSIGHT_PURPOSES。 */
    purpose: z.string(),
    /** 关联的数据源对象 id 集合。 */
    sourceIds: z.array(z.number()),
    platforms: z.array(z.string()),
    keywords: z.array(z.string()),
    topics: z.array(z.string()),
    creators: z.array(z.string()),
    frequency: z.string(),
    excludeWords: z.array(z.string()),
    minEngagement: z.number(),
    alertGrowthPct: z.number(),
    status: z.string(),
    scheduleIds: z.array(z.number()),
    lastRunAt: z.string(),
    contentCount: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

/** 采集数据源对象（含采集目的与站点源头）。 */
const collectionSourceSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    purpose: z.string(),
    purposeLabel: z.string(),
    kind: z.string(),
    kindLabel: z.string(),
    platform: z.string(),
    siteUrl: z.string(),
    pageObject: z.string(),
    pageObjectLabel: z.string(),
    urlTemplate: z.string(),
    keyword: z.string(),
    loginRequired: z.boolean(),
    siteSkillKey: z.string(),
    status: z.string(),
    lastRunAt: z.string(),
    lastRunStatus: z.string(),
    rowCount: z.number(),
    /** 该源头会派发的采集包（后端按 kind/purpose 推导，前端只展示不改写）。 */
    skillKey: z.string(),
    skillVersion: z.string(),
    targetTable: z.string(),
    createdAt: z.string(),
  })
  .passthrough();

/** 采集批次：一行一轮，关联订阅 / 数据源 / 采集包 / 执行通道。 */
const collectionRunSchema = z
  .object({
    id: z.number(),
    subscriptionId: z.number(),
    subscriptionName: z.string(),
    sourceId: z.number(),
    sourceName: z.string(),
    skillKey: z.string(),
    skillVersion: z.string(),
    channel: z.string(),
    status: z.string(),
    rowCount: z.number(),
    insertedCount: z.number(),
    dedupCount: z.number(),
    error: z.string(),
    startedAt: z.string(),
    finishedAt: z.string(),
  })
  .passthrough();

/** 采集 SKILL 包（前端下载清单）。 */
const collectionSkillSchema = z
  .object({
    key: z.string(),
    slug: z.string(),
    version: z.string(),
    title: z.string(),
    description: z.string(),
    targetTable: z.string(),
    zipFile: z.string(),
    downloadUrl: z.string(),
  })
  .passthrough();

const hotspotSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    subscriptionId: z.number(),
    subscriptionName: z.string(),
    platforms: z.array(z.string()),
    stage: z.string(),
    hotScore: z.number(),
    growthRate: z.number(),
    contentCount: z.number(),
    sentiment: z.record(z.string(), z.number()),
    keywords: z.array(z.string()),
    firstPlatform: z.string(),
    firstPublishAt: z.string(),
    windowStart: z.string(),
    windowEnd: z.string(),
    updatedAt: z.string(),
    reviewNote: z.string(),
  })
  .passthrough();

const hotspotContentSchema = z
  .object({
    rowId: z.number(),
    tableId: z.number(),
    title: z.string(),
    url: z.string(),
    platform: z.string(),
    author: z.string(),
    likes: z.number(),
    comments: z.number(),
    collects: z.number(),
    publishAt: z.string(),
    representative: z.boolean(),
  })
  .passthrough();

const metricSchema = z
  .object({
    metricKey: z.string(),
    metricType: z.string(),
    period: z.string(),
    value: z.number(),
    growthRate: z.number(),
  })
  .passthrough();

const reportSchema = z
  .object({
    id: z.number(),
    kind: z.string(),
    status: z.string(),
    assetId: z.string(),
    content: z.string(),
    error: z.string(),
    window: z.record(z.string(), z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type InsightReportRow = z.infer<typeof reportSchema>;

const settingsSchema = z
  .object({
    linkageEnabled: z.boolean(),
    contentTableId: z.number(),
    ledgerTableId: z.number(),
    ecomTableId: z.number(),
    reportWindowDays: z.number(),
    scoreConfig: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type InsightSettingsRow = z.infer<typeof settingsSchema>;

const overviewSchema = z
  .object({
    subscriptionCount: z.number(),
    activeSubscriptionCount: z.number(),
    contentCount: z.number(),
    hotspotCount: z.number(),
    /** 采集层健康度（S0）：源头有多少、启用多少、近 24h 跑了多少轮、失败多少轮。 */
    sourceCount: z.number(),
    enabledSourceCount: z.number(),
    runCount24h: z.number(),
    failedRunCount24h: z.number(),
    lastRunAt: z.string(),
    stageCounts: z.record(z.string(), z.number()),
    topTrends: z.array(metricSchema),
    deviceChannels: z
      .array(
        z
          .object({
            kind: z.string(),
            label: z.string(),
            online: z.boolean(),
          })
          .passthrough(),
      ),
    presetTables: z
      .array(
        z
          .object({
            key: z.string(),
            tableName: z.string(),
            dataTableId: z.number(),
            exists: z.boolean(),
            fieldCount: z.number(),
          })
          .passthrough(),
      ),
    ready: z.boolean(),
  })
  .passthrough();

const pageBody = <T extends z.ZodType>(item: T) =>
  envelope(
    z
      .object({
        list: z.array(item),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      })
      .passthrough(),
  );

// ---------- 端点 ----------

export const insightEndpoints = {
  Insight_overview: {
    method: "get" as const,
    path: "/enterprise/insight/hotspot/overview",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(overviewSchema),
  },
  Insight_listSubscriptions: {
    method: "get" as const,
    path: "/enterprise/insight/subscriptions",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(subscriptionSchema)),
  },
  Insight_saveSubscription: {
    method: "post" as const,
    path: "/enterprise/insight/subscriptions",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(subscriptionSchema),
  },
  Insight_removeSubscription: {
    method: "delete" as const,
    path: "/enterprise/insight/subscriptions/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number(), deleted: z.boolean() })),
  },
  Insight_toggleSubscription: {
    method: "post" as const,
    path: "/enterprise/insight/subscriptions/:id/toggle",
    params: idParam,
    query: emptyQuery,
    body: z.object({ status: z.string() }).passthrough(),
    response: envelope(subscriptionSchema),
  },
  Insight_collectNow: {
    method: "post" as const,
    path: "/enterprise/insight/subscriptions/:id/collect",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          dispatched: z.boolean(),
          reason: z.string(),
          goal: z.string(),
          entryPath: z.string(),
        })
        .passthrough(),
    ),
  },
  // ---------- 采集层（S0）：数据源对象 / 采集批次 / 采集包下载清单 ----------
  Insight_listSources: {
    method: "get" as const,
    path: "/enterprise/insight/sources",
    params: z.object({}),
    query: z.object({ purpose: z.string().optional() }).passthrough(),
    body: z.undefined(),
    response: envelope(z.array(collectionSourceSchema)),
  },
  Insight_saveSource: {
    method: "post" as const,
    path: "/enterprise/insight/sources",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(collectionSourceSchema),
  },
  Insight_removeSource: {
    method: "delete" as const,
    path: "/enterprise/insight/sources/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number(), deleted: z.boolean() })),
  },
  Insight_listRuns: {
    method: "get" as const,
    path: "/enterprise/insight/runs",
    params: z.object({}),
    query: z
      .object({
        subscriptionId: z.coerce.number().int().nonnegative().optional(),
        sourceId: z.coerce.number().int().nonnegative().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(30),
      })
      .passthrough(),
    body: z.undefined(),
    response: pageBody(collectionRunSchema),
  },
  Insight_listSkills: {
    method: "get" as const,
    path: "/enterprise/insight/skills",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(collectionSkillSchema)),
  },
  // ---------- 趋势侧采集配置（scope=trend）：与热点侧同一模式、同一实现，只按采集目的分治 ----------
  Insight_listTrendSources: {
    method: "get" as const,
    path: "/enterprise/insight/trends/sources",
    params: z.object({}),
    query: z.object({ purpose: z.string().optional() }).passthrough(),
    body: z.undefined(),
    response: envelope(z.array(collectionSourceSchema)),
  },
  Insight_saveTrendSource: {
    method: "post" as const,
    path: "/enterprise/insight/trends/sources",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(collectionSourceSchema),
  },
  Insight_removeTrendSource: {
    method: "delete" as const,
    path: "/enterprise/insight/trends/sources/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number(), deleted: z.boolean() })),
  },
  Insight_listTrendRuns: {
    method: "get" as const,
    path: "/enterprise/insight/trends/runs",
    params: z.object({}),
    query: z
      .object({
        subscriptionId: z.coerce.number().int().nonnegative().optional(),
        sourceId: z.coerce.number().int().nonnegative().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(30),
      })
      .passthrough(),
    body: z.undefined(),
    response: pageBody(collectionRunSchema),
  },
  Insight_listTrendSubscriptions: {
    method: "get" as const,
    path: "/enterprise/insight/trends/subscriptions",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(subscriptionSchema)),
  },
  Insight_saveTrendSubscription: {
    method: "post" as const,
    path: "/enterprise/insight/trends/subscriptions",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(subscriptionSchema),
  },
  Insight_removeTrendSubscription: {
    method: "delete" as const,
    path: "/enterprise/insight/trends/subscriptions/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number(), deleted: z.boolean() })),
  },
  Insight_toggleTrendSubscription: {
    method: "post" as const,
    path: "/enterprise/insight/trends/subscriptions/:id/toggle",
    params: idParam,
    query: emptyQuery,
    body: z.object({ status: z.string() }).passthrough(),
    response: envelope(subscriptionSchema),
  },
  Insight_collectTrendNow: {
    method: "post" as const,
    path: "/enterprise/insight/trends/subscriptions/:id/collect",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          dispatched: z.boolean(),
          reason: z.string(),
          goal: z.string(),
          entryPath: z.string(),
        })
        .passthrough(),
    ),
  },
  Insight_listHotspots: {
    method: "get" as const,
    path: "/enterprise/insight/hotspot/list",
    params: z.object({}),
    query: z
      .object({
        subscriptionId: z.coerce.number().int().nonnegative().optional(),
        platform: z.string().optional(),
        stage: z.string().optional(),
        window: z.string().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(30),
      })
      .passthrough(),
    body: z.undefined(),
    response: pageBody(hotspotSchema),
  },
  Insight_hotspotDetail: {
    method: "get" as const,
    path: "/enterprise/insight/hotspot/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          hotspot: hotspotSchema,
          contents: z.array(hotspotContentSchema),
        })
        .passthrough(),
    ),
  },
  Insight_listMetrics: {
    method: "get" as const,
    path: "/enterprise/insight/metrics",
    params: z.object({}),
    query: z
      .object({
        metricType: z.string().optional(),
        metricKey: z.string().optional(),
      })
      .passthrough(),
    body: z.undefined(),
    response: envelope(z.array(metricSchema)),
  },
  // 趋势（S7 前只回既有资产/指标的只读视图，未绑模型时降级为空列表不报错）
  Insight_trendsOverview: {
    method: "get" as const,
    path: "/enterprise/insight/trends/overview",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          assetCount: z.number(),
          taggedCount: z.number(),
          elementTrends: z.array(metricSchema),
          colorTrends: z.array(metricSchema),
          quadrant: z
            .array(
              z
                .object({
                  concept: z.string(),
                  interaction: z.number(),
                  commercial: z.number(),
                })
                .passthrough(),
            )
            .default([]),
          linkageEnabled: z.boolean(),
        })
        .passthrough(),
    ),
  },
  // ---------- S5 快报 / S7 资产打标 / S2 采集派发 ----------
  Insight_generateReport: {
    method: "post" as const,
    path: "/enterprise/insight/reports",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({ kind: z.string(), windowDays: z.number().optional() }).passthrough(),
    response: envelope(reportSchema),
  },
  Insight_listReports: {
    method: "get" as const,
    path: "/enterprise/insight/reports",
    params: z.object({}),
    query: z.object({ kind: z.string().optional() }).passthrough(),
    body: z.undefined(),
    response: envelope(z.array(reportSchema)),
  },
  Insight_tagAssets: {
    method: "post" as const,
    path: "/enterprise/insight/trends/tag-assets",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({ limit: z.number().optional() }).passthrough(),
    response: envelope(
      z
        .object({
          scanned: z.number(),
          tagged: z.number(),
          model: z.string(),
          mode: z.string(),
          reason: z.string(),
        })
        .passthrough(),
    ),
  },
  Insight_syncLedger: {
    method: "post" as const,
    path: "/enterprise/insight/hotspot/ledger/sync",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z
        .object({
          synced: z.number(),
          tableId: z.number(),
          url: z.string(),
          reason: z.string(),
        })
        .passthrough(),
    ),
  },
  Insight_reviewHotspot: {
    method: "post" as const,
    path: "/enterprise/insight/hotspot/:id/review",
    params: idParam,
    query: emptyQuery,
    body: z
      .object({
        action: z.string(),
        targetId: z.number().optional(),
        rowIds: z.array(z.number()).optional(),
        name: z.string().optional(),
      })
      .passthrough(),
    response: envelope(
      z
        .object({
          ok: z.boolean(),
          hotspotId: z.number(),
          reviewNote: z.string(),
          contentCount: z.number(),
        })
        .passthrough(),
    ),
  },
  Insight_getSettings: {
    method: "get" as const,
    path: "/enterprise/insight/settings",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(settingsSchema),
  },
  Insight_saveSettings: {
    method: "post" as const,
    path: "/enterprise/insight/settings",
    params: z.object({}),
    query: emptyQuery,
    body: passthroughBody,
    response: envelope(settingsSchema),
  },
};

export type InsightOverview = z.infer<typeof overviewSchema> extends {
  data: infer D;
}
  ? D
  : never;
export type InsightSubscriptionRow = z.infer<typeof subscriptionSchema>;
export type InsightCollectionSourceRow = z.infer<typeof collectionSourceSchema>;
export type InsightCollectionRunRow = z.infer<typeof collectionRunSchema>;
export type InsightCollectionSkillRow = z.infer<typeof collectionSkillSchema>;
export type InsightHotspotRow = z.infer<typeof hotspotSchema>;
export type InsightHotspotContentRow = z.infer<typeof hotspotContentSchema>;
export type InsightMetricRow = z.infer<typeof metricSchema>;
