import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context, Input } from 'hono';
import { z } from 'zod';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { parseCustomerToken } from '../private-mini/customer-token';
import type { PublicOrderInput } from './health.public.service';

const shopQuery = z.object({
  shopCode: z.string().trim().max(16).default(''),
  appId: z.string().trim().max(64).default(''),
});

const orderItemBody = z.object({
  itemType: z.enum(['SERVICE', 'GOODS', 'EXAM', 'SIGN', 'MEMBER_CARD']),
  refId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(20).default(1),
  skuId: z.number().int().min(0).default(0),
  patientId: z.number().int().min(0).default(0),
  practitionerId: z.number().int().min(0).default(0),
});

const orderBody = z.object({
  shopCode: z.string().trim().max(16).min(1),
  orderType: z.string().trim().min(2).max(24),
  items: z.array(orderItemBody).max(20).default([]),
  slotId: z.number().int().min(0).default(0),
  addressId: z.number().int().min(0).default(0),
  couponTicketId: z.number().int().min(0).default(0),
  usePoints: z.number().int().min(0).default(0),
  remark: z.string().trim().max(500).default(''),
  receiver: z
    .object({
      name: z.string().trim().max(60).default(''),
      phone: z.string().trim().max(32).default(''),
      address: z.string().trim().max(300).default(''),
    })
    .default({ name: '', phone: '', address: '' }),
  consult: z
    .object({
      patientId: z.number().int().min(0).default(0),
      practitionerId: z.number().int().min(0).default(0),
      symptomText: z.string().trim().max(2000).default(''),
      attachments: z.array(z.string().trim().max(500)).max(9).default([]),
      contactPhone: z.string().trim().max(32).default(''),
      appointAt: z.string().trim().max(32).default(''),
      meetingUrl: z.string().trim().max(500).default(''),
    })
    .nullish(),
  green: z
    .object({
      patientId: z.number().int().min(0).default(0),
      kind: z.string().trim().max(20).default('GREEN'),
      hospitalId: z.number().int().min(0).default(0),
      departmentId: z.number().int().min(0).default(0),
      targetHospital: z.string().trim().max(120).default(''),
      targetDepartment: z.string().trim().max(60).default(''),
      needType: z.string().trim().max(20).default('OUTPATIENT'),
      urgency: z.string().trim().max(20).default(''),
      demandAt: z.string().trim().max(32).default(''),
      symptoms: z.string().trim().max(2000).default(''),
      files: z.array(z.string().trim().max(500)).max(9).default([]),
      contactPhone: z.string().trim().max(32).default(''),
    })
    .nullish(),
});

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

const qs = (c: Context<ApiEnv, string, Input>, name: string, max = 64) =>
  String(c.req.query(name) || '')
    .trim()
    .slice(0, max);

const qn = (c: Context<ApiEnv, string, Input>, name: string) => {
  const value = Number(c.req.query(name) || 0);
  return Number.isFinite(value) ? value : 0;
};

/**
 * 健康管理小程序 · C 端公开通道（`/api/public/health/**`，免站内鉴权）。
 *
 * 边界：
 * 1. 匿名只开放「看店 + 浏览服务/内容/商品 + 号源 + 支付回调」；
 *    顾客态读写必须带顾客令牌（scene=HEALTH + shopId），由服务层双条件过滤；
 * 2. 站点一律按 `shopCode` 或 `appId` 反查，端上传的 shopId 不当权限依据；
 * 3. 支付回调只认 URL 里的 shopId 对应的商户号验签，错店报文必然验签失败；
 * 4. 登录/下单单独限流，写接口共用一档限流兜底。
 */
export function registerHealthPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const service = services.health.publicService;
  const tongue = services.health.tongueService;
  const anonWindow = new RateWindow(240, 60_000);
  const loginWindow = new RateWindow(20, 60_000);
  const writeWindow = new RateWindow(90, 60_000);
  const orderWindow = new RateWindow(30, 60_000);
  // 视觉模型按次计费且耗时长：舌象分析单独收紧到每分钟 8 次。
  const tongueWindow = new RateWindow(8, 60_000);

  const anon = (c: Context<ApiEnv, string, Input>): void => {
    anonWindow.consume(clientIp(c) || 'unknown', '访问过于频繁，请稍后重试');
  };
  const write = (c: Context<ApiEnv, string, Input>): void => {
    writeWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
  };
  const bodyOf = async <T extends z.ZodTypeAny>(
    c: Context<ApiEnv, string, Input>,
    schema: T,
  ) => schema.parse(await c.req.json().catch(() => ({})));
  const tokenOf = (c: Context<ApiEnv, string, Input>) =>
    c.req.header('authorization') || c.req.header('x-customer-token') || '';

  const guest = async (c: Context<ApiEnv, string, Input>, shopCode: string) => {
    const shop = await service.requireShop(shopCode);
    let customer = null;
    try {
      customer = await service.requireCustomer(parseCustomerToken(tokenOf(c)));
    } catch {
      customer = null;
    }
    return { shop, customer };
  };

  const authed = async (
    c: Context<ApiEnv, string, Input>,
    shopCode: string,
  ) => {
    const shop = await service.requireShop(shopCode);
    const payload = parseCustomerToken(tokenOf(c));
    const customer = await service.requireCustomer(payload);
    // 令牌只在自己的店铺内有效：shopCode 与令牌商户不一致时不允许读写顾客态。
    if (payload.shopId !== shop.shopId) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态与当前店铺不匹配，请重新进入小程序',
      );
    }
    return { shop, customer };
  };

  const toOrderInput = (body: z.infer<typeof orderBody>): PublicOrderInput => ({
    orderType: body.orderType,
    items: body.items,
    slotId: body.slotId,
    addressId: body.addressId,
    couponTicketId: body.couponTicketId,
    usePoints: body.usePoints,
    remark: body.remark,
    receiver: body.receiver,
    consult: body.consult ?? null,
    green: body.green ?? null,
  });

  // ---------------------------------------------------------------- 启动配置 / 登录

  app.get('/api/public/health/bootstrap', async (c) => {
    anon(c);
    const query = shopQuery.parse({
      shopCode: qs(c, 'shopCode', 16),
      appId: qs(c, 'appId'),
    });
    return c.json(await service.bootstrap(query));
  });

  app.post('/api/public/health/login', async (c) => {
    loginWindow.consume(
      clientIp(c) || 'unknown',
      '登录过于频繁，请一分钟后再试',
    );
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        code: z.string().trim().min(1).max(128),
        promoterCode: z.string().trim().max(24).default(''),
      }),
    );
    return c.json(await service.login(body));
  });

  // ---------------------------------------------------------------- 我的

  app.get('/api/public/health/me', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.me(shop, customer));
  });

  app.post('/api/public/health/profile', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        nickname: z.string().trim().max(60).default(''),
        avatar: z.string().trim().max(500).default(''),
        phone: z.string().trim().max(32).default(''),
      }),
    );
    const { customer } = await authed(c, body.shopCode);
    return c.json(await service.updateProfile(customer, body));
  });

  // ---------------------------------------------------------------- 就诊人 / 档案 / 指标 / 随访 / 用药

  app.get('/api/public/health/patients', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.patients(shop, customer));
  });

  app.post('/api/public/health/patients/save', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        id: z.number().int().min(0).default(0),
        name: z.string().trim().max(60).default(''),
        relation: z.string().trim().max(16).default('SELF'),
        gender: z.string().trim().max(8).default(''),
        birthday: z.string().trim().max(20).default(''),
        phone: z.string().trim().max(32).default(''),
        idCard: z.string().trim().max(32).default(''),
        bloodType: z.string().trim().max(8).default(''),
        heightCm: z.number().min(0).max(300).default(0),
        weightKg: z.number().min(0).max(500).default(0),
        remark: z.string().trim().max(500).default(''),
        isDefault: z.boolean().default(false),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.savePatient(shop, customer, body));
  });

  app.post('/api/public/health/patients/remove', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        patientId: z.number().int().positive(),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.removePatient(shop, customer, body.patientId));
  });

  app.get('/api/public/health/archive', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    const patientId = qn(c, 'patientId');
    if (patientId <= 0)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少就诊人');
    return c.json(await service.archive(shop, customer, patientId));
  });

  app.post('/api/public/health/archive/item/save', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        patientId: z.number().int().positive(),
        id: z.number().int().min(0).default(0),
        type: z.string().trim().max(16).default('PAST'),
        label: z.string().trim().max(60).default(''),
        value: z.string().trim().max(500).default(''),
        startAt: z.string().trim().max(20).default(''),
        endAt: z.string().trim().max(20).default(''),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.recordItemSave(shop, customer, body));
  });

  // ---------------------------------------------------------------- 舌象分析（增值服务）

  app.post('/api/public/health/tongue/analyze', async (c) => {
    tongueWindow.consume(
      clientIp(c) || 'unknown',
      '舌象分析请求过于频繁，请稍后再试',
    );
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof File)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择要分析的舌象照片',
      );
    }
    const shopCode = form.get('shopCode');
    const { shop, customer } = await authed(
      c,
      typeof shopCode === 'string' ? shopCode.slice(0, 16) : '',
    );
    return c.json(await tongue.analyze(shop, customer, file));
  });

  app.get('/api/public/health/tongue/records', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await tongue.publicRecords(shop.shopId, customer.id, {
        page: qn(c, 'page'),
        pageSize: qn(c, 'pageSize'),
      }),
    );
  });

  app.get('/api/public/health/tongue/records/detail', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    const id = qn(c, 'id');
    if (id <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少记录标识');
    }
    return c.json(
      await tongue.publicRecordDetail(shop.shopId, customer.id, id),
    );
  });

  app.get('/api/public/health/metrics', async (c) => {
    const { shop } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.metrics(shop));
  });

  app.get('/api/public/health/metrics/logs', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.metricLogs(shop, customer, qn(c, 'patientId')));
  });

  app.post('/api/public/health/metrics/logs/save', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        patientId: z.number().int().positive(),
        metricId: z.number().int().positive(),
        value: z.number(),
        valueText: z.string().trim().max(60).default(''),
        measuredAt: z.string().trim().max(32).default(''),
        note: z.string().trim().max(200).default(''),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.metricLogSave(shop, customer, body));
  });

  app.get('/api/public/health/metrics/trend', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.metricTrend(
        shop,
        customer,
        qn(c, 'patientId'),
        qn(c, 'metricId'),
      ),
    );
  });

  app.get('/api/public/health/followups', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.followups(shop, customer));
  });

  app.post('/api/public/health/followups/complete', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        taskId: z.number().int().positive(),
        note: z.string().trim().max(500).default(''),
        metrics: z
          .array(
            z.object({
              metricId: z.number().int().positive(),
              value: z.number(),
              measuredAt: z.string().trim().max(32).default(''),
            }),
          )
          .max(20)
          .default([]),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.completeFollowup(shop, customer, body));
  });

  app.get('/api/public/health/medications', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.medications(shop, customer, qn(c, 'patientId')),
    );
  });

  app.post('/api/public/health/medications/log', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        patientId: z.number().int().positive(),
        medicationId: z.number().int().positive(),
        planDate: z.string().trim().max(10).default(''),
        planTime: z.string().trim().max(10).default(''),
        status: z.enum(['TAKEN', 'MISSED', 'SKIPPED']).default('TAKEN'),
        remark: z.string().trim().max(200).default(''),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.medicationLogSave(shop, customer, body));
  });

  app.get('/api/public/health/prescriptions', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.prescriptions(shop, customer));
  });

  app.get('/api/public/health/reports', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.reports(shop, customer));
  });

  app.get('/api/public/health/reports/detail', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.reportDetail(shop, customer, qn(c, 'id')));
  });

  // ---------------------------------------------------------------- 服务 / 医护 / 医院 / 号源

  app.get('/api/public/health/services', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.services(shop, {
        keyword: qs(c, 'keyword', 60),
        bizType: qs(c, 'bizType', 20),
        page: qs(c, 'page', 8),
        pageSize: qs(c, 'pageSize', 8),
      }),
    );
  });

  app.get('/api/public/health/services/detail', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.serviceDetail(shop, qn(c, 'id')));
  });

  app.get('/api/public/health/practitioners', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.practitioners(shop, {
        keyword: qs(c, 'keyword', 60),
        serviceId: qn(c, 'serviceId'),
        page: qs(c, 'page', 8),
        pageSize: qs(c, 'pageSize', 8),
      }),
    );
  });

  app.get('/api/public/health/practitioners/detail', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.practitionerDetail(shop, qn(c, 'id')));
  });

  app.get('/api/public/health/hospitals', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.hospitals(shop, { city: qs(c, 'city', 30) }));
  });

  app.get('/api/public/health/departments', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.departments(shop, qn(c, 'hospitalId')));
  });

  app.get('/api/public/health/cities', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.cities(shop));
  });

  app.get('/api/public/health/diseases', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.diseases(shop, qs(c, 'keyword', 60)));
  });

  app.get('/api/public/health/drugs', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.drugs(shop, qs(c, 'keyword', 60)));
  });

  app.get('/api/public/health/slots/days', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.slotDays(shop, {
        serviceId: qn(c, 'serviceId'),
        practitionerId: qn(c, 'practitionerId'),
        from: qs(c, 'from', 10),
      }),
    );
  });

  app.get('/api/public/health/slots/timeline', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.slotTimeline(shop, {
        day: qs(c, 'day', 10),
        serviceId: qn(c, 'serviceId'),
        practitionerId: qn(c, 'practitionerId'),
      }),
    );
  });

  // ---------------------------------------------------------------- 内容 / 病友圈 / 问答

  app.get('/api/public/health/articles', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.articles(shop, {
        keyword: qs(c, 'keyword', 60),
        categoryId: qn(c, 'categoryId'),
        page: qs(c, 'page', 8),
        pageSize: qs(c, 'pageSize', 8),
      }),
    );
  });

  app.get('/api/public/health/articles/detail', async (c) => {
    anon(c);
    const { shop, customer } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.articleDetail(shop, customer, qn(c, 'id')));
  });

  app.get('/api/public/health/article-categories', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.articleCategories(shop));
  });

  app.get('/api/public/health/posts', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.posts(shop, {
        keyword: qs(c, 'keyword', 60),
        tag: qs(c, 'tag', 30),
        page: qs(c, 'page', 8),
        pageSize: qs(c, 'pageSize', 8),
      }),
    );
  });

  app.get('/api/public/health/posts/detail', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.postDetail(shop, qn(c, 'id')));
  });

  app.post('/api/public/health/posts/create', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        title: z.string().trim().max(120).default(''),
        content: z.string().trim().max(2000).default(''),
        images: z.array(z.string().trim().max(500)).max(9).default([]),
        tags: z.array(z.string().trim().max(30)).max(6).default([]),
        topic: z.string().trim().max(60).default(''),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.createPost(shop, customer, body));
  });

  app.post('/api/public/health/posts/comment', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        postId: z.number().int().positive(),
        parentId: z.number().int().min(0).default(0),
        content: z.string().trim().max(500).default(''),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.commentPost(shop, customer, body));
  });

  app.post('/api/public/health/posts/like', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        postId: z.number().int().positive(),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.likePost(shop, customer, body.postId));
  });

  app.get('/api/public/health/questions', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.questions(shop, {
        keyword: qs(c, 'keyword', 60),
        page: qs(c, 'page', 8),
        pageSize: qs(c, 'pageSize', 8),
      }),
    );
  });

  app.get('/api/public/health/questions/detail', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.questionDetail(shop, qn(c, 'id')));
  });

  app.post('/api/public/health/questions/create', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        title: z.string().trim().max(120).default(''),
        detail: z.string().trim().max(2000).default(''),
        patientId: z.number().int().min(0).default(0),
        bountyCents: z.number().int().min(0).max(100_000).default(0),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.createQuestion(shop, customer, body));
  });

  app.get('/api/public/health/hot-keywords', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.hotKeywords(shop));
  });

  app.post('/api/public/health/search/log', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        keyword: z.string().trim().max(60).default(''),
      }),
    );
    const { shop, customer } = await guest(c, body.shopCode);
    return c.json(await service.logSearch(shop, customer, body.keyword));
  });

  // ---------------------------------------------------------------- 商品 / 购物车 / 地址

  app.get('/api/public/health/goods/categories', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.goodsCategories(shop));
  });

  app.get('/api/public/health/goods', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.goods(shop, {
        keyword: qs(c, 'keyword', 60),
        categoryId: qn(c, 'categoryId'),
        page: qs(c, 'page', 8),
        pageSize: qs(c, 'pageSize', 8),
      }),
    );
  });

  app.get('/api/public/health/goods/detail', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.goodsDetail(shop, qn(c, 'id')));
  });

  app.get('/api/public/health/cart', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.cart(shop, customer));
  });

  app.post('/api/public/health/cart/save', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        goodsId: z.number().int().positive(),
        skuId: z.number().int().min(0).default(0),
        quantity: z.number().int().min(1).max(99).default(1),
        checked: z.boolean().default(true),
        remove: z.boolean().default(false),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.saveCart(shop, customer, body));
  });

  app.get('/api/public/health/addresses', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.addresses(shop, customer));
  });

  app.post('/api/public/health/addresses/save', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        id: z.number().int().min(0).default(0),
        receiver: z.string().trim().max(60).default(''),
        phone: z.string().trim().max(32).default(''),
        province: z.string().trim().max(30).default(''),
        city: z.string().trim().max(30).default(''),
        district: z.string().trim().max(30).default(''),
        detail: z.string().trim().max(200).default(''),
        tag: z.string().trim().max(20).default(''),
        isDefault: z.boolean().default(false),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.saveAddress(shop, customer, body));
  });

  app.post('/api/public/health/addresses/remove', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        addressId: z.number().int().positive(),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.removeAddress(shop, customer, body.addressId));
  });

  // ---------------------------------------------------------------- 营销资产 / 套餐

  app.get('/api/public/health/coupons', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.coupons(shop, customer));
  });

  app.get('/api/public/health/points', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.points(shop, customer));
  });

  app.get('/api/public/health/wallet', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.wallet(shop, customer));
  });

  app.get('/api/public/health/sign-packages', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.signPackages(shop, qn(c, 'teamId')));
  });

  app.get('/api/public/health/exam-packages', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.examPackages(shop, {
        keyword: qs(c, 'keyword', 60),
        cityId: qn(c, 'cityId'),
      }),
    );
  });

  app.get('/api/public/health/exam-packages/detail', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.examPackageDetail(shop, qn(c, 'id')));
  });

  // ---------------------------------------------------------------- 统一订单

  app.post('/api/public/health/order/preview', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = await bodyOf(c, orderBody);
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.preview(shop, customer, toOrderInput(body)));
  });

  app.post('/api/public/health/order/create', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '下单过于频繁，请稍后再试');
    const body = await bodyOf(c, orderBody);
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(
      await service.createOrder(shop, customer, toOrderInput(body)),
    );
  });

  app.get('/api/public/health/orders', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.orders(shop, customer, {
        status: qs(c, 'status', 24),
        page: qs(c, 'page', 8),
        pageSize: qs(c, 'pageSize', 8),
      }),
    );
  });

  app.get('/api/public/health/orders/detail', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.orderDetail(shop, customer, qn(c, 'id')));
  });

  app.post('/api/public/health/orders/cancel', async (c) => {
    orderWindow.consume(clientIp(c) || 'unknown', '操作过于频繁，请稍后再试');
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        orderId: z.number().int().positive(),
        reason: z.string().trim().max(200).default(''),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(
      await service.cancelOrder(shop, customer, body.orderId, body.reason),
    );
  });

  app.get('/api/public/health/orders/pay', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.payParams(shop, customer, qn(c, 'id')));
  });

  app.get('/api/public/health/verify-codes', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    c.header('Cache-Control', 'no-store');
    return c.json(await service.verifyCodes(shop, customer));
  });

  app.post('/api/public/health/aftersale/apply', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        orderId: z.number().int().positive(),
        orderItemId: z.number().int().min(0).default(0),
        kind: z
          .enum(['REFUND', 'RETURN_REFUND', 'EXCHANGE', 'RESEND'])
          .default('REFUND'),
        reason: z.string().trim().max(200).default(''),
        description: z.string().trim().max(1000).default(''),
        evidenceImages: z.array(z.string().trim().max(500)).max(9).default([]),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.applyAftersale(shop, customer, body));
  });

  app.post('/api/public/health/orders/review', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        orderId: z.number().int().positive(),
        score: z.number().int().min(1).max(5),
        attitudeScore: z.number().int().min(0).max(5).default(5),
        skillScore: z.number().int().min(0).max(5).default(5),
        content: z.string().trim().max(1000).default(''),
        images: z.array(z.string().trim().max(500)).max(9).default([]),
        tags: z.array(z.string().trim().max(40)).max(12).default([]),
        anonymous: z.boolean().default(false),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.reviewOrder(shop, customer, body));
  });

  // ---------------------------------------------------------------- 问诊

  app.get('/api/public/health/consult/rules', async (c) => {
    anon(c);
    const { shop } = await guest(c, qs(c, 'shopCode', 16));
    return c.json(await service.consultRules(shop));
  });

  app.get('/api/public/health/consults', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.consults(shop, customer));
  });

  app.get('/api/public/health/consults/detail', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(await service.consultDetail(shop, customer, qn(c, 'id')));
  });

  app.post('/api/public/health/consults/action', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        id: z.number().int().positive(),
        action: z.enum(['CANCEL', 'CUSTOMER_DONE', 'EVAL']),
        reason: z.string().trim().max(500).default(''),
        score: z.number().int().min(0).max(5).default(0),
        content: z.string().trim().max(500).default(''),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.consultAction(shop, customer, body));
  });

  app.post('/api/public/health/consults/session', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        id: z.number().int().positive(),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    c.header('Cache-Control', 'no-store');
    return c.json(await service.consultSession(shop, customer, body.id));
  });

  // ---------------------------------------------------------------- 推客

  app.post('/api/public/health/promoter/hit', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        code: z.string().trim().max(24).default(''),
      }),
    );
    const { shop, customer } = await guest(c, body.shopCode);
    return c.json(await service.promoterHit(shop, customer, body.code));
  });

  app.get('/api/public/health/promoter/share', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    return c.json(
      await service.promoterShare(shop, customer, qs(c, 'page', 120)),
    );
  });

  app.get('/api/public/health/promoter/center', async (c) => {
    const { shop, customer } = await authed(c, qs(c, 'shopCode', 16));
    c.header('Cache-Control', 'no-store');
    return c.json(await service.promoterCenter(shop, customer));
  });

  app.post('/api/public/health/promoter/apply', async (c) => {
    write(c);
    const body = await bodyOf(
      c,
      z.object({
        shopCode: z.string().trim().min(1).max(16),
        name: z.string().trim().min(1).max(60),
        phone: z.string().trim().max(32).default(''),
      }),
    );
    const { shop, customer } = await authed(c, body.shopCode);
    return c.json(await service.promoterApply(shop, customer, body));
  });

  // ---------------------------------------------------------------- 支付回调

  /**
   * 微信支付回调：`/api/public/health/pay/notify/:shopId`。
   * 只认 URL 里 shopId 对应的商户号验签；金额不符只留痕不改状态，回非 2xx 让微信重试。
   */
  app.post('/api/public/health/pay/notify/:shopId', async (c) => {
    const shopId = Number(c.req.param('shopId'));
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return c.json({ code: 'FAIL', message: '店铺标识不合法' }, 400);
    }
    const raw = await c.req.text();
    const result = await service.handleNotify(
      shopId,
      {
        'wechatpay-serial': c.req.header('wechatpay-serial') || '',
        'wechatpay-nonce-str': c.req.header('wechatpay-nonce-str') || '',
        'wechatpay-timestamp': c.req.header('wechatpay-timestamp') || '',
        'wechatpay-signature': c.req.header('wechatpay-signature') || '',
      },
      raw,
    );
    if (!result.handled) {
      return c.json({ code: 'FAIL', message: result.reason || '未处理' }, 400);
    }
    return c.json({ code: 'SUCCESS', message: '成功' });
  });
}
