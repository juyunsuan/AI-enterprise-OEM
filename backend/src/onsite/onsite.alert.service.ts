import type { Prisma } from '../../generated/prisma';
import type {
  OnsiteAlertConfig,
  OnsiteAlertConfigInput,
  OnsiteAlertRow,
  OnsiteTrade,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { OnsiteNotifyService } from './onsite.notify.service';
import type { OnsiteShopService } from './onsite.shop.service';

const ALERT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'RESOLVED',
  'MISFIRE',
] as const;

const alertStatusOf = (value: string): OnsiteAlertRow['status'] => {
  for (const status of ALERT_STATUSES) {
    if (status === value) return status;
  }
  return 'PENDING';
};

/**
 * 一键报警（上门服务的人身安全兜底）。
 *
 * 参考源码把它做成「技师端一个按钮 + 短信 + 语音 + 通知名单」，本方案一期先做：
 * 定位快照 + 站内信直达店主 + 重复报警去重（同一技师短时间内只报一次，避免误触刷屏）。
 * 短信与语音外呼随 P4 的虚拟号一起接；`notifyResult` 字段现在就写清楚当时通知了谁。
 * 配置存在店铺 tradeJson 里（见 `OnsiteTrade` 的 alert* 字段），写回必须走
 * `mergeTradeById`，否则会把交易页签的其它参数覆盖掉。
 */
export class OnsiteAlertService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
    private readonly notify: OnsiteNotifyService,
  ) {}

  private view(
    trade: Pick<
      OnsiteTrade,
      | 'alertEnabled'
      | 'alertHelpPhones'
      | 'alertNotifyOwner'
      | 'alertDedupeMinutes'
    >,
  ): OnsiteAlertConfig {
    return {
      enabled: trade.alertEnabled,
      helpPhones: trade.alertHelpPhones,
      notifyOwner: trade.alertNotifyOwner,
      dedupeMinutes: trade.alertDedupeMinutes,
    };
  }

  async config(shopId: number): Promise<OnsiteAlertConfig> {
    return this.view(await this.shops.tradeById(shopId));
  }

  async saveConfig(
    user: CurrentUser,
    shopId: string,
    body: OnsiteAlertConfigInput,
  ): Promise<OnsiteAlertConfig> {
    const shop = await this.shops.requireShop(user, shopId);
    const trade = await this.shops.mergeTradeById(shop.shopId, {
      alertEnabled: body.enabled === true,
      alertHelpPhones: body.helpPhones ?? [],
      alertNotifyOwner: body.notifyOwner !== false,
      alertDedupeMinutes: body.dedupeMinutes ?? 10,
    });
    await this.audit(
      user.userId,
      'onsite.alert.config',
      `求救号码 ${trade.alertHelpPhones.length} 个，去重 ${trade.alertDedupeMinutes} 分钟`,
    );
    return this.view(trade);
  }

  /**
   * 站内身份发起求救：店主可代报（必须点名技师），绑定账号的技师只能报自己。
   *
   * 小程序技师分包的独立登录在 P4（手机后台 RBAC）接入，届时复用这个方法；
   * 现在先把「谁能报」这条线划清楚，避免出现一个只凭 staffId 就能替别人求救的开放口子。
   */
  async raiseByActor(
    user: CurrentUser,
    shopId: string,
    input: {
      staffId?: number;
      orderId?: number;
      lng: number;
      lat: number;
      address: string;
      content: string;
      audioUrl?: string;
    },
  ) {
    const owned = await this.prisma.onsiteShop.findFirst({
      where: { id: Number(shopId), ownerUserId: user.userId },
      select: { id: true },
    });
    if (owned) {
      if (!input.staffId) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '代报需要选择服务人员，请在人员列表里挑选后重试',
        );
      }
      return this.raise(owned.id, { ...input, staffId: input.staffId });
    }
    const staff = await this.prisma.onsiteStaff.findFirst({
      where: { shopId: Number(shopId), accountUserId: user.userId },
      select: { id: true, shopId: true },
    });
    if (!staff) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '你不是该店铺的服务人员，无法发起求救；如需帮助请联系店主或平台',
      );
    }
    return this.raise(staff.shopId, { ...input, staffId: staff.id });
  }

  /** 技师端（或店主代报）发起求救。 */
  async raise(
    shopId: number,
    input: {
      staffId: number;
      orderId?: number;
      lng: number;
      lat: number;
      address: string;
      content: string;
      audioUrl?: string;
    },
  ) {
    const trade = await this.shops.tradeById(shopId);
    const config = this.view(trade);
    if (!config.enabled) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该店铺未开启一键报警，请联系店主在「安全管理」里开启',
      );
    }
    const staff = await this.prisma.onsiteStaff.findFirst({
      where: { id: input.staffId, shopId },
    });
    if (!staff)
      throw new BusinessException(ErrorCode.NOT_FOUND, '服务人员不存在');
    const since = new Date(Date.now() - config.dedupeMinutes * 60_000);
    const recent = await this.prisma.onsiteAlert.findFirst({
      where: { shopId, staffId: staff.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent && ['PENDING', 'PROCESSING'].includes(recent.status)) {
      return {
        id: recent.id,
        duplicated: true,
        status: alertStatusOf(recent.status),
      };
    }
    const order = input.orderId
      ? await this.prisma.onsiteOrder.findFirst({
          where: { id: input.orderId, shopId, staffId: staff.id },
        })
      : null;
    const shopRow = await this.prisma.onsiteShop.findUnique({
      where: { id: shopId },
      select: { ownerUserId: true },
    });
    const notifyUsers =
      config.notifyOwner && shopRow ? [shopRow.ownerUserId] : [];
    const row = await this.prisma.onsiteAlert.create({
      data: {
        shopId,
        staffId: staff.id,
        customerId: order?.customerId ?? 0,
        orderId: order?.id ?? 0,
        lng: Number(input.lng) || 0,
        lat: Number(input.lat) || 0,
        address: String(input.address || '').slice(0, 200),
        content: String(input.content || '').slice(0, 300),
        audioUrl: String(input.audioUrl || '').slice(0, 500),
        notifyPhones: config.helpPhones,
        notifyUsers,
        notifyResult: config.notifyOwner
          ? `已站内提醒店主${config.helpPhones.length ? `；求救号码 ${config.helpPhones.length} 个待外呼（短信/语音通道随 P4 虚拟号接入）` : ''}`
          : '店主提醒已关闭',
      },
    });
    if (notifyUsers.length) {
      await this.notify.alertRaised({
        shopId,
        alertId: row.id,
        staffName: staff.name,
        address: row.address || '未获取到定位',
        phone: staff.phone,
      });
    }
    return { id: row.id, duplicated: false, status: alertStatusOf(row.status) };
  }

  private toRow(
    row: Prisma.OnsiteAlertGetPayload<Record<string, never>>,
    staffName: string,
    staffPhone: string,
    orderNo: string,
  ): OnsiteAlertRow {
    return {
      id: row.id,
      staffId: row.staffId,
      staffName,
      staffPhone,
      customerId: row.customerId,
      orderId: row.orderId,
      orderNo,
      lng: Number(row.lng),
      lat: Number(row.lat),
      address: row.address,
      content: row.content,
      audioUrl: row.audioUrl,
      notifyResult: row.notifyResult,
      status: alertStatusOf(row.status),
      handleRemark: row.handleRemark,
      handledBy: row.handledBy,
      handledAt: row.handledAt ? row.handledAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const status = text(query.status, 'all');
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteAlert.count({ where }),
      this.prisma.onsiteAlert.findMany({
        where,
        // 未处理的永远排在最前，这是安全事项而不是流水账
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const [staffRows, orders] = await Promise.all([
      this.prisma.onsiteStaff.findMany({
        where: {
          id: { in: Array.from(new Set(rows.map((row) => row.staffId))) },
        },
        select: { id: true, name: true, phone: true },
      }),
      this.prisma.onsiteOrder.findMany({
        where: { id: { in: rows.map((row) => row.orderId).filter(Boolean) } },
        select: { id: true, orderNo: true },
      }),
    ]);
    const staffOf = new Map(staffRows.map((row) => [row.id, row]));
    const orderOf = new Map(orders.map((row) => [row.id, row]));
    const list: OnsiteAlertRow[] = rows.map((row) =>
      this.toRow(
        row,
        staffOf.get(row.staffId)?.name ?? `#${row.staffId}`,
        staffOf.get(row.staffId)?.phone ?? '',
        orderOf.get(row.orderId)?.orderNo ?? '',
      ),
    );
    return pageOf(list, total, page, pageSize);
  }

  /** 处置留痕：状态 + 说明必填，事后能说清「几点几分谁联系了什么」。 */
  async handle(
    user: CurrentUser,
    shopId: string,
    input: { id: number; status: string; remark: string },
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteAlert.findFirst({
      where: { id: input.id, shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '报警记录不存在');
    if (!input.remark.trim()) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写处置说明（联系了谁、结果如何），安全记录不能只改状态',
      );
    }
    const updated = await this.prisma.onsiteAlert.update({
      where: { id: row.id },
      data: {
        status: alertStatusOf(input.status),
        handleRemark: input.remark.trim().slice(0, 300),
        handledBy: user.userId,
        handledAt: new Date(),
      },
    });
    const staff = await this.prisma.onsiteStaff.findUnique({
      where: { id: row.staffId },
      select: { name: true, phone: true },
    });
    const order = row.orderId
      ? await this.prisma.onsiteOrder.findUnique({
          where: { id: row.orderId },
          select: { orderNo: true },
        })
      : null;
    await this.audit(
      user.userId,
      'onsite.alert.handle',
      `${updated.status} ${updated.handleRemark}`,
    );
    return this.toRow(
      updated,
      staff?.name ?? '',
      staff?.phone ?? '',
      order?.orderNo ?? '',
    );
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
