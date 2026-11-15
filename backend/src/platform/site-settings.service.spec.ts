import {
  BOARD_TAB_BOARDS,
  BOARD_TAB_ROLES,
  normalizeBoardTabs,
  normalizeDownloadUrl,
} from './site-settings.service';

/**
 * 板块页签显隐是管理员在后台填的配置（系统边界输入）：
 * 只允许 `<已知板块>:<已知角色>`，其余脏值必须丢弃，免得前端拿到无法识别的 token。
 */
describe('normalizeBoardTabs', () => {
  it('保留合法的板块:角色 token', () => {
    expect(normalizeBoardTabs(['market:demand', 'supply:services'])).toEqual([
      'market:demand',
      'supply:services',
    ]);
  });

  it('非数组一律当空', () => {
    expect(normalizeBoardTabs(undefined)).toEqual([]);
    expect(normalizeBoardTabs(null)).toEqual([]);
    expect(normalizeBoardTabs('market:demand')).toEqual([]);
    expect(normalizeBoardTabs({ 0: 'market:demand' })).toEqual([]);
  });

  it('丢弃未知板块、未知角色、缺段或多段的值', () => {
    expect(
      normalizeBoardTabs([
        'unknown:demand',
        'market:unknown',
        'market',
        'market:demand:extra',
        '',
        ':demand',
        'market:',
      ]),
    ).toEqual([]);
  });

  it('丢弃非字符串项并去重', () => {
    expect(
      normalizeBoardTabs([
        'market:demand',
        'market:demand',
        1,
        null,
        'tax:services',
      ]),
    ).toEqual(['market:demand', 'tax:services']);
  });

  it('去掉首尾空白后再判定合法性', () => {
    expect(normalizeBoardTabs(['  market:demand  '])).toEqual([
      'market:demand',
    ]);
  });

  it('限量不超过「板块数 × 角色数」，且全量合法值可完整通过', () => {
    const all = BOARD_TAB_BOARDS.flatMap((board) =>
      BOARD_TAB_ROLES.map((role) => `${board}:${role}`),
    );
    const limit = BOARD_TAB_BOARDS.length * BOARD_TAB_ROLES.length;
    const duplicated = [...all, all[0]];
    expect(normalizeBoardTabs(all)).toHaveLength(limit);
    expect(normalizeBoardTabs(duplicated)).toHaveLength(limit);
  });
});

/**
 * 客户端下载地址会直接放进顶栏图标的跳转，只认 http(s) 与站内路径，
 * 其它写法（javascript:、协议相对、带空白）一律当没填，避免把脏链接挂到导航上。
 */
describe('normalizeDownloadUrl', () => {
  it('保留 http(s) 与站内路径', () => {
    expect(normalizeDownloadUrl('https://cdn.example.com/BotBuddy.exe')).toBe(
      'https://cdn.example.com/BotBuddy.exe',
    );
    expect(normalizeDownloadUrl('http://127.0.0.1:1690/downloads/a.exe')).toBe(
      'http://127.0.0.1:1690/downloads/a.exe',
    );
    expect(normalizeDownloadUrl('/downloads/BotBuddy.exe')).toBe(
      '/downloads/BotBuddy.exe',
    );
  });

  it('丢弃脚本协议、协议相对与空值', () => {
    expect(normalizeDownloadUrl('javascript:alert(1)')).toBe('');
    expect(normalizeDownloadUrl('//evil.example.com/a.exe')).toBe('');
    expect(normalizeDownloadUrl(' file:///c:/a.exe ')).toBe('');
    expect(normalizeDownloadUrl('')).toBe('');
    expect(normalizeDownloadUrl(null)).toBe('');
  });
});
