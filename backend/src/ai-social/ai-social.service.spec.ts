import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { AiSocialService } from './ai-social.service';

function prismaOf(input: {
  bindings: Array<{ keyId: number }>;
  active: number;
}) {
  return stub<PrismaService>({
    userAipddBinding: {
      findMany: jest.fn().mockResolvedValue(input.bindings),
    },
    aipddKey: {
      count: jest.fn().mockResolvedValue(input.active),
    },
  });
}

describe('AiSocialService 准入与入口', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('未绑定 Key：拒绝进入且不给入口', async () => {
    process.env.AIWORKIN_WEB_URL = 'https://www.aiworkin.com';
    const service = new AiSocialService(prismaOf({ bindings: [], active: 0 }));
    const entry = await service.entry('u-1');
    expect(entry.keyBound).toBe(false);
    expect(entry.state).toBe('UNBOUND');
    expect(entry.links).toEqual([]);
  });

  it('绑定的 Key 全部失效：拒绝进入', async () => {
    const service = new AiSocialService(
      prismaOf({ bindings: [{ keyId: 7 }], active: 0 }),
    );
    const entry = await service.entry('u-1');
    expect(entry.keyBound).toBe(false);
    expect(entry.state).toBe('KEY_INACTIVE');
  });

  it('任一 Key 可用：放行并返回更新后的插件入口（含招聘/撮合/技能/应用）', async () => {
    process.env.AIWORKIN_WEB_URL = 'https://www.aiworkin.com';
    process.env.AIWORKIN_WEB_LOCALE = 'cn';
    const service = new AiSocialService(
      prismaOf({ bindings: [{ keyId: 7 }, { keyId: 8 }], active: 1 }),
    );
    const entry = await service.entry('u-1');
    expect(entry.keyBound).toBe(true);
    expect(entry.state).toBe('READY');
    expect(entry.webMode).toBe('aiworkin');
    expect(entry.links).toHaveLength(12);
    const urlOf = (key: string) =>
      entry.links.find((link) => link.key === key)?.url;
    expect(urlOf('hiring')).toBe('https://www.aiworkin.com/cn/hiring');
    expect(urlOf('matching')).toBe(
      'https://www.aiworkin.com/cn/work-market/demand',
    );
    expect(urlOf('skills')).toBe('https://www.aiworkin.com/cn/skills');
    expect(urlOf('apps')).toBe('https://www.aiworkin.com/cn/apps');
    expect(urlOf('developers')).toBe('https://www.aiworkin.com/cn/developers');
  });

  it('未配 AIworkin 网页时回落 SNS_WEB_URL', async () => {
    delete process.env.AIWORKIN_WEB_URL;
    process.env.SNS_WEB_URL = 'https://sns.example.com/';
    const service = new AiSocialService(
      prismaOf({ bindings: [{ keyId: 7 }], active: 1 }),
    );
    const entry = await service.entry('u-1');
    expect(entry.webMode).toBe('sns');
    expect(entry.webUrl).toBe('https://sns.example.com');
    expect(entry.links.find((link) => link.key === 'hiring')?.url).toBe(
      'https://sns.example.com/hiring',
    );
  });

  it('两者都未配置：返回空入口，不臆造地址', async () => {
    delete process.env.AIWORKIN_WEB_URL;
    delete process.env.SNS_WEB_URL;
    const service = new AiSocialService(
      prismaOf({ bindings: [{ keyId: 7 }], active: 1 }),
    );
    const entry = await service.entry('u-1');
    expect(entry.webMode).toBe('none');
    expect(entry.links).toEqual([]);
  });
});
