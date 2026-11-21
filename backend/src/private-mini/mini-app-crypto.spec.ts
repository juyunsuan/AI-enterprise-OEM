import { MiniAppCrypto } from './mini-app-crypto';

describe('private-mini/mini-app-crypto', () => {
  const original = process.env.EXTERNAL_CRED_KEY;
  beforeAll(() => {
    process.env.EXTERNAL_CRED_KEY = 'unit-test-cred-key';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.EXTERNAL_CRED_KEY;
    else process.env.EXTERNAL_CRED_KEY = original;
  });

  it('同一 scope 往返一致，且密文每次不同（随机 IV）', () => {
    const crypto = new MiniAppCrypto();
    const first = crypto.encrypt('ONSITE:7:appSecret', 'secret-value');
    const second = crypto.encrypt('ONSITE:7:appSecret', 'secret-value');
    expect(first).not.toBe(second);
    expect(crypto.decrypt('ONSITE:7:appSecret', first)).toBe('secret-value');
  });

  it('换一个店铺或换一个字段都解不开：跨主体密文互不可读', () => {
    const crypto = new MiniAppCrypto();
    const sealed = crypto.encrypt('ONSITE:7:appSecret', 'aaaa');
    expect(crypto.decrypt('ONSITE:8:appSecret', sealed)).toBe('');
    expect(crypto.decrypt('ONSITE:7:uploadKey', sealed)).toBe('');
    expect(crypto.decrypt('BRAND:7:appSecret', sealed)).toBe('');
  });

  it('空值不进加密流程，密文格式非法时报内部错误而不是静默空串', () => {
    const crypto = new MiniAppCrypto();
    expect(crypto.encrypt('ONSITE:7:mapKey', '')).toBe('');
    expect(crypto.decrypt('ONSITE:7:mapKey', '')).toBe('');
    expect(() =>
      crypto.decrypt('ONSITE:7:mapKey', 'not-a-sealed-value'),
    ).toThrow();
  });
});
