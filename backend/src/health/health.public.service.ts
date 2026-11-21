import { createHash, createSign, randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma';
import {
  HEALTH_ORDER_BIZ_TYPE_LABELS,
  HEALTH_SERVICE_ENTRY_KEYS,
  type HealthTheme,
  type HealthTrade,
} from '@enterprise/contracts';
import { pageOf, pageParam } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import {
  issueCustomerToken,
  type CustomerTokenPayload,
} from '../private-mini/customer-token';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  WechatCredentials,
  WechatPayClient,
  WechatTransaction,
} from '../points/wechat-pay.client';
import type { ServiceDeskService } from '../service-desk/service-desk.service';
import {
  pickRule,
  ruleMatchesBizType,
  splitShares,
  type CommissionRuleLike,
} from './health.commission.engine';
import type { HealthCrypto } from './health-crypto';
import type { HealthMonitorService } from './health.monitor.service';
import { quoteOrder, type PriceQuote } from './health.order.pricing';
import type { HealthPlatformService } from './health.platform.service';
import {
  audit,
  cents,
  clip,
  jsonArr,
  jsonObj,
  makeNo,
  normalizeTheme,
  normalizeTrade,
  strOf,
  subjectOfShop,
  toIso,
  yuan,
} from './health.shared';
import { ageOf, maskPhone } from './health.views';
import { toolOpen } from '../tool-launch/tool-launch.holder';

/** C 端可见的店铺视图（bootstrap 与各接口共用）。 */
export type HealthPublicShop = {
  shopId: number;
  ownerUserId: string;
  name: string;
  shopCode: string;
  logo: string;
  slogan: string;
  servicePhone: string;
  shareImage: string;
  city: string;
  status: string;
  theme: HealthTheme;
  trade: HealthTrade;
  serviceDeskSiteKey: string;
  /** 舌象分析增值服务（店铺级开关）。 */
  tongueAiEnabled: boolean;
  tongueAiChannelId: number;
  tongueAiModel: string;
};

export type HealthPublicCustomer = {
  id: number;
  openid: string;
  nickname: string;
  avatar: string;
  phone: string;
  memberLevelId: number;
  walletCents: number;
  points: number;
  promoterId: number;
};

/** 统一订单的顾客侧入参（路由层负责把表单补成这个形状）。 */
export type PublicOrderInput = {
  orderType: string;
  items: {
    itemType: string;
    refId: number;
    quantity: number;
    skuId: number;
    patientId: number;
    practitionerId: number;
  }[];
  slotId: number;
  addressId: number;
  couponTicketId: number;
  usePoints: number;
  remark: string;
  receiver: { name: string; phone: string; address: string };
  consult: {
    patientId: number;
    practitionerId: number;
    symptomText: string;
    attachments: string[];
    contactPhone: string;
    appointAt: string;
    meetingUrl: string;
  } | null;
  green: {
    patientId: number;
    kind: string;
    hospitalId: number;
    departmentId: number;
    targetHospital: string;
    targetDepartment: string;
    needType: string;
    urgency: string;
    demandAt: string;
    symptoms: string;
    files: string[];
    contactPhone: string;
  } | null;
};

const numOf = (value: unknown): number => {
  const num =
    typeof value === 'number'
      ? value
      : value && typeof value === 'object' && 'toNumber' in value
        ? Number((value as { toNumber: () => number }).toNumber())
        : Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};

const dateOf = (text: string): Date | null => {
  const value = String(text || '').trim();
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const ymd = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const nextDays = (from: string, count: number): string[] => {
  const start = dateOf(from) ?? new Date();
  return Array.from({ length: count }, (_, index) =>
    ymd(new Date(start.getTime() + index * 86400_000)),
  );
};

/** 1 积分抵 1 分（店内积分，不与平台积分互通）；抵扣上限由交易参数控制。 */
const CENTS_PER_POINT = 1;

/** C 端可自助下单的业务类型（充值等仅限店主端操作，不走公开通道）。 */
const PUBLIC_ORDER_TYPES = new Set([
  'REGISTER',
  'CONSULT_TEXT',
  'CONSULT_PHONE',
  'CONSULT_VIDEO',
  'EXAM',
  'GOODS',
  'SIGN_PKG',
  'YEAR_CARD',
  'MEMBER_CARD',
  'GREEN',
  'CONCIERGE',
  'REPORT_READ',
  'GUIDANCE',
]);

/** 到店服务类订单付款后发放核销码。 */
const VERIFY_REQUIRED = new Set([
  'REGISTER',
  'EXAM',
  'SIGN_PKG',
  'YEAR_CARD',
  'MEMBER_CARD',
  'GREEN',
]);

const CUSTOMER_STATUS_ON = 'ON';

type OrderItemDraft = {
  itemType: string;
  refId: number;
  name: string;
  specText: string;
  coverImage: string;
  priceCents: number;
  quantity: number;
  patientId: number;
  practitionerId: number;
  isRx?: boolean;
};

type SlotRow = {
  id: number;
  serviceId: number;
  practitionerId: number;
  priceCents: number;
  quota: number;
  occupied: number;
  status: string;
  workDate: string;
  startTime: string;
};

/**
 * 健康管理小程序 · C 端公开通道。
 *
 * 硬口径：
 * 1. 顾客身份只来自 `parseCustomerToken`（scene=HEALTH + shopId），所有读写
 *    一律 `shopId + customerId` 双条件过滤，就诊人还要再校验归属；
 * 2. 出参不含任何凭据口：手机号、证件号只回脱敏口径；
 * 3. 支付走店铺自有商户号，未配置时返回 `payable:false` 让端上提示线下付款，
 *    不伪造支付能力；回调金额不符只留痕不改状态。
 */
export class HealthPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MiniProgramClient,
    private readonly miniApp: MiniAppService,
    private readonly platform: HealthPlatformService,
    private readonly monitor: HealthMonitorService,
    private readonly crypto: HealthCrypto,
    private readonly desk: ServiceDeskService,
    private readonly pay: WechatPayClient,
  ) {}

  // ---------- 店铺与身份 ----------

  private toPublicShop(shop: {
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
    serviceDeskSiteKey: string;
    tongueAiEnabled: boolean;
    tongueAiChannelId: number;
    tongueAiModel: string;
  }): HealthPublicShop {
    return {
      shopId: shop.id,
      ownerUserId: shop.ownerUserId,
      name: shop.name,
      shopCode: shop.shopCode,
      logo: shop.logo,
      slogan: shop.slogan,
      servicePhone: shop.servicePhone,
      shareImage: shop.shareImage,
      city: shop.city,
      status: shop.status,
      theme: normalizeTheme(shop.themeJson),
      trade: normalizeTrade(shop.tradeJson),
      serviceDeskSiteKey: shop.serviceDeskSiteKey,
      tongueAiEnabled: shop.tongueAiEnabled,
      tongueAiChannelId: shop.tongueAiChannelId,
      tongueAiModel: shop.tongueAiModel,
    };
  }

  private subjectOf(shop: HealthPublicShop) {
    return subjectOfShop({
      id: shop.shopId,
      ownerUserId: shop.ownerUserId,
      name: shop.name,
    });
  }

  async shopByCode(shopCode: string): Promise<HealthPublicShop | null> {
    const code = String(shopCode || '')
      .trim()
      .toUpperCase()
      .slice(0, 16);
    if (!code) return null;
    const row = await this.prisma.healthShop.findUnique({
      where: { shopCode: code },
    });
    return row ? this.toPublicShop(row) : null;
  }

  async shopByAppId(appId: string): Promise<HealthPublicShop | null> {
    const value = String(appId || '')
      .trim()
      .slice(0, 64);
    if (!value) return null;
    const app = await this.prisma.miniProgramApp.findFirst({
      where: { appId: value },
      select: { scene: true, shopId: true },
    });
    if (!app || app.scene !== 'HEALTH') return null;
    const row = await this.prisma.healthShop.findUnique({
      where: { id: app.shopId },
    });
    return row ? this.toPublicShop(row) : null;
  }

  /** 公开通道的店铺闸门：平台关板 → 服务未开通；店铺暂停/关闭 → 明确原因。 */
  async requireShop(shopCode: string): Promise<HealthPublicShop> {
    const shop = await this.shopByCode(shopCode);
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或尚未开通，请让店主在后台完成开通后再试',
      );
    }
    const settings = await this.platform.settings();
    if (!settings.enabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '健康管理服务未开通',
      );
    }
    if (shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该店铺已被平台暂停服务',
      );
    }
    if (shop.status === 'CLOSED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该店铺已停止营业',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应（医护通道同走这里）
    if (!(await toolOpen('health', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return shop;
  }

  private toPublicCustomer(row: {
    id: number;
    openid: string;
    nickname: string;
    avatar: string;
    phone: string;
    memberLevelId: number;
    walletAmount: unknown;
    pointValue: number;
    promoterId: number;
    status: string;
  }): HealthPublicCustomer {
    return {
      id: row.id,
      openid: row.openid,
      nickname: row.nickname,
      avatar: row.avatar,
      phone: row.phone,
      memberLevelId: row.memberLevelId,
      walletCents: cents(row.walletAmount),
      points: row.pointValue,
      promoterId: row.promoterId,
    };
  }

  async requireCustomer(
    payload: CustomerTokenPayload,
  ): Promise<HealthPublicCustomer> {
    if (payload.scene !== 'HEALTH') {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态与当前工具不匹配，请重新登录',
      );
    }
    const shop = await this.prisma.healthShop.findUnique({
      where: { id: payload.shopId },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!shop || shop.status === 'CLOSED' || shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该店铺当前不可用',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应
    if (!(await toolOpen('health', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    const row = await this.prisma.healthCustomer.findFirst({
      where: { id: payload.customerId, shopId: payload.shopId },
    });
    if (!row) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态已失效，请重新进入小程序',
      );
    }
    if (row.status !== CUSTOMER_STATUS_ON) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号已被店铺限制使用，请联系店铺客服',
      );
    }
    return this.toPublicCustomer(row);
  }

  // ---------- 启动配置与登录 ----------

  async bootstrap(query: { shopCode?: string; appId?: string }) {
    const shop = query.shopCode
      ? await this.shopByCode(query.shopCode)
      : await this.shopByAppId(query.appId || '');
    if (!shop) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '店铺不存在或尚未开通');
    }
    const settings = await this.platform.settings();
    if (!settings.enabled) {
      return {
        enabled: false,
        reason: '健康管理服务未开通',
        shopCode: shop.shopCode,
        shopName: shop.name,
      };
    }
    // 启动闸门：未启动时沿用 bootstrap 的「不可用」形状（只换文案，不抛错）
    if (!(await toolOpen('health', shop.ownerUserId))) {
      return {
        enabled: false,
        reason:
          '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
        shopCode: shop.shopCode,
        shopName: shop.name,
      };
    }
    const now = new Date();
    const [agreements, banners, notices, pages, entries, hotKeywords, miniPay] =
      await Promise.all([
        this.prisma.healthAgreement.findMany({
          where: { shopId: shop.shopId },
          orderBy: { id: 'asc' },
        }),
        this.prisma.healthBanner.findMany({
          where: {
            shopId: shop.shopId,
            status: 'ON',
            AND: [
              { OR: [{ startAt: null }, { startAt: { lte: now } }] },
              { OR: [{ endAt: null }, { endAt: { gte: now } }] },
            ],
          },
          orderBy: [{ sort: 'asc' }, { id: 'desc' }],
          take: 20,
        }),
        this.prisma.healthNotice.findMany({
          where: { shopId: shop.shopId, status: 'ON' },
          orderBy: [{ sort: 'asc' }, { id: 'desc' }],
          take: 20,
        }),
        this.prisma.healthDiyPage.findMany({
          where: { shopId: shop.shopId },
          orderBy: { pageKey: 'asc' },
        }),
        this.prisma.healthServiceEntry.findMany({
          where: { shopId: shop.shopId },
        }),
        this.prisma.healthHotKeyword.findMany({
          where: { shopId: shop.shopId, status: 'ON' },
          orderBy: [{ searchNum: 'desc' }, { id: 'desc' }],
          take: 20,
        }),
        this.miniApp.payEnabled(this.subjectOf(shop)),
      ]);
    const payEnabled =
      settings.allowOnlinePay &&
      shop.trade.onlinePayEnabled &&
      Boolean(miniPay);
    return {
      enabled: true,
      scene: 'HEALTH',
      shopCode: shop.shopCode,
      shopId: shop.shopId,
      shopName: shop.name,
      logo: shop.logo,
      slogan: shop.slogan,
      servicePhone: shop.servicePhone,
      shareImage: shop.shareImage,
      city: shop.city,
      theme: shop.theme,
      shopStatus: shop.status,
      payEnabled,
      tongueEnabled: shop.tongueAiEnabled,
      emergencyTip: shop.trade.emergencyTip,
      agreements: agreements.map((row) => ({
        key: row.aKey,
        title: row.title,
        content: row.content,
        updatedAt: toIso(row.updatedAt),
      })),
      banners: banners.map((row) => ({
        id: row.id,
        title: row.title,
        image: row.image,
        linkType: row.linkType,
        linkValue: row.linkValue,
      })),
      notices: notices.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
      })),
      pages: pages.map((row) => ({
        pageKey: row.pageKey,
        title: row.title,
        blocks: jsonArr<Record<string, unknown>>(row.blocksJson),
      })),
      // 店主没动过「服务入口」时表中没有行；端上要按出厂顺序全量展示，不能渲染成空白宫格
      entries: (() => {
        const list = (
          entries.length
            ? entries
            : HEALTH_SERVICE_ENTRY_KEYS.map((key, index) => ({
                eKey: key,
                visible: true,
                sort: index,
              }))
        )
          // 增值服务未开通时入口不可见：店内装修表即使有行也不下发。
          .filter((row) => row.eKey !== 'tongue' || shop.tongueAiEnabled)
          .map((row) => ({
            key: row.eKey,
            visible: row.visible,
            sort: row.sort,
          }));
        // 老店的服务入口表是开通前保存的：开通增值服务后补一行，避免必须再改一次装修。
        if (shop.tongueAiEnabled && !list.some((row) => row.key === 'tongue')) {
          list.push({ key: 'tongue', visible: true, sort: 999 });
        }
        return list;
      })(),
      hotKeywords: hotKeywords.map((row) => row.word),
    };
  }

  /**
   * 微信登录：首次进入即建档，扫码即注册。
   * 推客归因只在「首次绑定」时落库（唯一键 shopId+customerId），不覆盖已有关系。
   */
  async login(body: { shopCode: string; code: string; promoterCode: string }) {
    const shop = await this.requireShop(body.shopCode);
    const runtime = await this.miniApp.requireRuntime(this.subjectOf(shop));
    const session = await this.client.code2Session(runtime, body.code);
    const now = new Date();
    const row = await this.prisma.healthCustomer.upsert({
      where: { shopId_openid: { shopId: shop.shopId, openid: session.openId } },
      create: {
        shopId: shop.shopId,
        appId: runtime.appId,
        openid: session.openId,
        unionid: session.unionId || '',
        lastActiveAt: now,
      },
      update: {
        ...(session.unionId ? { unionid: session.unionId } : {}),
        lastActiveAt: now,
      },
    });
    if (row.status !== CUSTOMER_STATUS_ON) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号已被店铺限制使用，请联系店铺客服',
      );
    }
    const promoterId = await this.attributePromoter(
      shop.shopId,
      row.id,
      body.promoterCode,
    );
    const token = issueCustomerToken({
      scene: 'HEALTH',
      shopId: shop.shopId,
      customerId: row.id,
      openid: row.openid,
    });
    return {
      token,
      profile: {
        ...this.toPublicCustomer(row),
        phone: maskPhone(row.phone),
        shopName: shop.name,
        shopCode: shop.shopCode,
        promoterId,
      },
    };
  }

  private async attributePromoter(
    shopId: number,
    customerId: number,
    promoterCode: string,
  ): Promise<number> {
    const existing = await this.prisma.healthPromoterRelation.findUnique({
      where: { shopId_customerId: { shopId, customerId } },
      select: { promoterId: true },
    });
    if (existing) return existing.promoterId;
    const code = clip(promoterCode, 24);
    if (!code) return 0;
    const promoter = await this.prisma.healthPromoter.findFirst({
      where: { shopId, code, status: 'ON', auditStatus: 'APPROVED' },
      select: { id: true },
    });
    if (!promoter) return 0;
    await this.prisma
      .$transaction([
        this.prisma.healthPromoterRelation.create({
          data: {
            shopId,
            promoterId: promoter.id,
            customerId,
            source: 'LOGIN',
          },
        }),
        this.prisma.healthPromoteLog.create({
          data: { shopId, promoterId: promoter.id, customerId, kind: 'BIND' },
        }),
        this.prisma.healthCustomer.update({
          where: { id: customerId },
          data: { promoterId: promoter.id },
        }),
      ])
      .catch(() => undefined);
    return promoter.id;
  }

  async me(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const [level, coupons, grants, unpaidOrders] = await Promise.all([
      customer.memberLevelId
        ? this.prisma.healthMemberLevel.findFirst({
            where: { shopId: shop.shopId, levelValue: customer.memberLevelId },
          })
        : null,
      this.prisma.healthCouponTicket.count({
        where: {
          shopId: shop.shopId,
          customerId: customer.id,
          status: 'AVAILABLE',
          endAt: { gte: new Date() },
        },
      }),
      this.prisma.healthMemberGrant.findMany({
        where: {
          shopId: shop.shopId,
          customerId: customer.id,
          status: 'BINDING',
        },
        orderBy: { endAt: 'desc' },
        take: 5,
      }),
      this.prisma.healthOrder.count({
        where: {
          shopId: shop.shopId,
          customerId: customer.id,
          status: 'PENDING_PAYMENT',
        },
      }),
    ]);
    return {
      customer: {
        id: customer.id,
        nickname: customer.nickname,
        avatar: customer.avatar,
        phone: maskPhone(customer.phone),
        walletCents: customer.walletCents,
        points: customer.points,
        memberLevelId: customer.memberLevelId,
        memberLevelName: level?.name ?? '',
        memberDiscountPercent: level?.discountPercent ?? 100,
      },
      coupons,
      grants: grants.map((row) => ({
        id: row.id,
        levelValue: row.levelValue,
        verifyCode: row.verifyCode,
        startAt: toIso(row.startAt),
        endAt: toIso(row.endAt),
        status: row.status,
      })),
      unpaidOrders,
      shop: {
        shopCode: shop.shopCode,
        shopName: shop.name,
        logo: shop.logo,
        themeColor: shop.theme.themeColor,
        servicePhone: shop.servicePhone,
      },
      emergencyTip: shop.trade.emergencyTip,
    };
  }

  async updateProfile(
    customer: HealthPublicCustomer,
    body: { nickname: string; avatar: string; phone: string },
  ) {
    const row = await this.prisma.healthCustomer.update({
      where: { id: customer.id },
      data: {
        ...(body.nickname ? { nickname: clip(body.nickname, 60) } : {}),
        ...(body.avatar ? { avatar: clip(body.avatar, 500) } : {}),
        ...(body.phone ? { phone: clip(body.phone, 32) } : {}),
      },
    });
    return this.toPublicCustomer(row);
  }

  // ---------- 就诊人 ----------

  private async patientOf(
    shopId: number,
    customerId: number,
    patientId: number,
  ) {
    const row = await this.prisma.healthPatient.findFirst({
      where: { id: patientId, shopId, customerId },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '就诊人不存在或不属于当前账号',
      );
    return row;
  }

  private patientRow(row: {
    id: number;
    name: string;
    relation: string;
    gender: string;
    birthday: string;
    phone: string;
    idCardTail: string;
    bloodType: string;
    heightCm: unknown;
    weightKg: unknown;
    remark: string;
    isDefault: boolean;
    ownerPractitionerId: number;
  }) {
    return {
      id: row.id,
      name: row.name,
      relation: row.relation,
      gender: row.gender,
      birthday: row.birthday,
      age: ageOf(row.birthday),
      phone: maskPhone(row.phone),
      idCardTail: row.idCardTail ? `****${row.idCardTail}` : '',
      bloodType: row.bloodType,
      heightCm: numOf(row.heightCm),
      weightKg: numOf(row.weightKg),
      remark: row.remark,
      isDefault: row.isDefault,
      ownerPractitionerId: row.ownerPractitionerId,
    };
  }

  async patients(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const rows = await this.prisma.healthPatient.findMany({
      where: { shopId: shop.shopId, customerId: customer.id },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.patientRow(row));
  }

  async savePatient(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      id: number;
      name: string;
      relation: string;
      gender: string;
      birthday: string;
      phone: string;
      idCard: string;
      bloodType: string;
      heightCm: number;
      weightKg: number;
      remark: string;
      isDefault: boolean;
    },
  ) {
    const name = clip(body.name, 60);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写就诊人姓名');
    const idCard = clip(body.idCard, 32);
    if (body.isDefault) {
      await this.prisma.healthPatient.updateMany({
        where: { shopId: shop.shopId, customerId: customer.id },
        data: { isDefault: false },
      });
    }
    const data = {
      shopId: shop.shopId,
      customerId: customer.id,
      name,
      relation: strOf(body.relation, 16, 'SELF'),
      gender: clip(body.gender, 8),
      birthday: clip(body.birthday, 20),
      // 列表接口只回脱敏手机号，编辑时留空表示不修改，避免把掩码写回库
      ...(body.id > 0 && !clip(body.phone, 32)
        ? {}
        : { phone: clip(body.phone, 32) }),
      bloodType: clip(body.bloodType, 8),
      heightCm: Math.min(300, Math.max(0, Number(body.heightCm) || 0)),
      weightKg: Math.min(500, Math.max(0, Number(body.weightKg) || 0)),
      remark: clip(body.remark, 500),
      isDefault: body.isDefault,
    };
    let patientId = body.id;
    if (body.id > 0) {
      await this.patientOf(shop.shopId, customer.id, body.id);
      await this.prisma.healthPatient.update({ where: { id: body.id }, data });
    } else {
      const count = await this.prisma.healthPatient.count({
        where: { shopId: shop.shopId, customerId: customer.id },
      });
      if (count >= 20) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '最多可添加 20 位就诊人',
        );
      }
      const row = await this.prisma.healthPatient.create({
        data: { ...data, isDefault: body.isDefault || count === 0 },
      });
      patientId = row.id;
    }
    if (idCard) {
      await this.prisma.healthPatient.update({
        where: { id: patientId },
        data: {
          idCardCipher: this.crypto.encrypt(
            `HEALTH:${shop.shopId}:idCard`,
            idCard,
          ),
          idCardTail: idCard.slice(-4),
        },
      });
    }
    const fresh = await this.patientOf(shop.shopId, customer.id, patientId);
    await audit(
      this.prisma,
      `customer:${customer.id}`,
      'health.patient.save',
      `shop=${shop.shopId} patient=${patientId}`,
    );
    return this.patientRow(fresh);
  }

  async removePatient(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    patientId: number,
  ) {
    await this.patientOf(shop.shopId, customer.id, patientId);
    const open = await this.prisma.healthOrder.count({
      where: {
        shopId: shop.shopId,
        customerId: customer.id,
        status: {
          in: [
            'PENDING_PAYMENT',
            'PAID',
            'ACCEPTED',
            'ASSIGNED',
            'SERVING',
            'DELIVERED',
            'VERIFIED',
          ],
        },
        patientIdsJson: { array_contains: patientId },
      },
    });
    if (open > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该就诊人还有进行中的订单，完成后再删除',
      );
    }
    await this.prisma.healthPatient.delete({ where: { id: patientId } });
    return { ok: true };
  }

  // ---------- 档案 / 指标 / 随访 / 用药 / 报告 ----------

  async archive(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    patientId: number,
  ) {
    const patient = await this.patientOf(shop.shopId, customer.id, patientId);
    const [record, items, metricLogs, medications, followups, reports] =
      await Promise.all([
        this.prisma.healthRecord.findFirst({
          where: { shopId: shop.shopId, patientId },
        }),
        this.prisma.healthRecordItem.findMany({
          where: { shopId: shop.shopId, patientId },
          orderBy: { id: 'asc' },
        }),
        this.prisma.healthMetricLog.findMany({
          where: { shopId: shop.shopId, patientId },
          orderBy: { measuredAt: 'desc' },
          take: 20,
        }),
        this.prisma.healthMedication.findMany({
          where: { shopId: shop.shopId, patientId, status: 'ON' },
          orderBy: { id: 'desc' },
        }),
        this.prisma.healthFollowupTask.findMany({
          where: { shopId: shop.shopId, patientId, status: 'PENDING' },
          orderBy: { dueAt: 'asc' },
          take: 10,
        }),
        this.prisma.healthReport.findMany({
          where: { shopId: shop.shopId, patientId },
          orderBy: { reportAt: 'desc' },
          take: 10,
        }),
      ]);
    const metricIds = [...new Set(metricLogs.map((row) => row.metricId))];
    const metrics = metricIds.length
      ? await this.prisma.healthMetric.findMany({
          where: { shopId: shop.shopId, id: { in: metricIds } },
        })
      : [];
    const metricMap = new Map(metrics.map((row) => [row.id, row]));
    return {
      patient: this.patientRow(patient),
      record: {
        basics: jsonObj<Record<string, unknown>>(record?.basicsJson, {}),
        completed: Boolean(record?.completed),
      },
      items: items.map((row) => ({
        id: row.id,
        type: row.type,
        label: row.label,
        value: row.value,
        startAt: row.startAt,
        endAt: row.endAt,
      })),
      metricLogs: metricLogs.map((row) => {
        const extras = jsonObj<{ valueText?: string }>(row.extrasJson, {});
        return {
          id: row.id,
          metricId: row.metricId,
          metricName: metricMap.get(row.metricId)?.name ?? row.metricKey,
          unit: metricMap.get(row.metricId)?.unit ?? '',
          value: numOf(row.value),
          valueText: String(extras.valueText ?? ''),
          measuredAt: toIso(row.measuredAt),
          abnormal: Boolean(row.abnormal),
        };
      }),
      medications: medications.map((row) => ({
        id: row.id,
        name: row.name,
        spec: row.spec,
        way: row.way,
        doseText: row.doseText,
        frequency: row.frequency,
        times: jsonArr<string>(row.timesJson),
        startAt: row.startAt,
        endAt: row.endAt,
      })),
      followups: followups.map((row) => ({
        id: row.id,
        title: row.title,
        way: row.way,
        dueAt: toIso(row.dueAt),
      })),
      reports: reports.map((row) => ({
        id: row.id,
        title: row.title,
        type: row.type,
        reportAt: toIso(row.reportAt),
        abnormalCount: row.abnormalCount,
        readStatus: row.readStatus,
      })),
    };
  }

  async recordItemSave(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      patientId: number;
      id: number;
      type: string;
      label: string;
      value: string;
      startAt: string;
      endAt: string;
    },
  ) {
    await this.patientOf(shop.shopId, customer.id, body.patientId);
    const value = clip(body.value, 500);
    if (!value)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写档案内容');
    const data = {
      type: strOf(body.type, 16, 'PAST'),
      label: clip(body.label, 60),
      value,
      startAt: clip(body.startAt, 20),
      endAt: clip(body.endAt, 20),
    };
    if (body.id > 0) {
      const row = await this.prisma.healthRecordItem.findFirst({
        where: { id: body.id, shopId: shop.shopId, patientId: body.patientId },
      });
      if (!row)
        throw new BusinessException(ErrorCode.NOT_FOUND, '档案条目不存在');
      return this.prisma.healthRecordItem.update({
        where: { id: row.id },
        data,
      });
    }
    return this.prisma.healthRecordItem.create({
      data: { shopId: shop.shopId, patientId: body.patientId, ...data },
    });
  }

  async metrics(shop: HealthPublicShop) {
    const rows = await this.prisma.healthMetric.findMany({
      where: { shopId: shop.shopId, status: 'ON' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.mKey,
      name: row.name,
      unit: row.unit,
      decimalScale: row.decimalScale,
      normalMin: numOf(row.normalMin),
      normalMax: numOf(row.normalMax),
    }));
  }

  async metricLogs(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    patientId: number,
  ) {
    await this.patientOf(shop.shopId, customer.id, patientId);
    const rows = await this.prisma.healthMetricLog.findMany({
      where: { shopId: shop.shopId, patientId },
      orderBy: { measuredAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => {
      const extras = jsonObj<{ valueText?: string }>(row.extrasJson, {});
      return {
        id: row.id,
        metricId: row.metricId,
        metricKey: row.metricKey,
        value: numOf(row.value),
        valueText: String(extras.valueText ?? ''),
        abnormal: Boolean(row.abnormal),
        note: row.remark,
        measuredAt: toIso(row.measuredAt),
      };
    });
  }

  async metricLogSave(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      patientId: number;
      metricId: number;
      value: number;
      valueText: string;
      measuredAt: string;
      note: string;
    },
  ) {
    await this.patientOf(shop.shopId, customer.id, body.patientId);
    return this.monitor.recordStaffLog({
      shopId: shop.shopId,
      patientId: body.patientId,
      metricId: body.metricId,
      value: body.value,
      valueText: body.valueText,
      measuredAt: body.measuredAt,
      note: body.note,
      staffName: '顾客自填',
      source: 'MANUAL',
    });
  }

  async metricTrend(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    patientId: number,
    metricId: number,
  ) {
    await this.patientOf(shop.shopId, customer.id, patientId);
    const metric = await this.prisma.healthMetric.findFirst({
      where: { id: metricId, shopId: shop.shopId },
      select: { id: true, name: true, unit: true },
    });
    if (!metric) throw new BusinessException(ErrorCode.NOT_FOUND, '指标不存在');
    const rows = await this.prisma.healthMetricLog.findMany({
      where: { shopId: shop.shopId, patientId, metricId },
      orderBy: { measuredAt: 'asc' },
      take: 90,
    });
    return {
      metric: { id: metric.id, name: metric.name, unit: metric.unit },
      points: rows.map((row) => ({
        value: numOf(row.value),
        abnormal: Boolean(row.abnormal),
        measuredAt: toIso(row.measuredAt),
      })),
    };
  }

  async followups(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const patients = await this.prisma.healthPatient.findMany({
      where: { shopId: shop.shopId, customerId: customer.id },
      select: { id: true, name: true },
    });
    if (!patients.length) return [];
    const nameMap = new Map(patients.map((row) => [row.id, row.name]));
    const rows = await this.prisma.healthFollowupTask.findMany({
      where: {
        shopId: shop.shopId,
        patientId: { in: patients.map((row) => row.id) },
        status: 'PENDING',
      },
      orderBy: { dueAt: 'asc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      patientId: row.patientId,
      patientName: nameMap.get(row.patientId) ?? '',
      title: row.title,
      way: row.way,
      content: row.content,
      dueAt: toIso(row.dueAt),
    }));
  }

  async completeFollowup(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      taskId: number;
      note: string;
      metrics: { metricId: number; value: number; measuredAt: string }[];
    },
  ) {
    const task = await this.prisma.healthFollowupTask.findFirst({
      where: { id: body.taskId, shopId: shop.shopId },
    });
    if (!task)
      throw new BusinessException(ErrorCode.NOT_FOUND, '随访任务不存在');
    await this.patientOf(shop.shopId, customer.id, task.patientId);
    if (task.status !== 'PENDING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该随访任务已处理');
    }
    const snapshots: {
      metricName: string;
      value: number;
      unit: string;
      measuredAt: string;
    }[] = [];
    for (const entry of body.metrics) {
      const log = await this.monitor.recordStaffLog({
        shopId: shop.shopId,
        patientId: task.patientId,
        metricId: entry.metricId,
        value: entry.value,
        measuredAt: entry.measuredAt || new Date(),
        note: `随访#${task.id}`,
        staffName: '顾客自填',
        source: 'MANUAL',
      });
      snapshots.push({
        metricName: log.metricName,
        value: log.value,
        unit: log.unit,
        measuredAt: log.measuredAt,
      });
    }
    await this.prisma.$transaction([
      this.prisma.healthFollowupRecord.create({
        data: {
          shopId: shop.shopId,
          taskId: task.id,
          patientId: task.patientId,
          way: task.way,
          result: 'DONE',
          note: clip(body.note, 500),
          filesJson: { metrics: snapshots, selfReported: true },
          operatorUserId: `customer:${customer.id}`,
          operatorName: '顾客自填',
        },
      }),
      this.prisma.healthFollowupTask.update({
        where: { id: task.id },
        data: {
          status: 'DONE',
          doneAt: new Date(),
          resultSummary: clip(body.note, 500) || '顾客在小程序完成自填',
        },
      }),
    ]);
    return { ok: true };
  }

  async medications(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    patientId: number,
  ) {
    await this.patientOf(shop.shopId, customer.id, patientId);
    const rows = await this.prisma.healthMedication.findMany({
      where: { shopId: shop.shopId, patientId, status: 'ON' },
      orderBy: { id: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      spec: row.spec,
      way: row.way,
      doseText: row.doseText,
      frequency: row.frequency,
      times: jsonArr<string>(row.timesJson),
      startAt: row.startAt,
      endAt: row.endAt,
      remark: row.remark,
    }));
  }

  async medicationLogSave(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      patientId: number;
      medicationId: number;
      planDate: string;
      planTime: string;
      status: string;
      remark: string;
    },
  ) {
    await this.patientOf(shop.shopId, customer.id, body.patientId);
    const medication = await this.prisma.healthMedication.findFirst({
      where: {
        id: body.medicationId,
        shopId: shop.shopId,
        patientId: body.patientId,
        status: 'ON',
      },
    });
    if (!medication)
      throw new BusinessException(ErrorCode.NOT_FOUND, '用药方案不存在');
    const planDate = clip(body.planDate, 10) || ymd(new Date());
    const planTime = clip(body.planTime, 10);
    const status = ['TAKEN', 'MISSED', 'SKIPPED'].includes(body.status)
      ? body.status
      : 'TAKEN';
    const row = await this.prisma.healthMedicationLog.upsert({
      where: {
        medicationId_planDate_planTime: {
          medicationId: medication.id,
          planDate,
          planTime,
        },
      },
      create: {
        shopId: shop.shopId,
        medicationId: medication.id,
        patientId: body.patientId,
        planDate,
        planTime,
        status,
        takenAt: status === 'TAKEN' ? new Date() : null,
        remark: clip(body.remark, 200),
      },
      update: {
        status,
        takenAt: status === 'TAKEN' ? new Date() : null,
        remark: clip(body.remark, 200),
      },
    });
    return {
      id: row.id,
      status: row.status,
      planDate: row.planDate,
      planTime: row.planTime,
    };
  }

  async prescriptions(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const patients = await this.prisma.healthPatient.findMany({
      where: { shopId: shop.shopId, customerId: customer.id },
      select: { id: true },
    });
    if (!patients.length) return [];
    const rows = await this.prisma.healthPrescription.findMany({
      where: {
        shopId: shop.shopId,
        patientId: { in: patients.map((row) => row.id) },
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      rxNo: row.rxNo,
      doctorName: row.doctorName,
      diagnosis: row.diagnosis,
      totalCents: row.totalCents,
      status: row.status,
      createdAt: toIso(row.createdAt),
      expiresAt: toIso(row.expiresAt),
    }));
  }

  async reports(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const patients = await this.prisma.healthPatient.findMany({
      where: { shopId: shop.shopId, customerId: customer.id },
      select: { id: true, name: true },
    });
    if (!patients.length) return [];
    const nameMap = new Map(patients.map((row) => [row.id, row.name]));
    const rows = await this.prisma.healthReport.findMany({
      where: {
        shopId: shop.shopId,
        patientId: { in: patients.map((row) => row.id) },
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      patientName: nameMap.get(row.patientId) ?? '',
      title: row.title,
      type: row.type,
      hospitalName: row.hospitalName,
      reportAt: toIso(row.reportAt),
      abnormalCount: row.abnormalCount,
      readStatus: row.readStatus,
      haveFile: jsonArr<Record<string, unknown>>(row.filesJson).length > 0,
    }));
  }

  async reportDetail(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    reportId: number,
  ) {
    const report = await this.prisma.healthReport.findFirst({
      where: { id: reportId, shopId: shop.shopId },
    });
    if (!report) throw new BusinessException(ErrorCode.NOT_FOUND, '报告不存在');
    await this.patientOf(shop.shopId, customer.id, report.patientId);
    const [items, advices] = await Promise.all([
      this.prisma.healthReportItem.findMany({
        where: { shopId: shop.shopId, reportId },
        orderBy: { sort: 'asc' },
      }),
      this.prisma.healthReportAdvice.findMany({
        where: { shopId: shop.shopId, reportId },
        orderBy: { id: 'asc' },
      }),
    ]);
    if (report.readStatus !== 'READ') {
      await this.prisma.healthReport.update({
        where: { id: report.id },
        data: { readStatus: 'READ' },
      });
    }
    return {
      report: {
        id: report.id,
        title: report.title,
        type: report.type,
        hospitalName: report.hospitalName,
        reportAt: toIso(report.reportAt),
        files: jsonArr<Record<string, unknown>>(report.filesJson),
        summary: report.summary,
        conclusion: report.conclusion,
        abnormalCount: report.abnormalCount,
      },
      items: items.map((row) => ({
        name: row.name,
        valueText: row.valueText,
        unit: row.unit,
        refRange: row.refRange,
        flag: row.flag,
      })),
      advices: advices.map((row) => ({
        content: row.adviceText,
        doctorName: row.doctorName,
        createdAt: toIso(row.createdAt),
      })),
      disclaimer: '报告解读仅为就医参考，不构成诊断结论；如有异常请及时就医。',
    };
  }

  // ---------- 服务与医护 ----------

  async services(
    shop: HealthPublicShop,
    query: { keyword: string; bizType: string; page: string; pageSize: string },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = {
      shopId: shop.shopId,
      status: 'ON',
      auditStatus: 'APPROVED',
      ...(query.bizType ? { bizType: query.bizType } : {}),
      ...(query.keyword ? { name: { contains: query.keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthService.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.healthService.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        bizType: row.bizType,
        category: row.category,
        coverImage: row.coverImage,
        desc: clip(row.desc, 120),
        priceCents: row.priceCents,
        originPriceCents: row.originPriceCents,
        durationMinutes: row.durationMinutes,
        needSlot: row.needSlot,
        supportsInstant: row.supportsInstant,
      })),
      total,
      page,
      pageSize,
    );
  }

  async serviceDetail(shop: HealthPublicShop, serviceId: number) {
    const row = await this.prisma.healthService.findFirst({
      where: {
        id: serviceId,
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务不存在或已下架');
    const links = await this.prisma.healthPractitionerService.findMany({
      where: { shopId: shop.shopId, serviceId, status: 'ON' },
      select: { practitionerId: true, priceCents: true, instant: true },
    });
    const ids = links.map((item) => item.practitionerId);
    const members = ids.length
      ? await this.prisma.healthPractitioner.findMany({
          where: {
            shopId: shop.shopId,
            id: { in: ids },
            status: 'ON',
            auditStatus: 'APPROVED',
          },
        })
      : [];
    const linkMap = new Map(links.map((item) => [item.practitionerId, item]));
    return {
      id: row.id,
      name: row.name,
      bizType: row.bizType,
      category: row.category,
      coverImage: row.coverImage,
      images: jsonArr<string>(row.imagesJson),
      desc: row.desc,
      priceMode: row.priceMode,
      priceCents: row.priceCents,
      originPriceCents: row.originPriceCents,
      durationMinutes: row.durationMinutes,
      needSlot: row.needSlot,
      needPatient: row.needPatient,
      maxPatientCount: row.maxPatientCount,
      supportsInstant: row.supportsInstant,
      practitioners: members.map((item) => ({
        id: item.id,
        name: item.name,
        title: item.title,
        avatar: item.avatar,
        role: item.role,
        priceCents: linkMap.get(item.id)?.priceCents || row.priceCents,
        instant: Boolean(linkMap.get(item.id)?.instant),
        score:
          item.scoreCount > 0
            ? Math.round((item.scoreSum / item.scoreCount) * 10) / 10
            : 0,
      })),
      disclaimer:
        '服务内容与适用人群以到店/接诊医护判断为准，本工具不提供诊断结论。',
    };
  }

  async practitioners(
    shop: HealthPublicShop,
    query: {
      keyword: string;
      serviceId: number;
      page: string;
      pageSize: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const serviceId = Number(query.serviceId) || 0;
    let ids: number[] | null = null;
    if (serviceId > 0) {
      const rows = await this.prisma.healthPractitionerService.findMany({
        where: { shopId: shop.shopId, serviceId, status: 'ON' },
        select: { practitionerId: true },
      });
      ids = rows.map((row) => row.practitionerId);
      if (!ids.length) return pageOf([], 0, page, pageSize);
    }
    const where = {
      shopId: shop.shopId,
      status: 'ON',
      auditStatus: 'APPROVED',
      ...(ids ? { id: { in: ids } } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword } },
              { title: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthPractitioner.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.healthPractitioner.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        title: row.title,
        avatar: row.avatar,
        role: row.role,
        intro: clip(row.intro, 120),
        city: row.city,
        score:
          row.scoreCount > 0
            ? Math.round((row.scoreSum / row.scoreCount) * 10) / 10
            : 0,
        goodAt: jsonArr<string>(row.goodAtJson),
      })),
      total,
      page,
      pageSize,
    );
  }

  async practitionerDetail(shop: HealthPublicShop, practitionerId: number) {
    const row = await this.prisma.healthPractitioner.findFirst({
      where: {
        id: practitionerId,
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '医护不存在或未上架');
    const [links, reviews] = await Promise.all([
      this.prisma.healthPractitionerService.findMany({
        where: { shopId: shop.shopId, practitionerId, status: 'ON' },
      }),
      this.prisma.healthReview.findMany({
        where: {
          shopId: shop.shopId,
          targetType: 'PRACTITIONER',
          targetId: practitionerId,
          status: 'PUBLISHED',
        },
        orderBy: { id: 'desc' },
        take: 5,
      }),
    ]);
    const serviceIds = links.map((item) => item.serviceId);
    const catalog = serviceIds.length
      ? await this.prisma.healthService.findMany({
          where: { shopId: shop.shopId, id: { in: serviceIds }, status: 'ON' },
          select: { id: true, name: true, bizType: true, coverImage: true },
        })
      : [];
    const catalogMap = new Map(catalog.map((item) => [item.id, item]));
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      avatar: row.avatar,
      role: row.role,
      city: row.city,
      intro: row.intro,
      goodAt: jsonArr<string>(row.goodAtJson),
      score:
        row.scoreCount > 0
          ? Math.round((row.scoreSum / row.scoreCount) * 10) / 10
          : 0,
      scoreCount: row.scoreCount,
      services: links.map((item) => ({
        serviceId: item.serviceId,
        name: catalogMap.get(item.serviceId)?.name ?? '',
        bizType: catalogMap.get(item.serviceId)?.bizType ?? '',
        coverImage: catalogMap.get(item.serviceId)?.coverImage ?? '',
        priceCents: item.priceCents,
        instant: item.instant,
      })),
      reviews: reviews.map((item) => ({
        score: item.score,
        content: item.anonymous ? '匿名评价' : item.content,
        tags: jsonArr<string>(item.tagsJson),
        createdAt: toIso(item.createdAt),
      })),
    };
  }

  async hospitals(shop: HealthPublicShop, query: { city: string }) {
    const rows = await this.prisma.healthHospital.findMany({
      where: {
        shopId: shop.shopId,
        status: 'ON',
        ...(query.city ? { city: query.city } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      city: row.city,
      address: row.address,
      partnered: row.partnered,
    }));
  }

  async departments(shop: HealthPublicShop, hospitalId: number) {
    const rows = await this.prisma.healthDepartment.findMany({
      where: {
        shopId: shop.shopId,
        status: 'ON',
        ...(hospitalId > 0 ? { hospitalId } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      intro: row.intro,
      hospitalId: row.hospitalId,
    }));
  }

  async cities(shop: HealthPublicShop) {
    const rows = await this.prisma.healthCity.findMany({
      where: { shopId: shop.shopId, status: 'ON' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, name: row.name, code: row.code }));
  }

  async diseases(shop: HealthPublicShop, keyword: string) {
    const rows = await this.prisma.healthDisease.findMany({
      where: {
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      departmentName: row.departmentName,
      summary: row.desc,
    }));
  }

  async drugs(shop: HealthPublicShop, keyword: string) {
    const rows = await this.prisma.healthDrug.findMany({
      where: {
        shopId: shop.shopId,
        status: 'ON',
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      spec: row.spec,
      unit: row.unit,
      manufacturer: row.manufacturer,
      rxType: row.rxType,
      priceCents: row.priceCents,
      stock: row.stock,
    }));
  }

  // ---------- 号源 ----------

  async slotDays(
    shop: HealthPublicShop,
    query: { serviceId: number; practitionerId: number; from: string },
  ) {
    const start = query.from ? clip(query.from, 10) : ymd(new Date());
    const days = nextDays(start, shop.trade.maxDays);
    const rows = await this.prisma.healthSlot.findMany({
      where: {
        shopId: shop.shopId,
        workDate: { in: days },
        status: 'AVAILABLE',
        ...(query.serviceId > 0 ? { serviceId: query.serviceId } : {}),
        ...(query.practitionerId > 0
          ? { practitionerId: query.practitionerId }
          : {}),
      },
      select: { workDate: true, priceCents: true, quota: true, occupied: true },
    });
    const stat = new Map<string, { count: number; minPriceCents: number }>();
    for (const row of rows) {
      if (row.occupied >= row.quota) continue;
      const current = stat.get(row.workDate) ?? {
        count: 0,
        minPriceCents: row.priceCents,
      };
      stat.set(row.workDate, {
        count: current.count + 1,
        minPriceCents: Math.min(current.minPriceCents, row.priceCents),
      });
    }
    return days.map((day) => ({
      day,
      weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
        new Date(`${day}T00:00:00`).getDay()
      ],
      available: stat.get(day)?.count ?? 0,
      soldOut: !stat.has(day),
      minPriceCents: stat.get(day)?.minPriceCents ?? 0,
    }));
  }

  async slotTimeline(
    shop: HealthPublicShop,
    query: { day: string; serviceId: number; practitionerId: number },
  ) {
    const day = clip(query.day, 10) || ymd(new Date());
    const rows = await this.prisma.healthSlot.findMany({
      where: {
        shopId: shop.shopId,
        workDate: day,
        ...(query.serviceId > 0 ? { serviceId: query.serviceId } : {}),
        ...(query.practitionerId > 0
          ? { practitionerId: query.practitionerId }
          : {}),
      },
      orderBy: [{ startTime: 'asc' }, { practitionerId: 'asc' }],
    });
    const ids = [...new Set(rows.map((row) => row.practitionerId))];
    const members = ids.length
      ? await this.prisma.healthPractitioner.findMany({
          where: { shopId: shop.shopId, id: { in: ids } },
          select: { id: true, name: true, title: true, avatar: true },
        })
      : [];
    const memberMap = new Map(members.map((row) => [row.id, row]));
    return rows.map((row) => ({
      id: row.id,
      practitionerId: row.practitionerId,
      practitionerName: memberMap.get(row.practitionerId)?.name ?? '',
      practitionerTitle: memberMap.get(row.practitionerId)?.title ?? '',
      practitionerAvatar: memberMap.get(row.practitionerId)?.avatar ?? '',
      serviceId: row.serviceId,
      kind: row.kind,
      workDate: row.workDate,
      startTime: row.startTime,
      endTime: row.endTime,
      status: row.status,
      remaining: Math.max(0, row.quota - row.occupied),
      priceCents: row.priceCents,
    }));
  }

  // ---------- 内容 ----------

  async articles(
    shop: HealthPublicShop,
    query: {
      keyword: string;
      categoryId: number;
      page: string;
      pageSize: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = {
      shopId: shop.shopId,
      status: 'ON',
      auditStatus: 'APPROVED',
      visibility: 'PUBLIC',
      ...(query.categoryId > 0 ? { categoryId: query.categoryId } : {}),
      ...(query.keyword ? { title: { contains: query.keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthArticle.findMany({
        where,
        orderBy: [{ topFlag: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.healthArticle.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        coverImage: row.coverImage,
        summary: row.summary,
        authorName: row.authorName,
        tags: jsonArr<string>(row.tagsJson),
        viewCount: row.viewCount,
        likeCount: row.likeCount,
        publishedAt: toIso(row.publishedAt ?? row.createdAt),
      })),
      total,
      page,
      pageSize,
    );
  }

  async articleDetail(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer | null,
    articleId: number,
  ) {
    const row = await this.prisma.healthArticle.findFirst({
      where: {
        id: articleId,
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在或已下线');
    if (row.visibility === 'MEMBER' && (customer?.memberLevelId ?? 0) <= 0) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '该内容仅会员可见，请先开通会员',
      );
    }
    await this.prisma.healthArticle.update({
      where: { id: row.id },
      data: { viewCount: { increment: 1 } },
    });
    if (customer) {
      await this.prisma.healthArticleRead.create({
        data: {
          shopId: shop.shopId,
          articleId: row.id,
          customerId: customer.id,
        },
      });
    }
    return {
      id: row.id,
      title: row.title,
      kind: row.kind,
      coverImage: row.coverImage,
      mediaUrl: row.mediaUrl,
      summary: row.summary,
      contentHtml: row.contentHtml,
      authorName: row.authorName,
      tags: jsonArr<string>(row.tagsJson),
      viewCount: row.viewCount + 1,
      likeCount: row.likeCount,
      publishedAt: toIso(row.publishedAt ?? row.createdAt),
    };
  }

  async articleCategories(shop: HealthPublicShop) {
    const rows = await this.prisma.healthArticleCategory.findMany({
      where: { shopId: shop.shopId, status: 'ON' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async posts(
    shop: HealthPublicShop,
    query: { keyword: string; tag: string; page: string; pageSize: string },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = {
      shopId: shop.shopId,
      status: 'ON',
      auditStatus: 'APPROVED',
      ...(query.tag ? { tagsJson: { string_contains: `"${query.tag}"` } } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword } },
              { content: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthPost.findMany({
        where,
        orderBy: [{ topFlag: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.healthPost.count({ where }),
    ]);
    const customerIds = [
      ...new Set(rows.map((row) => row.customerId).filter((id) => id > 0)),
    ];
    const practitionerIds = [
      ...new Set(
        rows.map((row) => row.authorPractitionerId).filter((id) => id > 0),
      ),
    ];
    const [customers, practitioners] = await Promise.all([
      customerIds.length
        ? this.prisma.healthCustomer.findMany({
            where: { shopId: shop.shopId, id: { in: customerIds } },
            select: { id: true, nickname: true, avatar: true },
          })
        : [],
      practitionerIds.length
        ? this.prisma.healthPractitioner.findMany({
            where: { shopId: shop.shopId, id: { in: practitionerIds } },
            select: { id: true, name: true, avatar: true },
          })
        : [],
    ]);
    const customerMap = new Map(customers.map((row) => [row.id, row]));
    const practitionerMap = new Map(practitioners.map((row) => [row.id, row]));
    return pageOf(
      rows.map((row) => {
        const practitioner = practitionerMap.get(row.authorPractitionerId);
        const author = customerMap.get(row.customerId);
        return {
          id: row.id,
          title: row.title,
          content: clip(row.content, 200),
          images: jsonArr<string>(row.imagesJson).slice(0, 3),
          tags: jsonArr<string>(row.tagsJson),
          topic: row.topic,
          authorKind: row.authorKind,
          authorName:
            row.authorKind === 'PRACTITIONER' && practitioner
              ? practitioner.name
              : author?.nickname || '病友',
          authorAvatar: practitioner?.avatar || author?.avatar || '',
          likeCount: row.likeCount,
          commentCount: row.commentCount,
          createdAt: toIso(row.createdAt),
        };
      }),
      total,
      page,
      pageSize,
    );
  }

  async postDetail(shop: HealthPublicShop, postId: number) {
    const row = await this.prisma.healthPost.findFirst({
      where: {
        id: postId,
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '帖子不存在或未通过审核',
      );
    await this.prisma.healthPost.update({
      where: { id: row.id },
      data: { viewCount: { increment: 1 } },
    });
    const [comments, customer, practitioner] = await Promise.all([
      this.prisma.healthPostComment.findMany({
        where: { shopId: shop.shopId, postId, status: 'APPROVED' },
        orderBy: { id: 'asc' },
        take: 100,
      }),
      row.customerId > 0
        ? this.prisma.healthCustomer.findFirst({
            where: { shopId: shop.shopId, id: row.customerId },
            select: { nickname: true, avatar: true },
          })
        : null,
      row.authorPractitionerId > 0
        ? this.prisma.healthPractitioner.findFirst({
            where: { shopId: shop.shopId, id: row.authorPractitionerId },
            select: { name: true, avatar: true },
          })
        : null,
    ]);
    const commenterIds = [
      ...new Set(
        comments.map((item) => item.customerId).filter((id) => id > 0),
      ),
    ];
    const commenters = commenterIds.length
      ? await this.prisma.healthCustomer.findMany({
          where: { shopId: shop.shopId, id: { in: commenterIds } },
          select: { id: true, nickname: true, avatar: true },
        })
      : [];
    const commenterMap = new Map(commenters.map((item) => [item.id, item]));
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      images: jsonArr<string>(row.imagesJson),
      tags: jsonArr<string>(row.tagsJson),
      topic: row.topic,
      authorKind: row.authorKind,
      authorName:
        row.authorKind === 'PRACTITIONER' && practitioner
          ? practitioner.name
          : customer?.nickname || '病友',
      authorAvatar: practitioner?.avatar || customer?.avatar || '',
      likeCount: row.likeCount,
      viewCount: row.viewCount + 1,
      createdAt: toIso(row.createdAt),
      comments: comments.map((item) => ({
        id: item.id,
        content: item.content,
        parentId: item.parentId,
        authorName: commenterMap.get(item.customerId)?.nickname || '病友',
        authorAvatar: commenterMap.get(item.customerId)?.avatar ?? '',
        createdAt: toIso(item.createdAt),
      })),
      notice: '病友圈内容为病友经验交流，不构成医疗建议。',
    };
  }

  async createPost(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      title: string;
      content: string;
      images: string[];
      tags: string[];
      topic: string;
    },
  ) {
    const content = clip(body.content, 2000);
    if (content.length < 5)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '内容至少 5 个字');
    const auditFirst = shop.trade.postAuditFirst;
    const row = await this.prisma.healthPost.create({
      data: {
        shopId: shop.shopId,
        customerId: customer.id,
        title: clip(body.title, 120),
        content,
        imagesJson: body.images.slice(0, 9).map((item) => clip(item, 500)),
        tagsJson: body.tags.slice(0, 6).map((item) => clip(item, 30)),
        topic: clip(body.topic, 60),
        auditStatus: auditFirst ? 'PENDING' : 'APPROVED',
      },
    });
    return {
      id: row.id,
      auditStatus: row.auditStatus,
      message: auditFirst ? '已提交，审核通过后展示' : '发布成功',
    };
  }

  async commentPost(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: { postId: number; parentId: number; content: string },
  ) {
    const post = await this.prisma.healthPost.findFirst({
      where: {
        id: body.postId,
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
    });
    if (!post)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '帖子不存在或未通过审核',
      );
    const content = clip(body.content, 500);
    if (!content)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写评论内容');
    const row = await this.prisma.healthPostComment.create({
      data: {
        shopId: shop.shopId,
        postId: post.id,
        customerId: customer.id,
        parentId: body.parentId,
        content,
        status: shop.trade.postAuditFirst ? 'PENDING' : 'APPROVED',
      },
    });
    if (row.status === 'APPROVED') {
      await this.prisma.healthPost.update({
        where: { id: post.id },
        data: { commentCount: { increment: 1 } },
      });
    }
    return {
      id: row.id,
      status: row.status,
      message: row.status === 'PENDING' ? '评论已提交审核' : '评论成功',
    };
  }

  async likePost(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    postId: number,
  ) {
    const post = await this.prisma.healthPost.findFirst({
      where: {
        id: postId,
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
    });
    if (!post)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '帖子不存在或未通过审核',
      );
    const existing = await this.prisma.healthPostLike.findUnique({
      where: {
        targetType_targetId_customerId: {
          targetType: 'POST',
          targetId: postId,
          customerId: customer.id,
        },
      },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.healthPostLike.delete({ where: { id: existing.id } }),
        this.prisma.healthPost.update({
          where: { id: postId },
          data: {
            likeCount: post.likeCount > 0 ? { decrement: 1 } : { increment: 0 },
          },
        }),
      ]);
      return { liked: false, likeCount: Math.max(0, post.likeCount - 1) };
    }
    await this.prisma.$transaction([
      this.prisma.healthPostLike.create({
        data: {
          shopId: shop.shopId,
          targetType: 'POST',
          targetId: postId,
          customerId: customer.id,
        },
      }),
      this.prisma.healthPost.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);
    return { liked: true, likeCount: post.likeCount + 1 };
  }

  async questions(
    shop: HealthPublicShop,
    query: { keyword: string; page: string; pageSize: string },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = {
      shopId: shop.shopId,
      isPublic: true,
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword } },
              { detail: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthQuestion.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.healthQuestion.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        detail: clip(row.detail, 120),
        bountyCents: row.bountyCents,
        answerCount: row.answerCount,
        status: row.status,
        createdAt: toIso(row.createdAt),
      })),
      total,
      page,
      pageSize,
    );
  }

  async questionDetail(shop: HealthPublicShop, questionId: number) {
    const row = await this.prisma.healthQuestion.findFirst({
      where: { id: questionId, shopId: shop.shopId, isPublic: true },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '问题不存在');
    const answers = await this.prisma.healthAnswer.findMany({
      where: { shopId: shop.shopId, questionId, auditStatus: 'APPROVED' },
      orderBy: [{ adopted: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    const ids = [
      ...new Set(
        answers.map((item) => item.practitionerId).filter((id) => id > 0),
      ),
    ];
    const members = ids.length
      ? await this.prisma.healthPractitioner.findMany({
          where: { shopId: shop.shopId, id: { in: ids } },
          select: { id: true, name: true, title: true, avatar: true },
        })
      : [];
    const memberMap = new Map(members.map((item) => [item.id, item]));
    return {
      id: row.id,
      title: row.title,
      detail: row.detail,
      bountyCents: row.bountyCents,
      status: row.status,
      adoptedAnswerId: row.adoptedAnswerId,
      createdAt: toIso(row.createdAt),
      answers: answers.map((item) => ({
        id: item.id,
        content: item.content,
        adopted: item.adopted,
        likeCount: item.likeCount,
        practitionerName:
          memberMap.get(item.practitionerId)?.name ?? '认证医护',
        practitionerTitle: memberMap.get(item.practitionerId)?.title ?? '',
        practitionerAvatar: memberMap.get(item.practitionerId)?.avatar ?? '',
        createdAt: toIso(item.createdAt),
      })),
      disclaimer: '问答内容仅供参考，不构成诊断或用药建议。',
    };
  }

  async createQuestion(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      title: string;
      detail: string;
      patientId: number;
      bountyCents: number;
    },
  ) {
    const title = clip(body.title, 120);
    if (!title)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写问题标题');
    if (body.patientId > 0)
      await this.patientOf(shop.shopId, customer.id, body.patientId);
    const row = await this.prisma.healthQuestion.create({
      data: {
        shopId: shop.shopId,
        customerId: customer.id,
        patientId: body.patientId,
        title,
        detail: clip(body.detail, 2000),
        bountyCents: Math.max(
          0,
          Math.min(100_000, Math.round(body.bountyCents)),
        ),
        isPublic: true,
      },
    });
    return { id: row.id, status: row.status };
  }

  async hotKeywords(shop: HealthPublicShop) {
    const rows = await this.prisma.healthHotKeyword.findMany({
      where: { shopId: shop.shopId, status: 'ON' },
      orderBy: [{ searchNum: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return rows.map((row) => row.word);
  }

  async logSearch(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer | null,
    keyword: string,
  ) {
    const value = clip(keyword, 60);
    if (!value) return { ok: true };
    await this.prisma.healthSearchLog.create({
      data: {
        shopId: shop.shopId,
        customerId: customer?.id ?? 0,
        keyword: value,
      },
    });
    return { ok: true };
  }

  // ---------- 商品与购物车 ----------

  async goodsCategories(shop: HealthPublicShop) {
    const rows = await this.prisma.healthGoodsCategory.findMany({
      where: { shopId: shop.shopId, status: 'ON' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      icon: row.icon,
    }));
  }

  async goods(
    shop: HealthPublicShop,
    query: {
      keyword: string;
      categoryId: number;
      page: string;
      pageSize: string;
    },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const where = {
      shopId: shop.shopId,
      status: 'ON',
      auditStatus: 'APPROVED',
      ...(query.categoryId > 0 ? { categoryId: query.categoryId } : {}),
      ...(query.keyword ? { name: { contains: query.keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthGoods.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.healthGoods.count({ where }),
    ]);
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        subtitle: row.subtitle,
        coverImage: row.coverImage,
        priceCents: row.priceCents,
        originPriceCents: row.originPriceCents,
        stock: row.stock,
        sales: row.sales,
        unit: row.unit,
        kind: row.kind,
        isRx: row.isRx,
      })),
      total,
      page,
      pageSize,
    );
  }

  async goodsDetail(shop: HealthPublicShop, goodsId: number) {
    const row = await this.prisma.healthGoods.findFirst({
      where: {
        id: goodsId,
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在或已下架');
    const skus = row.skuMode
      ? await this.prisma.healthGoodsSku.findMany({
          where: { shopId: shop.shopId, goodsId, status: 'ON' },
          orderBy: [{ sort: 'asc' }, { id: 'asc' }],
        })
      : [];
    const reviews = await this.prisma.healthReview.findMany({
      where: {
        shopId: shop.shopId,
        targetType: 'GOODS',
        targetId: goodsId,
        status: 'PUBLISHED',
      },
      orderBy: { id: 'desc' },
      take: 5,
    });
    return {
      id: row.id,
      name: row.name,
      subtitle: row.subtitle,
      coverImage: row.coverImage,
      images: jsonArr<string>(row.imagesJson),
      detailHtml: row.detailHtml,
      priceCents: row.priceCents,
      originPriceCents: row.originPriceCents,
      stock: row.stock,
      sales: row.sales,
      unit: row.unit,
      kind: row.kind,
      spec: row.spec,
      skuMode: row.skuMode,
      isRx: row.isRx,
      tags: jsonArr<string>(row.tagsJson),
      skus: skus.map((item) => ({
        id: item.id,
        specText: item.specText,
        specs: jsonArr<Record<string, unknown>>(item.specsJson),
        priceCents: item.priceCents,
        stock: item.stock,
        image: item.image,
      })),
      reviews: reviews.map((item) => ({
        score: item.score,
        content: item.anonymous ? '匿名评价' : item.content,
        tags: jsonArr<string>(item.tagsJson),
        createdAt: toIso(item.createdAt),
      })),
      rxNotice: row.isRx
        ? '该商品为处方药，下单前需有审核通过的有效处方。'
        : '',
    };
  }

  async cart(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const rows = await this.prisma.healthCart.findMany({
      where: { shopId: shop.shopId, customerId: customer.id },
      orderBy: { id: 'desc' },
    });
    const goodsIds = [...new Set(rows.map((row) => row.goodsId))];
    const goods = goodsIds.length
      ? await this.prisma.healthGoods.findMany({
          where: { shopId: shop.shopId, id: { in: goodsIds } },
        })
      : [];
    const skuIds = rows.map((row) => row.skuId).filter((id) => id > 0);
    const skus = skuIds.length
      ? await this.prisma.healthGoodsSku.findMany({
          where: { shopId: shop.shopId, id: { in: skuIds } },
        })
      : [];
    const goodsMap = new Map(goods.map((row) => [row.id, row]));
    const skuMap = new Map(skus.map((row) => [row.id, row]));
    return {
      list: rows.map((row) => {
        const goodsRow = goodsMap.get(row.goodsId);
        const sku = row.skuId ? skuMap.get(row.skuId) : null;
        return {
          id: row.id,
          goodsId: row.goodsId,
          skuId: row.skuId,
          quantity: row.quantity,
          checked: row.checked,
          name: goodsRow?.name ?? '商品已下架',
          coverImage: sku?.image || goodsRow?.coverImage || '',
          specText: sku?.specText || goodsRow?.spec || '',
          priceCents: sku?.priceCents ?? goodsRow?.priceCents ?? 0,
          stock: sku?.stock ?? goodsRow?.stock ?? 0,
          available: Boolean(goodsRow && goodsRow.status === 'ON'),
        };
      }),
    };
  }

  async saveCart(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      goodsId: number;
      skuId: number;
      quantity: number;
      checked: boolean;
      remove: boolean;
    },
  ) {
    const goods = await this.prisma.healthGoods.findFirst({
      where: {
        id: body.goodsId,
        shopId: shop.shopId,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
    });
    if (!goods)
      throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在或已下架');
    const where = {
      customerId_goodsId_skuId: {
        customerId: customer.id,
        goodsId: body.goodsId,
        skuId: body.skuId,
      },
    };
    if (body.remove) {
      await this.prisma.healthCart.deleteMany({
        where: { shopId: shop.shopId, ...where },
      });
      return { ok: true };
    }
    const quantity = Math.max(1, Math.min(99, Math.round(body.quantity)));
    const row = await this.prisma.healthCart.upsert({
      where,
      create: {
        shopId: shop.shopId,
        customerId: customer.id,
        goodsId: body.goodsId,
        skuId: body.skuId,
        quantity,
        checked: body.checked,
      },
      update: { quantity, checked: body.checked },
    });
    return { id: row.id, quantity: row.quantity };
  }

  // ---------- 地址簿 ----------

  async addresses(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const rows = await this.prisma.healthCustomerAddress.findMany({
      where: { shopId: shop.shopId, customerId: customer.id },
      orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      receiver: row.receiver,
      phone: maskPhone(row.phone),
      province: row.province,
      city: row.city,
      district: row.district,
      detail: row.detail,
      tag: row.tag,
      isDefault: row.isDefault,
    }));
  }

  async saveAddress(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      id: number;
      receiver: string;
      phone: string;
      province: string;
      city: string;
      district: string;
      detail: string;
      tag: string;
      isDefault: boolean;
    },
  ) {
    const receiver = clip(body.receiver, 60);
    const phone = clip(body.phone, 32);
    const detail = clip(body.detail, 200);
    if (!receiver || !detail || (body.id <= 0 && !phone)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写收货人、手机号与详细地址',
      );
    }
    if (body.isDefault) {
      await this.prisma.healthCustomerAddress.updateMany({
        where: { shopId: shop.shopId, customerId: customer.id },
        data: { isDefault: false },
      });
    }
    const data = {
      shopId: shop.shopId,
      customerId: customer.id,
      receiver,
      // 列表只回脱敏手机号，编辑时留空表示不修改，避免把掩码写回库
      ...(body.id > 0 && !phone ? {} : { phone }),
      province: clip(body.province, 30),
      city: clip(body.city, 30),
      district: clip(body.district, 30),
      detail,
      tag: clip(body.tag, 20),
      isDefault: body.isDefault,
    };
    if (body.id > 0) {
      const row = await this.prisma.healthCustomerAddress.findFirst({
        where: { id: body.id, shopId: shop.shopId, customerId: customer.id },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '地址不存在');
      return this.prisma.healthCustomerAddress.update({
        where: { id: row.id },
        data,
      });
    }
    const count = await this.prisma.healthCustomerAddress.count({
      where: { shopId: shop.shopId, customerId: customer.id },
    });
    if (count >= 20)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '最多保存 20 个地址');
    return this.prisma.healthCustomerAddress.create({
      // 新建时 phone 已在上方校验非空；这里显式写入，避免可选展开导致类型丢失
      data: { ...data, phone, isDefault: body.isDefault || count === 0 },
    });
  }

  async removeAddress(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    addressId: number,
  ) {
    await this.prisma.healthCustomerAddress.deleteMany({
      where: { id: addressId, shopId: shop.shopId, customerId: customer.id },
    });
    return { ok: true };
  }

  // ---------- 营销资产 ----------

  async coupons(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const now = new Date();
    const [tickets, coupons] = await Promise.all([
      this.prisma.healthCouponTicket.findMany({
        where: { shopId: shop.shopId, customerId: customer.id },
        orderBy: { id: 'desc' },
        take: 100,
      }),
      this.prisma.healthCoupon.findMany({
        where: { shopId: shop.shopId, status: 'ON' },
      }),
    ]);
    const couponMap = new Map(coupons.map((row) => [row.id, row]));
    return tickets.map((row) => {
      const coupon = couponMap.get(row.couponId);
      return {
        id: row.id,
        name: coupon?.name ?? '优惠券',
        kind: coupon?.kind ?? 'CASH',
        valueCents: coupon?.valueCents ?? 0,
        discountPercent: coupon?.discountPercent ?? 100,
        minAmountCents: coupon?.minAmountCents ?? 0,
        bizTypes: jsonArr<string>(coupon?.bizTypesJson),
        goodsIds: jsonArr<number>(coupon?.goodsIdsJson),
        status: row.status,
        startAt: toIso(row.startAt),
        endAt: toIso(row.endAt),
        usable:
          row.status === 'AVAILABLE' && row.startAt <= now && row.endAt >= now,
      };
    });
  }

  async points(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const [logs, rules] = await Promise.all([
      this.prisma.healthPointLog.findMany({
        where: { shopId: shop.shopId, customerId: customer.id },
        orderBy: { id: 'desc' },
        take: 100,
      }),
      this.prisma.healthPointRule.findMany({
        where: { shopId: shop.shopId, status: 'ON' },
      }),
    ]);
    return {
      balance: customer.points,
      logs: logs.map((row) => ({
        id: row.id,
        value: row.value,
        balance: row.balance,
        scene: row.scene,
        note: row.note,
        createdAt: toIso(row.createdAt),
      })),
      rules: rules.map((row) => ({
        scene: row.scene,
        label: row.label,
        value: row.value,
        percent: row.percent,
      })),
    };
  }

  async wallet(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const rows = await this.prisma.healthWalletLog.findMany({
      where: { shopId: shop.shopId, customerId: customer.id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return {
      balanceCents: customer.walletCents,
      logs: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amountCents: row.amountCents,
        balanceCents: row.balanceCents,
        note: row.note,
        createdAt: toIso(row.createdAt),
      })),
    };
  }

  async signPackages(shop: HealthPublicShop, teamId: number) {
    const rows = await this.prisma.healthSignPackage.findMany({
      where: {
        shopId: shop.shopId,
        status: 'ON',
        ...(teamId > 0 ? { teamId } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      desc: row.desc,
      coverImage: row.coverImage,
      priceCents: row.priceCents,
      years: row.years,
      validDays: row.validDays,
      teamId: row.teamId,
      practitionerId: row.practitionerId,
      rights: jsonArr<Record<string, unknown>>(row.rightsJson),
    }));
  }

  async examPackages(
    shop: HealthPublicShop,
    query: { keyword: string; cityId: number },
  ) {
    const rows = await this.prisma.healthExamPackage.findMany({
      where: {
        shopId: shop.shopId,
        status: 'ON',
        ...(query.cityId > 0 ? { cityId: query.cityId } : {}),
        ...(query.keyword ? { name: { contains: query.keyword } } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      coverImage: row.coverImage,
      priceCents: row.priceCents,
      originPriceCents: row.originPriceCents,
      hot: row.hot,
      desc: clip(row.desc, 120),
      crowdKinds: jsonArr<string>(row.crowdKindsJson),
    }));
  }

  async examPackageDetail(shop: HealthPublicShop, packageId: number) {
    const row = await this.prisma.healthExamPackage.findFirst({
      where: { id: packageId, shopId: shop.shopId, status: 'ON' },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '体检套餐不存在或已下架',
      );
    const links = await this.prisma.healthExamPackageItem.findMany({
      where: { shopId: shop.shopId, packageId },
    });
    const itemIds = links.map((item) => item.itemId);
    const items = itemIds.length
      ? await this.prisma.healthExamItem.findMany({
          where: { shopId: shop.shopId, id: { in: itemIds } },
        })
      : [];
    const itemMap = new Map(items.map((item) => [item.id, item]));
    return {
      id: row.id,
      name: row.name,
      coverImage: row.coverImage,
      priceCents: row.priceCents,
      originPriceCents: row.originPriceCents,
      desc: row.desc,
      intro: row.intro,
      notice: row.notice,
      includeItems: jsonArr<Record<string, unknown>>(row.includeItemsJson),
      items: links.map((link) => ({
        id: link.itemId,
        name: itemMap.get(link.itemId)?.name ?? '',
        mode: link.mode,
      })),
      disclaimer: '体检结果请以出具机构报告为准，本工具不提供诊断结论。',
    };
  }

  // ---------- 推客 ----------

  async promoterHit(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer | null,
    code: string,
  ) {
    const value = clip(code, 24);
    if (!value)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少推客码');
    const promoter = await this.prisma.healthPromoter.findFirst({
      where: {
        shopId: shop.shopId,
        code: value,
        status: 'ON',
        auditStatus: 'APPROVED',
      },
      select: { id: true },
    });
    if (!promoter)
      throw new BusinessException(ErrorCode.NOT_FOUND, '推客码无效或已停用');
    await this.prisma.healthPromoteLog.create({
      data: {
        shopId: shop.shopId,
        promoterId: promoter.id,
        customerId: customer?.id ?? 0,
        kind: 'CLICK',
      },
    });
    if (!customer) return { bound: false, reason: '登录后自动绑定' };
    const promoterId = await this.attributePromoter(
      shop.shopId,
      customer.id,
      value,
    );
    return { bound: promoterId === promoter.id, promoterId };
  }

  async promoterShare(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    page: string,
  ) {
    const relation = await this.prisma.healthPromoterRelation.findUnique({
      where: {
        shopId_customerId: { shopId: shop.shopId, customerId: customer.id },
      },
      select: { promoterId: true },
    });
    if (!relation) return { code: '' };
    const promoter = await this.prisma.healthPromoter.findFirst({
      where: { id: relation.promoterId, shopId: shop.shopId },
      select: { code: true },
    });
    if (!promoter) return { code: '' };
    await this.prisma.healthPromoteLog.create({
      data: {
        shopId: shop.shopId,
        promoterId: relation.promoterId,
        customerId: customer.id,
        kind: 'SHARE',
        page: clip(page, 120),
      },
    });
    return { code: promoter.code };
  }

  /** 推客码：8 位大写字母数字，避开易混字符；碰撞时重试。 */
  private async newPromoterCode() {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const bytes = randomBytes(8);
      let code = '';
      for (let i = 0; i < 8; i += 1) {
        code += alphabet[bytes[i] % alphabet.length];
      }
      const hit = await this.prisma.healthPromoter.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!hit) return code;
    }
    throw new BusinessException(
      ErrorCode.SERVICE_UNAVAILABLE,
      '推客码生成失败，请稍后重试',
    );
  }

  /** 海报目标 → 小程序落地页，带上推客码让首次进入自动归因。 */
  private posterSharePath(
    refType: string,
    refId: number,
    code: string,
    shopCode: string,
  ) {
    const promoter = code ? encodeURIComponent(code) : '';
    const base = (() => {
      switch (refType) {
        case 'SERVICE':
          return refId
            ? `/consumer/service/detail?id=${refId}`
            : '/consumer/service/list';
        case 'GOODS':
          return refId
            ? `/consumer/mall/detail?id=${refId}`
            : '/consumer/mall/list';
        case 'EXAM':
          return '/consumer/service/list?bizType=EXAM';
        case 'SIGN_PKG':
          return '/consumer/service/list?bizType=SIGN_PKG';
        case 'ARTICLE':
          return refId
            ? `/consumer/article/detail?id=${refId}`
            : '/consumer/article/list';
        default:
          return '/pages/index/index';
      }
    })();
    const query = [`shopCode=${encodeURIComponent(shopCode)}`];
    if (promoter) query.push(`promoter=${promoter}`);
    return base + (base.includes('?') ? '&' : '?') + query.join('&');
  }

  /** 推客中心：申请状态、推广码、收益与可用海报。 */
  async promoterCenter(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const trade = shop.trade;
    const base = {
      enabled: trade.promoterEnabled,
      shopName: shop.name,
      defaultRatePercent: trade.promoterRatePercent,
      promoter: null as Record<string, unknown> | null,
      posters: [] as Record<string, unknown>[],
    };
    const promoter = await this.prisma.healthPromoter.findFirst({
      where: { shopId: shop.shopId, customerId: customer.id },
    });
    if (!promoter) return base;
    const [bindCount, orderCount, settled] = await Promise.all([
      this.prisma.healthPromoterRelation.count({
        where: { shopId: shop.shopId, promoterId: promoter.id },
      }),
      this.prisma.healthPromoteLog.count({
        where: {
          shopId: shop.shopId,
          promoterId: promoter.id,
          kind: 'ORDER',
        },
      }),
      this.prisma.healthOrderShare.aggregate({
        where: {
          shopId: shop.shopId,
          earnerKind: 'PROMOTER',
          earnerId: promoter.id,
          status: 'SETTLED',
        },
        _sum: { shareCents: true },
      }),
    ]);
    const rate = Number(
      jsonObj<Record<string, unknown>>(promoter.ratesJson, {}).self ?? 0,
    );
    const earningCents = Number(settled._sum.shareCents ?? 0);
    const approved =
      promoter.auditStatus === 'APPROVED' && promoter.status === 'ON';
    const posters = approved
      ? (
          await this.prisma.healthPoster.findMany({
            where: { shopId: shop.shopId, status: 'ON' },
            orderBy: [{ sort: 'asc' }, { id: 'desc' }],
            take: 20,
          })
        ).map((row) => {
          const layout = jsonObj<Record<string, unknown>>(row.layoutJson, {});
          return {
            id: row.id,
            name: row.name,
            background: row.bgImage,
            titleText: strOf(layout.titleText, 60),
            subtitleText: strOf(layout.subtitleText, 120),
            targetType: row.refType,
            targetId: row.refId,
            sharePath: this.posterSharePath(
              row.refType,
              row.refId,
              promoter.code,
              shop.shopCode,
            ),
          };
        })
      : [];
    return {
      ...base,
      promoter: {
        id: promoter.id,
        code: promoter.code,
        name: promoter.name,
        auditStatus: promoter.auditStatus,
        auditReason: promoter.auditReason,
        phone: promoter.phone,
        ratePercent: rate > 0 ? rate : trade.promoterRatePercent,
        bindCustomerCount: bindCount,
        orderCount,
        earningCents,
        settleableCents: Math.max(0, earningCents - promoter.settledCents),
        createdAt: toIso(promoter.createdAt),
      },
      posters,
    };
  }

  /** 顾客申请成为推客：店铺开启推广后建档为 PENDING，由店主审核。 */
  async promoterApply(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: { name: string; phone: string },
  ) {
    if (!shop.trade.promoterEnabled) {
      throw new BusinessException(
        ErrorCode.FEATURE_CLOSED,
        '店铺暂未开放推广分销',
      );
    }
    const existing = await this.prisma.healthPromoter.findFirst({
      where: { shopId: shop.shopId, customerId: customer.id },
    });
    if (existing) {
      if (existing.auditStatus !== 'REJECTED') {
        return this.promoterCenter(shop, customer);
      }
      await this.prisma.healthPromoter.update({
        where: { id: existing.id },
        data: {
          auditStatus: 'PENDING',
          status: 'OFF',
          auditReason: '',
          name:
            clip(body.name, 60) || existing.name || customer.nickname || '推客',
          phone: clip(body.phone, 32) || existing.phone || customer.phone || '',
        },
      });
      return this.promoterCenter(shop, customer);
    }
    const code = await this.newPromoterCode();
    await this.prisma.healthPromoter.create({
      data: {
        shopId: shop.shopId,
        customerId: customer.id,
        name: clip(body.name, 60) || customer.nickname || '推客',
        phone: clip(body.phone, 32) || customer.phone || '',
        code,
        auditStatus: 'PENDING',
        status: 'OFF',
        ratesJson: {} as never,
      },
    });
    return this.promoterCenter(shop, customer);
  }

  // ---------- 统一订单：算价 ----------

  private async resolveLines(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    input: PublicOrderInput,
  ) {
    const lines: OrderItemDraft[] = [];
    let slot: SlotRow | null = null;
    if (input.slotId > 0) {
      slot = await this.prisma.healthSlot.findFirst({
        where: { id: input.slotId, shopId: shop.shopId },
        select: {
          id: true,
          serviceId: true,
          practitionerId: true,
          priceCents: true,
          quota: true,
          occupied: true,
          status: true,
          workDate: true,
          startTime: true,
        },
      });
      if (!slot)
        throw new BusinessException(ErrorCode.NOT_FOUND, '所选号源不存在');
      if (slot.status !== 'AVAILABLE' || slot.occupied >= slot.quota) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '所选号源已被约满，请重新选择时间',
        );
      }
    }
    for (const entry of input.items) {
      const quantity = Math.max(
        1,
        Math.min(20, Math.round(entry.quantity) || 1),
      );
      if (entry.itemType === 'GOODS') {
        const goods = await this.prisma.healthGoods.findFirst({
          where: {
            id: entry.refId,
            shopId: shop.shopId,
            status: 'ON',
            auditStatus: 'APPROVED',
          },
        });
        if (!goods)
          throw new BusinessException(
            ErrorCode.NOT_FOUND,
            '商品不存在或已下架',
          );
        let priceCents = goods.priceCents;
        let specText = goods.spec;
        let stock = goods.stock;
        let coverImage = goods.coverImage;
        if (entry.skuId > 0) {
          const sku = await this.prisma.healthGoodsSku.findFirst({
            where: {
              id: entry.skuId,
              shopId: shop.shopId,
              goodsId: goods.id,
              status: 'ON',
            },
          });
          if (!sku)
            throw new BusinessException(
              ErrorCode.NOT_FOUND,
              '商品规格不存在或已下架',
            );
          priceCents = sku.priceCents;
          specText = sku.specText;
          stock = Math.min(stock, sku.stock);
          coverImage = sku.image || coverImage;
        }
        if (stock < quantity) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            `「${goods.name}」库存不足`,
          );
        }
        if (entry.patientId > 0)
          await this.patientOf(shop.shopId, customer.id, entry.patientId);
        if (goods.isRx && shop.trade.prescriptionDrugGuard) {
          if (entry.patientId <= 0) {
            throw new BusinessException(
              ErrorCode.BAD_REQUEST,
              '处方药需选择就诊人并出示有效处方',
            );
          }
          const rx = await this.prisma.healthPrescription.findFirst({
            where: {
              shopId: shop.shopId,
              patientId: entry.patientId,
              status: 'APPROVED',
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          });
          if (!rx) {
            throw new BusinessException(
              ErrorCode.CONFLICT,
              `「${goods.name}」是处方药，请先完成问诊并取得药师审核通过的有效处方`,
            );
          }
        }
        lines.push({
          itemType: 'GOODS',
          refId: goods.id,
          name: goods.name,
          specText,
          coverImage,
          priceCents,
          quantity,
          patientId: entry.patientId,
          practitionerId: 0,
          isRx: goods.isRx,
        });
        continue;
      }
      if (entry.itemType === 'EXAM') {
        const pkg = await this.prisma.healthExamPackage.findFirst({
          where: { id: entry.refId, shopId: shop.shopId, status: 'ON' },
        });
        if (!pkg)
          throw new BusinessException(
            ErrorCode.NOT_FOUND,
            '体检套餐不存在或已下架',
          );
        if (entry.patientId > 0)
          await this.patientOf(shop.shopId, customer.id, entry.patientId);
        lines.push({
          itemType: 'EXAM',
          refId: pkg.id,
          name: pkg.name,
          specText: '',
          coverImage: pkg.coverImage,
          priceCents: pkg.priceCents,
          quantity,
          patientId: entry.patientId,
          practitionerId: 0,
        });
        continue;
      }
      if (entry.itemType === 'SIGN') {
        const pkg = await this.prisma.healthSignPackage.findFirst({
          where: { id: entry.refId, shopId: shop.shopId, status: 'ON' },
        });
        if (!pkg)
          throw new BusinessException(
            ErrorCode.NOT_FOUND,
            '签约服务包不存在或已下架',
          );
        if (entry.patientId > 0)
          await this.patientOf(shop.shopId, customer.id, entry.patientId);
        lines.push({
          itemType: 'SIGN',
          refId: pkg.id,
          name: pkg.name,
          specText: `${pkg.years} 年`,
          coverImage: pkg.coverImage,
          priceCents: pkg.priceCents,
          quantity: 1,
          patientId: entry.patientId,
          practitionerId: pkg.practitionerId,
        });
        continue;
      }
      if (entry.itemType === 'MEMBER_CARD') {
        const card = await this.prisma.healthMemberCard.findFirst({
          where: { id: entry.refId, shopId: shop.shopId, status: 'ON' },
        });
        if (!card)
          throw new BusinessException(
            ErrorCode.NOT_FOUND,
            '会员卡不存在或已下架',
          );
        lines.push({
          itemType: 'MEMBER_CARD',
          refId: card.id,
          name: card.name,
          specText: `有效期 ${card.validDays} 天`,
          coverImage: card.coverImage,
          priceCents: card.priceCents,
          quantity: 1,
          patientId: 0,
          practitionerId: 0,
        });
        continue;
      }
      const service = await this.prisma.healthService.findFirst({
        where: {
          id: entry.refId,
          shopId: shop.shopId,
          status: 'ON',
          auditStatus: 'APPROVED',
        },
      });
      if (!service)
        throw new BusinessException(ErrorCode.NOT_FOUND, '服务不存在或已下架');
      if (service.needSlot && input.slotId <= 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `「${service.name}」需选择预约时间`,
        );
      }
      if (
        service.needPatient &&
        entry.patientId <= 0 &&
        service.maxPatientCount > 0
      ) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `「${service.name}」需选择就诊人`,
        );
      }
      if (entry.patientId > 0)
        await this.patientOf(shop.shopId, customer.id, entry.patientId);
      let priceCents = service.priceCents;
      const practitionerId =
        entry.practitionerId ||
        (slot?.serviceId === service.id ? slot.practitionerId : 0);
      if (practitionerId > 0) {
        const pricing = await this.prisma.healthPractitionerService.findFirst({
          where: {
            shopId: shop.shopId,
            practitionerId,
            serviceId: service.id,
            status: 'ON',
          },
        });
        if (pricing && pricing.priceCents > 0) priceCents = pricing.priceCents;
      }
      lines.push({
        itemType: 'SERVICE',
        refId: service.id,
        name: service.name,
        specText:
          slot && slot.serviceId === service.id
            ? `${slot.workDate} ${slot.startTime}`
            : '',
        coverImage: service.coverImage,
        priceCents:
          slot && slot.serviceId === service.id && slot.priceCents > 0
            ? slot.priceCents
            : priceCents,
        quantity,
        patientId: entry.patientId,
        practitionerId,
      });
    }
    return { lines, slot };
  }

  private async quoteOf(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    lines: OrderItemDraft[],
    input: PublicOrderInput,
  ): Promise<PriceQuote> {
    let memberDiscountPercent = 100;
    if (customer.memberLevelId > 0) {
      const level = await this.prisma.healthMemberLevel.findFirst({
        where: {
          shopId: shop.shopId,
          levelValue: customer.memberLevelId,
          status: 'ON',
        },
      });
      if (level) memberDiscountPercent = level.discountPercent;
    }
    let coupon: {
      kind: string;
      valueCents: number;
      discountPercent: number;
      minAmountCents: number;
      goodsIds: number[];
      bizTypes: string[];
    } | null = null;
    if (input.couponTicketId > 0) {
      const ticket = await this.prisma.healthCouponTicket.findFirst({
        where: {
          id: input.couponTicketId,
          shopId: shop.shopId,
          customerId: customer.id,
        },
      });
      if (!ticket)
        throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券不存在');
      const now = new Date();
      if (
        ticket.status !== 'AVAILABLE' ||
        ticket.startAt > now ||
        ticket.endAt < now
      ) {
        throw new BusinessException(ErrorCode.CONFLICT, '优惠券已过期或已使用');
      }
      const rule = await this.prisma.healthCoupon.findFirst({
        where: { id: ticket.couponId, shopId: shop.shopId, status: 'ON' },
      });
      if (!rule)
        throw new BusinessException(ErrorCode.NOT_FOUND, '优惠券已停用');
      coupon = {
        kind: rule.kind,
        valueCents: rule.valueCents,
        discountPercent: rule.discountPercent,
        minAmountCents: rule.minAmountCents,
        goodsIds: jsonArr<number>(rule.goodsIdsJson),
        bizTypes: jsonArr<string>(rule.bizTypesJson),
      };
    }
    const isGoods = input.orderType === 'GOODS';
    return quoteOrder({
      bizType: input.orderType,
      lines: lines.map((line) => ({
        refId: line.refId,
        priceCents: line.priceCents,
        quantity: line.quantity,
      })),
      memberDiscountPercent,
      coupon,
      points:
        shop.trade.pointDeductEnabled && input.usePoints > 0
          ? {
              enabled: true,
              usePoints: input.usePoints,
              availablePoints: customer.points,
              centsPerPoint: CENTS_PER_POINT,
              maxPercent: shop.trade.pointDeductMaxPercent,
            }
          : null,
      shipping: isGoods
        ? {
            feeCents: shop.trade.defaultShippingCents,
            freeOverCents: shop.trade.freeShippingOverCents,
          }
        : null,
    });
  }

  private assertOrderType(input: PublicOrderInput) {
    if (!PUBLIC_ORDER_TYPES.has(input.orderType)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的订单类型');
    }
    if (!input.items.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择要购买的服务或商品',
      );
    }
    if (input.orderType.startsWith('CONSULT_') && !input.consult) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '问诊订单缺少问诊信息',
      );
    }
    if (input.orderType === 'GREEN' && !input.green) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '绿通订单缺少需求信息',
      );
    }
  }

  /** 试算：不写库，只回明细与券/积分抵扣结果，端上用于确认页。 */
  async preview(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    input: PublicOrderInput,
  ) {
    this.assertOrderType(input);
    const { lines, slot } = await this.resolveLines(shop, customer, input);
    const quote = await this.quoteOf(shop, customer, lines, input);
    return {
      lines: lines.map((line) => ({
        name: line.name,
        specText: line.specText,
        coverImage: line.coverImage,
        priceCents: line.priceCents,
        quantity: line.quantity,
        amountCents: line.priceCents * line.quantity,
      })),
      slot: slot
        ? { id: slot.id, text: `${slot.workDate} ${slot.startTime}` }
        : null,
      quote,
    };
  }

  // ---------- 统一订单：创建 ----------

  async createOrder(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    input: PublicOrderInput,
  ) {
    const bizType = input.orderType;
    this.assertOrderType(input);
    const { lines, slot } = await this.resolveLines(shop, customer, input);
    const quote = await this.quoteOf(shop, customer, lines, input);
    const addressRow =
      input.addressId > 0
        ? await this.prisma.healthCustomerAddress.findFirst({
            where: {
              id: input.addressId,
              shopId: shop.shopId,
              customerId: customer.id,
            },
            select: {
              receiver: true,
              phone: true,
              province: true,
              city: true,
              district: true,
              detail: true,
            },
          })
        : null;
    if (input.addressId > 0 && !addressRow) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '收货地址不存在');
    }
    if (
      bizType === 'GOODS' &&
      !addressRow &&
      (!input.receiver.name || !input.receiver.phone || !input.receiver.address)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '商品订单请填写收货人、手机号与收货地址',
      );
    }
    const patientIds = [
      ...new Set(lines.map((line) => line.patientId).filter((id) => id > 0)),
    ];
    const firstPatient = patientIds[0] ?? 0;
    const practitionerId =
      lines.find((line) => line.practitionerId > 0)?.practitionerId ?? 0;
    const orderNo = makeNo('HL');
    const autoCancelAt = new Date(
      Date.now() + shop.trade.autoCancelMinutes * 60_000,
    );
    const relation = await this.prisma.healthPromoterRelation.findUnique({
      where: {
        shopId_customerId: { shopId: shop.shopId, customerId: customer.id },
      },
      select: { promoterId: true },
    });
    const receiverJson = addressRow
      ? {
          name: addressRow.receiver,
          phone: addressRow.phone,
          address: `${addressRow.province}${addressRow.city}${addressRow.district}${addressRow.detail}`,
        }
      : input.receiver;

    const result = await this.prisma.$transaction(async (tx) => {
      if (slot) {
        const taken = await tx.healthSlot.updateMany({
          where: {
            id: slot.id,
            shopId: shop.shopId,
            status: 'AVAILABLE',
            occupied: slot.occupied,
          },
          data: {
            occupied: { increment: 1 },
            ...(slot.occupied + 1 >= slot.quota
              ? { status: 'BOOKED', patientId: firstPatient }
              : {}),
          },
        });
        if (taken.count === 0) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            '号源刚被占用，请重新选择时间',
          );
        }
      }
      for (const line of lines) {
        if (line.itemType !== 'GOODS') continue;
        const taken = await tx.healthGoods.updateMany({
          where: {
            id: line.refId,
            shopId: shop.shopId,
            stock: { gte: line.quantity },
          },
          data: { stock: { decrement: line.quantity } },
        });
        if (taken.count === 0) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            `「${line.name}」库存不足`,
          );
        }
      }
      if (input.couponTicketId > 0) {
        const used = await tx.healthCouponTicket.updateMany({
          where: {
            id: input.couponTicketId,
            shopId: shop.shopId,
            customerId: customer.id,
            status: 'AVAILABLE',
          },
          data: { status: 'USED', usedAt: new Date() },
        });
        if (used.count === 0) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            '优惠券已被使用，请重新选择',
          );
        }
      }
      if (quote.pointsUsed > 0) {
        const deducted = await tx.healthCustomer.updateMany({
          where: {
            id: customer.id,
            shopId: shop.shopId,
            pointValue: { gte: quote.pointsUsed },
          },
          data: { pointValue: { decrement: quote.pointsUsed } },
        });
        if (deducted.count === 0) {
          throw new BusinessException(
            ErrorCode.CONFLICT,
            '积分余额不足，请刷新后重试',
          );
        }
        await tx.healthPointLog.create({
          data: {
            shopId: shop.shopId,
            customerId: customer.id,
            value: -quote.pointsUsed,
            balance: customer.points - quote.pointsUsed,
            scene: 'ORDER',
            note: `订单 ${orderNo} 积分抵扣`,
          },
        });
      }
      const order = await tx.healthOrder.create({
        data: {
          shopId: shop.shopId,
          orderNo,
          orderType: bizType,
          customerId: customer.id,
          patientIdsJson: patientIds,
          serviceId:
            lines.find((line) => line.itemType === 'SERVICE')?.refId ?? 0,
          goodsAmountCents: quote.goodsCents,
          discountCents: quote.couponCents,
          shippingCents: quote.shippingCents,
          payAmountCents: quote.payCents,
          pointDeductCents: quote.pointDeductCents,
          couponTicketId: input.couponTicketId,
          status: 'PENDING_PAYMENT',
          slotId: slot?.id ?? 0,
          receiverJson,
          remark: clip(input.remark, 500),
          autoCancelAt,
          promoterId: relation?.promoterId ?? 0,
        },
      });
      await tx.healthOrderItem.createMany({
        data: lines.map((line) => ({
          shopId: shop.shopId,
          orderId: order.id,
          itemType: line.itemType,
          refId: line.refId,
          name: line.name,
          specText: line.specText,
          coverImage: line.coverImage,
          priceCents: line.priceCents,
          quantity: line.quantity,
          amountCents: line.priceCents * line.quantity,
          patientId: line.patientId,
          practitionerId: line.practitionerId,
        })),
      });
      await tx.healthOrderPriceFlow.createMany({
        data: quote.flows.map((flow) => ({
          shopId: shop.shopId,
          orderId: order.id,
          step: flow.step,
          label: flow.label,
          amountCents: flow.amountCents,
          refLabel: flow.refLabel,
        })),
      });
      await tx.healthOrderStatusLog.create({
        data: {
          shopId: shop.shopId,
          orderId: order.id,
          fromStatus: '',
          toStatus: 'PENDING_PAYMENT',
          action: 'CREATE',
          operatorType: 'CUSTOMER',
          operatorName: customer.nickname || `顾客#${customer.id}`,
          note: `顾客下单：${HEALTH_ORDER_BIZ_TYPE_LABELS[bizType]}`,
        },
      });
      if (input.couponTicketId > 0) {
        await tx.healthCouponTicket.updateMany({
          where: {
            id: input.couponTicketId,
            shopId: shop.shopId,
            customerId: customer.id,
          },
          data: { orderId: order.id },
        });
      }
      if (slot) {
        await tx.healthSlot.updateMany({
          where: { id: slot.id, shopId: shop.shopId, orderId: 0 },
          data: { orderId: order.id },
        });
      }
      if (bizType.startsWith('CONSULT_') && input.consult) {
        const consult = await tx.healthConsult.create({
          data: {
            shopId: shop.shopId,
            consultNo: makeNo('CS'),
            orderId: order.id,
            serviceId: order.serviceId,
            bizType,
            title: `${HEALTH_ORDER_BIZ_TYPE_LABELS[bizType]}·${customer.nickname || '顾客'}`,
            patientId: input.consult.patientId || firstPatient,
            customerId: customer.id,
            practitionerId: input.consult.practitionerId || practitionerId,
            slotId: slot?.id ?? 0,
            appointAt: dateOf(input.consult.appointAt),
            status: 'PENDING_PAYMENT',
            symptomText: clip(input.consult.symptomText, 2000),
            attachmentsJson: input.consult.attachments
              .slice(0, 9)
              .map((item) => clip(item, 500)),
            contactPhone: clip(input.consult.contactPhone, 32),
            meetingUrl: clip(input.consult.meetingUrl, 500),
            serviceDeskSiteKey: shop.serviceDeskSiteKey.slice(0, 64),
          },
        });
        await tx.healthOrder.update({
          where: { id: order.id },
          data: { consultId: consult.id },
        });
      }
      if (bizType === 'SIGN_PKG') {
        const pkgId =
          lines.find((line) => line.itemType === 'SIGN')?.refId ?? 0;
        const pkg = pkgId
          ? await tx.healthSignPackage.findFirst({
              where: { id: pkgId, shopId: shop.shopId },
            })
          : null;
        const startAt = new Date();
        await tx.healthSignOrder.create({
          data: {
            shopId: shop.shopId,
            packageId: pkgId,
            patientId: firstPatient,
            customerId: customer.id,
            orderId: order.id,
            teamId: pkg?.teamId ?? 0,
            practitionerId: pkg?.practitionerId ?? practitionerId,
            startAt,
            endAt: new Date(
              startAt.getTime() + (pkg?.validDays ?? 365) * 86400_000,
            ),
            status: 'PENDING_PAYMENT',
          },
        });
      }
      if (bizType === 'GREEN' && input.green) {
        const green = input.green;
        await tx.healthGreenOrder.create({
          data: {
            shopId: shop.shopId,
            orderId: order.id,
            patientId: green.patientId || firstPatient,
            customerId: customer.id,
            kind: green.kind === 'OPERATION' ? 'OPERATION' : 'GREEN',
            targetHospital: clip(green.targetHospital, 120),
            targetDepartment: clip(green.targetDepartment, 60),
            hospitalId: green.hospitalId,
            departmentId: green.departmentId,
            needType: strOf(green.needType, 20, 'OUTPATIENT'),
            urgency: clip(green.urgency, 20),
            demandAt: dateOf(green.demandAt),
            symptoms: clip(green.symptoms, 2000),
            filesJson: green.files.slice(0, 9).map((item) => clip(item, 500)),
            contactPhone: clip(green.contactPhone, 32),
            status: 'PENDING',
            amountCents: quote.payCents,
          },
        });
      }
      return order;
    });
    await audit(
      this.prisma,
      `customer:${customer.id}`,
      'health.order.create',
      `shop=${shop.shopId} order=${result.id} bizType=${bizType} pay=${quote.payCents}`,
    );
    return {
      id: result.id,
      orderNo: result.orderNo,
      payAmountCents: result.payAmountCents,
      expireAt: toIso(result.autoCancelAt),
      quote,
    };
  }

  // ---------- 订单列表 / 详情 / 取消 ----------

  private orderRows(
    rows: {
      id: number;
      orderNo: string;
      orderType: string;
      patientIdsJson: unknown;
      payAmountCents: number;
      refundAmountCents: number;
      discountCents: number;
      pointDeductCents: number;
      shippingCents: number;
      slotId: number;
      consultId: number;
      receiverJson: unknown;
      payWay: string;
      payStatus: string;
      status: string;
      refundedAt: Date | null;
      remark: string;
      cancelReason: string;
      paidAt: Date | null;
      autoCancelAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }[],
  ) {
    return rows.map((order) => {
      const paidCents = order.payStatus === 'PAID' ? order.payAmountCents : 0;
      const refundStatus = order.refundedAt
        ? order.refundAmountCents >= order.payAmountCents
          ? 'REFUNDED'
          : 'PARTIAL'
        : order.status === 'REFUND_PENDING'
          ? 'REFUNDING'
          : 'NONE';
      const payStatus = order.refundedAt
        ? 'REFUNDED'
        : order.payStatus === 'PAID'
          ? order.refundAmountCents > 0
            ? 'REFUNDING'
            : 'PAID'
          : 'UNPAID';
      return {
        id: order.id,
        orderNo: order.orderNo,
        bizType: order.orderType,
        bizTypeLabel:
          HEALTH_ORDER_BIZ_TYPE_LABELS[order.orderType] ?? order.orderType,
        status: order.status,
        payStatus,
        refundStatus,
        patientId: jsonArr<number>(order.patientIdsJson)[0] ?? 0,
        payAmountCents: order.payAmountCents,
        paidCents,
        refundableCents: Math.max(0, paidCents - order.refundAmountCents),
        couponCents: order.discountCents,
        pointDeductCents: order.pointDeductCents,
        shippingCents: order.shippingCents,
        slotId: order.slotId,
        consultId: order.consultId,
        receiver: jsonObj<Record<string, unknown>>(order.receiverJson, {}),
        remark: order.remark,
        cancelReason: order.cancelReason,
        paidAt: toIso(order.paidAt),
        expireAt: toIso(order.autoCancelAt),
        createdAt: toIso(order.createdAt),
        updatedAt: toIso(order.updatedAt),
      };
    });
  }

  async orders(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    query: { status: string; page: string; pageSize: string },
  ) {
    const { page, pageSize, offset } = pageParam(
      query.page,
      query.pageSize,
      20,
    );
    const status = clip(query.status, 24);
    const where = {
      shopId: shop.shopId,
      customerId: customer.id,
      ...(status === 'UNPAID'
        ? { status: 'PENDING_PAYMENT' }
        : status === 'AFTER_SALE'
          ? { status: { in: ['AFTER_SALE_PENDING', 'REFUND_PENDING'] } }
          : status === 'DONE'
            ? { status: { in: ['COMPLETED', 'VERIFIED', 'REVIEWED'] } }
            : status
              ? { status }
              : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.healthOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.healthOrder.count({ where }),
    ]);
    return pageOf(this.orderRows(rows), total, page, pageSize);
  }

  private async orderOf(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    orderId: number,
  ) {
    const row = await this.prisma.healthOrder.findFirst({
      where: { id: orderId, shopId: shop.shopId, customerId: customer.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '订单不存在');
    return row;
  }

  async orderDetail(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    orderId: number,
  ) {
    const order = await this.orderOf(shop, customer, orderId);
    const [items, flows, logs, code, shipment, consult, sign, green, review] =
      await Promise.all([
        this.prisma.healthOrderItem.findMany({
          where: { shopId: shop.shopId, orderId },
          orderBy: { id: 'asc' },
        }),
        this.prisma.healthOrderPriceFlow.findMany({
          where: { shopId: shop.shopId, orderId },
          orderBy: { id: 'asc' },
        }),
        this.prisma.healthOrderStatusLog.findMany({
          where: { shopId: shop.shopId, orderId },
          orderBy: { id: 'asc' },
        }),
        this.prisma.healthVerifyCode.findFirst({
          where: { shopId: shop.shopId, orderId },
        }),
        this.prisma.healthOrderShipment.findFirst({
          where: { shopId: shop.shopId, orderId },
          orderBy: { id: 'desc' },
        }),
        order.consultId > 0
          ? this.prisma.healthConsult.findFirst({
              where: { id: order.consultId, shopId: shop.shopId },
            })
          : null,
        this.prisma.healthSignOrder.findFirst({
          where: { shopId: shop.shopId, orderId },
        }),
        this.prisma.healthGreenOrder.findFirst({
          where: { shopId: shop.shopId, orderId },
        }),
        this.prisma.healthReview.findFirst({
          where: { shopId: shop.shopId, orderId },
        }),
      ]);
    const [row] = this.orderRows([order]);
    return {
      order: row,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        specText: item.specText,
        coverImage: item.coverImage,
        priceCents: item.priceCents,
        quantity: item.quantity,
        amountCents: item.amountCents,
      })),
      priceFlows: flows.map((flow) => ({
        step: flow.step,
        label: flow.label,
        amountCents: flow.amountCents,
      })),
      statusLogs: logs.map((log) => ({
        from: log.fromStatus,
        to: log.toStatus,
        note: log.note,
        createdAt: toIso(log.createdAt),
      })),
      verifyCode: code && code.status === 'UNUSED' ? code.code : '',
      shipment: shipment
        ? {
            expressName: shipment.expressName,
            trackingNo: shipment.trackingNo,
            status: shipment.status,
            shippedAt: toIso(shipment.shippedAt),
            receivedAt: toIso(shipment.receivedAt),
          }
        : null,
      consult: consult
        ? {
            id: consult.id,
            status: consult.status,
            practitionerName: consult.practitionerName,
            appointAt: toIso(consult.appointAt),
            symptomText: consult.symptomText,
            conclusion: consult.conclusion,
          }
        : null,
      sign: sign
        ? {
            id: sign.id,
            status: sign.status,
            startAt: toIso(sign.startAt),
            endAt: toIso(sign.endAt),
          }
        : null,
      green: green
        ? {
            id: green.id,
            status: green.status,
            needType: green.needType,
            matchedHospital: green.matchedHospital,
            matchedDoctor: green.matchedDoctor,
          }
        : null,
      review: review
        ? {
            id: review.id,
            score: review.score,
            content: review.content,
            status: review.status,
          }
        : null,
    };
  }

  async cancelOrder(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    orderId: number,
    reason: string,
  ) {
    const order = await this.orderOf(shop, customer, orderId);
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '只有待付款订单可以取消，已付款订单请申请退款',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.healthOrder.updateMany({
        where: { id: order.id, shopId: shop.shopId, status: 'PENDING_PAYMENT' },
        data: {
          status: 'CANCELLED',
          payStatus: 'CLOSED',
          cancelReason: clip(reason, 200) || '顾客取消',
          closedAt: new Date(),
        },
      });
      if (updated.count === 0)
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '订单状态已变化，请刷新',
        );
      await tx.healthOrderStatusLog.create({
        data: {
          shopId: shop.shopId,
          orderId: order.id,
          fromStatus: 'PENDING_PAYMENT',
          toStatus: 'CANCELLED',
          action: 'CUSTOMER_CANCEL',
          operatorType: 'CUSTOMER',
          operatorName: customer.nickname || `顾客#${customer.id}`,
          note: clip(reason, 200) || '顾客取消',
        },
      });
      if (order.slotId > 0 && shop.trade.refundReleaseSlot) {
        await tx.healthSlot.updateMany({
          where: {
            id: order.slotId,
            shopId: shop.shopId,
            orderId: order.id,
            occupied: { gt: 0 },
          },
          data: { occupied: { decrement: 1 }, status: 'AVAILABLE', orderId: 0 },
        });
      }
      const items = await tx.healthOrderItem.findMany({
        where: { shopId: shop.shopId, orderId: order.id },
      });
      for (const item of items) {
        if (item.itemType !== 'GOODS' || item.refId <= 0) continue;
        await tx.healthGoods.updateMany({
          where: { id: item.refId, shopId: shop.shopId },
          data: { stock: { increment: item.quantity } },
        });
      }
      if (order.couponTicketId > 0) {
        await tx.healthCouponTicket.updateMany({
          where: {
            id: order.couponTicketId,
            shopId: shop.shopId,
            customerId: customer.id,
          },
          data: { status: 'AVAILABLE', orderId: 0, usedAt: null },
        });
      }
      if (order.pointDeductCents > 0) {
        const pointsBack = Math.round(order.pointDeductCents / CENTS_PER_POINT);
        await tx.healthCustomer.update({
          where: { id: customer.id },
          data: { pointValue: { increment: pointsBack } },
        });
        await tx.healthPointLog.create({
          data: {
            shopId: shop.shopId,
            customerId: customer.id,
            value: pointsBack,
            balance: customer.points + pointsBack,
            scene: 'ORDER',
            note: `订单 ${order.orderNo} 取消退回积分`,
          },
        });
      }
      if (order.consultId > 0) {
        await tx.healthConsult.updateMany({
          where: {
            id: order.consultId,
            shopId: shop.shopId,
            status: 'PENDING_PAYMENT',
          },
          data: { status: 'CANCELLED' },
        });
      }
      if (order.orderType === 'SIGN_PKG') {
        await tx.healthSignOrder.updateMany({
          where: {
            orderId: order.id,
            shopId: shop.shopId,
            status: 'PENDING_PAYMENT',
          },
          data: { status: 'CANCELLED' },
        });
      }
      if (order.orderType === 'GREEN') {
        await tx.healthGreenOrder.updateMany({
          where: { orderId: order.id, shopId: shop.shopId, status: 'PENDING' },
          data: { status: 'REJECTED' },
        });
      }
    });
    return { ok: true };
  }

  // ---------- 支付 ----------

  private async payCredentials(
    shopId: number,
  ): Promise<WechatCredentials | null> {
    const siteUrl = await resolveSiteUrl(this.prisma);
    const shop = await this.prisma.healthShop.findUnique({
      where: { id: shopId },
      select: { id: true, ownerUserId: true, name: true },
    });
    if (!shop || !siteUrl) return null;
    const runtime = await this.miniApp.payRuntime(subjectOfShop(shop));
    if (!runtime) return null;
    return {
      appId: runtime.appId,
      mchId: runtime.mchId,
      apiv3Key: runtime.apiV3Key,
      certSerial: runtime.certSerial,
      privateKey: runtime.privateKey,
      notifyUrl: `${siteUrl}/api/public/health/pay/notify/${shopId}`,
      configured: true,
    };
  }

  /** 取支付参数：未配商户号或平台/店铺关了收款时返回 `payable:false`，端上提示线下付款。 */
  async payParams(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    orderId: number,
  ) {
    const order = await this.orderOf(shop, customer, orderId);
    if (order.payStatus === 'PAID')
      return { payable: false, reason: '该订单已支付', params: null };
    if (order.status !== 'PENDING_PAYMENT') {
      return {
        payable: false,
        reason: '订单已关闭或已进入履约，无法再次支付',
        params: null,
      };
    }
    if (order.payAmountCents <= 0) {
      return { payable: false, reason: '订单金额为 0，无需支付', params: null };
    }
    const settings = await this.platform.settings();
    if (!settings.allowOnlinePay || !shop.trade.onlinePayEnabled) {
      return {
        payable: false,
        reason: '店铺当前未开通在线收款，请联系店铺确认后线下付款',
        params: null,
      };
    }
    const credentials = await this.payCredentials(shop.shopId);
    if (!credentials) {
      return {
        payable: false,
        reason: '店铺尚未开通在线收款，请联系店铺确认后到店面付或转账',
        params: null,
      };
    }
    const prepay = await this.pay.jsapi(credentials, {
      outTradeNo: order.orderNo,
      description: `健康服务-${order.orderNo.slice(-8)}`,
      amountCents: order.payAmountCents,
      openid: customer.openid,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = randomBytes(16).toString('hex');
    const packageValue = `prepay_id=${prepay}`;
    const signer = createSign('RSA-SHA256');
    signer.update(
      [credentials.appId, timestamp, nonceStr, packageValue, ''].join('\n'),
    );
    await this.prisma.healthOrder.update({
      where: { id: order.id },
      data: { prepayId: prepay.slice(0, 64) },
    });
    return {
      payable: true,
      reason: '',
      params: {
        timeStamp: timestamp,
        nonceStr,
        package: packageValue,
        signType: 'RSA',
        paySign: signer.sign(credentials.privateKey, 'base64'),
      },
    };
  }

  async notifyCredentials(shopId: number): Promise<WechatCredentials | null> {
    return this.payCredentials(shopId);
  }

  async handleNotify(
    shopId: number,
    headers: Record<string, string>,
    rawBody: string,
  ) {
    const credentials = await this.notifyCredentials(shopId);
    if (!credentials) return { handled: false, reason: '该店铺未配置微信支付' };
    const transaction = await this.pay.parseNotify(
      credentials,
      headers,
      rawBody,
    );
    return this.markPaid(shopId, transaction);
  }

  /**
   * 支付回调：验签在路由层做，这里只做幂等、金额核对与「付款后副作用」。
   * 金额不符留痕不改状态并让微信重试（返回 handled:false）。
   */
  async markPaid(shopId: number, transaction: WechatTransaction) {
    const orderNo = String(transaction.out_trade_no || '');
    if (!orderNo) return { handled: false, reason: '缺少商户订单号' };
    if (String(transaction.trade_state || '') !== 'SUCCESS') {
      return { handled: false, reason: `支付状态 ${transaction.trade_state}` };
    }
    const order = await this.prisma.healthOrder.findFirst({
      where: { shopId, orderNo },
    });
    if (!order) return { handled: false, reason: '订单不存在' };
    const totalCents = Number(transaction.amount?.total ?? 0);
    if (totalCents !== order.payAmountCents) {
      await this.prisma.healthOrderStatusLog.create({
        data: {
          shopId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          action: 'PAY_AMOUNT_MISMATCH',
          operatorType: 'SYSTEM',
          note: `回调金额 ${totalCents} 分与订单 ${order.payAmountCents} 分不符，未改状态`,
        },
      });
      return { handled: false, reason: '金额不符' };
    }
    if (order.payStatus === 'PAID')
      return { handled: true, reason: '重复回调' };
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.healthOrder.updateMany({
        where: { id: order.id, shopId, payStatus: { not: 'PAID' } },
        data: {
          payStatus: 'PAID',
          payWay: 'WECHAT',
          status: 'PAID',
          tradeNo: String(transaction.transaction_id || '').slice(0, 64),
          paidAt: new Date(),
        },
      });
      if (updated.count === 0) return;
      await tx.healthOrderStatusLog.create({
        data: {
          shopId,
          orderId: order.id,
          fromStatus: order.status,
          toStatus: 'PAID',
          action: 'PAY',
          operatorType: 'SYSTEM',
          note: '微信支付成功',
        },
      });
      if (order.consultId > 0) {
        await tx.healthConsult.updateMany({
          where: { id: order.consultId, shopId, status: 'PENDING_PAYMENT' },
          data: { status: 'WAIT_ACCEPT' },
        });
      }
      if (order.orderType === 'SIGN_PKG') {
        await tx.healthSignOrder.updateMany({
          where: { orderId: order.id, shopId, status: 'PENDING_PAYMENT' },
          data: { status: 'SIGNED' },
        });
      }
      if (order.orderType === 'GREEN') {
        await tx.healthGreenOrder.updateMany({
          where: { orderId: order.id, shopId, status: 'PENDING' },
          data: { status: 'ACCEPTED', amountCents: order.payAmountCents },
        });
      }
      if (order.orderType === 'MEMBER_CARD') {
        await this.grantMemberCard(tx, shopId, order);
      }
      if (VERIFY_REQUIRED.has(order.orderType)) {
        await tx.healthVerifyCode.create({
          data: {
            shopId,
            orderId: order.id,
            code: makeVerifyCode(order.id),
            status: 'UNUSED',
          },
        });
      }
      await this.recordShares(tx, order);
      await this.growCustomer(tx, order);
    });
    return { handled: true, reason: '' };
  }

  private async grantMemberCard(
    tx: Prisma.TransactionClient,
    shopId: number,
    order: { id: number; customerId: number },
  ) {
    const item = await tx.healthOrderItem.findFirst({
      where: { shopId, orderId: order.id, itemType: 'MEMBER_CARD' },
    });
    const card = item
      ? await tx.healthMemberCard.findFirst({
          where: { id: item.refId, shopId },
        })
      : null;
    if (!card) return;
    const startAt = new Date();
    await tx.healthMemberGrant.create({
      data: {
        shopId,
        customerId: order.customerId,
        kind: 'ORDER',
        memberCardId: card.id,
        levelValue: card.levelValue,
        startAt,
        endAt: new Date(startAt.getTime() + card.validDays * 86400_000),
        orderId: order.id,
        verifyCode: makeNo('MC').slice(-16),
        status: 'BINDING',
        source: 'ORDER',
      },
    });
    await tx.healthCustomer.update({
      where: { id: order.customerId },
      data: { memberLevelId: card.levelValue },
    });
  }

  /** 付款后：分账台账（内部记账，不是微信分账产品）。 */
  private async recordShares(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      shopId: number;
      orderType: string;
      payAmountCents: number;
      promoterId: number;
    },
  ) {
    const items = await tx.healthOrderItem.findMany({
      where: { shopId: order.shopId, orderId: order.id },
    });
    const practitionerId =
      items.find((item) => item.practitionerId > 0)?.practitionerId ?? 0;
    const practitioner = practitionerId
      ? await tx.healthPractitioner.findFirst({
          where: { id: practitionerId, shopId: order.shopId },
          select: { id: true, name: true, organId: true, teamId: true },
        })
      : null;
    const rows = await tx.healthCommissionRule.findMany({
      where: { shopId: order.shopId, status: 'ON' },
    });
    const rules: CommissionRuleLike[] = rows.map((row) => ({
      scope: row.scope,
      scopeId: row.scopeId,
      bizTypes: jsonArr<string>(row.bizTypesJson),
      organPercent: row.organPercent,
      practitionerPercent: row.practitionerPercent,
      promoterPercent: row.promoterPercent,
      teamPercent: row.teamPercent,
      shopPercent:
        100 -
        row.organPercent -
        row.practitionerPercent -
        row.promoterPercent -
        row.teamPercent,
    }));
    const rule = pickRule(
      rules.filter((item) => ruleMatchesBizType(item, order.orderType)),
      {
        SERVICE: items.find((item) => item.itemType === 'SERVICE')?.refId ?? 0,
        PRACTITIONER: practitioner?.id ?? 0,
        ORGAN: practitioner?.organId ?? 0,
        TEAM: practitioner?.teamId ?? 0,
        DEFAULT: 0,
      },
    );
    if (!rule) return;
    const drafts = splitShares({
      baseCents: order.payAmountCents,
      rule,
      organId: practitioner?.organId ?? 0,
      practitionerId: practitioner?.id ?? 0,
      promoterId: order.promoterId,
      teamId: practitioner?.teamId ?? 0,
    });
    if (!drafts.length) return;
    await tx.healthOrderShare.createMany({
      data: drafts.map((draft) => ({
        shopId: order.shopId,
        orderId: order.id,
        earnerKind: draft.earnerKind,
        earnerId: draft.earnerId,
        baseCents: order.payAmountCents,
        ratePercent: draft.ratePercent,
        shareCents: draft.shareCents,
        settleableAt: new Date(),
      })),
    });
  }

  /** 付款后：累计消费、等级升档与积分赠送。 */
  private async growCustomer(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      shopId: number;
      customerId: number;
      payAmountCents: number;
    },
  ) {
    const customer = await tx.healthCustomer.findUnique({
      where: { id: order.customerId },
    });
    if (!customer) return;
    const totalPayCents = cents(customer.totalPay) + order.payAmountCents;
    const rule = await tx.healthPointRule.findFirst({
      where: { shopId: order.shopId, scene: 'ORDER', status: 'ON' },
    });
    const points = rule
      ? rule.value > 0
        ? rule.value
        : Math.round(
            (order.payAmountCents * Math.max(0, rule.percent)) / 10_000,
          )
      : 0;
    const levels = await tx.healthMemberLevel.findMany({
      where: { shopId: order.shopId, status: 'ON' },
      orderBy: { thresholdCents: 'desc' },
    });
    const matched = levels.find(
      (level) => totalPayCents >= level.thresholdCents,
    );
    const nextLevel =
      matched && matched.levelValue > customer.memberLevelId
        ? matched.levelValue
        : customer.memberLevelId;
    await tx.healthCustomer.update({
      where: { id: customer.id },
      data: {
        totalPay: yuan(totalPayCents),
        ...(points > 0 ? { pointValue: { increment: points } } : {}),
        ...(nextLevel !== customer.memberLevelId
          ? { memberLevelId: nextLevel }
          : {}),
      },
    });
    if (points > 0) {
      await tx.healthPointLog.create({
        data: {
          shopId: order.shopId,
          customerId: customer.id,
          value: points,
          balance: customer.pointValue + points,
          scene: 'ORDER',
          orderId: order.id,
          note: '下单赠送积分',
        },
      });
    }
  }

  // ---------- 核销 / 售后 / 评价 ----------

  async verifyCodes(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const orders = await this.prisma.healthOrder.findMany({
      where: {
        shopId: shop.shopId,
        customerId: customer.id,
        status: { in: ['PAID', 'ACCEPTED', 'ASSIGNED', 'SERVING'] },
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
    if (!orders.length) return [];
    const codes = await this.prisma.healthVerifyCode.findMany({
      where: {
        shopId: shop.shopId,
        orderId: { in: orders.map((row) => row.id) },
        status: 'UNUSED',
      },
    });
    const codeMap = new Map(codes.map((row) => [row.orderId, row.code]));
    return orders
      .filter((row) => VERIFY_REQUIRED.has(row.orderType))
      .map((row) => ({
        orderId: row.id,
        orderNo: row.orderNo,
        orderType: row.orderType,
        code: codeMap.get(row.id) ?? '',
        tag: HEALTH_ORDER_BIZ_TYPE_LABELS[row.orderType] ?? row.orderType,
      }))
      .filter((row) => row.code);
  }

  async applyAftersale(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      orderId: number;
      orderItemId: number;
      kind: string;
      reason: string;
      description: string;
      evidenceImages: string[];
    },
  ) {
    const order = await this.orderOf(shop, customer, body.orderId);
    if (
      ![
        'PAID',
        'ACCEPTED',
        'DELIVERED',
        'SERVING',
        'COMPLETED',
        'VERIFIED',
      ].includes(order.status)
    ) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '当前订单状态不支持申请售后',
      );
    }
    const pending = await this.prisma.healthAftersale.findFirst({
      where: {
        shopId: shop.shopId,
        orderId: order.id,
        status: { in: ['PENDING', 'APPROVED', 'RETURNING'] },
      },
    });
    if (pending)
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该订单已有处理中的售后单',
      );
    const kind = ['REFUND', 'RETURN_REFUND', 'EXCHANGE', 'RESEND'].includes(
      body.kind,
    )
      ? body.kind
      : 'REFUND';
    const items = await this.prisma.healthOrderItem.findMany({
      where: { shopId: shop.shopId, orderId: order.id },
    });
    const item = items.find((row) => row.id === body.orderItemId) ?? items[0];
    const amountCents = item ? item.amountCents : order.payAmountCents;
    const row = await this.prisma.healthAftersale.create({
      data: {
        shopId: shop.shopId,
        no: makeNo('AS'),
        orderId: order.id,
        orderItemId: item?.id ?? 0,
        customerId: customer.id,
        kind,
        reason: clip(body.reason, 200),
        description: clip(body.description, 1000),
        imagesJson: body.evidenceImages
          .slice(0, 9)
          .map((url) => clip(url, 500)),
        amountCents,
        status: 'PENDING',
      },
    });
    await this.prisma.healthOrder.updateMany({
      where: { id: order.id, shopId: shop.shopId },
      data: { status: 'AFTER_SALE_PENDING' },
    });
    return { id: row.id, no: row.no, status: row.status };
  }

  async reviewOrder(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      orderId: number;
      score: number;
      attitudeScore: number;
      skillScore: number;
      content: string;
      images: string[];
      tags: string[];
      anonymous: boolean;
    },
  ) {
    if (!shop.trade.reviewEnabled) {
      throw new BusinessException(ErrorCode.FEATURE_CLOSED, '店铺暂未开启评价');
    }
    const order = await this.orderOf(shop, customer, body.orderId);
    if (
      !['COMPLETED', 'VERIFIED', 'DELIVERED', 'REVIEWED'].includes(order.status)
    ) {
      throw new BusinessException(ErrorCode.CONFLICT, '订单完成后才能评价');
    }
    const existing = await this.prisma.healthReview.findFirst({
      where: {
        shopId: shop.shopId,
        orderId: order.id,
        customerId: customer.id,
      },
    });
    if (existing)
      throw new BusinessException(ErrorCode.CONFLICT, '该订单已评价');
    const items = await this.prisma.healthOrderItem.findMany({
      where: { shopId: shop.shopId, orderId: order.id },
    });
    const target = items.find((item) => item.practitionerId > 0);
    const targetType = target
      ? 'PRACTITIONER'
      : order.orderType === 'GOODS'
        ? 'GOODS'
        : 'SERVICE';
    const targetId = target
      ? target.practitionerId
      : (items[0]?.refId ?? order.serviceId);
    const status = shop.trade.reviewAuditFirst ? 'PENDING' : 'PUBLISHED';
    const row = await this.prisma.healthReview.create({
      data: {
        shopId: shop.shopId,
        orderId: order.id,
        consultId: order.consultId,
        customerId: customer.id,
        patientId: jsonArr<number>(order.patientIdsJson)[0] ?? 0,
        targetType,
        targetId,
        targetName: target?.name ?? '',
        score: Math.max(1, Math.min(5, Math.round(body.score))),
        effectScore: Math.max(0, Math.min(5, Math.round(body.attitudeScore))),
        serviceScore: Math.max(0, Math.min(5, Math.round(body.skillScore))),
        content: clip(body.content, 1000),
        imagesJson: body.images.slice(0, 9).map((item) => clip(item, 500)),
        tagsJson: body.tags.slice(0, 12).map((item) => clip(item, 40)),
        anonymous: body.anonymous,
        status,
      },
    });
    if (status === 'PUBLISHED') {
      await this.prisma.healthOrder.updateMany({
        where: { id: order.id, shopId: shop.shopId },
        data: { status: 'REVIEWED' },
      });
      if (target) {
        await this.prisma.healthPractitioner.updateMany({
          where: { id: target.practitionerId, shopId: shop.shopId },
          data: {
            scoreSum: { increment: row.score },
            scoreCount: { increment: 1 },
          },
        });
      }
    }
    return {
      id: row.id,
      status,
      message: status === 'PENDING' ? '评价已提交，审核后展示' : '评价成功',
    };
  }

  // ---------- 问诊 ----------

  async consultRules(shop: HealthPublicShop) {
    const rows = await this.prisma.healthConsultRule.findMany({
      where: { shopId: shop.shopId, status: 'ON' },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      bizType: row.bizType,
      serviceId: row.serviceId,
      practitionerId: row.practitionerId,
      instant: row.instant,
      priceCents: row.priceCents,
      minutes: row.minutes,
      maxDays: row.maxDays,
      textValidHours: row.textValidHours,
    }));
  }

  async consults(shop: HealthPublicShop, customer: HealthPublicCustomer) {
    const rows = await this.prisma.healthConsult.findMany({
      where: { shopId: shop.shopId, customerId: customer.id },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      consultNo: row.consultNo,
      bizType: row.bizType,
      title: row.title,
      practitionerName: row.practitionerName,
      status: row.status,
      appointAt: toIso(row.appointAt),
      createdAt: toIso(row.createdAt),
    }));
  }

  async consultDetail(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    consultId: number,
  ) {
    const row = await this.prisma.healthConsult.findFirst({
      where: { id: consultId, shopId: shop.shopId, customerId: customer.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '问诊单不存在');
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: row.patientId, shopId: shop.shopId },
      select: { name: true },
    });
    return {
      id: row.id,
      consultNo: row.consultNo,
      bizType: row.bizType,
      title: row.title,
      status: row.status,
      patientName: patient?.name ?? '',
      practitionerId: row.practitionerId,
      practitionerName: row.practitionerName,
      appointAt: toIso(row.appointAt),
      symptomText: row.symptomText,
      attachments: jsonArr<string>(row.attachmentsJson),
      conclusion: row.conclusion,
      meetingUrl: row.meetingUrl,
      evalScore: row.evalScore,
      evalContent: row.evalContent,
      createdAt: toIso(row.createdAt),
    };
  }

  /** 问诊动作：顾客只能结束自己的问诊或取消（未接诊前）。 */
  async consultAction(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    body: {
      id: number;
      action: string;
      reason: string;
      score: number;
      content: string;
    },
  ) {
    const row = await this.prisma.healthConsult.findFirst({
      where: { id: body.id, shopId: shop.shopId, customerId: customer.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '问诊单不存在');
    if (['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(row.status)) {
      throw new BusinessException(ErrorCode.CONFLICT, '该问诊单已结束');
    }
    if (body.action === 'CANCEL') {
      if (row.status !== 'WAIT_ACCEPT' && row.status !== 'PENDING_PAYMENT') {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '医护已接诊，如需结束请选择「结束问诊」',
        );
      }
      await this.prisma.healthConsult.update({
        where: { id: row.id },
        data: {
          status: 'CANCELLED',
          finishedAt: new Date(),
          conclusion: clip(body.reason, 500),
        },
      });
      return { status: 'CANCELLED' };
    }
    if (body.action === 'CUSTOMER_DONE') {
      await this.prisma.healthConsult.update({
        where: { id: row.id },
        data: { status: 'CUSTOMER_DONE', finishedAt: new Date() },
      });
      return { status: 'CUSTOMER_DONE' };
    }
    if (body.action === 'EVAL') {
      const score = Math.max(1, Math.min(5, Math.round(body.score)));
      await this.prisma.healthConsult.update({
        where: { id: row.id },
        data: {
          evalScore: score,
          evalContent: clip(body.content, 500),
          status: 'COMPLETED',
        },
      });
      return { status: 'COMPLETED', evalScore: score };
    }
    throw new BusinessException(ErrorCode.BAD_REQUEST, '不支持的问诊动作');
  }

  /** 图文问诊进 AI客服：会话令牌由 consult 派生，重复进入拿到同一会话。 */
  async consultSession(
    shop: HealthPublicShop,
    customer: HealthPublicCustomer,
    consultId: number,
  ) {
    const row = await this.prisma.healthConsult.findFirst({
      where: { id: consultId, shopId: shop.shopId, customerId: customer.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '问诊单不存在');
    if (row.bizType !== 'CONSULT_TEXT') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '只有图文问诊需要在线会话',
      );
    }
    const siteKey = row.serviceDeskSiteKey || shop.serviceDeskSiteKey;
    if (!siteKey) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '本店尚未绑定 AI客服站点，请联系店铺客服改用电话沟通',
      );
    }
    const secret = String(process.env.EXTERNAL_CRED_KEY ?? '').trim();
    if (!secret) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '服务端未配置会话密钥，暂时无法进入图文问诊',
      );
    }
    const token = createHash('sha256')
      .update(`health-consult|${secret}|${row.id}|${row.consultNo}`)
      .digest('hex')
      .slice(0, 48);
    const patient = await this.prisma.healthPatient.findFirst({
      where: { id: row.patientId, shopId: shop.shopId },
      select: { name: true },
    });
    const opened = await this.desk.openSession({
      siteKey,
      token,
      nickname: patient?.name ?? '',
    });
    if (
      row.serviceDeskConversationId !== opened.conversationId ||
      row.serviceDeskSiteKey !== siteKey
    ) {
      await this.prisma.healthConsult.update({
        where: { id: row.id },
        data: {
          serviceDeskSiteKey: siteKey,
          serviceDeskConversationId: opened.conversationId,
        },
      });
    }
    return {
      consultId: row.id,
      conversationId: opened.conversationId,
      siteKey,
      accessToken: opened.token,
      streamPath: `/api/public/service-desk/open/stream/${opened.conversationId}`,
      expiresAt: toIso(new Date(Date.now() + 2 * 3_600_000)),
      message:
        '会话由本站 AI客服提供；请勿在会话中发送与本次问诊无关的敏感信息。',
    };
  }
}

/** 到店核销码：订单号 + 时间戳散列，32 位内且不可从订单号反推。 */
function makeVerifyCode(orderId: number): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const salt = createHash('sha256')
    .update(`${orderId}|${stamp}`)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  return `H${orderId}${stamp}${salt}`.slice(0, 32);
}
