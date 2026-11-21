import type { PointsService } from '../points/points.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { GeoSiteSettingsService } from './geo-site.settings.service';
import { GeoSiteBillingService } from './geo-site.billing.service';
import { stub } from '../../test/doubles';

/**
 * 「未启动不扣积分」在国际独立站上的实现方式：它保留自己的站点月账，
 * 但运营方显式停掉 `global-site` 期间不得再产生新账单。
 *
 * 两条边界都要钉住：
 * 1. **显式 STOPPED 的账号不出账**——停了还扣钱直接违背产品口径；
 * 2. **没有订阅台账行的老账号照常出账**——不能因为没进过启动页就白送一个月，
 *    也不能反过来把从没参与过启动设置的账号集体免单。
 */

function setup(options: {
  sites?: { id: number; ownerUserId: string }[];
  stoppedOwners?: string[];
}) {
  const created: { siteId: number; ownerUserId: string }[] = [];
  const prisma = stub<PrismaService>({
    modulePricing: {
      findUnique: async () => ({
        code: 'geo_site',
        mode: 'METERED',
        unit: '站·月',
        unitPriceAmount: 50,
        freeQuotaAmount: 0,
        minChargeAmount: 0.01,
        enabled: 1,
      }),
    },
    geoSite: {
      findMany: async () =>
        (options.sites ?? []).map((site) => ({
          ...site,
          billingFrom: new Date('2026-01-05T00:00:00Z'),
        })),
    },
    toolSubscription: {
      findMany: async () =>
        (options.stoppedOwners ?? []).map((userId) => ({ userId })),
    },
    geoSiteBill: {
      findUnique: async () => null,
      create: async ({
        data,
      }: {
        data: { siteId: number; ownerUserId: string };
      }) => {
        created.push({ siteId: data.siteId, ownerUserId: data.ownerUserId });
        return data;
      },
      update: async ({ data }: { data: unknown }) => data,
    },
    usageEvent: { create: async ({ data }: { data: unknown }) => data },
    pointAccount: { update: async ({ data }: { data: unknown }) => data },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  });
  const points = stub<PointsService>({
    ensureAccount: async (userId: string) => ({
      userId,
      balanceAmount: 10_000,
      status: 'ACTIVE',
      arrearsSince: null,
    }),
    debitTx: async (
      _tx: unknown,
      _userId: string,
      _type: string,
      amount: number,
    ) => ({ balance: 10_000 - amount, txId: 1 }),
  });
  const settings = stub<GeoSiteSettingsService>({
    view: async () => ({
      graceHours: 72,
      suspendOnArrears: true,
      maxSitesPerOwner: 50,
    }),
  });
  return {
    billing: new GeoSiteBillingService(prisma, points, settings),
    created,
  };
}

describe('GeoSiteBillingService 与启动闸门的联动', () => {
  it('显式停止 global-site 的账号本月不再产生账单', async () => {
    const { billing, created } = setup({
      sites: [
        { id: 1, ownerUserId: 'stopped-owner' },
        { id: 2, ownerUserId: 'running-owner' },
      ],
      stoppedOwners: ['stopped-owner'],
    });
    const result = await billing.chargeMonth(
      '2026-11',
      new Date('2026-11-01T02:00:00Z'),
    );
    expect(created.map((row) => row.ownerUserId)).toEqual(['running-owner']);
    expect(result.billed).toBe(1);
  });

  it('没有订阅台账行的老账号照常出账（启动设置不是免单通道）', async () => {
    const { billing, created } = setup({
      sites: [
        { id: 3, ownerUserId: 'legacy-owner' },
        { id: 4, ownerUserId: 'stopped-owner' },
      ],
      stoppedOwners: ['stopped-owner'],
    });
    await billing.chargeMonth('2026-11', new Date('2026-11-01T02:00:00Z'));
    expect(created.map((row) => row.siteId)).toEqual([3]);
  });
});
