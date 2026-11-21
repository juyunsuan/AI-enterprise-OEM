import {
  closedCapabilities,
  closedCapabilityMessage,
  capabilityHint,
  COMMERCE_CAPABILITIES,
  isCapabilityClosed,
} from './modules';
import {
  classifyConfigChange,
  isValidReleaseVersion,
  MINI_UPLOAD_DISCLAIMER,
  releaseVersionHint,
  republishHint,
} from './publish';
import {
  deskBelongsToMerchant,
  deskBelongsToShop,
  deskBindingHint,
  deskExternalMeta,
  DESK_META_LIMITS,
  DESK_SITE_QUOTA_MESSAGE,
} from './support';

describe('commerce-core/support 客服会话上下文', () => {
  it('只带上下了里有的字段，数字转字符串、空值丢弃', () => {
    expect(
      deskExternalMeta({
        biz: 'brand',
        shopId: 12,
        shopName: '旗舰小铺',
        orderId: 0,
      }),
    ).toEqual({
      biz: 'brand',
      shopId: '12',
      shopName: '旗舰小铺',
      orderId: '0',
    });
    expect(
      deskExternalMeta({ biz: 'market', shopId: 3, merchantId: 8, page: '' }),
    ).toEqual({
      biz: 'market',
      shopId: '3',
      merchantId: '8',
    });
  });

  it('超长值按客服侧落库口径截断', () => {
    const meta = deskExternalMeta({
      biz: 'brand',
      shopId: 1,
      shopName: '名'.repeat(DESK_META_LIMITS.valueMax + 100),
    });
    expect(meta.shopName).toHaveLength(DESK_META_LIMITS.valueMax);
  });

  it('商户与店铺过滤：0 表示全站，其它必须精确命中', () => {
    const meta = deskExternalMeta({ biz: 'market', shopId: 7, merchantId: 21 });
    expect(deskBelongsToMerchant(meta, 21)).toBe(true);
    expect(deskBelongsToMerchant(meta, 22)).toBe(false);
    expect(deskBelongsToMerchant(meta, 0)).toBe(true);
    expect(deskBelongsToMerchant(null, 21)).toBe(false);
    expect(deskBelongsToShop(meta, '7')).toBe(true);
    expect(deskBelongsToShop(meta, 0)).toBe(true);
  });

  it('未绑定站点时给出可点的下一步与配额文案', () => {
    expect(deskBindingHint('/service-desk/site')).toEqual({
      message:
        '还没有绑定在线客服站点，请到「AI 客服 · 接入站点」新建站点后回到这里选择',
      action: '/service-desk/site',
    });
    expect(DESK_SITE_QUOTA_MESSAGE).toContain('20');
  });
});

describe('commerce-core/publish 发版边界', () => {
  it('版本号沿用底座的语义化格式', () => {
    expect(isValidReleaseVersion('1.2.3')).toBe(true);
    expect(isValidReleaseVersion(' 1.2.3-beta.1 ')).toBe(true);
    expect(isValidReleaseVersion('1.2')).toBe(false);
    expect(isValidReleaseVersion('')).toBe(false);
    expect(releaseVersionHint()).toContain('1.0.0');
  });

  it('业务字段先按别名映射到注入键，再判断要不要发版', () => {
    const classification = classifyConfigChange([
      'shopName',
      'theme',
      'features',
      'phone',
      '某新字段',
    ]);
    expect(classification.republish).toEqual(['appName', 'themeColor']);
    expect(classification.runtime).toEqual(['features', 'servicePhone']);
    expect(classification.unknown).toEqual(['某新字段']);
    expect(republishHint(classification)).toContain('appName');
    expect(republishHint(classifyConfigChange(['features']))).toContain(
      '不用重新出包',
    );
  });

  it('合规话术只承诺开发版，提审发布留给用户自己的公众平台', () => {
    expect(MINI_UPLOAD_DISCLAIMER).toContain('开发版');
    expect(MINI_UPLOAD_DISCLAIMER).toContain('微信公众平台');
  });
});

describe('commerce-core/modules 能力注册表', () => {
  it('已登记的后置能力给出统一的「还没开放」文案', () => {
    expect(closedCapabilityMessage('groupBuy')).toBe(
      '拼团还没开放，将在二期上线',
    );
    expect(closedCapabilityMessage('scrmBridge')).toBe(
      '企业微信客户运营还没开放，将在品牌商城一期 A3 批上线',
    );
    expect(isCapabilityClosed('scrmBridge')).toBe(true);
    expect(capabilityHint('seckill')).toBe('需库存预热与限流方案');
  });

  it('未登记的键回落为通用文案，绝不把英文键名暴露给顾客', () => {
    expect(closedCapabilityMessage('mystery')).toBe(
      '该功能还没开放，将在后续阶段上线',
    );
    expect(closedCapabilityMessage('')).toBe(
      '该功能还没开放，将在后续阶段上线',
    );
    expect(isCapabilityClosed('mystery')).toBe(false);
  });

  it('注册表里没有重复键，后置清单与文案口径一致', () => {
    const keys = COMMERCE_CAPABILITIES.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(closedCapabilities().every((item) => item.stage !== 'LIVE')).toBe(
      true,
    );
    expect(closedCapabilities().length).toBe(COMMERCE_CAPABILITIES.length);
  });
});
