import type { PrismaService } from '../prisma/prisma.service';

/**
 * 建站工具启动目录：一码三用（功能开关卡片码＝启动台账 toolCode＝价目行 pricingCode）。
 *
 * 口径集中在这一张表，闸门、账单、启动页文案都从这里取，新增建站工具只需加一行：
 * - `adminPrefixes`：管理端 API 前缀，未启动时这些前缀下的写操作一律拒绝；
 *   只用前缀判断、不认具体业务语义，避免每加一个接口就要改闸门；
 * - `publicPrefix`：C 端公开通道前缀，未启动时该前缀下的请求返回各工具已有的停服形状；
 * - `countLegacy`：存量探针——本方案上线前就已有站点/店铺的账号，默认按「已启动 + 免费过渡期」处理，
 *   绝不因为加了闸门就把正在营业的店当场打死。
 */
export const TOOL_CODES = [
  'knowledge-pay',
  'onsite',
  'brand-mall',
  'takeout',
  'health',
  'marketplace',
  'digital-human',
  'card-shop',
  'kuaidi',
  'errand',
  'circle',
  'global-site',
  'park',
] as const;

export type ToolCode = (typeof TOOL_CODES)[number];

export type ToolDescriptor = {
  code: ToolCode;
  /** `module_pricing.code`：价目行主键，与既有下划线口径保持一致。 */
  pricingCode: string;
  name: string;
  /** 站内入口（启动设置页与横幅跳转用）。 */
  path: string;
  /** 管理端 API 前缀：命中即归属本工具。 */
  adminPrefixes: string[];
  /** C 端公开通道前缀：命中即归属本工具。 */
  publicPrefix: string;
  /** 该工具的一句话业务口径，启动确认弹层展示。 */
  summary: string;
  /** 已有独立账单体系（国际独立站按站点自然月出账）：启动只做功能闸，不叠第二套周期账单。 */
  ownBilling?: boolean;
  /** 存量探针：该账号在本工具下是否已有站点/店铺。 */
  countLegacy(prisma: PrismaService, userId: string): Promise<number>;
};

export const TOOL_LAUNCH_CATALOG: ToolDescriptor[] = [
  {
    code: 'knowledge-pay',
    pricingCode: 'knowledge_pay',
    name: '知识付费云课堂',
    path: '/knowledge-pay',
    adminPrefixes: ['/enterprise/knowledge-pay'],
    publicPrefix: '/api/public/knowledge-pay',
    summary:
      '课程与课时目录、试看与积分解锁、学习进度与完课、评价回复与会员卡密，一套云课堂小程序。',
    countLegacy: (prisma, userId) =>
      prisma.knowledgePaySite.count({ where: { userId } }),
  },
  {
    code: 'onsite',
    pricingCode: 'onsite',
    name: '上门服务小程序',
    path: '/onsite',
    adminPrefixes: ['/enterprise/onsite'],
    publicPrefix: '/api/public/onsite',
    summary: '服务项目与技师档期、上门下单与门店自营，可开多家门店。',
    countLegacy: (prisma, userId) =>
      prisma.onsiteShop.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'brand-mall',
    pricingCode: 'brand_mall',
    name: '品牌商城',
    path: '/brand-mall',
    adminPrefixes: ['/enterprise/brand-mall'],
    publicPrefix: '/api/public/brand-mall',
    summary: '自建卖货小程序：商品多规格、装修、订单售后与顾客运营，可开多店。',
    countLegacy: (prisma, userId) =>
      prisma.brandShop.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'takeout',
    pricingCode: 'takeout',
    name: '外卖点餐小程序',
    path: '/takeout',
    adminPrefixes: ['/enterprise/takeout'],
    publicPrefix: '/api/public/takeout',
    summary:
      '门店菜单、配送/自取/堂食、取餐号与顾客运营，一套独立数据域的外卖小程序。',
    countLegacy: (prisma, userId) =>
      prisma.takeoutShop.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'health',
    pricingCode: 'health',
    name: '健康管理小程序',
    path: '/health',
    adminPrefixes: ['/enterprise/health'],
    publicPrefix: '/api/public/health',
    summary: '机构与医护入驻、号源排班、挂号问诊与档案随访，可开多店。',
    countLegacy: (prisma, userId) =>
      prisma.healthShop.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'marketplace',
    pricingCode: 'marketplace',
    name: '多店铺商城平台',
    path: '/marketplace',
    adminPrefixes: ['/enterprise/marketplace'],
    publicPrefix: '/api/public/market',
    summary:
      '做平台方：建市场与统一类目、审核商户入驻、跨商户拆单与抽佣结算（商户后台是独立账号体系，不受本站开关影响）。',
    countLegacy: (prisma, userId) =>
      prisma.mpMarket.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'digital-human',
    pricingCode: 'digital_human',
    name: '数字人小程序',
    path: '/digital-human',
    adminPrefixes: ['/enterprise/digital-human'],
    publicPrefix: '/api/public/digital-human',
    summary: '形象与声音克隆、文案配音合成口播视频、会员套餐与两级分销。',
    countLegacy: (prisma, userId) =>
      prisma.digitalHumanSite.count({ where: { userId } }),
  },
  {
    code: 'card-shop',
    pricingCode: 'card_shop',
    name: '卡密商城小程序',
    path: '/card-shop',
    adminPrefixes: ['/enterprise/card-shop'],
    publicPrefix: '/api/public/card-shop',
    summary:
      '自动发卡商店：卡密商品、支付即发卡、凭单号自助查单取卡，可开多站。',
    countLegacy: (prisma, userId) =>
      prisma.cardShopSite.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'kuaidi',
    pricingCode: 'kuaidi',
    name: '快递寄件小程序',
    path: '/kuaidi',
    adminPrefixes: ['/enterprise/kuaidi'],
    publicPrefix: '/api/public/kuaidi',
    summary: '一个账号一部小程序、多个寄件点就近下单，报价与履约状态机齐全。',
    countLegacy: (prisma, userId) =>
      prisma.kuaidiSite.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'circle',
    pricingCode: 'circle',
    name: '圈子社区小程序',
    path: '/circle',
    adminPrefixes: ['/enterprise/circle'],
    publicPrefix: '/api/public/circle',
    summary:
      '账号负责人即社区管理员：分类与圈子、成员与关注、图文帖与楼中楼评论、举报与消息，一套独立社区小程序。',
    countLegacy: (prisma, userId) =>
      prisma.circleCommunity.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'errand',
    pricingCode: 'errand',
    name: '跑腿小程序',
    path: '/errand',
    adminPrefixes: ['/enterprise/errand'],
    publicPrefix: '/api/public/errand',
    summary:
      '同城帮送/帮买：账号负责人即小程序管理员，按起步价 + 距离 + 重量 + 夜间与帮买服务费自动计价，骑手报名审核、接单履约与钱包提现一套打通。',
    countLegacy: (prisma, userId) =>
      prisma.errandSite.count({ where: { ownerUserId: userId } }),
  },
  {
    code: 'global-site',
    pricingCode: 'geo_site',
    name: '国际独立站',
    path: '/international-site',
    // 只拦建站器域：/enterprise/geo 下的 GEO 监测与采集属另一板块，不因未启动被挡
    adminPrefixes: ['/enterprise/geo/site'],
    publicPrefix: '/api/public/geo-sites',
    summary: '拖拽搭建对外站点：多语言内容、平台子域或自有域名发布。',
    ownBilling: true,
    countLegacy: (prisma, userId) =>
      prisma.geoSite.count({ where: { ownerUserId: userId } }),
  },
];

export const TOOL_LAUNCH_BY_CODE = new Map<ToolCode, ToolDescriptor>(
  TOOL_LAUNCH_CATALOG.map((item) => [item.code, item]),
);

export function toolDescriptor(code: string): ToolDescriptor | undefined {
  return TOOL_LAUNCH_BY_CODE.get(code as ToolCode);
}

/** 启动设置页地址（前端路由）：错误提示与横幅都跳这里。 */
export function launchPathOf(code: ToolCode): string {
  return `/site-builder/launch?tool=${code}`;
}

function hit(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * 管理端路径 → 工具：最长前缀优先（`/enterprise/geo/site` 比 `/enterprise/geo` 长）。
 * 平台管理侧 `/enterprise/admin/**` 与账户计费侧永不归属工具——欠费用户必须还能充值。
 */
export function toolCodeForAdminPath(path: string): ToolCode | undefined {
  let best: { code: ToolCode; len: number } | undefined;
  for (const item of TOOL_LAUNCH_CATALOG) {
    for (const prefix of item.adminPrefixes) {
      if (hit(path, prefix) && (!best || prefix.length > best.len)) {
        best = { code: item.code, len: prefix.length };
      }
    }
  }
  return best?.code;
}

export function toolCodeForPublicPath(path: string): ToolCode | undefined {
  return TOOL_LAUNCH_CATALOG.find((item) => hit(path, item.publicPrefix))?.code;
}

/**
 * 管理端闸门的放行名单：这些前缀下的写操作与「能不能用工具」无关，
 * 挡掉就会造成「欠费停服 → 连充值和自救配置都改不了」的死锁。
 */
export const LAUNCH_GATE_ALLOW_PREFIXES = [
  '/enterprise/tool-launch',
  '/enterprise/points',
  '/enterprise/account',
  '/enterprise/auth',
  '/enterprise/session',
  '/enterprise/me',
  '/enterprise/admin',
] as const;

export function isLaunchGateAllowed(path: string): boolean {
  return LAUNCH_GATE_ALLOW_PREFIXES.some((prefix) => hit(path, prefix));
}
