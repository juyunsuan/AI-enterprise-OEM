import type { ErrandPublicOrderCreated } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  MiniAppService,
  MiniAppSubject,
} from '../private-mini/mini-app.service';
import {
  WechatPayClient,
  buildJsapiPayParams,
  decryptApiV3,
  type WechatCredentials,
} from '../points/wechat-pay.client';
import type { ErrandPlatformService } from './errand.platform.service';
import { clip } from './errand.shared';

export type ErrandPublicPayParams = NonNullable<
  ErrandPublicOrderCreated['payParams']
>;

type NotifyResource = {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
};

export type ErrandPayNotify = {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountCents: number;
  mchId: string;
  appId: string;
};

/**
 * 微信支付 APIv3（JSAPI）· 账号级小程序主体。
 *
 * 只做「下单 + 回调解密」：退款由店主在微信商户平台操作后回本站登记，
 * 平台不代扣、不代退、不落资金账本。商户凭据取自 `miniprogram_apps`
 * （scene=ERRAND，账号级 shopId=站点 id），AppID 与支付同属一部小程序。
 */
export class ErrandPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly platform: ErrandPlatformService,
    private readonly pay: WechatPayClient,
  ) {}

  /** 运行时凭据：平台闸门 + 小程序主体支付凭据，两个都过才算可在线收款。 */
  async online(site: {
    ownerUserId: string;
    id: number;
    name: string;
  }): Promise<{
    runtime: NonNullable<Awaited<ReturnType<MiniAppService['payRuntime']>>>;
    subject: MiniAppSubject;
  } | null> {
    const limits = await this.platform.limits();
    if (!limits.payAllowed) return null;
    const subject: MiniAppSubject = {
      ownerUserId: site.ownerUserId,
      scene: 'ERRAND',
      shopId: site.id,
      shopName: site.name,
    };
    const runtime = await this.miniApp.payRuntime(subject);
    return runtime ? { runtime, subject } : null;
  }

  async notifyUrl(siteId: number): Promise<string> {
    const site = await resolveSiteUrl(this.prisma);
    if (!site) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，微信支付回调无法送达。请到平台后台「站点设置 → 站点域名」填写本站对外地址',
      );
    }
    return `${site}/api/public/errand/pay/notify/${siteId}`;
  }

  private toCredentials(
    runtime: NonNullable<Awaited<ReturnType<MiniAppService['payRuntime']>>>,
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

  /** JSAPI 下单，返回 `wx.requestPayment` 需要的五个参数；金额只认后端落库的总价。 */
  async prepay(input: {
    site: { ownerUserId: string; id: number; name: string };
    orderNo: string;
    amountCents: number;
    description: string;
    openid: string;
  }): Promise<ErrandPublicPayParams> {
    const limits = await this.platform.limits();
    if (!limits.payAllowed) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '平台已关闭在线收款，本单只能线下结算，请联系店主',
      );
    }
    if (input.amountCents <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '订单金额为 0，不能发起微信支付',
      );
    }
    if (!input.openid) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '登录状态缺少 openid，请退出小程序重新进入后再支付',
      );
    }
    const online = await this.online(input.site);
    if (!online) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '本店尚未配齐微信支付凭据，请在「小程序发布」填写商户号与 APIv3 证书后重试，或改走线下结算',
      );
    }
    const credentials = this.toCredentials(
      online.runtime,
      await this.notifyUrl(input.site.id),
    );
    const prepayId = await this.pay.jsapi(credentials, {
      outTradeNo: input.orderNo,
      description: clip(input.description, 120) || '跑腿服务费',
      amountCents: Math.max(1, Math.round(input.amountCents)),
      openid: input.openid,
    });
    if (!prepayId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信支付下单失败：微信未返回 prepay_id。请核对商户号、APIv3 密钥与证书序列号是否配对',
      );
    }
    return buildJsapiPayParams(credentials, prepayId);
  }

  /**
   * 原路退款：只认微信返回 SUCCESS，否则抛出可重试错误，订单不会提前写成已退款。
   * 同一个 out_refund_no 固定为 ER<订单号>，重试幂等。
   */
  async refund(input: {
    site: { ownerUserId: string; id: number; name: string };
    orderNo: string;
    amountCents: number;
    /** 部分退款金额（分）；缺省=全额。 */
    refundCents?: number;
    /** 幂等退款单号；缺省 ER<订单号>，部分退款传 ERC<订单号>。 */
    outRefundNo?: string;
    reason: string;
  }): Promise<{ refundId: string }> {
    if (input.amountCents <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '退款金额必须大于 0');
    }
    const runtime = await this.miniApp.payRuntime({
      ownerUserId: input.site.ownerUserId,
      scene: 'ERRAND',
      shopId: input.site.id,
      shopName: input.site.name,
    });
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '本店没有可用的微信支付凭据，无法原路退款；请在商户平台人工退款后登记',
      );
    }
    const credentials = this.toCredentials(
      runtime,
      await this.notifyUrl(input.site.id),
    );
    const refundCents = Math.min(
      input.amountCents,
      Math.max(1, Math.round(input.refundCents ?? input.amountCents)),
    );
    const result = await this.pay.refund(credentials, {
      outTradeNo: input.orderNo,
      outRefundNo: (input.outRefundNo || `ER${input.orderNo}`).slice(0, 64),
      reason: clip(input.reason, 80) || '跑腿订单退款',
      totalCents: input.amountCents,
      refundCents,
    });
    return { refundId: result.refundId };
  }

  /** 骑手提现：用店主自己的商户号做商家转账到零钱；权限不足会抛可读错误。 */
  async transferToRider(input: {
    site: { ownerUserId: string; id: number; name: string };
    outBatchNo: string;
    openid: string;
    amountCents: number;
    remark: string;
  }): Promise<{ batchId: string }> {
    if (!input.openid) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '骑手没有可用的微信 openid，无法自动打款；请改用手工打款',
      );
    }
    if (input.amountCents <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '打款金额必须大于 0');
    }
    const runtime = await this.miniApp.payRuntime({
      ownerUserId: input.site.ownerUserId,
      scene: 'ERRAND',
      shopId: input.site.id,
      shopName: input.site.name,
    });
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '本店没有可用的微信支付商户凭据，无法自动打款',
      );
    }
    const notifyUrl = await this.notifyUrl(input.site.id).catch(() => '');
    const credentials = this.toCredentials(runtime, notifyUrl);
    const result = await this.pay.transferBatch(credentials, {
      appId: runtime.appId,
      outBatchNo: input.outBatchNo,
      batchName: '跑腿骑手提现',
      batchRemark: `提现 ${input.outBatchNo}`,
      totalAmount: input.amountCents,
      notifyUrl: notifyUrl || undefined,
      details: [
        {
          outDetailNo: input.outBatchNo,
          amount: input.amountCents,
          remark: input.remark,
          openid: input.openid,
        },
      ],
    });
    if (!result.batchId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信转账未返回批次号，请到商户平台核对后再重试',
      );
    }
    return { batchId: result.batchId };
  }

  /**
   * 解回调报文。siteId 来自回调 URL 路径，凭据只按该站点主体取，
   * 因此错站点回调必然解密失败（GCM 标签不匹配）。
   */
  async decryptNotify(
    siteId: number,
    resource: NotifyResource,
  ): Promise<ErrandPayNotify> {
    const site = await this.prisma.errandSite.findUnique({
      where: { id: Number(siteId) },
      select: { id: true, ownerUserId: true, name: true },
    });
    if (!site)
      throw new BusinessException(ErrorCode.NOT_FOUND, '跑腿站点不存在');
    // 回调解密只看主体凭据，不看 payAllowed：平台中途关闸不能让已付款的报文验不了
    const runtime = await this.miniApp.payRuntime({
      ownerUserId: site.ownerUserId,
      scene: 'ERRAND',
      shopId: site.id,
      shopName: site.name,
    });
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该站点当前没有可用的支付凭据，无法校验回调',
      );
    }
    const { apiV3Key, mchId } = runtime;
    if (Buffer.from(apiV3Key, 'utf8').length !== 32) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'APIv3 密钥长度不对（应为 32 位字符），请在「小程序发布」重新填写',
      );
    }
    let plain = '';
    try {
      plain = decryptApiV3(
        apiV3Key,
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
    const payloadMchId = String(payload.mchid || '');
    if (payloadMchId && payloadMchId !== mchId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '回调商户号与本店主体不一致，请核对微信支付配置',
      );
    }
    return {
      outTradeNo: String(payload.out_trade_no || ''),
      transactionId: String(payload.transaction_id || ''),
      tradeState: String(payload.trade_state || ''),
      amountCents: Math.round(
        Number(payload.amount?.total ?? payload.amount?.payer_total ?? 0),
      ),
      mchId: payloadMchId,
      appId: String(payload.appid || ''),
    };
  }

  static notifyOk() {
    return { code: 'SUCCESS', message: '成功' };
  }
}
