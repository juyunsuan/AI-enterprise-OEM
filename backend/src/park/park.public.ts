import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';

const bootstrapQuery = z.object({
  park: z.string().trim().max(16).default(''),
  appId: z.string().trim().max(64).default(''),
});
const loginBody = z.object({
  park: z.string().trim().max(16).default(''),
  code: z.string().trim().min(1).max(128),
});
const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  kind: z.string().trim().max(16).default(''),
  status: z.string().trim().max(16).default(''),
  category: z.string().trim().max(24).default(''),
  keyword: z.string().trim().max(60).default(''),
});
const idQuery = z.object({
  id: z.coerce.number().int().positive(),
});
const profileBody = z.object({
  nickname: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(32).optional(),
  avatar: z.string().trim().max(500).optional(),
});
const bindBody = z.object({
  code: z.string().trim().min(1).max(12),
});
const reservationBody = z.object({
  kind: z.enum(['VISITOR', 'VENUE', 'MEETING', 'EQUIPMENT']).default('VISITOR'),
  visitorName: z.string().trim().min(1).max(60),
  visitorPhone: z.string().trim().max(32).default(''),
  visitorCompany: z.string().trim().max(120).default(''),
  visitorIdNo: z.string().trim().max(64).default(''),
  plateNo: z.string().trim().max(20).default(''),
  companions: z.number().int().min(0).max(50).default(0),
  quantity: z.number().int().min(1).max(1000).default(1),
  buildingId: z.number().int().nonnegative().default(0),
  unitId: z.number().int().nonnegative().default(0),
  resourceName: z.string().trim().max(120).default(''),
  startAt: z.string().trim().min(1).max(40),
  endAt: z.string().trim().min(1).max(40),
  purpose: z.string().trim().max(200).default(''),
  note: z.string().trim().max(500).default(''),
  resourceId: z.number().int().nonnegative().default(0),
  slotId: z.number().int().nonnegative().default(0),
});
const cancelBody = z.object({ id: z.number().int().positive() });
const workOrderBody = z.object({
  category: z
    .enum(['REPAIR', 'COMPLAINT', 'CLEANING', 'OTHER'])
    .default('REPAIR'),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).default(''),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  buildingId: z.number().int().nonnegative().default(0),
  unitId: z.number().int().nonnegative().default(0),
  location: z.string().trim().max(200).default(''),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
});
const rateBody = z.object({
  id: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(300).default(''),
});
const staffBindBody = z.object({
  park: z.string().trim().min(1).max(16),
  phone: z.string().trim().min(3).max(32),
  staffCode: z.string().trim().min(1).max(32),
});
const staffApprovalBody = z.object({
  id: z.number().int().positive(),
  action: z.enum(['approve', 'reject']),
  comment: z.string().trim().max(500).default(''),
});
const checkinBody = z.object({ code: z.string().trim().min(4).max(20) });
const activitySignupBody = z.object({
  activityId: z.number().int().positive(),
  name: z.string().trim().max(60).default(''),
  phone: z.string().trim().max(32).default(''),
  note: z.string().trim().max(500).default(''),
});
const activityCancelBody = z.object({
  activityId: z.number().int().positive(),
});
const orderPayBody = z.object({ orderId: z.number().int().positive() });
const customerApprovalBody = z.object({
  id: z.number().int().positive(),
  action: z.enum(['approve', 'reject']),
  comment: z.string().trim().max(500).default(''),
});
const parkingApplyBody = z.object({
  plateNo: z.string().trim().min(2).max(20),
  vehicleType: z.enum(['CAR', 'BIKE', 'TRUCK']).default('CAR'),
  validFrom: z.string().trim().max(10).default(''),
  validTo: z.string().trim().max(10).default(''),
  note: z.string().trim().max(500).default(''),
});
const patrolRecordBody = z.object({
  planId: z.number().int().positive(),
  pointName: z.string().trim().min(1).max(120),
  result: z.enum(['NORMAL', 'ABNORMAL']).default('NORMAL'),
  note: z.string().trim().max(500).default(''),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
});
const staffWorkOrderBody = z.object({
  id: z.number().int().positive(),
  action: z.enum(['accept', 'process', 'done', 'close', 'cancel']),
  note: z.string().trim().max(500).default(''),
  result: z.string().trim().max(3000).default(''),
  images: z.array(z.string().trim().max(500)).max(9).default([]),
  feeAmount: z.number().min(0).max(99999999).default(0),
});
const staffAssignBody = z.object({
  id: z.number().int().positive(),
  staffId: z.number().int().positive(),
  note: z.string().trim().max(500).default(''),
});

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    ''
  );
}

function tokenOf(c: Context<ApiEnv, string, Input>) {
  return (c.req.header('x-park-token') || c.req.header('authorization') || '')
    .trim()
    .replace(/^Bearer\s+/i, '');
}

function staffTokenOf(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-park-staff-token') ||
    c.req.header('x-park-token') ||
    c.req.header('authorization') ||
    ''
  )
    .trim()
    .replace(/^Bearer\s+/i, '');
}

/**
 * 园区小程序公开通道（`/api/public/park/**`，免站内鉴权）。
 *
 * 四条边界：
 * 1. 站点一律按 `park` 或 `appId` 反查，端上传的 siteId 不当权限依据；
 * 2. 顾客令牌场景固定 `PARK`，员工令牌独立 issuer，二者互不串用；
 * 3. 所有顾客态/员工态读写按 (siteId + customerId/staffId) 双条件过滤；
 * 4. 通行码核验只认员工令牌，且核验后状态机阻止重复核验。
 */
export function registerParkPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const {
    sites,
    identity,
    approvals,
    reservations,
    workOrders,
    resources,
    activities,
    orders,
    pay,
    leases,
    notify,
    ops,
  } = services.park;
  const anonWindow = new RateWindow(240, 60_000);
  const loginWindow = new RateWindow(20, 60_000);
  const writeWindow = new RateWindow(40, 60_000);
  const staffWindow = new RateWindow(180, 60_000);

  const siteOf = async (park: string, appId: string) => {
    if (park) return sites.siteByCode(park, { requireOnline: true });
    if (appId) {
      const site = await sites.siteByAppId(appId);
      if (!site || site.status !== 'ONLINE') {
        throw new BusinessException(
          ErrorCode.NOT_FOUND,
          '园区不存在或已停用，请返回首页重新进入',
        );
      }
      return site;
    }
    throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少园区码');
  };

  const requireCustomer = async (c: Context<ApiEnv, string, Input>) => {
    const token = tokenOf(c);
    if (!token) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录园区小程序');
    }
    return identity.identity(token);
  };

  const requireStaff = async (c: Context<ApiEnv, string, Input>) => {
    const token = staffTokenOf(c);
    if (!token) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '请先绑定园区员工身份（手机号 + 工号）',
      );
    }
    return identity.staffIdentity(token);
  };

  // ---------------------------------------------------------------- 公开读

  app.get('/api/public/park/bootstrap', async (c) => {
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const query = bootstrapQuery.parse({
      park: c.req.query('park') || '',
      appId: c.req.query('appId') || '',
    });
    const site = await siteOf(query.park, query.appId);
    const [announcements, templates] = await Promise.all([
      sites.publicAnnouncements(site.id, '', 20),
      notify.templates(site.id),
    ]);
    return c.json({
      site: {
        id: site.id,
        parkCode: site.parkCode,
        name: site.name,
        logo: site.logo,
        themeColor: site.themeColor,
        notice: site.notice,
        phone: site.phone,
        addressLine: site.addressLine,
        province: site.province,
        city: site.city,
        district: site.district,
        deskSiteKey: site.deskSiteKey,
      },
      announcements,
      templates,
      quickLinks: [
        { key: 'visitor', name: '访客预约', path: '/pages/visitor/apply' },
        { key: 'reservation', name: '我的预约', path: '/pages/visitor/list' },
        { key: 'repair', name: '园区报修', path: '/pages/repair/apply' },
        { key: 'workorder', name: '我的工单', path: '/pages/repair/list' },
        { key: 'chat', name: 'AI 客服', path: '/pages/chat/chat' },
      ],
    });
  });

  app.get('/api/public/park/announcements', async (c) => {
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(
      String(c.req.query('park') || ''),
      String(c.req.query('appId') || ''),
    );
    const category = String(c.req.query('category') || '').slice(0, 24);
    return c.json(await sites.publicAnnouncements(site.id, category, 50));
  });

  app.get('/api/public/park/announcement/detail', async (c) => {
    const site = await siteOf(
      String(c.req.query('park') || ''),
      String(c.req.query('appId') || ''),
    );
    const id = Number(c.req.query('id') || 0);
    if (!id) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少公告标识');
    }
    return c.json(await sites.publicAnnouncement(site.id, id));
  });

  app.get('/api/public/park/resources', async (c) => {
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(
      String(c.req.query('park') || ''),
      String(c.req.query('appId') || ''),
    );
    return c.json(await resources.publicList(site.id));
  });

  app.get('/api/public/park/resource/detail', async (c) => {
    const site = await siteOf(
      String(c.req.query('park') || ''),
      String(c.req.query('appId') || ''),
    );
    const id = Number(c.req.query('id') || 0);
    if (!id) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少场地标识');
    }
    return c.json(await resources.publicDetail(site.id, id));
  });

  app.get('/api/public/park/activities', async (c) => {
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const site = await siteOf(
      String(c.req.query('park') || ''),
      String(c.req.query('appId') || ''),
    );
    return c.json(await activities.publicList(site.id));
  });

  app.get('/api/public/park/activity/detail', async (c) => {
    const site = await siteOf(
      String(c.req.query('park') || ''),
      String(c.req.query('appId') || ''),
    );
    const id = Number(c.req.query('id') || 0);
    if (!id) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少活动标识');
    }
    return c.json(await activities.publicDetail(site.id, id));
  });

  app.get('/api/public/park/activity/my', async (c) => {
    const { customer } = await requireCustomer(c);
    return c.json(await activities.my(customer));
  });

  app.post('/api/public/park/activity/signup', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site, customer } = await requireCustomer(c);
    const body = activitySignupBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await activities.signup(site, customer, body));
  });

  app.post('/api/public/park/activity/cancel', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { customer } = await requireCustomer(c);
    const body = activityCancelBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await activities.cancel(customer, body.activityId));
  });

  // ---------------------------------------------------------------- 登录与资料

  app.post('/api/public/park/login', async (c) => {
    loginWindow.consume(clientIp(c) || 'unknown', '登录过于频繁，请稍后再试');
    const body = loginBody.parse(await c.req.json().catch(() => ({})));
    const site = await siteOf(body.park, '');
    return c.json(await identity.login(site.parkCode, body.code));
  });

  app.get('/api/public/park/profile', async (c) => {
    const { customer } = await requireCustomer(c);
    return c.json(await identity.profile(customer));
  });

  app.post('/api/public/park/profile/update', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { customer } = await requireCustomer(c);
    const body = profileBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await identity.updateProfile(customer, body));
  });

  app.post('/api/public/park/profile/bind', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { customer } = await requireCustomer(c);
    const body = bindBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await identity.bindTenant(customer, body.code));
  });

  // ---------------------------------------------------------------- 预约

  app.post('/api/public/park/reservation/create', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '提交过于频繁，请稍后再试');
    const { site, customer } = await requireCustomer(c);
    const body = reservationBody.parse(await c.req.json().catch(() => ({})));
    if (body.kind === 'EQUIPMENT' && body.resourceId) {
      const resource = await resources.publicDetail(site.id, body.resourceId);
      return c.json(
        await reservations.createEquipment(site, customer, resource, body),
      );
    }
    if (body.resourceId && body.slotId) {
      const resource = await resources.publicDetail(site.id, body.resourceId);
      return c.json(
        await reservations.createVenue(
          site,
          customer,
          resource,
          body.slotId,
          body.purpose,
          body.note,
        ),
      );
    }
    return c.json(await reservations.create(site, customer, body));
  });

  app.get('/api/public/park/reservation/my', async (c) => {
    const { customer } = await requireCustomer(c);
    return c.json(await reservations.my(customer));
  });

  app.get('/api/public/park/reservation/detail', async (c) => {
    const { customer } = await requireCustomer(c);
    const query = idQuery.parse({ id: c.req.query('id') || 0 });
    return c.json(await reservations.myDetail(customer, query.id));
  });

  app.post('/api/public/park/reservation/cancel', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { customer } = await requireCustomer(c);
    const body = cancelBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await reservations.cancel(customer, body.id));
  });

  // ---------------------------------------------------------------- 工单

  app.post('/api/public/park/workorder/create', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '提交过于频繁，请稍后再试');
    const { site, customer } = await requireCustomer(c);
    const body = workOrderBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await workOrders.create(site, customer, body));
  });

  app.get('/api/public/park/workorder/my', async (c) => {
    const { customer } = await requireCustomer(c);
    return c.json(await workOrders.my(customer));
  });

  app.get('/api/public/park/workorder/detail', async (c) => {
    const { customer } = await requireCustomer(c);
    const query = idQuery.parse({ id: c.req.query('id') || 0 });
    return c.json(await workOrders.myDetail(customer, query.id));
  });

  app.post('/api/public/park/workorder/rate', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { customer } = await requireCustomer(c);
    const body = rateBody.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await workOrders.rate(customer, body.id, body.rating, body.comment),
    );
  });

  app.get('/api/public/park/order/my', async (c) => {
    const { customer } = await requireCustomer(c);
    return c.json(await orders.my(customer));
  });

  app.get('/api/public/park/order/detail', async (c) => {
    const { customer } = await requireCustomer(c);
    const query = idQuery.parse({ id: c.req.query('id') || 0 });
    return c.json(await orders.myDetail(customer, query.id));
  });

  app.post('/api/public/park/order/pay-params', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site, customer } = await requireCustomer(c);
    const body = orderPayBody.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await pay.payParams(site.id, body.orderId, customer.openid, customer.id),
    );
  });

  /** 微信支付回调：按站点凭据验签解密；返回微信要求的 SUCCESS/FAIL 形状。 */
  app.post('/api/public/park/pay/notify/:siteId', async (c) => {
    const siteId = Number(c.req.param('siteId') || 0);
    const credentials = await pay.credentials(siteId);
    if (!credentials) {
      return c.json({ code: 'FAIL', message: '园区未配置微信支付' }, 500);
    }
    const rawBody = await c.req.text();
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    try {
      const transaction = await pay.parseNotify(credentials, headers, rawBody);
      await pay.markPaid(siteId, transaction);
      return c.json({ code: 'SUCCESS', message: '成功' });
    } catch (error) {
      return c.json(
        {
          code: 'FAIL',
          message: error instanceof Error ? error.message : '验签失败',
        },
        500,
      );
    }
  });

  app.get('/api/public/park/bill/my', async (c) => {
    const { customer } = await requireCustomer(c);
    return c.json(await leases.myBills(customer));
  });

  app.get('/api/public/park/bill/detail', async (c) => {
    const { customer } = await requireCustomer(c);
    const query = idQuery.parse({ id: c.req.query('id') || 0 });
    return c.json(await leases.myBillDetail(customer, query.id));
  });

  app.get('/api/public/park/invoice/my', async (c) => {
    const { customer } = await requireCustomer(c);
    return c.json(await ops.myInvoices(customer));
  });

  app.get('/api/public/park/parking/my', async (c) => {
    const { customer } = await requireCustomer(c);
    return c.json(await ops.myParking(customer));
  });

  app.post('/api/public/park/parking/apply', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site, customer } = await requireCustomer(c);
    const body = parkingApplyBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await ops.applyParking(site, customer, body));
  });

  app.get('/api/public/park/staff/patrol/plans', async (c) => {
    const { site, staff } = await requireStaff(c);
    return c.json(await ops.staffPatrolPlans(site.id, staff.id));
  });

  app.post('/api/public/park/staff/patrol/record', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site, staff } = await requireStaff(c);
    const body = patrolRecordBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await ops.staffPatrolRecord(site.id, staff, body));
  });

  // ---------------------------------------------------------------- 员工端

  app.post('/api/public/park/staff/bind', async (c) => {
    loginWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = staffBindBody.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await identity.staffBind(body.park, body.phone, body.staffCode),
    );
  });

  app.get('/api/public/park/staff/workbench', async (c) => {
    staffWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const identityValue = await requireStaff(c);
    return c.json(await identity.staffWorkbench(identityValue));
  });

  app.get('/api/public/park/approval/my', async (c) => {
    const { site, customer } = await requireCustomer(c);
    return c.json(await approvals.pendingForCustomer(site.id, customer.id));
  });

  app.post('/api/public/park/approval/act', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site, customer } = await requireCustomer(c);
    const body = customerApprovalBody.parse(
      await c.req.json().catch(() => ({})),
    );
    await approvals.own(body.id, site.id);
    const approval = await approvals.act(
      { type: 'CUSTOMER', id: customer.id },
      body.id,
      body.action,
      body.comment,
    );
    if (approval.bizType === 'VISITOR' || approval.bizType === 'VENUE') {
      await reservations.syncByApprovalForSite(
        site.id,
        approval.id,
        approval.status,
      );
    }
    return c.json({ approval, status: approval.status });
  });

  app.get('/api/public/park/staff/approvals', async (c) => {
    staffWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const { site, staff } = await requireStaff(c);
    return c.json(await approvals.pendingForStaff(site.id, staff.id));
  });

  app.post('/api/public/park/staff/approval/act', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site, staff } = await requireStaff(c);
    const body = staffApprovalBody.parse(await c.req.json().catch(() => ({})));
    await approvals.own(body.id, site.id);
    const approval = await approvals.act(
      { type: 'STAFF', id: staff.id },
      body.id,
      body.action,
      body.comment,
    );
    if (approval.siteId !== site.id) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '审批单不属于当前园区');
    }
    if (approval.bizType === 'VISITOR' || approval.bizType === 'VENUE') {
      await reservations.syncByApprovalForSite(
        site.id,
        approval.id,
        approval.status,
      );
    }
    return c.json({ approval, status: approval.status });
  });

  app.get('/api/public/park/staff/reservations', async (c) => {
    staffWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const { site } = await requireStaff(c);
    const query = pageQuery.parse(c.req.query());
    return c.json(await reservations.staffList(site.id, query));
  });

  app.post('/api/public/park/staff/reservation/checkin', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site, staff } = await requireStaff(c);
    const body = checkinBody.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await reservations.checkInByCode(site.id, staff.id, body.code),
    );
  });

  app.get('/api/public/park/staff/workorders', async (c) => {
    staffWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
    const { site } = await requireStaff(c);
    const query = pageQuery.parse(c.req.query());
    return c.json(await workOrders.staffList(site.id, query));
  });

  app.get('/api/public/park/staff/workorder/detail', async (c) => {
    const { site } = await requireStaff(c);
    const query = idQuery.parse({ id: c.req.query('id') || 0 });
    return c.json(await workOrders.staffDetail(site.id, query.id));
  });

  app.post('/api/public/park/staff/workorder/assign', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site } = await requireStaff(c);
    const body = staffAssignBody.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await workOrders.assign(site.id, body.id, body.staffId, body.note),
    );
  });

  app.post('/api/public/park/staff/workorder/act', async (c) => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const { site, staff } = await requireStaff(c);
    const body = staffWorkOrderBody.parse(await c.req.json().catch(() => ({})));
    return c.json(
      await workOrders.staffAct(site.id, staff.id, body.id, body.action, {
        note: body.note,
        result: body.result,
        images: body.images,
        feeAmount: body.feeAmount,
      }),
    );
  });
}
