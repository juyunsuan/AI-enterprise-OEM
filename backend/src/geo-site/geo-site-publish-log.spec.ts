import { stub } from '../../test/doubles';
import { CurrentUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  geoSitePublishTargetLabel,
  writeGeoSitePublishLog,
  type GeoSitePublishTarget,
} from './geo-site-publish-log';

/**
 * 发布留痕是旁路：它记录「谁在什么时候把什么发上去了」，但绝不能反过来影响发布结果。
 * 这里钉死两条——写失败只 warn、字段按列宽截断（超长标题不能把 create 撑成报错）。
 */

const user = new CurrentUser('u1', 'tester', 'user');
const longText = '标'.repeat(300);

describe('GEO 发布留痕', () => {
  it('数据库写入失败时吞掉异常，发布照常返回成功', async () => {
    const prisma = stub<PrismaService>({
      geoSitePublishLog: {
        create: jest.fn(async () => {
          throw new Error('db down');
        }),
      },
    });
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    await expect(
      writeGeoSitePublishLog(prisma, user, {
        siteId: 1,
        ownerUserId: 'u1',
        target: 'SITE',
        label: '演示站',
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('按列宽截断 label 与 note，超长内容不会让写入报错', async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = stub<PrismaService>({
      geoSitePublishLog: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
        }),
      },
    });
    await writeGeoSitePublishLog(prisma, user, {
      siteId: 1,
      ownerUserId: 'u1',
      target: 'ARTICLE',
      targetId: 3,
      label: longText,
      note: longText,
    });
    expect(String(created[0].label).length).toBeLessThanOrEqual(200);
    expect(String(created[0].note).length).toBeLessThanOrEqual(500);
    expect(created[0]).toMatchObject({
      targetKind: 'ARTICLE',
      targetId: 3,
      operator: 'tester',
    });
  });

  it('台账动作文案覆盖四类目标，未知值原样返回不炸界面', () => {
    expect(geoSitePublishTargetLabel('SITE')).toBe('整站发布');
    expect(geoSitePublishTargetLabel('PAGE')).toBe('页面发布');
    expect(geoSitePublishTargetLabel('ARTICLE')).toBe('文章发布');
    expect(geoSitePublishTargetLabel('PRODUCT')).toBe('产品发布');
    // 平台强制下线/解除处置不是用户自发，动作列必须说成「平台处置」，否则复核会误读
    expect(geoSitePublishTargetLabel('ADMIN')).toBe('平台处置');
    expect(geoSitePublishTargetLabel('FUTURE' as GeoSitePublishTarget)).toBe(
      'FUTURE',
    );
  });
});
