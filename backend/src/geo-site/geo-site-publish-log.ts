import { CurrentUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 发布留痕：站点、页面、内容三处发布各自写一行，只用于「谁在什么时候把什么发上去了」。
 *
 * 台账是旁路，不是发布的一部分：写失败绝不把已经成功的发布改成失败（前端拿不到列表，
 * 但公开页照常更新），所以这里一律吞掉异常。真要查问题看后端日志，不靠这张表做鉴权或计费。
 */

export type GeoSitePublishTarget =
  'SITE' | 'PAGE' | 'ARTICLE' | 'PRODUCT' | 'ADMIN';

const TARGET_LABELS: Record<GeoSitePublishTarget, string> = {
  SITE: '整站发布',
  PAGE: '页面发布',
  ARTICLE: '文章发布',
  PRODUCT: '产品发布',
  // 平台处置与企业自发行动作不同，混在「整站发布」里会让复核的人误读成用户自己发的
  ADMIN: '平台处置',
};

export function geoSitePublishTargetLabel(
  target: GeoSitePublishTarget,
): string {
  return TARGET_LABELS[target] || target;
}

/** 留痕写入：best-effort，任何数据库错误都只打一行 warn。 */
export async function writeGeoSitePublishLog(
  prisma: PrismaService,
  user: CurrentUser,
  input: {
    siteId: number;
    ownerUserId: string;
    target: GeoSitePublishTarget;
    targetId?: number;
    label?: string;
    note?: string;
  },
): Promise<void> {
  try {
    await prisma.geoSitePublishLog.create({
      data: {
        siteId: Number(input.siteId),
        ownerUserId: String(input.ownerUserId || user.userId || '').slice(
          0,
          64,
        ),
        targetKind: input.target,
        targetId: Number(input.targetId ?? 0),
        label: String(input.label ?? '').slice(0, 200),
        note: String(input.note ?? '').slice(0, 500),
        operator: String(user.username || user.userId || '').slice(0, 64),
      },
    });
  } catch (error) {
    console.warn('[geo-site] 发布留痕写入失败（不影响发布结果）', error);
  }
}
