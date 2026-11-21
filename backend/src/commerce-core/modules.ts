/**
 * 能力注册表：商城中台「哪些功能已经实现、哪些还没开放」的唯一口径。
 *
 * 两个业务共用同一张表，页面占位与后端降级都从这里取文案，
 * 避免出现「前端摆了入口、后端报接口不存在」这类不一致。
 */

export const COMMERCE_STAGE_LABELS = {
  LIVE: '已上线',
  A1: '品牌商城一期 A1',
  A2: '品牌商城一期 A2',
  A3: '品牌商城一期 A3',
  B: '多店铺商城平台',
  PHASE2: '二期',
} as const;
export type CommerceCapabilityStage = keyof typeof COMMERCE_STAGE_LABELS;

export interface CommerceCapability {
  key: string;
  label: string;
  stage: CommerceCapabilityStage;
  /** 后置原因或依赖说明，页面 tooltip 与排查手册共用。 */
  note: string;
}

/** 一期未落地、但已在契约与界面上预留入口的能力。 */
export const COMMERCE_CAPABILITIES: readonly CommerceCapability[] = [
  {
    key: 'shippingTemplate',
    label: '运费模板',
    stage: 'A1',
    note: '按地区与首续件计费，替代统一运费',
  },
  {
    key: 'productParams',
    label: '商品参数',
    stage: 'A1',
    note: '参数组与参数项，详情页结构化展示',
  },
  {
    key: 'refundEffect',
    label: '退款副作用编排',
    stage: 'A1',
    note: '回补库存 / 退券 / 扣回赠分的幂等执行',
  },
  {
    key: 'supportDesk',
    label: '在线客服',
    stage: 'A2',
    note: '复用本站 AI 客服 service-desk，不重建会话系统',
  },
  {
    key: 'miniRelease',
    label: '小程序出包直传',
    stage: 'A2',
    note: '复用私域小程序底座，只生成开发版',
  },
  {
    key: 'scrmBridge',
    label: '企业微信客户运营',
    stage: 'A3',
    note: '松耦合事件外发，关闭任一服务互不影响',
  },
  {
    key: 'memberAssets',
    label: '会员等级与标签',
    stage: 'PHASE2',
    note: '等级成长值、人群标签与权益体系',
  },
  {
    key: 'balanceRecharge',
    label: '余额储值',
    stage: 'PHASE2',
    note: '需与站内积分体系划清资金边界后再开',
  },
  {
    key: 'signins',
    label: '签到有礼',
    stage: 'PHASE2',
    note: '营销玩法，依赖会员成长值口径',
  },
  {
    key: 'seckill',
    label: '秒杀',
    stage: 'PHASE2',
    note: '需库存预热与限流方案',
  },
  {
    key: 'groupBuy',
    label: '拼团',
    stage: 'PHASE2',
    note: '成团状态机与超时退款',
  },
  { key: 'bargain', label: '砍价', stage: 'PHASE2', note: '助力链路与防刷' },
  {
    key: 'distribution',
    label: '分销裂变',
    stage: 'PHASE2',
    note: '佣金结算涉及资金合规，单独立项',
  },
  {
    key: 'live',
    label: '直播带货',
    stage: 'PHASE2',
    note: '依赖第三方直播源与审核',
  },
  {
    key: 'printer',
    label: '云打印小票',
    stage: 'PHASE2',
    note: 'driver 层接入，先做手动打印',
  },
  {
    key: 'expressSheet',
    label: '电子面单',
    stage: 'PHASE2',
    note: '需要快递公司月结账号',
  },
  {
    key: 'invoice',
    label: '电子发票',
    stage: 'PHASE2',
    note: '复用站内发票申请链路',
  },
  {
    key: 'h5Client',
    label: 'H5 商城',
    stage: 'PHASE2',
    note: '首期只做微信小程序原生模板',
  },
  {
    key: 'appClient',
    label: 'APP 商城',
    stage: 'PHASE2',
    note: '违反本项目禁止桌面/移动客户端的约束，长期不做',
  },
] as const;

/** 未上线能力的上线计划短语，用于拼成完整降级文案。 */
export const COMMERCE_STAGE_PLANS: Record<CommerceCapabilityStage, string> = {
  LIVE: '已经开放',
  A1: '品牌商城一期 A1 批',
  A2: '品牌商城一期 A2 批',
  A3: '品牌商城一期 A3 批',
  B: '多店铺商城平台一期',
  PHASE2: '二期',
} as const;

export function capabilityOf(key: string): CommerceCapability | null {
  const wanted = String(key || '').trim();
  return COMMERCE_CAPABILITIES.find((item) => item.key === wanted) || null;
}

/** 尚未上线的能力：占位入口与后端降级共用这一份判定。 */
export function closedCapabilities(): CommerceCapability[] {
  return COMMERCE_CAPABILITIES.filter((item) => item.stage !== 'LIVE').slice();
}

export function isCapabilityClosed(key: string): boolean {
  const capability = capabilityOf(key);
  return !!capability && capability.stage !== 'LIVE';
}

/**
 * 统一降级文案：沿用「××还没开放，将在××上线」的既有口径，
 * 未登记的能力回落到「还没有开放」，绝不出现英文键名。
 */
export function closedCapabilityMessage(key: string): string {
  const capability = capabilityOf(key);
  // 未登记的能力不外泄英文键名，只给通用口径
  if (!capability) return '该功能还没开放，将在后续阶段上线';
  if (capability.stage === 'LIVE') return `${capability.label}已经开放`;
  return `${capability.label}还没开放，将在${COMMERCE_STAGE_PLANS[capability.stage]}上线`;
}

export function capabilityHint(key: string): string {
  return capabilityOf(key)?.note || '';
}
