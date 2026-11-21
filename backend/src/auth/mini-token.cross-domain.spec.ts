import { createHash, createHmac } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { PRIVATE_MINI_SCENES } from '@enterprise/contracts';
import { stub } from '../../test/doubles';
import { ErrorCode } from '../common/error-code';
import { issueSsoSession } from './token';
import {
  AGENT_ISSUER,
  issueAgentToken,
  parseAgentToken,
} from '../onsite/agent-token';
import {
  STAFF_ISSUER,
  issueStaffToken,
  parseStaffToken,
} from '../onsite/staff-token';
import {
  HEALTH_STAFF_ISSUER,
  issueHealthStaffToken,
  parseHealthStaffToken,
} from '../health/health-staff-token';
import {
  MP_MERCHANT_ISSUER,
  issueMerchantToken,
  parseMerchantToken,
} from '../marketplace/mp.token';
import {
  CUSTOMER_ISSUER,
  issueCustomerToken,
  parseCustomerToken,
} from '../private-mini/customer-token';
import {
  KP_MEMBER_ISSUER,
  issueMemberToken,
  verifyMemberToken,
} from '../knowledge-pay/kp.token';
import {
  DH_MEMBER_ISSUER,
  issueDhMemberToken,
  verifyDhMemberToken,
} from '../digital-human/dh.token';
import { BusinessException } from '../common/business.exception';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { BrandShopService } from '../brand-mall/brand.shop.service';
import { BrandCustomerService } from '../brand-mall/brand.customer.service';
import type { CardShopSiteService } from '../card-shop/card-shop.site.service';
import { CardShopCustomerService } from '../card-shop/card-shop.customer.service';

/**
 * 令牌收口到 `auth/mini-token-factory` 之后的跨域用例。
 *
 * 这里守的是四条线，任意一条破了都是线上事故：
 * 1. **跨 issuer 互斥**：顾客/技师/代理/医护/商户五套令牌各用一把按 issuer 派生的密钥，
 *    拿 A 域令牌当 B 域身份必须拒，并且拒的文案仍是 B 域自己那一句（客服话术对得上）。
 * 2. **scene 白名单**：七个自营场景共用 `private-mini-customer` 这一套 issuer，
 *    伪造一个不在 `PRIVATE_MINI_SCENES` 里的 scene 必须在验签层就拒掉，
 *    不能只靠业务层记得写 `scene === XXX_SCENE`。
 * 3. **跨店越权**：brand-mall 与 card-shop 是最危险的一对（同 issuer，只靠双条件过滤分租户），
 *    这里用内存假库把「A 店顾客令牌去要 B 店数据」一路走到业务查询，断言取不到别人的数据。
 * 4. **历史口径等价**：每个域都钉一条「老方式手签的令牌新实现认、新实现签的老方式也认」，
 *    保证收口实现没有偷改派生算法（改了会把在营业的小程序顾客集体踢下线）。
 */

const SECRET = 'cross-domain-jwt-secret';

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

/** 顾客/技师/代理/医护/商户的历史派生口径：HMAC_SHA256(JWT_SECRET, issuer)。 */
const hmacKey = (issuer: string) =>
  createHmac('sha256', SECRET).update(issuer).digest();

/** 会员类的另一套历史口径：SHA256("<context>|" + JWT_SECRET)，不许被"顺手统一"。 */
const sha256Key = (context: string) =>
  createHash('sha256').update(`${context}|${SECRET}`).digest('hex');

/** 按迁移前的口径手签一张令牌（等价性回归的基准）。 */
function legacySign(
  issuer: string,
  claims: Record<string, unknown>,
  ttlSeconds = 3600,
): string {
  return jwt.sign(claims, hmacKey(issuer), {
    algorithm: 'HS256',
    issuer,
    expiresIn: ttlSeconds,
  });
}

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
}

/** 拒绝 + 401 + 逐字文案：三者一起断言，文案漂了也算破线。 */
function expectUnauthorized(run: () => unknown, message: string) {
  const error = captureError(run);
  expect(error).toBeInstanceOf(BusinessException);
  expect((error as BusinessException).message).toBe(message);
  expect((error as BusinessException).getStatus()).toBe(
    ErrorCode.UNAUTHORIZED.httpStatus,
  );
}

async function expectUnauthorizedAsync(
  run: Promise<unknown>,
  message: string,
): Promise<void> {
  const error = await run.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(BusinessException);
  expect((error as BusinessException).message).toBe(message);
  expect((error as BusinessException).getStatus()).toBe(
    ErrorCode.UNAUTHORIZED.httpStatus,
  );
}

type Domain = {
  label: string;
  issuer: string;
  /** 载荷字段名逐字沿用迁移前 */
  claims: Record<string, unknown>;
  payload: Record<string, unknown>;
  issue: () => string;
  parse: (token: string) => Record<string, unknown>;
  /** 非过期失败的历史文案 */
  invalid: string;
  /** 默认有效期（历史值） */
  ttlSeconds: number;
};

const DOMAINS: Domain[] = [
  {
    label: '顾客',
    issuer: CUSTOMER_ISSUER,
    claims: {
      scene: 'BRAND',
      shopId: 1,
      customerId: 11,
      openid: 'o-brand-11',
      type: 'customer',
    },
    payload: {
      scene: 'BRAND',
      shopId: 1,
      customerId: 11,
      openid: 'o-brand-11',
    },
    issue: () =>
      issueCustomerToken({
        scene: 'BRAND',
        shopId: 1,
        customerId: 11,
        openid: 'o-brand-11',
      }),
    parse: (token) => parseCustomerToken(token),
    invalid: '登录状态无效，请重新进入小程序',
    ttlSeconds: 30 * 86400,
  },
  {
    label: '技师',
    issuer: STAFF_ISSUER,
    claims: {
      shopId: 1,
      staffId: 3,
      customerId: 11,
      openid: 'o-brand-11',
      type: 'staff',
    },
    payload: { shopId: 1, staffId: 3, customerId: 11, openid: 'o-brand-11' },
    issue: () =>
      issueStaffToken({
        shopId: 1,
        staffId: 3,
        customerId: 11,
        openid: 'o-brand-11',
      }),
    parse: (token) => parseStaffToken(token),
    invalid: '技师身份已失效，请重新绑定（手机号 + 工号）',
    ttlSeconds: 30 * 86400,
  },
  {
    label: '代理',
    issuer: AGENT_ISSUER,
    claims: {
      shopId: 1,
      role: 'AGENT',
      refId: 5,
      phone: '13800000001',
      type: 'agent',
    },
    payload: { shopId: 1, role: 'AGENT', refId: 5, phone: '13800000001' },
    issue: () =>
      issueAgentToken({
        shopId: 1,
        role: 'AGENT',
        refId: 5,
        phone: '13800000001',
      }),
    parse: (token) => parseAgentToken(token),
    invalid: '代理身份已失效，请重新绑定手机号',
    ttlSeconds: 30 * 86400,
  },
  {
    label: '医护',
    issuer: HEALTH_STAFF_ISSUER,
    claims: {
      shopId: 1,
      practitionerId: 9,
      customerId: 11,
      openid: 'o-brand-11',
      type: 'health-staff',
    },
    payload: {
      shopId: 1,
      practitionerId: 9,
      customerId: 11,
      openid: 'o-brand-11',
    },
    issue: () =>
      issueHealthStaffToken({
        shopId: 1,
        practitionerId: 9,
        customerId: 11,
        openid: 'o-brand-11',
      }),
    parse: (token) => parseHealthStaffToken(token),
    invalid: '医护登录状态无效，请重新绑定身份',
    ttlSeconds: 30 * 86400,
  },
  {
    label: '商户',
    issuer: MP_MERCHANT_ISSUER,
    claims: {
      marketId: 1,
      merchantId: 2,
      userId: 3,
      role: 'OWNER',
      type: 'mp-merchant',
    },
    payload: { marketId: 1, merchantId: 2, userId: 3, role: 'OWNER' },
    issue: () =>
      issueMerchantToken({
        marketId: 1,
        merchantId: 2,
        userId: 3,
        role: 'OWNER',
      }),
    parse: (token) => parseMerchantToken(token),
    invalid: '商户登录状态无效，请重新登录',
    ttlSeconds: 7 * 86400,
  },
];

const domainOf = (label: string) => {
  const domain = DOMAINS.find((item) => item.label === label);
  if (!domain) throw new Error(`用例表缺域：${label}`);
  return domain;
};

describe('跨 issuer：一个域的令牌在别的域必须判无效', () => {
  for (const source of DOMAINS) {
    for (const target of DOMAINS) {
      if (source.label === target.label) continue;
      it(`${source.label}令牌当${target.label}令牌用 → 401 且给${target.label}自己那句失效文案`, () => {
        expectUnauthorized(() => target.parse(source.issue()), target.invalid);
      });
    }
  }

  it('反向同样拒：技师/医护/代理/商户令牌都换不开顾客身份', () => {
    const customer = domainOf('顾客');
    for (const label of ['技师', '医护', '代理', '商户']) {
      const other = domainOf(label);
      expectUnauthorized(() => customer.parse(other.issue()), customer.invalid);
    }
  });

  it('站内 SSO 会话令牌换不开任何小程序域身份', () => {
    const sso = issueSsoSession('1001', 'admin', 'admin');
    for (const domain of DOMAINS) {
      expectUnauthorized(() => domain.parse(sso), domain.invalid);
    }
  });

  it('顾客令牌冒充知识付费会员（hmac-issuer 打 sha256-concat）→ 拒', () => {
    expectUnauthorized(
      () => verifyMemberToken(domainOf('顾客').issue()),
      '登录已过期，请重新进入小程序',
    );
  });

  it('会员令牌冒充顾客（sha256-concat 打 hmac-issuer）→ 拒', () => {
    const member = jwt.sign(
      { mid: 7, sid: 3, type: 'kp-member' },
      sha256Key('oem-knowledge-pay-member'),
      { algorithm: 'HS256', issuer: KP_MEMBER_ISSUER, expiresIn: 3600 },
    );
    const customer = domainOf('顾客');
    expectUnauthorized(() => customer.parse(member), customer.invalid);
  });

  it('同 issuer 但签名密钥不对（拿原 JWT_SECRET 直签）→ 拒', () => {
    const forged = jwt.sign(
      {
        scene: 'BRAND',
        shopId: 1,
        customerId: 11,
        openid: 'o-1',
        type: 'customer',
      },
      SECRET,
      { algorithm: 'HS256', issuer: CUSTOMER_ISSUER, expiresIn: 3600 },
    );
    const customer = domainOf('顾客');
    expectUnauthorized(() => customer.parse(forged), customer.invalid);
  });

  it('技师令牌冒充商户后台（跨到多店铺商城）→ 拒', () => {
    const merchant = domainOf('商户');
    expectUnauthorized(
      () => merchant.parse(domainOf('技师').issue()),
      merchant.invalid,
    );
  });
});

describe('顾客令牌 scene 白名单：契约之外的场景在验签层就拒', () => {
  for (const scene of PRIVATE_MINI_SCENES) {
    it(`契约里的场景 ${scene} 正常放行`, () => {
      const token = legacySign(CUSTOMER_ISSUER, {
        scene,
        shopId: 1,
        customerId: 11,
        openid: 'o-1',
        type: 'customer',
      });
      expect(parseCustomerToken(token).scene).toBe(scene);
    });
  }

  for (const scene of ['ONSITE_STAFF', 'ENTERPRISE', 'BRAND_ADMIN']) {
    it(`伪造场景 ${scene} 的顾客令牌 → 验签直接拒（业务层漏写 WHERE 也串不了）`, () => {
      const forged = legacySign(CUSTOMER_ISSUER, {
        scene,
        shopId: 1,
        customerId: 11,
        openid: 'o-1',
        type: 'customer',
      });
      const customer = domainOf('顾客');
      expectUnauthorized(() => customer.parse(forged), customer.invalid);
    });
  }

  it('技师 issuer 下多带一个 scene 声明也换不开顾客身份（issuer 才是分界）', () => {
    const crossed = legacySign(STAFF_ISSUER, {
      shopId: 1,
      staffId: 3,
      customerId: 11,
      openid: 'o-1',
      scene: 'BRAND',
      type: 'staff',
    });
    const customer = domainOf('顾客');
    expectUnauthorized(() => customer.parse(crossed), customer.invalid);
  });

  it('空场景令牌 → 验签直接拒（空串同样是契约之外的场景）', () => {
    const blank = legacySign(CUSTOMER_ISSUER, {
      scene: '',
      shopId: 1,
      customerId: 11,
      openid: 'o-1',
      type: 'customer',
    });
    const customer = domainOf('顾客');
    expectUnauthorized(() => customer.parse(blank), customer.invalid);
  });

  it('去掉 type 声明的顾客令牌 → 拒（type 仍是载荷的一部分）', () => {
    const noType = legacySign(CUSTOMER_ISSUER, {
      scene: 'BRAND',
      shopId: 1,
      customerId: 11,
      openid: 'o-1',
    });
    const customer = domainOf('顾客');
    expectUnauthorized(() => customer.parse(noType), customer.invalid);
  });

  it('载荷缺 shopId / customerId → 拒（双条件过滤的输入必须齐）', () => {
    for (const claims of [
      { scene: 'BRAND', customerId: 11, openid: 'o-1', type: 'customer' },
      { scene: 'BRAND', shopId: 1, openid: 'o-1', type: 'customer' },
    ]) {
      const broken = legacySign(CUSTOMER_ISSUER, claims);
      const customer = domainOf('顾客');
      expectUnauthorized(() => customer.parse(broken), customer.invalid);
    }
  });
});

describe('与历史口径等价：老方式签出的新实现认，新实现签出的老方式也认', () => {
  for (const domain of DOMAINS) {
    it(`${domain.label}（${domain.issuer}）双向等价`, () => {
      // 迁移前手签 → 新实现验通，载荷解回同样的字段
      expect(domain.parse(legacySign(domain.issuer, domain.claims))).toEqual(
        domain.payload,
      );
      // 新实现签发 → 用迁移前的密钥与 issuer 也能验通，载荷字段名没变
      const fresh = jwt.verify(domain.issue(), hmacKey(domain.issuer), {
        algorithms: ['HS256'],
        issuer: domain.issuer,
      }) as jwt.JwtPayload;
      expect(fresh).toMatchObject(domain.claims);
    });

    it(`${domain.label}默认 TTL 与历史一致（${domain.ttlSeconds} 秒）`, () => {
      const claims = jwt.decode(domain.issue()) as jwt.JwtPayload;
      const seconds = (claims.exp as number) - (claims.iat as number);
      // jsonwebtoken 的 iat/exp 按整秒取整，允许 1 秒误差
      expect(Math.abs(seconds - domain.ttlSeconds)).toBeLessThanOrEqual(1);
    });

    it(`${domain.label}带 Bearer 前缀照旧能验（历史行为）`, () => {
      expect(domain.parse(`Bearer ${domain.issue()}`)).toEqual(domain.payload);
    });
  }
});

// ---------- 跨店越权：brand-mall 与 card-shop 共用 private-mini-customer ----------

const SHOP_A = 1;
const SHOP_B = 2;
/** A 店顾客 11、B 店顾客 21：两个 id 在两张表里都真实存在，越权只能靠双条件过滤挡。 */
const CUSTOMER_OF_A = 11;
const CUSTOMER_OF_B = 21;

const brandShops = [
  {
    id: SHOP_A,
    ownerUserId: 'u-a',
    name: 'A 店',
    shopCode: 'A01',
    status: 'OPEN',
  },
  {
    id: SHOP_B,
    ownerUserId: 'u-b',
    name: 'B 店',
    shopCode: 'B01',
    status: 'OPEN',
  },
];
const brandCustomers = [
  { id: CUSTOMER_OF_A, shopId: SHOP_A, openid: 'o-a-11', status: 'ACTIVE' },
  { id: CUSTOMER_OF_B, shopId: SHOP_B, openid: 'o-b-21', status: 'ACTIVE' },
];
const cardSites = [
  { id: SHOP_A, ownerUserId: 'u-a', status: 'ONLINE' },
  { id: SHOP_B, ownerUserId: 'u-b', status: 'ONLINE' },
];
const cardCustomers = [
  { id: CUSTOMER_OF_A, siteId: SHOP_A, openid: 'c-a-11', status: true },
  { id: CUSTOMER_OF_B, siteId: SHOP_B, openid: 'c-b-21', status: true },
];
/** 503 是故意埋的陷阱行：顾客 id 属于 A 店，订单却落在 B 店站点下。 */
const cardOrders = [
  { id: 501, siteId: SHOP_A, customerId: CUSTOMER_OF_A },
  { id: 502, siteId: SHOP_B, customerId: CUSTOMER_OF_B },
  { id: 503, siteId: SHOP_B, customerId: CUSTOMER_OF_A },
];

const queries: { model: string; where: Record<string, unknown> }[] = [];

const brandService = new BrandCustomerService(
  stub<PrismaService>({
    brandShop: {
      findUnique: async (args: { where: { id: number } }) =>
        brandShops.find((shop) => shop.id === args.where.id) ?? null,
    },
    brandCustomer: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        queries.push({ model: 'brandCustomer', where: args.where });
        return (
          brandCustomers.find(
            (row) =>
              row.id === args.where.id && row.shopId === args.where.shopId,
          ) ?? null
        );
      },
    },
  }),
  stub<MiniProgramClient>(),
  stub<MiniAppService>(),
  stub<BrandShopService>(),
);

const cardService = new CardShopCustomerService(
  stub<PrismaService>({
    cardShopSite: {
      findUnique: async (args: { where: { id: number } }) =>
        cardSites.find((site) => site.id === args.where.id) ?? null,
    },
    cardShopCustomer: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        queries.push({ model: 'cardShopCustomer', where: args.where });
        return (
          cardCustomers.find(
            (row) =>
              row.id === args.where.id && row.siteId === args.where.siteId,
          ) ?? null
        );
      },
    },
    cardShopOrder: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        queries.push({ model: 'cardShopOrder', where: args.where });
        return cardOrders.filter(
          (row) =>
            row.siteId === args.where.siteId &&
            row.customerId === args.where.customerId,
        );
      },
    },
  }),
  stub<CardShopSiteService>(),
  stub<MiniProgramClient>(),
  stub<MiniAppService>(),
);

/** 走"A 店登录链路"签出来的顾客令牌（scene 决定进哪个域）。 */
const brandToken = (shopId: number, customerId: number) =>
  legacySign(CUSTOMER_ISSUER, {
    scene: 'BRAND',
    shopId,
    customerId,
    openid: `o-${shopId}-${customerId}`,
    type: 'customer',
  });

const cardToken = (shopId: number, customerId: number) =>
  legacySign(CUSTOMER_ISSUER, {
    scene: 'CARD_SHOP',
    shopId,
    customerId,
    openid: `c-${shopId}-${customerId}`,
    type: 'customer',
  });

describe('跨店越权：A 店顾客令牌取不到 B 店的数据', () => {
  beforeEach(() => {
    queries.length = 0;
  });

  it('本店令牌正常解析，顾客定位查询带 shopId + customerId 双条件', async () => {
    const identity = await brandService.identity(
      brandToken(SHOP_A, CUSTOMER_OF_A),
    );
    expect(identity).toMatchObject({
      shopId: SHOP_A,
      customerId: CUSTOMER_OF_A,
    });
    expect(
      queries.find((q) => q.model === 'brandCustomer')?.where,
    ).toMatchObject({ id: CUSTOMER_OF_A, shopId: SHOP_A });
  });

  it('brand-mall：令牌里把 shopId 换成 B 店（顾客 id 不变）→ 401，且不回落到单条件查询', async () => {
    await expectUnauthorizedAsync(
      brandService.identity(brandToken(SHOP_B, CUSTOMER_OF_A)),
      '登录状态已失效，请重新进入小程序',
    );
    expect(
      queries.find((q) => q.model === 'brandCustomer')?.where,
    ).toMatchObject({ id: CUSTOMER_OF_A, shopId: SHOP_B });
  });

  it('card-shop：同一个顾客 id 换站点 → 401，双条件查不到就断链', async () => {
    await expectUnauthorizedAsync(
      cardService.identity(cardToken(SHOP_B, CUSTOMER_OF_A)),
      '登录状态已失效，请重新进入小程序',
    );
    expect(
      queries.find((q) => q.model === 'cardShopCustomer')?.where,
    ).toMatchObject({ id: CUSTOMER_OF_A, siteId: SHOP_B });
  });

  it('合法会话只能取自己那组 (siteId, customerId) 的订单，陷阱行不漏一条', async () => {
    const identity = await cardService.identity(
      cardToken(SHOP_A, CUSTOMER_OF_A),
    );
    expect(
      await cardService.myOrderIds(identity.siteId, identity.customerId),
    ).toEqual([501]);
    // 业务查询一律双条件：任何人拿这份身份都拼不出只带 customerId 的查询
    const orderQueries = queries.filter((q) => q.model === 'cardShopOrder');
    expect(orderQueries).toHaveLength(1);
    expect(Object.keys(orderQueries[0].where).sort()).toEqual([
      'customerId',
      'siteId',
    ]);
  });

  it('越权令牌在 identity 就断了，压根走不到订单查询', async () => {
    await expectUnauthorizedAsync(
      cardService.identity(cardToken(SHOP_B, CUSTOMER_OF_A)),
      '登录状态已失效，请重新进入小程序',
    );
    expect(queries.filter((q) => q.model === 'cardShopOrder')).toHaveLength(0);
  });

  it('成对校验：A 店站点配 B 店顾客（21）同样取不到', async () => {
    await expectUnauthorizedAsync(
      cardService.identity(cardToken(SHOP_A, CUSTOMER_OF_B)),
      '登录状态已失效，请重新进入小程序',
    );
    await expectUnauthorizedAsync(
      brandService.identity(brandToken(SHOP_A, CUSTOMER_OF_B)),
      '登录状态已失效，请重新进入小程序',
    );
  });

  it('共用 issuer 的第二层：scene 不对时业务层先拒，压根不查库', async () => {
    await expectUnauthorizedAsync(
      brandService.identity(cardToken(SHOP_A, CUSTOMER_OF_A)),
      '登录状态不适用本商城，请重新进入小程序',
    );
    expect(queries).toHaveLength(0);
    await expectUnauthorizedAsync(
      cardService.identity(brandToken(SHOP_A, CUSTOMER_OF_A)),
      '登录状态不适用本商店，请重新进入小程序',
    );
    expect(queries).toHaveLength(0);
  });

  it('同 issuer 的另一对：HEALTH / MARKET 场景也进不了这两个域', async () => {
    for (const scene of ['HEALTH', 'MARKET', 'EXPRESS'] as const) {
      const token = legacySign(CUSTOMER_ISSUER, {
        scene,
        shopId: SHOP_A,
        customerId: CUSTOMER_OF_A,
        openid: 'o-1',
        type: 'customer',
      });
      await expectUnauthorizedAsync(
        brandService.identity(token),
        '登录状态不适用本商城，请重新进入小程序',
      );
      await expectUnauthorizedAsync(
        cardService.identity(token),
        '登录状态不适用本商店，请重新进入小程序',
      );
    }
  });
});

/**
 * 两套 `sha256-concat` 会员令牌（知识付费 / 数字人）的历史口径等价。
 *
 * 它们不在上面的 DOMAINS 里：DOMAINS 走 hmac-issuer 派生，而这两套用的是
 * `SHA256("<context>|" + JWT_SECRET)`。数字人原先只有实现自述口径、没有回归钉住，
 * 一旦被「顺手统一派生算法」，线上已签出的会员令牌会集体验不过——顾客直接被踢下线。
 */
describe('与历史口径等价：sha256-concat 的两套会员令牌', () => {
  const cases = [
    {
      label: '知识付费会员',
      issuer: KP_MEMBER_ISSUER,
      context: 'oem-knowledge-pay-member',
      claims: { mid: 7, sid: 3, type: 'kp-member' },
      payload: { memberId: 7, siteId: 3 },
      issue: () => issueMemberToken({ memberId: 7, siteId: 3 }),
      verify: (token: string) => verifyMemberToken(token),
    },
    {
      label: '数字人会员',
      issuer: DH_MEMBER_ISSUER,
      context: 'oem-digital-human-member',
      claims: { mid: 12, sid: 5, type: 'dh-member' },
      payload: { memberId: 12, siteId: 5 },
      issue: () => issueDhMemberToken({ memberId: 12, siteId: 5 }),
      verify: (token: string) => verifyDhMemberToken(token),
    },
  ];

  for (const item of cases) {
    it(`${item.label}：老方式手签的新实现认，新实现签的老方式也认`, () => {
      const key = sha256Key(item.context);
      const legacy = jwt.sign(item.claims, key, {
        algorithm: 'HS256',
        issuer: item.issuer,
        expiresIn: 3600,
      });
      expect(item.verify(legacy)).toEqual(item.payload);
      const fresh = jwt.verify(item.issue(), key, {
        algorithms: ['HS256'],
        issuer: item.issuer,
      }) as jwt.JwtPayload;
      expect(fresh).toMatchObject(item.claims);
    });

    it(`${item.label}默认 TTL 与历史一致（90 天）`, () => {
      const claims = jwt.decode(item.issue()) as jwt.JwtPayload;
      const seconds = (claims.exp as number) - (claims.iat as number);
      expect(Math.abs(seconds - 90 * 86_400)).toBeLessThanOrEqual(1);
    });

    it(`${item.label}换不开顾客身份`, () => {
      const customer = domainOf('顾客');
      expectUnauthorized(() => customer.parse(item.issue()), customer.invalid);
    });
  }

  it('两套会员令牌互不换身份（context 不同就是两把密钥）', () => {
    const [kp, dh] = cases;
    const expired = '登录已过期，请重新进入小程序';
    expectUnauthorized(() => kp.verify(dh.issue()), expired);
    expectUnauthorized(() => dh.verify(kp.issue()), expired);
  });
});
