import { createHash, createHmac } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { createMiniToken, type MiniTokenProfile } from './mini-token-factory';

/**
 * 令牌工厂的用例。
 *
 * 最关键的一条是**等价性**：收口实现不能把线上已签出的令牌作废。
 * 所以这里用"手工按历史口径签一个令牌"的方式，断言工厂依然验得过——
 * 一旦有人顺手改了派生算法，这条会立刻红。
 */

const SECRET = 'unit-test-jwt-secret';
type Member = { memberId: number; siteId: number };

const memberProfile: MiniTokenProfile<Member> = {
  name: '数字人会员',
  issuer: 'dh-member',
  derive: 'sha256-concat',
  context: 'oem-digital-human-member',
  ttlSeconds: 90 * 86_400,
  stripBearer: true,
  expiredMessage: '登录已过期，请重新进入小程序',
  toClaims: (payload) => ({
    mid: payload.memberId,
    sid: payload.siteId,
    type: 'dh-member',
  }),
  fromClaims: (claims) =>
    typeof claims.mid === 'number' && typeof claims.sid === 'number'
      ? { memberId: claims.mid, siteId: claims.sid }
      : null,
};

const customerProfile: MiniTokenProfile<{
  scene: string;
  shopId: number;
  customerId: number;
}> = {
  name: '顾客',
  issuer: 'private-mini-customer',
  derive: 'hmac-issuer',
  ttlSeconds: 30 * 86_400,
  scenes: ['BRAND', 'CARD_SHOP'],
  sceneOf: (payload) => payload.scene,
  toClaims: (payload) => ({
    scene: payload.scene,
    shopId: payload.shopId,
    cid: payload.customerId,
  }),
  fromClaims: (claims) =>
    typeof claims.scene === 'string' && typeof claims.shopId === 'number'
      ? {
          scene: claims.scene,
          shopId: claims.shopId,
          customerId: Number(claims.cid),
        }
      : null,
};

const sha256Key = (context: string) =>
  createHash('sha256').update(`${context}|${SECRET}`).digest('hex');
const hmacKey = (issuer: string) =>
  createHmac('sha256', SECRET).update(issuer).digest();

beforeEach(() => {
  process.env.JWT_SECRET = SECRET;
});

describe('createMiniToken 与历史口径等价', () => {
  it('sha256-concat：老方式签出的令牌，工厂照样认（不会把顾客踢下线）', () => {
    const legacy = jwt.sign(
      { mid: 7, sid: 3, type: 'dh-member' },
      sha256Key('oem-digital-human-member'),
      { algorithm: 'HS256', issuer: 'dh-member', expiresIn: 3600 },
    );
    const token = createMiniToken(memberProfile);
    expect(token.tryVerify(legacy)).toEqual({ memberId: 7, siteId: 3 });
    // 新签的令牌用老口径也能验：双向等价
    expect(
      jwt.verify(
        token.issue({ memberId: 1, siteId: 2 }),
        sha256Key('oem-digital-human-member'),
        {
          issuer: 'dh-member',
        },
      ),
    ).toMatchObject({ mid: 1, sid: 2 });
  });

  it('hmac-issuer：同样与历史派生串完全一致', () => {
    const legacy = jwt.sign(
      { scene: 'BRAND', shopId: 9, cid: 11 },
      hmacKey('private-mini-customer'),
      { algorithm: 'HS256', issuer: 'private-mini-customer', expiresIn: 3600 },
    );
    expect(createMiniToken(customerProfile).tryVerify(legacy)).toEqual({
      scene: 'BRAND',
      shopId: 9,
      customerId: 11,
    });
  });

  it('Authorization 头带 Bearer 前缀也能验（历史行为保留）', () => {
    const token = createMiniToken(memberProfile);
    const raw = token.issue({ memberId: 5, siteId: 6 });
    expect(token.tryVerify(`Bearer ${raw}`)).toEqual({
      memberId: 5,
      siteId: 6,
    });
  });
});

it('过期与"无效"分别说各自的话术（历史两句文案，混了会把用户引到错的自救路径）', () => {
  const worded = createMiniToken<Member>({
    ...memberProfile,
    expiredMessage: '技师登录已过期，请重新绑定身份',
    invalidMessage: '技师身份已失效，请重新绑定（手机号 + 工号）',
  });
  const stale = jwt.sign(
    { mid: 1, sid: 1, type: 'dh-member' },
    sha256Key('oem-digital-human-member'),
    {
      algorithm: 'HS256',
      issuer: 'dh-member',
      expiresIn: -10,
    },
  );
  expect(() => worded.verify(stale)).toThrow('技师登录已过期，请重新绑定身份');
  expect(() => worded.verify('not-a-jwt')).toThrow(
    '技师身份已失效，请重新绑定（手机号 + 工号）',
  );
});

describe('createMiniToken 边界', () => {
  it('跨 issuer 的令牌必须拒（顾客令牌冒充会员）', () => {
    const customer = createMiniToken(customerProfile).issue({
      scene: 'BRAND',
      shopId: 1,
      customerId: 2,
    });
    expect(createMiniToken(memberProfile).tryVerify(customer)).toBeNull();
  });

  it('场景不在白名单必须拒：把"越权判定交给业务层"变成代码约束', () => {
    const forged = jwt.sign(
      { scene: 'ONSITE_STAFF', shopId: 1, cid: 2 },
      hmacKey('private-mini-customer'),
      { algorithm: 'HS256', issuer: 'private-mini-customer', expiresIn: 3600 },
    );
    expect(createMiniToken(customerProfile).tryVerify(forged)).toBeNull();
  });

  it('过期与篡改一律拒绝，verify 抛出可读的失效提示', () => {
    const token = createMiniToken(memberProfile);
    const expired = jwt.sign(
      { mid: 1, sid: 1, type: 'dh-member' },
      sha256Key('oem-digital-human-member'),
      {
        algorithm: 'HS256',
        issuer: 'dh-member',
        expiresIn: -10,
      },
    );
    expect(token.tryVerify(expired)).toBeNull();
    expect(() => token.verify('garbage')).toThrow(
      '登录已过期，请重新进入小程序',
    );
  });

  it('JWT_SECRET 缺失时报服务不可用而不是签出一个弱密钥', () => {
    delete process.env.JWT_SECRET;
    const token = createMiniToken(memberProfile);
    expect(() => token.issue({ memberId: 1, siteId: 1 })).toThrow(/JWT_SECRET/);
  });

  it('legacyDerive 双读窗口：切口径过渡期新旧令牌都能验，签发只走新口径', () => {
    const migrated: MiniTokenProfile<Member> = {
      ...memberProfile,
      derive: 'hmac-issuer',
      legacyDerive: 'sha256-concat',
      legacyContext: 'oem-digital-human-member',
    };
    const token = createMiniToken(migrated);
    const oldStyle = jwt.sign(
      { mid: 4, sid: 4, type: 'dh-member' },
      sha256Key('oem-digital-human-member'),
      { algorithm: 'HS256', issuer: 'dh-member', expiresIn: 3600 },
    );
    expect(token.tryVerify(oldStyle)).toEqual({ memberId: 4, siteId: 4 });
    expect(token.tryVerify(token.issue({ memberId: 8, siteId: 8 }))).toEqual({
      memberId: 8,
      siteId: 8,
    });
    expect(
      createMiniToken(memberProfile).tryVerify(
        token.issue({ memberId: 8, siteId: 8 }),
      ),
    ).toBeNull();
  });
});
