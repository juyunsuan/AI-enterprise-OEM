import type { BrandPublicOrderCreated } from '@enterprise/contracts';
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
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { BrandPlatformService } from './brand.platform.service';
import { BRAND_SCENE, clip } from './brand.shared';

type Runtime = NonNullable<Awaited<ReturnType<MiniAppService['payRuntime']>>>;

type NotifyResource = {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
};

/** 支付回调解密后的业务报文（只取我们要用的字段）。 */
export type PayNotifyResult = {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountCents: number;
  mchId: string;
  appId: string;
};

/**
 * 微信支付 APIv3（JSAPI）·租户自有商户号直连。
 *
 * 三条口径：
 * 1. **资金不进平台**：下单用的是这个店铺自己填的 mchId / 证书 / APIv3 密钥，
 *    平台只是软件服务方，不落任何资金账本；
 * 2. 凭据不齐就不下发支付通道，由上层降级成线下标记，不半开不半关；
 * 3. 签名、下单、退款、AES-256-GCM 解密一律走 `points/wechat-pay.client.ts`
 *    的统一客户端（本文件只做「店铺凭据 → 客户端凭据」的转换与店铺侧副作用）；
 *    回调的时间戳防重放在 `brand.public.ts` 的 notify 路由里校验，理由见那里。
 */
export class BrandPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly platform: BrandPlatformService,
    private readonly pay: WechatPayClient,
  ) {}

  private async subject(shopId: number, ownerUserId: string) {
    const shop = await this.prisma.brandShop.findFirst({
      where: { id: shopId, ownerUserId },
      select: { id: true, ownerUserId: true, name: true },
    });
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    }
    return {
      ownerUserId: shop.ownerUserId,
      scene: BRAND_SCENE,
      shopId: shop.id,
      shopName: shop.name,
    };
  }

  /** 在线收款是否可用：平台闸门 + 店铺凭据，两个都过才算可用。 */
  async available(shopId: number, ownerUserId: string): Promise<boolean> {
    const limits = await this.platform.limits();
    if (!limits.payAllowed) return false;
    const runtime = await this.miniApp.payRuntime(
      await this.subject(shopId, ownerUserId),
    );
    return Boolean(runtime);
  }

  async notifyUrl(shopId: number): Promise<string> {
    const site = await resolveSiteUrl(this.prisma);
    if (!site) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，微信支付回调无法送达。请到平台后台「站点设置 → 站点域名」填写本站对外地址',
      );
    }
    return `${site}/api/public/brand-mall/pay/notify/${shopId}`;
  }

  /** 店铺自有商户号 → 统一客户端凭据（回调地址按店铺路由段，作用域不离开本店）。 */
  private toCredentials(
    runtime: Runtime,
    notifyUrl: string,
  ): WechatCredentials {
    return {
      appId: runtime.appId,
      mchId: runtime.mchId,
      apiv3Key: runtime.apiV3Key,
      certSerial: runtime.certSerial,
      privateKey: runtime.privateKey,
      notifyUrl,
      configured: true,
    };
  }

  /** JSAPI 下单，返回 `wx.requestPayment` 需要的五个参数。 */
  async prepay(input: {
    shopId: number;
    ownerUserId: string;
    orderNo: string;
    amountCents: number;
    description: string;
    openid: string;
  }): Promise<BrandPublicOrderCreated['payParams']> {
    const runtime = await this.miniApp.payRuntime(
      await this.subject(input.shopId, input.ownerUserId),
    );
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该商城未配置可用的微信支付商户号，请联系商家',
      );
    }
    if (!input.openid) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '登录状态缺少 openid，请退出小程序重新进入后再支付',
      );
    }
    const credentials = this.toCredentials(
      runtime,
      await this.notifyUrl(input.shopId),
    );
    const prepayId = await this.pay.jsapi(credentials, {
      outTradeNo: input.orderNo,
      description: clip(input.description, 120) || '商品订单',
      amountCents: Math.max(1, Math.round(input.amountCents)),
      openid: input.openid,
    });
    // 客户端对 HTTP 非 2xx 已经抛 SERVICE_UNAVAILABLE（带微信返回的 message），
    // 这里只补「200 但没给 prepay_id」这种原实现也会拒绝的畸形返回。
    if (!prepayId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信支付下单失败：微信未返回 prepay_id。请检查商户号、APIv3 密钥与证书序列号是否配对',
      );
    }
    return buildJsapiPayParams(credentials, prepayId);
  }

  /** 退款：原路退回买家微信。失败抛错，由售后流程把状态留在 AGREED 供重试。 */
  async refund(input: {
    shopId: number;
    ownerUserId: string;
    orderNo: string;
    refundNo: string;
    totalCents: number;
    refundCents: number;
    reason: string;
  }): Promise<string> {
    const runtime = await this.miniApp.payRuntime(
      await this.subject(input.shopId, input.ownerUserId),
    );
    if (!runtime) {
      // 没配支付通道说明这单本来就不是线上下单，退款走线下人工处理
      return '';
    }
    // 退款不带回调地址，所以站点域名没配的店主也能正常退款；
    // 退款是否成功看微信同步返回的 status，非 SUCCESS 由客户端抛出，不会写成已退款。
    const credentials = this.toCredentials(
      runtime,
      // 退款不带回调：本仓没有退款回调路由，成败按同步返回的 status 判定
      '',
    );
    let refundId = '';
    let failure = '';
    try {
      refundId = (
        await this.pay.refund(credentials, {
          outTradeNo: input.orderNo,
          outRefundNo: input.refundNo,
          reason: clip(input.reason, 80) || '买家申请退款',
          totalCents: Math.max(1, Math.round(input.totalCents)),
          refundCents: Math.max(1, Math.round(input.refundCents)),
          // 微信退款比下单慢，保留原实现的 20s 超时
          timeoutMs: 20_000,
        })
      ).refundId;
      // 客户端对 HTTP 非 2xx 已经抛 SERVICE_UNAVAILABLE，这里只补「200 但没给
      // 退款单号」这种原实现同样判失败的畸形返回。
      if (!refundId) failure = '微信未返回退款单号';
    } catch (error) {
      failure = error instanceof Error ? error.message : '';
    }
    if (failure) {
      const detail = clip(failure, 180);
      await this.prisma.brandRefundOrder
        .updateMany({
          where: { refundNo: input.refundNo, shopId: input.shopId },
          data: { adminRemark: `微信退款受理失败：${detail}` },
        })
        .catch(() => undefined);
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `微信退款失败${detail ? `：${detail}` : ''}。售后单已保留为「已同意」，请核对商户号配置后重试`,
      );
    }
    return refundId;
  }

  /**
   * 解开发货回调报文。shopId 来自回调 URL 路径，凭据只按这个店铺取，
   * 因此错店的回调必然解密失败（GCM 标签不匹配），不需要再额外查单归属。
   *
   * 这里只做解密验真、不复用客户端的 `parseNotify`：路由侧的函数签名只传密文
   * （拿不到 rawBody 与请求头），而 `parseNotify` 要先下载平台证书做 RSA 验签，
   * 证书拉取失败会把「可重试的 400」变成 5xx。时间戳防重放在 notify 路由补齐。
   */
  async decryptNotify(
    shopId: number,
    ownerUserId: string,
    resource: NotifyResource,
  ): Promise<PayNotifyResult> {
    const runtime = await this.miniApp.payRuntime(
      await this.subject(shopId, ownerUserId),
    );
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该店铺未配置微信支付凭据',
      );
    }
    if (Buffer.from(runtime.apiV3Key, 'utf8').length !== 32) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'APIv3 密钥长度不对（应为 32 位字符），请重新填写',
      );
    }
    const cipher = Buffer.from(resource.ciphertext || '', 'base64');
    if (cipher.length <= 16) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '回调解密失败：报文不完整',
      );
    }
    let plain = '';
    try {
      plain = decryptApiV3(
        runtime.apiV3Key,
        resource.associated_data || '',
        resource.nonce,
        resource.ciphertext || '',
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
      appid?: string;
      amount?: { total?: number; payer_total?: number };
    };
    return {
      outTradeNo: String(payload.out_trade_no || ''),
      transactionId: String(payload.transaction_id || ''),
      tradeState: String(payload.trade_state || ''),
      amountCents: Math.round(
        Number(payload.amount?.total ?? payload.amount?.payer_total ?? 0),
      ),
      mchId: String(payload.mchid || ''),
      appId: String(payload.appid || ''),
    };
  }

  /** 回给微信的成功应答体（微信收到非 200/SUCCESS 会持续重试）。 */
  static notifyOk() {
    return { code: 'SUCCESS', message: '成功' };
  }
}
