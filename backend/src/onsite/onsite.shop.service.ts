import { randomInt } from 'node:crypto';
import {
  ONSITE_SHOP_STATUSES,
  type OnsiteGuideStep,
  type OnsiteOverview,
  type OnsiteShopInput,
  type OnsiteShopRow,
  type OnsiteShopStatus,
  type OnsiteTheme,
  type OnsiteTrade,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { OnsitePlatformService } from './onsite.platform.service';

/** 自营小程序主体场景：上门服务固定 ONSITE，与电商工具（BRAND）分主体、分店铺。 */
export const ONSITE_SCENE = 'ONSITE' as const;

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

/** 与参考源码 `S_config` 的交易参数对应的本站默认值。 */
export const DEFAULT_TRADE: OnsiteTrade = {
  autoCancelMinutes: 15,
  timeUnitMinutes: 30,
  bufferMinutes: 15,
  maxDays: 7,
  allowCrossDay: false,
  bookingLeadMinutes: 30,
  dispatchMode: 'STAFF',
  canTxHours: 24,
  travelFeeEnabled: true,
  travelFeeFallbackCents: 0,
  reviewEnabled: true,
  reviewAuditFirst: false,
  alertEnabled: true,
  alertHelpPhones: [],
  alertNotifyOwner: true,
  alertDedupeMinutes: 10,
  deskSiteKey: '',
  deskEnabled: true,
  scrmCodeId: 0,
  scrmEnabled: true,
};

export const DEFAULT_THEME: OnsiteTheme = {
  themeColor: '#3370ff',
  navigationTitle: '上门服务',
  tabBarLabels: ['首页', '服务', '订单', '我的'],
};

type ShopRow = {
  id: number;
  ownerUserId: string;
  name: string;
  shopCode: string;
  logo: string;
  slogan: string;
  servicePhone: string;
  status: string;
  shareImage: string;
  themeJson: unknown;
  tradeJson: unknown;
  offReason: string;
  createdAt: Date;
  updatedAt: Date;
};

export function shopStatus(value: string): OnsiteShopStatus {
  for (const status of ONSITE_SHOP_STATUSES) {
    if (status === value) return status;
  }
  return 'DRAFT';
}

/** JSON 列在两侧数据库取回的形状不一致（PG 可能给字符串），统一按默认值合并。 */
function mergeJson<T extends object>(value: unknown, base: T): T {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...base };
  return { ...base, ...(raw as Partial<T>) };
}

function normalizeTheme(value: unknown): OnsiteTheme {
  const theme = mergeJson<OnsiteTheme>(value, DEFAULT_THEME);
  const labels = Array.isArray(theme.tabBarLabels)
    ? theme.tabBarLabels.map((item) => String(item || '').slice(0, 8))
    : [];
  return {
    themeColor: /^#[0-9a-fA-F]{6}$/.test(theme.themeColor || '')
      ? theme.themeColor
      : DEFAULT_THEME.themeColor,
    navigationTitle: String(theme.navigationTitle || '').slice(0, 30),
    tabBarLabels:
      labels.filter(Boolean).length === 4
        ? labels
        : [...DEFAULT_THEME.tabBarLabels],
  };
}

function normalizeTrade(value: unknown): OnsiteTrade {
  const trade = mergeJson<OnsiteTrade>(value, DEFAULT_TRADE);
  const intIn = (raw: unknown, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    autoCancelMinutes: intIn(trade.autoCancelMinutes, 1, 120, 15),
    // 时间片粒度必须是 5 的倍数：参考源码按 time_unit 切片，非整倍数会让缓冲判定漂移
    timeUnitMinutes: [5, 10, 15, 30, 60].includes(
      intIn(trade.timeUnitMinutes, 5, 60, 30),
    )
      ? intIn(trade.timeUnitMinutes, 5, 60, 30)
      : 30,
    bufferMinutes: intIn(trade.bufferMinutes, 0, 120, 15),
    maxDays: intIn(trade.maxDays, 1, 60, 7),
    allowCrossDay: trade.allowCrossDay === true,
    bookingLeadMinutes: intIn(trade.bookingLeadMinutes, 0, 1440, 30),
    dispatchMode: trade.dispatchMode === 'PLATFORM' ? 'PLATFORM' : 'STAFF',
    canTxHours: intIn(trade.canTxHours, 0, 168, 24),
    travelFeeEnabled: trade.travelFeeEnabled !== false,
    travelFeeFallbackCents: intIn(trade.travelFeeFallbackCents, 0, 1000000, 0),
    reviewEnabled: trade.reviewEnabled !== false,
    reviewAuditFirst: trade.reviewAuditFirst === true,
    alertEnabled: trade.alertEnabled !== false,
    alertHelpPhones: phoneList(trade.alertHelpPhones),
    alertNotifyOwner: trade.alertNotifyOwner !== false,
    alertDedupeMinutes: intIn(trade.alertDedupeMinutes, 1, 120, 10),
    deskSiteKey: String(trade.deskSiteKey || '')
      .trim()
      .slice(0, 48),
    deskEnabled: trade.deskEnabled !== false,
    scrmCodeId: intIn(trade.scrmCodeId, 0, 1000000, 0),
    scrmEnabled: trade.scrmEnabled !== false,
  };
}

/** 求救号码只留看起来像号码的，避免把备注文字填进来后外呼名单被污染。 */
function phoneList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const phone = String(item ?? '')
      .trim()
      .slice(0, 32);
    if (/^[0-9+\-()\s]{6,20}$/.test(phone) && !out.includes(phone))
      out.push(phone);
    if (out.length >= 10) break;
  }
  return out;
}

function shopCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * 上门服务店铺（= 一个用户自营的上门服务平台实例）。
 *
 * 越权口径：`requireShop` 只按 `ownerUserId` 命中，查不到一律 NOT_FOUND，
 * 不暴露「别人的店铺存在」这件事；主体凭据与在线收款状态由私域底座给出。
 */
export class OnsiteShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly platform: OnsitePlatformService,
  ) {}

  private async toRow(row: ShopRow): Promise<OnsiteShopRow> {
    const subject = {
      ownerUserId: row.ownerUserId,
      scene: ONSITE_SCENE,
      shopId: row.id,
      shopName: row.name,
    };
    const [appView, payEnabled] = await Promise.all([
      this.miniApp.view(subject),
      this.miniApp.payEnabled(subject),
    ]);
    return {
      id: row.id,
      name: row.name,
      shopCode: row.shopCode,
      logo: row.logo,
      slogan: row.slogan,
      servicePhone: row.servicePhone,
      status: shopStatus(row.status),
      shareImage: row.shareImage,
      theme: normalizeTheme(row.themeJson),
      trade: normalizeTrade(row.tradeJson),
      appConfigured: appView.configured,
      payEnabled,
      offReason: row.offReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** 归属校验：后续所有业务服务都从这三个值推导过滤条件（shopId 永不信请求体）。 */
  async requireShop(user: CurrentUser, id: string | number) {
    const shopId = Number(id);
    if (!Number.isInteger(shopId) || shopId <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '店铺 id 不合法');
    }
    const row = await this.prisma.onsiteShop.findFirst({
      where: { id: shopId, ownerUserId: user.userId },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或不属于当前账号',
      );
    }
    return {
      ownerUserId: row.ownerUserId,
      shopId: row.id,
      shopName: row.name,
      shopCode: row.shopCode,
      scene: ONSITE_SCENE,
      status: row.status,
      trade: normalizeTrade(row.tradeJson),
      theme: normalizeTheme(row.themeJson),
    };
  }

  /** 公开通道用：按店铺码反查店铺（不带账号语义，只回可公开字段）。 */
  async findByCode(shopCode: string) {
    const code = String(shopCode || '')
      .trim()
      .toUpperCase()
      .slice(0, 16);
    if (!code) return null;
    const row = await this.prisma.onsiteShop.findUnique({
      where: { shopCode: code },
    });
    return row ? this.publicView(row) : null;
  }

  /** 小程序包内只有 AppID 时（未注入店铺码的历史包）按主体反查店铺。 */
  async findByAppId(appId: string) {
    const value = String(appId || '')
      .trim()
      .slice(0, 64);
    if (!value) return null;
    const app = await this.prisma.miniProgramApp.findUnique({
      where: { appId: value },
      select: { scene: true, shopId: true },
    });
    if (!app || app.scene !== ONSITE_SCENE) return null;
    const row = await this.prisma.onsiteShop.findUnique({
      where: { id: app.shopId },
    });
    return row ? this.publicView(row) : null;
  }

  private publicView(row: {
    id: number;
    ownerUserId: string;
    name: string;
    shopCode: string;
    slogan: string;
    logo: string;
    servicePhone: string;
    status: string;
    themeJson: unknown;
    tradeJson: unknown;
  }) {
    return {
      ownerUserId: row.ownerUserId,
      shopId: row.id,
      shopName: row.name,
      shopCode: row.shopCode,
      slogan: row.slogan,
      logo: row.logo,
      servicePhone: row.servicePhone,
      scene: ONSITE_SCENE,
      status: shopStatus(row.status),
      trade: normalizeTrade(row.tradeJson),
      theme: normalizeTheme(row.themeJson),
    };
  }

  /** 免会话场景（算价、下单、定时任务）按 id 取交易参数。 */
  async tradeById(shopId: number): Promise<OnsiteTrade> {
    const row = await this.prisma.onsiteShop.findUnique({
      where: { id: shopId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    }
    return normalizeTrade(row.tradeJson);
  }

  /**
   * 局部更新交易参数（报警、评价等旁路配置用）。
   *
   * 页签各自只知道自己那几项，整份 `saveTrade` 会把别的页签刚写的键覆盖掉，
   * 所以这里读回归一化后的整份再合并，写回前仍过一遍 `normalizeTrade`。
   */
  async mergeTradeById(
    shopId: number,
    patch: Partial<OnsiteTrade>,
  ): Promise<OnsiteTrade> {
    const row = await this.prisma.onsiteShop.findUnique({
      where: { id: shopId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    }
    const next = normalizeTrade({ ...normalizeTrade(row.tradeJson), ...patch });
    await this.prisma.onsiteShop.update({
      where: { id: shopId },
      data: { tradeJson: next },
    });
    return next;
  }

  /** 出包注入与支付回调都要能按 id 还原主体，不重复查 JSON。 */
  async subjectById(shopId: number) {
    const row = await this.prisma.onsiteShop.findUnique({
      where: { id: shopId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    }
    return {
      ownerUserId: row.ownerUserId,
      shopId: row.id,
      shopName: row.name,
      shopCode: row.shopCode,
      scene: ONSITE_SCENE,
    };
  }

  async shops(user: CurrentUser): Promise<{ list: OnsiteShopRow[] }> {
    const rows = await this.prisma.onsiteShop.findMany({
      where: { ownerUserId: user.userId, status: { not: 'CLOSED' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { list: await Promise.all(rows.map((row) => this.toRow(row))) };
  }

  async shopDetail(user: CurrentUser, id: string) {
    const shop = await this.requireShop(user, id);
    const row = await this.prisma.onsiteShop.findUnique({
      where: { id: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    return this.toRow(row);
  }

  async createShop(
    user: CurrentUser,
    body: OnsiteShopInput,
  ): Promise<OnsiteShopRow> {
    const settings = await this.platform.settings();
    if (!settings.enabled) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '上门服务小程序工具尚未由平台开放，请联系平台管理员在「平台管理后台 → 建站管理」开启',
      );
    }
    const used = await this.prisma.onsiteShop.count({
      where: { ownerUserId: user.userId, status: { not: 'CLOSED' } },
    });
    if (used >= 1) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '一个账号只能开通一家上门服务店铺；需要更换请先在「设置」页关闭现有店铺再开通',
      );
    }
    // 店铺码撞车就重试：它是小程序包里的公开寻址键，唯一性优先于可读性
    let code = shopCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const dup = await this.prisma.onsiteShop.findUnique({
        where: { shopCode: code },
      });
      if (!dup) break;
      code = shopCode();
    }
    const created = await this.prisma.onsiteShop.create({
      data: {
        ownerUserId: user.userId,
        name: body.name.trim().slice(0, 120),
        shopCode: code,
        slogan: body.slogan.trim().slice(0, 120),
        logo: body.logo.trim().slice(0, 500),
        servicePhone: body.servicePhone.trim().slice(0, 32),
        shareImage: body.shareImage.trim().slice(0, 500),
        themeJson: DEFAULT_THEME,
        tradeJson: settings.defaultTrade,
      },
    });
    await this.audit(user.userId, 'onsite.shop.create', created.name);
    return this.toRow(created);
  }

  async updateShop(
    user: CurrentUser,
    id: string,
    body: OnsiteShopInput,
  ): Promise<OnsiteShopRow> {
    const shop = await this.requireShop(user, id);
    const updated = await this.prisma.onsiteShop.update({
      where: { id: shop.shopId },
      data: {
        name: body.name.trim().slice(0, 120),
        slogan: body.slogan.trim().slice(0, 120),
        logo: body.logo.trim().slice(0, 500),
        servicePhone: body.servicePhone.trim().slice(0, 32),
        shareImage: body.shareImage.trim().slice(0, 500),
      },
    });
    await this.audit(user.userId, 'onsite.shop.update', updated.name);
    return this.toRow(updated);
  }

  async saveTrade(
    user: CurrentUser,
    id: string,
    trade: OnsiteTrade,
  ): Promise<OnsiteShopRow> {
    const shop = await this.requireShop(user, id);
    const updated = await this.prisma.onsiteShop.update({
      where: { id: shop.shopId },
      data: { tradeJson: normalizeTrade(trade) },
    });
    await this.audit(user.userId, 'onsite.shop.trade', '更新交易与运营参数');
    return this.toRow(updated);
  }

  async saveTheme(
    user: CurrentUser,
    id: string,
    theme: OnsiteTheme,
  ): Promise<OnsiteShopRow> {
    const shop = await this.requireShop(user, id);
    const updated = await this.prisma.onsiteShop.update({
      where: { id: shop.shopId },
      data: { themeJson: normalizeTheme(theme) },
    });
    await this.audit(user.userId, 'onsite.shop.theme', '更新小程序外观');
    return this.toRow(updated);
  }

  /** 店主自助上下线：SUSPENDED 是平台处置态，店主侧改不动。 */
  async setStatus(user: CurrentUser, id: string, status: string) {
    const shop = await this.requireShop(user, id);
    if (!['DRAFT', 'ONLINE', 'CLOSED'].includes(status)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只能在本店之间切换「未上线 / 营业中 / 已关闭」，停服由平台执行',
      );
    }
    if (status === 'ONLINE') {
      const row = await this.prisma.onsiteShop.findUnique({
        where: { id: shop.shopId },
      });
      const appConfigured = await this.miniApp.configured({
        ownerUserId: shop.ownerUserId,
        scene: ONSITE_SCENE,
        shopId: shop.shopId,
        shopName: shop.shopName,
      });
      if (!appConfigured) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `请先在「发布与凭据」填写小程序 AppID / AppSecret，再开启营业（店铺码 ${row?.shopCode || shop.shopCode}）`,
        );
      }
    }
    const updated = await this.prisma.onsiteShop.update({
      where: { id: shop.shopId },
      data: { status },
    });
    await this.audit(user.userId, 'onsite.shop.status', status);
    return this.toRow(updated);
  }

  /** 关闭店铺（软删）：保留数据与主体凭据删除，配额随之释放。 */
  async closeShop(user: CurrentUser, id: string, reason: string) {
    const shop = await this.requireShop(user, id);
    const updated = await this.prisma.onsiteShop.update({
      where: { id: shop.shopId },
      data: { status: 'CLOSED', offReason: reason.slice(0, 200) },
    });
    await this.miniApp.removeForShop({
      ownerUserId: shop.ownerUserId,
      scene: ONSITE_SCENE,
      shopId: shop.shopId,
      shopName: shop.shopName,
    });
    await this.audit(user.userId, 'onsite.shop.close', reason || '店主关闭');
    return this.toRow(updated);
  }

  /** 总览：有没有店 + 五步开通引导，每一步都带页面链接与动作文案。 */
  async overview(user: CurrentUser): Promise<OnsiteOverview> {
    const [settings, rows] = await Promise.all([
      this.platform.settings(),
      this.prisma.onsiteShop.findMany({
        where: { ownerUserId: user.userId, status: { not: 'CLOSED' } },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
    ]);
    const first = rows[0];
    if (!first) {
      return {
        hasShop: false,
        shop: null,
        open: settings.enabled,
        steps: [
          {
            key: 'shop',
            label: '开通上门服务店铺',
            desc: '一个店铺就是一部独立的小程序：自己的服务、自己的技师、自己的收款账户。',
            done: false,
            href: '/onsite/setting',
            action: '立即开通',
          },
        ],
      };
    }
    const row = await this.toRow(first);
    const subject = {
      ownerUserId: first.ownerUserId,
      scene: ONSITE_SCENE,
      shopId: first.id,
      shopName: first.name,
    };
    const appView = await this.miniApp.view(subject);
    const [serviceCount, staffCount, cityCount] = await Promise.all([
      this.prisma.onsiteService.count({
        where: { shopId: first.id, status: 'ONLINE' },
      }),
      this.prisma.onsiteStaff.count({
        where: { shopId: first.id, status: { in: ['ONLINE', 'OFF_DUTY'] } },
      }),
      this.prisma.onsiteCity.count({
        where: { shopId: first.id, enabled: true },
      }),
    ]);
    const publishHref = '/onsite/publish?panel=wechat';
    const steps: OnsiteGuideStep[] = [
      {
        key: 'service',
        label: '上架至少一门服务',
        desc: '服务就是小程序里的商品：价格、时长、分类与图文详情齐了，顾客才能下单。',
        done: serviceCount > 0,
        href: '/onsite/catalog',
        action: '去上架服务',
      },
      {
        key: 'staff',
        label: '添加可上门的技师',
        desc: '技师通过审核并排好班，订单才有人可派；兼职技师可让本人用手机号自助注册。',
        done: staffCount > 0,
        href: '/onsite/staff',
        action: '去添加技师',
      },
      {
        key: 'city',
        label: '开通服务城市与车费',
        desc: '未开通城市下不了单；车费规则按距离计费，留空则按店铺默认参数兜底。',
        done: cityCount > 0,
        href: '/onsite/setting?panel=city',
        action: '去开通城市',
      },
      {
        key: 'app',
        label: '绑定你的小程序主体',
        desc: '填写自有 AppID / AppSecret 并自检通过，用于登录与小程序码。',
        done: appView.configured && appView.status === 'VERIFIED',
        href: publishHref,
        action: '去填凭据',
      },
      {
        key: 'pay',
        label: '配置微信支付商户号',
        desc: '资金直进你自己的商户账户，平台不经手；未配置时订单按线下收款登记。',
        done: row.payEnabled,
        href: '/onsite/publish?panel=wechat&focus=pay',
        action: '去配商户号',
      },
    ];
    return {
      hasShop: true,
      shop: row,
      open: settings.enabled,
      steps,
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
