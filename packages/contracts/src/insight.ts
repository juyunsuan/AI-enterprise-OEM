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

/** 采集批次的执行通道：host＝AWBotDSH 主机托管窗口，local＝本机浏览器代理；其余为人工/导入留痕。 */
export const INSIGHT_RUN_CHANNELS = ["host", "local", "manual", "import"] as const;
export const INSIGHT_RUN_CHANNEL_LABELS: Record<string, string> = {
  host: "AWBotDSH 主机",
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
  /**
   * 趋势标签观测：结构化打标的款式落表（一行一款式，列即六维标签），
   * 既作趋势分析的可回溯底账，也供多维表格透视/找相似直接消费。表 id 缓存于 setting.scoreConfig.wearTableId。
   */
  wearTag: {
    key: "wearTag",
    tableName: "趋势标签观测",
    tableDescription:
      "「流行趋势分析」的结构化打标落表：每行一款式，记录色彩/廓形/长度/图案/细节/材质六维标签与来源血缘（数据源/批次/通道），款式链接列用于跨任务去重。",
    columns: [
      { fieldKey: "title", name: "款式标题", fieldType: "text" },
      { fieldKey: "url", name: "款式图链接", fieldType: "url", dedup: true },
      { fieldKey: "category", name: "单品品类", fieldType: "text" },
      { fieldKey: "color_main", name: "主色", fieldType: "text" },
      { fieldKey: "color_main_hex", name: "主色HEX", fieldType: "text" },
      { fieldKey: "color_palette", name: "辅色组合", fieldType: "text" },
      { fieldKey: "silhouette", name: "廓形", fieldType: "text" },
      { fieldKey: "length", name: "长度", fieldType: "text" },
      { fieldKey: "patterns", name: "图案", fieldType: "text" },
      { fieldKey: "details", name: "细节工艺", fieldType: "text" },
      { fieldKey: "fabrics", name: "材质", fieldType: "text" },
      { fieldKey: "brand", name: "品牌店铺", fieldType: "text" },
      { fieldKey: "tag_version", name: "打标版本", fieldType: "text" },
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
      '本技能由平台定时调用（AWBotDSH 主机托管窗口 / 本机浏览器代理）。按参数执行，不抓登录后可见的私有内容与私信。',
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

// ---------- 流行趋势：时尚标签体系 v1（女装先行，词表可扩展）----------

/** 视觉标签维度：色彩 / 廓形 / 长度 / 图案 / 细节工艺 / 材质。趋势分析的原子维度。 */
export const INSIGHT_TAG_DIMENSIONS = [
  "color",
  "silhouette",
  "length",
  "pattern",
  "detail",
  "fabric",
] as const;
export type InsightTagDimension = (typeof INSIGHT_TAG_DIMENSIONS)[number];
export const INSIGHT_TAG_DIMENSION_LABELS: Record<string, string> = {
  color: "色彩",
  silhouette: "廓形",
  length: "长度",
  pattern: "图案",
  detail: "细节工艺",
  fabric: "材质",
};

/** 色彩标签带 HEX；其余维度标签就是取值本身（字符串）。 */
export type FashionTagChoice = string | { value: string; hex?: string };

const TAG_DIMENSION_SET = new Set<string>(INSIGHT_TAG_DIMENSIONS);

/**
 * 女装时尚标签体系 v1：受控词表，供结构化打标收敛（模型只能从中选，减少自由发挥）。
 * 色彩带 HEX 以便聚合到色卡；这是可版本化词表，后续按实测样本迭代扩容。
 */
export const WOMENSWEAR_TAG_TAXONOMY: Record<
  InsightTagDimension,
  FashionTagChoice[]
> = {
  color: [
    { value: "黑", hex: "#1A1A1A" },
    { value: "白", hex: "#F5F5F5" },
    { value: "灰", hex: "#9A9A9A" },
    { value: "米白", hex: "#EDE6D6" },
    { value: "驼色", hex: "#C19A6B" },
    { value: "卡其", hex: "#B7A384" },
    { value: "棕", hex: "#7B4B2A" },
    { value: "藏青", hex: "#1F2B4D" },
    { value: "雾霾蓝", hex: "#A7C4BC" },
    { value: "天蓝", hex: "#7FB2E5" },
    { value: "宝蓝", hex: "#1F4FA3" },
    { value: "墨绿", hex: "#214D36" },
    { value: "橄榄绿", hex: "#6B7A3A" },
    { value: "酒红", hex: "#7A1F2B" },
    { value: "砖红", hex: "#B14A32" },
    { value: "粉", hex: "#F2B8C6" },
    { value: "裸粉", hex: "#E4B7A2" },
    { value: "樱花粉", hex: "#F6D5DE" },
    { value: "薰衣草紫", hex: "#B9A5D0" },
    { value: "鹅黄", hex: "#F2DE9C" },
    { value: "橙", hex: "#E8863B" },
    { value: "姜黄", hex: "#C8892A" },
    { value: "银灰", hex: "#C6CBD1" },
    { value: "金", hex: "#D4AF37" },
    { value: "牛仔蓝", hex: "#4C6E92" },
    { value: "荧光绿", hex: "#9BE564" },
  ],
  silhouette: [
    "A字型","直筒","修身","廓形Oversize","茧型","X型收腰","H型","伞摆","鱼尾","垂坠","束腰","泡泡袖","落肩","垫肩","斗篷","旗袍廓形",
  ],
  length: ["超短","短款","及膝","中长","及踝","超长"],
  pattern: [
    "纯色","条纹","格纹","波点","碎花","印花","字母Logo","动物纹","扎染","渐变","提花","刺绣图案",
  ],
  detail: [
    "抽绳","褶皱","荷叶边","飘带","纽扣","拉链","镂空","流苏","拼接","撞色镶边","绑带","蝴蝶结","亮片","毛边","压褶","立领","翻领","V领","圆领","抹胸",
  ],
  fabric: [
    "棉","麻","真丝","羊毛","羊绒","醋酸","雪纺","牛仔","针织","皮革","PU","蕾丝","欧根纱","天鹅绒","涤纶","尼龙","记忆面料","摇粒绒","灯芯绒","毛呢",
  ],
};

export function insightTagDimensionLabel(dim: string): string {
  return INSIGHT_TAG_DIMENSION_LABELS[dim] ?? dim;
}

function tagChoiceValue(item: FashionTagChoice): string {
  return typeof item === "string" ? item : item.value;
}

/** 取某维度的标签取值列表（供打标 prompt 收敛与前端筛选下拉）。 */
export function insightTagValues(dim: InsightTagDimension): string[] {
  return (WOMENSWEAR_TAG_TAXONOMY[dim] || []).map(tagChoiceValue);
}

/** 色彩维度取值项（对象），带 HEX 可选。 */
export function insightColorChoices(): { value: string; hex?: string }[] {
  return WOMENSWEAR_TAG_TAXONOMY.color.filter(
    (item): item is { value: string; hex?: string } => typeof item !== "string",
  );
}

/** 色彩维度取值 → HEX 映射（色卡墙 / 热力配色用）。 */
export function insightColorHexMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of insightColorChoices()) {
    if (item.hex) map[item.value] = item.hex;
  }
  return map;
}

/** 维度标签在 InsightMetric.metricKey 里的编码约定：`<dimension>:<value>`。 */
export function insightTagMetricKey(
  dim: InsightTagDimension,
  value: string,
): string {
  return `${dim}:${value}`;
}

export function parseInsightTagMetricKey(
  key: string,
): { dimension: string; value: string } | null {
  const idx = String(key || "").indexOf(":");
  if (idx < 0) return null;
  const dimension = key.slice(0, idx);
  const value = key.slice(idx + 1);
  if (!TAG_DIMENSION_SET.has(dimension) || !value) return null;
  return { dimension, value };
}

/** 商业维度指标编码：`priceband:<区间>` / `shop:<店铺>` / `hot:<款式>`。 */
export const INSIGHT_COMMERCIAL_BANDS = [
  { key: "0-99", label: "0-99", min: 0, max: 99 },
  { key: "100-299", label: "100-299", min: 100, max: 299 },
  { key: "300-599", label: "300-599", min: 300, max: 599 },
  { key: "600-999", label: "600-999", min: 600, max: 999 },
  { key: "1000+", label: "1000+", min: 1000, max: Number.MAX_SAFE_INTEGER },
] as const;
export type InsightCommercialBand = (typeof INSIGHT_COMMERCIAL_BANDS)[number];

export function insightPriceBandOf(price: number): string {
  const value = Number.isFinite(price) ? price : 0;
  for (const band of INSIGHT_COMMERCIAL_BANDS) {
    if (value >= band.min && value <= band.max) return band.key;
  }
  return "0-99";
}

/** 结构化款式理解的 JSON 输出契约（模型侧 schema 与后端解析共用一份口径）。 */
export const WEAR_VISION_JSON_SHAPE =
  '{"category":string,"colors":[{"name":string,"hex":string}],"silhouette":string,"length":string,"patterns":[string],"details":[string],"fabrics":[string]}';

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
    autoTagEnabled: z.boolean(),
    contentTableId: z.number(),
    ledgerTableId: z.number(),
    ecomTableId: z.number(),
    wearTableId: z.number(),
    reportWindowDays: z.number(),
    deckTemplate: z.string(),
    deckBrand: z.record(z.string(), z.unknown()),
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

// ---------- 趋势分析视图 DTO（多维曲线 / 色彩 / 价格带 / 红蓝海 / 竞品 / 预测）----------

const trendPointSchema = z
  .object({ period: z.string(), value: z.number(), growthRate: z.number() })
  .passthrough();

const trendSeriesSchema = z
  .object({
    dimension: z.string(),
    value: z.string(),
    label: z.string(),
    hex: z.string(),
    share: z.number(),
    growthRate: z.number(),
    points: z.array(trendPointSchema),
  })
  .passthrough();

const priceBandSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    count: z.number(),
    share: z.number(),
    avgPrice: z.number(),
    salesIndex: z.number(),
    growthRate: z.number(),
  })
  .passthrough();

const quadrantPointSchema = z
  .object({
    concept: z.string(),
    interaction: z.number(),
    commercial: z.number(),
    growth: z.number(),
    share: z.number(),
    hint: z.string(),
  })
  .passthrough();

const competitorSchema = z
  .object({
    shop: z.string(),
    count: z.number(),
    avgPrice: z.number(),
    salesIndex: z.number(),
    hotScore: z.number(),
  })
  .passthrough();

const predictionSchema = z
  .object({
    dimension: z.string(),
    value: z.string(),
    label: z.string(),
    trend: z.string(),
    nextShare: z.number(),
    confidence: z.number(),
    note: z.string(),
  })
  .passthrough();

const trendAnalysisSchema = z
  .object({
    window: z.object({ from: z.string(), to: z.string(), days: z.number() }),
    assetCount: z.number(),
    taggedCount: z.number(),
    commercialCount: z.number(),
    series: z.array(trendSeriesSchema),
    colorTrends: z.array(trendSeriesSchema),
    priceBands: z.array(priceBandSchema),
    quadrant: z.array(quadrantPointSchema),
    competitors: z.array(competitorSchema),
    predictions: z.array(predictionSchema),
    linkageEnabled: z.boolean(),
  })
  .passthrough();

const deckSchema = z
  .object({
    id: z.number(),
    status: z.string(),
    format: z.string(),
    assetId: z.string(),
    downloadUrl: z.string(),
    slideCount: z.number(),
    error: z.string(),
    outline: z
      .array(
        z
          .object({ heading: z.string(), body: z.string() })
          .passthrough(),
      )
      .default([]),
    createdAt: z.string(),
  })
  .passthrough();

// 款式衍生（对标 POP 爆款衍生）：锚点 + 四向建议 + 可选衍生图
const deriveDirectionSchema = z
  .object({
    key: z.string(),
    title: z.string(),
    angle: z.string(),
    commentary: z.string(),
    evidence: z.array(z.string()),
  })
  .passthrough();

const deriveSchema = z
  .object({
    anchor: z.string(),
    category: z.string(),
    directions: z.array(deriveDirectionSchema),
    derivedImages: z.array(z.string()),
    note: z.string(),
  })
  .passthrough();

// 趋势数据 XLSX 导出（多工作表：元素/色彩/价格带/竞品/红蓝海/预测）
const exportSchema = z
  .object({
    format: z.string(),
    assetId: z.string(),
    downloadUrl: z.string(),
    sheets: z.array(z.string()),
    rowCount: z.number(),
    error: z.string(),
  })
  .passthrough();

// ---------- AI-FDE 实施分析（企业现状 → 可落地的 AI-FDE 实施框架）----------

/** 行业闭集：只用于选择分析基准与监管红线，不参与权限判定。 */
export const FDE_INDUSTRIES = [
  "manufacturing",
  "retail",
  "education",
  "logistics",
  "professional",
  "food",
  "marketing",
  "healthcare",
  "realestate",
  "automotive",
  "energy",
  "public",
  "agriculture",
  "hospitality",
  "finance",
  "gaming",
  "telecom",
  "other",
] as const;
export type FdeIndustry = (typeof FDE_INDUSTRIES)[number];
export const FDE_INDUSTRY_LABELS: Record<FdeIndustry, string> = {
  manufacturing: "制造业",
  retail: "零售与电商",
  education: "教育培训",
  logistics: "物流与供应链",
  professional: "专业服务（财税/法律/咨询）",
  food: "餐饮与连锁门店",
  marketing: "营销与内容",
  healthcare: "医疗健康",
  realestate: "地产与物业",
  automotive: "汽车销售与售后",
  energy: "能源与公用事业",
  public: "政府与公共服务",
  agriculture: "农业与农产品",
  hospitality: "文旅与酒店民宿",
  finance: "金融与保险",
  gaming: "游戏与互动娱乐",
  telecom: "通信与运营商",
  other: "其他行业",
};

export const FDE_COMPANY_SIZE_LABELS: Record<string, string> = {
  "1-20": "1-20 人",
  "21-100": "21-100 人",
  "101-500": "101-500 人",
  "501-2000": "501-2000 人",
  "2000+": "2000 人以上",
};
export const FDE_REVENUE_LABELS: Record<string, string> = {
  lt500w: "500 万以下",
  "500w-2000w": "500 万-2000 万",
  "2000w-1y": "2000 万-1 亿",
  "1y-5y": "1 亿-5 亿",
  gt5y: "5 亿以上",
  undecided: "暂不披露",
};
export const FDE_CUSTOMER_TYPE_LABELS: Record<string, string> = {
  b2b: "B2B（企业客户）",
  b2c: "B2C（个人消费者）",
  b2b2c: "B2B2C（平台/渠道）",
  gov: "政府或公共机构",
  mixed: "混合",
};
export const FDE_IT_TEAM_LABELS: Record<string, string> = {
  none: "没有专职 IT/数据人员",
  "1-2": "1-2 人",
  "3-10": "3-10 人",
  "10+": "10 人以上",
};
export const FDE_AI_MATURITY_LABELS: Record<string, string> = {
  none: "还没用过 AI",
  exploring: "试用过通用工具，未进入业务",
  pilot: "有单点试点，未规模化",
  scaling: "已有多个场景上线，想规模化",
};
export const FDE_BUDGET_LABELS: Record<string, string> = {
  lt20w: "20 万以下",
  "20-50w": "20-50 万",
  "50-100w": "50-100 万",
  "100-300w": "100-300 万",
  gt300w: "300 万以上",
  undecided: "未定/待申请",
};
export const FDE_TIMELINE_LABELS: Record<string, string> = {
  lt1m: "1 个月内",
  "1-3m": "1-3 个月",
  "3-6m": "3-6 个月",
  "6-12m": "6-12 个月",
  undecided: "未定",
};

export type FdeFieldControl = "text" | "textarea" | "select";
export type FdeFieldGroupKey = "basic" | "current" | "goals";
export type FdeFieldSpec = {
  key: string;
  group: FdeFieldGroupKey;
  label: string;
  hint: string;
  required: boolean;
  control: FdeFieldControl;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  options?: { value: string; label: string }[];
};

export const FDE_FIELD_GROUPS: {
  key: FdeFieldGroupKey;
  label: string;
  desc: string;
}[] = [
  {
    key: "basic",
    label: "企业画像",
    desc: "先让分析知道钱从哪里来、成本花在哪、老板每天看什么指标。",
  },
  {
    key: "current",
    label: "现状与痛点",
    desc: "描述真实流程、重复劳动、系统与数据条件；不确定的地方可以留空，报告会列为信息缺口。",
  },
  {
    key: "goals",
    label: "目标与约束",
    desc: "明确想解决什么、怎么算成功、预算与合规边界；参考资料可粘贴行业成果或内部诊断。",
  },
];

const selectOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/**
 * 提交清单的唯一事实源：前端表单、后端兜底校验、AI 提示词都读这份定义，
 * 新增/调整字段只改这里，避免三处口径漂移。
 */
export const FDE_PROFILE_FIELDS: FdeFieldSpec[] = [
  {
    key: "companyName",
    group: "basic",
    label: "企业名称",
    hint: "只用于报告标题与历史记录，不会对外公开。",
    required: true,
    control: "text",
    placeholder: "如：某某精密制造有限公司",
    maxLength: 200,
  },
  {
    key: "industry",
    group: "basic",
    label: "所属行业",
    hint: "决定行业基准、典型场景与监管红线。",
    required: true,
    control: "select",
    options: selectOptions(FDE_INDUSTRY_LABELS),
  },
  {
    key: "companySize",
    group: "basic",
    label: "员工规模",
    hint: "影响组织设计与交付节奏。",
    required: true,
    control: "select",
    options: selectOptions(FDE_COMPANY_SIZE_LABELS),
  },
  {
    key: "revenueRange",
    group: "basic",
    label: "年营收区间",
    hint: "用于判断投入产出与预算合理性，可不填。",
    required: false,
    control: "select",
    options: selectOptions(FDE_REVENUE_LABELS),
  },
  {
    key: "customerType",
    group: "basic",
    label: "客户类型",
    hint: "B2B/B2C/平台/政府会改变场景优先级与合规要求。",
    required: true,
    control: "select",
    options: selectOptions(FDE_CUSTOMER_TYPE_LABELS),
  },
  {
    key: "businessModel",
    group: "basic",
    label: "商业模式与收入公式",
    hint: "收入怎么来、成本大头在哪、老板每天看哪 3 个指标。",
    required: true,
    control: "textarea",
    rows: 4,
    placeholder:
      "如：收入 = 客户数 × 年费 + 实施服务；成本主要是交付顾问与云资源；老板每天看回款、续费率、项目毛利。",
    maxLength: 2000,
  },
  {
    key: "orgStructure",
    group: "basic",
    label: "组织与关键岗位",
    hint: "哪些部门人多、谁负责数据/IT、决策链怎么走（可选）。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：销售 40 人、交付 60 人、IT 3 人；CEO 发起，COO 分管。",
    maxLength: 1500,
  },
  {
    key: "coreProcess",
    group: "current",
    label: "核心业务流程",
    hint: "从获客/接单到交付/回款的完整链路，标出人工转抄与卡点。",
    required: true,
    control: "textarea",
    rows: 4,
    placeholder:
      "如：线索 → 报价 → 合同 → 排产 → 采购 → 生产 → 质检 → 发货 → 对账；报价与排产靠 Excel 转抄，最容易卡住。",
    maxLength: 2500,
  },
  {
    key: "painPoints",
    group: "current",
    label: "最痛的 3 个问题",
    hint: "写清发生频次、影响谁、造成什么损失；越具体越好。",
    required: true,
    control: "textarea",
    rows: 4,
    placeholder:
      "如：1）客服每天重复回答 200+ 条物流问题；2）销售报价要查 5 张表，平均 40 分钟；3）质检报告靠人工汇总，月底加班 3 天。",
    maxLength: 2500,
  },
  {
    key: "painOwners",
    group: "current",
    label: "谁最受影响",
    hint: "岗位/团队，以及他们现在怎么绕过这个问题（可选）。",
    required: false,
    control: "text",
    placeholder: "如：一线客服、区域销售、质检主管",
    maxLength: 300,
  },
  {
    key: "currentWorkaround",
    group: "current",
    label: "现在的替代做法",
    hint: "目前用人工、Excel、外包或其它工具怎么凑合（可选）。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：客服建了 30 条快捷回复；销售自己维护客户台账。",
    maxLength: 1500,
  },
  {
    key: "systems",
    group: "current",
    label: "现有系统与集成条件",
    hint: "列出 ERP/CRM/OA/MES/WMS/数据仓库等，说明能否导出、是否有 API。",
    required: true,
    control: "textarea",
    rows: 3,
    placeholder:
      "如：用友 ERP（可导出 Excel，无开放 API）、企业微信、金蝶财务；没有数据仓库。",
    maxLength: 2000,
  },
  {
    key: "dataAssets",
    group: "current",
    label: "数据资产与质量",
    hint: "有哪些数据、大概多少、存在哪里、是否准确、能否用于 AI。",
    required: true,
    control: "textarea",
    rows: 4,
    placeholder:
      "如：近 3 年订单 12 万条在 ERP；客服聊天记录在企业微信；产品资料在共享盘（版本混乱）；历史数据字段缺失约 20%。",
    maxLength: 2000,
  },
  {
    key: "itTeam",
    group: "current",
    label: "IT/数据团队",
    hint: "决定是自建、共建还是完全托管。",
    required: true,
    control: "select",
    options: selectOptions(FDE_IT_TEAM_LABELS),
  },
  {
    key: "aiMaturity",
    group: "current",
    label: "AI 应用现状",
    hint: "影响第一期是补基础还是直接上场景。",
    required: true,
    control: "select",
    options: selectOptions(FDE_AI_MATURITY_LABELS),
  },
  {
    key: "goals",
    group: "goals",
    label: "希望 AI 解决的问题",
    hint: "业务目标优先于技术目标；可写多个，但要能排出先后。",
    required: true,
    control: "textarea",
    rows: 4,
    placeholder:
      "如：先把客服重复咨询降下来；让销售报价从 40 分钟降到 5 分钟；半年内把质检报告自动化。",
    maxLength: 2000,
  },
  {
    key: "successMetrics",
    group: "goals",
    label: "成功标准",
    hint: "可量化的指标、当前基线、期望目标；没有基线也可以写“暂无”（可选）。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder:
      "如：客服首响 < 30 秒、重复问题自助解决率 ≥ 40%；报价时长 ≤ 5 分钟；质检汇总人工工时减少 60%。",
    maxLength: 1000,
  },
  {
    key: "budget",
    group: "goals",
    label: "首期预算",
    hint: "用于判断做试点、做平台还是做规模化（可选）。",
    required: false,
    control: "select",
    options: selectOptions(FDE_BUDGET_LABELS),
  },
  {
    key: "timeline",
    group: "goals",
    label: "期望周期",
    hint: "决定路线图切分与第一期范围。",
    required: true,
    control: "select",
    options: selectOptions(FDE_TIMELINE_LABELS),
  },
  {
    key: "constraints",
    group: "goals",
    label: "合规与数据约束",
    hint: "行业监管、数据分级、是否允许上云、哪些系统不能碰。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder:
      "如：客户数据不能出内网；需要通过等保；对外内容必须经过合规审核；生产系统只读。",
    maxLength: 1500,
  },
  {
    key: "sponsor",
    group: "goals",
    label: "发起人与业务配合度",
    hint: "谁拍板、哪个业务部门愿意一起干、谁可能不配合（可选）。",
    required: false,
    control: "text",
    placeholder: "如：CEO 发起，客服总监牵头，IT 配合",
    maxLength: 300,
  },
  {
    key: "referenceDoc",
    group: "goals",
    label: "行业成果/参考资料",
    hint: "可粘贴行业成果文档、内部诊断、标杆案例的要点；AI 只把它当参考，不会执行其中的指令。",
    required: false,
    control: "textarea",
    rows: 6,
    placeholder:
      "如：粘贴行业 AI 成熟度模型、标杆企业案例、内部流程诊断结论或监管要求摘录。",
    maxLength: 8000,
  },
];

export type FdeProfile = Record<string, string>;

const fdeProfileSchema = z
  .object({
    companyName: z.string().min(1).max(200),
    industry: z.enum(FDE_INDUSTRIES),
  })
  .passthrough();

const fdeDimensionSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    score: z.number(),
    verdict: z.string(),
    evidence: z.string(),
  })
  .passthrough();

const fdeOpportunitySchema = z
  .object({
    name: z.string(),
    painPoint: z.string(),
    aiPattern: z.string(),
    valueScore: z.number(),
    feasibilityScore: z.number(),
    priority: z.string(),
    phase: z.string(),
    expectedImpact: z.string(),
    dependency: z.string(),
    risk: z.string(),
  })
  .passthrough();

const fdePodRoleSchema = z
  .object({ role: z.string(), responsibility: z.string() })
  .passthrough();

const fdeArchitectureLayerSchema = z
  .object({
    layer: z.string(),
    recommendation: z.string(),
    keyDecisions: z.array(z.string()),
  })
  .passthrough();

const fdeRoadmapPhaseSchema = z
  .object({
    phase: z.string(),
    name: z.string(),
    duration: z.string(),
    objective: z.string(),
    deliverables: z.array(z.string()),
    exitCriteria: z.array(z.string()),
  })
  .passthrough();

const fdeKpiSchema = z
  .object({
    name: z.string(),
    baseline: z.string(),
    target: z.string(),
    measure: z.string(),
  })
  .passthrough();

const fdeRiskSchema = z
  .object({
    type: z.string(),
    risk: z.string(),
    mitigation: z.string(),
  })
  .passthrough();

const fdeInfoGapSchema = z
  .object({
    topic: z.string(),
    why: z.string(),
    question: z.string(),
  })
  .passthrough();

const fdeResultSchema = z
  .object({
    overview: z
      .object({
        readinessScore: z.number(),
        readinessLevel: z.string(),
        oneLineDiagnosis: z.string(),
        industryBenchmark: z.string(),
      })
      .passthrough(),
    dimensions: z.array(fdeDimensionSchema),
    opportunities: z.array(fdeOpportunitySchema),
    deferredOpportunities: z.array(fdeOpportunitySchema),
    deliveryModel: z
      .object({
        name: z.string(),
        summary: z.string(),
        pod: z.array(fdePodRoleSchema),
        cadence: z.array(z.string()),
      })
      .passthrough(),
    architecture: z.array(fdeArchitectureLayerSchema),
    dataFoundation: z.array(z.string()),
    governance: z.array(z.string()),
    roadmap: z.array(fdeRoadmapPhaseSchema),
    kpis: z.array(fdeKpiSchema),
    risks: z.array(fdeRiskSchema),
    infoGaps: z.array(fdeInfoGapSchema),
    firstWeek: z.array(z.string()),
    assumptions: z.array(z.string()),
  })
  .passthrough();
export type FdeAnalysisResult = z.infer<typeof fdeResultSchema>;
export type FdeDimension = z.infer<typeof fdeDimensionSchema>;
export type FdeOpportunity = z.infer<typeof fdeOpportunitySchema>;
export type FdeRoadmapPhase = z.infer<typeof fdeRoadmapPhaseSchema>;

const fdeAnalysisSummarySchema = z
  .object({
    id: z.number(),
    companyName: z.string(),
    industry: z.string(),
    industryLabel: z.string(),
    status: z.string(),
    readinessScore: z.number(),
    oneLineDiagnosis: z.string(),
    model: z.string(),
    error: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type InsightFdeAnalysisSummary = z.infer<
  typeof fdeAnalysisSummarySchema
>;

const fdeAnalysisSchema = fdeAnalysisSummarySchema
  .extend({
    profile: z.record(z.string(), z.string()),
    result: fdeResultSchema.nullable(),
  })
  .passthrough();
export type InsightFdeAnalysis = z.infer<typeof fdeAnalysisSchema>;

// ---------- 企业咨询（多模型战略分析）----------

/**
 * 企业咨询的工具箱：把经典战略/营销/组织分析模型做成可勾选的维度。
 * 用户提交一份企业数据，勾选本次要用的模型，模型网关逐维度产出结论，
 * 再汇总成跨模型的综合建议。目录是前后端与提示词共用的单一来源。
 */
export const CONSULTING_FRAMEWORK_GROUPS = [
  { key: "strategy", label: "战略与竞争", desc: "看赛道、位置、优势与长期打法。" },
  { key: "market", label: "市场与营销", desc: "看客户、定位、渠道与传播组合。" },
  { key: "organization", label: "组织与资源", desc: "看人才、机制与可复用的核心资源。" },
  { key: "method", label: "思维工具", desc: "用结构化方法拆解问题、重建方案。" },
] as const;
export type ConsultingFrameworkGroup =
  (typeof CONSULTING_FRAMEWORK_GROUPS)[number]["key"];

export const CONSULTING_FRAMEWORK_KEYS = [
  "bcg",
  "swot",
  "pest",
  "gsm",
  "valueChain",
  "space",
  "fiveForces",
  "trout",
  "marketing4p",
  "marketing4c",
  "marketing4r",
  "mckinsey",
  "firstPrinciples",
  "yijing",
  "hr",
  "resources",
] as const;
export type ConsultingFrameworkKey =
  (typeof CONSULTING_FRAMEWORK_KEYS)[number];

export type ConsultingFrameworkSpec = {
  key: ConsultingFrameworkKey;
  group: ConsultingFrameworkGroup;
  label: string;
  desc: string;
};

export const CONSULTING_FRAMEWORKS = [
  {
    key: "bcg",
    group: "strategy",
    label: "波士顿矩阵（BCG）",
    desc: "按市场增长率与相对市场份额，把业务/产品分为明星、金牛、问题与瘦狗，决定投入与退出。",
  },
  {
    key: "swot",
    group: "strategy",
    label: "SWOT分析",
    desc: "梳理优势、劣势、机会与威胁，并给出 SO/WO/ST/WT 组合策略。",
  },
  {
    key: "pest",
    group: "strategy",
    label: "PEST分析",
    desc: "从政治、经济、社会、技术（含环境与法律）看宏观环境的机会与约束。",
  },
  {
    key: "gsm",
    group: "strategy",
    label: "大战略矩阵（GSM）",
    desc: "以市场增长与竞争地位定象限，选择市场开发、市场渗透、产品开发、多元化或收缩等大战略。",
  },
  {
    key: "valueChain",
    group: "strategy",
    label: "价值链分析（VCA）",
    desc: "拆解主要活动与支持活动，定位真正创造价值与成本优势的环节。",
  },
  {
    key: "space",
    group: "strategy",
    label: "SPACE矩阵",
    desc: "用财务优势、竞争优势、环境稳定性与产业优势四个维度定战略姿态（进取/保守/防御/竞争）。",
  },
  {
    key: "fiveForces",
    group: "strategy",
    label: "波特五力分析",
    desc: "评估现有竞争、新进入者、替代品、供应商与买方议价力，判断行业吸引力。",
  },
  {
    key: "trout",
    group: "market",
    label: "特劳特定位分析",
    desc: "在客户心智中找差异化位置：品类、竞争参照、定位语与信任状。",
  },
  {
    key: "marketing4p",
    group: "market",
    label: "营销管理 4Ps",
    desc: "从产品、价格、渠道、促销四要素设计营销组合。",
  },
  {
    key: "marketing4c",
    group: "market",
    label: "营销管理 4Cs",
    desc: "从顾客、成本、便利、沟通四要素重构以客户为中心的营销组合。",
  },
  {
    key: "marketing4r",
    group: "market",
    label: "营销管理 4Rs",
    desc: "从关联、反应、关系、回报四要素设计长期客户经营。",
  },
  {
    key: "mckinsey",
    group: "method",
    label: "麦肯锡咨询方法",
    desc: "用议题树、MECE、假设驱动与金字塔原理拆解问题并形成结论。",
  },
  {
    key: "firstPrinciples",
    group: "method",
    label: "第一性原理",
    desc: "回到基本事实与物理/经济约束，去掉行业类比，重建解法。",
  },
  {
    key: "yijing",
    group: "method",
    label: "易经分析",
    desc: "以卦象、时位与变爻作决策启发，识别时机、位置与风险，结论仅作思考框架。",
  },
  {
    key: "hr",
    group: "organization",
    label: "人力资源分析",
    desc: "盘组织、人才、绩效、激励与人效，判断组织能力能否支撑战略。",
  },
  {
    key: "resources",
    group: "organization",
    label: "企业资源分析",
    desc: "盘点有形、无形与人力资源，用 VRIO 判断哪些资源能形成持续优势。",
  },
] as const satisfies readonly ConsultingFrameworkSpec[];

export const CONSULTING_FRAMEWORK_LABELS: Readonly<Record<string, string>> =
  Object.fromEntries(
    CONSULTING_FRAMEWORKS.map((item) => [item.key, item.label]),
  );

/** 可画象限图的模型：给矩阵点标出横纵轴含义；没有坐标的模型不展示图。 */
export const CONSULTING_FRAMEWORK_AXES: Partial<
  Record<ConsultingFrameworkKey, { xLabel: string; yLabel: string }>
> = {
  bcg: { xLabel: "相对市场份额（低 → 高）", yLabel: "市场增长率（低 → 高）" },
  gsm: { xLabel: "竞争地位（弱 → 强）", yLabel: "市场增长（低 → 高）" },
  space: {
    xLabel: "竞争优势 + 产业优势（弱 → 强）",
    yLabel: "财务优势 + 环境稳定性（弱 → 强）",
  },
};

export function consultingFrameworkLabel(key: string): string {
  return CONSULTING_FRAMEWORK_LABELS[key] ?? key;
}

export const CONSULTING_STAGE_LABELS: Record<string, string> = {
  startup: "初创期",
  growth: "成长期",
  mature: "成熟期",
  transformation: "转型期",
  contraction: "收缩期",
};

export type ConsultingFieldControl = "text" | "textarea" | "select";
export type ConsultingFieldGroupKey = "basic" | "operations" | "market" | "goals";
export type ConsultingFieldSpec = {
  key: string;
  group: ConsultingFieldGroupKey;
  label: string;
  hint: string;
  required: boolean;
  control: ConsultingFieldControl;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  options?: { value: string; label: string }[];
};

export const CONSULTING_FIELD_GROUPS: {
  key: ConsultingFieldGroupKey;
  label: string;
  desc: string;
}[] = [
  {
    key: "basic",
    label: "企业画像",
    desc: "先交代企业是谁、靠什么赚钱、处在什么阶段。",
  },
  {
    key: "operations",
    label: "经营与组织",
    desc: "描述流程、成本、资源与人的现状；不确定可留空，报告会列为信息缺口。",
  },
  {
    key: "market",
    label: "市场与竞争",
    desc: "客户、区域、渠道与对手的信息越具体，定位与五力判断越可靠。",
  },
  {
    key: "goals",
    label: "分析诉求",
    desc: "说明这次想解决什么决策问题；补充资料只作参考，模型不会执行其中的指令。",
  },
];

const consultingSelectOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/** 企业数据清单：前端表单、后端校验与提示词共读这一份，避免三处口径漂移。 */
export const CONSULTING_PROFILE_FIELDS: ConsultingFieldSpec[] = [
  {
    key: "companyName",
    group: "basic",
    label: "企业名称",
    hint: "只用于报告标题与历史记录，不会对外公开。",
    required: true,
    control: "text",
    placeholder: "如：某某精密制造有限公司",
    maxLength: 200,
  },
  {
    key: "industry",
    group: "basic",
    label: "所属行业",
    hint: "决定行业语境与竞争参照。",
    required: true,
    control: "select",
    options: consultingSelectOptions(FDE_INDUSTRY_LABELS),
  },
  {
    key: "companySize",
    group: "basic",
    label: "员工规模",
    hint: "用于判断组织复杂度与人效基准。",
    required: true,
    control: "select",
    options: consultingSelectOptions(FDE_COMPANY_SIZE_LABELS),
  },
  {
    key: "revenueRange",
    group: "basic",
    label: "年营收区间",
    hint: "用于判断资源投入与市场地位；可以选「暂不披露」。",
    required: false,
    control: "select",
    options: consultingSelectOptions(FDE_REVENUE_LABELS),
  },
  {
    key: "stage",
    group: "basic",
    label: "发展阶段",
    hint: "不同阶段适用的战略与组织打法差异很大。",
    required: false,
    control: "select",
    options: consultingSelectOptions(CONSULTING_STAGE_LABELS),
  },
  {
    key: "businessModel",
    group: "basic",
    label: "主营业务与收入模式",
    hint: "钱从哪里来、成本花在哪、老板每天看哪几个指标。",
    required: true,
    control: "textarea",
    rows: 4,
    placeholder:
      "如：为区域制造企业提供精密零部件，收入=客户订单×单价，毛利 22%，主要成本为原材料与人工；老板最关注交付准时率与回款周期。",
    maxLength: 2000,
  },
  {
    key: "products",
    group: "operations",
    label: "产品/服务与客户",
    hint: "卖什么、卖给谁、客户为什么买。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：3 条产品线，A 线占营收 60%，主要客户为整车厂与一级供应商。",
    maxLength: 2000,
  },
  {
    key: "coreProcess",
    group: "operations",
    label: "核心业务流程",
    hint: "从获客到交付回款的主链路，以及最容易卡住的环节。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：报价 → 订单评审 → 排产 → 采购 → 生产 → 质检 → 发运 → 对账回款。",
    maxLength: 2000,
  },
  {
    key: "costStructure",
    group: "operations",
    label: "成本结构与盈利水平",
    hint: "主要成本项、毛利率与现金流压力。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：原材料 55%、人工 20%、制造费用 10%，净利率 5%，应收账款周期 90 天。",
    maxLength: 2000,
  },
  {
    key: "resources",
    group: "operations",
    label: "核心资源与能力",
    hint: "品牌、技术、渠道、供应链、资金、资质等；说明哪些是别人难复制的。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：自有工艺专利 12 项、区域客户关系深、柔性小批量交付能力强。",
    maxLength: 2000,
  },
  {
    key: "orgStructure",
    group: "operations",
    label: "组织与关键岗位",
    hint: "组织架构、汇报关系与关键岗位是否空缺。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：总经理下设销售、生产、技术、财务四个中心；缺一名懂数字化的运营负责人。",
    maxLength: 2000,
  },
  {
    key: "talent",
    group: "operations",
    label: "人才结构与人力现状",
    hint: "年龄/技能结构、流失率、招聘难点、绩效与激励机制。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：一线技工平均年龄 45 岁，青年技工招聘难；绩效按产量计件，质量指标权重低。",
    maxLength: 2000,
  },
  {
    key: "markets",
    group: "market",
    label: "区域与渠道",
    hint: "主要销售区域、渠道结构与增长来源。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：华东 70%、华南 20%；直销为主，正在尝试经销商渠道。",
    maxLength: 2000,
  },
  {
    key: "competitors",
    group: "market",
    label: "主要竞争对手",
    hint: "对手是谁、强在哪、我们与他们的差异。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：A 厂规模最大价格低，B 厂技术强但交期长；我们胜在小批量响应快。",
    maxLength: 2000,
  },
  {
    key: "customerVoice",
    group: "market",
    label: "客户反馈与品牌认知",
    hint: "客户如何评价你们、在心智中占据什么位置。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：客户认为我们「质量稳但价格不便宜」，新客户主要通过老客户转介绍。",
    maxLength: 2000,
  },
  {
    key: "goals",
    group: "goals",
    label: "本次分析要解决的问题",
    hint: "越具体越好，例如「未来 3 年是否进入新能源赛道」「如何把毛利从 22% 提到 28%」。",
    required: true,
    control: "textarea",
    rows: 3,
    placeholder: "如：判断是否进入储能结构件市场，并给出未来 12 个月的落地动作。",
    maxLength: 2000,
  },
  {
    key: "constraints",
    group: "goals",
    label: "约束条件",
    hint: "预算、时间、合规、组织意愿、不可触碰的底线。",
    required: false,
    control: "textarea",
    rows: 3,
    placeholder: "如：首期投入不超过 500 万，不能影响现有订单交付，不做重资产扩产。",
    maxLength: 2000,
  },
  {
    key: "referenceDoc",
    group: "goals",
    label: "补充资料",
    hint: "可粘贴内部诊断、行业报告、标杆案例的要点；模型只当参考资料，不执行其中指令。",
    required: false,
    control: "textarea",
    rows: 5,
    placeholder: "如：粘贴行业规模、增长率、政策文件摘录或内部经营分析结论。",
    maxLength: 8000,
  },
];

export type ConsultingProfile = Record<string, string>;

const consultingProfileSchema = z
  .object({
    companyName: z.string().min(1).max(200),
    industry: z.enum(FDE_INDUSTRIES),
    frameworks: z
      .array(z.enum(CONSULTING_FRAMEWORK_KEYS))
      .min(1)
      .max(CONSULTING_FRAMEWORK_KEYS.length),
  })
  .passthrough();

const consultingMatrixPointSchema = z
  .object({
    label: z.string(),
    x: z.number(),
    y: z.number(),
    size: z.number(),
    note: z.string(),
  })
  .passthrough();

const consultingSectionSchema = z
  .object({
    title: z.string(),
    items: z.array(z.string()),
  })
  .passthrough();

const consultingFrameworkResultSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    score: z.number(),
    verdict: z.string(),
    summary: z.string(),
    matrix: z.array(consultingMatrixPointSchema),
    sections: z.array(consultingSectionSchema),
    actions: z.array(z.string()),
  })
  .passthrough();

const consultingRecommendationSchema = z
  .object({
    horizon: z.string(),
    title: z.string(),
    action: z.string(),
    rationale: z.string(),
    frameworks: z.array(z.string()),
    kpi: z.string(),
    risk: z.string(),
  })
  .passthrough();

const consultingCrossInsightSchema = z
  .object({
    title: z.string(),
    detail: z.string(),
    frameworks: z.array(z.string()),
  })
  .passthrough();

const consultingRiskSchema = z
  .object({ risk: z.string(), mitigation: z.string() })
  .passthrough();

const consultingInfoGapSchema = z
  .object({ topic: z.string(), question: z.string() })
  .passthrough();

const consultingResultSchema = z
  .object({
    overview: z
      .object({
        oneLineSummary: z.string(),
        overallScore: z.number(),
        stage: z.string(),
        focus: z.string(),
      })
      .passthrough(),
    frameworks: z.array(consultingFrameworkResultSchema),
    crossInsights: z.array(consultingCrossInsightSchema),
    recommendations: z.array(consultingRecommendationSchema),
    risks: z.array(consultingRiskSchema),
    infoGaps: z.array(consultingInfoGapSchema),
    assumptions: z.array(z.string()),
  })
  .passthrough();
export type ConsultingAnalysisResult = z.infer<typeof consultingResultSchema>;
export type ConsultingFrameworkResult = z.infer<
  typeof consultingFrameworkResultSchema
>;
export type ConsultingRecommendation = z.infer<
  typeof consultingRecommendationSchema
>;

const consultingAnalysisSummarySchema = z
  .object({
    id: z.number(),
    companyName: z.string(),
    industry: z.string(),
    industryLabel: z.string(),
    frameworkKeys: z.array(z.string()),
    frameworkLabels: z.array(z.string()),
    status: z.string(),
    overallScore: z.number(),
    oneLineSummary: z.string(),
    model: z.string(),
    error: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
export type InsightConsultingAnalysisSummary = z.infer<
  typeof consultingAnalysisSummarySchema
>;

const consultingAnalysisSchema = consultingAnalysisSummarySchema
  .extend({
    profile: z.record(z.string(), z.string()),
    result: consultingResultSchema.nullable(),
  })
  .passthrough();
export type InsightConsultingAnalysis = z.infer<
  typeof consultingAnalysisSchema
>;

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
  // 趋势多维分析视图（专业看板数据源）：曲线 / 色彩 / 价格带 / 红蓝海 / 竞品 / 预测
  Insight_trendAnalysis: {
    method: "get" as const,
    path: "/enterprise/insight/trends/analysis",
    params: z.object({}),
    query: z
      .object({
        windowDays: z.coerce.number().int().positive().max(365).default(90),
        dimension: z.string().optional(),
        platform: z.string().optional(),
        keyword: z.string().optional(),
      })
      .passthrough(),
    body: z.undefined(),
    response: envelope(trendAnalysisSchema),
  },
  // AI 结构化多页趋势报告（PPTX 等）：工具调用 AI 直接生成，非 AWBotDSH 采集端
  Insight_generateDeck: {
    method: "post" as const,
    path: "/enterprise/insight/trends/deck",
    params: z.object({}),
    query: emptyQuery,
    body: z
      .object({
        windowDays: z.number().optional(),
        format: z.string().optional(),
        template: z.string().optional(),
        brandName: z.string().optional(),
      })
      .passthrough(),
    response: envelope(deckSchema),
  },
  // 款式衍生：以锚点（关键词/单品/资产）为中心，AI 出配色焕新·细节衍生·材质替换·廓形调整四向建议
  Insight_deriveStyle: {
    method: "post" as const,
    path: "/enterprise/insight/trends/derive",
    params: z.object({}),
    query: emptyQuery,
    body: z
      .object({
        anchor: z.string(),
        category: z.string().optional(),
        imageUrl: z.string().optional(),
        windowDays: z.number().optional(),
        withImages: z.boolean().optional(),
      })
      .passthrough(),
    response: envelope(deriveSchema),
  },
  // 趋势数据导出 XLSX（多工作表）
  Insight_trendExport: {
    method: "post" as const,
    path: "/enterprise/insight/trends/export",
    params: z.object({}),
    query: emptyQuery,
    body: z
      .object({ windowDays: z.number().optional(), dimension: z.string().optional() })
      .passthrough(),
    response: envelope(exportSchema),
  },
  // ---------- S5 快报 / S7 资产打标 / S2 采集派发 ----------
  Insight_generateReport: {    method: "post" as const,
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
  // AI-FDE 实施分析：提交企业现状 → 统一模型网关产出实施框架 → 落账号历史。
  Insight_fdeAnalyze: {
    method: "post" as const,
    path: "/enterprise/insight/fde/analyze",
    params: z.object({}),
    query: emptyQuery,
    body: fdeProfileSchema,
    response: envelope(fdeAnalysisSchema),
  },
  Insight_listFdeAnalyses: {
    method: "get" as const,
    path: "/enterprise/insight/fde/analyses",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(fdeAnalysisSummarySchema)),
  },
  Insight_fdeAnalysisDetail: {
    method: "get" as const,
    path: "/enterprise/insight/fde/analyses/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(fdeAnalysisSchema),
  },
  Insight_removeFdeAnalysis: {
    method: "delete" as const,
    path: "/enterprise/insight/fde/analyses/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number(), deleted: z.boolean() })),
  },
  // 企业咨询：提交企业数据 + 勾选分析模型 → 模型网关逐维度产出 → 综合建议，报告按账号留存。
  Insight_consultingAnalyze: {
    method: "post" as const,
    path: "/enterprise/insight/consulting/analyze",
    params: z.object({}),
    query: emptyQuery,
    body: consultingProfileSchema,
    response: envelope(consultingAnalysisSchema),
  },
  Insight_listConsultingAnalyses: {
    method: "get" as const,
    path: "/enterprise/insight/consulting/analyses",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(consultingAnalysisSummarySchema)),
  },
  Insight_consultingAnalysisDetail: {
    method: "get" as const,
    path: "/enterprise/insight/consulting/analyses/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(consultingAnalysisSchema),
  },
  Insight_removeConsultingAnalysis: {
    method: "delete" as const,
    path: "/enterprise/insight/consulting/analyses/:id",
    params: idParam,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ id: z.number(), deleted: z.boolean() })),
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
