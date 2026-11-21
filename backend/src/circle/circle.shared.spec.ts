import {
  CIRCLE_DEFAULT_SETTINGS,
  communityCode,
  settingsOf,
  visitorKeyOf,
} from './circle.shared';

describe('circle shared', () => {
  it('同一访客同一天的浏览去重键稳定，匿名按 IP 区分', () => {
    expect(visitorKeyOf('openid-1', '1.1.1.1')).toBe('u:openid-1');
    expect(visitorKeyOf('openid-1', '2.2.2.2')).toBe('u:openid-1');
    expect(visitorKeyOf('', '1.1.1.1')).toBe('ip:1.1.1.1');
    expect(visitorKeyOf('', '')).toBe('ip:unknown');
  });

  it('平台参数缺行/坏值时回落安全默认值', () => {
    expect(settingsOf(null)).toEqual(CIRCLE_DEFAULT_SETTINGS);
    expect(settingsOf({ maxPostsPerDay: -1, maxGroupsPerUser: 99999 })).toEqual(
      {
        ...CIRCLE_DEFAULT_SETTINGS,
        maxPostsPerDay: 0,
        maxGroupsPerUser: 1000,
      },
    );
  });

  it('社区码是 8 位大写十六进制且每次不同', () => {
    const a = communityCode();
    const b = communityCode();
    expect(a).toMatch(/^[0-9A-F]{8}$/);
    expect(b).toMatch(/^[0-9A-F]{8}$/);
    expect(a).not.toBe(b);
  });
});
