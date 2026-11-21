import type { CardShopPublicOrderCreated } from '@enterprise/contracts';
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
import type { CardShopPlatformService } from './card-shop.platform.service';
import type { CardShopSiteService } from './card-shop.site.service';
import { clip } from './card-shop.shared';

type Runtime = NonNullable<Awaited<ReturnType<MiniAppService['payRuntime']>>>;

type NotifyResource = {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
};

/** 支付回调解密后的业务报文（只取要用的字段）。 */
export type CardShopPayNotify = {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountCents: number;
  mchId: string;
  appId: string;
};

/**
 * 微信支付 APIv3（JSAPI）· 店主自有商户号直连。
 *
 * 卡密是「付款即发货」的即时业务，所以这里只有下单与回调解密两件事，没有退款：
 * 虚拟商品一经发出卡密就无法回收，退款口径由店主线下处置（详见设计方案 §资金直收）。
 *
 * 凭据一律从底座 `miniprogram_apps`（scene=CARD_SHOP）按站点取，平台不落任何资金账本。
 * 签名 / 下单 / 解密都走 `points/wechat-pay.client.ts` 的统一客户端，本文件只保留
 * 站点作用域与平台闸门；回调的时间戳防重放在 `card-shop.public.ts` 里校验。
 */
export class CardShopPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: CardShopSiteService,
    private readonly miniApp: MiniAppService,
    private readonly platform: CardShopPlatformService,
    private readonly pay: WechatPayClient,
  ) {}

  /** 在线收款是否可用：平台闸门 + 该店商户号凭据，两个都过才算可用。 */
  async available(siteId: number, ownerUserId: string): Promise<boolean> {
    const limits = await this.platform.limits();
    if (!limits.payAllowed) return false;
    const site = await this.prisma.cardShopSite.findFirst({
      where: { id: siteId, ownerUserId },
      select: { id: true, ownerUserId: true, name: true },
    });
    if (!site) return false;
    const runtime = await this.miniApp.payRuntime(this.sites.subject(site));
    return Boolean(runtime);
  }

  async notifyUrl(siteId: number): Promise<string> {
    const site = await resolveSiteUrl(this.prisma);
    if (!site) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，微信支付回调无法送达。请到平台后台「站点设置 → 站点域名」填写本站对外地址',
      );
    }
    return `${site}/api/public/card-shop/pay/notify/${siteId}`;
  }

  /** 店主自有商户号 → 统一客户端凭据。 */
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

  /**
   * JSAPI 下单，返回 `wx.requestPayment` 需要的五个参数。
   *
   * 金额只认后端算出来的分：入参来自订单落库后的 `totalAmount`，端上传什么都不参与定价。
   */
  async prepay(input: {
    siteId: number;
    ownerUserId: string;
    orderNo: string;
    amountCents: number;
    description: string;
    openid: string;
  }): Promise<CardShopPublicOrderCreated['payParams']> {
    const site = await this.prisma.cardShopSite.findFirst({
      where: { id: input.siteId, ownerUserId: input.ownerUserId },
      select: { id: true, ownerUserId: true, name: true },
    });
    if (!site) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商店不存在');
    }
    const limits = await this.platform.limits();
    if (!limits.payAllowed) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '平台已关闭在线收款，本店暂只能线下收款发货，请联系店方',
      );
    }
    if (input.amountCents <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '订单金额为 0 不能发起微信支付，请让买家使用免费券或店主关闭该商品',
      );
    }
    if (!input.openid) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '登录状态缺少 openid，请退出小程序重新进入后再支付',
      );
    }
    const runtime = await this.miniApp.payRuntime(this.sites.subject(site));
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该商店未配置可用的微信支付商户号，请联系店方在「发布与凭据」填齐商户号、APIv3 密钥与证书',
      );
    }
    const credentials = this.toCredentials(
      runtime,
      await this.notifyUrl(site.id),
    );
    const prepayId = await this.pay.jsapi(credentials, {
      outTradeNo: input.orderNo,
      description: clip(input.description, 120) || '卡密订单',
      amountCents: Math.max(1, Math.round(input.amountCents)),
      openid: input.openid,
    });
    // 客户端对 HTTP 非 2xx 已经抛 SERVICE_UNAVAILABLE（带微信返回的 message），
    // 这里只补「200 但没给 prepay_id」这种原实现也会拒绝的畸形返回。
    if (!prepayId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信支付下单失败：微信未返回 prepay_id。请核对商户号、APIv3 密钥与证书序列号是否配对',
      );
    }
    return buildJsapiPayParams(credentials, prepayId);
  }

  /**
   * 解回调报文。siteId 来自回调 URL 路径，凭据只按这个站点取，
   * 因此错店回调必然解密失败（GCM 标签不匹配），不必再查单归属。
   *
   * 不复用客户端的 `parseNotify`：路由只把密文传进来（函数签名不许改），
   * 而 `parseNotify` 要先下载平台证书做 RSA 验签，证书拉取失败会把可重试的
   * 400 变成 5xx。时间戳防重放在 notify 路由里补。
   */
  async decryptNotify(
    siteId: number,
    resource: NotifyResource,
  ): Promise<CardShopPayNotify> {
    const site = await this.prisma.cardShopSite.findUnique({
      where: { id: Number(siteId) },
      select: { id: true, ownerUserId: true, name: true },
    });
    if (!site) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '商店不存在');
    }
    const runtime = await this.miniApp.payRuntime(this.sites.subject(site));
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该商店未配置微信支付凭据',
      );
    }
    if (Buffer.from(runtime.apiV3Key, 'utf8').length !== 32) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'APIv3 密钥长度不对（应为 32 位字符），请在「发布与凭据」重新填写',
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
