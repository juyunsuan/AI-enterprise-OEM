import type {
  OnsiteServiceConfig,
  OnsiteServiceConfigInput,
  OnsiteServiceOptions,
} from '@enterprise/contracts';
import { ErrorCode } from '../common/error-code';
import { BusinessException } from '../common/business.exception';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { OnsiteShopService } from './onsite.shop.service';

/**
 * 在线客服与私域 SCRM 的对接（上门服务小程序的两个入口）。
 *
 * 两条链路刻意做成互不依赖的独立判定，这是产品口径而不是偷懒：
 * - 客服只存 AI 客服站点的 `siteKey` 引用，会话、坐席、AI 模式全在 service-desk 域里，
 *   本域不建任何会话表；
 * - SCRM 只存营销工具·企业微信活码的 id 引用，加微、打标、SOP 全在 wecom-scrm 域里；
 * - 平台管理员关掉 `service-desk`，SCRM 入口照常；关掉 `wecom-scrm`，客服入口照常。
 *   可用性判定只看「各自板块开关 + 各自被绑对象状态」，因此一侧的表读不到、站点被停用，
 *   都不会让另一侧的配置读写失败。
 * 配置写回必须走 `mergeTradeById`：交易页签还装着排期、车费、报警等参数，整块覆盖会清掉它们。
 */

/** 被绑对象自身的可用性 + 板块开关，合成一句能落到下一步的提示。 */
type Availability = {
  available: boolean;
  hint: string;
};

const DESK_FEATURE_CODE = 'service-desk';
const DESK_HREF = '/service-desk';
const SCRM_FEATURE_CODE = 'wecom-scrm';
const SCRM_HREF = '/marketing-tools?tab=wecom-scrm';

export class OnsiteAssistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
    /** 只借功能开关做可用性判定，不反向依赖两个板块的实现类。 */
    private readonly toggle: {
      isOpen(code: string, orgUserId: string): Promise<boolean>;
    },
  ) {}

  private async deskFeatureOpen(ownerUserId: string): Promise<boolean> {
    return this.toggle.isOpen(DESK_FEATURE_CODE, ownerUserId);
  }

  private async scrmFeatureOpen(ownerUserId: string): Promise<boolean> {
    return this.toggle.isOpen(SCRM_FEATURE_CODE, ownerUserId);
  }

  /** 客服站点可用性：板块开着、key 有值、站点属于本账号且未停用，才允许出现入口。 */
  private async deskState(
    ownerUserId: string,
    siteKey: string,
  ): Promise<Availability & { name: string }> {
    if (!siteKey) {
      return {
        name: '',
        available: false,
        hint: `尚未绑定客服站点，可在「AI客服 › 站点管理」新建后选择（${DESK_HREF}）`,
      };
    }
    if (!(await this.deskFeatureOpen(ownerUserId))) {
      return {
        name: '',
        available: false,
        hint: '「AI客服」板块当前未对本站开放，请联系平台管理员开启；此项不影响企业微信 SCRM 对接',
      };
    }
    const site = await this.prisma.serviceDeskSite.findFirst({
      where: { siteKey, ownerUserId },
      select: { name: true, enabled: true },
    });
    if (!site) {
      return {
        name: '',
        available: false,
        hint: `绑定的客服站点已不存在（可能已删除），请在「AI客服 › 站点管理」重新选择（${DESK_HREF}）`,
      };
    }
    if (!site.enabled) {
      return {
        name: site.name,
        available: false,
        hint: `客服站点「${site.name}」已停用，请在「AI客服 › 站点管理」启用或换绑（${DESK_HREF}）`,
      };
    }
    return { name: site.name, available: true, hint: '' };
  }

  /** 活码可用性：板块开着、id 有值、活码属于本账号且处于启用中。 */
  private async scrmState(
    ownerUserId: string,
    codeId: number,
  ): Promise<Availability & { name: string; qrUrl: string }> {
    if (!codeId) {
      return {
        name: '',
        qrUrl: '',
        available: false,
        hint: `尚未绑定企微活码，可在「营销工具 › 企业微信 SCRM › 活码」新建后选择（${SCRM_HREF}）`,
      };
    }
    if (!(await this.scrmFeatureOpen(ownerUserId))) {
      return {
        name: '',
        qrUrl: '',
        available: false,
        hint: '「企业微信 SCRM」板块当前未对本站开放，请联系平台管理员开启；此项不影响 AI 客服',
      };
    }
    const code = await this.prisma.scrmCode.findFirst({
      where: { id: codeId, orgUserId: ownerUserId },
      select: { name: true, qrUrl: true, status: true },
    });
    if (!code) {
      return {
        name: '',
        qrUrl: '',
        available: false,
        hint: `绑定的活码已不存在（可能已删除），请在「营销工具 › 企业微信 SCRM › 活码」重新选择（${SCRM_HREF}）`,
      };
    }
    if (code.status !== 'ACTIVE' || !code.qrUrl) {
      return {
        name: code.name,
        qrUrl: code.qrUrl,
        available: false,
        hint: code.qrUrl
          ? `活码「${code.name}」当前为${code.status === 'PAUSED' ? '暂停' : '不可用'}状态，请在 SCRM 活码列表启用（${SCRM_HREF}）`
          : `活码「${code.name}」还没有企微二维码，请先在 SCRM 完成同步或换绑（${SCRM_HREF}）`,
      };
    }
    return { name: code.name, qrUrl: code.qrUrl, available: true, hint: '' };
  }

  async config(
    user: CurrentUser,
    shopId: string,
  ): Promise<OnsiteServiceConfig> {
    const shop = await this.shops.requireShop(user, shopId);
    const trade = await this.shops.tradeById(shop.shopId);
    const [desk, scrm] = await Promise.all([
      this.deskState(user.userId, trade.deskSiteKey),
      this.scrmState(user.userId, trade.scrmCodeId),
    ]);
    return {
      deskEnabled: trade.deskEnabled,
      deskSiteKey: trade.deskSiteKey,
      deskSiteName: desk.name,
      deskAvailable: desk.available,
      deskHint: desk.hint,
      scrmEnabled: trade.scrmEnabled,
      scrmCodeId: trade.scrmCodeId,
      scrmCodeName: scrm.name,
      scrmQrUrl: scrm.qrUrl,
      scrmAvailable: scrm.available,
      scrmHint: scrm.hint,
    };
  }

  /**
   * 保存绑定：两侧各自校验，只拦「绑了不存在或不属于本站的对象」，
   * 板块开着与否不作为保存条件（否则关掉一侧会连带挡住另一侧的维护）。
   */
  async save(
    user: CurrentUser,
    shopId: string,
    body: OnsiteServiceConfigInput,
  ): Promise<OnsiteServiceConfig> {
    const shop = await this.shops.requireShop(user, shopId);
    const deskSiteKey = String(body.deskSiteKey || '').trim();
    if (deskSiteKey) {
      const site = await this.prisma.serviceDeskSite.findFirst({
        where: { siteKey: deskSiteKey, ownerUserId: user.userId },
        select: { id: true },
      });
      if (!site) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `客服站点「${deskSiteKey}」不存在或不属于本站账号，请到「AI客服 › 站点管理」选择本站站点（${DESK_HREF}）`,
        );
      }
    }
    const scrmCodeId = Number(body.scrmCodeId || 0);
    if (scrmCodeId) {
      const code = await this.prisma.scrmCode.findFirst({
        where: { id: scrmCodeId, orgUserId: user.userId },
        select: { id: true },
      });
      if (!code) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `活码 #${scrmCodeId} 不存在或不属于本站账号，请到「营销工具 › 企业微信 SCRM › 活码」选择本站活码（${SCRM_HREF}）`,
        );
      }
    }
    await this.shops.mergeTradeById(shop.shopId, {
      deskSiteKey,
      deskEnabled: body.deskEnabled !== false,
      scrmCodeId,
      scrmEnabled: body.scrmEnabled !== false,
    });
    await this.audit(
      user.userId,
      'onsite.assist.save',
      `客服 ${deskSiteKey || '未绑定'}，SCRM 活码 #${scrmCodeId || 0}`,
    );
    return this.config(user, shopId);
  }

  /**
   * 下拉候选：本域直读两张表，前端不跨板块调 service-desk / wecom-scrm 的接口，
   * 这样即便那两个板块的菜单对企业隐藏，店主仍能把入口配好等管理员开启。
   */
  async options(
    user: CurrentUser,
    shopId: string,
  ): Promise<OnsiteServiceOptions> {
    await this.shops.requireShop(user, shopId);
    const [sites, codes] = await Promise.all([
      this.prisma.serviceDeskSite.findMany({
        where: { ownerUserId: user.userId },
        orderBy: { id: 'asc' },
        take: 50,
        select: { siteKey: true, name: true, enabled: true },
      }),
      this.prisma.scrmCode.findMany({
        where: { orgUserId: user.userId },
        orderBy: { id: 'desc' },
        take: 50,
        select: { id: true, name: true, qrUrl: true, status: true },
      }),
    ]);
    return {
      deskSites: sites,
      scrmCodes: codes,
      deskHref: DESK_HREF,
      scrmHref: SCRM_HREF,
    };
  }

  /**
   * 小程序启动配置里的两个入口：各自独立算，一侧不可用不影响另一侧下发。
   * 客服窗是本站同域的 `/embed/service-desk?key=`，地址由端上按 apiBase 拼，避免写死域名。
   */
  async publicEntry(
    ownerUserId: string,
    trade: {
      deskEnabled: boolean;
      deskSiteKey: string;
      scrmEnabled: boolean;
      scrmCodeId: number;
    },
  ): Promise<{
    desk: { enabled: boolean; siteKey: string };
    scrm: { enabled: boolean; qrUrl: string; name: string };
  }> {
    const [desk, scrm] = await Promise.all([
      this.deskState(ownerUserId, trade.deskSiteKey),
      this.scrmState(ownerUserId, trade.scrmCodeId),
    ]);
    const deskOn = trade.deskEnabled && desk.available;
    const scrmOn = trade.scrmEnabled && scrm.available;
    return {
      desk: { enabled: deskOn, siteKey: deskOn ? trade.deskSiteKey : '' },
      scrm: {
        enabled: scrmOn,
        qrUrl: scrmOn ? scrm.qrUrl : '',
        name: scrmOn ? scrm.name : '',
      },
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
