import type {
  BrandAdminSettings,
  BrandAdminSettingsBody,
  BrandExpress,
  BrandExpressSaveBody,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { BrandPlatformService } from './brand.platform.service';
import type { BrandStatService } from './brand.stat.service';
import { clip } from './brand.shared';

/**
 * 电商小程序工具·平台侧。
 *
 * 平台不碰用户的钱，也不代管用户的小程序主体：这一层只做三件事——
 * 板块开关与配额、店铺台账与合规停服、预置快递公司（shopId=0，店铺侧只读）。
 * 停服一律保留数据（与 GEO 独立站同口径），恢复营业不需要用户重配。
 */
export class BrandAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: BrandStatService,
    private readonly platform: BrandPlatformService,
    private readonly identity: IdentityService,
  ) {}

  async shops(user: CurrentUser, query: Record<string, unknown>) {
    return this.stats.adminShops(user, query);
  }

  async shopDetail(user: CurrentUser, query: Record<string, unknown>) {
    this.identity.requireAdmin(user);
    const shopId = Number(query.shopId);
    const row = await this.prisma.brandShop.findUnique({
      where: { id: shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    const result = await this.stats.adminShops(user, { keyword: row.shopCode });
    const found = result.list.find((item) => item.id === row.id);
    if (!found) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    return found;
  }

  async shopSuspend(
    user: CurrentUser,
    body: { shopId: number; reason: string },
  ) {
    this.identity.requireAdmin(user);
    const reason = String(body.reason || '').trim();
    if (reason.length < 2) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '停服必须写明原因（会同步展示给店主，便于他整改）',
      );
    }
    return this.stats.suspend(user, Number(body.shopId), reason);
  }

  async shopResume(user: CurrentUser, body: { shopId: number }) {
    this.identity.requireAdmin(user);
    return this.stats.resume(user, Number(body.shopId));
  }

  async settings(user: CurrentUser): Promise<BrandAdminSettings> {
    this.identity.requireAdmin(user);
    return this.platform.settings();
  }

  async saveSettings(user: CurrentUser, body: BrandAdminSettingsBody) {
    return this.platform.saveSettings(user, body);
  }

  async expressList(user: CurrentUser): Promise<BrandExpress[]> {
    this.identity.requireAdmin(user);
    return this.platform.ensureExpressPresets();
  }

  async saveExpress(
    user: CurrentUser,
    body: BrandExpressSaveBody,
  ): Promise<BrandExpress> {
    this.identity.requireAdmin(user);
    const name = String(body.name || '')
      .trim()
      .slice(0, 40);
    if (!name)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '快递公司名称不能为空',
      );
    const data = {
      name,
      code: clip(String(body.code || '').trim(), 40),
      phone: clip(String(body.phone || ''), 30),
      enabled: body.enabled !== false,
      sortOrder: Math.min(9999, Math.max(0, Math.round(body.sortOrder || 0))),
    };
    if (body.id) {
      const row = await this.preset(body.id);
      await this.prisma.brandExpressCompany.update({
        where: { id: row.id },
        data,
      });
      return { id: row.id, shopId: 0, ...data };
    }
    const created = await this.prisma.brandExpressCompany.create({
      data: { shopId: 0, ...data },
    });
    return { id: created.id, shopId: 0, ...data };
  }

  async removeExpress(user: CurrentUser, body: { id: number }) {
    this.identity.requireAdmin(user);
    const row = await this.preset(body.id);
    await this.prisma.brandExpressCompany.delete({ where: { id: row.id } });
    return { ok: true, message: '预置快递已删除' };
  }

  async statOverview(user: CurrentUser) {
    return this.stats.adminOverview(user);
  }

  private async preset(id: number) {
    const row = await this.prisma.brandExpressCompany.findUnique({
      where: { id: Number(id) },
    });
    if (!row || row.shopId !== 0) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '只能维护平台预置的快递公司（店铺自建快递请在店铺设置里改）',
      );
    }
    return row;
  }
}
