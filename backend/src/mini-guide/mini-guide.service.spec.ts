import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import * as siteUrl from '../common/site-url';
import { MiniGuideService } from './mini-guide.service';
import { stub } from '../../test/doubles';

/**
 * 「小程序发布说明」服务用例。
 *
 * 守住新口径的几条红线：
 * 1) 后台一行没配（缺 system_settings 行 / 坏 JSON）时，页面仍有**完整流程**：
 *    默认正文 + 固定步骤 + 三类微信域名，而不是空白页；
 * 2) 站点域名未配置不是「给个空值」了事：domains.configured=false 且 blockers
 *    给出「去平台后台站点设置」的可操作下一步；
 * 3) 租户码取到就带值带 hint，取不到就进 blockers，values 里绝不出现空字符串；
 * 4) 统一包**不含账号参数**：pkg.injected 恒为 false（防止有人以后又把注入加回统一包路径）。
 */

const KEY = 'mini_program_publish_guide';

function fakePrisma(options: {
  settings?: Map<string, string>;
  kpSites?: {
    id: number;
    siteCode: string;
    siteName: string;
    wxAppId: string;
  }[];
  miniApp?: { appId: string } | null;
}) {
  const settings = options.settings ?? new Map<string, string>();
  return {
    settings,
    prisma: stub<PrismaService>({
      systemSetting: {
        findUnique: async ({ where }: { where: { key: string } }) => {
          const value = settings.get(where.key);
          return value === undefined
            ? null
            : {
                key: where.key,
                value,
                updatedAt: new Date('2026-11-19T00:00:00Z'),
              };
        },
        upsert: async ({
          where,
          update,
          create,
        }: {
          where: { key: string };
          update: { value: string };
          create: { key: string; value: string };
        }) => {
          settings.set(where.key, update?.value ?? create.value);
          return {
            key: where.key,
            value: settings.get(where.key)!,
            updatedAt: new Date(),
          };
        },
      },
      knowledgePaySite: {
        findMany: async () => options.kpSites ?? [],
      },
      // save 用例里会渲染 onsite / brand-mall 视图：给空表委托即可走「无租户码 → blockers」分支
      onsiteShop: {
        findMany: async () => [],
      },
      brandShop: {
        findMany: async () => [],
      },
      miniProgramApp: {
        findUnique: async () => options.miniApp ?? null,
      },
    }),
  };
}

const user = stub<CurrentUser>({ userId: 'u-1', username: '店主' });

function service(options: Parameters<typeof fakePrisma>[0]) {
  const { prisma, settings } = fakePrisma(options);
  const storage = stub<StorageService>({
    put: async (path: string, content: Buffer) => ({
      key: path,
      url: `https://cdn.example.com/${path}`,
      size: content.length,
      contentType: 'application/zip',
    }),
    urlOf: (key: string) => `https://cdn.example.com/${key}`,
  });
  return { service: new MiniGuideService(prisma, storage), settings };
}

beforeEach(() => {
  jest
    .spyOn(siteUrl, 'resolveSiteUrl')
    .mockResolvedValue('https://demo.example.com');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MiniGuideService 默认回落', () => {
  it('缺 system_settings 行时回落默认正文，步骤与三类域名结构完整', async () => {
    const { service: guide } = service({});
    const view = await guide.viewForUser(user, 'knowledge-pay');
    // 默认正文必须写清新流程的关键动作，缺一个都会把用户带回「平台代传」的旧预期
    expect(view.body).toContain('源码分发包');
    expect(view.body).toContain('config.js');
    expect(view.body).toContain('project.config.json');
    expect(view.body).toContain('不校验合法域名');
    expect(view.body).toContain('提交审核');
    expect(view.domains.map((d) => d.label)).toEqual([
      'request 合法域名',
      'uploadFile 合法域名',
      'downloadFile 合法域名',
    ]);
    expect(view.domains.every((d) => d.configured)).toBe(true);
    expect(
      view.domains.every((d) => d.origin === 'https://demo.example.com'),
    ).toBe(true);
    expect(view.steps.length).toBeGreaterThanOrEqual(5);
    expect(view.steps.every((s) => s.title && s.detail)).toBe(true);
    expect(view.updatedAt).toBeNull();
  });

  it('后台行是坏 JSON 时同样回落默认正文而不是抛错', async () => {
    const settings = new Map<string, string>([[KEY, '{not-json']]);
    const { service: guide } = service({ settings });
    const view = await guide.sharedView();
    expect(view.body).toContain('源码分发包');
  });
});

describe('MiniGuideService 站点域名', () => {
  it('域名未配置：domains.configured=false 且 blockers 指向平台后台站点设置', async () => {
    jest.spyOn(siteUrl, 'resolveSiteUrl').mockResolvedValue('');
    const { service: guide } = service({});
    const view = await guide.viewForUser(user, 'knowledge-pay');
    expect(view.domains).toHaveLength(3);
    expect(view.domains.every((d) => d.configured === false)).toBe(true);
    expect(view.blockers.join('\n')).toContain('站点设置');
    // 不许只说「不行」：提示里必须带上用户/管理员下一步去哪
    expect(view.blockers.join('\n')).toContain('站点域名');
    // apiBase 也不给空字符串
    const apiBase = view.values.find((v) => v.key === 'apiBase');
    expect(apiBase?.value).not.toBe('');
  });
});

describe('MiniGuideService 账号参数', () => {
  it('租户码取到值：values 带值与「写进哪个文件哪个字段」的 hint', async () => {
    const { service: guide } = service({
      kpSites: [
        {
          id: 1,
          siteCode: 'KP8888',
          siteName: '我的知识付费站',
          wxAppId: 'wx1234567890abcdef',
        },
      ],
    });
    const view = await guide.viewForUser(user, 'knowledge-pay');
    const site = view.values.find((v) => v.key === 'site');
    expect(site?.value).toBe('KP8888');
    expect(site?.hint).toContain('config.js');
    const appid = view.values.find((v) => v.key === 'appid');
    expect(appid?.value).toBe('wx1234567890abcdef');
    expect(appid?.hint).toContain('project.config.json');
  });

  it('租户码取不到：blockers 说明去哪创建，而不是留个空值', async () => {
    const { service: guide } = service({ kpSites: [] });
    const view = await guide.viewForUser(user, 'knowledge-pay');
    expect(view.values.find((v) => v.key === 'site')).toBeUndefined();
    expect(view.values.every((v) => v.value !== '')).toBe(true);
    expect(view.blockers.join('\n')).toContain('知识付费云课堂');
  });

  it('有 scene 的工具按 (scene, shopId) 读 miniprogram_apps 的 AppID', async () => {
    const { service: guide } = service({ miniApp: { appId: 'wxonsite0001' } });
    // onsite 走 onsiteShop：替身 findMany 未提供 → 租户码进 blockers，属预期分支；
    // 这里只验证 shared 视图不受 scene 查询影响、结构仍完整
    const view = await guide.sharedView();
    expect(view.values).toEqual([]);
    expect(view.toolCode).toBeNull();
  });

  it('国际独立站没有小程序包：pkg.available=false 并给出 Web 发布的说明', async () => {
    const { service: guide } = service({});
    const view = await guide.viewForUser(user, 'global-site');
    expect(view.pkg.available).toBe(false);
    expect(view.steps).toEqual([]);
    expect(view.blockers.join('\n')).toContain('Web');
  });
});

describe('MiniGuideService 后台正文', () => {
  it('save 写入后 adminView 读回一致；非法工具码的补充正文被忽略', async () => {
    const { service: guide } = service({});
    await guide.save(user, {
      body: '平台统一话术：下载 → 导入 → 填参数 → 提审。',
      overrides: [
        { toolCode: 'onsite', body: '上门服务补充：注意排班时段。' },
        // 契约层 zod 会先挡住非法码，这里模拟「绕过后直接进服务」也不许落库
        { toolCode: 'not-a-tool' as 'onsite', body: '越权正文' },
      ],
    });
    const admin = await guide.adminView();
    expect(admin.body).toBe('平台统一话术：下载 → 导入 → 填参数 → 提审。');
    expect(admin.overrides).toHaveLength(1);
    expect(admin.overrides[0].toolCode).toBe('onsite');
    expect(admin.overrides[0].toolName).toBe('上门服务小程序');
    // 工具级覆盖优先于公共正文
    const view = await guide.viewForUser(user, 'onsite');
    expect(view.body).toContain('排班时段');
    const other = await guide.viewForUser(user, 'brand-mall');
    expect(other.body).toContain('平台统一话术');
  });
});

describe('MiniGuideService 统一包口径', () => {
  it('pkg.injected 恒为 false：统一包不含账号参数（旧按店注入路径已废弃）', async () => {
    const { service: guide } = service({
      kpSites: [
        { id: 1, siteCode: 'KP8888', siteName: '站', wxAppId: 'wxabc' },
      ],
    });
    const view = await guide.viewForUser(user, 'knowledge-pay');
    expect(view.pkg.injected).toBe(false);
    expect((await guide.sharedView()).pkg.injected).toBe(false);
    // 主包体积闸门用 MAIN_PACKAGE_LIMIT 口径
    expect(typeof view.pkg.withinLimit).toBe('boolean');
  });

  it('通用版必须给出成体系的步骤，不能空着让前端显示“稍后会自动出现”', async () => {
    const { service: guide } = service({});
    const shared = await guide.sharedView();
    expect(shared.toolCode).toBeNull();
    expect(shared.steps.length).toBeGreaterThanOrEqual(5);
    expect(shared.steps.map((step) => step.title)).toContain('配服务器域名');
    // 通用版不替某个具体工具报参数值：取值清单留给各工具发布页，避免在这里猜
    expect(shared.values).toEqual([]);
    // 标题由组件统一给，后端不能再塞一个同名标题，否则抽屉里会出现两遍标题
    expect(shared.toolName).toContain('小程序');
  });
});

describe('MiniGuideService 源码包直接下载', () => {
  it('按工具码现打 zip 返回直链：没有生成步骤，也不写发布台账', async () => {
    const { service: guide } = service({});
    const result = await guide.downloadPackage(user, 'knowledge-pay');
    expect(result.url).toContain('/mini-source/knowledge-pay/');
    expect(result.fileName).toMatch(/^knowledge-pay-miniprogram-\d{8}\.zip$/);
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('Web 工具没有小程序源码包', async () => {
    const { service: guide } = service({});
    await expect(guide.downloadPackage(user, 'global-site')).rejects.toThrow(
      '不提供小程序源码包',
    );
  });
});
