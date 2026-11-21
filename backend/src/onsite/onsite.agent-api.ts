import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import { pageParam } from '../common/api';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import {
  issueAgentToken,
  parseAgentToken,
  type AgentRole,
} from './agent-token';
import { centsOf, maskPhone } from './onsite.money';

const bindBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  phone: z.string().trim().min(3).max(32),
});
const shopCodeQuery = z.object({
  shopCode: z.string().trim().max(16).default(''),
  page: z.string().default('1'),
  pageSize: z.string().default('20'),
  status: z.string().default(''),
});
const shopCodeBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
});
const changeStaffBody = shopCodeBody.extend({
  orderId: z.coerce.number().int().positive(),
  staffId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(200).default(''),
});
const technicianApplyBody = shopCodeBody.extend({
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(3).max(32),
  city: z.string().trim().max(60).default(''),
  intro: z.string().trim().max(2000).default(''),
});

const ROLE_LABELS: Record<AgentRole, string> = {
  AGENT: '区域代理',
  SALESMAN: '业务员',
  CHANNEL: '渠道商',
};
const AGENT_TYPE_LABELS: Record<string, string> = {
  PROVINCE: '省代',
  CITY: '市代',
  DISTRICT: '区县代',
};

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  );
}

type ActorRecord = {
  name: string;
  phone: string;
  rate: number;
  regionName: string;
  parentName: string;
  agentType: string;
  status: string;
};

/**
 * 代理端公开通道（`/api/public/onsite/agent-api/**`）。
 *
 * 三类身份共用一条通道：区域代理 / 业务员 / 渠道商。绑定只认「店铺码 + 手机号」，
 * 手机号在后台由店主录入，所以换人 = 换手机号；令牌只带 shopId + role + refId，
 * 每次取数再回库校验是否仍在岗（停用立即断权，不等令牌过期）。
 * 佣金口径与店主端完全一致：只读 `onsite_order_commission_items`，
 * 下单预生成 PENDING、支付才 ACTIVE、退款冲销写 REVERSED + reversedAmount。
 */
export function registerOnsiteAgentApi(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const { shops } = services.onsite;
  const prisma = services.prisma;
  // 手机号可被枚举尝试：单 IP 限 8 次/分钟，与技师绑定同一口径
  const bindWindow = new RateWindow(8, 60_000);
  // 招募报名：同样按 IP 限流，避免被拿来刷待审技师
  const applyWindow = new RateWindow(5, 60_000);

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

  /** 令牌 + 回库重查：按 role 找回业务主体并确认仍启用。 */
  const requireActor = async (
    c: Context<ApiEnv, string, Input>,
    shop: Awaited<ReturnType<typeof requireShop>>,
  ) => {
    const payload = parseAgentToken(c.req.header('authorization') || '');
    if (payload.shopId !== shop.shopId) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '代理身份与该店铺不匹配，请在所属店铺的小程序内重新绑定',
      );
    }
    const sid = shop.shopId;
    let record: ActorRecord | null = null;
    if (payload.role === 'AGENT') {
      const row = await prisma.onsiteAgentAccount.findFirst({
        where: { id: payload.refId, shopId: sid },
      });
      if (row) {
        const parent = row.parentId
          ? await prisma.onsiteAgentAccount.findFirst({
              where: { id: row.parentId, shopId: sid },
              select: { name: true },
            })
          : null;
        record = {
          name: row.name,
          phone: row.phone,
          rate: Number(row.commissionRate ?? 0),
          regionName: [row.provinceCode, row.cityCode, row.areaCode]
            .filter(Boolean)
            .join(' / '),
          parentName: parent?.name ?? '',
          agentType: row.agentType,
          status: row.status,
        };
      }
    } else if (payload.role === 'SALESMAN') {
      const row = await prisma.onsiteSalesman.findFirst({
        where: { id: payload.refId, shopId: sid },
      });
      if (row) {
        const agent = row.agentId
          ? await prisma.onsiteAgentAccount.findFirst({
              where: { id: row.agentId, shopId: sid },
              select: { name: true },
            })
          : null;
        record = {
          name: row.name,
          phone: row.phone,
          rate: Number(row.rate ?? 0),
          regionName: row.area,
          parentName: agent?.name ?? '',
          agentType: '',
          status: row.status,
        };
      }
    } else {
      const row = await prisma.onsiteChannel.findFirst({
        where: { id: payload.refId, shopId: sid },
      });
      if (row) {
        const category = row.categoryId
          ? await prisma.onsiteChannelCategory.findFirst({
              where: { id: row.categoryId, shopId: sid },
              select: { name: true },
            })
          : null;
        record = {
          name: row.name,
          phone: row.phone,
          rate: Number(row.rate ?? 0),
          regionName: category?.name ?? '',
          parentName: '',
          agentType: '',
          status: row.status,
        };
      }
    }
    if (!record) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '业务身份已不存在，请联系店主确认后重新绑定手机号',
      );
    }
    if (record.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '你已被店主停用，请联系店主恢复后再进入代理中心',
      );
    }
    return { payload, record };
  };

  /** 我的佣金：只取「我作为获益方」的明细行，与店主端台账同源。 */
  const commissionWhere = (shopId: number, role: AgentRole, refId: number) => ({
    shopId,
    sourceRole: role,
    sourceId: refId,
  });

  // ---------- 身份绑定 ----------

  app.post('/api/public/onsite/agent-api/bind', async (c) => {
    const body = bindBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    bindWindow.consume(
      `${shop.shopId}:agent-bind:${clientIp(c) || 'unknown'}`,
      '绑定尝试过于频繁，请一分钟后再试，或让店主核对手机号',
    );
    const phone = body.phone.trim().slice(0, 32);
    const sid = shop.shopId;
    const agent = await prisma.onsiteAgentAccount.findFirst({
      where: { shopId: sid, phone, status: 'ACTIVE' },
      orderBy: { id: 'asc' },
    });
    const salesman = agent
      ? null
      : await prisma.onsiteSalesman.findFirst({
          where: { shopId: sid, phone, status: 'ACTIVE' },
          orderBy: { id: 'asc' },
        });
    const channel =
      agent || salesman
        ? null
        : await prisma.onsiteChannel.findFirst({
            where: { shopId: sid, phone, status: 'ACTIVE' },
            orderBy: { id: 'asc' },
          });
    const matched = agent
      ? { role: 'AGENT' as AgentRole, refId: agent.id, name: agent.name }
      : salesman
        ? {
            role: 'SALESMAN' as AgentRole,
            refId: salesman.id,
            name: salesman.name,
          }
        : channel
          ? {
              role: 'CHANNEL' as AgentRole,
              refId: channel.id,
              name: channel.name,
            }
          : null;
    if (!matched) {
      // 有记录但被停用时单独说明：否则「没登记」会让人误以为店主没录入
      const [disabledAgent, disabledSalesman, disabledChannel] =
        await Promise.all([
          prisma.onsiteAgentAccount.findFirst({
            where: { shopId: sid, phone },
            select: { id: true },
          }),
          prisma.onsiteSalesman.findFirst({
            where: { shopId: sid, phone },
            select: { id: true },
          }),
          prisma.onsiteChannel.findFirst({
            where: { shopId: sid, phone },
            select: { id: true },
          }),
        ]);
      if (disabledAgent || disabledSalesman || disabledChannel) {
        throw new BusinessException(
          ErrorCode.UNAUTHORIZED,
          '该手机号对应的业务身份已被店主停用，请联系店主恢复后再绑定',
        );
      }
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '该手机号没有在本店登记为代理/业务员/渠道商：请让店主在「代理分销」里录入并确认手机号，或核对后重试',
      );
    }
    return c.json({
      token: issueAgentToken({
        shopId: sid,
        role: matched.role,
        refId: matched.refId,
        phone,
      }),
      identity: {
        role: matched.role,
        roleName: ROLE_LABELS[matched.role],
        name: matched.name,
        phone: maskPhone(phone),
        shopName: shop.shopName,
        shopCode: shop.shopCode,
      },
    });
  });

  /** 解绑：JWT 无状态，服务端只确认，客户端清本地存储即完成登出。 */
  app.post('/api/public/onsite/agent-api/unbind', async (c) => {
    const body = shopCodeBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    await requireActor(c, shop);
    return c.json({ ok: true });
  });

  // ---------- 工作台 ----------

  app.get('/api/public/onsite/agent-api/profile', async (c) => {
    const query = shopCodeQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { payload, record } = await requireActor(c, shop);
    const where = commissionWhere(shop.shopId, payload.role, payload.refId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const relationWhere =
      payload.role === 'AGENT'
        ? { shopId: shop.shopId, agentId: payload.refId }
        : payload.role === 'SALESMAN'
          ? { shopId: shop.shopId, salesmanId: payload.refId }
          : { shopId: shop.shopId, channelId: payload.refId };
    const [
      activeSum,
      pendingSum,
      monthSum,
      relationCount,
      orderGroups,
      withdrawals,
    ] = await Promise.all([
      prisma.onsiteOrderCommissionItem.aggregate({
        where: { ...where, status: 'ACTIVE' },
        _sum: { totalAmount: true },
      }),
      prisma.onsiteOrderCommissionItem.aggregate({
        where: { ...where, status: 'PENDING' },
        _sum: { totalAmount: true },
      }),
      prisma.onsiteOrderCommissionItem.aggregate({
        where: { ...where, status: 'ACTIVE', createdAt: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      prisma.onsiteRelation.count({
        where: {
          ...relationWhere,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      prisma.onsiteOrderCommissionItem.groupBy({
        by: ['orderId'],
        where,
        _count: { _all: true },
      }),
      payload.role === 'AGENT'
        ? prisma.onsiteWithdrawal.aggregate({
            where: {
              shopId: shop.shopId,
              ownerType: 'AGENT',
              ownerId: payload.refId,
              status: { in: ['PENDING', 'APPROVED'] },
            },
            _sum: { actualAmount: true },
          })
        : Promise.resolve({ _sum: { actualAmount: null } }),
    ]);
    return c.json({
      identity: {
        role: payload.role,
        roleName: ROLE_LABELS[payload.role],
        name: record.name,
        phone: maskPhone(record.phone),
        rate: record.rate,
        agentType: record.agentType,
        agentTypeName: AGENT_TYPE_LABELS[record.agentType] ?? '',
        regionName: record.regionName,
        parentName: record.parentName,
        shopName: shop.shopName,
        shopCode: shop.shopCode,
      },
      stats: {
        orderCount: orderGroups.length,
        customerCount: relationCount,
        commissionCents: centsOf(activeSum._sum.totalAmount),
        pendingCommissionCents: centsOf(pendingSum._sum.totalAmount),
        monthCommissionCents: centsOf(monthSum._sum.totalAmount),
        pendingWithdrawCents: centsOf(withdrawals._sum.actualAmount),
      },
    });
  });

  // ---------- 佣金台账 ----------

  app.get('/api/public/onsite/agent-api/commissions', async (c) => {
    const query = shopCodeQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { payload } = await requireActor(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const status = query.status.trim();
    const where = {
      ...commissionWhere(shop.shopId, payload.role, payload.refId),
      ...(status && status !== 'all' ? { status } : {}),
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
      select: { orderId: true, orderNo: true, status: true },
    });
    const orderInfo = new Map(commissions.map((row) => [row.orderId, row]));
    const list = rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      orderNo: orderInfo.get(row.orderId)?.orderNo ?? '',
      commissionStatus: orderInfo.get(row.orderId)?.status ?? '',
      status: row.status,
      role: row.sourceRole,
      roleName: ROLE_LABELS[row.sourceRole as AgentRole] ?? row.sourceRole,
      totalRate: Number(row.totalRate ?? 0),
      baseAmountCents: centsOf(row.baseAmount),
      amountCents: centsOf(row.totalAmount),
      reversedCents: centsOf(row.reversedAmount),
      createdAt: row.createdAt.toISOString(),
    }));
    return c.json({ list, total, page, pageSize });
  });

  // ---------- 订单 / 退款 ----------

  /** 我的订单：按「有我的佣金明细」反查订单，佣金为 0 的单不出现。 */
  app.get('/api/public/onsite/agent-api/orders', async (c) => {
    const query = shopCodeQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { payload } = await requireActor(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = commissionWhere(shop.shopId, payload.role, payload.refId);
    const distinct = await prisma.onsiteOrderCommissionItem.findMany({
      where,
      select: { orderId: true },
      distinct: ['orderId'],
    });
    const orderIds = distinct.map((row) => row.orderId);
    const [total, rows, sums] = await Promise.all([
      Promise.resolve(orderIds.length),
      prisma.onsiteOrder.findMany({
        where: { shopId: shop.shopId, id: { in: orderIds } },
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      prisma.onsiteOrderCommissionItem.groupBy({
        by: ['orderId'],
        where: { ...where, orderId: { in: orderIds } },
        _sum: { totalAmount: true, reversedAmount: true },
      }),
    ]);
    const sumOf = new Map(sums.map((row) => [row.orderId, row._sum]));
    const list = rows.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      status: row.status,
      payStatus: row.payStatus,
      startAt: row.startAt.toISOString(),
      staffName: row.staffName,
      customerName: row.customerName,
      payAmountCents: centsOf(row.payAmount),
      commissionCents: centsOf(sumOf.get(row.id)?.totalAmount),
      reversedCents: centsOf(sumOf.get(row.id)?.reversedAmount),
      createdAt: row.createdAt.toISOString(),
    }));
    return c.json({ list, total, page, pageSize });
  });

  app.get('/api/public/onsite/agent-api/refunds', async (c) => {
    const query = shopCodeQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { payload } = await requireActor(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = commissionWhere(shop.shopId, payload.role, payload.refId);
    const distinct = await prisma.onsiteOrderCommissionItem.findMany({
      where,
      select: { orderId: true },
      distinct: ['orderId'],
    });
    const orderIds = distinct.map((row) => row.orderId);
    const recordWhere = { shopId: shop.shopId, orderId: { in: orderIds } };
    const [total, rows] = await Promise.all([
      prisma.onsiteRefund.count({ where: recordWhere }),
      prisma.onsiteRefund.findMany({
        where: recordWhere,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const orders = await prisma.onsiteOrder.findMany({
      where: {
        shopId: shop.shopId,
        id: { in: [...new Set(rows.map((row) => row.orderId))] },
      },
      select: { id: true, orderNo: true },
    });
    const orderNoOf = new Map(orders.map((row) => [row.id, row.orderNo]));
    return c.json({
      list: rows.map((row) => ({
        id: row.id,
        refundNo: row.refundNo,
        orderId: row.orderId,
        orderNo: orderNoOf.get(row.orderId) ?? '',
        applyCents: centsOf(row.applyAmount),
        refundCents: centsOf(row.refundAmount),
        status: row.status,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    });
  });

  // ---------- 技师（只读，用于说明「这单是谁做的」）----------

  app.get('/api/public/onsite/agent-api/technicians', async (c) => {
    const query = shopCodeQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    await requireActor(c, shop);
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = {
      shopId: shop.shopId,
      status: { in: ['ONLINE', 'OFF_DUTY'] },
    };
    const [total, rows] = await Promise.all([
      prisma.onsiteStaff.count({ where }),
      prisma.onsiteStaff.findMany({
        where,
        orderBy: [{ rating: 'desc' }, { id: 'asc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    return c.json({
      list: rows.map((row) => ({
        id: row.id,
        name: row.name,
        avatar: row.avatar,
        status: row.status,
        rating: Number(row.rating ?? 5),
        reviewCount: row.reviewCount,
        orderCount: row.orderCountTrue,
        serviceCity: row.serviceCity,
      })),
      total,
      page,
      pageSize,
    });
  });

  // ---------- 改派 / 招募技师 / 分享海报 ----------

  /** 待接单订单改派：与店主派单同一套车费重算与留痕，操作者记为 AGENT。 */
  app.post('/api/public/onsite/agent-api/orders/change-staff', async (c) => {
    const body = changeStaffBody.parse(await c.req.json().catch(() => ({})));
    const shop = await requireShop(body.shopCode);
    const { payload } = await requireActor(c, shop);
    const order = await prisma.onsiteOrder.findFirst({
      where: { id: body.orderId, shopId: shop.shopId },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    }
    if (!['PENDING_PAYMENT', 'PAID'].includes(order.status)) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有待付款或待接单的订单可以改派；已接单/服务中的订单请让店主在后台处理',
      );
    }
    const updated = await services.onsite.orders.dispatchWithShop(
      shop,
      body.orderId,
      body.staffId,
      { role: 'AGENT', id: `${payload.role}:${payload.refId}` },
    );
    if (body.reason) {
      await prisma.onsiteOrderStatusLog
        .create({
          data: {
            orderId: body.orderId,
            shopId: shop.shopId,
            fromStatus: order.status,
            toStatus: order.status,
            operatorRole: 'AGENT',
            operatorId: `${payload.role}:${payload.refId}`,
            action: 'changeStaffRequest',
            content: body.reason.slice(0, 200),
          },
        })
        .catch(() => undefined);
    }
    return c.json({ orderNo: updated.orderNo, staffName: updated.staffName });
  });

  /** 代理招募技师：建档为待审核，店主在「服务人员」里通过后才能登录技师端。 */
  app.post('/api/public/onsite/agent-api/technicians/apply', async (c) => {
    const body = technicianApplyBody.parse(
      await c.req.json().catch(() => ({})),
    );
    const shop = await requireShop(body.shopCode);
    await requireActor(c, shop);
    applyWindow.consume(
      `${shop.shopId}:technician-apply:${clientIp(c) || 'unknown'}`,
      '提交过于频繁，请一分钟后再试',
    );
    const created = await services.onsite.staff.applyFromSubmission(
      shop.shopId,
      {
        name: body.name,
        phone: body.phone,
        city: body.city,
        intro: body.intro,
      },
    );
    return c.json({
      id: created.id,
      name: created.name,
      status: created.status,
      message:
        '已提交招募信息，待店主在「服务人员」审核通过后，技师即可用手机号登录技师端',
    });
  });

  /** 代理分享海报：文案 + 小程序码，端上用 canvas 合成（SVG 不适合小程序直接展示）。 */
  app.get('/api/public/onsite/agent-api/poster', async (c) => {
    const query = shopCodeQuery.parse(c.req.query());
    const shop = await requireShop(query.shopCode);
    const { record } = await requireActor(c, shop);
    const poster = await services.onsite.poster.agentPoster(shop, {
      name: record.name,
      phone: record.phone,
    });
    return c.json({
      title: poster.title,
      subtitle: poster.subtitle,
      contact: poster.contact,
      shopName: poster.shopName,
      shopCode: shop.shopCode,
      qrcodeUrl: poster.qrcodeUrl,
      width: poster.width,
      height: poster.height,
    });
  });
}
