import { createHmac } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { BusinessException } from '../common/business.exception';
import {
  hashPassword,
  issueMerchantToken,
  MP_MERCHANT_ISSUER,
  parseMerchantToken,
  verifyPassword,
} from './mp.token';

/**
 * 商户令牌与口令：与站内会话、顾客令牌物理隔离。
 * 这里钉住「签名密钥派生、issuer 绑定、过期语义、口令分列存储」四条，破任意一条
 * 都可能让商户令牌被当成站内会话（或反之）使用。
 */
const payload = {
  marketId: 1,
  merchantId: 11,
  userId: 21,
  role: 'OWNER' as const,
};

const originalSecret = process.env.JWT_SECRET;

beforeEach(() => {
  process.env.JWT_SECRET = 'unit-test-secret';
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

describe('商户令牌', () => {
  it('签发的令牌可解析回原载荷', () => {
    expect(parseMerchantToken(issueMerchantToken(payload))).toEqual(payload);
  });

  it('接受带 Bearer 前缀的令牌', () => {
    const token = issueMerchantToken(payload);
    expect(parseMerchantToken(`Bearer ${token}`)).toEqual(payload);
  });

  it('过期令牌单独报过期，引导重新登录', () => {
    // 校验留 10s 时钟容差，过期时间要早于容差才真正判过期
    // 收口到令牌工厂后 `issue` 的 expiresIn 被夹到 >=1 秒（不再接受负数），
    // 所以这里按历史口径手签一张过期令牌：派生密钥与 issuer 与迁移前逐字一致，
    // 断言不变，顺带钉住"老方式签出的令牌新实现照样认"。
    const token = jwt.sign(
      { ...payload, type: 'mp-merchant' },
      createHmac('sha256', 'unit-test-secret')
        .update(MP_MERCHANT_ISSUER)
        .digest(),
      { algorithm: 'HS256', issuer: MP_MERCHANT_ISSUER, expiresIn: -60 },
    );
    expect(() => parseMerchantToken(token)).toThrow(BusinessException);
    expect(() => parseMerchantToken(token)).toThrow('已过期');
  });

  it('用站内 JWT_SECRET 原样签发的令牌无法通过（密钥派生隔离）', () => {
    const forged = jwt.sign(
      { ...payload, type: 'mp-merchant' },
      'unit-test-secret',
      { algorithm: 'HS256', issuer: 'mp-merchant' },
    );
    expect(() => parseMerchantToken(forged)).toThrow('商户登录状态无效');
  });

  it('空令牌与签名篡改一律按未登录处理', () => {
    expect(() => parseMerchantToken('')).toThrow('请先登录商户后台');
    const tampered = `${issueMerchantToken(payload)}x`;
    expect(() => parseMerchantToken(tampered)).toThrow(BusinessException);
  });

  it('未配置 JWT_SECRET 时不签发（宁可 503 也不落弱密钥）', () => {
    delete process.env.JWT_SECRET;
    expect(() => issueMerchantToken(payload)).toThrow(BusinessException);
  });
});

describe('商户口令', () => {
  it('scrypt 分列存储：同口令两次盐不同，均可校验', () => {
    const first = hashPassword('S3cret!');
    const second = hashPassword('S3cret!');
    expect(first.salt).not.toEqual(second.salt);
    expect(first.hash).not.toEqual(second.hash);
    expect(verifyPassword('S3cret!', first.salt, first.hash)).toBe(true);
    expect(verifyPassword('S3cret!', second.salt, second.hash)).toBe(true);
  });

  it('口令错误或存储缺失时校验失败', () => {
    const { salt, hash } = hashPassword('S3cret!');
    expect(verifyPassword('wrong', salt, hash)).toBe(false);
    expect(verifyPassword('S3cret!', '', hash)).toBe(false);
    expect(verifyPassword('S3cret!', salt, '')).toBe(false);
  });
});
