import { createHash } from 'node:crypto';
import type {
  MiniAppInput,
  MiniAppTestResult,
  MiniAppView,
} from '@enterprise/contracts';
import { stableAssetName } from '../common/asset-key';
import type { CurrentUser } from '../auth/current-user';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import { MP_MARKET_SCENE } from './mp.pay.service';
import type { MpMarketService } from './mp.market.service';
import { textOf } from './mp.shared';

const clip = (value: unknown, max: number) =>
  textOf(value).trim().slice(0, max);

type MarketSubject = {
  ownerUserId: string;
  scene: typeof MP_MARKET_SCENE;
  shopId: number;
  shopName: string;
};

/**
 * 多店铺商城小程序：主体凭据、自检与小程序码。
 * 源码包统一由「小程序发布说明」直下，这里不再维护出包台账与直传微信。
 */
export class MpReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly markets: MpMarketService,
  ) {}

  private async subject(ownerUserId: string): Promise<MarketSubject> {
    const market = await this.markets.require(ownerUserId);
    return {
      ownerUserId: market.ownerUserId,
      scene: MP_MARKET_SCENE,
      shopId: market.id,
      shopName: market.name,
    };
  }

  async appDetail(user: CurrentUser): Promise<MiniAppView> {
    return this.miniApp.view(await this.subject(user.userId));
  }

  async appSave(user: CurrentUser, body: MiniAppInput): Promise<MiniAppView> {
    return this.miniApp.save(await this.subject(user.userId), body);
  }

  async appTest(
    user: CurrentUser,
  ): Promise<MiniAppTestResult & { nextAction: string; serverIp: string }> {
    const subject = await this.subject(user.userId);
    try {
      const result = await this.miniApp.test(subject);
      return {
        ...result,
        nextAction: result.ok
          ? ''
          : '检查 AppID / AppSecret 是否来自同一个小程序主体，并确认已把服务器出口 IP 加入白名单',
        serverIp: serverIp(),
      };
    } catch (error) {
      return {
        ok: false,
        shopName: subject.shopName,
        message: error instanceof Error ? error.message : '自检失败',
        nextAction: '到「小程序发布」补齐 AppID 与 AppSecret 后再试',
        serverIp: serverIp(),
      };
    }
  }

  /** 支付凭据自检：只核对字段是否齐全，不发起真实下单。 */
  async payTest(user: CurrentUser) {
    const subject = await this.subject(user.userId);
    const view = await this.miniApp.view(subject);
    const missing: string[] = [];
    if (!view.appId) missing.push('小程序 AppID');
    if (!view.mchId) missing.push('微信支付商户号');
    if (!view.payKeyConfigured) missing.push('APIv3 密钥');
    if (!view.payCertConfigured) missing.push('商户 API 证书私钥');
    if (!view.payEnabled) missing.push('「开启在线收款」开关');
    if (missing.length > 0) {
      return { ok: false, message: `支付配置还缺：${missing.join('、')}` };
    }
    return {
      ok: true,
      message: `商户号 ${view.mchId} 的凭据已齐；订单款项直接进你自己的微信商户账户，平台不经手`,
    };
  }

  async qrcode(user: CurrentUser, page: string): Promise<MiniAppView> {
    const subject = await this.subject(user.userId);
    const runtime = await this.miniApp.requireRuntime(subject);
    const market = await this.markets.require(user.userId);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: market.shopCode.slice(0, 32),
      page: clip(String(page || '').trim(), 120) || 'pages/index/index',
    });
    const sha256 = createHash('sha256').update(png).digest('hex');
    const uploaded = await this.assets.put({
      ownerUserId: market.ownerUserId,
      path: `private-mini/qrcode/${MP_MARKET_SCENE}/${market.id}/qrcode-${stableAssetName(page)}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: `mp-market:${market.id}`,
    });
    await this.miniApp.saveQrcode(subject, this.storage.urlOf(uploaded.key));
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'marketplace.qrcode.generate',
          detail: `market=${market.id} ${sha256.slice(0, 12)}`.slice(0, 500),
        },
      })
      .catch(() => undefined);
    return this.miniApp.view(subject);
  }
}

function serverIp() {
  return clip(process.env.PUBLIC_SERVER_IP || '', 64);
}
