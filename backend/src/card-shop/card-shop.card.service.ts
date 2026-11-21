import {
  type CardShopCard,
  type CardShopCardBatch,
  type CardShopCardBatchRemoveBody,
  type CardShopCardExportBody,
  type CardShopCardExportResult,
  type CardShopCardImportBody,
  type CardShopCardImportResult,
  type CardShopCardSaveBody,
  type CardShopCardStatusBody,
} from '@enterprise/contracts';
import { pageOf, type PageResponse } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import {
  cardDedupKey,
  parseCardLines,
  splitterLabel,
} from './card-shop.parser';
import type { CardShopPlatformService } from './card-shop.platform.service';
import type { CardShopSiteService } from './card-shop.site.service';
import {
  cardShopNo,
  cardStatus,
  cardFormat,
  clip,
  intIn,
  iso,
  maskSecret,
  pageArgs,
  textOf,
} from './card-shop.shared';

/** 单次批量操作（改状态 / 删除 / 还原）的 id 上限，与契约的 max(5000) 对齐。 */
const ID_LIMIT = 5000;
/** 单次导出行数上限：再多就该分批导出，而不是把一个巨型 CSV 塞进一次响应。 */
const EXPORT_MAX_ROWS = 50_000;
/** createMany 分块：一次太大顶到 MySQL max_allowed_packet，一次太小往返占满。 */
const INSERT_CHUNK = 1000;
/** 去重时一次查库的卡密条数。 */
const DEDUP_CHUNK = 1000;
/** CSV 的 UTF-8 BOM：没有它 Excel 打开中文备注会乱码。 */
const CSV_BOM = String.fromCharCode(0xfeff);
/** 无效行原因最多回几条，够定位问题又不会把整份文件的错误灌进响应。 */
const SAMPLE_MAX = 10;

type CardRow = {
  id: number;
  siteId: number;
  goodsId: number;
  batchId: number;
  number: string;
  secret: string;
  remark: string;
  status: string;
  seq: number;
  lockOrderId: number;
  lockExpireAt: Date | null;
  soldOrderId: number;
  soldAt: Date | null;
  trashedAt: Date | null;
  createdAt: Date;
};

/**
 * 卡密（库存真值）与导入批次。
 *
 * 三条口径：
 * 1. 导入是**追加**，不覆盖：同一商品重复导入只按「卡号+卡密」去重，绝不删已有卡；
 * 2. 已售出与锁定中的卡对店主侧只读——改它等于改买家已领走的凭证；
 * 3. 删除一律先回收站（trashedAt），硬删只在回收站里做，且已售出的永不清掉。
 */
export class CardShopCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: CardShopSiteService,
    private readonly platform: CardShopPlatformService,
  ) {}

  // ---------------------------------------------------------------- 列表

  async cards(
    user: CurrentUser,
    query: Record<string, unknown>,
  ): Promise<PageResponse<CardShopCard>> {
    const current = await this.sites.requireSite(user, Number(query.siteId));
    const { page, pageSize, offset } = pageArgs(query);
    const inTrash = Number(query.trash ?? 0) === 1;
    const where: Record<string, unknown> = {
      siteId: current.siteId,
      trashedAt: inTrash ? { not: null } : null,
    };
    const goodsId = intIn(query.goodsId, 0, 1_000_000_000, 0);
    if (goodsId > 0) where.goodsId = goodsId;
    const batchId = intIn(query.batchId, 0, 1_000_000_000, 0);
    if (batchId > 0) where.batchId = batchId;
    const status = textOf(query.status);
    if (status) where.status = status;
    const keyword = clip(query.keyword, 191).trim();
    if (keyword) {
      // 卡号或卡密任一命中：店主拿一段密文就能查这张卡卖没卖出去
      where.OR = [
        { number: { contains: keyword } },
        { secret: { contains: keyword } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.cardShopCard.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
      this.prisma.cardShopCard.count({ where }),
    ]);
    return pageOf(
      await this.toCardRows(rows as unknown as CardRow[]),
      total,
      page,
      pageSize,
    );
  }

  /** 站点内每个商品的库存三态（概览页与缺货提醒用；一次 groupBy，不按商品发查询）。 */
  async stock(user: CurrentUser, siteId: number) {
    const current = await this.sites.requireSite(user, siteId);
    const [goods, grouped] = await Promise.all([
      this.prisma.cardShopProduct.findMany({
        where: { siteId: current.siteId, trashedAt: null },
        select: { id: true, name: true },
        orderBy: [{ sort: 'desc' }, { id: 'desc' }],
        take: 500,
      }),
      this.prisma.cardShopCard.groupBy({
        by: ['goodsId', 'status'],
        where: { siteId: current.siteId, trashedAt: null },
        _count: { _all: true },
      }),
    ]);
    const bucket = new Map<
      number,
      { available: number; locked: number; sold: number }
    >();
    for (const item of goods) {
      bucket.set(item.id, { available: 0, locked: 0, sold: 0 });
    }
    for (const row of grouped) {
      const value = bucket.get(row.goodsId);
      if (!value) continue;
      if (row.status === 'AVAILABLE') value.available += row._count._all;
      else if (row.status === 'LOCKED') value.locked += row._count._all;
      else if (row.status === 'SOLD') value.sold += row._count._all;
    }
    return goods.map((item) => ({
      goodsId: item.id,
      name: item.name,
      available: bucket.get(item.id)?.available ?? 0,
      locked: bucket.get(item.id)?.locked ?? 0,
      sold: bucket.get(item.id)?.sold ?? 0,
    }));
  }

  // ---------------------------------------------------------------- 导入

  /**
   * 文本 / 文件导入卡密：解析 → 去重 → 定 seq → 落批次。
   *
   * `SHUFFLE` 在**分配 seq 之前**打乱，所以「按最早入库先出」的默认出卡顺序自然变成随机，
   * 不需要RANDOM 之外的运行时开销，也让同一批卡在不同站点之间不被按导入次序连号猜出。
   */
  async importCards(
    user: CurrentUser,
    body: CardShopCardImportBody,
  ): Promise<CardShopCardImportResult> {
    const limits = await this.platform.requireEnabled();
    const current = await this.sites.requireSite(user, body.siteId);
    const goods = await this.prisma.cardShopProduct.findFirst({
      where: { id: body.goodsId, siteId: current.siteId, trashedAt: null },
    });
    if (!goods) throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');

    const content = String(body.content ?? '');
    const bytes = Buffer.byteLength(content, 'utf8');
    if (!content.trim()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '粘贴内容为空：一行一张卡，格式为「卡密」或「卡号 + 分隔符 + 卡密」',
      );
    }
    if (bytes > limits.importMaxBytes) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        `单次导入上限 ${Math.floor(limits.importMaxBytes / 1024)} KB，当前 ${Math.ceil(
          bytes / 1024,
        )} KB；请拆分文件后分批导入`,
      );
    }
    const parsed = parseCardLines(
      content,
      body.splitter,
      cardFormat(goods.cardFormat),
    );
    if (parsed.totalLines > limits.importMaxLines) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        `单次导入上限 ${limits.importMaxLines} 行，当前 ${parsed.totalLines} 行；请拆分后分批导入`,
      );
    }

    let dbDuplicated = 0;
    let items = parsed.items;
    if (body.dedup !== false) {
      const existing = await this.existingKeys(current.siteId, goods.id, items);
      const kept: typeof items = [];
      for (const item of items) {
        if (existing.has(cardDedupKey(item.number, item.secret))) {
          dbDuplicated += 1;
          continue;
        }
        kept.push(item);
      }
      items = kept;
    }
    if (!items.length) {
      return {
        batchNo: '',
        batchId: 0,
        totalLines: parsed.totalLines,
        importedCount: 0,
        duplicatedCount: parsed.duplicateLines + dbDuplicated,
        invalidCount: parsed.invalid.length,
        splitterUsed: parsed.splitterUsed,
        splitterLabel: splitterLabel(parsed.splitterUsed),
        samples: parsed.invalid.slice(0, SAMPLE_MAX),
        message:
          '没有新增卡密：全部与已有库存重复或格式不可解析，请检查文件后重试',
      };
    }

    const cardTotal = await this.prisma.cardShopCard.count({
      where: { siteId: current.siteId, trashedAt: null },
    });
    if (cardTotal + items.length > limits.cardQuota) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `本站点卡密总量上限 ${limits.cardQuota} 条，当前 ${cardTotal} 条，本次 ${items.length} 条；请清理回收站或联系平台管理员调整配额`,
      );
    }

    const maxSeq = await this.prisma.cardShopCard.findFirst({
      where: { siteId: current.siteId },
      select: { seq: true },
      orderBy: [{ seq: 'desc' }],
    });
    const baseSeq = intIn(maxSeq?.seq, 0, Number.MAX_SAFE_INTEGER, 0);
    const ordered = body.orderMode === 'SHUFFLE' ? shuffle(items) : items;

    const batchNo = cardShopNo('CSB');
    const batch = await this.prisma.cardShopCardBatch.create({
      data: {
        siteId: current.siteId,
        goodsId: goods.id,
        batchNo,
        source: body.source === 'FILE' ? 'FILE' : 'TEXT',
        splitter: parsed.splitterUsed,
        totalLines: parsed.totalLines,
        importedCount: ordered.length,
        duplicatedCount: parsed.duplicateLines + dbDuplicated,
        invalidCount: parsed.invalid.length,
        orderMode: body.orderMode === 'SHUFFLE' ? 'SHUFFLE' : 'SEQUENTIAL',
        operator: String(user.userId),
      },
    });
    for (const chunk of chunks(ordered, INSERT_CHUNK)) {
      const data = chunk.map((item, index) => ({
        siteId: current.siteId,
        goodsId: goods.id,
        batchId: batch.id,
        number: clip(item.number, 191),
        secret: clip(item.secret, 191),
        remark: clip(body.remark, 200),
        status: 'AVAILABLE',
        seq: baseSeq + index + 1,
      }));
      await this.prisma.cardShopCard.createMany({ data });
    }

    return {
      batchNo,
      batchId: batch.id,
      totalLines: parsed.totalLines,
      importedCount: ordered.length,
      duplicatedCount: parsed.duplicateLines + dbDuplicated,
      invalidCount: parsed.invalid.length,
      splitterUsed: parsed.splitterUsed,
      splitterLabel: splitterLabel(parsed.splitterUsed),
      samples: parsed.invalid.slice(0, SAMPLE_MAX),
      message:
        `已导入 ${ordered.length} 张卡（共 ${parsed.totalLines} 行，` +
        `重复 ${parsed.duplicateLines + dbDuplicated} 行，无效 ${parsed.invalid.length} 行），` +
        `出卡顺序${body.orderMode === 'SHUFFLE' ? '已随机打乱' : '按导入次序'}；当前可售基数 ${await this.availableCount(
          current.siteId,
          goods.id,
        )}`,
    };
  }

  /** 单商品可售数（下单算价、上架校验与导入回执都用它）。 */
  async availableCount(siteId: number, goodsId: number): Promise<number> {
    return this.prisma.cardShopCard.count({
      where: { siteId, goodsId, status: 'AVAILABLE', trashedAt: null },
    });
  }

  /**
   * 已在库的同商品卡密键集合：按 DEDUP_CHUNK 分批用 secret IN 查，
   * 不去整表拉卡密（20 万条时既撑内存又要几十秒）。
   */
  private async existingKeys(
    siteId: number,
    goodsId: number,
    items: Array<{ number: string; secret: string }>,
  ): Promise<Set<string>> {
    const out = new Set<string>();
    const secrets = [...new Set(items.map((item) => item.secret))];
    for (const chunk of chunks(secrets, DEDUP_CHUNK)) {
      const rows = await this.prisma.cardShopCard.findMany({
        where: { siteId, goodsId, secret: { in: chunk } },
        select: { number: true, secret: true },
      });
      for (const row of rows) out.add(cardDedupKey(row.number, row.secret));
    }
    return out;
  }

  // ---------------------------------------------------------------- 单卡维护

  /** 改单张卡的卡号/卡密/备注：锁定中与已售出的不动（那是买家凭证，改了就是篡改交付物）。 */
  async saveCard(
    user: CurrentUser,
    body: CardShopCardSaveBody,
  ): Promise<CardShopCard> {
    const current = await this.sites.requireSite(user, body.siteId);
    const row = await this.prisma.cardShopCard.findFirst({
      where: { id: body.id, siteId: current.siteId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '卡密不存在');
    if (row.status === 'LOCKED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该卡正在一笔待支付订单里（锁定中），等订单超时释放或支付完成后再修改',
      );
    }
    if (row.status === 'SOLD') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该卡已售出，卡号卡密是买家的领取凭证，不能改写；如需重新发卡请用「重新发卡」',
      );
    }
    const secret = clip(body.secret, 191).trim();
    if (!secret)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '卡密不能为空');
    const number = clip(body.number, 191).trim();
    const duplicated = await this.prisma.cardShopCard.findFirst({
      where: {
        siteId: current.siteId,
        goodsId: row.goodsId,
        id: { not: row.id },
        number,
        secret,
        trashedAt: null,
      },
      select: { id: true },
    });
    if (duplicated) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `同一商品下已有一张完全相同的卡（编号 ${duplicated.id}），请勿重复录入`,
      );
    }
    const updated = await this.prisma.cardShopCard.update({
      where: { id: row.id },
      data: { number, secret, remark: clip(body.remark, 200) },
    });
    const [mapped] = await this.toCardRows([updated]);
    if (!mapped)
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        '卡密保存后读取失败',
      );
    return mapped;
  }

  /** 批量改状态：只允许 AVAILABLE / DISABLED / VOID，LOCKED 与 SOLD 由订单流程独占。 */
  async setCardStatus(user: CurrentUser, body: CardShopCardStatusBody) {
    const current = await this.sites.requireSite(user, body.siteId);
    const ids = uniqueIds(body.ids);
    if (!ids.length)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未选择卡密');
    if (ids.length > ID_LIMIT) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单次最多操作 ${ID_LIMIT} 张卡，当前选了 ${ids.length} 张`,
      );
    }
    const status = String(body.status);
    if (status !== 'AVAILABLE' && status !== 'DISABLED' && status !== 'VOID') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '卡密状态只能由店主设为「可售 / 停用 / 作废」；已售出与锁定中由订单流程维护',
      );
    }
    const changed = await this.prisma.cardShopCard.updateMany({
      where: {
        siteId: current.siteId,
        id: { in: ids },
        trashedAt: null,
        status: { in: ['AVAILABLE', 'DISABLED', 'VOID'] },
      },
      data:
        status === 'AVAILABLE'
          ? { status, lockOrderId: 0, lockExpireAt: null }
          : { status },
    });
    const skipped = ids.length - changed.count;
    return {
      ok: true,
      changed: changed.count,
      message: skipped
        ? `已更新 ${changed.count} 张；另有 ${skipped} 张跳过（已售出、锁定中或在回收站）`
        : `已更新 ${changed.count} 张卡密`,
    };
  }

  /**
   * 删除卡密：默认进回收站（可还原），hard=1 才真删。
   * 已售出的卡两侧都不允许动——订单取证与售后核对都靠它。
   */
  async removeCards(
    user: CurrentUser,
    body: { siteId: number; ids: number[]; hard?: number },
  ) {
    const current = await this.sites.requireSite(user, body.siteId);
    const ids = uniqueIds(body.ids);
    if (!ids.length)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未选择卡密');
    if (ids.length > ID_LIMIT) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单次最多删除 ${ID_LIMIT} 张卡，当前选了 ${ids.length} 张`,
      );
    }
    const hard = Number(body.hard ?? 0) === 1;
    const where: Record<string, unknown> = {
      siteId: current.siteId,
      id: { in: ids },
      status: hard
        ? { not: 'SOLD' }
        : { in: ['AVAILABLE', 'DISABLED', 'VOID'] },
    };
    if (hard) where.trashedAt = { not: null };
    const target = await this.prisma.cardShopCard.count({ where });
    let changed = 0;
    if (hard) {
      const removed = await this.prisma.cardShopCard.deleteMany({ where });
      changed = removed.count;
    } else {
      const trashed = await this.prisma.cardShopCard.updateMany({
        where: { ...where, trashedAt: null },
        data: { trashedAt: new Date(), lockOrderId: 0, lockExpireAt: null },
      });
      changed = trashed.count;
    }
    if (!changed) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        hard
          ? '回收站里没有可彻底删除的卡（已售出的卡不允许彻底删除）'
          : '所选卡都在已售出、锁定中或回收站里，没有可移除的卡',
      );
    }
    return {
      ok: true,
      changed,
      message: hard
        ? `已彻底删除 ${changed} 张卡密，不可恢复${
            target < ids.length
              ? `；另有 ${ids.length - target} 张不满足删除条件`
              : ''
          }`
        : `已将 ${changed} 张卡密移入回收站，可在回收站还原或彻底删除`,
    };
  }

  /** 从回收站还原：状态原样保留（还原前停用的卡不会偷偷变成可售）。 */
  async restoreCards(user: CurrentUser, siteId: number, ids: number[]) {
    const current = await this.sites.requireSite(user, siteId);
    const unique = uniqueIds(ids);
    if (!unique.length)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '未选择卡密');
    if (unique.length > ID_LIMIT) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `单次最多还原 ${ID_LIMIT} 张卡，当前选了 ${unique.length} 张`,
      );
    }
    const changed = await this.prisma.cardShopCard.updateMany({
      where: {
        siteId: current.siteId,
        id: { in: unique },
        trashedAt: { not: null },
      },
      data: { trashedAt: null },
    });
    return {
      ok: true,
      changed: changed.count,
      message: `已还原 ${changed.count} 张卡密（原状态保留），需要重新上架为「可售」的请在列表里改状态`,
    };
  }

  // ---------------------------------------------------------------- 批次

  async batches(
    user: CurrentUser,
    siteId: number,
    goodsId?: number,
  ): Promise<CardShopCardBatch[]> {
    const current = await this.sites.requireSite(user, siteId);
    const where: Record<string, unknown> = { siteId: current.siteId };
    const target = intIn(goodsId, 0, 1_000_000_000, 0);
    if (target > 0) where.goodsId = target;
    const rows = await this.prisma.cardShopCardBatch.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      take: 200,
    });
    if (!rows.length) return [];
    const batchIds = rows.map((row) => row.id);
    const goodsIds = [...new Set(rows.map((row) => row.goodsId))];
    const [goods, grouped] = await Promise.all([
      this.prisma.cardShopProduct.findMany({
        where: { siteId: current.siteId, id: { in: goodsIds } },
        select: { id: true, name: true },
      }),
      this.prisma.cardShopCard.groupBy({
        by: ['batchId', 'status'],
        where: {
          siteId: current.siteId,
          batchId: { in: batchIds },
          trashedAt: null,
        },
        _count: { _all: true },
      }),
    ]);
    const goodsName = new Map(goods.map((row) => [row.id, row.name]));
    const counts = new Map<number, { available: number; sold: number }>();
    for (const id of batchIds) counts.set(id, { available: 0, sold: 0 });
    for (const row of grouped) {
      const value = counts.get(row.batchId);
      if (!value) continue;
      if (row.status === 'AVAILABLE') value.available += row._count._all;
      else if (row.status === 'SOLD') value.sold += row._count._all;
    }
    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      goodsId: row.goodsId,
      goodsName: goodsName.get(row.goodsId) ?? '（商品已删除）',
      batchNo: row.batchNo,
      source: row.source,
      splitter: row.splitter,
      totalLines: row.totalLines,
      importedCount: row.importedCount,
      duplicatedCount: row.duplicatedCount,
      invalidCount: row.invalidCount,
      orderMode: row.orderMode,
      operator: row.operator,
      availableCount: counts.get(row.id)?.available ?? 0,
      soldCount: counts.get(row.id)?.sold ?? 0,
      createdAt: iso(row.createdAt),
    }));
  }

  /**
   * 撤批次：把该批次**未售出**的卡作废并进回收站（批次记录保留，事后能查是谁哪次导入的）。
   * includeSold 只把这些卡一并移出可售视图，状态仍为 SOLD——已售记录是买家凭证，不抹。
   */
  async removeBatch(user: CurrentUser, body: CardShopCardBatchRemoveBody) {
    const current = await this.sites.requireSite(user, body.siteId);
    const batch = await this.prisma.cardShopCardBatch.findFirst({
      where: { id: body.batchId, siteId: current.siteId },
    });
    if (!batch)
      throw new BusinessException(ErrorCode.NOT_FOUND, '导入批次不存在');
    const openCount = await this.prisma.cardShopCard.count({
      where: {
        siteId: current.siteId,
        batchId: batch.id,
        status: 'LOCKED',
        trashedAt: null,
      },
    });
    const unsold = await this.prisma.cardShopCard.updateMany({
      where: {
        siteId: current.siteId,
        batchId: batch.id,
        trashedAt: null,
        status: { in: ['AVAILABLE', 'DISABLED', 'VOID'] },
      },
      data: {
        status: 'VOID',
        trashedAt: new Date(),
        lockOrderId: 0,
        lockExpireAt: null,
      },
    });
    let sold = 0;
    if (body.includeSold) {
      const moved = await this.prisma.cardShopCard.updateMany({
        where: {
          siteId: current.siteId,
          batchId: batch.id,
          status: 'SOLD',
          trashedAt: null,
        },
        data: { trashedAt: new Date() },
      });
      sold = moved.count;
    }
    const voided = unsold.count + sold;
    if (!voided) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        openCount
          ? '该批次的卡都在待支付订单里（锁定中），等订单释放后再撤批次'
          : '该批次没有可撤下的卡（可能已经撤过）',
      );
    }
    return {
      ok: true,
      voided,
      message:
        `已撤下 ${voided} 张卡（作废并进回收站${sold ? `，含已售出 ${sold} 张仅作取证隔离` : ''}）` +
        (openCount ? `；另有 ${openCount} 张锁定中未处理` : ''),
    };
  }

  // ---------------------------------------------------------------- 导出

  /**
   * 导出卡密清单为 CSV 文本（前端存盘）。
   *
   * 不落对象存储：卡密明文进公开读的桶等于把库存搬到站外，且 OSS 没配就导出不可用。
   * 默认掩码，只有 plain=1 才出明文，并在消息里点明这次出了明文。
   */
  async exportCards(
    user: CurrentUser,
    body: CardShopCardExportBody,
  ): Promise<CardShopCardExportResult> {
    const current = await this.sites.requireSite(user, body.siteId);
    const goods = await this.prisma.cardShopProduct.findFirst({
      where: { id: body.goodsId, siteId: current.siteId },
      select: { id: true, name: true },
    });
    if (!goods) throw new BusinessException(ErrorCode.NOT_FOUND, '商品不存在');
    const plain = Number(body.plain ?? 0) === 1;
    const where: Record<string, unknown> = {
      siteId: current.siteId,
      goodsId: goods.id,
      trashedAt: null,
    };
    if (body.status) where.status = String(body.status);
    const batchId = intIn(body.batchId, 0, 1_000_000_000, 0);
    if (batchId > 0) where.batchId = batchId;
    const [rows, total] = await Promise.all([
      this.prisma.cardShopCard.findMany({
        where,
        orderBy: [{ seq: 'asc' }, { id: 'asc' }],
        take: EXPORT_MAX_ROWS + 1,
      }),
      this.prisma.cardShopCard.count({ where }),
    ]);
    const limited =
      rows.length > EXPORT_MAX_ROWS ? rows.slice(0, EXPORT_MAX_ROWS) : rows;
    const batchIds = [
      ...new Set(limited.map((row) => row.batchId).filter((id) => id > 0)),
    ];
    const batches = batchIds.length
      ? await this.prisma.cardShopCardBatch.findMany({
          where: { siteId: current.siteId, id: { in: batchIds } },
          select: { id: true, batchNo: true },
        })
      : [];
    const batchNoById = new Map(batches.map((row) => [row.id, row.batchNo]));

    const header = [
      '序号',
      '卡号',
      '卡密',
      '状态',
      '批次号',
      '备注',
      '入库时间',
    ];
    const lines = limited.map((row) => [
      String(row.seq),
      row.number,
      plain ? row.secret : maskSecret(row.secret),
      cardStatusLabel(row.status),
      batchNoById.get(row.batchId) ?? '',
      row.remark,
      iso(row.createdAt),
    ]);
    const csv = CSV_BOM + [header, ...lines].map(csvRow).join('\r\n');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `card-${safeName(goods.name)}-${stamp}-${limited.length}.csv`;
    return {
      fileName,
      content: csv,
      count: limited.length,
      plain,
      truncated: limited.length < total,
      message:
        limited.length < total
          ? `共 ${total} 张，单次最多导出 ${EXPORT_MAX_ROWS} 张，已截断；请按状态或批次分批导出`
          : plain
            ? `已导出 ${limited.length} 张卡的明文卡密，文件请勿外传`
            : `已导出 ${limited.length} 张卡（卡密已掩码，仅用于核对库存；需要明文请勾选明文导出）`,
    };
  }

  // ---------------------------------------------------------------- 内部

  private async toCardRows(rows: CardRow[]): Promise<CardShopCard[]> {
    if (!rows.length) return [];
    const goodsIds = [...new Set(rows.map((row) => row.goodsId))];
    const batchIds = [
      ...new Set(rows.map((row) => row.batchId).filter((id) => id > 0)),
    ];
    const orderIds = [
      ...new Set(rows.map((row) => row.soldOrderId).filter((id) => id > 0)),
    ];
    const [goods, batches, orders] = await Promise.all([
      this.prisma.cardShopProduct.findMany({
        where: { id: { in: goodsIds } },
        select: { id: true, name: true },
      }),
      batchIds.length
        ? this.prisma.cardShopCardBatch.findMany({
            where: { id: { in: batchIds } },
            select: { id: true, batchNo: true },
          })
        : Promise.resolve([]),
      orderIds.length
        ? this.prisma.cardShopOrder.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNo: true },
          })
        : Promise.resolve([]),
    ]);
    const goodsName = new Map(goods.map((row) => [row.id, row.name]));
    const batchNo = new Map(batches.map((row) => [row.id, row.batchNo]));
    const orderNo = new Map(orders.map((row) => [row.id, row.orderNo]));
    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      goodsId: row.goodsId,
      goodsName: goodsName.get(row.goodsId) ?? '',
      batchId: row.batchId,
      batchNo: batchNo.get(row.batchId) ?? '',
      number: row.number,
      // 列表永不回明文：卡密截图/录屏与共享屏幕是店主侧最常见的泄露面
      secret: maskSecret(row.secret),
      secretMasked: true,
      remark: row.remark,
      status: cardStatus(row.status),
      seq: row.seq,
      lockOrderId: row.lockOrderId,
      lockExpireAt: row.lockExpireAt ? iso(row.lockExpireAt) : null,
      soldOrderNo: orderNo.get(row.soldOrderId) ?? '',
      soldAt: row.soldAt ? iso(row.soldAt) : null,
      createdAt: iso(row.createdAt),
      trashedAt: row.trashedAt ? iso(row.trashedAt) : null,
    }));
  }
}

/** Fisher–Yates：导入乱序出卡用，不涉资金所以 Math.random 足够。 */
function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    const swap = out[index];
    out[index] = out[target];
    out[target] = swap;
  }
  return out;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

function uniqueIds(ids: number[]): number[] {
  return [
    ...new Set(
      (ids ?? []).map((value) => Number(value)).filter((value) => value > 0),
    ),
  ];
}

const CARD_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: '可售',
  LOCKED: '锁定中',
  SOLD: '已售出',
  DISABLED: '已停用',
  VOID: '已作废',
};

function cardStatusLabel(value: string): string {
  return CARD_STATUS_LABELS[value] ?? String(value ?? '');
}

/** CSV 单元格：制表符/引号/换行都可能被 Excel 当公式或断行，统一按引号转义。 */
function csvRow(cells: string[]): string {
  return cells
    .map((cell) => {
      const value = String(cell ?? '');
      if (
        /[",\r\n]/.test(value) ||
        value.startsWith('=') ||
        value.startsWith('+')
      ) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    })
    .join(',');
}

/** 文件名里只留中文、字母、数字与短横线，避免路径穿越字符。 */
function safeName(value: string): string {
  return String(value ?? '')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9-]/g, '-')
    .slice(0, 40);
}
