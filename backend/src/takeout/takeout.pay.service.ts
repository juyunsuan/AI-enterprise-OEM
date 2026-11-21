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
import type { TakeoutShopService } from './takeout.shop.service';
import { clip } from './takeout.shared';

type Runtime = NonNullable<Awaited<ReturnType<MiniAppService['payRuntime']>>>;

type NotifyResource = {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
};

export type TakeoutPayNotify = {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountCents: number;
  mchId: string;
  appId: string;
};

/**
 * 外卖微信支付：复用统一 `WechatPayClient` 与私域小程序主体凭据，
 * 但商户号场景固定 `TAKEOUT`，回调走外卖自己的路由，和商城支付互不串店。
 */
export class TakeoutPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: TakeoutShopService,
    private readonly miniApp: MiniAppService,
    private readonly pay: WechatPayClient,
    private readonly payAllowed: () => Promise<boolean>,
  ) {}

  async available(shopId: number): Promise<boolean> {
    if (!(await this.payAllowed())) return false;
    return Boolean(
      await this.miniApp.payRuntime(await this.shops.paySubject(shopId)),
    );
  }

  async notifyUrl(shopId: number): Promise<string> {
    const site = await resolveSiteUrl(this.prisma);
    if (!site) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，微信支付回调无法送达。请到平台后台「站点设置 → 站点域名」填写本站对外地址',
      );
    }
    return `${site.replace(/\/+$/, '')}/api/public/takeout/pay/notify/${shopId}`;
  }

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
    shopId: number;
    orderNo: string;
    amountCents: number;
    description: string;
    openid: string;
  }) {
    const runtime = await this.miniApp.payRuntime(
      await this.shops.paySubject(input.shopId),
    );
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该外卖门店未配置可用的微信支付商户号，请联系商家',
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
      description: clip(input.description, 120) || '外卖订单',
      amountCents: Math.max(1, Math.round(input.amountCents)),
      openid: input.openid,
    });
    if (!prepayId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信支付下单失败：微信未返回 prepay_id。请检查商户号、APIv3 密钥与证书序列号是否配对',
      );
    }
    return buildJsapiPayParams(credentials, prepayId);
  }

  async decryptNotify(
    shopId: number,
    resource: NotifyResource,
  ): Promise<TakeoutPayNotify> {
    const runtime = await this.miniApp.payRuntime(
      await this.shops.paySubject(shopId),
    );
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该外卖门店未配置微信支付凭据',
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
      amount?: { total?: number };
      mchid?: string;
      appid?: string;
    };
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
