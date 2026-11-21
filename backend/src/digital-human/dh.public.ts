import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context, Input } from 'hono';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { ok } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { notifyTimestampOk } from '../points/wechat-pay.client';
import { clip, diyPageOf, siteConfigOf } from './dh.shared';

/**
 * 数字人小程序公开通道（免登录）：小程序端唯一入口，
 * 不进 JSON 契约 / OpenAPI / 功能开关拦截。
 *
 * 匿名读接口靠 `site`（站点编码）寻址；个人数据与写动作带会员令牌
 *（`Authorization: Bearer <dhToken>`，由 /login 签发）。另有三条供应商/微信入口：
 * - POST /upload        素材上传（formData → 对象存储，返回公网 URL）
 * - POST /pay/notify/:siteId   微信支付回调（时间戳防重放 + GCM 解密验真）
 * - POST /notify/:token  合成任务回调（callbackToken 唯一定位任务）
 */

const readLimiter = new RateWindow(120, 60_000);
const loginLimiter = new RateWindow(10, 60_000);
const writeLimiter = new RateWindow(30, 60_000);

const UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024;
const UPLOAD_EXT = /\.(mp4|mov|m4a|mp3|wav|aac|png|jpe?g|webp)$/i;

function clientIp(c: Context<ApiEnv, string, Input>) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    ''
  ).slice(0, 64);
}

function siteCode(c: Context<ApiEnv, string, Input>) {
  return String(c.req.query('site') || '')
    .trim()
    .toUpperCase()
    .slice(0, 16);
}

async function bodyOf<T>(
  c: Context<ApiEnv, string, Input>,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw: unknown = await c.req.json().catch(() => ({}));
  return schema.parse(raw);
}

function pageQuery(c: Context<ApiEnv, string, Input>, defaultSize = 10) {
  return z
    .object({
      page: z.coerce.number().int().min(1).max(100_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(defaultSize),
    })
    .parse({ page: c.req.query('page'), pageSize: c.req.query('pageSize') });
}

const loginSchema = z.object({
  code: z.string().trim().min(1).max(128),
  nickname: z.string().trim().max(60).optional(),
  avatar: z.string().trim().max(500).optional(),
  tuid: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
});

const assetSchema = z.object({
  name: z.string().trim().max(60).optional(),
  mediaUrl: z.string().trim().min(1).max(500),
  durationSec: z.coerce.number().int().min(0).max(3600).optional(),
});

const workSchema = z.object({
  title: z.string().trim().max(120).optional(),
  bodyId: z.coerce.number().int().min(0).optional(),
  voiceSource: z.enum(['clone', 'preset']).optional(),
  voiceId: z.coerce.number().int().min(0).optional(),
  audioType: z.enum(['tts', 'audio']).optional(),
  script: z.string().max(5000).optional(),
  sourceAudioUrl: z.string().trim().max(500).optional(),
  bgmId: z.coerce.number().int().min(0).optional(),
  bgmVolume: z.coerce.number().int().min(0).max(100).optional(),
  speed: z.coerce.number().int().min(50).max(200).optional(),
  subtitleOn: z.boolean().optional(),
});

export function registerDigitalHumanPublic(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const dh = services.digitalHuman;
  const { member, content, synth, store, commission, library, pay } = dh;

  const withMember = async (c: Context<ApiEnv, string, Input>) => {
    const code = siteCode(c);
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少站点编码 site');
    }
    return member.authenticate(code, c.req.header('authorization'));
  };

  // ================= 匿名读 =================

  app.get('/api/public/digital-human/config', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-cfg`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    const config = siteConfigOf(site);
    return c.json(
      ok({
        siteCode: site.siteCode,
        siteName: site.siteName,
        logo: site.logo,
        slogan: site.slogan,
        themeColor: site.themeColor,
        servicePhone: site.servicePhone,
        status: site.status,
        brand: config.brand,
        toggles: config.toggles,
        pricing: config.pricing,
        gift: config.gift,
        login: config.login,
        clone: config.clone,
        commission: {
          enabled: config.commission.enabled,
          joinType: config.commission.joinType,
          level1Rate: config.commission.level1Rate,
          level2Rate: config.commission.level2Rate,
          minWithdrawCents: config.commission.minWithdrawCents,
        },
        serviceDeskSiteKey: site.serviceDeskSiteKey,
        diyPage: diyPageOf(site.diyPage),
      }),
    );
  });

  app.get('/api/public/digital-human/swipers', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-swp`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(ok(await content.publicSwipers(site)));
  });

  app.get('/api/public/digital-human/posters', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-pst`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(ok(await content.publicPosters(site)));
  });

  app.get('/api/public/digital-human/qrcode', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-qr`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    try {
      return c.json(ok(await dh.release.publicQrcode(site)));
    } catch {
      // 小程序主体未配置时海报仍可只用形象与背景，不阻断 C 端
      return c.json(ok({ qrcodeUrl: '' }));
    }
  });

  app.get('/api/public/digital-human/articles', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-art`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(
      ok(
        await content.publicArticles(
          site,
          String(c.req.query('type') || 'help'),
        ),
      ),
    );
  });

  app.get('/api/public/digital-human/article', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-artx`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(
      ok(await content.publicArticle(site, Number(c.req.query('id')))),
    );
  });

  app.get('/api/public/digital-human/feed', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-feed`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    const query = pageQuery(c, 10);
    return c.json(ok(await synth.feed(site, query.page, query.pageSize)));
  });

  app.get('/api/public/digital-human/work', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-work`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(ok(await synth.playWork(site, Number(c.req.query('id')))));
  });

  app.post('/api/public/digital-human/work/share', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-share`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    const body = await bodyOf(
      c,
      z.object({ id: z.coerce.number().int().positive() }),
    );
    return c.json(ok(await synth.shareWork(site, body.id)));
  });

  app.get('/api/public/digital-human/voices', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-voice`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(ok(await library.publicVoices(site.id)));
  });

  app.get('/api/public/digital-human/bgms', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-bgm`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(ok(await library.publicBgms(site.id)));
  });

  app.get('/api/public/digital-human/packages', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-pkg`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(ok(await store.publicPackages(site)));
  });

  app.get('/api/public/digital-human/write-topics', async (c) => {
    readLimiter.consume(`${clientIp(c)}|dh-topic`, '操作太频繁，请稍后再试');
    const site = await member.siteOfCode(siteCode(c));
    return c.json(
      ok(
        await content.publicWriteTopics(
          site,
          String(c.req.query('kind') || 'write_topic'),
        ),
      ),
    );
  });

  // ================= 登录与个人数据 =================

  app.post('/api/public/digital-human/login', async (c) => {
    loginLimiter.consume(`${clientIp(c)}|dh-login`, '登录过于频繁，请稍后再试');
    const body = await bodyOf(c, loginSchema);
    const code = siteCode(c);
    const site = await member.siteOfCode(code);
    const session = await member.login(code, body);
    void services.terminalScrm.identify({
      ownerUserId: site.userId,
      scene: 'DIGITAL_HUMAN',
      sourceId: site.id,
      sourceName: site.siteName,
      customerId: session.member.id,
      kind: 'CUSTOMER_REGISTER',
      recordKey: session.member.id,
    });
    return c.json(ok(session));
  });

  app.get('/api/public/digital-human/member', async (c) => {
    const { member: row } = await withMember(c);
    return c.json(ok(await member.memberView(row.id)));
  });

  app.post('/api/public/digital-human/upload', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-up`, '上传太频繁，请稍后再试');
    const { site } = await withMember(c);
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请选择要上传的文件');
    }
    if (file.size > UPLOAD_LIMIT_BYTES) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        `文件超过 ${UPLOAD_LIMIT_BYTES / 1024 / 1024}MB 上限，请压缩后再传`,
      );
    }
    const ext = (UPLOAD_EXT.exec(file.name || '')?.[0] || '').toLowerCase();
    if (!ext) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只支持 mp4/mov/m4a/mp3/wav/aac/png/jpg/webp 文件',
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // 顾客上传的素材也归站主账下：字节走门面、金额走台账，否则这批桶内数据永远不计费
    const uploaded = await services.systemAsset.put({
      ownerUserId: site.userId,
      path: `digital-human/uploads/${site.id}/${randomUUID()}${ext}`,
      bytes,
      name: file.name,
      bizRef: `site:${site.id}`,
    });
    return c.json(
      ok({
        url: uploaded.url,
        size: bytes.length,
        fileName: clip(file.name, 120),
      }),
    );
  });

  // 形象 / 声音
  app.get('/api/public/digital-human/bodies', async (c) => {
    const { member: row } = await withMember(c);
    return c.json(ok(await synth.myBodies(row)));
  });

  app.post('/api/public/digital-human/bodies/create', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-body`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, assetSchema);
    return c.json(ok(await synth.createBody(site, row, body)));
  });

  app.get('/api/public/digital-human/voices/mine', async (c) => {
    const { member: row } = await withMember(c);
    return c.json(ok(await synth.myVoices(row)));
  });

  app.post('/api/public/digital-human/voices/create', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-vc`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, assetSchema);
    return c.json(ok(await synth.createVoice(site, row, body)));
  });

  // 作品
  app.get('/api/public/digital-human/works/mine', async (c) => {
    const { member: row } = await withMember(c);
    return c.json(ok(await synth.myWorks(row)));
  });

  app.post('/api/public/digital-human/works/create', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-mk`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(c, workSchema);
    return c.json(ok(await synth.createWork(site, row, body)));
  });

  app.get('/api/public/digital-human/work/status', async (c) => {
    const { site, member: row } = await withMember(c);
    return c.json(
      ok(await synth.workStatus(site, row, Number(c.req.query('id')))),
    );
  });

  app.post('/api/public/digital-human/work/remove', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-rm`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(
      c,
      z.object({ id: z.coerce.number().int().positive() }),
    );
    return c.json(ok(await synth.removeWork(site, row, body.id)));
  });

  // AI 文案
  app.post('/api/public/digital-human/ai/write', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-ai`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(
      c,
      z.object({
        prompt: z.string().trim().min(1).max(1000),
        words: z.coerce.number().int().min(50).max(2000).optional(),
        topicId: z.coerce.number().int().min(0).optional(),
      }),
    );
    return c.json(ok(await content.aiWrite(site, row, body)));
  });

  // 反馈
  app.post('/api/public/digital-human/feedback', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-fb`, '操作太频繁，请稍后再试');
    const code = siteCode(c);
    const site = await member.siteOfCode(code);
    const authorization = c.req.header('authorization');
    const ctx = authorization
      ? await member.authenticate(code, authorization)
      : null;
    const body = await bodyOf(
      c,
      z.object({
        content: z.string().trim().min(1).max(2000),
        contact: z.string().trim().max(60).optional(),
        images: z.array(z.string().trim().max(500)).max(9).optional(),
      }),
    );
    return c.json(
      ok(await content.submitFeedback(site, ctx?.member || null, body)),
    );
  });

  // ================= 商城 / 卡密 / 分销 =================

  app.get('/api/public/digital-human/orders', async (c) => {
    const { site, member: row } = await withMember(c);
    const query = pageQuery(c, 10);
    return c.json(
      ok(await store.myOrders(site, row, query.page, query.pageSize)),
    );
  });

  app.post('/api/public/digital-human/orders/create', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-buy`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(
      c,
      z.object({ packageId: z.coerce.number().int().positive() }),
    );
    return c.json(ok(await store.createOrder(site, row, body.packageId)));
  });

  app.post('/api/public/digital-human/card/redeem', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-card`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(
      c,
      z.object({ code: z.string().trim().min(1).max(32) }),
    );
    const result = await store.redeem(site, row, body.code);
    return c.json(ok({ ...result, member: await member.memberView(row.id) }));
  });

  app.get('/api/public/digital-human/promoter/center', async (c) => {
    const { site, member: row } = await withMember(c);
    return c.json(ok(await commission.center(site, row)));
  });

  app.post('/api/public/digital-human/promoter/apply', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-join`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    return c.json(ok(await commission.applyPromoter(site, row)));
  });

  app.get('/api/public/digital-human/commissions', async (c) => {
    const { site, member: row } = await withMember(c);
    const query = pageQuery(c, 10);
    return c.json(
      ok(await commission.myCommissions(site, row, query.page, query.pageSize)),
    );
  });

  app.get('/api/public/digital-human/withdraws', async (c) => {
    const { site, member: row } = await withMember(c);
    const query = pageQuery(c, 10);
    return c.json(
      ok(await commission.myWithdraws(site, row, query.page, query.pageSize)),
    );
  });

  app.post('/api/public/digital-human/withdraw/apply', async (c) => {
    writeLimiter.consume(`${clientIp(c)}|dh-wd`, '操作太频繁，请稍后再试');
    const { site, member: row } = await withMember(c);
    const body = await bodyOf(
      c,
      z.object({
        amountCents: z.coerce.number().int().min(1),
        method: z.enum(['bank', 'qrcode']).default('bank'),
        accountName: z.string().trim().max(60).optional(),
        accountNo: z.string().trim().max(120).optional(),
        bankName: z.string().trim().max(120).optional(),
        qrUrl: z.string().trim().max(500).optional(),
      }),
    );
    return c.json(ok(await commission.applyWithdraw(site, row, body)));
  });

  // ================= 支付回调 / 合成回调 =================

  app.post('/api/public/digital-human/pay/notify/:siteId', async (c) => {
    const siteId = Number(c.req.param('siteId'));
    const site = await dh.site.findByAnyId(siteId);
    if (!site) return c.json({ code: 'FAIL', message: 'site not found' }, 404);
    const raw: unknown = await c.req.json().catch(() => ({}));
    const record =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const resource = record.resource as
      | { ciphertext?: string; nonce?: string; associated_data?: string }
      | undefined;
    if (!resource?.ciphertext || !resource.nonce) {
      return c.json({ code: 'FAIL', message: 'bad payload' }, 400);
    }
    // 防重放：Wechatpay-Timestamp 必须落在 ±5 分钟窗口内（复用统一客户端的
    // notifyTimestampOk，与 parseNotify 同一口径）。不复用 parseNotify 整段：本路由
    // 按既有签名只把密文交给 pay.decryptNotify（拿不到 rawBody 与四个请求头），
    // 而 parseNotify 还要先下载平台证书，拉取失败会把可重试的 400 变成 5xx。
    // 重复投递的幂等由 store.markPaid 的 status: 0 条件更新保证，会员时长不叠加。
    if (!notifyTimestampOk(c.req.header('wechatpay-timestamp') || '')) {
      return c.json({ code: 'FAIL', message: 'bad timestamp' }, 400);
    }
    try {
      const payload = await pay.decryptNotify(site, {
        ciphertext: resource.ciphertext,
        nonce: resource.nonce,
        associated_data: resource.associated_data,
      });
      if (payload.tradeState === 'SUCCESS') {
        const result = await store.markPaid({
          siteId: site.id,
          orderNo: payload.outTradeNo,
          transactionId: payload.transactionId,
          amountCents: payload.amountCents,
          mchId: payload.mchId,
        });
        if (!result.ok) {
          return c.json({ code: 'FAIL', message: result.message }, 400);
        }
        const order = await services.prisma.digitalHumanOrder.findFirst({
          where: { orderNo: payload.outTradeNo, siteId: site.id },
          select: { id: true, memberId: true },
        });
        if (order) {
          void services.terminalScrm.identify({
            scene: 'DIGITAL_HUMAN',
            sourceId: site.id,
            customerId: order.memberId,
            kind: 'ORDER_PAID',
            recordKey: order.id,
          });
        }
      }
      return c.json(notifyOk());
    } catch {
      // 解密失败即伪造或配错密钥：回 FAIL 让微信重试，日志里由 transport 留痕
      return c.json({ code: 'FAIL', message: 'decrypt failed' }, 400);
    }
  });

  app.post('/api/public/digital-human/notify/:token', async (c) => {
    const token = String(c.req.param('token') || '').slice(0, 48);
    const raw: unknown = await c.req.json().catch(() => ({}));
    const result = await synth.notify(token, raw);
    return c.json(
      result.ok
        ? { code: 0, message: 'ok' }
        : { code: 1, message: result.message },
    );
  });
}

function notifyOk() {
  return { code: 'SUCCESS', message: '成功' };
}
