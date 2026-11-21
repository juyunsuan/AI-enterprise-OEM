import { parseCardLines } from './card-shop.parser';

describe('卡密导入解析 · 单卡密格式', () => {
  it('整行即卡密，不做任何切分', () => {
    const result = parseCardLines('ABCD1234\nEFGH5678\n', 'AUTO', 'SINGLE');
    expect(result.items.map((item) => item.secret)).toEqual([
      'ABCD1234',
      'EFGH5678',
    ]);
    expect(result.items.map((item) => item.number)).toEqual(['', '']);
    expect(result.splitterUsed).toBe('NONE');
    expect(result.invalid).toEqual([]);
  });

  it('CRLF、BOM 与空行都不产生脏卡', () => {
    const result = parseCardLines('﻿AAA1\r\nBBB2\r\n\r\n', 'AUTO', 'SINGLE');
    expect(result.totalLines).toBe(2);
    expect(result.items.map((item) => item.secret)).toEqual(['AAA1', 'BBB2']);
  });

  it('同一次导入里重复的卡只留第一张', () => {
    const result = parseCardLines('AAA1\nAAA1\nBBB2', 'AUTO', 'SINGLE');
    expect(result.items).toHaveLength(2);
    expect(result.duplicateLines).toBe(1);
  });

  it('超过 191 字符的卡密按无效行报出来，不截断后入库', () => {
    const result = parseCardLines(`${'X'.repeat(192)}`, 'AUTO', 'SINGLE');
    expect(result.items).toHaveLength(0);
    expect(result.invalid[0]?.reason).toContain('191');
  });
});

describe('卡密导入解析 · 卡号+卡密格式', () => {
  it('AUTO 认出空格、竖线、逗号与四个横杠', () => {
    expect(parseCardLines('N1 S1\nN2 S2', 'AUTO', 'PAIR').splitterUsed).toBe(
      'SPACE',
    );
    expect(parseCardLines('N1|S1\nN2|S2', 'AUTO', 'PAIR').splitterUsed).toBe(
      'PIPE',
    );
    expect(parseCardLines('N1,S1\nN2,S2', 'AUTO', 'PAIR').splitterUsed).toBe(
      'COMMA',
    );
    expect(
      parseCardLines('N1----S2\nN2----S2', 'AUTO', 'PAIR').splitterUsed,
    ).toBe('DASH');
  });

  it('四个横杠优先级高于单横杠', () => {
    const result = parseCardLines('AB-CD----1234', 'AUTO', 'PAIR');
    expect(result.items[0]).toEqual({
      line: 1,
      number: 'AB-CD',
      secret: '1234',
    });
  });

  it('密文里的空格算进卡密：只切第一刀', () => {
    const result = parseCardLines('N1 secret with spaces', 'SPACE', 'PAIR');
    expect(result.items[0]?.secret).toBe('secret with spaces');
  });

  it('显式指定分隔符时不再自动改判', () => {
    const result = parseCardLines('N1|S1', 'COMMA', 'PAIR');
    expect(result.items).toHaveLength(0);
    expect(result.invalid[0]?.reason).toContain('分隔符');
  });

  it('NONE 表示整行都是卡密，即便商品是卡号+卡密格式', () => {
    const result = parseCardLines('N1 S1', 'NONE', 'PAIR');
    expect(result.items[0]?.secret).toBe('N1 S1');
    expect(result.items[0]?.number).toBe('');
  });

  it('个别行漏写卡密只判那一行，其余照常入库', () => {
    const result = parseCardLines('N1 S1\nN2\nN3 S3', 'AUTO', 'PAIR');
    expect(result.items.map((item) => item.line)).toEqual([1, 3]);
    expect(result.invalid[0]?.reason).toContain('该行没切出卡号与卡密');
  });

  it('整体都不带分隔符时判为未识别，不把整批卡密塞进卡号列', () => {
    const result = parseCardLines('AAA1\nBBB2\nCCC3', 'AUTO', 'PAIR');
    expect(result.items).toHaveLength(0);
    expect(result.invalid).toHaveLength(3);
    expect(result.invalid[0]?.reason).toContain('分隔符');
  });

  it('同批次重复的卡号+卡密组合只留一张', () => {
    const result = parseCardLines('N1 S1\nN1 S1\nN1 S2', 'AUTO', 'PAIR');
    expect(result.items).toHaveLength(2);
    expect(result.duplicateLines).toBe(1);
  });
});

describe('卡密导入解析 · 万张级批量回归', () => {
  it('1 万行里混入重复与空行：逐行计数正确、结果无重复、顺序不丢', () => {
    const lines: string[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      lines.push(`CARD${String(index).padStart(6, '0')}`);
      if (index % 100 === 0) lines.push('');
      if (index % 50 === 0) lines.push(`CARD${String(index).padStart(6, '0')}`);
    }
    const result = parseCardLines(lines.join('\n'), 'AUTO', 'SINGLE');
    expect(result.items).toHaveLength(10_000);
    expect(result.duplicateLines).toBe(200);
    expect(result.totalLines).toBe(10_200);
    expect(result.items[0]?.secret).toBe('CARD000000');
    expect(result.items.at(-1)?.secret).toBe('CARD009999');
    expect(new Set(result.items.map((item) => item.secret)).size).toBe(10_000);
  });

  it('卡号+卡密格式 1 万行：分隔符一次判定后整批沿用，不漏行', () => {
    const raw = Array.from(
      { length: 10_000 },
      (_, index) =>
        `N${String(index).padStart(5, '0')}|S${String(index).padStart(6, '0')}`,
    ).join('\n');
    const result = parseCardLines(raw, 'AUTO', 'PAIR');
    expect(result.items).toHaveLength(10_000);
    expect(result.splitterUsed).toBe('PIPE');
    expect(result.invalid).toEqual([]);
    expect(result.items[4_999]).toEqual({
      line: 5_000,
      number: 'N04999',
      secret: 'S004999',
    });
  });
});
