import {
  clip,
  commerceCode,
  commerceOrderNo,
  commerceStamp,
  iso,
  skuUniqueId,
} from './ident';

describe('commerce-core/ident 单号与标识', () => {
  it('单号 = 前缀 + 14 位时间 + 6 位数字', () => {
    const now = new Date(2026, 10, 18, 9, 8, 7);
    expect(commerceStamp(now)).toBe('20261118090807');
    expect(commerceOrderNo('so', now)).toMatch(
      new RegExp(`^SO${commerceStamp(now)}\\d{6}$`),
    );
    expect(commerceOrderNo('RF', now)).toMatch(/^RF\d{20}$/);
  });

  it('店铺码不含 I/O/0/1 这类手抄歧义字符', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(commerceCode()).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    }
    // 长度夹到 [4,32]，防止误传 0 或超长
    expect(commerceCode(3)).toHaveLength(4);
    expect(commerceCode(12)).toHaveLength(12);
    expect(commerceCode(999)).toHaveLength(32);
  });

  it('规格组合顺序无关', () => {
    expect(skuUniqueId({ 颜色: '红', 尺码: 'L' })).toBe('尺码:L|颜色:红');
    expect(skuUniqueId({ 尺码: 'L', 颜色: '红' })).toBe(
      skuUniqueId({ 颜色: '红', 尺码: 'L' }),
    );
    expect(skuUniqueId({ 颜色: ' ', 尺码: 'L' })).toBe('尺码:L');
  });

  it('clip 与 iso 对空值安全', () => {
    expect(clip('  中文 abc  ', 4)).toBe('  中文');
    expect(clip(null, 10)).toBe('');
    expect(clip('abc', -1)).toBe('');
    expect(iso(null)).toBe('');
    expect(iso(new Date(0))).toBe('1970-01-01T00:00:00.000Z');
  });
});
