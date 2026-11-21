import { randomBytes } from 'node:crypto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { PrismaService } from '../prisma/prisma.service';
import {
  WechatPayClient,
  buildJsapiPayParams,
  decryptApiV3,
  type WechatCredentials,
} from '../points/wechat-pay.client';
import { KnowledgePayService } from './kp.service';

type SiteRow = NonNullable<
  Awaited<ReturnType<KnowledgePayService['siteByCode']>>
>;
type MemberRow = {
  id: number;
  openid: string;
  userId: string;
  vipUntil: Date | null;
};

/**
 * 云课堂现金支付（微信支付 APIv3 · JSAPI）。
 *
 * 资金口径与平台其它私域工具一致：使用**站点自己的**小程序 AppID 与商户号直连，
 * 平台不代收、不落资金账本；未配置凭据时小程序端只展示积分解锁，不出现支付按钮。
 *
 * 现金订单与积分解锁订单分表：支付成功后才写一条 `knowledge_pay_orders`
 * （payMethod=wechat）作为解锁凭据；退款成功再按 `unlockOrderId` 撤销。
 */
export class KnowledgePayPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: KnowledgePayService,
    private readonly pay: WechatPayClient,
  ) {}

  payReady(site: {
    wxAppId: string;
    wxMchId: string;
    wxPaySerial: string;
    wxPayApiV3Key: string;
    wxPayPrivateKey: string;
  }) {
    return Boolean(
      site.wxAppId &&
      site.wxMchId &&
      site.wxPaySerial &&
      site.wxPayApiV3Key &&
      site.wxPayPrivateKey,
    );
  }

  private credentials(site: SiteRow, notifyUrl: string): WechatCredentials {
    if (!this.payReady(site)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '站点尚未配置微信支付商户号/APIv3 密钥/商户私钥，请到「基础设置 → 微信支付」补齐后再试',
      );
    }
    return {
      appId: site.wxAppId,
      mchId: site.wxMchId,
      apiv3Key: this.service.decryptSecret(site.wxPayApiV3Key),
      certSerial: site.wxPaySerial,
      privateKey: this.service.decryptSecret(site.wxPayPrivateKey),
      notifyUrl,
      configured: true,
    };
  }

  private async notifyUrl(site: SiteRow) {
    const base = await resolveSiteUrl(this.prisma);
    if (!base) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，微信支付回调无法送达。请到平台后台「站点设置 → 站点域名」填写本站对外地址',
      );
    }
    return `${base}/api/public/knowledge-pay/pay/notify?site=${site.siteCode}`;
  }

  private tradeNo(site: SiteRow) {
    return `KP${site.siteCode}${Date.now().toString(36)}${randomBytes(4).toString('hex')}`.toUpperCase();
  }

  /** 下单目标：课程现金价或会员套餐现金价。 */
  private async target(
    site: SiteRow,
    body: { kind: string; resourceId?: number; plan?: number },
  ) {
    if (body.kind === 'course') {
      const resource = await this.prisma.knowledgePayResource.findFirst({
        where: {
          id: Number(body.resourceId) || 0,
          siteId: site.id,
          status: true,
          auditStatus: 'published',
        },
      });
      if (!resource)
        throw new BusinessException(ErrorCode.NOT_FOUND, '课程不存在或未上架');
      if (resource.cashPriceCents <= 0)
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '该课程未开放微信支付，请使用积分解锁',
        );
      return {
        kind: 'course',
        resourceId: resource.id,
        plan: 0,
        title: resource.title,
        amountCents: resource.cashPriceCents,
        cover: resource.cover,
        url: resource.url,
      };
    }
    if (body.kind === 'vip') {
      const plan = this.service
        .vipPlansOf(site)
        .find((item) => item.plan === Number(body.plan));
      if (!plan)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '会员套餐不存在');
      if (!plan.cashPrice || plan.cashPrice <= 0)
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '该会员套餐未开放微信支付，请使用积分开通',
        );
      return {
        kind: 'vip',
        resourceId: 0,
        plan: plan.plan,
        title: `${site.siteName || '云课堂'} · ${plan.plan} 个月会员`,
        amountCents: plan.cashPrice,
        cover: '',
        url: '',
      };
    }
    throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的支付类型');
  }

  /** 支付凭据自检：下载平台证书并验签，不产生交易。 */
  async testConnection(site: SiteRow) {
    if (!this.payReady(site)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先填写商户号、证书序列号、APIv3 密钥与商户私钥',
      );
    }
    const credentials = this.credentials(site, '');
    const result = await this.pay.testConnection(credentials);
    return {
      ok: true,
      message: `微信支付凭据可用，平台证书 ${result.certificates} 张`,
    };
  }

  /** JSAPI 下单：复用 2 小时内的同目标待支付单，避免重复创建与重复扣款。 */
  async prepay(
    site: SiteRow,
    member: MemberRow,
    body: { kind: string; resourceId?: number; plan?: number },
  ) {
    const target = await this.target(site, body);
    const credentials = this.credentials(site, await this.notifyUrl(site));
    const fresh = new Date(Date.now() - 2 * 3600_000);
    // 同目标超过 2 小时的旧待支付单直接关闭，避免台账里长期悬挂。
    await this.prisma.knowledgePayCashOrder.updateMany({
      where: {
        siteId: site.id,
        memberId: member.id,
        kind: target.kind,
        resourceId: target.resourceId,
        plan: target.plan,
        status: 'pending',
        createdAt: { lt: fresh },
      },
      data: { status: 'closed' },
    });
    let order = await this.prisma.knowledgePayCashOrder.findFirst({
      where: {
        siteId: site.id,
        memberId: member.id,
        kind: target.kind,
        resourceId: target.resourceId,
        plan: target.plan,
        status: 'pending',
        createdAt: { gte: fresh },
      },
      orderBy: { id: 'desc' },
    });
    if (!order) {
      order = await this.prisma.knowledgePayCashOrder.create({
        data: {
          siteId: site.id,
          userId: site.userId,
          memberId: member.id,
          kind: target.kind,
          resourceId: target.resourceId,
          plan: target.plan,
          title: target.title,
          amountCents: target.amountCents,
          outTradeNo: this.tradeNo(site),
        },
      });
    } else if (order.amountCents !== target.amountCents) {
      // 价格变了不能沿用旧单：先关旧单，再按新价重建，避免按旧金额付款。
      await this.pay
        .close(credentials, order.outTradeNo)
        .catch(() => undefined);
      await this.prisma.knowledgePayCashOrder.update({
        where: { id: order.id },
        data: { status: 'closed' },
      });
      order = await this.prisma.knowledgePayCashOrder.create({
        data: {
          siteId: site.id,
          userId: site.userId,
          memberId: member.id,
          kind: target.kind,
          resourceId: target.resourceId,
          plan: target.plan,
          title: target.title,
          amountCents: target.amountCents,
          outTradeNo: this.tradeNo(site),
        },
      });
    }
    const prepayId = await this.pay.jsapi(credentials, {
      outTradeNo: order.outTradeNo,
      description: target.title,
      amountCents: order.amountCents,
      openid: member.openid,
    });
    return {
      orderNo: order.outTradeNo,
      orderId: order.id,
      amountCents: order.amountCents,
      kind: order.kind,
      title: order.title,
      payParams: buildJsapiPayParams(credentials, prepayId),
    };
  }

  /**
   * 回调解密验真：站点编码定位凭据，AES-256-GCM 标签即验真；
   * 时间戳防重放在公开路由里做（与平台其它支付回调同口径）。
   */
  decryptNotify(
    site: SiteRow,
    resource: { ciphertext?: string; nonce?: string; associated_data?: string },
  ): {
    outTradeNo: string;
    transactionId: string;
    tradeState: string;
    amountCents: number;
    mchId: string;
  } {
    if (!this.payReady(site)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '站点未配置微信支付凭据',
      );
    }
    const apiv3Key = this.service.decryptSecret(site.wxPayApiV3Key);
    if (Buffer.from(apiv3Key, 'utf8').length !== 32) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'APIv3 密钥长度不对（应为 32 位字符），请到基础设置重新填写',
      );
    }
    if (!resource.ciphertext) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '回调缺少密文');
    }
    let plain = '';
    try {
      plain = decryptApiV3(
        apiv3Key,
        resource.associated_data || '',
        resource.nonce || '',
        resource.ciphertext,
      );
    } catch {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '回调验真失败：APIv3 密钥与商户号不匹配，或报文被篡改',
      );
    }
    const payload = JSON.parse(plain) as {
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      mchid?: string;
      amount?: { total?: number };
    };
    return {
      outTradeNo: String(payload.out_trade_no || ''),
      transactionId: String(payload.transaction_id || ''),
      tradeState: String(payload.trade_state || ''),
      amountCents: Number(payload.amount?.total || 0),
      mchId: String(payload.mchid || ''),
    };
  }

  /** 入账：金额与商户号必须匹配；已支付回调幂等返回。 */
  async markPaid(
    site: SiteRow,
    input: {
      outTradeNo: string;
      transactionId: string;
      tradeState: string;
      amountCents: number;
      mchId: string;
    },
  ) {
    if (input.tradeState !== 'SUCCESS') return { ok: true, ignored: true };
    if (input.mchId && input.mchId !== site.wxMchId) {
      return { ok: false, message: '回调商户号与站点商户号不一致' };
    }
    const order = await this.prisma.knowledgePayCashOrder.findFirst({
      where: { siteId: site.id, outTradeNo: input.outTradeNo },
    });
    if (!order) return { ok: false, message: '现金订单不存在' };
    if (order.amountCents !== input.amountCents) {
      return { ok: false, message: '回调金额与订单金额不一致' };
    }
    if (order.status === 'paid' || order.status === 'refunded') {
      return { ok: true, ignored: true };
    }
    await this.prisma.$transaction(async (tx) => {
      const paid = await tx.knowledgePayCashOrder.updateMany({
        where: { id: order.id, status: { in: ['pending', 'closed'] } },
        data: {
          status: 'paid',
          transactionId: input.transactionId.slice(0, 64),
          paidAt: new Date(),
        },
      });
      if (paid.count !== 1) return;
      if (order.kind === 'vip') {
        const member = await tx.knowledgePayMember.findUniqueOrThrow({
          where: { id: order.memberId },
        });
        const base =
          member.vipUntil && member.vipUntil.getTime() > Date.now()
            ? member.vipUntil.getTime()
            : Date.now();
        await tx.knowledgePayMember.update({
          where: { id: member.id },
          data: {
            vipUntil: new Date(
              base + Math.max(1, order.plan) * 30 * 86_400_000,
            ),
          },
        });
        return;
      }
      const resource = await tx.knowledgePayResource.findFirst({
        where: { id: order.resourceId, siteId: site.id },
      });
      let unlockId = 0;
      if (resource) {
        const existed = await tx.knowledgePayOrder.findFirst({
          where: {
            siteId: site.id,
            memberId: order.memberId,
            resourceId: resource.id,
          },
          select: { id: true },
        });
        if (existed) {
          unlockId = existed.id;
        } else {
          const created = await tx.knowledgePayOrder.create({
            data: {
              siteId: site.id,
              userId: order.userId,
              memberId: order.memberId,
              resourceId: resource.id,
              title: resource.title,
              cover: resource.cover,
              url: resource.url,
              payMethod: 'wechat',
              amount: 0,
            },
          });
          unlockId = created.id;
        }
      }
      if (unlockId) {
        await tx.knowledgePayCashOrder.update({
          where: { id: order.id },
          data: { unlockOrderId: unlockId },
        });
      }
    });
    return { ok: true, ignored: false };
  }

  /** 小程序支付后主动查单（回调延迟时的兜底）。 */
  async query(site: SiteRow, memberId: number, orderNo: string) {
    const order = await this.prisma.knowledgePayCashOrder.findFirst({
      where: { siteId: site.id, memberId, outTradeNo: String(orderNo || '') },
    });
    if (!order)
      throw new BusinessException(ErrorCode.NOT_FOUND, '支付订单不存在');
    if (order.status === 'pending') {
      const credentials = this.credentials(site, await this.notifyUrl(site));
      const tx = await this.pay.query(credentials, order.outTradeNo);
      await this.markPaid(site, {
        outTradeNo: order.outTradeNo,
        transactionId: String(tx.transaction_id || ''),
        tradeState: String(tx.trade_state || ''),
        amountCents: Number(tx.amount?.total || 0),
        mchId: site.wxMchId,
      });
    }
    const latest = await this.prisma.knowledgePayCashOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    return {
      orderNo: latest.outTradeNo,
      status: latest.status,
      amountCents: latest.amountCents,
      title: latest.title,
    };
  }

  /** 管理端关闭待支付订单（微信侧关单失败不阻断本地关闭）。 */
  async close(userId: string, orderId: number) {
    const site = await this.service.ensureSite(userId);
    const order = await this.requireOrder(site.id, orderId);
    if (order.status !== 'pending') {
      throw new BusinessException(ErrorCode.CONFLICT, '只有待支付订单可以关闭');
    }
    if (this.payReady(site)) {
      const credentials = this.credentials(site, await this.notifyUrl(site));
      await this.pay
        .close(credentials, order.outTradeNo)
        .catch(() => undefined);
    }
    const updated = await this.prisma.knowledgePayCashOrder.update({
      where: { id: order.id },
      data: { status: 'closed' },
    });
    return this.orderView(updated);
  }

  /** 原路退款：只认微信 SUCCESS；课程订单撤销解锁凭据，会员订单回退剩余时长。 */
  async refund(userId: string, orderId: number, reason: string) {
    const site = await this.service.ensureSite(userId);
    const order = await this.requireOrder(site.id, orderId);
    if (order.status !== 'paid') {
      throw new BusinessException(ErrorCode.CONFLICT, '只有已支付订单可以退款');
    }
    const credentials = this.credentials(site, await this.notifyUrl(site));
    const refundNo = `${order.outTradeNo}R${Date.now().toString(36)}`.slice(
      0,
      64,
    );
    const result = await this.pay.refund(credentials, {
      outTradeNo: order.outTradeNo,
      outRefundNo: refundNo,
      reason: reason || '站点退款',
      totalCents: order.amountCents,
      refundCents: order.amountCents,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgePayCashOrder.update({
        where: { id: order.id },
        data: {
          status: 'refunded',
          refundNo: result.refundId || refundNo,
          refundReason: String(reason || '').slice(0, 120),
          refundedAt: new Date(),
        },
      });
      if (order.kind === 'course' && order.unlockOrderId) {
        await tx.knowledgePayOrder.deleteMany({
          where: {
            id: order.unlockOrderId,
            siteId: site.id,
            payMethod: 'wechat',
          },
        });
      }
      if (order.kind === 'vip') {
        const member = await tx.knowledgePayMember.findUnique({
          where: { id: order.memberId },
        });
        if (member?.vipUntil) {
          const back = Math.max(1, order.plan) * 30 * 86_400_000;
          const next = new Date(
            Math.max(Date.now(), member.vipUntil.getTime() - back),
          );
          await tx.knowledgePayMember.update({
            where: { id: member.id },
            data: { vipUntil: next },
          });
        }
      }
    });
    const latest = await this.prisma.knowledgePayCashOrder.findUniqueOrThrow({
      where: { id: order.id },
    });
    const member = await this.prisma.knowledgePayMember.findUnique({
      where: { id: latest.memberId },
      select: { nickname: true },
    });
    return this.orderView(latest, member?.nickname || '');
  }

  private async requireOrder(siteId: number, id: number) {
    const row = await this.prisma.knowledgePayCashOrder.findFirst({
      where: { id: Number(id), siteId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '现金订单不存在');
    return row;
  }

  orderView(
    row: {
      id: number;
      memberId: number;
      kind: string;
      resourceId: number;
      plan: number;
      title: string;
      amountCents: number;
      outTradeNo: string;
      transactionId: string;
      status: string;
      refundNo: string;
      refundReason: string;
      paidAt: Date | null;
      refundedAt: Date | null;
      createdAt: Date;
    },
    nickname = '',
  ) {
    return {
      id: row.id,
      memberId: row.memberId,
      nickname,
      kind: row.kind,
      resourceId: row.resourceId,
      courseTitle: '',
      plan: row.plan,
      title: row.title,
      amountCents: row.amountCents,
      outTradeNo: row.outTradeNo,
      transactionId: row.transactionId,
      status: row.status,
      refundNo: row.refundNo,
      refundReason: row.refundReason,
      paidAt: row.paidAt ? row.paidAt.toISOString() : '',
      refundedAt: row.refundedAt ? row.refundedAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }
}
