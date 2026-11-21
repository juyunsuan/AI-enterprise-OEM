import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import { pageParam } from '../common/api';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { parseCustomerToken } from '../private-mini/customer-token';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { issueStaffToken, parseStaffToken } from './staff-token';
import type { OrderAction } from './onsite.order.rules';
import {
  centsOf,
  maskPhone,
  minutesOfClock,
  parseDay,
  startOfDay,
  stringArray,
} from './onsite.money';

const bindBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  phone: z.string().trim().min(3).max(32),
  staffNo: z.string().trim().max(32),
});
const shopCodeBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
});
const pageQuery = z.object({
  shopCode: z.string().trim().max(16).default(''),
  page: z.string().default('1'),
  pageSize: z.string().default('20'),
  status: z.string().default(''),
  orderId: z.string().default(''),
  day: z.string().default(''),
  serviceId: z.string().default(''),
  staffId: z.string().default(''),
});
/** 技师自助改资料：全部落 profilePending 待审副本，审核通过才合并回主行（见 staff.service）。 */
const profileUpdateBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  name: z.string().trim().max(60).optional(),
  avatar: z.string().trim().max(500).optional(),
  intro: z.string().trim().max(2000).optional(),
  serviceCity: z.string().trim().max(60).optional(),
  workYears: z.number().int().min(0).max(60).optional(),
  gender: z.number().int().min(0).max(2).optional(),
  serviceStartAt: z.string().trim().max(5).optional(),
  serviceEndAt: z.string().trim().max(5).optional(),
  crossDay: z.boolean().optional(),
  lng: z.number().min(-180).max(180).optional(),
  lat: z.number().min(-90).max(90).optional(),
  address: z.string().trim().max(200).optional(),
});
const orderAdvanceBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderId: z.number().int().positive(),
  // 与契约 ONSITE_ORDER_ACTIONS 对齐：技师只能推进这六步，签收/评价归顾客
  action: z.enum(['accept', 'reject', 'depart', 'arrive', 'start', 'complete']),
  content: z.string().trim().max(500).default(''),
  image: z.string().trim().max(500).default(''),
  address: z.string().trim().max(200).default(''),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
});
const locationBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  address: z.string().trim().max(200).default(''),
});
const restSaveBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  id: z.number().int().min(0).default(0),
  day: z.string().trim().min(1).max(32),
  startAt: z.string().trim().min(1).max(32),
  endAt: z.string().trim().min(1).max(32),
  reason: z.string().trim().max(200).default(''),
});
const restRemoveBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  id: z.number().int().positive(),
});
const appealBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  reviewId: z.number().int().positive(),
  reason: z.string().trim().min(1).max(300),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
});
const feedbackBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderId: z.number().int().min(0).default(0),
  category: z.string().trim().max(40).default('other'),
  content: z.string().trim().min(1).max(2000),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  video: z.string().trim().max(500).default(''),
});
const alertBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderId: z.number().int().min(0).default(0),
  lng: z.number().min(-180).max(180).default(0),
  lat: z.number().min(-90).max(90).default(0),
  address: z.string().trim().max(200).default(''),
  remark: z.string().trim().max(300).default(''),
});

/** 与店主端 reviewProfile 的合并白名单一致：不在名单里的键提交即丢弃，绝不让待审副本绕过审核写主列。 */
const PENDING_KEYS = [
  'name',
  'avatar',
  'intro',
  'images',
  'phone',
  'serviceStartAt',
  'serviceEndAt',
  'crossDay',
  'serviceCity',
  'address',
] as const;

const isClock = (value: string) => /^\d{1,2}:\d{2}$/.test(value);

/** `day` + （`HH:MM` 或完整 ISO）→ Date；给休息段自助录入用。 */
function combineDateTime(day: string, value: string): Date {
  const date = parseDay(day) ? day : '';
  if (!date) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '日期格式需为 YYYY-MM-DD，例如 2026-11-20',
    );
  }
  const raw = isClock(value) ? `${date}T${value.padStart(5, '0')}:00` : value;
  return new Date(raw);
}

type StaffLike = Prisma.OnsiteStaffGetPayload<Record<string, never>>;

/**
 * 上门服务小程序技师端公开通道。
 *
 * 与 C 端通道（onsite.public.ts）同级、同纪律，两条不可商量的规则：
 * 1. 技师身份只来自 `parseStaffToken`（载荷带 shopId + staffId），所有读写一律
 *    `shopId + staffId` 双条件过滤，**绝不拿请求体里的 id 做归属判定**；
 * 2. 每个需鉴权请求都回库重查技师行并校验 status——店主把技师停用/离场必须
 *    立即生效，而不是等 30 天令牌自然过期；越权与不存在一律同一句「不存在」文案。
 */
export function registerOnsiteStaffApi(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const { shops, customers, orders, schedule, reviews, alerts } =
    services.onsite;
  const prisma = services.prisma;
  // bind 是身份门（手机号 + 工号可被枚举尝试），单顾客限 8 次/分钟
  const bindWindow = new RateWindow(8, 60_000);
  const writeWindow = new RateWindow(30, 60_000);

  /** 按 shopCode 取店铺 + 校验可营业（与 C 端通道同一口径文案）。 */
  const requireShop = async (shopCode: string) => {
    const shop = await shops.findByCode(shopCode);
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或尚未开通，请让店主在后台完成开通后再试',
      );
    }
    if (shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该店铺已被平台暂停服务',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应
    if (!(await toolOpen('onsite', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return shop;
  };

  /**
   * 技师身份：令牌 + 回库重查档案状态。
   * 令牌 shopId 与请求 shopCode 不一致时只说「身份与店铺不匹配」，
   * 既不承认对方店铺存在，也不让 A 店技师令牌摸到 B 店数据。
   */
  const requireStaff = async (
    c: Context<ApiEnv, string, Input>,
    shop: Awaited<ReturnType<typeof requireShop>>,
  ) => {
    const payload = parseStaffToken(c.req.header('authorization') || '');
    if (payload.shopId !== shop.shopId) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '技师身份与该店铺不匹配，请在所属店铺的小程序内重新绑定',
      );
    }
    const staff = await prisma.onsiteStaff.findFirst({
      where: { id: payload.staffId, shopId: shop.shopId },
    });
    if (!staff) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '技师档案已不存在，请联系店主确认后重新绑定身份',
      );
    }
    // 店主把技师调离岗位（停用/离场/未过审）必须立刻断权，而不是等令牌过期
    if (!['ONLINE', 'OFF_DUTY'].includes(staff.status)) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        staff.status === 'SUSPENDED'
          ? '你已被店主停用，请联系店主处理后再进入技师中心'
          : staff.status === 'LEFT'
            ? '你已从本店离场，如需继续使用请联系店主重新上岗'
            : '档案还在店主审核中，审核通过后才能进入技师中心',
      );
    }
    return { payload, staff };
  };

  /** 技师对外卡片：不含手机号/身份证等敏感项，令牌只在 bind 出现。 */
  const staffCard = async (staff: StaffLike, shopCode: string) => {
    const level = staff.levelId
      ? await prisma.onsiteStaffLevel.findFirst({
          where: { id: staff.levelId, shopId: staff.shopId },
          select: { name: true },
        })
      : null;
    return {
      id: staff.id,
      name: staff.name,
      shopId: staff.shopId,
      shopCode,
      shopName: '',
      avatar: staff.avatar,
      status: staff.status,
      levelName: level?.name ?? '',
      serviceStartAt: staff.serviceStartAt,
      serviceEndAt: staff.serviceEndAt,
      crossDay: staff.crossDay,
      locationEnabled: staff.locationEnabled,
      rating: Number(staff.rating ?? 5),
      reviewCount: staff.reviewCount,
      orderCountTrue: staff.orderCountTrue,
    };
  };

  const pendingValuesOf = (raw: unknown): Record<string, unknown> => {
    let parsed = raw;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = {};
      }
    }
    const values = (parsed as { values?: Record<string, unknown> } | null)
      ?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      return {};
    }
    const kept: Record<string, unknown> = {};
    for (const key of PENDING_KEYS) {
      if (values[key] !== undefined) kept[key] = values[key];
    }
    return kept;
  };

  // ---------- 身份绑定 ----------

  /**
   * 绑定技师身份：顾客令牌（自证已在本店小程序登录过）+ 手机号 + 工号三要素核对。
   * 不匹配只回一句合并文案——不告诉来的是手机号还是工号错了，避免被用来枚举技师档案。
   */
  app.post('/api/public/onsite/staff-api/bind', async (c) => {
    const body = bindBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const customerPayload = parseCustomerToken(
      c.req.header('authorization') || '',
    );
    const customer = await customers.requireCustomer(customerPayload);
    if (customerPayload.shopId !== shop.shopId) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '顾客登录与目标店铺不一致，请在技师所属店铺的小程序内绑定',
      );
    }
    bindWindow.consume(
      `${shop.shopId}:staff-bind:${customer.id}`,
      '绑定尝试过于频繁，请一分钟后再试，或让店主核对你的工号',
    );
    const staff = await prisma.onsiteStaff.findFirst({
      where: {
        shopId: shop.shopId,
        phone: body.phone.trim().slice(0, 32),
        staffNo: body.staffNo.trim().slice(0, 32),
      },
    });
    if (!staff) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '未找到匹配的技师档案：请核对手机号与工号，或让店主在后台确认你已上岗',
      );
    }
    if (!['ONLINE', 'OFF_DUTY'].includes(staff.status)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        staff.status === 'PENDING'
          ? '你的档案还在店主审核中，请让店主在「服务人员」里审核通过后再绑定'
          : staff.status === 'SUSPENDED'
            ? '你当前被店主停用，请联系店主恢复在岗后再绑定'
            : '你已登记为离场，请联系店主重新上岗后再绑定',
      );
    }
    const card = await staffCard(staff, shop.shopCode);
    return c.json({
      token: issueStaffToken({
        shopId: shop.shopId,
        staffId: staff.id,
        customerId: customer.id,
        openid: customer.openid,
      }),
      staff: { ...card, shopName: shop.shopName },
    });
  });

  /** 解绑：JWT 无状态，服务端只确认，客户端清本地存储即完成登出。 */
  app.post('/api/public/onsite/staff-api/unbind', async (c) => {
    const body = shopCodeBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    await requireStaff(c, shop);
    return c.json({ ok: true });
  });

  // ---------- 档案 ----------

  app.get('/api/public/onsite/staff-api/profile', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { staff } = await requireStaff(c, shop);
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const [todayCount, awaitingAccept, serving, completedToday, trade] =
      await Promise.all([
        prisma.onsiteOrder.count({
          where: {
            shopId: shop.shopId,
            staffId: staff.id,
            startAt: { gte: today, lt: tomorrow },
            status: { not: 'PENDING_PAYMENT' },
          },
        }),
        prisma.onsiteOrder.count({
          where: { shopId: shop.shopId, staffId: staff.id, status: 'PAID' },
        }),
        prisma.onsiteOrder.count({
          where: {
            shopId: shop.shopId,
            staffId: staff.id,
            status: { in: ['ACCEPTED', 'EN_ROUTE', 'ON_SITE', 'SERVING'] },
          },
        }),
        prisma.onsiteOrder.count({
          where: {
            shopId: shop.shopId,
            staffId: staff.id,
            status: { in: ['COMPLETED', 'SIGNED', 'REVIEWED'] },
            startAt: { gte: today, lt: tomorrow },
          },
        }),
        shops.tradeById(shop.shopId),
      ]);
    const card = await staffCard(staff, shop.shopCode);
    return c.json({
      staff: { ...card, shopName: shop.shopName },
      stats: {
        todayOrders: todayCount,
        awaitingAccept,
        serving,
        completedToday,
      },
      // 待审副本是否已有内容：端上据此显示「资料修改审核中」角标
      pendingProfile:
        Object.keys(pendingValuesOf(staff.profilePending)).length > 0,
      alertEnabled: trade.alertEnabled,
    });
  });

  /**
   * 自助改资料：只写 profilePending 待审副本（含白名单收敛），由店主端
   * `staff.service.reviewProfile` 审核合并——与 C 端报名同一条审核线。
   * workYears/gender/lng/lat 不在店主端合并白名单里，提交后会被丢弃，
   * 需要变更时请店主在后台直接修改。
   */
  app.post('/api/public/onsite/staff-api/profile/update', async (c) => {
    const body = profileUpdateBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { staff } = await requireStaff(c, shop);
    writeWindow.consume(
      `${shop.shopId}:staff-profile:${staff.id}`,
      '提交过于频繁，请稍后再试',
    );
    const values: Record<string, unknown> = {};
    if (body.name !== undefined && body.name) values.name = body.name;
    if (body.avatar !== undefined) values.avatar = body.avatar;
    if (body.intro !== undefined) values.intro = body.intro;
    if (body.serviceCity !== undefined) values.serviceCity = body.serviceCity;
    if (body.address !== undefined) values.address = body.address;
    let startAt = staff.serviceStartAt;
    let endAt = staff.serviceEndAt;
    let crossDay = staff.crossDay;
    if (body.serviceStartAt !== undefined) {
      if (!isClock(body.serviceStartAt)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '可服务开始时间请填写 HH:MM，例如 09:00',
        );
      }
      startAt = body.serviceStartAt.padStart(5, '0');
      values.serviceStartAt = startAt;
    }
    if (body.serviceEndAt !== undefined) {
      if (!isClock(body.serviceEndAt)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '可服务结束时间请填写 HH:MM，例如 19:00',
        );
      }
      endAt = body.serviceEndAt.padStart(5, '0');
      values.serviceEndAt = endAt;
    }
    if (body.crossDay !== undefined) {
      crossDay = body.crossDay;
      values.crossDay = crossDay;
    }
    // 时段成对校验用「副本 + 现值」合并后的结果，口径与店主端 saveStaff 一致
    if (!crossDay && minutesOfClock(endAt) <= minutesOfClock(startAt)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '可服务时段结束必须晚于开始；夜班跨零点请打开「允许跨零点」开关',
      );
    }
    if (!Object.keys(values).length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '没有可提交的资料变更，请修改后再提交（工作年限、证件照片等请联系店主在后台维护）',
      );
    }
    await prisma.onsiteStaff.update({
      where: { id: staff.id },
      data: { profilePending: { values } as Prisma.InputJsonObject },
    });
    return c.json({ pending: true, fields: Object.keys(values) });
  });

  // ---------- 收入 ----------

  /**
   * 收入概览：三条口径分开列，避免技师把「应发」当成「已发」。
   *   1. 服务毛收入 = 已完成/已签收/已评价订单的实付金额；
   *   2. 承担佣金 = 自己这张单按分账规则扣出去的钱（bearerRole=STAFF）；
   *   3. 合伙人佣金 = 自己作为技师合伙人从别人订单里分到的钱（sourceRole=PARTNER）；
   * 结算单（settlements）才是最终应发：净额 = 毛收入 − 承担，由店主按周期生成。
   */
  app.get('/api/public/onsite/staff-api/income/overview', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { staff } = await requireStaff(c, shop);
    const sid = shop.shopId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const settledStatuses = ['COMPLETED', 'SIGNED', 'REVIEWED'];
    const [orders, monthOrders, borne, monthBorne, partner, settlements] =
      await Promise.all([
        prisma.onsiteOrder.aggregate({
          where: {
            shopId: sid,
            staffId: staff.id,
            status: { in: settledStatuses },
          },
          _sum: { payAmount: true },
          _count: { _all: true },
        }),
        prisma.onsiteOrder.aggregate({
          where: {
            shopId: sid,
            staffId: staff.id,
            status: { in: settledStatuses },
            startAt: { gte: monthStart },
          },
          _sum: { payAmount: true },
          _count: { _all: true },
        }),
        prisma.onsiteOrderCommissionShare.aggregate({
          where: {
            shopId: sid,
            bearerRole: 'STAFF',
            bearerId: staff.id,
            status: 'ACTIVE',
          },
          _sum: { amount: true },
        }),
        prisma.onsiteOrderCommissionShare.aggregate({
          where: {
            shopId: sid,
            bearerRole: 'STAFF',
            bearerId: staff.id,
            status: 'ACTIVE',
            createdAt: { gte: monthStart },
          },
          _sum: { amount: true },
        }),
        prisma.onsiteOrderCommissionItem.aggregate({
          where: {
            shopId: sid,
            sourceRole: 'PARTNER',
            sourceId: staff.id,
            status: 'ACTIVE',
          },
          _sum: { totalAmount: true },
        }),
        prisma.onsiteSettlement.groupBy({
          by: ['status'],
          where: { shopId: sid, staffId: staff.id },
          _sum: { netAmount: true },
        }),
      ]);
    const settledOf = (status: string) =>
      centsOf(settlements.find((row) => row.status === status)?._sum.netAmount);
    const level = staff.levelId
      ? await prisma.onsiteStaffLevel.findFirst({
          where: { id: staff.levelId, shopId: sid },
          select: { name: true },
        })
      : null;
    return c.json({
      staff: { id: staff.id, name: staff.name, levelName: level?.name ?? '' },
      monthLabel: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      orderCount: orders._count._all,
      grossCents: centsOf(orders._sum.payAmount),
      monthOrderCount: monthOrders._count._all,
      monthGrossCents: centsOf(monthOrders._sum.payAmount),
      borneCents: centsOf(borne._sum.amount),
      monthBorneCents: centsOf(monthBorne._sum.amount),
      partnerCommissionCents: centsOf(partner._sum.totalAmount),
      pendingSettleCents: settledOf('PENDING'),
      paidSettleCents: settledOf('PAID'),
    });
  });

  /** 我的合伙人佣金明细（我作为合伙人从其他订单分到的钱按订单行拆分）。 */
  app.get('/api/public/onsite/staff-api/income/commissions', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { staff } = await requireStaff(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = {
      shopId: shop.shopId,
      sourceRole: 'PARTNER',
      sourceId: staff.id,
    };
    const [total, rows] = await Promise.all([
      prisma.onsiteOrderCommissionItem.count({ where }),
      prisma.onsiteOrderCommissionItem.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const commissions = await prisma.onsiteOrderCommission.findMany({
      where: {
        shopId: shop.shopId,
        orderId: { in: [...new Set(rows.map((row) => row.orderId))] },
      },
      select: { orderId: true, orderNo: true },
    });
    const orderNoOf = new Map(
      commissions.map((row) => [row.orderId, row.orderNo]),
    );
    return c.json({
      list: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNo: orderNoOf.get(row.orderId) ?? '',
        status: row.status,
        totalRate: Number(row.totalRate ?? 0),
        baseAmountCents: centsOf(row.baseAmount),
        amountCents: centsOf(row.totalAmount),
        reversedCents: centsOf(row.reversedAmount),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    });
  });

  /** 我承担的佣金明细：每单按承担方拆分后我出的那部分，退款冲销会同步变少。 */
  app.get('/api/public/onsite/staff-api/income/borne', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { staff } = await requireStaff(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = {
      shopId: shop.shopId,
      bearerRole: 'STAFF',
      bearerId: staff.id,
    };
    const [total, rows] = await Promise.all([
      prisma.onsiteOrderCommissionShare.count({ where }),
      prisma.onsiteOrderCommissionShare.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const commissions = await prisma.onsiteOrderCommission.findMany({
      where: {
        shopId: shop.shopId,
        orderId: { in: [...new Set(rows.map((row) => row.orderId))] },
      },
      select: { orderId: true, orderNo: true },
    });
    const orderNoOf = new Map(
      commissions.map((row) => [row.orderId, row.orderNo]),
    );
    return c.json({
      list: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNo: orderNoOf.get(row.orderId) ?? '',
        status: row.status,
        amountCents: centsOf(row.amount),
        reversedCents: centsOf(row.reversedAmount),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    });
  });

  /** 结算记录：店主按周期生成，净额 = 毛收入 − 承担佣金；这里只读，打款由店主登记。 */
  app.get('/api/public/onsite/staff-api/income/settlements', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { staff } = await requireStaff(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = { shopId: shop.shopId, staffId: staff.id };
    const [total, rows] = await Promise.all([
      prisma.onsiteSettlement.count({ where }),
      prisma.onsiteSettlement.findMany({
        where,
        orderBy: { periodEnd: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return c.json({
      list: rows.map((row) => ({
        id: row.id,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        orderCount: row.orderCount,
        grossCents: centsOf(row.grossAmount),
        commissionCents: centsOf(row.commissionAmount),
        netCents: centsOf(row.netAmount),
        status: row.status,
        paidAt: row.paidAt ? row.paidAt.toISOString() : '',
        remark: row.remark,
      })),
      total,
      page,
      pageSize,
    });
  });

  // ---------- 订单 ----------

  /** 技师工作台订单列表：只列「本店 + 指派给我」的单，未付款顾客电话一律打码。 */
  app.get('/api/public/onsite/staff-api/orders', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { payload } = await requireStaff(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const status = query.status.trim();
    const where = {
      shopId: shop.shopId,
      staffId: payload.staffId,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.onsiteOrder.count({ where }),
      prisma.onsiteOrder.findMany({
        where,
        orderBy: { startAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const itemRows = await prisma.onsiteOrderItem.findMany({
      where: {
        shopId: shop.shopId,
        // orderId 已来自 `shopId + staffId` 双条件过滤的页，明细天然同归属
        orderId: { in: rows.map((row) => row.id) },
      },
      select: { orderId: true, title: true },
    });
    const titlesOf = new Map<number, string[]>();
    for (const item of itemRows) {
      const bucket = titlesOf.get(item.orderId) ?? [];
      bucket.push(item.title);
      titlesOf.set(item.orderId, bucket);
    }
    const list = rows.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      status: row.status,
      payStatus: row.payStatus,
      refundStatus: row.refundStatus,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      durationMinutes: row.durationMinutes,
      payAmountCents: Math.round(Number(row.payAmount) * 100),
      serviceTitles: titlesOf.get(row.id) ?? [],
      customerName: row.customerName,
      // 成单前顾客联系方式对技师也不可见（与 C 端「成单后才给技师手机号」对称）
      customerPhone:
        row.payStatus === 'PAID'
          ? row.customerPhone
          : maskPhone(row.customerPhone),
      reviewed: row.reviewed,
      createdAt: row.createdAt.toISOString(),
    }));
    return c.json({ list, total, page, pageSize });
  });

  /**
   * 订单详情：先按 `shopId + staffId` 认定「这单是我的」，再复用顾客侧
   * `publicDetail` 出全量快照——同一份口径两端一致；未付款时抹掉地址、电话打码。
   */
  app.get('/api/public/onsite/staff-api/order/detail', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { payload } = await requireStaff(c, shop);
    const orderId = Number(query.orderId) || 0;
    const order = await prisma.onsiteOrder.findFirst({
      where: { id: orderId, shopId: shop.shopId, staffId: payload.staffId },
    });
    if (!order) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '订单不存在或不属于你，请在订单列表里打开这张单',
      );
    }
    const detail = await orders.publicDetail(
      shop.shopId,
      order.customerId,
      order.id,
    );
    if (order.payStatus !== 'PAID') {
      detail.address = null;
      detail.customerPhone = maskPhone(order.customerPhone);
    }
    return c.json(detail);
  });

  /** 履约推进：六步动作全部交给 applyTransition（角色 STAFF），打卡照片/坐标随 extra 落 track。 */
  app.post('/api/public/onsite/staff-api/order/advance', async (c) => {
    const body = orderAdvanceBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { payload, staff } = await requireStaff(c, shop);
    writeWindow.consume(
      `${shop.shopId}:staff-advance:${staff.id}`,
      '操作过于频繁，请稍后再试',
    );
    // 越权与不存在同一句文案：不向未指派的技师披露订单存在性
    const order = await prisma.onsiteOrder.findFirst({
      where: {
        id: body.orderId,
        shopId: shop.shopId,
        staffId: payload.staffId,
      },
    });
    if (!order) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '订单不存在或不属于你，请在订单列表里操作',
      );
    }
    return c.json(
      await orders.applyTransition(
        shop.shopId,
        order,
        body.action as OrderAction,
        'STAFF',
        String(staff.id),
        {
          content: body.content,
          image: body.image,
          address: body.address,
          lng: body.lng,
          lat: body.lat,
        },
      ),
    );
  });

  /**
   * 实时定位上报：`locationEnabled` 默认关是隐私不变量——店主没在后台打开就不收，
   * 这里只回 lastLocationAt 与经纬度，不写 address 主列（常驻地址归资料审核线）。
   */
  app.post('/api/public/onsite/staff-api/location', async (c) => {
    const body = locationBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { staff } = await requireStaff(c, shop);
    if (!staff.locationEnabled) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先在店铺后台开启技师定位',
      );
    }
    const at = new Date();
    await prisma.onsiteStaff.update({
      where: { id: staff.id },
      data: { lng: body.lng, lat: body.lat, lastLocationAt: at },
    });
    return c.json({
      ok: true,
      lng: body.lng,
      lat: body.lat,
      at: at.toISOString(),
    });
  });

  // ---------- 排期与休息 ----------

  /** 自己的档期：viewer=STAFF 不做过期过滤、不加缓冲（技师要能补录已过去的档）。 */
  app.get('/api/public/onsite/staff-api/schedule', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { payload } = await requireStaff(c, shop);
    return c.json(
      await schedule.timelineFor({
        shopId: shop.shopId,
        day: query.day,
        staffId: payload.staffId,
        serviceId: Number(query.serviceId) || undefined,
        viewer: 'STAFF',
        trade: shop.trade,
      }),
    );
  });

  /** 自助休息段：staffId 永远取令牌载荷，请求里的 staffId 直接忽略。 */
  app.get('/api/public/onsite/staff-api/rest', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { payload } = await requireStaff(c, shop);
    const where = {
      shopId: shop.shopId,
      staffId: payload.staffId,
      ...(query.day
        ? { startAt: { gte: combineDateTime(query.day, '00:00') } }
        : {}),
    };
    const rows = await prisma.onsiteStaffRestPeriod.findMany({
      where,
      orderBy: { startAt: 'asc' },
      take: 200,
    });
    return c.json({
      list: rows.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        startAt: row.startAt.toISOString(),
        endAt: row.endAt.toISOString(),
        allDay: row.allDay,
        reason: row.reason,
        createdByRole: row.createdByRole,
      })),
    });
  });

  app.post('/api/public/onsite/staff-api/rest/save', async (c) => {
    const body = restSaveBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { staff } = await requireStaff(c, shop);
    writeWindow.consume(
      `${shop.shopId}:staff-rest:${staff.id}`,
      '操作过于频繁，请稍后再试',
    );
    const startAt = combineDateTime(body.day, body.startAt);
    const endAt = combineDateTime(body.day, body.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '休息时段请填写具体开始与结束时间（HH:MM 或完整时间）',
      );
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '休息结束时间必须晚于开始时间',
      );
    }
    if (body.id) {
      const existing = await prisma.onsiteStaffRestPeriod.findFirst({
        where: { id: body.id, shopId: shop.shopId, staffId: staff.id },
      });
      if (!existing) {
        throw new BusinessException(ErrorCode.NOT_FOUND, '休息时段不存在');
      }
    }
    const row = await prisma.onsiteStaffRestPeriod.upsert({
      where: { id: body.id || 0 },
      create: {
        shopId: shop.shopId,
        staffId: staff.id,
        startAt,
        endAt,
        reason: body.reason,
        createdByRole: 'STAFF',
        createdBy: String(staff.id),
      },
      update: { startAt, endAt, reason: body.reason },
    });
    // 档期缓存必须失效，否则 30 秒内 C 端还看得到刚设的休息段
    schedule.invalidate(staff.id);
    return c.json({
      id: row.id,
      staffId: row.staffId,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      allDay: row.allDay,
      reason: row.reason,
      createdByRole: row.createdByRole,
    });
  });

  app.post('/api/public/onsite/staff-api/rest/remove', async (c) => {
    const body = restRemoveBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { staff } = await requireStaff(c, shop);
    const row = await prisma.onsiteStaffRestPeriod.findFirst({
      where: { id: body.id, shopId: shop.shopId, staffId: staff.id },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '休息时段不存在');
    await prisma.onsiteStaffRestPeriod.delete({ where: { id: row.id } });
    schedule.invalidate(staff.id);
    return c.json({ removed: true });
  });

  // ---------- 申诉 / 反馈 / 报警 ----------

  /**
   * 差评申诉：先按 `shopId + staffId + reviewId` 确认「这条差评确实是打在我身上的」，
   * 再进 createAppeal——服务本身不校验 review.staffId 与申诉人一致，这道前置不能省。
   */
  app.post('/api/public/onsite/staff-api/appeal', async (c) => {
    const body = appealBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { staff } = await requireStaff(c, shop);
    writeWindow.consume(
      `${shop.shopId}:staff-appeal:${staff.id}`,
      '提交过于频繁，请稍后再试',
    );
    const review = await prisma.onsiteReview.findFirst({
      where: {
        id: body.reviewId,
        shopId: shop.shopId,
        staffId: staff.id,
      },
    });
    if (!review) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '评价不存在或不是针对你的差评',
      );
    }
    return c.json(
      await reviews.createAppeal(shop.shopId, {
        reviewId: review.id,
        staffId: staff.id,
        reason: body.reason,
        images: body.images,
      }),
    );
  });

  app.get('/api/public/onsite/staff-api/appeals', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { staff } = await requireStaff(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const status = query.status.trim();
    const where = {
      shopId: shop.shopId,
      staffId: staff.id,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.onsiteReviewAppeal.count({ where }),
      prisma.onsiteReviewAppeal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const ordersOf = await prisma.onsiteOrder.findMany({
      where: { id: { in: rows.map((row) => row.orderId).filter(Boolean) } },
      select: { id: true, orderNo: true },
    });
    const orderNo = new Map(ordersOf.map((row) => [row.id, row.orderNo]));
    return c.json({
      list: rows.map((row) => ({
        id: row.id,
        reviewId: row.reviewId,
        orderNo: orderNo.get(row.orderId) ?? '',
        staffId: row.staffId,
        reason: row.reason,
        images: stringArray(row.images),
        status: row.status,
        reply: row.reply,
        handledAt: row.handledAt ? row.handledAt.toISOString() : '',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    });
  });

  /** 技师反馈：customerId 恒 0（不是顾客投诉），orderId 只有在确实是自己单时才带上。 */
  app.post('/api/public/onsite/staff-api/feedback', async (c) => {
    const body = feedbackBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { staff } = await requireStaff(c, shop);
    writeWindow.consume(
      `${shop.shopId}:staff-feedback:${staff.id}`,
      '提交过于频繁，请稍后再试',
    );
    let orderId = 0;
    if (body.orderId) {
      const order = await prisma.onsiteOrder.findFirst({
        where: {
          id: body.orderId,
          shopId: shop.shopId,
          staffId: staff.id,
        },
        select: { id: true },
      });
      orderId = order?.id ?? 0;
    }
    return c.json(
      await reviews.submitFeedback(shop.shopId, {
        customerId: 0,
        staffId: staff.id,
        orderId,
        category: body.category,
        content: body.content,
        images: body.images,
        video: body.video,
      }),
    );
  });

  /** 自己的反馈列表（含店主回复），别的技师/顾客的反馈不可见。 */
  app.get('/api/public/onsite/staff-api/feedbacks', async (c) => {
    const query = pageQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { staff } = await requireStaff(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = { shopId: shop.shopId, staffId: staff.id };
    const [total, rows] = await Promise.all([
      prisma.onsiteFeedback.count({ where }),
      prisma.onsiteFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return c.json({
      list: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        category: row.category,
        content: row.content,
        images: stringArray(row.images),
        video: row.video,
        status: row.status,
        reply: row.reply,
        handledAt: row.handledAt ? row.handledAt.toISOString() : '',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    });
  });

  /**
   * 一键报警：走 alerts.raise（role 语义即技师报自己）。alertEnabled 开关与
   * 短时间去重都在告警服务里判，这里不再复制一份。
   */
  app.post('/api/public/onsite/staff-api/alert', async (c) => {
    const body = alertBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { staff } = await requireStaff(c, shop);
    return c.json(
      await alerts.raise(shop.shopId, {
        staffId: staff.id,
        orderId: body.orderId || undefined,
        lng: body.lng,
        lat: body.lat,
        address: body.address,
        content: body.remark || '技师端一键求救',
      }),
    );
  });
}
