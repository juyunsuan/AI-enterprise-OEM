import type { PrismaService } from '../prisma/prisma.service';
import type { ToolCode } from '../tool-launch/tool-launch.catalog';
import { TOOL_LAUNCH_BY_CODE } from '../tool-launch/tool-launch.catalog';

/**
 * 小程序「源码分发包 + 发布说明」的元数据目录：一工具一行。
 *
 * - 工具码与站内路径**直接复用** tool-launch.catalog（同一份枚举，不再另立）；
 * - 模板目录的环境变量名 / 仓库默认目录**照抄各域出包服务里的既有常量**
 *   （见各行注释的出处文件），保证说明页展示的包与真实出包同源的模板；
 * - configKey 是用户要在模板 `config.js` 里手填的租户码字段名（按各模板实际键名），
 *   取值来源写清是哪个根实体的哪个字段，说明页据此渲染「这个账号该填什么」。
 */

/** 说明页要展示的租户根实体行（各域模型字段名不一，先归一到这里）。 */
export type MiniGuideRootRow = {
  id: number;
  /** 公开寻址码：config.js 里租户码字段的应填值 */
  code: string;
  /** 站点/店铺名：多店时用来区分这是哪一部的参数 */
  name: string;
  /** 仅知识付费用：AppID 挂在站点行（KnowledgePaySite.wxAppId），其余场景走 miniprogram_apps */
  appId?: string;
};

export type MiniGuideTenantField = {
  /** config.js 里的字段名：site / shopCode / marketCode / siteCode */
  configKey: string;
  /** 中文名，说明页展示 */
  label: string;
  /** 取值来源的「模型.字段」文案，进 hint，避免用户去猜 */
  source: string;
  /** 一人多店/多站点：说明页取最早创建的一部，并提示各店参数不同 */
  multiRoot: boolean;
  /** 账号级主体：miniprogram_apps.shopId 固定 0（快递/圈子），不是根实体 id。 */
  accountLevel?: boolean;
  listRoots: (
    prisma: PrismaService,
    userId: string,
  ) => Promise<MiniGuideRootRow[]>;
};

export type MiniGuideToolMeta = {
  code: ToolCode;
  /** 是否提供小程序源码分发包（国际独立站是 Web 产物，没有小程序）。 */
  hasPackage: boolean;
  /** 模板目录：环境变量优先、缺省落仓库根目录（与 private-mini/templateDirFrom 同口径）。 */
  template?: { envName: string; fallbackDir: string };
  /** miniprogram_apps.scene；知识付费不用这张表（AppID 挂在 KnowledgePaySite.wxAppId），为 undefined。 */
  scene?: string;
  /** 租户码：config.js 里的键名 + 取值来源（根实体字段以 schema 实测为准）。 */
  tenant?: MiniGuideTenantField;
  /** 说明页正文里「去哪里建这个站点/店铺」的入口名，缺失租户码时的可操作提示用。 */
  rootNoun: string;
};

export const MINI_GUIDE_TOOLS: MiniGuideToolMeta[] = [
  {
    code: 'knowledge-pay',
    hasPackage: true,
    // 知识付费已统一为直下源码包，模板目录只在这里登记一次
    template: {
      envName: 'KNOWLEDGE_PAY_TEMPLATE_DIR',
      fallbackDir: 'miniprogram-kp',
    },
    // 知识付费的 AppID 挂在站点行上（KnowledgePaySite.wxAppId），不在 miniprogram_apps
    tenant: {
      // 出处 miniprogram-kp/config.js：`site: ""`；取值 KnowledgePaySite.siteCode（一人一站）
      configKey: 'site',
      label: '站点寻址码（site）',
      source: '知识付费站点（knowledge_pay_sites）的 siteCode',
      multiRoot: false,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.knowledgePaySite
          .findMany({ where: { userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.siteCode,
          name: row.siteName || '知识付费云课堂站点',
          appId: row.wxAppId,
        }));
      },
    },
    rootNoun: '知识付费云课堂站点',
  },
  {
    code: 'onsite',
    hasPackage: true,
    // 出处 backend/src/onsite/onsite.platform.service.ts
    template: {
      envName: 'MINIPROGRAM_ONSITE_DIR',
      fallbackDir: 'miniprogram-onsite',
    },
    scene: 'ONSITE', // ONSITE_SCENE；miniprogram_apps (scene, shopId)=门店 id
    tenant: {
      // 出处 miniprogram-onsite/config.js：`shopCode: ""`；取值 OnsiteShop.shopCode
      configKey: 'shopCode',
      label: '门店寻址码（shopCode）',
      source: '上门服务门店（onsite_shops）的 shopCode，创建后不变',
      multiRoot: true,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.onsiteShop
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.shopCode,
          name: row.name || '上门服务门店',
        }));
      },
    },
    rootNoun: '上门服务门店',
  },
  {
    code: 'brand-mall',
    hasPackage: true,
    // 出处 backend/src/brand-mall/brand.platform.service.ts
    template: {
      envName: 'MINIPROGRAM_BRAND_MALL_DIR',
      fallbackDir: 'brand-mall-miniprogram',
    },
    scene: 'BRAND', // BRAND_SCENE
    tenant: {
      // 出处 brand-mall-miniprogram/config.js：`shopCode: ""`；取值 BrandShop.shopCode
      configKey: 'shopCode',
      label: '店铺寻址码（shopCode）',
      source: '品牌商城店铺（brand_shops）的 shopCode，创建后不变',
      multiRoot: true,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.brandShop
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.shopCode,
          name: row.name || '品牌商城店铺',
        }));
      },
    },
    rootNoun: '品牌商城店铺',
  },
  {
    code: 'takeout',
    hasPackage: true,
    // 外卖小程序模板：与统一源码包同一目录，不再有独立的出包服务
    template: {
      envName: 'MINIPROGRAM_TAKEOUT_DIR',
      fallbackDir: 'takeout-miniprogram',
    },
    scene: 'TAKEOUT',
    tenant: {
      // 出处 takeout-miniprogram/config.js：`shopCode: ""`；取值 TakeoutShop.shopCode
      configKey: 'shopCode',
      label: '外卖门店寻址码（shopCode）',
      source: '外卖门店（takeout_shops）的 shopCode，创建后不变',
      multiRoot: true,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.takeoutShop
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.shopCode,
          name: row.name || '外卖门店',
        }));
      },
    },
    rootNoun: '外卖门店',
  },
  {
    code: 'circle',
    hasPackage: true,
    // 出处 backend/src/mini-guide/mini-guide.catalog.ts（圈子已统一为直下源码包）
    template: {
      envName: 'MINIPROGRAM_CIRCLE_DIR',
      fallbackDir: 'circle-miniprogram',
    },
    scene: 'CIRCLE',
    tenant: {
      // 出处 circle-miniprogram/config.js：`communityCode: ""`
      configKey: 'communityCode',
      label: '圈子社区寻址码（communityCode）',
      source: '圈子社区（circle_communities）的 code',
      multiRoot: false,
      accountLevel: true,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.circleCommunity
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name || '圈子社区',
        }));
      },
    },
    rootNoun: '圈子社区',
  },
  {
    code: 'health',
    hasPackage: true,
    // 出处 backend/src/health/health.platform.service.ts
    template: {
      envName: 'MINIPROGRAM_HEALTH_DIR',
      fallbackDir: 'miniprogram-health',
    },
    scene: 'HEALTH', // HEALTH_SCENE（= HEALTH_MINI_SCENE）
    tenant: {
      // 出处 miniprogram-health/config.js：`shopCode: ""`；取值 HealthShop.shopCode
      configKey: 'shopCode',
      label: '机构寻址码（shopCode）',
      source: '健康管理机构（health_shops）的 shopCode，创建后不变',
      multiRoot: true,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.healthShop
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.shopCode,
          name: row.name || '健康管理机构',
        }));
      },
    },
    rootNoun: '健康管理机构',
  },
  {
    code: 'marketplace',
    hasPackage: true,
    // 出处 backend/src/marketplace/mp.release.service.ts
    template: {
      envName: 'MARKETPLACE_TEMPLATE_DIR',
      fallbackDir: 'mp-miniprogram',
    },
    scene: 'MARKET', // MP_MARKET_SCENE，shopId=市场 id
    tenant: {
      // 出处 mp-miniprogram/config.js：`marketCode: ""`；取值 MpMarket.shopCode（一账号一市场）
      configKey: 'marketCode',
      label: '市场编号（marketCode）',
      source: '本账号市场（mp_markets）的寻址码 shopCode，即 MK 开头的市场码',
      multiRoot: false,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.mpMarket
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.shopCode,
          name: row.name || '商城市场',
        }));
      },
    },
    rootNoun: '商城市场',
  },
  {
    code: 'digital-human',
    hasPackage: true,
    // 出处 backend/src/digital-human/dh.release.service.ts
    template: { envName: 'MINIPROGRAM_DH_DIR', fallbackDir: 'miniprogram-dh' },
    scene: 'DIGITAL_HUMAN', // DH_SCENE，shopId=站点 id
    tenant: {
      // 出处 miniprogram-dh/config.js：`siteCode: ""`；取值 DigitalHumanSite.siteCode（一人一站）
      configKey: 'siteCode',
      label: '站点寻址码（siteCode）',
      source: '数字人站点（digital_human_sites）的 siteCode，创建后不变',
      multiRoot: false,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.digitalHumanSite
          .findMany({ where: { userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.siteCode,
          name: row.siteName || '数字人站点',
        }));
      },
    },
    rootNoun: '数字人站点',
  },
  {
    code: 'card-shop',
    hasPackage: true,
    // 出处 backend/src/card-shop/card-shop.platform.service.ts
    template: {
      envName: 'MINIPROGRAM_CARD_SHOP_DIR',
      fallbackDir: 'card-shop-miniprogram',
    },
    scene: 'CARD_SHOP', // CARD_SHOP_SCENE，shopId=站点 id
    tenant: {
      // 出处 card-shop-miniprogram/config.js：`siteCode: ""`；取值 CardShopSite.siteCode
      configKey: 'siteCode',
      label: '站点寻址码（siteCode）',
      source: '卡密商城站点（card_shop_sites）的 siteCode，创建后不变',
      multiRoot: true,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.cardShopSite
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.siteCode,
          name: row.name || '卡密商城站点',
        }));
      },
    },
    rootNoun: '卡密商城站点',
  },
  {
    code: 'kuaidi',
    hasPackage: true,
    // 出处 backend/src/kuaidi/kuaidi.platform.service.ts
    template: {
      envName: 'MINIPROGRAM_KUAIDI_DIR',
      fallbackDir: 'kuaidi-miniprogram',
    },
    scene: 'EXPRESS', // KUAIDI_SCENE，shopId=寄件点 id
    tenant: {
      // 出处 kuaidi-miniprogram/config.js：`siteCode: ""` 仅是单点部署的默认寄件点码（留空即不预设）；
      // 取值 KuaidiSite.siteCode
      configKey: 'siteCode',
      label: '默认寄件点码（siteCode，可选）',
      source:
        '寄件点（kuaidi_sites）的 siteCode；留空则小程序按账号自动拉全部营业中的寄件点',
      multiRoot: true,
      accountLevel: true,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.kuaidiSite
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.siteCode,
          name: row.name || '寄件点',
        }));
      },
    },
    rootNoun: '寄件点',
  },
  {
    code: 'errand',
    hasPackage: true,
    // 出处 backend/src/errand/errand.platform.service.ts
    template: {
      envName: 'MINIPROGRAM_ERRAND_DIR',
      fallbackDir: 'errand-miniprogram',
    },
    scene: 'ERRAND',
    tenant: {
      // 出处 errand-miniprogram/config.js：`siteCode: ""`，取值 ErrandSite.siteCode
      configKey: 'siteCode',
      label: '跑腿站点码（siteCode）',
      source:
        '跑腿站点（errand_sites）的 siteCode，创建后不变；一部小程序只服务一个站点',
      multiRoot: false,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.errandSite
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.siteCode,
          name: row.name || '跑腿站点',
        }));
      },
    },
    rootNoun: '跑腿站点',
  },
  {
    code: 'park',
    hasPackage: true,
    template: {
      envName: 'PARK_MINIPROGRAM_DIR',
      fallbackDir: 'park-miniprogram',
    },
    scene: 'PARK',
    tenant: {
      configKey: 'parkCode',
      label: '园区码（parkCode）',
      source: '园区站点（park_sites）的 parkCode，创建后不变',
      multiRoot: true,
      listRoots: async (prisma, userId) => {
        const rows = await prisma.parkSite
          .findMany({ where: { ownerUserId: userId }, orderBy: { id: 'asc' } })
          .catch(() => []);
        return rows.map((row) => ({
          id: row.id,
          code: row.parkCode,
          name: row.name || '园区',
        }));
      },
    },
    rootNoun: '园区',
  },
  {
    code: 'global-site',
    // 国际独立站是 Web 产物：没有小程序模板目录，也不出源码包（pkg.available=false）。
    hasPackage: false,
    rootNoun: '国际独立站',
  },
];

export const MINI_GUIDE_BY_CODE = new Map<ToolCode, MiniGuideToolMeta>(
  MINI_GUIDE_TOOLS.map((item) => [item.code, item]),
);

/** 展示名：直接取启动目录里的工具名，两处页面一份口径。 */
const EXTRA_TOOL_NAMES: Partial<Record<ToolCode, string>> = {
  park: '园区管理',
};

export function miniGuideToolName(code: ToolCode): string {
  return TOOL_LAUNCH_BY_CODE.get(code)?.name ?? EXTRA_TOOL_NAMES[code] ?? code;
}
