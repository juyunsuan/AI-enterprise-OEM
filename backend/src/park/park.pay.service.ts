import {
  buildJsapiPayParams,
  WechatPayClient,
} from '../points/wechat-pay.client';
import type {
  WechatCredentials,
  WechatTransaction,
} from '../points/wechat-pay.client';
import { resolveSiteUrl } from '../common/site-url';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';

/**
 * 园区订单微信支付：复用站内统一 WechatPayClient 与 miniprogram_apps(scene=PARK)。
 * 资金直进园区运营方自己的商户号；平台不经手。
 */
export class ParkPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly client: WechatPayClient,
  ) {}

  async credentials(siteId: number): Promise<WechatCredentials | null> {
    const site = await this.prisma.parkSite.findUnique({
      where: { id: siteId },
      select: { ownerUserId: true, name: true },
    });
    if (!site) return null;
    const siteUrl = await resolveSiteUrl(this.prisma);
    const runtime = await this.miniApp.payRuntime({
      ownerUserId: site.ownerUserId,
      scene: 'PARK',
      shopId: siteId,
      shopName: site.name,
    });
    if (!runtime || !siteUrl) return null;
    return {
      appId: runtime.appId,
      mchId: runtime.mchId,
      apiv3Key: runtime.apiV3Key,
      certSerial: runtime.certSerial,
      privateKey: runtime.privateKey,
      notifyUrl: `${siteUrl}/api/public/park/pay/notify/${siteId}`,
      configured: true,
    };
  }

  async payParams(
    siteId: number,
    orderId: number,
    openid: string,
    customerId: number,
  ) {
    const order = await this.prisma.parkOrder.findFirst({
      where: { id: orderId, siteId, customerId },
    });
    if (!order) {
      return { payable: false, reason: '订单不存在', params: null };
    }
    if (order.status !== 'PENDING') {
      return { payable: false, reason: '订单已处理，无需支付', params: null };
    }
    const amountCents = Math.round(Number(order.amount) * 100);
    if (amountCents <= 0) {
      return { payable: false, reason: '订单金额异常', params: null };
    }
    if (!openid) {
      return {
        payable: false,
        reason: '登录状态已失效，请重新进入小程序',
        params: null,
      };
    }
    const credentials = await this.credentials(siteId);
    if (!credentials) {
      return {
        payable: false,
        reason: '园区尚未开通在线收款，请到服务台线下支付',
        params: null,
      };
    }
    const prepayId = await this.client.jsapi(credentials, {
      outTradeNo: order.orderNo,
      description: `园区订单 ${order.orderNo.slice(-8)}`,
      amountCents,
      openid,
    });
    await this.prisma.parkOrder.update({
      where: { id: order.id },
      data: { prepayId: String(prepayId).slice(0, 64), payMethod: 'WECHAT' },
    });
    return {
      payable: true,
      reason: '',
      params: buildJsapiPayParams(credentials, prepayId),
    };
  }

  parseNotify(
    credentials: WechatCredentials,
    headers: Record<string, string>,
    rawBody: string,
  ) {
    return this.client.parseNotify(credentials, headers, rawBody);
  }

  async markPaid(siteId: number, transaction: WechatTransaction) {
    const orderNo = String(transaction.out_trade_no || '');
    if (!orderNo) return { handled: false, reason: '缺少商户订单号' };
    if (String(transaction.trade_state || '') !== 'SUCCESS') {
      return { handled: false, reason: `支付状态 ${transaction.trade_state}` };
    }
    const order = await this.prisma.parkOrder.findFirst({
      where: { siteId, orderNo },
    });
    if (!order) return { handled: false, reason: '订单不存在' };
    const totalCents = Number(transaction.amount?.total ?? 0);
    const expectCents = Math.round(Number(order.amount) * 100);
    if (totalCents !== expectCents) {
      return { handled: false, reason: '金额不符' };
    }
    if (order.status === 'PAID') {
      return { handled: true, reason: '重复回调' };
    }
    if (order.status !== 'PENDING') {
      return { handled: false, reason: `订单状态 ${order.status}` };
    }
    await this.prisma.parkOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        payMethod: 'WECHAT',
        paidAt: new Date(),
        prepayId: '',
        transactionId: String(transaction.transaction_id || '').slice(0, 64),
      },
    });
    return { handled: true, reason: '已置为已收款' };
  }

  /** 原路退款：同一订单固定 outRefundNo，微信侧幂等。 */
  async refund(siteId: number, orderNo: string, amountCents: number) {
    if (amountCents <= 0) return 0;
    const credentials = await this.credentials(siteId);
    if (!credentials) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '园区尚未配置微信支付，无法在线退款，请线下处理',
      );
    }
    await this.client.refund(credentials, {
      outTradeNo: orderNo,
      outRefundNo: `RP${orderNo}`,
      reason: '园区订单退款',
      totalCents: amountCents,
      refundCents: amountCents,
    });
    return amountCents;
  }
}
