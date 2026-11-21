import { Logger } from '../common/logger';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * 圈子社区维护批：热度分按时间衰减重算。
 *
 * 浏览/点赞/评论在热路径里只做增量，若没有衰减，老帖会永久占据推荐位；
 * 这里每小时对最近 30 天的已发布帖子重算一次，分数只由当前互动量与发布时间决定，
 * 幂等、可重跑。`CIRCLE_SCHEDULER_DISABLED=1` 可关闭。
 */
export class CircleScheduler {
  private readonly logger = new Logger(CircleScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.CIRCLE_SCHEDULER_DISABLED === '1') return;
    this.timer = setInterval(() => {
      void this.recalc().catch((error) => {
        this.logger.error(
          `圈子热度重算失败：${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, 3_600_000);
    this.timer.unref?.();
    void this.recalc().catch(() => undefined);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async recalc(now = new Date()): Promise<{ updated: number }> {
    const from = new Date(now.getTime() - 30 * 86400_000);
    const rows = await this.prisma.circlePost.findMany({
      where: { status: 'PUBLISHED', createdAt: { gte: from } },
      select: {
        id: true,
        createdAt: true,
        likeCount: true,
        commentCount: true,
        favoriteCount: true,
        viewCount: true,
        hotScore: true,
      },
      take: 2000,
    });
    let updated = 0;
    for (const row of rows) {
      const days = Math.max(
        0,
        (now.getTime() - row.createdAt.getTime()) / 86400_000,
      );
      const raw =
        row.likeCount * 3 +
        row.commentCount * 4 +
        row.favoriteCount * 2 +
        row.viewCount * 0.5;
      const score = Math.max(0, Math.round(raw / Math.pow(days + 1, 0.6)));
      if (score === row.hotScore) continue;
      await this.prisma.circlePost
        .update({ where: { id: row.id }, data: { hotScore: score } })
        .catch(() => undefined);
      updated += 1;
    }
    return { updated };
  }
}
