import { createHash } from 'node:crypto';
import { stableAssetName } from '../common/asset-key';
import type { CurrentUser } from '../auth/current-user';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { KuaidiSiteService } from './kuaidi.site.service';
import { KUAIDI_SCENE, clip } from './kuaidi.shared';

/** 快递寄件小程序码：源码包统一由「小程序发布说明」直下，这里只保留小程序码生成。 */
export class KuaidiReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly sites: KuaidiSiteService,
  ) {}

  private subject(user: CurrentUser) {
    return this.sites.subject({ ownerUserId: user.userId });
  }

  /** 小程序码：账号级码直接进寄件点列表；带 `pages/index/index?site=码` 的码可直达某点。 */
  async qrcode(user: CurrentUser, page: string) {
    const subject = this.subject(user);
    const runtime = await this.miniApp.requireRuntime(subject);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: 'home',
      page: clip(String(page || '').trim(), 120) || 'pages/index/index',
    });
    const sha256 = createHash('sha256').update(png).digest('hex');
    const uploaded = await this.assets.put({
      ownerUserId: user.userId,
      path: `private-mini/qrcode/${KUAIDI_SCENE}/${user.userId}/qrcode-${stableAssetName(page)}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: 'kuaidi-qrcode',
    });
    const url = this.storage.urlOf(uploaded.key);
    await this.miniApp.saveQrcode(subject, url);
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'kuaidi.qrcode.generate',
          detail: sha256.slice(0, 12).slice(0, 500),
        },
      })
      .catch(() => undefined);
    return this.miniApp.view(subject);
  }
}
