import {
  HEALTH_AGREEMENT_KEYS,
  HEALTH_AGREEMENT_LABELS,
  HEALTH_DIY_BLOCKS,
  HEALTH_SERVICE_ENTRY_KEYS,
  HEALTH_SERVICE_ENTRY_LABELS,
  HEALTH_SHOP_STATUSES,
  type HealthAgreementRow,
  type HealthAgreementSaveBody,
  type HealthAiStaffBindingBody,
  type HealthAiStaffEnabledBody,
  type HealthAiStaffStatus,
  type HealthBannerRow,
  type HealthBannerSaveBody,
  type HealthDiyPageRow,
  type HealthDiyPageSaveBody,
  type HealthOverview,
  type HealthServiceEntryRow,
  type HealthServiceEntrySaveBody,
  type HealthShopInput,
  type HealthShopRow,
  type HealthStaffRow,
  type HealthStaffSaveBody,
  type HealthStaffScope,
  type HealthTheme,
  type HealthTrade,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { HealthPlatformService } from './health.platform.service';
import type { HealthAiAgentRef } from './health.staff.service';
import {
  HEALTH_SCENE,
  audit,
  clip,
  jsonArr,
  makeShopCode,
  normalizeTheme,
  normalizeTrade,
  requireShop,
  requireShopWritable,
  subjectOfShop,
  toIso,
  type HealthShopContext,
} from './health.shared';

/** 店内权限面目录（前端「人员与权限」页签直接用这份，和后端 store 的 scope 键一致）。 */
const STAFF_SCOPES: HealthStaffScope[] = [
  { key: 'overview', label: '经营概览', group: '日常' },
  { key: 'archive', label: '顾客与档案', group: '日常' },
  { key: 'metric', label: '指标与预警', group: '日常' },
  { key: 'care', label: '方案与随访', group: '日常' },
  { key: 'slot', label: '号源与排班', group: '诊疗' },
  { key: 'consult', label: '问诊处理', group: '诊疗' },
  { key: 'program', label: '签约与绿通', group: '诊疗' },
  { key: 'subject', label: '机构与医护', group: '诊疗' },
  { key: 'goods', label: '商品与药品', group: '经营' },
  { key: 'order', label: '订单与售后', group: '经营' },
  { key: 'member', label: '会员与优惠', group: '经营' },
  { key: 'fund', label: '收益与提现', group: '财务' },
  { key: 'promoter', label: '推客分销', group: '财务' },
  { key: 'content', label: '科普与社区', group: '内容' },
  { key: 'review', label: '评价管理', group: '内容' },
  { key: 'stat', label: '经营看板', group: '内容' },
  { key: 'staff', label: '人员与权限', group: '设置' },
  { key: 'shop', label: '店铺设置', group: '设置' },
  { key: 'release', label: '发布与凭据', group: '设置' },
];

/** 店铺与装修、人员权限、店内参数（C1 店主侧）。 */
export class HealthShopService {
  /**
   * AI 客服员工清单钩子（`services.ts` 装配到 AI客服板块）：
   * AI 医护只做引用，健康域不判断人设、不调模型、不查知识库。
   */
  aiAgentList?: (ownerUserId: string) => Promise<HealthAiAgentRef[]>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: HealthPlatformService,
    private readonly miniApp: MiniAppService,
  ) {}

  // ---------- 写映射 ----------

  private async toRow(shop: {
    id: number;
    ownerUserId: string;
    name: string;
    shopCode: string;
    logo: string;
    slogan: string;
    servicePhone: string;
    shareImage: string;
    city: string;
    status: string;
    themeJson: unknown;
    tradeJson: unknown;
    offReason: string;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<HealthShopRow> {
    const subject = subjectOfShop(shop);
    const [appConfigured, payEnabled] = await Promise.all([
      this.miniApp.configured(subject),
      this.miniApp.payEnabled(subject),
    ]);
    return {
      id: shop.id,
      name: shop.name,
      shopCode: shop.shopCode,
      logo: shop.logo,
      slogan: shop.slogan,
      servicePhone: shop.servicePhone,
      status: shop.status as HealthShopRow['status'],
      shareImage: shop.shareImage,
      city: shop.city,
      theme: normalizeTheme(shop.themeJson),
      trade: normalizeTrade(shop.tradeJson),
      appConfigured,
      payEnabled,
      offReason: shop.offReason,
      createdAt: toIso(shop.createdAt),
      updatedAt: toIso(shop.updatedAt),
    };
  }

  private async shopOf(context: HealthShopContext) {
    const shop = await this.prisma.healthShop.findUnique({
      where: { id: context.shop.id },
    });
    if (!shop) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    return shop;
  }

  // ---------- 概览与店铺 ----------

  async shops(user: CurrentUser): Promise<HealthShopRow[]> {
    const owned = await this.prisma.healthShop.findMany({
      where: { ownerUserId: user.userId },
      orderBy: { createdAt: 'asc' },
    });
    const joined = await this.prisma.healthShopStaff.findMany({
      where: { userId: user.userId, status: 'ON' },
      select: { shopId: true },
    });
    const joinedIds = joined
      .map((row) => row.shopId)
      .filter((id) => !owned.some((s) => s.id === id));
    const shared = joinedIds.length
      ? await this.prisma.healthShop.findMany({
          where: { id: { in: joinedIds } },
        })
      : [];
    return Promise.all([...owned, ...shared].map((shop) => this.toRow(shop)));
  }

  /**
   * 开店引导：把「能不能用」拆成可勾选的步骤，每一步都带 next action 与落点，
   * 不做「全部做完才知道差什么」的黑盒。
   */
  async overview(user: CurrentUser): Promise<HealthOverview> {
    const settings = await this.platform.settings();
    const owned = await this.prisma.healthShop.findMany({
      where: { ownerUserId: user.userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!owned.length) {
      return {
        hasShop: false,
        shop: null,
        open: settings.enabled,
        steps: [
          {
            key: 'create',
            label: '创建你的健康管理店铺',
            desc: '一个店铺对应一部独立小程序：自己的微信主体、自己的收款账户。',
            done: false,
            href: '/health',
            action: 'createShop',
          },
          {
            key: 'credentials',
            label: '填写小程序 AppID 与上传密钥',
            desc: '在「发布与凭据」里填，出包时注入，密钥只加密留库。',
            done: false,
            href: '/health?tab=release',
            action: '',
          },
        ],
        counters: {
          customers: 0,
          patients: 0,
          organs: 0,
          practitioners: 0,
          pendingAudits: 0,
          openOrders: 0,
          alerts: 0,
          followups: 0,
        },
      };
    }
    const shop = owned[0];
    const shopId = shop.id;
    const [
      appConfigured,
      customerCount,
      patientCount,
      organCount,
      practitionerCount,
      pendingApplications,
      pendingPractitioners,
      pendingOrgans,
      openOrders,
      openAlerts,
      openFollowups,
    ] = await Promise.all([
      this.miniApp.configured(subjectOfShop(shop)),
      this.prisma.healthCustomer.count({ where: { shopId } }),
      this.prisma.healthPatient.count({ where: { shopId } }),
      this.prisma.healthOrgan.count({ where: { shopId } }),
      this.prisma.healthPractitioner.count({ where: { shopId } }),
      this.prisma.healthApplication.count({
        where: { shopId, auditStatus: 'PENDING' },
      }),
      this.prisma.healthPractitioner.count({
        where: { shopId, auditStatus: 'PENDING' },
      }),
      this.prisma.healthOrgan.count({
        where: { shopId, auditStatus: 'PENDING' },
      }),
      this.prisma.healthOrder.count({
        where: {
          shopId,
          status: { notIn: ['FINISHED', 'CANCELED', 'CLOSED', 'REFUNDED'] },
        },
      }),
      this.prisma.healthAlert.count({ where: { shopId, status: 'OPEN' } }),
      this.prisma.healthFollowupTask.count({
        where: { shopId, status: { in: ['PENDING', 'OVERDUE'] } },
      }),
    ]);
    return {
      hasShop: true,
      shop: await this.toRow(shop),
      open: settings.enabled,
      steps: [
        {
          key: 'create',
          label: '店铺已创建',
          desc: `店铺码 ${shop.shopCode}：顾客扫码进入你这一部小程序。`,
          done: true,
          href: '/health',
          action: '',
        },
        {
          key: 'profile',
          label: '完善店铺资料',
          desc: '名称、Logo、联系电话与主营城市会出现在顾客端首页。',
          done: Boolean(shop.logo && shop.servicePhone),
          href: '/health?tab=shop',
          action: '',
        },
        {
          key: 'subject',
          label: '录入机构与医护',
          desc: '机构入驻、医护认证通过后，才能排班接诊与上架服务。',
          done: practitionerCount > 0,
          href: '/health?tab=subject',
          action: '',
        },
        {
          key: 'credentials',
          label: '填写小程序 AppID 与 AppSecret',
          desc: '在「发布与凭据」里填，用于登录换 openId 与生成小程序码，密钥只加密留库。',
          done: appConfigured,
          href: '/health?tab=release',
          action: '',
        },
      ],
      counters: {
        customers: customerCount,
        patients: patientCount,
        organs: organCount,
        practitioners: practitionerCount,
        pendingAudits:
          pendingApplications + pendingPractitioners + pendingOrgans,
        openOrders,
        alerts: openAlerts,
        followups: openFollowups,
      },
    };
  }

  async create(
    user: CurrentUser,
    body: HealthShopInput,
  ): Promise<HealthShopRow> {
    const settings = await this.platform.requireEnabled();
    const count = await this.prisma.healthShop.count({
      where: { ownerUserId: user.userId, status: { not: 'CLOSED' } },
    });
    if (count >= 1) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '一个账号只能开通一家健康管理店铺；店铺由店主在工作台内自行管理',
      );
    }
    let shopCode = makeShopCode();
    for (let i = 0; i < 5; i += 1) {
      const exists = await this.prisma.healthShop.findUnique({
        where: { shopCode },
      });
      if (!exists) break;
      shopCode = makeShopCode();
    }
    const shop = await this.prisma.healthShop.create({
      data: {
        ownerUserId: user.userId,
        name: clip(body.name, 120),
        shopCode,
        logo: clip(body.logo, 500),
        slogan: clip(body.slogan, 120),
        servicePhone: clip(body.servicePhone, 32),
        shareImage: clip(body.shareImage, 500),
        city: clip(body.city, 60),
        status: 'DRAFT',
        themeJson: normalizeTheme({}),
        tradeJson: normalizeTrade(settings.defaultTrade),
      },
    });
    await this.prisma.healthShopStaff.create({
      data: {
        shopId: shop.id,
        userId: user.userId,
        label: '店主',
        role: 'OWNER',
        scopesJson: ['*'],
        status: 'ON',
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.shop.create',
      `shop=${shop.id} ${shop.name}`,
    );
    return this.toRow(shop);
  }

  async detail(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthShopRow> {
    const context = await requireShop(this.prisma, user, query.shopId);
    return this.toRow(await this.shopOf(context));
  }

  async save(
    user: CurrentUser,
    body: HealthShopInput & { shopId: number },
  ): Promise<HealthShopRow> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    await requireShopWritable(context);
    await this.platform.requireEnabled();
    const shop = await this.prisma.healthShop.update({
      where: { id: context.shop.id },
      data: {
        name: clip(body.name, 120),
        logo: clip(body.logo, 500),
        slogan: clip(body.slogan, 120),
        servicePhone: clip(body.servicePhone, 32),
        shareImage: clip(body.shareImage, 500),
        city: clip(body.city, 60),
      },
    });
    return this.toRow(shop);
  }

  /** 上下线：DRAFT/ONLINE 互转；SUSPENDED/CLOSED 由平台与关闭动作控制，这里不允许改。 */
  async status(
    user: CurrentUser,
    body: { shopId: number; status: string; reason: string },
  ): Promise<HealthShopRow> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    const target = clip(body.status, 24);
    const allowed = HEALTH_SHOP_STATUSES.includes(target as never);
    if (!allowed || (target !== 'DRAFT' && target !== 'ONLINE')) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '店铺只能在自己的工作台里切换「未上线 / 营业中」；停服与关闭分别由平台与「关闭店铺」处理',
      );
    }
    if (context.shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '店铺已被平台停服，请联系平台管理员恢复后再操作',
      );
    }
    if (target === 'ONLINE') {
      await this.platform.requireEnabled();
      const appConfigured = await this.miniApp.configured({
        ownerUserId: context.shop.ownerUserId,
        scene: HEALTH_SCENE,
        shopId: context.shop.id,
        shopName: context.shop.name,
      });
      if (!appConfigured) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '上线前请先在「发布与凭据」填写小程序 AppID 与密钥，顾客扫码后才能进入',
        );
      }
    }
    const shop = await this.prisma.healthShop.update({
      where: { id: context.shop.id },
      data: { status: target },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.shop.status',
      `shop=${shop.id} ${target}`,
    );
    return this.toRow(shop);
  }

  async close(
    user: CurrentUser,
    body: { shopId: number; reason: string },
  ): Promise<HealthShopRow> {
    const context = await requireShop(this.prisma, user, body.shopId);
    if (!context.isOwner) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '只有店主可以关闭店铺');
    }
    const shop = await this.prisma.healthShop.update({
      where: { id: context.shop.id },
      data: {
        status: 'CLOSED',
        offBy: user.userId,
        offReason: clip(body.reason, 200) || '店主主动关闭',
      },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.shop.close',
      `shop=${shop.id}`,
    );
    return this.toRow(shop);
  }

  async tradeSave(
    user: CurrentUser,
    body: Partial<HealthTrade> & { shopId: number },
  ): Promise<HealthShopRow> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    await requireShopWritable(context);
    const current = normalizeTrade(context.shop.tradeJson);
    const patch: Record<string, unknown> = { ...body };
    delete patch.shopId;
    const shop = await this.prisma.healthShop.update({
      where: { id: context.shop.id },
      data: { tradeJson: normalizeTrade({ ...current, ...patch }) as never },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.shop.trade',
      `shop=${shop.id}`,
    );
    return this.toRow(shop);
  }

  async themeSave(
    user: CurrentUser,
    body: Partial<HealthTheme> & { shopId: number },
  ): Promise<HealthShopRow> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    const current = normalizeTheme(context.shop.themeJson);
    const patch: Record<string, unknown> = { ...body };
    delete patch.shopId;
    const shop = await this.prisma.healthShop.update({
      where: { id: context.shop.id },
      data: { themeJson: normalizeTheme({ ...current, ...patch }) as never },
    });
    return this.toRow(shop);
  }

  // ---------- 店内人员 ----------

  async staffList(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthStaffRow[]> {
    const context = await requireShop(this.prisma, user, query.shopId, 'staff');
    const rows = await this.prisma.healthShopStaff.findMany({
      where: { shopId: context.shop.id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.staffRow(row));
  }

  staffScopes(): HealthStaffScope[] {
    return STAFF_SCOPES;
  }

  async staffSave(
    user: CurrentUser,
    body: HealthStaffSaveBody,
  ): Promise<HealthStaffRow> {
    const context = await requireShop(this.prisma, user, body.shopId, 'staff');
    if (!context.isOwner) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '只有店主可以调整成员权限',
      );
    }
    const userId = clip(body.userId, 64);
    if (!userId)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写要授权的账号');
    if (userId === context.shop.ownerUserId && body.role !== 'OWNER') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '店主的岗位不能被降级',
      );
    }
    const scopes = body.scopes.map((item) => clip(item, 40)).filter(Boolean);
    const data = {
      userId,
      label: clip(body.label, 60),
      role: body.role,
      scopesJson: scopes as never,
      status: body.status,
    };
    const row = body.id
      ? await this.prisma.healthShopStaff.update({
          where: { id: body.id },
          data,
        })
      : await this.prisma.healthShopStaff.upsert({
          where: { shopId_userId: { shopId: context.shop.id, userId } },
          create: { shopId: context.shop.id, ...data },
          update: data,
        });
    await audit(
      this.prisma,
      user.userId,
      'health.staff.save',
      `shop=${context.shop.id} user=${userId} role=${body.role}`,
    );
    return this.staffRow(row);
  }

  async staffRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const context = await requireShop(this.prisma, user, body.shopId, 'staff');
    if (!context.isOwner) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '只有店主可以移除成员');
    }
    const row = await this.prisma.healthShopStaff.findFirst({
      where: { id: body.id, shopId: context.shop.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '成员不存在');
    if (row.role === 'OWNER') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '店主不能被移除');
    }
    await this.prisma.healthShopStaff.delete({ where: { id: row.id } });
    return { ok: true, message: '已移除' };
  }

  private staffRow(row: {
    id: number;
    shopId: number;
    userId: string;
    label: string;
    role: string;
    scopesJson: unknown;
    status: string;
    createdAt: Date;
  }): HealthStaffRow {
    return {
      id: row.id,
      shopId: row.shopId,
      userId: row.userId,
      label: row.label,
      role: row.role as HealthStaffRow['role'],
      scopes: jsonArr<string>(row.scopesJson).map((item) => String(item)),
      status: row.status === 'OFF' ? 'OFF' : 'ON',
      createdAt: toIso(row.createdAt),
    };
  }

  // ---------- 轮播 / 公告 / 装修 / 服务入口 / 协议 ----------

  async bannerList(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthBannerRow[]> {
    const context = await requireShop(this.prisma, user, query.shopId, 'shop');
    const rows = await this.prisma.healthBanner.findMany({
      where: { shopId: context.shop.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      image: row.image,
      linkType: row.linkType,
      linkValue: row.linkValue,
      sort: row.sort,
      status: row.status === 'OFF' ? 'OFF' : 'ON',
      startAt: toIso(row.startAt),
      endAt: toIso(row.endAt),
    }));
  }

  async bannerSave(
    user: CurrentUser,
    body: HealthBannerSaveBody,
  ): Promise<HealthBannerRow> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    if (!clip(body.image, 500)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请先上传轮播图');
    }
    const data = {
      title: clip(body.title, 60),
      image: clip(body.image, 500),
      linkType: clip(body.linkType, 20) || 'NONE',
      linkValue: clip(body.linkValue, 500),
      sort: body.sort,
      status: body.status,
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
    };
    const row = body.id
      ? await this.prisma.healthBanner.update({ where: { id: body.id }, data })
      : await this.prisma.healthBanner.create({
          data: { shopId: context.shop.id, ...data },
        });
    return this.bannerRowOf(row.id, context.shop.id);
  }

  private async bannerRowOf(
    id: number,
    shopId: number,
  ): Promise<HealthBannerRow> {
    const row = await this.prisma.healthBanner.findFirst({
      where: { id, shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '轮播不存在');
    return {
      id: row.id,
      title: row.title,
      image: row.image,
      linkType: row.linkType,
      linkValue: row.linkValue,
      sort: row.sort,
      status: row.status === 'OFF' ? 'OFF' : 'ON',
      startAt: toIso(row.startAt),
      endAt: toIso(row.endAt),
    };
  }

  async bannerRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    await this.prisma.healthBanner.deleteMany({
      where: { id: body.id, shopId: context.shop.id },
    });
    return { ok: true, message: '已删除' };
  }

  async noticeList(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(this.prisma, user, query.shopId, 'shop');
    const rows = await this.prisma.healthNotice.findMany({
      where: { shopId: context.shop.id },
      orderBy: [{ sort: 'asc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      sort: row.sort,
      status: row.status === 'OFF' ? ('OFF' as const) : ('ON' as const),
      updatedAt: toIso(row.updatedAt),
    }));
  }

  async noticeSave(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      title: string;
      content: string;
      sort: number;
      status: 'ON' | 'OFF';
    },
  ) {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    const data = {
      title: clip(body.title, 80) || '公告',
      content: clip(body.content, 20000),
      sort: body.sort,
      status: body.status,
    };
    const row = body.id
      ? await this.prisma.healthNotice.update({ where: { id: body.id }, data })
      : await this.prisma.healthNotice.create({
          data: { shopId: context.shop.id, ...data },
        });
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      sort: row.sort,
      status: row.status === 'OFF' ? ('OFF' as const) : ('ON' as const),
      updatedAt: toIso(row.updatedAt),
    };
  }

  async noticeRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    await this.prisma.healthNotice.deleteMany({
      where: { id: body.id, shopId: context.shop.id },
    });
    return { ok: true, message: '已删除' };
  }

  /** 装修：未保存过的页面按「全部块可见 + 默认顺序」回，前端不必自己造默认值。 */
  async diyPageList(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthDiyPageRow[]> {
    const context = await requireShop(this.prisma, user, query.shopId, 'shop');
    const rows = await this.prisma.healthDiyPage.findMany({
      where: { shopId: context.shop.id },
    });
    if (rows.length) {
      return rows.map((row) => ({
        pageKey: row.pageKey,
        title: row.title,
        blocks: jsonArr<HealthDiyPageRow['blocks'][number]>(row.blocksJson),
        publishedAt: toIso(row.publishedAt),
      }));
    }
    return [
      {
        pageKey: 'home',
        title: '首页',
        blocks: HEALTH_DIY_BLOCKS.map((key, index) => ({
          key,
          visible: true,
          sort: index,
          config: {},
        })),
        publishedAt: '',
      },
    ];
  }

  async diyPageSave(
    user: CurrentUser,
    body: HealthDiyPageSaveBody,
  ): Promise<HealthDiyPageRow> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    const blocks = body.blocks
      .map((block) => ({
        key: block.key,
        visible: block.visible !== false,
        sort: block.sort,
        config: block.config ?? {},
      }))
      .sort((a, b) => a.sort - b.sort);
    const pageKey = clip(body.pageKey, 30);
    const row = await this.prisma.healthDiyPage.upsert({
      where: { shopId_pageKey: { shopId: context.shop.id, pageKey } },
      create: {
        shopId: context.shop.id,
        pageKey,
        title: pageKey === 'home' ? '首页' : pageKey,
        blocksJson: blocks as never,
        publishedAt: body.publish ? new Date() : null,
      },
      update: {
        blocksJson: blocks as never,
        ...(body.publish ? { publishedAt: new Date() } : {}),
      },
    });
    return {
      pageKey: row.pageKey,
      title: row.title,
      blocks: jsonArr<HealthDiyPageRow['blocks'][number]>(row.blocksJson),
      publishedAt: toIso(row.publishedAt),
    };
  }

  /**
   * 服务入口：依赖条件在服务端算，端上只负责按 `blockedReason` 置灰。
   * 目前三条硬依赖：在线收款需要商户号、视频问诊需要服务项配置、余额充值需要收款能力。
   */
  async serviceEntryList(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthServiceEntryRow[]> {
    const context = await requireShop(this.prisma, user, query.shopId);
    const shop = await this.shopOf(context);
    const subject = subjectOfShop(shop);
    const [payEnabled, rows] = await Promise.all([
      this.miniApp.payEnabled(subject),
      this.prisma.healthServiceEntry.findMany({ where: { shopId: shop.id } }),
    ]);
    const stored = new Map(rows.map((row) => [row.eKey, row]));
    return HEALTH_SERVICE_ENTRY_KEYS.map((key, index) => {
      const row = stored.get(key);
      const dependsOn = key === 'wallet' ? 'pay' : '';
      const blockedReason =
        dependsOn === 'pay' && !payEnabled
          ? '未配置微信商户号，充值不可用'
          : key === 'tongue' && !shop.tongueAiEnabled
            ? '未在「店铺设置 → 增值服务」开通舌象分析'
            : '';
      return {
        key,
        label: HEALTH_SERVICE_ENTRY_LABELS[key] || key,
        visible: row ? row.visible : true,
        sort: row ? row.sort : index,
        dependsOn,
        blockedReason,
      };
    }).sort((a, b) => a.sort - b.sort);
  }

  async serviceEntrySave(
    user: CurrentUser,
    body: HealthServiceEntrySaveBody,
  ): Promise<HealthServiceEntryRow[]> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    for (const entry of body.entries) {
      await this.prisma.healthServiceEntry.upsert({
        where: { shopId_eKey: { shopId: context.shop.id, eKey: entry.key } },
        create: {
          shopId: context.shop.id,
          eKey: entry.key,
          visible: entry.visible,
          sort: entry.sort,
        },
        update: { visible: entry.visible, sort: entry.sort },
      });
    }
    return this.serviceEntryList(user, { shopId: context.shop.id });
  }

  /** 协议清单：固定六个键，没写过的回键名与空内容，前端直接出编辑框。 */
  async agreementList(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthAgreementRow[]> {
    const context = await requireShop(this.prisma, user, query.shopId);
    const rows = await this.prisma.healthAgreement.findMany({
      where: { shopId: context.shop.id },
    });
    const stored = new Map(rows.map((row) => [row.aKey, row]));
    return HEALTH_AGREEMENT_KEYS.map((key) => {
      const row = stored.get(key);
      return {
        key,
        label: HEALTH_AGREEMENT_LABELS[key] || key,
        title: row?.title || HEALTH_AGREEMENT_LABELS[key] || key,
        content: row?.content || '',
        updatedAt: toIso(row?.updatedAt),
      };
    });
  }

  async agreementSave(
    user: CurrentUser,
    body: HealthAgreementSaveBody,
  ): Promise<HealthAgreementRow> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    const row = await this.prisma.healthAgreement.upsert({
      where: { shopId_aKey: { shopId: context.shop.id, aKey: body.key } },
      create: {
        shopId: context.shop.id,
        aKey: body.key,
        title:
          clip(body.title, 80) || HEALTH_AGREEMENT_LABELS[body.key] || body.key,
        content: body.content,
      },
      update: {
        title:
          clip(body.title, 80) || HEALTH_AGREEMENT_LABELS[body.key] || body.key,
        content: body.content,
      },
    });
    return {
      key: row.aKey as HealthAgreementRow['key'],
      label: HEALTH_AGREEMENT_LABELS[row.aKey] || row.aKey,
      title: row.title,
      content: row.content,
      updatedAt: toIso(row.updatedAt),
    };
  }

  // ---------- AI客服绑定 ----------

  /**
   * 绑定 AI客服站点：本域只存 siteKey，会话与消息全部在 service_desk_*。
   * 未绑定时给「去客服板块建站」的具体落点，并说明为什么必须绑（问诊沟通要留痕）。
   */
  async serviceDeskBind(user: CurrentUser, query: Record<string, unknown>) {
    const context = await requireShop(this.prisma, user, query.shopId);
    const shop = await this.shopOf(context);
    const siteKey = shop.serviceDeskSiteKey.trim();
    const site = siteKey
      ? await this.prisma.serviceDeskSite.findUnique({ where: { siteKey } })
      : null;
    if (!site) {
      return {
        bound: false,
        siteKey: '',
        siteName: '',
        agentCount: 0,
        conversationCount: 0,
        guideText:
          '问诊与客服沟通统一走平台 AI客服：先到「客服与私域 → AI客服」建一个站点，再把站点 Key 填到这里。',
        guideHref: '/service-desk',
      };
    }
    const [agentCount, conversationCount] = await Promise.all([
      this.prisma.serviceDeskAgent.count({
        where: { ownerUserId: site.ownerUserId, status: { not: 'DISABLED' } },
      }),
      this.prisma.serviceDeskConversation.count({ where: { siteId: site.id } }),
    ]);
    return {
      bound: true,
      siteKey: site.siteKey,
      siteName: site.name,
      agentCount,
      conversationCount,
      guideText: site.enabled
        ? '已绑定：顾客在小程序里的问诊与客服对话都会进这个 AI客服站点。'
        : '站点已绑定但当前在客服板块被停用，顾客消息会进不了坐席，请先去客服板块启用。',
      guideHref: '/service-desk',
    };
  }

  async serviceDeskBindSave(
    user: CurrentUser,
    body: { shopId: number; siteKey: string },
  ) {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    const key = clip(body.siteKey, 64);
    if (key) {
      const site = await this.prisma.serviceDeskSite.findUnique({
        where: { siteKey: key },
      });
      if (!site || site.ownerUserId !== context.shop.ownerUserId) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '这个站点 Key 不属于当前店主账号：请用店主本人在「AI客服」里创建的站点',
        );
      }
    }
    await this.prisma.healthShop.update({
      where: { id: context.shop.id },
      data: { serviceDeskSiteKey: key },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.serviceDesk.bind',
      `shop=${context.shop.id} ${key}`,
    );
    return this.serviceDeskBind(user, { shopId: context.shop.id });
  }

  /** 供其它服务取店主主体（避免每处重复拼 scene/shopId）。 */
  async subjectById(shopId: number) {
    const shop = await this.prisma.healthShop.findUnique({
      where: { id: shopId },
    });
    if (!shop) throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在');
    return {
      id: shop.id,
      ownerUserId: shop.ownerUserId,
      name: shop.name,
      shopCode: shop.shopCode,
      status: shop.status,
      themeJson: shop.themeJson,
      tradeJson: shop.tradeJson,
      serviceDeskSiteKey: shop.serviceDeskSiteKey,
    };
  }

  // ---------- AI 医护（只引用 AI客服的纯AI客服员工） ----------

  /**
   * AI 医护配置：本域只存 `ai_staff_enabled`（开关）与 `desk_ai_agent_id`（每位医护绑哪位 AI 客服）。
   * 人设、模型、知识库范围、转人工口径都在「AI客服 → 团队」里维护，这里只列名字给店主选。
   */
  async aiStatus(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<HealthAiStaffStatus> {
    const context = await requireShop(this.prisma, user, query.shopId);
    return this.aiStatusOf(context);
  }

  async aiEnabledSave(
    user: CurrentUser,
    body: HealthAiStaffEnabledBody,
  ): Promise<HealthAiStaffStatus> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    await requireShopWritable(context);
    const enabled = body.enabled === true;
    await this.prisma.healthShop.updateMany({
      where: { id: context.shop.id },
      data: { aiStaffEnabled: enabled },
    });
    await audit(
      this.prisma,
      user.userId,
      'health.staff.ai.enabled',
      `shop=${context.shop.id} enabled=${enabled}`,
    );
    return this.aiStatusOf(context);
  }

  async aiBindingSave(
    user: CurrentUser,
    body: HealthAiStaffBindingBody,
  ): Promise<HealthAiStaffStatus> {
    const context = await requireShop(this.prisma, user, body.shopId, 'shop');
    await requireShopWritable(context);
    const agentId = Math.trunc(Number(body.agentId || 0));
    if (!Number.isFinite(agentId) || agentId < 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择要绑定的 AI 客服',
      );
    }
    if (agentId > 0) {
      const agent = (await this.aiAgentsOf(context.shop.ownerUserId)).find(
        (item) => item.id === agentId,
      );
      if (!agent) {
        throw new BusinessException(
          ErrorCode.NOT_FOUND,
          '要绑定的 AI 客服不存在，或不属于本店铺所属账号',
        );
      }
      if (agent.status !== 'ON') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          `「${agent.name}」当前已停用，请先在 AI客服 → 团队 里启用`,
        );
      }
    }
    const updated = await this.prisma.healthPractitioner.updateMany({
      where: { id: body.practitionerId, shopId: context.shop.id },
      data: { deskAiAgentId: agentId },
    });
    if (!updated.count) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '医护不存在或不属于本店',
      );
    }
    await audit(
      this.prisma,
      user.userId,
      'health.staff.ai.binding',
      `shop=${context.shop.id} practitioner=${body.practitionerId} agent=${agentId}`,
    );
    return this.aiStatusOf(context);
  }

  /** 店铺所属账号的 AI 客服员工清单（含停用项，绑定名要显示得出来）；钩子未装配时按「还没有员工」处理。 */
  private async aiAgentsOf(ownerUserId: string): Promise<HealthAiAgentRef[]> {
    if (!this.aiAgentList) return [];
    const rows = await this.aiAgentList(ownerUserId);
    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      mode: row.mode,
      status: row.status,
      statusLabel: row.statusLabel,
    }));
  }

  private async aiStatusOf(
    context: HealthShopContext,
  ): Promise<HealthAiStaffStatus> {
    const [shop, agents, rows] = await Promise.all([
      this.prisma.healthShop.findUnique({
        where: { id: context.shop.id },
        select: { aiStaffEnabled: true },
      }),
      this.aiAgentsOf(context.shop.ownerUserId),
      this.prisma.healthPractitioner.findMany({
        where: { shopId: context.shop.id },
        orderBy: { id: 'desc' },
        take: 200,
        select: { id: true, name: true, role: true, deskAiAgentId: true },
      }),
    ]);
    const practitioners = rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      agentId: row.deskAiAgentId,
      agentName:
        agents.find((item) => item.id === row.deskAiAgentId)?.name || '',
    }));
    // 顶层 agentId 取「被最多医护绑用的那位」，让设置卡一句话讲清当前主力是谁。
    const usage = new Map<number, number>();
    for (const row of rows) {
      if (row.deskAiAgentId) {
        usage.set(row.deskAiAgentId, (usage.get(row.deskAiAgentId) || 0) + 1);
      }
    }
    const topId = [...usage.entries()].sort(
      (a, b) => b[1] - a[1] || a[0] - b[0],
    )[0]?.[0];
    return {
      enabled: shop?.aiStaffEnabled === true,
      ...(topId ? { agentId: topId } : {}),
      agents: agents
        .filter((item) => item.status === 'ON')
        .map((item) => ({
          id: item.id,
          name: item.name,
          mode: item.mode,
          statusLabel: item.statusLabel,
        })),
      practitioners,
    };
  }
}
