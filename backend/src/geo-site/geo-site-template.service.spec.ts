import { stub } from '../../test/doubles';
import { CurrentUser } from '../auth/current-user';
import { ErrorCode } from '../common/error-code';
import type { GeoSiteService } from './geo-site.service';
import type { GeoSitePageService } from './geo-site-page.service';
import { GeoSiteTemplateService } from './geo-site-template.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * 模板库回归：三件最容易出错的事——
 * 1) 越权：模板跨站点套用必须被拒（否则 A 企业能把内容写进 B 企业的页面）；
 * 2) 覆盖语义：整页模板 replace、区块模板 append，选错会把用户内容清掉；
 * 3) 空内容：另存空画布只会产出一堆没用的模板，直接拒。
 */

const user = new CurrentUser('u1', 'tester', 'user');

const block = (name = '区块') => ({
  id: 'n1',
  name,
  type: 'container',
  category: 'container',
  styles: { padding: 12 },
  content: [],
});

type Row = {
  id: number;
  siteId: number;
  kind: string;
  name: string;
  note: string;
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function serviceOf(input: {
  templates?: Row[];
  pageRows?: Record<number, Record<string, unknown>>;
  siteOf?: (siteId: number) => { id: number; ownerUserId: string } | null;
}) {
  const templates = input.templates ?? [];
  const siteOf =
    input.siteOf ?? ((siteId: number) => ({ siteId, ownerUserId: 'u1' }));
  const saved: Record<string, unknown>[] = [];
  const prisma = {
    geoSiteTemplate: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        templates.filter((row) => row.siteId === where.siteId),
      ),
      findUnique: jest.fn(
        async ({ where }: { where: { id: number } }) =>
          templates.find((row) => row.id === where.id) ?? null,
      ),
      count: jest.fn(async () => templates.length),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 9,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...templates[0],
        ...data,
      })),
      delete: jest.fn(async () => undefined),
    },
  };
  const sites = {
    requireSite: jest.fn(async (id: number) => {
      const row = siteOf(id);
      if (!row) throw new Error('forbidden');
      return row;
    }),
  };
  const pages = {
    detail: jest.fn(
      async (_u: CurrentUser, pageId: number) => input.pageRows?.[pageId],
    ),
    saveContent: jest.fn(
      async (_u: CurrentUser, body: { id: number; content: unknown[] }) => {
        saved.push(body);
        return { id: body.id, content: body.content };
      },
    ),
  };
  const service = new GeoSiteTemplateService(
    stub<PrismaService>(prisma),
    stub<GeoSiteService>(sites),
    stub<GeoSitePageService>(pages),
  );
  return { service, prisma, sites, pages, saved };
}

describe('GEO 站点模板库', () => {
  it('另存空内容直接被拒，不产生空模板', async () => {
    const { service, prisma } = serviceOf({});
    await expect(
      service.save(user, {
        siteId: 1,
        kind: 'BLOCK',
        name: '空区块',
        content: [],
      }),
    ).rejects.toThrow(/内容为空/);
    expect(prisma.geoSiteTemplate.create).not.toHaveBeenCalled();
  });

  it('整页模板套用是整页替换，区块模板套用是追加', async () => {
    const existing = block('已有区块');
    const { service, saved } = serviceOf({
      templates: [
        {
          id: 1,
          siteId: 1,
          kind: 'PAGE',
          name: '首屏',
          note: '',
          content: [block('模板区块')],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          siteId: 1,
          kind: 'BLOCK',
          name: '卖点区',
          note: '',
          content: [block('卖点')],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      pageRows: {
        7: {
          id: 7,
          siteId: 1,
          content: [existing],
          scripts: [],
          seo: {},
          publishedContent: [],
        },
      },
    });

    await service.apply(user, { templateId: 1, pageId: 7 });
    expect(saved[0]).toEqual({
      id: 7,
      content: [expect.objectContaining({ name: '模板区块' })],
    });

    await service.apply(user, { templateId: 2, pageId: 7 });
    // 区块模板默认追加：原有一块 + 新区块 = 两块，且原有内容仍在最前
    expect(saved[1]).toMatchObject({ id: 7 });
    expect((saved[1] as { content: unknown[] }).content).toHaveLength(2);
    expect((saved[1] as { content: { name: string }[] }).content[0].name).toBe(
      '已有区块',
    );
  });

  it('模板与页面不在同一站点时拒绝套用（防跨站写入）', async () => {
    const { service, pages } = serviceOf({
      templates: [
        {
          id: 1,
          siteId: 1,
          kind: 'PAGE',
          name: 'A 站模板',
          note: '',
          content: [block()],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      pageRows: {
        7: {
          id: 7,
          siteId: 2,
          content: [],
          scripts: [],
          seo: {},
          publishedContent: [],
        },
      },
    });
    await expect(
      service.apply(user, { templateId: 1, pageId: 7 }),
    ).rejects.toThrow(/同一个站点/);
    expect(pages.saveContent).not.toHaveBeenCalled();
  });

  it('读别人的模板先过站点归属闸，模板表自身不重复存企业字段', async () => {
    const { service, sites } = serviceOf({
      templates: [
        {
          id: 1,
          siteId: 5,
          kind: 'BLOCK',
          name: '别人的区块',
          note: '',
          content: [block()],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      siteOf: () => null,
    });
    await expect(service.detail(user, 1)).rejects.toThrow('forbidden');
    expect(sites.requireSite).toHaveBeenCalledWith(user, 5);
  });

  it('删除模板返回带 message 的结果：okResult 契约里 message 必填，漏了会在落库后回 500', async () => {
    const { service, prisma } = serviceOf({
      templates: [
        {
          id: 1,
          siteId: 1,
          kind: 'BLOCK',
          name: '待删区块',
          note: '',
          content: [block()],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    await expect(service.remove(user, { id: 1 })).resolves.toEqual({
      ok: true,
      message: expect.any(String),
    });
    expect(prisma.geoSiteTemplate.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it('模板数量封顶：达到上限后不再落库', async () => {
    const many = Array.from({ length: 100 }, (_unused, index) => ({
      id: index + 1,
      siteId: 1,
      kind: 'BLOCK',
      name: `区块 ${index}`,
      note: '',
      content: [block()],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const { service, prisma } = serviceOf({ templates: many });
    await expect(
      service.save(user, {
        siteId: 1,
        kind: 'BLOCK',
        name: '再来一个',
        content: [block()],
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(prisma.geoSiteTemplate.create).not.toHaveBeenCalled();
  });
});
