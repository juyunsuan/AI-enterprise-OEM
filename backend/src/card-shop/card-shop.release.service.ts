import { createHash } from 'node:crypto';
import { stableAssetName } from '../common/asset-key';
import type { CurrentUser } from '../auth/current-user';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { CardShopSiteService } from './card-shop.site.service';
import { CARD_SHOP_SCENE, clip } from './card-shop.shared';

/**
 * 卡密商城小程序码：源码包统一由「小程序发布说明」直下，这里只保留小程序码生成。
 * 码归站点主账号的数字资产，不是平台工件。
 */
export class CardShopReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly sites: CardShopSiteService,
  ) {}

  private subject(site: { siteId: number; ownerUserId: string; name: string }) {
    return {
      ownerUserId: site.ownerUserId,
      scene: CARD_SHOP_SCENE,
      shopId: site.siteId,
      shopName: site.name,
    };
  }

  async qrcode(user: CurrentUser, siteId: number, page: string) {
    const site = await this.sites.requireSite(user, siteId);
    const subject = this.subject(site);
    const runtime = await this.miniApp.requireRuntime(subject);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: site.siteCode.slice(0, 32),
      page: clip(String(page || '').trim(), 120) || 'pages/index/index',
    });
    const sha256 = createHash('sha256').update(png).digest('hex');
    const uploaded = await this.assets.put({
      ownerUserId: site.ownerUserId,
      path: `private-mini/qrcode/${CARD_SHOP_SCENE}/${site.siteId}/qrcode-${stableAssetName(page)}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: `card-shop-site:${site.siteId}`,
    });
    const url = this.storage.urlOf(uploaded.key);
    await this.miniApp.saveQrcode(subject, url);
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'cardShop.qrcode.generate',
          detail: `site=${site.siteId} ${sha256.slice(0, 12)}`.slice(0, 500),
        },
      })
      .catch(() => undefined);
    return this.miniApp.view(subject);
  }
}
