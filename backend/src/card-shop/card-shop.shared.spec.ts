import {
  amount,
  cardShopNo,
  cardShopSiteCode,
  checkContact,
  fromCents,
  hashSecret,
  intIn,
  jsonInput,
  maskSecret,
  mergeJson,
  pageArgs,
  stockLevel,
  toCents,
  verifySecret,
} from './card-shop.shared';
import { normalizeTiers, pickUnitCents } from './card-shop.goods.service';

describe('card-shop.shared 金额换算', () => {
  it('元 ↔ 分 全程整数，批量买卡不丢分', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents('0.1')).toBe(10);
    const sum = [19.99, 19.99, 19.99].reduce(
      (acc, value) => acc + toCents(value),
      0,
    );
    expect(fromCents(sum)).toBe(59.97);
  });

  it('Prisma 的 Decimal 对象也认（toString 是唯一稳定出口）', () => {
    expect(amount({ toString: () => '12.34' })).toBe(12.34);
    expect(amount(null)).toBe(0);
    expect(amount(Number.NaN)).toBe(0);
  });
});

describe('card-shop.shared 口令摘要', () => {
  it('同盐同明文可校验，改一个字符就不过', () => {
    const hash = hashSecret('CS20260101120000', ' 1234 ');
    expect(verifySecret('CS20260101120000', '1234', hash)).toBe(true);
    expect(verifySecret('CS20260101120000', '1235', hash)).toBe(false);
  });

  it('换个盐（＝换个订单）就撞不上，库里的摘要不能跨单复用', () => {
    const hash = hashSecret('CS-A', '1234');
    expect(verifySecret('CS-B', '1234', hash)).toBe(false);
  });

  it('脏值与非摘要串一律判不过，不抛异常', () => {
    expect(verifySecret('salt', '1234', '')).toBe(false);
    expect(verifySecret('salt', '1234', 'not-a-hash')).toBe(false);
    expect(verifySecret('salt', '', hashSecret('salt', ''))).toBe(true);
  });
});

describe('card-shop.shared 掩码与联系方式', () => {
  it('列表掩码保头尾，短码全遮', () => {
    expect(maskSecret('ABCDEFGH1234')).toBe('ABC****34');
    expect(maskSecret('AB12')).toBe('****');
    expect(maskSecret('')).toBe('');
  });

  it('口径决定校验强度：MOBILE 只认手机号，ANY 只要有内容', () => {
    expect(checkContact('MOBILE', '13800138000')).toBe('');
    expect(checkContact('MOBILE', '12345')).toContain('手机号格式');
    expect(checkContact('EMAIL', 'a@b.co')).toBe('');
    expect(checkContact('ANY', '  ')).toContain('请填写联系方式');
    expect(checkContact('NONE', '')).toBe('');
    expect(checkContact('QQ', 'anything')).toBe('');
  });
});

describe('card-shop.shared 库存档位与参数归一', () => {
  it('0 张永远售罄；预警值低于兜底 10 时按兜底', () => {
    expect(stockLevel(0)).toBe('SOLD_OUT');
    expect(stockLevel(10, 0)).toBe('TIGHT');
    expect(stockLevel(11, 0)).toBe('FULL');
    expect(stockLevel(30, 50)).toBe('TIGHT');
  });

  it('intIn 夹紧区间，脏值给回退值', () => {
    expect(intIn('8', 1, 10, 5)).toBe(8);
    expect(intIn(-3, 1, 10, 5)).toBe(1);
    expect(intIn('abc', 1, 10, 5)).toBe(5);
  });

  it('pageArgs 认 query 里的字符串数字，越界由 pageParam 收敛', () => {
    expect(pageArgs({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
      offset: 100,
    });
  });

  it('JSON 列在 PG 侧给回字符串时仍能合并默认值', () => {
    expect(mergeJson('{"b":2}', { a: 1, b: 0 })).toEqual({ a: 1, b: 2 });
    expect(mergeJson('not-json', { a: 1 })).toEqual({ a: 1 });
    expect(jsonInput(null)).toEqual({});
  });
});

describe('卡密商城单号与站点码', () => {
  it('单号 = 前缀 + 14 位时间 + 6 位数字', () => {
    expect(cardShopNo('CS')).toMatch(/^CS\d{20}$/);
    expect(cardShopNo('CSB')).toMatch(/^CSB\d{20}$/);
  });

  it('站点码避开 I/O/0/1 这类手抄易混字符', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(cardShopSiteCode()).toMatch(
        /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/,
      );
    }
  });
});

describe('批发阶梯价归一', () => {
  it('丢弃高于零售价的档位并按起购量升序', () => {
    const tiers = normalizeTiers(
      [
        { min: 10, price: 8 },
        { min: 2, price: 9 },
        { min: 5, price: 12 },
      ],
      10,
    );
    expect(tiers).toEqual([
      { min: 2, price: 9 },
      { min: 10, price: 8 },
    ]);
  });

  it('单价取「起购量不超过购买量」的最高一档', () => {
    const tiers = [
      { min: 2, price: 9 },
      { min: 10, price: 8 },
    ];
    expect(pickUnitCents(tiers, 10, 1)).toBe(1000);
    expect(pickUnitCents(tiers, 10, 3)).toBe(900);
    expect(pickUnitCents(tiers, 10, 30)).toBe(800);
  });
});
