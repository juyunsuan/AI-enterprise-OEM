import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  WechatPayClient,
  buildJsapiPayParams,
  decryptApiV3,
  type WechatCredentials,
} from '../points/wechat-pay.client';
import type { MpMarket } from '../../generated/prisma';

type Runtime = NonNullable<Awaited<ReturnType<MiniAppService['payRuntime']>>>;

export const MP_MARKET_SCENE = 'MARKET' as const;

export type MpPayNotifyResult = {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountCents: number;
  mchId: string;
  appId: string;
};

/**
 * 多店铺商城·父单微信支付（JSAPI）。
 *
 * B2B2C 的钱一次进市场运营方的商户号（父单只付一次），子单按抽佣快照在 B2 结算；
 * 商户自己的 mch_id 在 B2 的「商户直收」模式下才会用到，B1 不分散收款。
 *
 * 签名 / 下单 / 退款 / 解密收编到 `points/wechat-pay.client.ts` 的统一客户端，
 * 本文件只保留市场作用域与回调地址路由段；回调的时间戳防重放在
 * `mp.buyer.routes.ts` 的 notify 路由里校验。
 */
export class MpPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly pay: WechatPayClient,
  ) {}

  private subject(market: MpMarket) {
    return {
      ownerUserId: market.ownerUserId,
      scene: MP_MARKET_SCENE,
      shopId: market.id,
      shopName: market.name,
    };
  }

  async available(market: MpMarket): Promise<boolean> {
    return Boolean(await this.miniApp.payRuntime(this.subject(market)));
  }

  async notifyUrl(marketId: number): Promise<string> {
    const site = await resolveSiteUrl(this.prisma);
    if (!site) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，微信支付回调无法送达',
      );
    }
    return `${site}/api/public/market/pay/notify/${marketId}`;
  }

  /** 市场运营方商户号 → 统一客户端凭据。 */
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

  async prepay(input: {
    market: MpMarket;
    orderNo: string;
    amountCents: number;
    description: string;
    openid: string;
    notifyUrl: string;
  }): Promise<{
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
  }> {
    const runtime = await this.miniApp.payRuntime(this.subject(input.market));
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该市场未配置可用的微信支付商户号，请联系市场运营方',
      );
    }
    if (!input.openid) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '登录状态缺少 openid，请重新登录后再支付',
      );
    }
    const credentials = this.toCredentials(runtime, input.notifyUrl);
    const prepayId = await this.pay.jsapi(credentials, {
      outTradeNo: input.orderNo,
      description: input.description.slice(0, 120) || '商城订单',
      amountCents: Math.max(1, Math.round(input.amountCents)),
      openid: input.openid,
    });
    // 客户端对 HTTP 非 2xx 已经抛 SERVICE_UNAVAILABLE（带微信返回的 message），
    // 这里只补「200 但没给 prepay_id」这种原实现也会拒绝的畸形返回。
    if (!prepayId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信支付下单失败：微信未返回 prepay_id。请检查市场商户号配置',
      );
    }
    return buildJsapiPayParams(credentials, prepayId);
  }

  /**
   * 原路退款：B2B2C 的钱在父单一次收进市场商户号，退款也按父单 `out_trade_no` 退。
   * 未配置支付通道（线下收款）时返回空串，由调用方转线下退款口径。
   */
  async refund(input: {
    market: MpMarket;
    orderNo: string;
    refundNo: string;
    totalCents: number;
    refundCents: number;
    reason: string;
  }): Promise<string> {
    const runtime = await this.miniApp.payRuntime(this.subject(input.market));
    if (!runtime) return '';
    // 退款不带回调地址，所以站点域名没配的店主也能正常退款；
    // 退款是否成功看微信同步返回的 status，非 SUCCESS 由客户端抛出，不会写成已退款。
    const { refundId } = await this.pay.refund(
      // 退款不带回调：本仓没有退款回调路由，成败按同步返回的 status 判定
      this.toCredentials(runtime, ''),
      {
        outTradeNo: input.orderNo,
        outRefundNo: input.refundNo,
        reason: input.reason.slice(0, 80) || '买家申请退款',
        totalCents: Math.max(1, Math.round(input.totalCents)),
        refundCents: Math.max(1, Math.round(input.refundCents)),
        // 微信退款比下单慢，保留原实现的 20s 超时
        timeoutMs: 20_000,
      },
    );
    if (!refundId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信退款失败：微信未返回退款单号。售后单已保留为「已同意」，请核对商户号配置后重试',
      );
    }
    return refundId;
  }

  /**
   * 解父单支付回调密文。marketId 来自回调 URL 路径，密钥只按该市场取，
   * 因此错市场的回调必然解密失败（GCM 标签不匹配）。
   *
   * 不复用客户端的 `parseNotify`：`trade.payNotify` 只把密文交进来（函数签名不许
   * 改），而 `parseNotify` 要先下载平台证书做 RSA 验签，证书拉取失败会把可重试的
   * 400 变成 5xx。时间戳防重放在 notify 路由里补。
   */
  async decryptNotify(
    market: MpMarket,
    resource: {
      ciphertext: string;
      nonce: string;
      associated_data?: string;
    },
  ): Promise<MpPayNotifyResult> {
    const runtime = await this.miniApp.payRuntime(this.subject(market));
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该市场未配置微信支付凭据',
      );
    }
    if (Buffer.from(runtime.apiV3Key, 'utf8').length !== 32) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'APIv3 密钥长度不对（应为 32 位字符）',
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
        '回调解密失败：请检查 APIv3 密钥是否与商户号匹配',
      );
    }
    const payload = JSON.parse(plain || '{}') as {
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      amount?: { total?: number };
      mchid?: string;
      appid?: string;
    };
    // 保留原实现：金额直接取 total 不四舍五入（调用方只比较大小，不据此找零）
    return {
      outTradeNo: String(payload.out_trade_no || ''),
      transactionId: String(payload.transaction_id || ''),
      tradeState: String(payload.trade_state || ''),
      amountCents: Number(payload.amount?.total || 0),
      mchId: String(payload.mchid || ''),
      appId: String(payload.appid || ''),
    };
  }
}
