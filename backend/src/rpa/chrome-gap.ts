import type { RcGapView } from '@enterprise/contracts';
import { text } from '../common/api';
import type { PrismaService } from '../prisma/prisma.service';
import { toJsonObject } from '../shared/json-value';

/**
 * 能力缺口台账（N18=B）：模型判定「这台插件做不到」时把缺口如实记下来，而不是硬凑或假成功。
 * 数据先复用 `RpaChromeMessage.kind='gap'`（会话内可见、跨设备可按人聚合），
 * 攒到一定量再升独立表 + 后台排行页。
 */

const GAP_KIND = 'gap';
const GAP_NEED_MAX = 200;
const GAP_TEXT_MAX = 500;
const GAP_SITE_MAX = 200;
const GAP_ATTEMPTED_MAX = 10;

export type ChromeGapInput = {
  userId: string;
  /** 关联的插件会话（0＝按设备台账找最近一段对话，找不到就落无上下文桶）。 */
  agentId?: number;
  /** 回报来自哪台设备（用于把缺口挂到该设备最近一段对话上）。 */
  clientId?: string;
  need: string;
  why?: string;
  site?: string;
  attempted?: string[];
  want?: string;
  version?: string;
  /** 关联的云端 RPA 会话号（空＝0）。 */
  sessionId?: number;
};

/** 缺口正文：need 为空的回报没有价值，直接丢弃（调用方不会落库）。 */
function gapNeedOf(value: unknown) {
  return text(value).trim().slice(0, GAP_NEED_MAX);
}

function gapAttemptedOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item).trim().slice(0, 120))
    .filter((item) => item !== '')
    .slice(0, GAP_ATTEMPTED_MAX);
}

/**
 * 决策里的能力缺口：只做长度与类型收口，`need` 缺失即视为没报缺口。
 * 缺口不阻断会话（模型已如实回复用户），只落台账供平台排补齐顺序。
 */
export function normalizeGap(raw: unknown): {
  need: string;
  why: string;
  site: string;
  attempted: string[];
  want: string;
} | null {
  const gap = toJsonObject(raw);
  const need = gapNeedOf(gap.need);
  if (!need) return null;
  return {
    need,
    why: text(gap.why).trim().slice(0, GAP_TEXT_MAX),
    site: text(gap.site).trim().slice(0, GAP_SITE_MAX),
    attempted: gapAttemptedOf(gap.attempted),
    want: text(gap.want).trim().slice(0, 300),
  };
}

/** 台账行 → 对外视图（payload 存结构化字段，content 存 need 便于关键词检索）。 */
function gapViewOf(row: {
  id: number;
  createdBy: string;
  agentId: number;
  content: string;
  payload: unknown;
  createdAt: Date;
}): RcGapView {
  const payload = toJsonObject(row.payload);
  return {
    id: row.id,
    userId: row.createdBy,
    site: text(payload.site).slice(0, GAP_SITE_MAX),
    need: text(payload.need) || row.content,
    why: text(payload.why).slice(0, GAP_TEXT_MAX),
    attempted: gapAttemptedOf(payload.attempted),
    want: text(payload.want).slice(0, 300),
    version: text(payload.version).slice(0, 24),
    sessionId: Math.max(
      0,
      Math.round(Number(payload.sessionId) || row.agentId || 0),
    ),
    createdAt: row.createdAt.toISOString(),
  };
}

/** 同一 agentId 内的下一条序号：缺口卡跟着会话走，没有会话时落在 0 号桶顺延。 */
async function nextSeq(prisma: PrismaService, agentId: number) {
  const last = await prisma.rpaChromeMessage.findFirst({
    where: { agentId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  });
  return (last?.seq ?? 0) + 1;
}

/** Prisma 唯一约束冲突（seq 取号并发撞 @@unique([agentId, seq])）：属可重试，不是业务错误。 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * 缺口卡挂到哪段对话：调用方给了 agentId 就用，否则按设备找最近一段插件会话。
 * 挂上去的好处是对话回放里能看到「当时确实说过做不到」，而不是只有一条匿名台账。
 */
async function resolveAgentId(
  prisma: PrismaService,
  userId: string,
  agentId: number,
  clientId?: string,
): Promise<number> {
  if (agentId > 0) return agentId;
  if (!clientId) return 0;
  const row = await prisma.rpaChromeAgent.findFirst({
    where: { createdBy: userId, clientId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  return row?.id ?? 0;
}

export async function recordChromeGap(
  prisma: PrismaService,
  input: ChromeGapInput,
): Promise<RcGapView | null> {
  const need = gapNeedOf(input.need);
  if (!need) return null;
  const agentId = await resolveAgentId(
    prisma,
    input.userId,
    Math.max(0, Math.round(Number(input.agentId) || 0)),
    input.clientId,
  );
  // 同一个会话里同一个缺口只记一次：模型每步都可能重复报同一件事，台账要的是「有没有」而不是「报了几遍」。
  const existed = await prisma.rpaChromeMessage.findFirst({
    where: {
      createdBy: input.userId,
      agentId,
      kind: GAP_KIND,
      content: need,
    },
    orderBy: { id: 'desc' },
  });
  if (existed) return gapViewOf(existed);
  const payload = {
    need,
    why: text(input.why).trim().slice(0, GAP_TEXT_MAX),
    site: text(input.site).trim().slice(0, GAP_SITE_MAX),
    attempted: gapAttemptedOf(input.attempted),
    want: text(input.want).trim().slice(0, 300),
    version: text(input.version).trim().slice(0, 24),
    sessionId: Math.max(0, Math.round(Number(input.sessionId) || agentId || 0)),
  };
  const base = {
    agentId,
    createdBy: input.userId,
    role: 'agent',
    kind: GAP_KIND,
    content: need,
    payload,
  };
  // seq 是「读最大值 + 1」取号，并发回报不同缺口时会撞 @@unique([agentId, seq])：
  // 撞了重算重试（唯一冲突不是业务错误，不该让缺口回报整条失败）。
  for (let attempt = 0; ; attempt += 1) {
    const seq = await nextSeq(prisma, agentId);
    try {
      const row = await prisma.rpaChromeMessage.create({
        data: { ...base, seq },
      });
      return gapViewOf(row);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= 2) throw error;
    }
  }
}

/** 按人列缺口（侧边栏「已回报」/ 后台待办输入清单）。 */
export async function listChromeGaps(
  prisma: PrismaService,
  userId: string,
  limit = 50,
): Promise<RcGapView[]> {
  const rows = await prisma.rpaChromeMessage.findMany({
    where: { createdBy: userId, kind: GAP_KIND },
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, Math.max(1, Math.round(limit))),
  });
  return rows.map((row) => gapViewOf(row));
}
