import { isDomainOpened, openedTypes } from "../lib/provider-categories";
import type { EnterpriseMe } from "../lib/session";
import { isPersonalSubject } from "../lib/subject";

export type EnterpriseRoute = {
  path?: string;
  name?: string;
  icon?: string;
  type?: "group";
  hideInMenu?: boolean;
  domain?: string;
  routes?: EnterpriseRoute[];
};

export type AdminGroupKey = "people" | "operation" | "billing" | "capability" | "system";

export type AdminGroup = {
  key: AdminGroupKey;
  name: string;
  icon: string;
};

export type AdminSection = {
  key: string;
  name: string;
  icon: string;
  desc: string;
  /** 侧栏大分类（平台数据总览并入驾驶舱，所有板块都归属分组）。 */
  group: AdminGroupKey;
};

/**
 * 平台管理后台 = 独立平台（`/admin`）：板块是**侧栏菜单项 + 子路由**（不再用页面内页签），
 * 菜单、顶栏标题、页面 hero 文案同源，新增板块只改这一处。
 */
export const ADMIN_PATH_PREFIX = "/admin";

/** 侧栏大分类，顺序即菜单顺序；板块顺序由 `ADMIN_SECTIONS` 内的排列决定。 */
export const ADMIN_GROUPS: AdminGroup[] = [
  { key: "people", name: "用户与服务商", icon: "peoples" },
  { key: "operation", name: "业务运营监管", icon: "audit" },
  { key: "billing", name: "计费与商品", icon: "pay-circle" },
  { key: "capability", name: "能力与安全", icon: "safety" },
  { key: "system", name: "系统与内容", icon: "setting" },
];

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    key: "users",
    name: "注册用户",
    icon: "team",
    desc: "本系统已识别的全部账号：用户名、昵称、邮箱、账号状态。",
    group: "people",
  },
  {
    key: "enterprises",
    name: "企业用户",
    icon: "bank",
    desc: "已通过企业信息认证的用户（企业 / 个体工商户主体）。",
    group: "people",
  },
  {
    key: "provider-applications",
    name: "服务商备案",
    icon: "file-done",
    desc: "服务商备案申请审核：通过后自动获得服务商角色，即可开展对应类目的业务服务。",
    group: "people",
  },
  {
    key: "providers",
    name: "服务商管理",
    icon: "peoples",
    desc: "已通过备案的服务商与其服务类型资质：可逐项停用 / 恢复（通过即代表该类目资源可对外展示；停用则其资源同步下线并拦截该类型新建业务）。",
    group: "people",
  },
  {
    key: "capabilities",
    name: "服务商能力开通",
    icon: "bolt",
    desc: "服务商提交的财税自动化付费开通申请审核；企业维度的开通 / 关闭与企享云账号匹配统一在「财税管理」处理。",
    group: "people",
  },
  {
    key: "flex",
    name: "灵活用工",
    icon: "team",
    desc: "「灵工发薪」板块的平台级启停（默认启用；资源由服务商备案通过即展示，无需资源级平台审核）。",
    group: "operation",
  },
  {
    key: "contracts",
    name: "签约监管",
    icon: "contract",
    desc: "全部签约台账：企业、服务商、类目、期限与状态；平台管理员可解除生效中的签约。",
    group: "operation",
  },
  {
    key: "supply",
    name: "供销网络监管",
    icon: "network",
    desc: "服务站、商品订货与服务预约单的全平台监管总览。",
    group: "operation",
  },
  {
    key: "marketing-livecode",
    name: "活码监管",
    icon: "qrcode",
    desc: "全平台活码清单：归属账号、当前入口域名与累计扫码；发现违规内容可下架，落地页立即显示「链接已停用」。",
    group: "operation",
  },
  {
    key: "community",
    name: "创意社区",
    icon: "audit",
    desc: "社区工作流审核与推荐，推荐后给发布者积分（规则可配）。",
    group: "operation",
  },
  {
    key: "video-templates",
    name: "视频模版社区",
    icon: "play",
    desc: "视频模版社区的平台级开关：是否补充展示 AIworkin 平台模版、手动 / 定时同步策略与最近一次同步结果。",
    group: "operation",
  },
  {
    key: "tax-admin",
    name: "财税管理",
    icon: "audit",
    desc: "企享云报税 API Key 账号池与税号匹配：新增账号、给企业税号匹配账号，并审核服务商提交的付费开通申请。",
    group: "operation",
  },
  {
    key: "geo",
    name: "GEO管理设置",
    icon: "search",
    desc: "监管每周 GEO 自动采集任务量：本周计划 / 实际完成（含周日未跑完顺延次日）与逐项目明细。采集平台 API Key 由每个账号在「营销工具 → GEO-AI引擎优化」里配自己的，后台看不到也不能替别人配置。",
    group: "operation",
  },
  {
    key: "geo-site",
    name: "独立站管理",
    icon: "global",
    desc: "国际独立站平台侧配置：域名访问总开关、平台子域与 CNAME 目标、自定义域名台账（复检 / 解绑）、回源自检与计费容量脚本策略。",
    group: "operation",
  },
  {
    key: "circle-admin",
    name: "圈子社区管理",
    icon: "peoples",
    desc: "圈子社区平台侧：板块开放、默认审核口径、建圈/发帖上限与社区停服；社区内容由账号负责人（社区管理员）自治。",
    group: "operation",
  },
  {
    key: "points",
    name: "积分与充值",
    icon: "pay-circle",
    desc: "汇率与充值档位、注册/邀请奖励、赠送限额与风控；模块价目与用量、账户调整与充值订单。",
    group: "billing",
  },
  {
    key: "service-packages",
    name: "服务套餐",
    icon: "gift",
    desc: "官方服务套餐目录与平台整合交付：按业务板块上架套餐（人民币价 + 按汇率换算的积分价），企业积分直购后由平台主持企业与多家优质服务商签约兑现；支持预绑服务商自动发起、逐项匹配、更换主体、部分退款/整单退款；限购按企业，不参与交付周期与到期管理。",
    group: "billing",
  },
  {
    key: "model-plaza",
    name: "模型广场",
    icon: "appstore",
    desc: "模型广场的平台上架目录与上游通道：维护模型名称、厂商、计费单价与可用端点，从上游一键拉取差异并上架；用户侧按量扣分，对外提供 OpenAI 兼容网关。",
    group: "billing",
  },
  {
    key: "entitlements",
    name: "权益配额",
    icon: "credential",
    desc: "套餐目录与配额项：定义每个套餐包含的席位 / 存储 / 调用额度，并给组织分配套餐查看当前权益与已用量。",
    group: "billing",
  },
  {
    key: "features",
    name: "功能治理",
    icon: "safety",
    desc: "功能目录开关（关闭即拦菜单与接口）、Agent 出网黑名单与沙箱硬上限、技能审查台账与人工放行。",
    group: "capability",
  },
  {
    key: "skill-generator",
    name: "生成 Skill",
    icon: "robot",
    desc: "勾选本系统 MCP 业务域与动作，调用模型逐个生成根目录带 SKILL.md 的技能包；下载后可发布到 SkillHub 获取流量。目录随 MCP 接口自动增长。",
    group: "capability",
  },
  {
    key: "publish-review",
    name: "发布审核",
    icon: "safety",
    desc: "配置阿里云内容安全的 AccessKey 与审核场景：发布需求、发布服务必选，社群发帖、发布简历可选；命中违规直接阻断发布并记入审核台账，上游故障降级放行。",
    group: "capability",
  },
  {
    key: "usage",
    name: "使用埋点",
    icon: "chart",
    desc: "产品使用埋点的启停与保留天数、近 N 天事件汇总与明细；关闭后前端停止上报，已有数据按保留策略清理。",
    group: "capability",
  },
  {
    key: "hardware",
    name: "智能硬件",
    icon: "chip",
    desc: "硬件型号目录、开发包版本（SDK / 固件上传、下载量）与型号默认 API / MCP 工具维护；用户接入的设备与自建工具在用户侧「智能硬件」栏目。",
    group: "capability",
  },
  {
    key: "overseas-nav",
    name: "出海导航",
    icon: "compass",
    desc: "营销工具「出海导航」的分类与站点维护：Logo、标题、简介、URL、排序与显示状态；默认数据随系统安装写入。",
    group: "system",
  },
  {
    key: "terms",
    name: "条款版本",
    icon: "file-done",
    desc: "服务条款 / 隐私政策等文档的版本发布：可要求修订后重新接受，用户接受行为逐条留痕。",
    group: "system",
  },
  {
    key: "changelog",
    name: "更新日志",
    icon: "horn",
    desc: "产品更新日志：按版本、分类、发布状态维护，已发布条目同步展示在帮助中心。",
    group: "system",
  },
  {
    key: "upgrade",
    name: "平台升级",
    icon: "rocket",
    desc: "从 GitHub Release 拉取或手动上传升级包，先由平台 Agent 分析代码差异与迁移风险，再按建议一键执行；升级前强制备份数据库，支持代码备份、自动回滚与一键还原。",
    group: "system",
  },
  {
    key: "dev-guide",
    name: "二次开发指引",
    icon: "code",
    desc: "架构说明、接口说明、外部引入代码包与开发原则；渲染仓库 docs/dev-kit 真源，并提供开发套件与技能包下载、一键命令与本站补充说明。",
    group: "system",
  },
  {
    key: "ai-code",
    name: "AI 编程",
    icon: "code",
    desc: "选好模型后用「对话 + 上传参考图 / 文件」让模型改写本系统自身源码：改动先落在暂存区产出可审阅的差异，逐文件采纳后再备份数据库与程序、由平台升级执行器应用、构建、迁移、重启；任何一步都能一键还原。",
    group: "system",
  },
  {
    key: "wechat-mp",
    name: "微信服务号设置",
    icon: "qrcode",
    desc: "配置平台微信服务号的 AppID / AppSecret / Token 与 EncodingAESKey、模板消息映射、自定义菜单、关注提示与关键词回复；用户从右上角二维码入口扫码关注即绑定账号，任务、审批与客服回复可同步推送到微信并在手机 H5 上处理。",
    group: "system",
  },
  {
    key: "miniprogram",
    name: "小程序管理",
    icon: "mobile",
    desc: "用户版小程序（移动办公延伸）：配置 AppID / AppSecret 与站点域名、按业务模块开关小程序端功能、上传代码包（版本 / 通道）并生成或上传小程序码；管理员把内置代码包下载后用微信开发者工具上传提审即可。",
    group: "system",
  },
  {
    key: "settings",
    name: "系统设置",
    icon: "setting",
    desc: "文件存储（OSS）、AIPDD 平台 Key（基础数据）、平台级参数、站点设置与首页设置：各板块以页签切换，保存后前端读取即时生效。首页设置维护官网落地页的文案、图片与板块显隐（顶部只有注册 / 登录，页脚 ICP 读站点设置）。企享云报税 API Key 与税号匹配统一在「财税管理」。",
    group: "system",
  },
];

export const adminRoute: EnterpriseRoute = {
  path: "/",
  routes: [
    { path: "/dashboard", name: "驾驶舱", icon: "dashboard" },
    ...ADMIN_GROUPS.map((group) => ({
      type: "group" as const,
      name: group.name,
      icon: group.icon,
      routes: ADMIN_SECTIONS.filter((item) => item.group === group.key).map((item) => ({
        path: `${ADMIN_PATH_PREFIX}/${item.key}`,
        name: item.name,
        icon: item.icon,
      })),
    })),
  ],
};

/**
 * 驾驶舱独立置顶，菜单按当前身份筛选。
 * 顺序：工作台 → 业务服务 → 商务人脉（AI社交） → 模型服务（含 AIPDD 算力平台外链） → 管理设置（含平台机制） → 智能硬件。
 */
export const enterpriseRoute: EnterpriseRoute = {
  path: "/",
  routes: [
    { path: "/dashboard", name: "驾驶舱", icon: "dashboard" },
    {
      type: "group",
      name: "工作台",
      icon: "chip",
      routes: [
        { path: "/tasks", name: "我的任务", icon: "tasks" },
        { path: "/agent", name: "Agent", icon: "robot" },
        { path: "/agent-bot", name: "Agent-Bot", icon: "robot" },
        { path: "/rpa", name: "RPA自动化", icon: "play" },
        { path: "/kb", name: "知识库", icon: "book" },
        { path: "/mail", name: "AI邮箱服务", icon: "mail" },
        { path: "/data-table", name: "多维表格", icon: "table" },
        /**
         * 「内容创作」板块：工作台里的可展开子菜单，下挂内容创作类功能入口。
         * 原先平铺的「内容创作」菜单改名为「内容创作工具」并收进这个板块，
         * 页面地址仍为 /content（契约端点、后端路由与站内跳转链接都不受影响）。
         * 之后新增内容创作方向的功能（选题、排期、发布等）只往这个板块的 routes 里加条目。
         */
        {
          type: "group",
          name: "内容创作",
          icon: "play",
          routes: [
            { path: "/content", name: "内容创作工具", icon: "play" },
            { path: "/content/canvas", name: "AI 画布", icon: "workflow" },
            { path: "/community", name: "创意社区", icon: "apps" },
            { path: "/content/video-templates", name: "视频模版", icon: "play" },
          ],
        },
        { path: "/marketing-tools", name: "营销工具", icon: "horn" },
        // 「建站管理」卡片页（一个菜单，页内两板块：小程序 / Web建站）；新增建站类工具继续往卡片页加卡并在功能目录挂子码。
        { path: "/site-builder", name: "建站管理", icon: "mobile" },
        { path: "/rental", name: "租赁管理", icon: "car" },
        { path: "/park", name: "园区管理", icon: "shop" },
        // 小程序开发与发布：源码包下载 + AI 客户端开发建议 + 微信侧发布步骤（原发布说明抽屉的独立页）。
        { path: "/site-builder/mini-dev-guide", name: "小程序开发与发布", icon: "code" },
        /**
         * 「智慧分析」营销工具同款卡片页（一个菜单，页内四张工具卡：
         * 全域内容热点分析、流行趋势分析、AI-FDE实施分析、企业咨询；点卡片进各自工具页）。
         */
        { path: "/insight", name: "智慧分析", icon: "chart" },
        { path: "/assets", name: "数字资产管理", icon: "folder" },
        { path: "/crm", name: "CRM", icon: "team" },
        { path: "/bi", name: "BI智能分析", icon: "chart" },
        { path: "/oa", name: "OA", icon: "file-done" },
        { path: "/okr", name: "OKR计划", icon: "target" },
        { path: "/service-desk", name: "AI客服", icon: "peoples" },
        { path: "/hrm", name: "HR工作台", icon: "peoples" },
        { path: "/project", name: "项目管理", icon: "file-done" },
        { path: "/erp", name: "进销存", icon: "shop" },
        { path: "/app-center", name: "应用中心", icon: "appstore" },
        { path: "/question-hall", name: "专题大厅", icon: "peoples" },
        { path: "/quiz", name: "答题小程序", icon: "file-done" },
      ],
    },
    {
      type: "group",
      name: "业务服务",
      icon: "shop",
      routes: [
        { path: "/marketing", name: "营销服务", icon: "shop", domain: "marketing" },
        { path: "/supply", name: "供销网络", icon: "network", domain: "supply" },
        { path: "/tax", name: "财税服务", icon: "audit", domain: "tax" },
        { path: "/overseas", name: "跨境出海", icon: "global", domain: "overseas" },
        { path: "/flex", name: "灵活用工", icon: "team", domain: "flex" },
        { path: "/logistics", name: "物流服务", icon: "rocket", domain: "logistics" },
        { path: "/smart", name: "IT服务", icon: "chip", domain: "smart" },
        { path: "/ip", name: "知识产权", icon: "safety", domain: "ip" },
        { path: "/legal", name: "法律服务", icon: "bank", domain: "legal" },
        { path: "/think-tank", name: "智库服务", icon: "read", domain: "think-tank" },
        { path: "/asset", name: "资产交易", icon: "asset", domain: "asset" },
        { path: "/market", name: "供需市场", icon: "shop" },
      ],
    },
    /** 商务人脉成组（紧靠业务服务之后、模型服务之前）：社交与招聘统一收进 AIworkin 的 DSH 插件入口。 */
    {
      type: "group",
      name: "商务人脉",
      icon: "peoples",
      routes: [{ path: "/ai-social", name: "AI社交", icon: "peoples" }],
    },
    {
      type: "group",
      name: "模型服务",
      icon: "api",
      routes: [
        { path: "/developer/keys", name: "API Key 管理", icon: "key" },
        { path: "/model-plaza", name: "模型广场", icon: "appstore" },
        { path: "/model-settings", name: "模型设置", icon: "setting" },
        { path: "/developer/api-mcp-skill", name: "API-MCP-Skill", icon: "book" },
        // AIPDD 算力平台外链固定挂在「模型服务」最后
        { path: "https://app.aipdd.work", name: "AIPDD算力平台", icon: "bolt" },
        // A2A 供需平台外链：功能目录里的 ai-a2a 此前没有对应菜单项，关掉它什么也不会发生，这里补上入口。
        { path: "https://www.aiworkin.com", name: "A2A供需平台", icon: "link" },
      ],
    },
    {
      type: "group",
      name: "管理设置",
      icon: "setting",
      routes: [
        { path: "/identity", name: "身份与资质", icon: "idcard" },
        { path: "/staff", name: "职员/代理人管理", icon: "peoples" },
        { path: "/contracts", name: "签约管理", icon: "contract" },
        { path: "/my-packages", name: "我的套餐", icon: "gift" },
        // 账户级自助：积分充值与流水、邀请码与邀请记录，统一挂在「管理设置」下
        { path: "/points", name: "积分中心", icon: "pay-circle" },
        { path: "/invite", name: "我的邀请", icon: "gift" },
        { path: "/account/team", name: "子账号与操作日志", icon: "team" },
        { path: "/developer/mechanisms", name: "平台机制", icon: "api" },
      ],
    },
    /** 智能硬件独立成板块（放在管理设置之后、菜单最末），页面地址不变。 */
    {
      type: "group",
      name: "智能硬件",
      icon: "chip",
      routes: [
        { path: "/hardware", name: "硬件广场", icon: "appstore" },
        { path: "/hardware/devices", name: "添加硬件", icon: "chip" },
        { path: "/hardware/mcp", name: "硬件MCP", icon: "api" },
        { path: "/hardware/api", name: "硬件API", icon: "book" },
      ],
    },
  ],
};

/**
 * 平台管理员侧栏隐藏的「模型服务」与「智能硬件」入口：API Key 管理（含 AIPDD API Key 绑定）与模型设置都是
 * 「当前账号」的自助配置，挂在平台后台里容易被误读成平台级设置（平台级配置统一在「系统设置」的
 * 企享云 / OSS / AIPDD 平台 Key 与站点设置页签里）。管理员要用这两页请切到企业 / 个人身份，
 * 只隐藏菜单入口，直接访问链接不受影响。
 * 智能硬件板块（广场 / 添加硬件 / 硬件MCP / 硬件API）同属账号视角，管理员侧一并隐藏，
 * 平台级硬件维护在 /admin 的「智能硬件」板块。
 */
const ADMIN_HIDDEN_INTEGRATION_PATHS = [
  "/developer/keys",
  "/model-plaza",
  "/model-settings",
  "/hardware",
  "/hardware/devices",
  "/hardware/mcp",
  "/hardware/api",
];

/**
 * 站点级菜单显隐：递归剔除被隐藏的菜单项（路径即菜单里的 path，外链为完整 URL）。
 * 只过滤菜单项，不动分组本身——子项全被隐藏的分组留空，交给下游按「空组不留菜单」剔除。
 */
function applyHiddenMenuPaths(
  routes: EnterpriseRoute[],
  hidden: Set<string>,
): EnterpriseRoute[] {
  return routes
    .filter((route) => !(route.path && hidden.has(route.path)))
    .map((route) =>
      route.routes ? { ...route, routes: applyHiddenMenuPaths(route.routes, hidden) } : route,
    );
}

/**
 * 子账号菜单：模块 key → 前端路径前缀。未列出的路径（驾驶舱、通知等基础页）不限制；
 * 列出的路径只有在子账号 scopes 里才显示（与后端 `/enterprise/**` 模块守卫同口径）。
 */
const SUB_ACCOUNT_MODULE_PATHS: Record<string, string[]> = {
  tasks: ["/tasks"],
  agent: ["/agent", "/agent-bot", "/rpa"],
  kb: ["/kb"],
  content: ["/content"],
  community: ["/community"],
  mkt: ["/marketing-tools"],
  insight: ["/insight"],
  crm: ["/crm"],
  bi: ["/bi"],
  oa: ["/oa"],
  okr: ["/okr"],
  hrm: ["/hrm"],
  project: ["/project"],
  erp: ["/erp"],
  onsite: ["/onsite"],
  rental: ["/rental"],
  park: ["/park"],
  "brand-mall": ["/brand-mall"],
  // 与 contracts/rbac.ts 新增模块同步：这些板块此前子账号无论授权都可见可用。
  "service-desk": ["/service-desk"],
  "data-table": ["/data-table"],
  mail: ["/mail"],
  "question-hall": ["/question-hall"],
  quiz: ["/quiz"],
  "app-center": ["/app-center"],
  assets: ["/assets"],
  // 建站工具卡（侧栏不成项，只在建站管理/智慧分析卡片页出现）同样按模块裁剪。
  health: ["/health"],
  "knowledge-pay": ["/knowledge-pay"],
  "digital-human": ["/digital-human"],
  "card-shop": ["/card-shop"],
  kuaidi: ["/kuaidi"],
  marketplace: ["/marketplace"],
};

/** 子账号不展示主账号专属入口（人员、签约、计费与资质管理）。 */
const SUB_ACCOUNT_HIDDEN_GROUPS = new Set(["管理设置"]);

function filterRoutesForScopes(
  routes: EnterpriseRoute[],
  scopes: string[],
): EnterpriseRoute[] {
  const allowed = new Set(scopes);
  return routes
    .filter((route) => !(route.name && SUB_ACCOUNT_HIDDEN_GROUPS.has(route.name)))
    .map((route) => {
      if (route.routes) {
        return { ...route, routes: filterRoutesForScopes(route.routes, scopes) };
      }
      if (!route.path) return route;
      const matched = Object.entries(SUB_ACCOUNT_MODULE_PATHS).find(([, paths]) =>
        paths.some(
          (prefix) =>
            route.path === prefix || route.path!.startsWith(`${prefix}/`),
        ),
      );
      if (!matched || allowed.has(matched[0])) return route;
      return undefined;
    })
    .filter((route): route is EnterpriseRoute => Boolean(route))
    .filter((route) => route.type !== "group" || Boolean(route.routes?.length));
}

/**
 * 子账号未被授权的模块 key 集合（主账号返回空集）。
 * 卡片页/页签页用它在渲染入口前先收窄，与侧栏 `filterRoutesForScopes` 同一份数据源。
 */
export function deniedModuleKeysFor(me: EnterpriseMe | null): Set<string> {
  if (!me?.isSubAccount) return new Set();
  const allowed = new Set(me.scopes ?? []);
  return new Set(
    Object.keys(SUB_ACCOUNT_MODULE_PATHS).filter((key) => !allowed.has(key)),
  );
}

/**
 * 只用当前身份组织菜单；具备其他身份不会混入其管理入口。
 * 平台管理员侧栏只拼「平台管理」后台板块与工具菜单，不含「管理设置」分组（身份与资质 / 积分中心 / 我的邀请 / 平台机制属个人账户视角），
 * 也不含「模型服务」「智能硬件」里的账户级自助入口（见 ADMIN_HIDDEN_INTEGRATION_PATHS）。
 * `hiddenMenuPaths` 来自后台「站点设置 → 用户侧菜单显隐」，覆盖前台侧栏每一条菜单（含驾驶舱入口与「AIPDD算力平台」外链），
 * 对管理员与普通用户一致生效：只控制菜单显示，直接访问链接不受影响，某分组内全部隐藏后该分组自动消失。
 */
export function navigationFor(
  me: EnterpriseMe | null,
  hiddenMenuPaths: string[] = [],
): EnterpriseRoute {
  if (!me) return { path: "/", routes: [] };
  const identity = me.currentIdentity;
  // 先做站点级显隐（对所有身份一致），再交给身份分支组织菜单。
  // 历史配置把驾驶舱入口写作「/」，首页独立后驾驶舱移到「/dashboard」，旧开关继续生效。
  const hidden = new Set(hiddenMenuPaths);
  if (hidden.has("/")) hidden.add("/dashboard");
  const routes = applyHiddenMenuPaths(enterpriseRoute.routes!, hidden);
  // 子账号：菜单按授权模块裁剪，且不展示平台管理员/主账号专属入口。
  if (me.isSubAccount) {
    return {
      ...enterpriseRoute,
      routes: filterRoutesForScopes(routes, me.scopes ?? []),
    };
  }
  const management = routes.find((route) => route.name === "管理设置")!;
  const tools = routes
    .filter((route) => route.name === "模型服务" || route.name === "智能硬件")
    .filter((route) => route.type !== "group" || Boolean(route.routes?.length));
  if (identity === "PLATFORM_ADMIN" && me.identities.includes("PLATFORM_ADMIN")) {
    // 平台管理员侧栏不带「管理设置」组：该组是个人账户视角的入口，管理员的账户级操作都在 /admin 内完成。
    // 「模型服务」「智能硬件」里的 Key 绑定、模型配置与硬件接入同属账号级自助，管理员侧一并摘掉，避免与平台级配置混淆。
    const adminHiddenIntegration = new Set(ADMIN_HIDDEN_INTEGRATION_PATHS);
    const adminTools = tools
      .map((route) =>
        route.name === "模型服务" || route.name === "智能硬件"
          ? {
              ...route,
              routes: applyHiddenMenuPaths(route.routes!, adminHiddenIntegration),
            }
          : route,
      )
      // 站点级显隐 + 管理员隐藏项叠加后可能整组为空，空组不留菜单
      .filter((route) => route.type !== "group" || Boolean(route.routes?.length));
    return {
      ...adminRoute,
      routes: [...adminRoute.routes!, ...adminTools],
    };
  }

  const opened = openedTypes(me, identity);
  const personal = !me.identities.includes("PLATFORM_ADMIN") && identity === "ENTERPRISE_USER" && isPersonalSubject(me.enterprise?.subjectType);
  return {
    ...enterpriseRoute,
    routes: routes
      .map((route) => {
        if (route.name === "业务服务") {
          return {
            ...route,
            // 个人主体也进财税/出海：只锁办理动作（签约/申报/账套/发布需求），浏览与服务商名录照常
            routes: route.routes!.filter((child) => isDomainOpened(opened, child.domain)),
          };
        }
        if (route === management) {
          // 职员/代理人与个人用户也进本页，但看的是「申请加入服务商」视角
          const joinView = identity === "PROVIDER_STAFF" || personal;
          return {
            ...route,
            routes: route.routes!.filter((child) =>
              child.path !== "/staff" ||
              identity === "SERVICE_PROVIDER" ||
              joinView,
            ).map((child) =>
              child.path === "/staff" && joinView
                ? { ...child, name: "申请加入服务商" }
                : child,
            ),
          };
        }
        return route;
      })
      .filter((route) => route.type !== "group" || Boolean(route.routes?.length)),
  };
}

export const PAGE_META: Record<
  string,
  { title: string; description: string }
> = {
  "/": { title: "官网首页", description: "企业服务操作系统：一个账号连接企业全生命周期。" },
  "/dashboard": { title: "驾驶舱", description: "身份与资质、我的待办与业务台账。" },
  "/insight": {
    title: "智慧分析",
    description:
      "趋势研判、垂类热点洞察与企业咨询的工具箱：一张卡片一个工具，全域内容热点分析、流行趋势分析、AI-FDE 实施分析与企业咨询并列，共用采集、数据资产、多维表格与统一模型网关。",
  },
  "/insight/hotspot": {
    title: "全域内容热点分析",
    description:
      "订阅自己的垂类（关键词/话题/博主）后，用 AWBotDSH 主机托管窗口（主）或本机浏览器代理（备）把公开内容采进「热点内容」多维表格，热点引擎按时段聚合打分分层（萌芽/上升/峰值/衰退），给出热点大盘、榜单、追踪台账与 AI 快报。",
  },
  "/insight/trends": {
    title: "流行趋势分析",
    description:
      "对自有数字资产图片与电商采集结果做 VLM 打标、色彩/元素时序、价格带与爆款打分；开启联动后，用社媒互动热度（热点）×电商商业热度看概念商业化潜力四象限。数据面限定自有资产+自有采集，不接入受保护商业平台。",
  },
  "/insight/fde": {
    title: "AI-FDE实施分析",
    description:
      "提交企业画像、流程痛点、系统数据条件与目标约束，由统一模型网关按 AI-FDE（AI 前置交付工程师）方法产出就绪度诊断、场景优先级、交付组织、技术架构、分阶段路线图、KPI 与风险清单；支持补充行业成果资料，报告按账号留存可回看。",
  },
  "/insight/consulting": {
    title: "企业咨询",
    description:
      "提交企业数据并勾选分析模型：波士顿矩阵、SWOT、PEST、大战略矩阵、价值链、SPACE、易经、特劳特定位、营销 4Ps/4Cs/4Rs、麦肯锡方法、波特五力、第一性原理、人力资源与企业资源分析等；逐维度产出结论，再汇总成跨模型的综合建议，报告按账号留存可回看。",
  },
  "/help": {
    title: "帮助中心",
    description:
      "按章节了解系统怎么用的知识库：快速开始、工作台工具、内容与营销、多平台分发、业务服务与管理设置；同一份知识以 MCP 只读工具开放，可直接问 Agent 获得官方用法。",
  },
  "/site-builder": {
    title: "建站管理",
    description:
      "用户自建、自主运营与上传发布的站点工具集：小程序板块放微信原生小程序工具（知识付费 / 上门服务 / 品牌商城 / 数字人 / 卡密商城 / 快递寄件 / 跑腿 / 圈子社区），Web建站板块放浏览器独立站；每个工具一套自己的数据、会员与订单。",
  },
  "/site-builder/mini-dev-guide": {
    title: "小程序开发与发布",
    description:
      "下载平台统一输出的小程序源码包，查看本账号要填的地址与租户码；导入 Codex、Qoder、TREA / TRAE、AWBotDSH 等客户端改代码，再回微信开发者工具编译预览，最后在微信公众平台提审发布。平台不代编译、不代传微信。",
  },
  "/site-builder/launch": {
    title: "启动设置",
    description:
      "建站管理下每个工具的启动开关与计费口径：未启动＝顾客端停服 + 不能出包 + 站内配置只读，且不扣积分；启动后按平台管理员配置的口径（免费 / 按日 / 按 30 天 / 按年 / 按访问 / 按流量）自动出账，欠费进宽限、超期停服、充值自动补扣复活。",
  },
  "/rental": {
    title: "租赁管理小程序",
    description:
      "通用租赁（车辆 / 设备 / 场地）的租品、租单、取还验车、押金结算与门店统计；租客小程序与员工工作台分身份使用，客服复用 AI 客服、私域复用企业微信 SCRM，后台账号与权限沿用本站体系。",
  },
  "/errand": {
    title: "跑腿小程序工具",
    description:
      "做同城帮送/帮买：账号负责人就是小程序管理员，一个账号一部小程序；按起步价 + 距离 + 重量 + 夜间与帮买服务费自动计价，接入腾讯地图算驾车距离与骑手定位，支持自动派单、转单/弃单、骑手审核、钱包提现、顾客评价与优惠券；客服复用 AI 客服，AI 调度走平台模型网关，按订阅时间/流量/访问量/浏览量扣积分启动。",
  },
  "/kuaidi": {
    title: "快递寄件小程序工具",
    description:
      "开一个自己的快递寄件平台：一个账号一部小程序，可建多个寄件点让顾客就近选点；配置快递公司首重/续重、偏远加价与保价规则，买家按重量与地区自动报价、预约取件并微信支付；你按「接单 → 取件 → 运输 → 签收」推进履约，客服复用 AI 客服，收款进你自己的微信商户号，平台不经手资金。",
  },
  "/circle": {
    title: "圈子社区小程序工具",
    description:
      "开一个自己的圈子社区小程序：账号负责人就是社区管理员，建分类与圈子、审核圈主与成员、管理图文帖与楼中楼评论、处理举报与站内消息；C 端成员是社区自己的用户，与站内账号隔离。社区素材可从数字资产管理选择，在线客服复用 AI 客服，AI 运营助手走平台模型网关，按订阅时间/流量/访问量/浏览量扣积分启动。",
  },
  "/card-shop": {
    title: "卡密商城小程序工具",
    description:
      "开一个自动发卡的微信小程序商店：导入卡密、上架卡密商品，买家匿名或微信登录下单，支付成功后立即拿到卡密，也能凭单号与联系方式自助查单取卡；券码、公告与模块开关都在同一处，收款进你自己的微信商户号，平台不经手资金。",
  },
  "/brand-mall": {
    title: "电商小程序工具",
    description:
      "开一个属于自己的微信小程序商城：店铺与交易设置、商品多规格、页面装修、订单与售后、顾客运营、优惠券，最后下载平台统一输出的源码分发包（zip），在微信开发者工具里自填参数、上传、提审与发布（本站不代编译、不代传）。资金直进你自己的微信商户账户，平台不经手。",
  },
  "/marketplace": {
    title: "多店铺商城平台",
    description:
      "把自己做成平台方：创建市场并维护统一类目，审核商户入驻，治理店铺经营。商户是独立账号体系，在自己的商户后台管理店铺；买家入口在 B1 期的小程序。资金直进各商户自己的微信商户号，平台不经手，抽佣按市场台账线下结算。",
  },
  "/health": {
    title: "健康管理小程序工具",
    description:
      "建一部自己运营的健康管理小程序：机构与医护入驻审核、服务目录与号源排班、挂号问诊与报告、就诊人档案与指标随访、体检与商城、会员券积分与分账提现台账；顾客端与医护端小程序按本店配置出包，资金直进你自己的微信商户号，平台不经手。",
  },
  "/merchant": {
    title: "商户后台",
    description:
      "商户独立账号入口：入驻申请、登录后台、店铺资料与微信支付设置、店员账号。与站内企业工作台账号互不通用。",
  },
  "/brand-mall/goods": {
    title: "商品管理",
    description: "三级分类 + 多规格商品：规格维度自动生成 SKU 行，逐行定价定库存，主表价格取启用 SKU 的最低价。",
  },
  "/brand-mall/order": {
    title: "订单管理",
    description: "按状态分页的订单台账：发货、标记完成、关闭与卖家备注，详情含商品快照、金额构成与操作时间线。",
  },
  "/brand-mall/refund": {
    title: "售后管理",
    description: "退款申请的处理台：同意即通过你自己的商户号原路退回，拒绝必须写明理由（买家可见）。",
  },
  "/brand-mall/customer": {
    title: "顾客管理",
    description: "本店私域顾客：等级与备注、地址簿、近期订单与积分流水，可拉黑限制下单。",
  },
  "/brand-mall/marketing": {
    title: "优惠券",
    description: "满减/折扣券的发放与核销台账；折扣只按命中作用域的商品金额计算，指定范围券的适用范围、门槛与有效期在表单里明示。",
  },
  "/brand-mall/decorate": {
    title: "页面装修",
    description: "拖组件拼顾客端页面（首页/分类/我的/活动页），草稿与线上快照分离，发布才生效。",
  },
  "/brand-mall/publish": {
    title: "小程序发布",
    description: "绑定你自己的小程序 AppID 与微信商户号，下载平台统一源码分发包，在微信开发者工具里自填参数并上传、提审、发布。",
  },
  "/brand-mall/setting": {
    title: "店铺设置",
    description: "基础信息、交易与售后参数、运费与积分规则、本店快递维护与关店/删店等危险操作。",
  },
  "/data-table": {
    title: "多维表格",
    description:
      "按账号归属的自建结构化数据表：自定义列（八种类型）、逐条录入行数据，并可经 API Key 机器通道读写。",
  },
  "/rpa": {
    title: "RPA自动化",
    description:
      "按账号归属的云端 RPA：RPA 任务（建任务即绑定脚本＋账号＋运行参数）、RPA 账号（口令密文保存）、RPA 脚本（Automa JSON / JS / Python，可由 AIPDD 文字模型按需求生成），本地比特浏览器凭 API Key 认领执行并回传结果；另有「本地 Chrome 插件（浏览器代理）」执行端——插件登录本系统后本机浏览器成为在线设备，Agent 可在你已登录的站点自主多步执行；还有「AWBotDSH 浏览器」——AWBotDSH 客户端自带的内核级指纹窗口，随客户端内置 Automa 插件开箱即用，浏览器本体与插件都在客户端，平台侧登记主机在线状态。",
  },
  "/agent-bot": {
    title: "Agent-Bot",
    description:
      "四个页签把「跑活的 Agent」收在一处：AWBotDSH 主机（本机客户端配对成在线主机，说人话下发指令、选工作区、排定时任务）、AWBot 手机（6 位连接码配对，心跳领取 Prompt 由手机本地 Agent 执行回传）、WorkBuddy 企业云（一个腾讯云企业账号即一条执行通道：账号对话、定时任务、SecretId/SecretKey 密文保存）与 AI 调用账号（第三方平台口令 / API Key / Cookie 加密保存）。三类通道各自的「Agent 绑定账号」页签按设备授权：客户端凭主机令牌、任务侧凭平台 API Key 按 kind + Agent ID 取用，未绑定的一律取不到。模型密钥、技能与本机文件永不离开这台设备，平台只传「做什么」与「做到哪了」。",
  },
  "/app-center": {
    title: "应用中心",
    description:
      "内建应用与应用市场合并后的统一入口：首页按关键词搜索我构建的、本企业构建的和应用市场的应用；另有企业创建、我创建的、我加入的与应用市场四个页签。内建应用按组织归属，实体落多维表格、成员按角色权限读写；应用市场是外部公开目录的只读展示，本站不存应用、不代上架也不代评价。",
  },
  "/crm": {
    title: "CRM",
    description:
      "账号级客户关系管理：线索、客户、商机、销售合同、回款、订单、审批与报表。成员与权限复用本账号「职员与代理人」，企业身份与服务商身份共用同一套人。",
  },
  "/bi": {
    title: "BI智能分析",
    description:
      "账号级 BI：内置 CRM 策展数据集与外部 PostgreSQL/MySQL 只读数据源，支持智能问数、图表与仪表板。成员与权限复用本账号「职员与代理人」。",
  },
  "/oa": {
    title: "OA",
    description:
      "按组织归属的表单申请与多级审批：请假、报销、付款、采购、用章；成员来自组织「职员与代理人」，可关联 CRM 等业务数据，审批结果回写。",
  },
  "/question-hall": {
    title: "专题大厅",
    description:
      "发布企业内或公开的专题讨论：企业内由本组织与签约/承办伙伴的职员参与，公开对所有登录账号开放；发起人可结案（AI 总结全部发言与回复的回复）、重新结案、关闭或删除，发言可选本人或数字分身署名。",
  },
  "/quiz": {
    title: "答题小程序",
    description:
      "做自己的答题/考试小程序：建题库、录题或让 AI 按资料出题，发布后选手在微信里练习、考试、看错题与排行；题目与交卷记录都落在账号自己的多维表格，可直接筛选导出；封面与学习资料从数字资产管理选取，客服入口绑定已有 AI 客服站点。",
  },
  "/kb": {
    title: "知识库",
    description:
      "公共知识库与知识图谱底座：资料投进知识空间后编译为可溯源的 wiki 页面，[[链接]] 自动长出图谱，混合检索与带引用问答随写随可用；支持消费者绑定、Agent 操作记忆提炼与上下文回流，未配置大模型时全链路走规则式回落。",
  },
  "/ai-social": {
    title: "AI社交",
    description:
      "AIworkin 的 DSH 社交插件入口：打开聊天、我的分身、发现人脉、小组、招聘、站内私信与我的主页都在新窗口打开；社交数据与操作全部落在 AIworkin，不在本站保存。首次进入需先绑定 AIPDD API Key；平台管理员可在功能开关里关闭整个入口。",
  },
  "/invite": {
    title: "我的邀请",
    description:
      "每位用户都有一把专属邀请码：好友注册时填写（非必填）即建立邀请关系；这里展示你的邀请码与注册链接、自己是被谁邀请注册的，以及已成功邀请的人数。",
  },
  "/points": {
    title: "积分中心",
    description:
      "本站积分与 AWcoin 双币展示：积分可微信充值、可赠送给其他账号，用于数字资产存储与 CRM / BI / OA / AI 客服等模块消费；流水与充值订单一屏可查。AWcoin 只读展示，永不互兑。",
  },
  "/okr": {
    title: "OKR计划",
    description:
      "按组织归属的目标管理：年度/季度/月度周期、公司到个人的目标树、周/日计划、日报周报与周期复盘评分。成员与管理者的岗位能力取自组织「职员与代理人」。",
  },
  "/mail": {
    title: "AI邮箱服务",
    description:
      "按登录账号添加多个邮箱（POP3 / IMAP），实时读取收件箱与草稿箱，邮件正文、附件一律不落库；可配置场景话术，回复方式选「只写草稿」或「写草稿并自动回复」，Agent 定时任务通过邮件工具按话术草拟回复。邮箱列表显示今天已发送/已出草稿与本月累计处理量。",
  },
  "/tasks": {
    title: "我的任务",
    description:
      "统一任务中心：把各业务模块（审批 / 汇报 / 任务 / 事务 / 审核）需要你处理的待办聚成一屏，点「去处理」跳到源模块办理，明细仍在各模块闭环；本人可关闭 / 重开，由工作流派发的节点关闭后会唤醒流程继续执行。",
  },
  "/workflow": {
    title: "工作流",
    description:
      "可视化编排自动化流程：拖拽节点连线成 DAG（触发器 → 动作 → 分支 / 循环 / 等待 / 子流程），可手动 / 定时 / Webhook 触发，运行过程流式查看步骤与产物，也可发布为 Agent 技能或 MCP 工具供调用。",
  },
  "/agent": {
    title: "Agent",
    description:
      "与模型对话直接产出图片/视频：生成结果自动存进本账号的 AIPDD 数字资产；「记忆」页签里既有 Agent 长期记忆，也有你在全站做过的操作留痕。模型与 Key 在「模型服务 → 模型设置」里配置。",
  },
  "/international-site": {
    title: "国际独立站",
    description:
      "拖拽搭建对外站点：页面、菜单、文章与产品按多语言分别维护，发布到平台子域或客户自己的域名（TXT + CNAME 自助校验）。站点按月扣积分，欠费只停服不删数据；客户绑定域名后按该域名独立访问，配置方式见「平台管理 → 独立站管理」和接入文档。",
  },
  "/marketing-tools": {
    title: "营销工具",
    description:
      "营销工具按获客与转化 / 内容与搜索增长 / 数据与线索挖掘 / 触达与客户运营四组排布，首屏一卡一工具、点卡片进入使用：AI 获客、企微 SCRM、达人建联、阿里云智能外呼与邮件推送、GEO-AI引擎优化、SEO 优化、营销技能库、多平台内容分发、问卷设计与调研、活码引流、腾讯企点三件套、Google 潜客线索挖掘、五个大数据数据集（企业数据 / 全球贸易 / 全球商务人士 / 全球达人 / 全球POI）、出海导航、国际独立站与外部站点 SalesBuddy。",
  },
  "/contracts": {
    title: "签约管理",
    description: "签约概览与全部签约（企业发起、服务商确认）。",
  },
  "/my-packages": {
    title: "我的套餐",
    description:
      "已购官方服务套餐与逐项交付进度：套餐由平台整合优质服务商完成交付，平台主持企业与服务商签约，签约须服务商确认后生效，进度实时读取签约状态。",
  },
  "/tax": {
    title: "财税服务",
    description: "报税工作台、申报计划与账套管理。",
  },
  "/supply": {
    title: "供销网络",
    description:
      "B2B 供需协同供应网络：服务站、商品订货与线下服务预约（报价由服务商或其指派职员完成）。",
  },
  "/overseas": {
    title: "跨境出海",
    description: "跨境出海服务商与出海服务工具。",
  },
  "/flex": {
    title: "灵活用工服务",
    description: "资源库、用工需求（含用工进件）与灵工发薪。",
  },
  "/marketing": {
    title: "营销服务",
    description: "达人探店 / 直播带货 · 需求消息通道。",
  },
  "/logistics": {
    title: "物流服务",
    description: "境内陆运 / 跨境货代 · 需求消息通道。",
  },
  "/smart": {
    title: "IT服务",
    description: "AI实施 / 软件开发 / 算力 / 硬件 / 数据 · 需求消息通道。",
  },
  "/ip": {
    title: "知识产权服务",
    description: "机构 / 代理人资源库、需求消息与咨询维权。",
  },
  "/legal": {
    title: "法律服务",
    description: "律师 / 律所资源库与需求消息。",
  },
  "/think-tank": {
    title: "智库服务",
    description: "机构 / 专家资源库与需求消息。",
  },
  "/asset": {
    title: "资产交易",
    description: "资产租售与居间服务 · 需求消息通道。",
  },
  "/market": {
    title: "供需市场",
    description:
      "跨板块的公开供需市场：需求与服务各一个页签，默认读 AIworkin 平台公开池（发布同步平台挂单并落本地台账、记回内容 ID）；服务商身份可切「我发布的」读本系统台账。",
  },
  "/identity": {
    title: "身份与资质",
    description: "用户信息提交即生效；服务商备案需审核；职员需绑定或挂靠。",
  },
  "/staff": {
    title: "职员/代理人管理",
    description: "团队概览、挂靠审批与在职职员。",
  },
  "/project": {
    title: "项目管理",
    description:
      "项目、任务与工时闭环：项目主档、成员与里程碑、迭代与任务依赖、工时流水与周表审批；成员复用组织「职员/代理人」，AI 只做任务拆解建议与项目健康度评估，写入由人确认。",
  },
  "/erp": {
    title: "进销存",
    description:
      "中小企业进销存：商品与变体、分类与仓库、库存流水与调拨、采购单与入库、应收应付与收付款、报销、税率与价格策略；附带 AI 库存/采购/应收/现金流洞察，缺模型 Key 时规则式产出。",
  },
  "/developer/mechanisms": {
    title: "平台机制",
    description:
      "事件 Outbox 与 Webhook 订阅、CSV 导入与按模块导出、报表目录与规则引擎、公开分享、OIDC 身份源、附件共享策略，以及飞书 / 企微通讯录、考勤与消息同步。",
  },
  "/service-desk": {
    title: "AI客服",
    description:
      "账号级客服：一个账号可挂多个官网站点，访客从官网客服窗口进来，由本组织职员/代理人真人接待；AI 按设置做固定文案、回复建议或自动应答，自动模式可随时转人工，纯AI接待模式不转人工。",
  },
  "/notifications": {
    title: "系统消息",
    description:
      "全站需要你知道或处理的事件：客服、需求与商机、身份与签约、财税与申报、自动化与集成、群控任务、账号与平台。",
  },
  "/developer/keys": {
    title: "API Key 管理",
    description:
      "两套 Key 分别管理：本系统 ek_ Key 用于调用开放接口（/api/v1），生成 / 重置 / 吊销都在本页；AIPDD API Key（sk-）在同一页绑定，开通同步发布到 AIworkin、服务商数据同步、建联资源等上游能力——没有账号时按页内三步引导：去 www.aipdd.work 注册（填推荐码赠算力）→ 创建 Key → 回来绑定，Key 加密保存永不回显。所在省 / 市等基础数据由平台统一 Key 提供（平台管理后台 → 系统设置 → AIPDD 平台 Key），不绑定也能填表单。",
  },
  "/content": {
    title: "内容创作工具",
    description:
      "一屏工具卡片：文案、图片、视频、配音配乐、去水印与超分，末尾是「视频创作工具」（AIPDD Drama Agent，点卡片先看简介与网关配置——支持直接粘贴 AIPDD / AIworkin 的 API Key，那一页再去它的 GitHub Releases 下载）。生成结果自动存进本账号的 AIPDD 数字资产；模型与 Key 在「模型服务 → 模型设置」里配置。",
  },
  "/content/canvas": {
    title: "AI 画布",
    description:
      "一个入口四个 Tab：我的画布（节点式编排：提示词、数字资产素材、模型配置、生成节点连起来出图/出片/出曲，任务在画布内管理）、生图工作台、视频创作台、音乐创作台。模型与规格只认所选模型声明的能力；产物自动存进数字资产。",
  },
  "/community": {
    title: "创意社区",
    description:
      "官方 Comfy Cloud 的工作流市场：按分类挑现成的图像 / 视频 / 音频 / 3D / 文本工作流，填参数即可在站内直接运行，跑的是你自己绑定的 Comfy Cloud API Key 与订阅积分（本站不代付算力，免费套餐不含 API 访问）；产物会自动转存进本站对象存储并登记进数字资产。也可以把工作流发布上来，审核通过并被推荐进市场后获得积分奖励。",
  },
  "/content/video-templates": {
    title: "视频模版社区",
    description:
      "视频模版市场：按使用量 / 最新 / 最多收藏排序与关键词查找；发布样片、参考图与提示词即可上架，查看配方可设积分（被查看即给发布者积分）。点「使用模版生成」把提示词与参考图带到生成器，选择自己的视频模型直接出片，成片自动登记进数字资产。",
  },
  "/assets": {
    title: "数字资产管理",
    description:
      "与 AIPDD 数字资产完全同步：按文件 / 图片 / 视频 / 音频查询、打标签，也可以直接上传资产（上传即登记到平台，本地不存副本）。",
  },
    "/model-plaza": {
    title: "模型广场",
    description:
      "平台统一上架的可用模型目录：按输入/输出分别标价（图像/语音按次），支持在线试用、查看我的调用用量与成本，并给出 OpenAI 兼容接入地址与 API Key 管理入口。",
  },
  "/model-settings": {
    title: "模型设置",
    description:
      "Agent 与内容创作共用的模型配置：AIPDD 渠道直接用「API Key 管理」里的 sk- Key，也可接入其他 OpenAI 兼容网关与火山 AI MediaKit，并为每种类型选定默认模型。",
  },
  "/developer/api-mcp-skill": {
    title: "API-MCP-Skill",
    description:
      "模型服务的统一入口：Skill 页签列出平台管理员生成的技能包，点开即可下载；MCP Server 页签给出接入地址、鉴权与工具清单；API 页签是本系统对外接口、渠道与错误码总览。",
  },
  "/admin": {
    title: "平台管理后台",
    description: "服务商备案与资质管理、签约监管、服务商能力开通及系统设置。",
  },
  // 各板块标题 / 说明与侧栏菜单同源（ADMIN_SECTIONS），顶栏与页面 hero 直接取这里。
  ...Object.fromEntries(
    ADMIN_SECTIONS.map((item) => [
      `${ADMIN_PATH_PREFIX}/${item.key}`,
      { title: item.name, description: item.desc },
    ]),
  ),
};
