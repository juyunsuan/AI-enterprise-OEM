import { createHash } from 'node:crypto';
import { stableAssetName } from '../common/asset-key';
import type { CurrentUser } from '../auth/current-user';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { ErrandSiteService } from './errand.site.service';
import { ERRAND_SCENE, clip } from './errand.shared';

/** 跑腿小程序码：源码包统一由「小程序发布说明」直下，这里只保留小程序码生成。 */
export class ErrandReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly sites: ErrandSiteService,
  ) {}

  /** 小程序码：直接进首页；带页面路径的码可用于分享特定入口。 */
  async qrcode(user: CurrentUser, page: string): Promise<{ url: string }> {
    const ctx = await this.sites.require(user);
    const runtime = await this.miniApp.requireRuntime(ctx.subject);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: 'home',
      page: clip(String(page || '').trim(), 120) || 'pages/index/index',
    });
    const sha256 = createHash('sha256').update(png).digest('hex');
    const uploaded = await this.assets.put({
      ownerUserId: user.userId,
      path: `private-mini/qrcode/${ERRAND_SCENE}/${ctx.row.id}/qrcode-${stableAssetName(page)}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: 'errand-qrcode',
    });
    const url = this.storage.urlOf(uploaded.key);
    await this.miniApp.saveQrcode(ctx.subject, url);
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'errand.qrcode.generate',
          detail: sha256.slice(0, 12).slice(0, 500),
        },
      })
      .catch(() => undefined);
    return { url };
  }
}
