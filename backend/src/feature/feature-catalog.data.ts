/**
 * §5.10 功能目录种子与「code → API 前缀」映射（方案设计的代码侧常量）。
 *
 * - 目录树与 frontend/src/config/routes.ts 的 enterpriseRoute 六组菜单一一对应（懒播种进 feature_catalog 表）；
 * - DB 行只存展示与状态（title/path/protected/sortOrder），API 前缀映射放这里，改映射＝发版、改状态＝后台点开关；
 * - 拦截按「最长前缀命中」：/enterprise/content/digital-assets/upload 先命中 assets，再落 content-tools 的 /enterprise/content；
 * - 不映射的共享通道（/enterprise/connections、/enterprise/market/:domain、/enterprise/external、
 *   /enterprise/services、/enterprise/capabilities 等被多板块共用）一律不拦截，避免关一个板块误伤一片；
 * - menu-only 功能（聚合页、外链、文档页）不给 apiPrefixes，只控制菜单显隐，不拦后端。
 */

export type FeatureSeedKind = 'GROUP' | 'MENU';

export interface FeatureSeedNode {
  code: string;
  kind: FeatureSeedKind;
  /** 父节点 code；顶级分组为空串 */
  parentCode: string;
  title: string;
  /** 前端路径（外链原样存）；GROUP 为空串 */
  path: string;
  /** protected＝不可关（认证会话/平台管理自身/账户计费/合规退出），求值强制 open */
  protected: boolean;
  sortOrder: number;
}

const group = (
  code: string,
  title: string,
  sortOrder: number,
  parentCode = '',
  protectedFlag = false,
): FeatureSeedNode => ({
  code,
  kind: 'GROUP',
  parentCode,
  title,
  path: '',
  protected: protectedFlag,
  sortOrder,
});
const menu = (
  code: string,
  parentCode: string,
  title: string,
  path: string,
  sortOrder: number,
  protectedFlag = false,
): FeatureSeedNode => ({
  code,
  kind: 'MENU',
  parentCode,
  title,
  path,
  protected: protectedFlag,
  sortOrder,
});

/** 与前端 enterpriseRoute 同构的种子树；ensureSeed 只补插缺失 code，不覆盖管理员改过的行。 */
export const FEATURE_SEED: FeatureSeedNode[] = [
  // ---------- 工作台 ----------
  group('workbench', '工作台', 10),
  // 驾驶舱与我的任务在侧栏是实打实的菜单项，此前目录里没有节点，后台功能开关管不到它们。
  menu('dashboard', 'workbench', '驾驶舱', '/dashboard', 5),
  menu('task-center', 'workbench', '我的任务', '/tasks', 7),
  menu('agent', 'workbench', 'Agent', '/agent', 10),
  // Agent-Bot 单页四页签（AWBotDSH主机 / AWBot手机 / WorkBuddy企业云 / AI调用账号），
  // 原分组与「Bot 主机」「Workbuddy 企业版」两个子菜单已收敛进这一页。
  menu('agent-bot', 'workbench', 'Agent-Bot', '/agent-bot', 25),
  menu('data-table', 'workbench', '多维表格', '/data-table', 30),
  menu('rpa', 'workbench', 'RPA自动化', '/rpa', 40),
  group('content-creation', '内容创作', 50, 'workbench'),
  menu('content-tools', 'content-creation', '内容创作工具', '/content', 10),
  // AI 画布与三个工作台同属一个开关；画布任务仍走 /enterprise/content/jobs（归 content-tools）
  menu('content-canvas', 'content-creation', 'AI 画布', '/content/canvas', 15),
  menu('community', 'content-creation', '创意社区', '/community', 20),
  menu(
    'video-templates',
    'content-creation',
    '视频模版',
    '/content/video-templates',
    30,
  ),
  menu('marketing-tools', 'workbench', '营销工具', '/marketing-tools', 60),
  // GEO 独立站建站器是 GEO 卡片内的一个页签，单独成码：关掉只停建站，不影响可见度报告与采集
  menu(
    'geo-site',
    'marketing-tools',
    'GEO 独立站建站',
    '/marketing-tools?tab=geo-site',
    20,
  ),
  // 企微 SCRM 是营销工具页内的一张工具卡（8 个页签），单独建 code 以便整卡关闭
  menu(
    'wecom-scrm',
    'marketing-tools',
    '企业微信 SCRM',
    '/marketing-tools?tab=wecom-scrm',
    10,
  ),
  menu('assets', 'workbench', '数字资产管理', '/assets', 70),
  // ---------- 建站管理（卡片页：小程序三板块 + Web建站；插在营销工具之后、智慧分析之前）----------
  menu('site-builder', 'workbench', '建站管理', '/site-builder', 62),
  menu('knowledge-pay', 'site-builder', '知识付费云课堂', '/knowledge-pay', 10),
  menu('onsite', 'site-builder', '上门服务小程序', '/onsite', 20),
  menu('brand-mall', 'site-builder', '品牌商城', '/brand-mall', 30),
  // 数字人小程序工具：每个平台账号一套站点，顾客端是微信小程序（出包直传或下载导入）。
  menu(
    'digital-human',
    'site-builder',
    '数字人小程序工具',
    '/digital-human',
    35,
  ),
  // 卡密商城：一站一批卡密商品与订单，买家端走免登录公开通道。
  menu('card-shop', 'site-builder', '卡密商城小程序', '/card-shop', 36),
  // 快递寄件：一个账号一部小程序，寄件点按位置管理报价与订单，买家端走免登录公开通道。
  menu('kuaidi', 'site-builder', '快递寄件小程序', '/kuaidi', 37),
  // 圈子社区：账号负责人即社区管理员，圈子/帖子/评论/举报/消息，C 端成员独立于站内账号。
  menu('circle', 'site-builder', '圈子社区小程序', '/circle', 39),
  // 跑腿小程序：账号负责人即小程序管理员，顾客/骑手走 /api/public/errand 免登录通道。
  menu('errand', 'site-builder', '跑腿小程序', '/errand', 39),
  // 多店铺商城平台（B2B2C）：市场运营方开一个市场、招商户入驻；商户后台走独立账号通道，
  // 买家端小程序（mp-miniprogram）按 B3 出包，公开通道 /api/public/market/** 不受功能开关影响。
  menu('marketplace', 'site-builder', '多店铺商城平台', '/marketplace', 38),
  // 健康管理小程序：一店一部自己运营的健康小程序（机构/医护、挂号问诊、档案随访、商城与分账台账）。
  menu('health', 'site-builder', '健康管理小程序', '/health', 40),
  // 国际独立站的卡片入口挂在本板块下，页面仍是营销工具页内同名页签；
  // API 拦截继续由 geo-site 码负责（同一前缀不双码映射，见 §5.10 注释），这里只做卡片显隐。
  menu(
    'global-site',
    'site-builder',
    '国际独立站',
    '/marketing-tools?tab=international-site',
    40,
  ),
  // 答题小程序：题库与交卷记录落在账号自己的多维表格，选手端走微信免登录通道。
  menu('quiz', 'site-builder', '答题小程序', '/quiz', 41),
  // 园区管理：租约与周期账单、门岗核验、访客预约通行码，租户端是微信小程序。
  menu('park', 'site-builder', '园区管理小程序', '/park', 42),
  // 租赁管理（车辆 / 设备 / 场地通用建模）只有 RBAC 模块 key，功能目录暂不挂子码：
  // 卡片入口靠 module 收窄，接口仍由 rbac 的 /enterprise/rental/ 前缀授权，不因本行改动而新增整域拦截。
  // ---------- 智慧分析（营销工具同款卡片页：单菜单 + 两张工具卡子项）----------
  menu('insight', 'workbench', '智慧分析', '/insight', 65),
  menu(
    'insight-hotspot',
    'insight',
    '全域内容热点分析',
    '/insight/hotspot',
    10,
  ),
  menu('insight-trends', 'insight', '流行趋势分析', '/insight/trends', 20),
  menu('insight-fde', 'insight', 'AI-FDE实施分析', '/insight/fde', 30),
  menu('insight-consulting', 'insight', '企业咨询', '/insight/consulting', 40),
  menu('mail', 'workbench', 'AI邮箱服务', '/mail', 80),
  menu('crm', 'workbench', 'CRM', '/crm', 90),
  menu('bi', 'workbench', 'BI智能分析', '/bi', 100),
  menu('oa', 'workbench', 'OA', '/oa', 110),
  menu('okr', 'workbench', 'OKR计划', '/okr', 120),
  menu('service-desk', 'workbench', 'AI客服', '/service-desk', 130),
  menu('app-center', 'workbench', '应用中心', '/app-center', 140),
  menu('question-hall', 'workbench', '专题大厅', '/question-hall', 150),
  menu('kb', 'workbench', '知识库', '/kb', 160),
  menu('hrm', 'workbench', 'HR工作台', '/hrm', 170),
  menu('project', 'workbench', '项目管理', '/project', 180),
  menu('erp', 'workbench', '进销存', '/erp', 190),
  // ---------- 业务服务 ----------
  group('business-services', '业务服务', 20),
  menu('marketing', 'business-services', '营销服务', '/marketing', 10),
  menu('supply', 'business-services', '供销网络', '/supply', 20),
  menu('tax', 'business-services', '财税服务', '/tax', 30),
  menu('overseas', 'business-services', '跨境出海', '/overseas', 40),
  menu('flex', 'business-services', '灵活用工', '/flex', 50),
  menu('logistics', 'business-services', '物流服务', '/logistics', 60),
  menu('smart', 'business-services', 'IT服务', '/smart', 70),
  menu('ip', 'business-services', '知识产权', '/ip', 80),
  menu('legal', 'business-services', '法律服务', '/legal', 90),
  menu('think-tank', 'business-services', '智库服务', '/think-tank', 100),
  menu('asset-trading', 'business-services', '资产交易', '/asset', 110),
  menu('market-hub', 'business-services', '供需市场', '/market', 120),
  // ---------- 商务人脉 ----------
  group('networking', '商务人脉', 30),
  // 社交与招聘全部由 AIworkin 的 DSH 社交插件提供，本站只有入口与 Key 准入。
  menu('ai-social', 'networking', 'AI社交', '/ai-social', 10),
  // ---------- 管理设置（identity/points/invite 属合规退出与账户计费，protected 不可关） ----------
  group('manage-settings', '管理设置', 40),
  menu('identity', 'manage-settings', '身份与资质', '/identity', 10, true),
  menu('staff', 'manage-settings', '职员/代理人管理', '/staff', 20),
  // 子账号与操作日志：菜单可关，但 /enterprise/rbac 不映射——关掉入口不能把主账号锁在成员管理之外。
  menu(
    'sub-account-team',
    'manage-settings',
    '子账号与操作日志',
    '/account/team',
    25,
  ),
  menu('contracts', 'manage-settings', '签约管理', '/contracts', 30),
  // 我的套餐：已购官方服务套餐与交付进度（购买入口分散在各业务板块，接口与板块共享）
  menu('my-packages', 'manage-settings', '我的套餐', '/my-packages', 35),
  menu('points-center', 'manage-settings', '积分中心', '/points', 40, true),
  menu('invite', 'manage-settings', '我的邀请', '/invite', 50, true),
  // ---------- 开放集成（api-keys 是认证会话底座，protected 不可关） ----------
  group('open-integration', '开放集成', 50),
  menu(
    'developer-keys',
    'open-integration',
    'API Key 管理',
    '/developer/keys',
    10,
    true,
  ),
  menu('model-plaza', 'open-integration', '模型广场', '/model-plaza', 15),
  menu('model-settings', 'open-integration', '模型设置', '/model-settings', 20),
  // API 文档 / MCP Server / Skill 下载三页签合一，沿用原 MCP Server 的排序位置
  menu(
    'api-mcp-skill',
    'open-integration',
    'API-MCP-Skill',
    '/developer/api-mcp-skill',
    30,
  ),
  menu(
    'developer-mechanisms',
    'open-integration',
    '平台机制',
    '/developer/mechanisms',
    50,
  ),
  // ---------- 智能硬件（「开放集成」下的子分组，与前端三级菜单同构） ----------
  group('hardware', '智能硬件', 60, 'open-integration'),
  menu('hardware-plaza', 'hardware', '硬件广场', '/hardware', 10),
  menu('hardware-devices', 'hardware', '添加硬件', '/hardware/devices', 20),
  menu('hardware-mcp', 'hardware', '硬件MCP', '/hardware/mcp', 30),
  menu('hardware-api', 'hardware', '硬件API', '/hardware/api', 40),
  // ---------- AI增值服务（外链，menu-only） ----------
  group('ai-services', 'AI增值服务', 60),
  menu('ai-compute', 'ai-services', '算力服务', 'https://app.aipdd.work', 10),
  menu('ai-a2a', 'ai-services', 'A2A供需平台', 'https://www.aiworkin.com', 20),
];

/**
 * 功能 code → 后端 API 前缀（拦截口径：命中前缀即要求该 code 及其全部祖先 GROUP open）。
 * 与 packages/contracts 端点段一一对齐；AI 社交只代理准入与入口，后端前缀是 /enterprise/ai-social。
 */
export const FEATURE_API_PREFIXES: Record<string, string[]> = {
  // 驾驶舱聚合的是各板块自有接口，没有独立前缀；关掉只摘菜单，不能误伤一片读接口。
  dashboard: [],
  'task-center': ['/enterprise/my-tasks/'],
  // 子账号与操作日志属账号安全面：菜单可关，接口始终放行（见 PROTECTED_PATH_PREFIXES 同口径考量）。
  'sub-account-team': [],
  agent: ['/enterprise/agent', '/enterprise/skillhub'],
  // Agent-Bot 单码管整页：主机通道、WorkBuddy 通道与 AI 调用账号界面端点同开同关
  'agent-bot': [
    '/enterprise/workbuddy',
    '/enterprise/bot-hosts',
    '/enterprise/ai-call',
  ],
  'data-table': ['/enterprise/data-tables'],
  rpa: ['/enterprise/rpa'],
  // 内容创作聚合页板块：PDP 详情页工具与多平台分发都归这一块；digital-assets 单独由 assets 接管（最长前缀）
  'content-tools': [
    '/enterprise/content',
    '/enterprise/distribution',
    '/enterprise/ecom-pdp',
    '/enterprise/domestic-pdp',
  ],
  // 画布前缀比 /enterprise/content 长：关闭画布不影响既有小工具
  'content-canvas': [
    '/enterprise/content/canvas',
    '/enterprise/content/studio',
  ],
  assets: ['/enterprise/content/digital-assets'],
  // 采集 SKILL 包清单挂板块底座码：两个工具各配自己那组采集目的，但下载同一份包清单，
  // 关掉其中一个工具不应把另一个工具的下载入口藏掉。
  insight: ['/enterprise/insight/skills'],
  // 智慧分析：热点工具接管 /insight/hotspot、/subscriptions、/metrics 与热点侧采集配置
  'insight-hotspot': [
    '/enterprise/insight/hotspot',
    '/enterprise/insight/subscriptions',
    '/enterprise/insight/metrics',
    '/enterprise/insight/sources',
    '/enterprise/insight/runs',
  ],
  // 趋势工具的 /enterprise/insight/trends 前缀已覆盖其采集配置（trends/sources|runs|subscriptions）
  'insight-trends': ['/enterprise/insight/trends'],
  // AI-FDE 实施分析：独立工具码，整段 /fde 前缀受功能开关控制
  'insight-fde': ['/enterprise/insight/fde'],
  // 企业咨询：独立工具码，整段 /consulting 前缀受功能开关控制
  'insight-consulting': ['/enterprise/insight/consulting'],
  community: ['/enterprise/community'],
  // 知识付费小程序工具：管理端整域拦截；小程序终端会员走 /api/public/knowledge-pay（免登录通道不受功能开关影响）
  'knowledge-pay': ['/enterprise/knowledge-pay'],
  // 国际独立站卡片码不映射前缀：建站 API 继续归 geo-site 码拦（同前缀不双码），本码只控卡片显隐
  'global-site': [],
  // 上门服务小程序工具：店主端整域拦截；C 端顾客走 /api/public/onsite（免登录通道不受开关影响），
  // 平台侧 /enterprise/admin/onsite 属 protected，关板块也仍可查看与停服。
  onsite: ['/enterprise/onsite'],
  'brand-mall': ['/enterprise/brand-mall'],
  // 数字人小程序工具：管理端整域拦截；小程序终端会员与供应商回调走 /api/public/digital-human（免登录通道不受开关影响）
  'digital-human': ['/enterprise/digital-human'],
  // 卡密商城：店主端整域拦截；买家端走 /api/public/card-shop（免登录通道不受开关影响），
  // 平台侧 /enterprise/admin/card-shop 属 protected，只留板块参数与订单排查，不介入单店。
  'card-shop': ['/enterprise/card-shop'],
  // 快递寄件：店主端整域拦截；买家端走 /api/public/kuaidi（免登录通道不受开关影响），
  // 平台侧 /enterprise/admin/kuaidi 属 protected，只保留板块闸门与全平台统计。
  kuaidi: ['/enterprise/kuaidi'],
  // 圈子社区：店主端整域拦截；买家端走 /api/public/circle，由 tool-launch 公开闸门单独判定。
  circle: ['/enterprise/circle'],
  // 跑腿小程序：店主端整域拦截；顾客与骑手走 /api/public/errand（免登录通道不受开关影响），
  // 平台侧 /enterprise/admin/errand 属 protected，只保留板块闸门与全平台统计。
  errand: ['/enterprise/errand'],
  // 多店铺商城平台：运营方整域拦截；商户通道 /api/merchant/mp 与买家公开通道 /api/public/market
  // 都不在站内鉴权链上，不受开关影响（关板块＝市场停服，而不是让已入驻商户接口 500）。
  marketplace: ['/enterprise/marketplace'],
  // 健康管理小程序工具：店主端整域拦截；顾客端与医护端走 /api/public/health（免登录通道不受开关影响），
  // 平台侧 /enterprise/admin/health 属 protected，只保留板块开关、资金总闸与只读订单排查。

  health: ['/enterprise/health'],
  // 视频模版单独成码：前缀比 /enterprise/content 长，关闭模版不影响其它内容工具
  'video-templates': ['/enterprise/content/video-templates'],
  // GEO 独立站建站器单独成码：前缀比 /enterprise/geo 长，关掉建站不影响 GEO 监测与采集
  'geo-site': ['/enterprise/geo/site'],
  // 营销工具聚合页的独立后端域（达人建联走共享 connections 通道，不映射）
  'marketing-tools': [
    '/enterprise/geo',
    '/enterprise/seo',
    '/enterprise/lead-prospecting',
    '/enterprise/bigdata',
    '/enterprise/aliyun-call',
    '/enterprise/aliyun-mail',
    '/enterprise/tencent-qidian',
    '/enterprise/mkt',
    '/enterprise/acquisition',
    '/enterprise/wecom-scrm',
  ],
  mail: ['/enterprise/mail'],
  crm: ['/enterprise/crm'],
  bi: ['/enterprise/bi'],
  oa: ['/enterprise/oa'],
  okr: ['/enterprise/okr'],
  'service-desk': ['/enterprise/service-desk'],
  project: ['/enterprise/project'],
  erp: ['/enterprise/erp'],
  park: ['/enterprise/park'],
  'app-center': ['/enterprise/apps', '/enterprise/lowcode'],
  'question-hall': ['/enterprise/question-hall'],
  quiz: ['/enterprise/quiz'],
  hrm: ['/enterprise/hrm'],
  marketing: ['/enterprise/marketing'],
  supply: ['/enterprise/supply'],
  tax: ['/enterprise/tax', '/enterprise/invoice-requests', '/enterprise/qxy'],
  overseas: ['/enterprise/overseas'],
  flex: ['/enterprise/flex'],
  logistics: ['/enterprise/logistics'],
  smart: ['/enterprise/smart'],
  ip: ['/enterprise/ip'],
  legal: ['/enterprise/legal'],
  'think-tank': ['/enterprise/think-tank'],
  'asset-trading': ['/enterprise/asset'],
  // 供需市场读写走共享通道 /enterprise/market/:domain（与各板块同一前缀），只做菜单显隐不单独拦截
  'market-hub': [],
  'ai-social': ['/enterprise/ai-social'],
  staff: ['/enterprise/staff', '/enterprise/org-staff'],
  contracts: ['/enterprise/contracts'],
  // 我的套餐：/enterprise/service-packages 被各业务板块的购买入口共用，只做菜单显隐不单独拦截
  'my-packages': [],
  // 模型广场：站内目录/试用/用量 + 对外 OpenAI 兼容网关（/v1 在根 app 上，由网关内自行校验开关）
  'model-plaza': ['/enterprise/model-plaza'],
  // model-settings 的后端落在 /enterprise/content/* 里（与内容创作共通道），只做菜单显隐不单独拦截
  'model-settings': [],
  // API-MCP-Skill：MCP 服务端端点（contracts MCP_ENDPOINT_PATH = /api/v1/mcp）关掉即整个
  // MCP 通道 403；Skill 页签的生成包列表与下载同属该菜单开关。
  'api-mcp-skill': ['/api/v1/mcp', '/enterprise/generated-skills'],
  // 平台机制：事件与外发、批量数据、报表与规则、公开分享、身份源与 IM 同步（附件共享策略在 /enterprise/mechanisms 下）
  'developer-mechanisms': [
    '/enterprise/webhooks',
    '/enterprise/import',
    '/enterprise/export',
    '/enterprise/reports',
    '/enterprise/rules',
    '/enterprise/shares',
    '/enterprise/oidc',
    '/enterprise/im-sync',
    '/enterprise/mechanisms',
  ],
  // 智能硬件：用户侧与后台共用 /enterprise/hardware；对外机器通道 /api/v1/hardware（含 MCP 端点）。
  // 设备通道 /api/public/hardware/** 刻意不映射——关板块不能把已接入设备的心跳掐死。
  hardware: ['/enterprise/hardware', '/api/v1/hardware'],
  'hardware-plaza': [],
  'hardware-devices': [],
  'hardware-mcp': [],
  'hardware-api': [],
  'ai-compute': [],
  'ai-a2a': [],
};

/**
 * protected 基础设施前缀：中间件直接跳过（不查开关、永远不会 FEATURE_CLOSED）。
 * 覆盖方案 §5.10 四类保护组：认证会话 / 平台管理自身 / 账户计费 / 合规退出。
 */
export const PROTECTED_PATH_PREFIXES = [
  '/api/auth',
  '/api/session',
  '/api/points-config',
  '/enterprise/auth',
  '/enterprise/session',
  '/enterprise/me',
  '/enterprise/admin',
  '/enterprise/platform',
  '/enterprise/account',
  '/enterprise/identity',
  '/enterprise/points',
  '/enterprise/api-keys',
  '/enterprise/notifications',
  '/enterprise/help',
];
