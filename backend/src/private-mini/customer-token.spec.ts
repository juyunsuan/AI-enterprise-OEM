import { createHmac } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { issueSsoSession } from '../auth/token';
import {
  CUSTOMER_ISSUER,
  issueCustomerToken,
  parseCustomerToken,
} from './customer-token';

describe('private-mini/customer-token', () => {
  const original = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'unit-test-jwt-secret';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });

  it('签出的顾客令牌能解回三要素（scene/shopId/customerId）', () => {
    const token = issueCustomerToken({
      scene: 'ONSITE',
      shopId: 12,
      customerId: 34,
      openid: 'o-abc',
    });
    expect(parseCustomerToken(token)).toEqual({
      scene: 'ONSITE',
      shopId: 12,
      customerId: 34,
      openid: 'o-abc',
    });
  });

  /** 这条是租户隔离的地基：站内会话令牌绝不能被当成顾客身份，反之亦然。 */
  it('站内 SSO 会话不被认成顾客令牌', () => {
    const sso = issueSsoSession('1001', 'admin', 'admin');
    expect(() => parseCustomerToken(sso)).toThrow();
    const customer = issueCustomerToken({
      scene: 'ONSITE',
      shopId: 1,
      customerId: 1,
      openid: 'o-1',
    });
    expect(() => parseCustomerToken(customer + 'x')).toThrow();
  });

  it('过期令牌给出「重新进入小程序」的可执行文案', () => {
    // 取 -30 而不是 -1：验签有 10 秒时钟容差，差 1 秒仍会被放行
    // 收口到令牌工厂后 `issue` 的 expiresIn 被夹到 >=1 秒（不再接受负数），
    // 所以这里按历史口径手签一张过期令牌：派生密钥、issuer、载荷字段名与迁移前逐字一致，
    // 断言不变，顺带钉住"老方式签出的令牌新实现照样认"。
    const expired = jwt.sign(
      {
        scene: 'ONSITE',
        shopId: 1,
        customerId: 1,
        openid: 'o-1',
        type: 'customer',
      },
      createHmac('sha256', 'unit-test-jwt-secret')
        .update(CUSTOMER_ISSUER)
        .digest(),
      { algorithm: 'HS256', issuer: CUSTOMER_ISSUER, expiresIn: -30 },
    );
    try {
      parseCustomerToken(expired);
      throw new Error('不该通过验签');
    } catch (error) {
      expect(error instanceof Error ? error.message : '').toContain(
        '重新进入小程序',
      );
    }
  });
});
