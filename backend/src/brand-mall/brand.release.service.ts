import { createHash } from 'node:crypto';
import { stableAssetName } from '../common/asset-key';
import type { CurrentUser } from '../auth/current-user';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { BrandShopService } from './brand.shop.service';
import { BRAND_SCENE, clip } from './brand.shared';

/**
 * 品牌商城小程序码：源码包统一由「小程序发布说明」直下，这里只保留小程序码生成。
 * 码归店铺主账号的数字资产，不是平台工件。
 */
export class BrandReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly shops: BrandShopService,
  ) {}

  private subject(shop: {
    ownerUserId: string;
    shopId: number;
    shopName: string;
  }) {
    return {
      ownerUserId: shop.ownerUserId,
      scene: BRAND_SCENE,
      shopId: shop.shopId,
      shopName: shop.shopName,
    };
  }

  async qrcode(user: CurrentUser, shopId: number, page: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const subject = this.subject(shop);
    const runtime = await this.miniApp.requireRuntime(subject);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: shop.shopCode.slice(0, 32),
      page: clip(String(page || '').trim(), 120) || 'pages/index/index',
    });
    const sha256 = createHash('sha256').update(png).digest('hex');
    const uploaded = await this.assets.put({
      ownerUserId: shop.ownerUserId,
      path: `private-mini/qrcode/${BRAND_SCENE}/${shop.shopId}/qrcode-${stableAssetName(page)}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: `brand-shop:${shop.shopId}`,
    });
    const url = this.storage.urlOf(uploaded.key);
    await this.miniApp.saveQrcode(subject, url);
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'brand.qrcode.generate',
          detail: `shop=${shop.shopId} ${sha256.slice(0, 12)}`.slice(0, 500),
        },
      })
      .catch(() => undefined);
    return this.miniApp.view(subject);
  }
}
