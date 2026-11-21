import { RENTAL_SCENE, type MiniAppInput } from '@enterprise/contracts';
import {
  buildJsapiPayParams,
  WechatPayClient,
} from '../points/wechat-pay.client';
import type {
  WechatCredentials,
  WechatTransaction,
} from '../points/wechat-pay.client';
import { resolveSiteUrl } from '../common/site-url';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { RentalScrmService } from './rental.scrm.service';

/**
 * 租赁订单微信支付：复用站内统一 WechatPayClient 与 miniprogram_apps(scene=RENTAL)，
 * 不另建商户配置表、不另写一套验签。押金与租金合并一笔支付，结算时按验车结果原路退押金。
 */
export class RentalPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly client: WechatPayClient,
    private readonly scrm: RentalScrmService,
  ) {}

  async credentials(shopId: number): Promise<WechatCredentials | null> {
    const shop = await this.prisma.rentalShop.findUnique({
      where: { id: shopId },
      select: { ownerUserId: true, name: true },
    });
    if (!shop) return null;
    const siteUrl = await resolveSiteUrl(this.prisma);
    const runtime = await this.miniApp.payRuntime({
      ownerUserId: shop.ownerUserId,
      scene: RENTAL_SCENE,
      shopId,
      shopName: shop.name,
    });
    if (!runtime || !siteUrl) return null;
    return {
      appId: runtime.appId,
      mchId: runtime.mchId,
      apiv3Key: runtime.apiV3Key,
      certSerial: runtime.certSerial,
      privateKey: runtime.privateKey,
      notifyUrl: `${siteUrl}/api/public/rental/pay/notify/${shopId}`,
      configured: true,
    };
  }

  async payEnabled(shopId: number) {
    return (await this.credentials(shopId)) !== null;
  }

  /** 下单失败不报错：端上按 payable=false 展示「联系门店线下支付」。 */
  async payParams(shopId: number, orderId: number, openid: string) {
    const order = await this.prisma.rentalOrder.findFirst({
      where: { id: orderId, shopId },
    });
    if (!order) {
      return { payable: false, reason: '订单不存在', params: null };
    }
    if (order.payStatus === 'PAID') {
      return { payable: false, reason: '该订单已支付', params: null };
    }
    if (order.status !== 'PENDING_PAYMENT') {
      return { payable: false, reason: '订单已关闭，请重新下单', params: null };
    }
    const credentials = await this.credentials(shopId);
    if (!credentials) {
      return {
        payable: false,
        reason: '门店尚未开通在线收款，请联系门店线下支付',
        params: null,
      };
    }
    if (!openid) {
      return {
        payable: false,
        reason: '登录状态已失效，请重新进入小程序',
        params: null,
      };
    }
    const amountCents = Math.round(Number(order.payAmount) * 100);
    if (amountCents <= 0) {
      return {
        payable: false,
        reason: '订单金额异常，请联系门店处理',
        params: null,
      };
    }
    const prepayId = await this.client.jsapi(credentials, {
      outTradeNo: order.orderNo,
      description: `租赁订单 ${order.orderNo.slice(-8)}`,
      amountCents,
      openid,
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

  /** 回调幂等与金额核对：金额不符只留痕不改状态。 */
  async markPaid(shopId: number, transaction: WechatTransaction) {
    const orderNo = String(transaction.out_trade_no || '');
    if (!orderNo) return { handled: false, reason: '缺少商户订单号' };
    if (String(transaction.trade_state || '') !== 'SUCCESS') {
      return { handled: false, reason: `支付状态 ${transaction.trade_state}` };
    }
    const order = await this.prisma.rentalOrder.findFirst({
      where: { shopId, orderNo },
    });
    if (!order) return { handled: false, reason: '订单不存在' };
    const totalCents = Number(transaction.amount?.total ?? 0);
    const expectCents = Math.round(Number(order.payAmount) * 100);
    if (totalCents !== expectCents) {
      return { handled: false, reason: '金额不符' };
    }
    if (order.payStatus === 'PAID') {
      return { handled: true, reason: '重复回调' };
    }
    if (order.status !== 'PENDING_PAYMENT') {
      return { handled: false, reason: `订单状态 ${order.status}` };
    }
    await this.prisma.rentalOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        payStatus: 'PAID',
        paidAt: new Date(),
        transactionId: String(transaction.transaction_id || '').slice(0, 64),
      },
    });
    const shop = await this.prisma.rentalShop.findUnique({
      where: { id: shopId },
      select: { ownerUserId: true, name: true },
    });
    await this.scrm.enqueue({
      shopId,
      ownerUserId: shop?.ownerUserId || '',
      customerId: order.customerId,
      kind: 'ORDER_PAID',
      recordKey: order.orderNo,
      payload: {
        shopName: shop?.name || '',
        orderNo: order.orderNo,
        itemName: order.itemName,
        amount: Number(order.payAmount),
      },
    });
    return { handled: true, reason: '已置为待取车' };
  }

  /** 原路退款：同一订单固定 outRefundNo，微信侧幂等，可安全重试。 */
  async refund(
    shopId: number,
    input: {
      orderNo: string;
      totalCents: number;
      refundCents: number;
      reason: string;
    },
  ) {
    if (input.refundCents <= 0) return 0;
    const credentials = await this.credentials(shopId);
    if (!credentials) {
      throw new Error('门店尚未配置微信支付，无法在线退款，请线下处理');
    }
    await this.client.refund(credentials, {
      outTradeNo: input.orderNo,
      outRefundNo: `RR${input.orderNo}`,
      reason: input.reason.slice(0, 80),
      totalCents: input.totalCents,
      refundCents: input.refundCents,
    });
    return input.refundCents;
  }

  async test(subject: {
    ownerUserId: string;
    shopId: number;
    shopName: string;
  }) {
    return this.miniApp.test({ ...subject, scene: RENTAL_SCENE });
  }

  view(subject: { ownerUserId: string; shopId: number; shopName: string }) {
    return this.miniApp.view({ ...subject, scene: RENTAL_SCENE });
  }

  save(
    subject: { ownerUserId: string; shopId: number; shopName: string },
    body: MiniAppInput,
  ) {
    return this.miniApp.save({ ...subject, scene: RENTAL_SCENE }, body);
  }
}
