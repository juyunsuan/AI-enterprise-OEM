import {
  type KuaidiEnterprise,
  type KuaidiPayAccount,
  type KuaidiPayAccountSaveBody,
  type KuaidiPublicPayParams,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  WechatPayClient,
  buildJsapiPayParams,
  decryptApiV3,
  type WechatCredentials,
} from '../points/wechat-pay.client';
import { MiniAppCrypto } from '../private-mini/mini-app-crypto';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { KuaidiPlatformService } from './kuaidi.platform.service';
import type { KuaidiSiteService } from './kuaidi.site.service';
import { clip } from './kuaidi.shared';

type AccountRow = {
  id: number;
  ownerUserId: string;
  enterpriseId: number;
  name: string;
  mchId: string;
  apiV3KeyCipher: string;
  certSerial: string;
  privateKeyCipher: string;
  enabled: boolean;
  updatedAt: Date;
};

type NotifyResource = {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
};

export type KuaidiPayRuntime = {
  accountId: number;
  appId: string;
  mchId: string;
  apiV3Key: string;
  certSerial: string;
  privateKey: string;
};

export type KuaidiPayNotify = {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  amountCents: number;
  mchId: string;
  appId: string;
};

/**
 * 微信支付 APIv3（JSAPI）· 企业级收款账户（多个寄件点共用）。
 *
 * 只做「下单 + 回调解密」：退款由店主在微信商户平台操作后回本站登记，
 * 平台不代扣、不代退、不落资金账本。AppID 取账号级小程序主体（scene=EXPRESS, shopId=0），
 * 商户凭据取 `kuaidi_pay_accounts`，按字段独立加密。
 *
 * 签名 / 下单 / 解密收编到 `points/wechat-pay.client.ts` 的统一客户端；本文件保留
 * 多商户号账户的 CRUD 与运行时选择。回调的时间戳防重放在 `kuaidi.public.ts` 校验。
 */
export class KuaidiPayService {
  private readonly crypto = new MiniAppCrypto();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: KuaidiSiteService,
    private readonly miniApp: MiniAppService,
    private readonly platform: KuaidiPlatformService,
    private readonly identity: IdentityService,
    private readonly pay: WechatPayClient,
  ) {}

  private scope(row: { ownerUserId: string; mchId: string }, field: string) {
    return `EXPRESS-PAY:${row.ownerUserId}:${row.mchId}:${field}`;
  }

  private toView(row: AccountRow, enterpriseName: string): KuaidiPayAccount {
    const keyConfigured = Boolean(row.apiV3KeyCipher);
    const certConfigured = Boolean(row.privateKeyCipher);
    return {
      id: row.id,
      name: row.name,
      enterpriseId: row.enterpriseId,
      enterpriseName,
      mchId: row.mchId,
      certSerial: row.certSerial,
      keyConfigured,
      certConfigured,
      enabled: row.enabled,
      complete: Boolean(row.mchId && keyConfigured && certConfigured),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** 已备案企业：收款账户归属企业，多个寄件点共用同一个商户号。 */
  async enterprises(user: CurrentUser): Promise<KuaidiEnterprise[]> {
    const rows = await this.identity.myEnterprises(user.userId);
    return rows.map((row) => ({
      id: row.id,
      name: clip(row.name, 200),
      subjectType: clip(row.subjectType, 16),
    }));
  }

  async accounts(user: CurrentUser): Promise<KuaidiPayAccount[]> {
    const rows = (await this.prisma.kuaidiPayAccount.findMany({
      where: { ownerUserId: user.userId },
      orderBy: [{ id: 'asc' }],
    })) as unknown as AccountRow[];
    if (!rows.length) return [];
    const names = await this.enterpriseNames(
      user.userId,
      rows.map((row) => row.enterpriseId),
    );
    return rows.map((row) =>
      this.toView(row, names.get(row.enterpriseId) ?? ''),
    );
  }

  private async enterpriseNames(ownerUserId: string, ids: number[]) {
    const wanted = [...new Set(ids.filter((id) => id > 0))];
    if (!wanted.length) return new Map<number, string>();
    const rows = await this.prisma.enterpriseProfile.findMany({
      where: { id: { in: wanted }, userId: ownerUserId },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, clip(row.name, 200)]));
  }

  async saveAccount(
    user: CurrentUser,
    body: KuaidiPayAccountSaveBody,
  ): Promise<KuaidiPayAccount> {
    const mchId = String(body.mchId || '').trim();
    if (!/^\d{6,32}$/.test(mchId)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '商户号格式不对：应为微信支付商户平台的纯数字商户号（如 1900000109）',
      );
    }
    const apiV3Key = String(body.apiV3Key ?? '').trim();
    if (apiV3Key && apiV3Key.length !== 32) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'APIv3 密钥应为 32 位字符，请到微信支付商户平台「账户中心 → API 安全」复制',
      );
    }
    const enterpriseId = Number(body.enterpriseId || 0);
    if (enterpriseId > 0) {
      const mine = await this.identity.myEnterprises(user.userId);
      if (!mine.some((row) => row.id === enterpriseId)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选企业不在你名下（需已通过备案认证），请到「企业认证」确认后再选',
        );
      }
    }
    const current =
      body.id > 0
        ? ((await this.prisma.kuaidiPayAccount.findFirst({
            where: { id: body.id, ownerUserId: user.userId },
          })) as unknown as AccountRow | null)
        : null;
    if (body.id > 0 && !current) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '收款账户不存在');
    }
    const dup = await this.prisma.kuaidiPayAccount.findFirst({
      where: {
        ownerUserId: user.userId,
        mchId,
        ...(current ? { NOT: { id: current.id } } : {}),
      },
      select: { id: true },
    });
    if (dup) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该商户号已登记过，请直接编辑原账户，不要重复新增',
      );
    }
    const base = { ownerUserId: user.userId, mchId };
    const data = {
      ownerUserId: user.userId,
      enterpriseId,
      name: clip(body.name, 80) || mchId,
      mchId,
      apiV3KeyCipher: this.keepOr(
        current?.apiV3KeyCipher || '',
        apiV3Key,
        this.scope(base, 'apiV3Key'),
      ),
      certSerial: clip(body.certSerial, 128),
      privateKeyCipher: this.keepOr(
        current?.privateKeyCipher || '',
        String(body.privateKey ?? '').trim(),
        this.scope(base, 'privateKey'),
      ),
      enabled: body.enabled !== false,
    };
    const saved = current
      ? await this.prisma.kuaidiPayAccount.update({
          where: { id: current.id },
          data,
        })
      : await this.prisma.kuaidiPayAccount.create({ data });
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'kuaidi.pay-account.save',
          detail: `account=${saved.id} mch=${mchId}`.slice(0, 500),
        },
      })
      .catch(() => undefined);
    const names = await this.enterpriseNames(user.userId, [enterpriseId]);
    return this.toView(saved, names.get(enterpriseId) ?? '');
  }

  async removeAccount(user: CurrentUser, id: number) {
    const row = await this.prisma.kuaidiPayAccount.findFirst({
      where: { id, ownerUserId: user.userId },
      select: { id: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '收款账户不存在');
    const bound = await this.prisma.kuaidiSite.count({
      where: { ownerUserId: user.userId, payAccountId: row.id },
    });
    if (bound > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `还有 ${bound} 个寄件点在使用该收款账户，请先在寄件点设置里改为其他账户或「默认」`,
      );
    }
    await this.prisma.kuaidiPayAccount.delete({ where: { id: row.id } });
    return { ok: true, message: '收款账户已删除' };
  }

  /** 自检只核对「字段齐不齐 + AppID 是否已配」；真正的签名问题在首笔支付时暴露。 */
  async testAccount(user: CurrentUser, id: number) {
    const row = await this.prisma.kuaidiPayAccount.findFirst({
      where: { id, ownerUserId: user.userId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '收款账户不存在');
    const view = this.toView(row, '');
    const missing: string[] = [];
    if (!view.mchId) missing.push('微信支付商户号');
    if (!view.keyConfigured) missing.push('APIv3 密钥');
    if (!view.certConfigured) missing.push('商户 API 证书私钥');
    if (!row.certSerial) missing.push('证书序列号');
    const app = await this.miniApp.view(
      this.sites.subject({ ownerUserId: user.userId }),
    );
    if (!app.appId) missing.push('小程序 AppID（发布页）');
    if (!view.enabled) missing.push('「启用」开关');
    if (missing.length > 0) {
      return { ok: false, message: `收款账户还缺：${missing.join('、')}` };
    }
    return {
      ok: true,
      message: `商户号 ${view.mchId} 的凭据已齐；运费直接进该微信商户账户，平台不经手`,
    };
  }

  /** 解析站点实际使用的收款账户：站点指定 -> 账号第一个启用账户。 */
  async accountFor(siteId: number, ownerUserId: string) {
    const site = await this.prisma.kuaidiSite.findFirst({
      where: { id: siteId, ownerUserId },
      select: { payAccountId: true },
    });
    if (!site) return null;
    if (site.payAccountId > 0) {
      const row = await this.prisma.kuaidiPayAccount.findFirst({
        where: { id: site.payAccountId, ownerUserId, enabled: true },
      });
      if (row) return row as unknown as AccountRow;
    }
    const fallback = await this.prisma.kuaidiPayAccount.findFirst({
      where: { ownerUserId, enabled: true },
      orderBy: [{ id: 'asc' }],
    });
    return fallback ? (fallback as unknown as AccountRow) : null;
  }

  /** 取运行时凭据：AppID 来自账号级主体，商户凭据来自收款账户。 */
  async runtimeFor(
    siteId: number,
    ownerUserId: string,
  ): Promise<KuaidiPayRuntime | null> {
    const account = await this.accountFor(siteId, ownerUserId);
    if (!account) return null;
    const apiV3Key = this.crypto.decrypt(
      this.scope(account, 'apiV3Key'),
      account.apiV3KeyCipher,
    );
    const privateKey = this.crypto.decrypt(
      this.scope(account, 'privateKey'),
      account.privateKeyCipher,
    );
    if (!apiV3Key || !privateKey || !account.certSerial) return null;
    const app = await this.miniApp.view(this.sites.subject({ ownerUserId }));
    if (!app.appId) return null;
    return {
      accountId: account.id,
      appId: app.appId,
      mchId: account.mchId,
      apiV3Key,
      certSerial: account.certSerial,
      privateKey,
    };
  }

  /** 在线收款是否可用：平台闸门 + 账号有可用收款账户，两个都过才算可用。 */
  async online(
    siteId: number,
    ownerUserId: string,
  ): Promise<KuaidiPayRuntime | null> {
    const limits = await this.platform.limits();
    if (!limits.payAllowed) return null;
    return this.runtimeFor(siteId, ownerUserId);
  }

  async notifyUrl(accountId: number): Promise<string> {
    const site = await resolveSiteUrl(this.prisma);
    if (!site) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，微信支付回调无法送达。请到平台后台「站点设置 → 站点域名」填写本站对外地址',
      );
    }
    return `${site}/api/public/kuaidi/pay/notify/${accountId}`;
  }

  /** 收款账户凭据 → 统一客户端凭据（回调地址按账户路由段，作用域不离开该账户）。 */
  private toCredentials(
    runtime: KuaidiPayRuntime,
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
    siteId: number;
    ownerUserId: string;
    payAccountId: number;
    orderNo: string;
    amountCents: number;
    description: string;
    openid: string;
  }): Promise<KuaidiPublicPayParams> {
    const limits = await this.platform.limits();
    if (!limits.payAllowed) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '平台已关闭在线收款，本店暂只能线下收款，请联系店方',
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
    const runtime = await this.runtimeFor(input.siteId, input.ownerUserId);
    if (
      !runtime ||
      (input.payAccountId > 0 && runtime.accountId !== input.payAccountId)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '收款账户已变更或凭据不完整，请刷新后重新下单；如仍失败请联系店方在「收款账户」补齐商户号与证书',
      );
    }
    const credentials = this.toCredentials(
      runtime,
      await this.notifyUrl(runtime.accountId),
    );
    const prepayId = await this.pay.jsapi(credentials, {
      outTradeNo: input.orderNo,
      description: clip(input.description, 120) || '快递寄件运费',
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
   * 解回调报文。accountId 来自回调 URL 路径，凭据只按这个账户取，
   * 因此错账户回调必然解密失败（GCM 标签不匹配）。
   *
   * 不复用客户端的 `parseNotify`：路由只把密文交给本函数（函数签名不许改），
   * 而 `parseNotify` 需要先下载平台证书做 RSA 验签——企业名下多个商户号账户
   * 各自一份证书，证书拉取失败会把可重试的 400 变成 5xx。时间戳防重放落在
   * `kuaidi.public.ts` 的 notify 路由，商户号一致性仍在这里核对。
   */
  async decryptNotify(
    accountId: number,
    resource: NotifyResource,
  ): Promise<KuaidiPayNotify> {
    const account = await this.prisma.kuaidiPayAccount.findUnique({
      where: { id: Number(accountId) },
    });
    if (!account) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '收款账户不存在');
    }
    const apiV3Key = this.crypto.decrypt(
      this.scope(account, 'apiV3Key'),
      account.apiV3KeyCipher,
    );
    if (Buffer.from(apiV3Key, 'utf8').length !== 32) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'APIv3 密钥长度不对（应为 32 位字符），请在「收款账户」重新填写',
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
    const mchId = String(payload.mchid || '');
    // 能用本账户密钥解开、却报别的商户号：凭据与回调路径张冠李戴，不认
    if (mchId && mchId !== account.mchId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '回调商户号与本账户不一致，请核对收款账户配置',
      );
    }
    return {
      outTradeNo: String(payload.out_trade_no || ''),
      transactionId: String(payload.transaction_id || ''),
      tradeState: String(payload.trade_state || ''),
      amountCents: Math.round(
        Number(payload.amount?.total ?? payload.amount?.payer_total ?? 0),
      ),
      mchId,
      appId: String(payload.appid || ''),
    };
  }

  static notifyOk() {
    return { code: 'SUCCESS', message: '成功' };
  }

  /** 留空即保留原值：密钥只写不读，改一处不必重填全部。 */
  private keepOr(currentCipher: string, next: string, scope: string): string {
    const plain = String(next ?? '').trim();
    if (!plain) return currentCipher || '';
    if (plain.length > 8192) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '凭据内容过长，请确认粘贴的是完整文件内容',
      );
    }
    return this.crypto.encrypt(scope, plain);
  }
}
