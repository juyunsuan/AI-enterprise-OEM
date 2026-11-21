import { createHash } from 'node:crypto';
import {
  PRIVATE_MINI_SCENES,
  type PrivateMiniScene,
} from '@enterprise/contracts';
import { stableAssetName } from '../common/asset-key';
import type { CurrentUser } from '../auth/current-user';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { OnsiteShopService } from './onsite.shop.service';

const releaseSubject = (
  ownerUserId: string,
  scene: PrivateMiniScene,
  shopId: number,
  shopName: string,
) => ({ ownerUserId, scene, shopId, shopName });

function sceneOf(value: string): PrivateMiniScene {
  for (const scene of PRIVATE_MINI_SCENES) {
    if (scene === value) return scene;
  }
  return 'ONSITE';
}

/** 上门服务小程序码：源码包统一由「小程序发布说明」直下，这里只保留小程序码生成。 */
export class OnsiteReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly shops: OnsiteShopService,
  ) {}

  async qrcodeFor(user: CurrentUser, shopId: string, page: string) {
    const shop = await this.shops.requireShop(user, shopId);
    return this.qrcodeForShop(shop, page);
  }

  /** 公开通道/代理端用：店铺行已由调用方校验归属，这里只负责取码。 */
  async qrcodeForShop(
    shop: {
      ownerUserId: string;
      scene: string;
      shopId: number;
      shopName: string;
      shopCode: string;
    },
    page: string,
  ) {
    const subject = releaseSubject(
      shop.ownerUserId,
      sceneOf(shop.scene),
      shop.shopId,
      shop.shopName,
    );
    const runtime = await this.miniApp.requireRuntime(subject);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: shop.shopCode.slice(0, 32),
      page:
        String(page || '')
          .trim()
          .slice(0, 120) || 'pages/index/index',
    });
    return { shop, png };
  }

  async qrcode(user: CurrentUser, shopId: string, page: string) {
    const { shop, png } = await this.qrcodeFor(user, shopId, page);
    const subject = releaseSubject(
      shop.ownerUserId,
      sceneOf(shop.scene),
      shop.shopId,
      shop.shopName,
    );
    const sha256 = createHash('sha256').update(png).digest('hex');
    const uploaded = await this.assets.put({
      ownerUserId: shop.ownerUserId,
      path: `private-mini/qrcode/${shop.scene}/${shop.shopId}/qrcode-${stableAssetName(page)}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: `onsite-shop:${shop.shopId}`,
    });
    const url = this.storage.urlOf(uploaded.key);
    await this.miniApp.saveQrcode(subject, url);
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'onsite.qrcode.generate',
          detail:
            `${shop.scene} shop=${shop.shopId} ${sha256.slice(0, 12)}`.slice(
              0,
              500,
            ),
        },
      })
      .catch(() => undefined);
    return { qrcodeUrl: url };
  }
}
