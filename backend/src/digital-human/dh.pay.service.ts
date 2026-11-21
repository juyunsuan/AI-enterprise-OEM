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
import { DH_SCENE, clip } from './dh.shared';

type SiteRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanSite']['findUnique']>>
>;
type Runtime = NonNullable<Awaited<ReturnType<MiniAppService['payRuntime']>>>;

type NotifyResource = {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
};

export type DhPayNotifyResult = {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountCents: number;
  mchId: string;
  appId: string;
};

/**
 * 数字人站点微信支付（APIv3 JSAPI）：走站点主人自己填的商户号，平台不经手资金。
 * 与商城支付同一套口径：凭据不齐就不下发支付通道。
 *
 * 签名 / 下单 / 退款 / 解密都收编到 `points/wechat-pay.client.ts` 的统一客户端，
 * 本文件只留站点作用域；回调的时间戳防重放在 `dh.public.ts` 的 notify 路由里校验。
 */
export class DhPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly pay: WechatPayClient,
  ) {}

  subject(site: SiteRow) {
    return {
      ownerUserId: site.userId,
      scene: DH_SCENE,
      shopId: site.id,
      shopName: site.siteName || `数字人小程序 ${site.siteCode}`,
    };
  }

  async runtime(site: SiteRow): Promise<Runtime | null> {
    return this.miniApp.payRuntime(this.subject(site));
  }

  async available(site: SiteRow): Promise<boolean> {
    return Boolean(await this.runtime(site));
  }

  async notifyUrl(siteId: number): Promise<string> {
    const site = await resolveSiteUrl(this.prisma);
    if (!site) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，微信支付回调无法送达。请到平台后台「站点设置 → 站点域名」填写本站对外地址',
      );
    }
    return `${site}/api/public/digital-human/pay/notify/${siteId}`;
  }

  /** 站点自有商户号 → 统一客户端凭据。 */
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
    site: SiteRow;
    orderNo: string;
    amountCents: number;
    description: string;
    openid: string;
  }): Promise<{
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: 'RSA';
    paySign: string;
  }> {
    const runtime = await this.runtime(input.site);
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该站点尚未配置可用的微信支付商户号，请先在「小程序发布」里填写支付凭据',
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
      await this.notifyUrl(input.site.id),
    );
    const prepayId = await this.pay.jsapi(credentials, {
      outTradeNo: input.orderNo,
      description: clip(input.description, 120) || '数字人服务',
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

  /** 退款：原路退回。未配支付通道返回空串（该单本来就不是线上支付）。 */
  async refund(input: {
    site: SiteRow;
    orderNo: string;
    refundNo: string;
    totalCents: number;
    refundCents: number;
    reason: string;
  }): Promise<string> {
    const runtime = await this.runtime(input.site);
    if (!runtime) return '';
    // 退款不带回调地址，所以站点域名没配的店主也能正常退款；
    // 退款是否成功看微信同步返回的 status，非 SUCCESS 由客户端抛出，不会写成已退款。
    const { refundId } = await this.pay.refund(
      // 退款不带回调：本仓没有退款回调路由，成败按同步返回的 status 判定
      this.toCredentials(runtime, ''),
      {
        outTradeNo: input.orderNo,
        outRefundNo: input.refundNo,
        reason: clip(input.reason, 80) || '站点方退款',
        totalCents: Math.max(1, Math.round(input.totalCents)),
        refundCents: Math.max(1, Math.round(input.refundCents)),
        // 微信退款比下单慢，保留原实现的 20s 超时
        timeoutMs: 20_000,
      },
    );
    if (!refundId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信退款失败：微信未返回退款单号。请核对商户号配置后重试',
      );
    }
    return refundId;
  }

  /**
   * 解开发货回调报文。siteId 来自回调 URL 路径，凭据只按该站点取，
   * 因此错站回调必然解密失败（GCM 标签不匹配），无需额外查单归属。
   *
   * 不复用客户端的 `parseNotify`：路由只传密文（函数签名不许改），而
   * `parseNotify` 要先下载平台证书做 RSA 验签，证书拉取失败会把可重试的 400
   * 变成 5xx。时间戳防重放在 notify 路由里补。
   */
  async decryptNotify(
    site: SiteRow,
    resource: NotifyResource,
  ): Promise<DhPayNotifyResult> {
    const runtime = await this.runtime(site);
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该站点未配置微信支付凭据',
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

  static notifyOk() {
    return { code: 'SUCCESS', message: '成功' };
  }
}
