import { createHash } from 'node:crypto';
import type {
  DhAppTestResult,
  DhQrcodeResult,
  MiniAppView,
} from '@enterprise/contracts';
import { stableAssetName } from '../common/asset-key';
import type { CurrentUser } from '../auth/current-user';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import { DH_SCENE } from './dh.shared';
import type { DhMemberService } from './dh.member.service';

type SiteRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanSite']['findUnique']>>
>;

/** 数字人小程序：主体凭据、自检与小程序码；源码包统一由「小程序发布说明」直下。 */
export class DhReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
    private readonly member: DhMemberService,
  ) {}

  private subject(site: SiteRow) {
    return this.member.subjectOf(site);
  }

  async miniAppView(user: CurrentUser): Promise<MiniAppView> {
    const site = await this.member.siteOfOwner(user.userId);
    return this.miniApp.view(this.subject(site));
  }

  async miniAppTest(user: CurrentUser): Promise<DhAppTestResult> {
    const site = await this.member.siteOfOwner(user.userId);
    const subject = this.subject(site);
    const result = await this.miniApp.test(subject);
    const view = await this.miniApp.view(subject);
    return {
      ...result,
      payConfigured:
        view.payEnabled && view.payKeyConfigured && view.payCertConfigured,
    };
  }

  /** 小程序码：scene 用站点码，扫码直接进这个站点，不会串站。 */
  async qrcode(user: CurrentUser): Promise<DhQrcodeResult> {
    const site = await this.member.siteOfOwner(user.userId);
    const subject = this.subject(site);
    const runtime = await this.miniApp.requireRuntime(subject);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: site.siteCode.slice(0, 32),
      page: 'pages/index/index',
    });
    const sha256 = createHash('sha256').update(png).digest('hex');
    const uploaded = await this.assets.put({
      ownerUserId: site.userId,
      path: `private-mini/qrcode/${DH_SCENE}/${site.id}/qrcode-${stableAssetName('pages/index/index')}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: `dh-site:${site.id}`,
    });
    const url = this.storage.urlOf(uploaded.key);
    await this.miniApp.saveQrcode(subject, url);
    await this.prisma.auditLog
      .create({
        data: {
          userId: user.userId,
          action: 'dh.qrcode.generate',
          detail: `site=${site.id} ${sha256.slice(0, 12)}`.slice(0, 500),
        },
      })
      .catch(() => undefined);
    return { qrcodeUrl: url, message: '小程序码已生成，可用于海报与分享' };
  }

  /** C 端海报用：站点小程序码，优先复用已生成的那张，避免每次进海报页都调微信接口。 */
  async publicQrcode(site: SiteRow): Promise<{ qrcodeUrl: string }> {
    const subject = this.subject(site);
    const view = await this.miniApp.view(subject);
    if (view.qrcodeUrl) return { qrcodeUrl: view.qrcodeUrl };
    const runtime = await this.miniApp.requireRuntime(subject);
    const png = await this.client.unlimitedQrcode(runtime, {
      scene: site.siteCode.slice(0, 32),
      page: 'pages/index/index',
    });
    const uploaded = await this.assets.put({
      ownerUserId: site.userId,
      path: `private-mini/qrcode/${DH_SCENE}/${site.id}/qrcode-${stableAssetName('pages/index/index')}.png`,
      bytes: png,
      assetType: 'image',
      bizRef: `dh-site:${site.id}`,
    });
    const url = this.storage.urlOf(uploaded.key);
    await this.miniApp.saveQrcode(subject, url);
    return { qrcodeUrl: url };
  }
}
