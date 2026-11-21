import { stableAssetName } from '../common/asset-key';
import type { CurrentUser } from '../auth/current-user';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { HealthShopService } from './health.shop.service';
import {
  HEALTH_SCENE,
  audit,
  requireShop,
  subjectOfShop,
} from './health.shared';

/** 健康管理小程序码：源码包统一由「小程序发布说明」直下，这里只保留小程序码生成。 */
export class HealthReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly shops: HealthShopService,
  ) {}

  /** 小程序码：scene 固定为店铺码，扫码进店不需要用户先登录。 */
  async qrcode(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(
      this.prisma,
      user,
      query.shopId,
      'release',
    );
    const shop = await this.shops.subjectById(context.shop.id);
    const subject = subjectOfShop(shop);
    const page =
      (typeof query.page === 'string' ? query.page.trim() : '') ||
      'pages/index/index';
    const scene =
      (typeof query.scene === 'string' ? query.scene.trim() : '') ||
      shop.shopCode;
    const runtime = await this.miniApp.requireRuntime(subject);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: scene.slice(0, 32),
      page: page.slice(0, 120),
    });
    const uploaded = await this.assets.put({
      ownerUserId: shop.ownerUserId,
      path: `private-mini/qrcode/${HEALTH_SCENE}/${context.shop.id}/qrcode-${stableAssetName(page)}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: `health-shop:${context.shop.id}`,
    });
    const url = this.storage.urlOf(uploaded.key);
    await this.miniApp.saveQrcode(subject, url);
    await audit(
      this.prisma,
      user.userId,
      'health.qrcode.generate',
      `shop=${context.shop.id} ${page}`,
    );
    return {
      url,
      page,
      scene,
      message: '小程序码已生成：扫码进入本店小程序首页，scene 为店铺码',
    };
  }
}
