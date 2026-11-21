import type { PrismaService } from '../prisma/prisma.service';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { BrandPlatformService } from './brand.platform.service';
import { BrandShopService, type BrandDeskSiteHook } from './brand.shop.service';
import { stub } from '../../test/doubles';

const user = stub<CurrentUser>({ userId: 'u1' });

const shopRow = (patch: Record<string, unknown> = {}) => ({
  id: 5,
  ownerUserId: 'u1',
  enterpriseId: 0,
  enterpriseUserId: '',
  name: '小王家',
  shopCode: 'ABCD1234',
  logo: '',
  slogan: '',
  servicePhone: '',
  themeColor: '#FA3534',
  status: 'DRAFT',
  tradeJson: {},
  scrmEnabled: false,
  supportSiteId: 9,
  shareImage: '',
  offReason: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...patch,
});

const site = (patch: Record<string, unknown> = {}) => ({
  id: 9,
  siteKey: 'sk_live',
  name: '小王家客服',
  enabled: true,
  ...patch,
});

function doubles(row: Record<string, unknown> = shopRow()) {
  const update = jest.fn(async () => ({}));
  const create = jest.fn(async () => shopRow({ id: 5 }));
  const prisma = stub<PrismaService>({
    brandShop: {
      count: jest.fn(async () => 0),
      findFirst: jest.fn(async () => row),
      findUnique: jest.fn(async () => null),
      create,
      update,
    },
    brandProduct: { count: jest.fn(async () => 0) },
    brandCustomer: { count: jest.fn(async () => 0) },
    brandOrder: { count: jest.fn(async () => 0) },
    brandDiyPage: {
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn(async () => ({ id: 1 })),
    },
  });
  const miniApp = stub<MiniAppService>({
    view: jest.fn(async () => ({ appId: '', uploadKeyConfigured: false })),
    configured: jest.fn(async () => false),
    payEnabled: jest.fn(async () => false),
    removeForShop: jest.fn(async () => undefined),
  });
  const limits = {
    shopQuota: 3,
    payAllowed: true,
    defaultTrade: {
      autoCancelMinutes: 30,
      freightAmount: 0,
      freeFreightAmount: 0,
      minOrderAmount: 0,
      refundEnabled: true,
      refundDaysLimit: 7,
      buyerMessageEnabled: true,
      pointsEnabled: false,
      pointsReturnRate: 0,
      pointsPerYuan: 0,
      pointsDeductMaxPercent: 0,
      selfCancelEnabled: true,
    },
  };
  const platform = stub<BrandPlatformService>({
    limits: jest.fn(async () => limits),
    requireEnabled: jest.fn(async () => limits),
  });
  const service = new BrandShopService(prisma, miniApp, platform);
  return { service, mocks: { update, create } };
}

function hookOf(overrides: Partial<BrandDeskSiteHook> = {}) {
  const view = jest.fn(async () => site());
  const ensure = jest.fn(async () => site({ id: 33, siteKey: 'sk_new' }));
  const hook: BrandDeskSiteHook = { view, ensure, ...overrides };
  return { hook, view, ensure };
}

describe('BrandShopService · AI 客服站点自动开通', () => {
  it('店铺详情回显自动站点的 key / 名称 / 可用状态', async () => {
    const { service } = doubles();
    service.deskSiteHook = hookOf().hook;

    const detail = await service.shopDetail(user, 5);

    expect(detail.supportSiteId).toBe(9);
    expect(detail.deskSiteKey).toBe('sk_live');
    expect(detail.deskSiteName).toBe('小王家客服');
    expect(detail.deskReady).toBe(true);
  });

  it('店主在「AI 客服」里删掉站点：详情回落未开通，不误报已绑定', async () => {
    const { service } = doubles();
    const { hook } = hookOf({ view: jest.fn(async () => null) });
    service.deskSiteHook = hook;

    const detail = await service.shopDetail(user, 5);

    expect(detail.deskSiteKey).toBe('');
    expect(detail.deskSiteName).toBe('');
    expect(detail.deskReady).toBe(false);
  });

  it('已有站点时不重复建站，也不回写', async () => {
    const { service, mocks } = doubles();
    const { hook, ensure } = hookOf();
    service.deskSiteHook = hook;

    const desk = await service.ensureDeskSite(shopRow());

    expect(desk?.siteKey).toBe('sk_live');
    expect(ensure).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('站点缺失时重新开通并回写 supportSiteId', async () => {
    const { service, mocks } = doubles();
    const { hook, ensure } = hookOf({
      view: jest.fn(async () => null),
    });
    service.deskSiteHook = hook;

    const desk = await service.ensureDeskSite(shopRow());

    expect(ensure).toHaveBeenCalledWith('u1', '小王家');
    expect(desk?.id).toBe(33);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { supportSiteId: 33 },
    });
  });

  it('站点配额用尽：把可操作提示抛给发布页，不静默吞掉', async () => {
    const { service } = doubles();
    const { hook } = hookOf({
      view: jest.fn(async () => null),
      ensure: jest.fn(async () => {
        throw new Error(
          '一个账号最多 20 个客服站点，请到「AI 客服 › 站点」删除不用的站点',
        );
      }),
    });
    service.deskSiteHook = hook;

    await expect(service.ensureDeskSite(shopRow())).rejects.toThrow('AI 客服');
  });

  it('开店时自动开通站点（配额失败不挡开店）', async () => {
    const { service, mocks } = doubles();
    const { hook, ensure } = hookOf({
      view: jest.fn(async () => null),
    });
    service.deskSiteHook = hook;

    await service.createShop(user, {
      name: '小王家',
      logo: '',
      slogan: '',
    } as never);

    expect(ensure).toHaveBeenCalledWith('u1', '小王家');
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { supportSiteId: 33 },
    });
  });
});
