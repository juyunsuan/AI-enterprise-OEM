import { CARD_SHOP_DEFAULT_TOGGLES } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { NotificationService } from '../notifications/notification.service';
import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import type { CardShopContentService } from './card-shop.content.service';
import type { CardShopCouponService } from './card-shop.coupon.service';
import type { CardShopCustomerService } from './card-shop.customer.service';
import type { CardShopGoodsService } from './card-shop.goods.service';
import { CardShopOrderService } from './card-shop.order.service';
import type { CardShopPayService } from './card-shop.pay.service';
import type { CardShopPlatformService } from './card-shop.platform.service';
import type { CardShopSiteContext } from './card-shop.site-context';
import type { CardShopSiteService } from './card-shop.site.service';

/**
 * 锁卡与下单的一致性回归。
 *
 * 库存唯一真值是 `card_shop_cards` 的行：先按出卡顺序取候选 id，再用带
 * `status='AVAILABLE'` 的条件更新去占，占不满就整单回滚。这里用一个内存假库把
 * 「两次读之间被别人抢走」的时刻精确造出来，验证三件事：
 * 1. 并发下单不超卖，锁住的卡数恰好等于成功单数 × 购买量；
 * 2. 候选 list 过时（读完之后被抢）时条件更新 0 行，下单失败而不是硬塞；
 * 3. 失败订单连同它占到的卡一起回滚，不留残渣。
 */

type CardRow = {
  id: number;
  siteId: number;
  goodsId: number;
  seq: number;
  status: 'AVAILABLE' | 'LOCKED';
  lockOrderId: number;
  lockExpireAt: Date | null;
  trashedAt: Date | null;
};

type OrderRow = { id: number; orderNo: string };

const SITE_ID = 7;
const GOODS_ID = 91;
const SITE = {
  siteId: SITE_ID,
  ownerUserId: '1001',
  siteCode: 'AB23CD4E',
  name: '测试卡密店',
  logo: '',
  slogan: '',
  themeColor: '#3370FF',
  notice: '',
  status: 'ONLINE',
  offReason: '',
  toggles: CARD_SHOP_DEFAULT_TOGGLES,
  stockDisplayMode: 'ACTUAL',
  cardOrderMode: 'OLDEST',
  lockMinutes: 30,
  serviceContact: { phone: '', qq: '', wechat: '', email: '' },
  deskSiteKey: '',
  deskEmbedUrl: '',
  apiBase: 'https://example.com',
  protocolEnabled: false,
  protocolText: '',
} as unknown as CardShopSiteContext;

const GOODS = {
  id: GOODS_ID,
  siteId: SITE_ID,
  categoryId: 0,
  name: '月卡',
  subtitle: '',
  coverImage: '',
  images: null,
  price: 10,
  marketPrice: 10,
  wholesaleTiers: null,
  limitQuantity: 0,
  maxQuantity: 0,
  stockWarn: 10,
  couponEnabled: false,
  takeCardMode: 'OFF',
  visitPassword: '',
  contactMode: 'ANY',
  notifyFlags: null,
  cardFormat: 'SINGLE',
  intro: '',
  detail: '',
  remark: '',
  cardOrderMode: 'OLDEST',
  hot: false,
  sort: 0,
  viewCount: 0,
  soldCount: 0,
  status: 'ONLINE',
};

const BODY = {
  site: '',
  goodsId: GOODS_ID,
  quantity: 3,
  contact: 'buyer@example.com',
  email: '',
  takeCardPassword: '',
  couponCode: '',
  agreed: false,
};

const CONTEXT = { ip: '127.0.0.1', openid: '', customerId: 5 };

/** 内存卡池 + 条件更新；`$transaction` 只回滚本事务创建的行与它占到的卡。 */
function fakeDb(
  cards: CardRow[],
  hooks: {
    /** 在候选 list 返回前插入「竞争对手已占卡」的时刻 */
    beforeReturnCandidates?: (candidates: number[]) => void;
  } = {},
) {
  let nextOrderId = 0;
  const orders: OrderRow[] = [];

  const match = (card: CardRow, where: Record<string, unknown>) =>
    card.siteId === where.siteId &&
    card.goodsId === where.goodsId &&
    card.status === where.status &&
    card.trashedAt === where.trashedAt &&
    (where.id as { in: number[] }).in.includes(card.id);

  const findMany = async ({
    where,
    take,
  }: {
    where: Record<string, unknown>;
    take: number;
  }) => {
    // 让 20 个并发下单都在「别人还没写回」的时刻读到候选，逼出真实的抢卡窗口。
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ids = cards
      .filter((card) => card.status === 'AVAILABLE' && card.trashedAt === null)
      .filter(
        (card) =>
          card.siteId === where.siteId && card.goodsId === where.goodsId,
      )
      .sort((a, b) => a.seq - b.seq)
      .slice(0, take)
      .map((card) => card.id);
    hooks.beforeReturnCandidates?.(ids);
    return ids.map((id) => ({ id }));
  };

  const updateMany = async ({
    where,
    data,
  }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    let count = 0;
    for (const card of cards) {
      if (!match(card, where)) continue;
      card.status = 'LOCKED';
      card.lockOrderId = Number(data.lockOrderId);
      card.lockExpireAt = data.lockExpireAt as Date;
      count += 1;
    }
    return { count };
  };

  const orderCreate = async ({ data }: { data: Record<string, unknown> }) => {
    nextOrderId += 1;
    const row = { id: nextOrderId, orderNo: String(data.orderNo) };
    orders.push(row);
    return row;
  };

  const prisma = stub<PrismaService>({
    cardShopProduct: { findFirst: async () => GOODS },
    $transaction: async (
      run: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
      const created: number[] = [];
      const tx = stub<Prisma.TransactionClient>({
        cardShopOrder: {
          create: async (args: { data: Record<string, unknown> }) => {
            const row = await orderCreate(args);
            created.push(row.id);
            return row;
          },
        },
        cardShopCard: { findMany, updateMany },
      });
      try {
        return await run(tx);
      } catch (error) {
        for (const id of created) {
          const index = orders.findIndex((row) => row.id === id);
          if (index >= 0) orders.splice(index, 1);
        }
        for (const card of cards) {
          if (created.includes(card.lockOrderId)) {
            card.status = 'AVAILABLE';
            card.lockOrderId = 0;
            card.lockExpireAt = null;
          }
        }
        throw error;
      }
    },
  });

  return { prisma, cards, orders };
}

function serviceOf(prisma: PrismaService) {
  return new CardShopOrderService(
    prisma,
    stub<CardShopSiteService>({}),
    stub<CardShopPlatformService>({ requireEnabled: async () => ({}) }),
    stub<CardShopGoodsService>({}),
    stub<CardShopContentService>({}),
    stub<CardShopCouponService>({}),
    stub<CardShopCustomerService>({}),
    stub<CardShopPayService>({ available: async () => false }),
    stub<NotificationService>({}),
  );
}

function cardsOf(total: number): CardRow[] {
  return Array.from({ length: total }, (_, index) => ({
    id: index + 1,
    siteId: SITE_ID,
    goodsId: GOODS_ID,
    seq: index + 1,
    status: 'AVAILABLE',
    lockOrderId: 0,
    lockExpireAt: null,
    trashedAt: null,
  }));
}

describe('card-shop 并发锁卡', () => {
  it('20 单各买 3 张、库存 50 张：只成 16 单，锁住的卡互不重叠', async () => {
    const { prisma, cards, orders } = fakeDb(cardsOf(50));
    const service = serviceOf(prisma);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => service.create(SITE, BODY, CONTEXT)),
    );

    const ok = results.filter((item) => item.status === 'fulfilled');
    const failed = results.filter((item) => item.status === 'rejected');
    expect(ok).toHaveLength(16);
    expect(failed).toHaveLength(4);
    for (const item of failed) {
      const error = item.reason;
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.CONFLICT);
    }

    const locked = cards.filter((card) => card.status === 'LOCKED');
    expect(locked).toHaveLength(16 * 3);
    expect(cards.filter((card) => card.status === 'AVAILABLE')).toHaveLength(2);
    // 每张锁住的卡只归属一个成功订单，且没有卡被两个订单同时占用
    expect(new Set(locked.map((card) => card.lockOrderId)).size).toBe(16);
    expect(orders).toHaveLength(16);
    for (const order of orders) {
      expect(
        locked.filter((card) => card.lockOrderId === order.id),
      ).toHaveLength(3);
    }
  });

  it('候选读到之后被别人抢走：条件更新 0 行，整单回滚不留残渣', async () => {
    const cards = cardsOf(3);
    // 模拟读与写之间的竞态：候选 list 已返回，竞争对手把这三张全占了。
    const { prisma, orders } = fakeDb(cards, {
      beforeReturnCandidates: (candidates) => {
        for (const id of candidates) {
          const card = cards.find((row) => row.id === id)!;
          card.status = 'LOCKED';
          card.lockOrderId = 999;
        }
      },
    });
    const service = serviceOf(prisma);

    await expect(service.create(SITE, BODY, CONTEXT)).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    // 卡仍归竞争对手，没被后来者覆盖；失败订单也没有落库
    expect(cards.every((card) => card.lockOrderId === 999)).toBe(true);
    expect(orders).toHaveLength(0);
  });

  it('库存不足时直接拒绝，不产生订单也不占卡', async () => {
    const { prisma, cards, orders } = fakeDb(cardsOf(2));
    const service = serviceOf(prisma);

    await expect(service.create(SITE, BODY, CONTEXT)).rejects.toBeInstanceOf(
      BusinessException,
    );
    expect(orders).toHaveLength(0);
    expect(cards.every((card) => card.status === 'AVAILABLE')).toBe(true);
  });
});
