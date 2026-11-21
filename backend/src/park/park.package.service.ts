import { createHash } from 'node:crypto';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import {
  assertPackageSize,
  buildStoreZip,
  collectTemplate,
  templateDirFrom,
} from '../private-mini/package-builder';
import type { StorageService } from '../storage/storage.service';
import type { ParkSiteService } from './park.site.service';

/**
 * 园区小程序源码分发包：与租赁/答题同一口径——平台只输出统一模板源码（zip），
 * 不含园区码、AppID 等账号参数，用户在微信开发者工具里按发布说明自行填写。
 */
export class ParkPackageService {
  constructor(
    private readonly sites: ParkSiteService,
    private readonly storage: StorageService,
  ) {}

  async download(user: CurrentUser, siteId: number) {
    await this.sites.requireSite(user, siteId);
    const dir = templateDirFrom('MINIPROGRAM_PARK_DIR', 'park-miniprogram');
    const entries: Awaited<ReturnType<typeof collectTemplate>> =
      await collectTemplate(dir).catch(
        () => [] as Awaited<ReturnType<typeof collectTemplate>>,
      );
    if (!entries.some((entry) => entry.name === 'app.json')) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `园区小程序模板暂不可用（模板目录 ${dir}），请确认仓库内 park-miniprogram/ 完整`,
      );
    }
    const bytes = buildStoreZip(entries);
    assertPackageSize(bytes.length, entries.length);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const fileName = `park-miniprogram-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}.zip`;
    const stored = await this.storage.put(
      `enterprise/${user.userId}/mini-source/park/${sha256.slice(0, 16)}.zip`,
      bytes,
    );
    return {
      url: this.storage.urlOf(stored.key),
      fileName,
      fileSize: bytes.length,
      sha256,
    };
  }
}
