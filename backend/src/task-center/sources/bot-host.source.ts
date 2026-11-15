import { BOT_COMMAND_STATUS_LABELS } from '@enterprise/contracts';
import type { CurrentUser } from '../../auth/current-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TaskCollectOptions, TaskDraft, TaskSource } from '../task-source';

const LIMIT = 200;
/** 还没走到终态的指令：主机没领 / 正在跑，都还算一条待办。 */
const OPEN_STATUSES = ['PENDING', 'DISPATCHED'];
/** 状态名嵌进整句时的说法（列表标签「待执行」放进句子读不通）。 */
const OPEN_PHRASES: Record<string, string> = {
  PENDING: '还没被主机领取',
  DISPATCHED: '正在主机上执行',
};

/**
 * Bot 主机：本人账号下发给自己主机的、尚未跑完的指令。
 * 待办的终结只看指令回执（DONE/FAILED/TIMEOUT/CANCELED），不看任务中心里点没点「完成」。
 */
export function botHostSource(prisma: PrismaService): TaskSource {
  return {
    key: 'workbuddy_host',
    label: 'Bot 主机',
    category: 'task',
    async collect(
      user: CurrentUser,
      options?: TaskCollectOptions,
    ): Promise<TaskDraft[]> {
      const rows = await prisma.workbuddyHostCommand.findMany({
        where: { userId: user.userId, status: { in: OPEN_STATUSES } },
        orderBy: { id: 'desc' },
        take: options?.full ? undefined : LIMIT,
      });
      if (!rows.length) return [];
      const hosts = await prisma.workbuddyHost.findMany({
        where: { id: { in: [...new Set(rows.map((row) => row.hostId))] } },
        select: { id: true, name: true },
      });
      const nameOf = new Map(hosts.map((host) => [host.id, host.name]));
      return rows.map((row) => ({
        assigneeUserId: row.userId,
        source: 'workbuddy_host',
        sourceId: row.commandCode,
        title: row.title || '主机指令待执行',
        description: `下发给主机 ${
          nameOf.get(row.hostId) || `#${row.hostId}`
        }，当前${
          BOT_COMMAND_STATUS_LABELS[row.status] || row.status
        }，跑完自动办结。`,
        link: `/bot/hosts?hostId=${row.hostId}`,
        category: 'task',
        createdBy: row.userId,
        dueAt: null,
        sourceStatus: row.status,
        sourceStatusLabel: BOT_COMMAND_STATUS_LABELS[row.status] || row.status,
      }));
    },
    async recheck(draft) {
      const row = await prisma.workbuddyHostCommand.findFirst({
        where: { commandCode: draft.sourceId },
        select: { status: true },
      });
      // 指令已被删除：源侧不再存在，放行关闭。
      if (!row) return { cleared: true, reason: '' };
      if (OPEN_STATUSES.includes(row.status)) {
        return {
          cleared: false,
          reason: `指令${
            OPEN_PHRASES[row.status] || '还没跑完'
          }，请先在 Bot 主机页取消或等待执行结果。`,
        };
      }
      return { cleared: true, reason: '' };
    },
  };
}
