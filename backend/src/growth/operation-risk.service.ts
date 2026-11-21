import type { CurrentUser } from '../auth/current-user';
import type { HrmScopeService, HrmOrg } from '../hrm/hrm.scope';
import type { MechanismService } from '../mechanisms/mechanism.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TaskDraft } from '../task-center/task-source';
import { withBridgeTimeout } from '../commerce-core/outbox-policy';
import { unwiredErpPort } from '../erp/erp-port';
import { failingErpWritePort, type ErpWritePort } from '../erp/erp-write-port';
import type { ErpPort } from '../erp/erp-port';

type Row = Record<string, unknown>;

const num = (value: unknown) => Number(value || 0);
const moneyStr = (value: number) => value.toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);

export const RISK_KINDS = [
  'RECEIVABLE_OVERDUE',
  'PAYABLE_OVERDUE',
  'PROJECT_OVER_BUDGET',
  'STOCK_LOW',
  'TASK_OVERDUE',
] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

export const RISK_KIND_LABELS: Record<RiskKind, string> = {
  RECEIVABLE_OVERDUE: '应收逾期',
  PAYABLE_OVERDUE: '应付逾期',
  PROJECT_OVER_BUDGET: '项目超预算',
  STOCK_LOW: '库存低于补货点',
  TASK_OVERDUE: '任务超期',
};

const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * 经营异常模型（P4-6）：五类可量化异常统一出一个信号，
 * 每次扫描把异常派成「责任任务」进任务中心（assign_task 同一条派单口），
 * 并对外发 `risk.detected` 事件，规则/Webhook 可以据此加码。
 * 关闭口径不靠人工点「已完成」：结案时重新扫描一次，异常消失才允许关闭。
 */

export type RiskSignal = {
  kind: RiskKind;
  kindLabel: string;
  entityKey: string;
  title: string;
  detail: string;
  amount: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  ownerUserId: string;
  link: string;
  /** 库存信号载荷：派单时据此生成「补货申请」（正式采购单，后续仍走审批）。 */
  stock?: {
    warehouseId: number;
    variantId: number;
    sku: string;
    /** 建议补货量：补货点 − 现存，至少 1 */
    quantity: number;
  };
};

export class OperationRiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: HrmScopeService,
    private readonly mechanisms: MechanismService,
    private readonly tasks: { assign(draft: TaskDraft): Promise<unknown> },
    /** ERP 读侧端口：未注入时空转（返回空读数），单测可注入替身。 */
    private readonly erp: ErpPort = unwiredErpPort(),
    /** ERP 写侧端口：补货采购单从这里落，缺装配直接抛错（不许静默不建单）。 */
    private readonly erpWrites: ErpWritePort = failingErpWritePort,
  ) {}

  /** 扫描当前组织五类异常；只读，不改任何业务单据。 */
  async scan(org: HrmOrg): Promise<RiskSignal[]> {
    return (await this.collectSignals(org)).signals;
  }

  /**
   * 扫描实现：ERP 侧读数全部经 `ErpPort`，普通页面口径下失败/超时降级为空值
   * （增长雷达页仍能看项目/任务类异常，`erpAvailable` 标注「ERP 数据暂不可用」）；
   * 结案复核（strictErp）按原语义直读，读失败即抛，绝不把「读不到」误判成「异常已消除」。
   */
  private async collectSignals(
    org: HrmOrg,
    options: { strictErp?: boolean } = {},
  ): Promise<{ signals: RiskSignal[]; erpAvailable: boolean }> {
    const orgKey = { orgType: org.orgType, orgUserId: org.orgUserId };
    const todayStr = today();
    let erpAvailable = true;
    const erpRead = async <T>(
      work: () => Promise<T>,
      fallback: T,
    ): Promise<T> => {
      if (options.strictErp) return work();
      const result = await withBridgeTimeout(work);
      if (!result.ok) {
        erpAvailable = false;
        return fallback;
      }
      return result.value;
    };
    const [receivables, payables, projects, stocks, tasks] = await Promise.all([
      erpRead(() => this.erp.listOverdueReceivables(orgKey, todayStr), []),
      erpRead(() => this.erp.listOverduePayables(orgKey, todayStr), []),
      this.prisma.pjProject.findMany({
        where: {
          ...orgKey,
          status: { in: ['PLANNING', 'ACTIVE', 'ACCEPTING'] },
          budgetAmount: { gt: 0 },
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          budgetAmount: true,
        },
        take: 200,
      }),
      erpRead(
        () =>
          this.erp.listStock(orgKey, {
            onlyWithReorderPoint: true,
            limit: 500,
          }),
        [],
      ),
      this.prisma.pjTask.findMany({
        where: {
          ...orgKey,
          status: { notIn: ['DONE', 'CANCELED'] },
          dueDate: { lt: todayStr },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          assigneeId: true,
          assigneeType: true,
          projectId: true,
        },
        take: 500,
      }),
    ]);

    const projectIds = projects.map((row) => row.id);
    const costByProject = new Map<number, number>();
    if (projectIds.length) {
      const costs = await this.prisma.pjCostItem.groupBy({
        by: ['projectId'],
        _sum: { amount: true },
        where: { ...orgKey, projectId: { in: projectIds } },
      });
      for (const item of costs)
        costByProject.set(item.projectId, num(item._sum.amount));
    }
    const variantIds = [...new Set(stocks.map((row) => row.variantId))];
    const variants = variantIds.length
      ? await erpRead(() => this.erp.listVariants(orgKey, variantIds), [])
      : [];
    const variantLabels = new Map(
      variants.map((row) => [row.id, row.name || row.sku || `#${row.id}`]),
    );
    const variantSkus = new Map(variants.map((row) => [row.id, row.sku || '']));
    const vendorIds = [...new Set(payables.map((row) => row.vendorId))].filter(
      (id) => id > 0,
    );
    const vendors = vendorIds.length
      ? await erpRead(() => this.erp.listVendors(orgKey, vendorIds), [])
      : [];
    const vendorNames = new Map(vendors.map((row) => [row.id, row.name]));
    const fallbackOwner = org.orgUserId;

    const out: RiskSignal[] = [];
    for (const row of receivables) {
      const outstanding = num(row.amount) - num(row.receivedAmount);
      if (outstanding <= 0) continue;
      out.push({
        kind: 'RECEIVABLE_OVERDUE',
        kindLabel: RISK_KIND_LABELS.RECEIVABLE_OVERDUE,
        entityKey: `receivable:${row.id}`,
        title: `应收逾期：${row.customerName || row.code || `#${row.id}`}`,
        detail: `${row.code || `应收 #${row.id}`} 应于 ${row.dueDate} 前收清，尚欠 ${moneyStr(outstanding)}`,
        amount: moneyStr(outstanding),
        severity: outstanding >= 50000 ? 'HIGH' : 'MEDIUM',
        ownerUserId: fallbackOwner,
        link: '/erp',
      });
    }
    for (const row of payables) {
      const outstanding = num(row.amount) - num(row.paidAmount);
      if (outstanding <= 0) continue;
      out.push({
        kind: 'PAYABLE_OVERDUE',
        kindLabel: RISK_KIND_LABELS.PAYABLE_OVERDUE,
        entityKey: `payable:${row.id}`,
        title: `应付逾期：${vendorNames.get(row.vendorId) || `供应商 #${row.vendorId}`}`,
        detail: `${row.code || `应付 #${row.id}`} 应于 ${row.dueDate} 前付清，尚欠 ${moneyStr(outstanding)}`,
        amount: moneyStr(outstanding),
        severity: outstanding >= 50000 ? 'HIGH' : 'MEDIUM',
        ownerUserId: fallbackOwner,
        link: '/erp',
      });
    }
    for (const row of projects) {
      const cost = costByProject.get(row.id) || 0;
      const budget = num(row.budgetAmount);
      if (cost <= budget) continue;
      out.push({
        kind: 'PROJECT_OVER_BUDGET',
        kindLabel: RISK_KIND_LABELS.PROJECT_OVER_BUDGET,
        entityKey: `project:${row.id}`,
        title: `项目超预算：${row.name}`,
        detail: `预算 ${moneyStr(budget)}，已发生成本 ${moneyStr(cost)}，超出 ${moneyStr(cost - budget)}`,
        amount: moneyStr(cost - budget),
        severity: cost >= budget * 1.2 ? 'HIGH' : 'MEDIUM',
        ownerUserId: row.ownerId || fallbackOwner,
        link: '/project',
      });
    }
    for (const row of stocks) {
      const onHand = num(row.onHand);
      const reorderPoint = num(row.reorderPoint);
      if (onHand >= reorderPoint) continue;
      out.push({
        kind: 'STOCK_LOW',
        kindLabel: RISK_KIND_LABELS.STOCK_LOW,
        entityKey: `stock:${row.warehouseId}:${row.variantId}`,
        title: `库存低于补货点：${variantLabels.get(row.variantId) || `#${row.variantId}`}`,
        detail: `仓库 #${row.warehouseId} 现有 ${onHand}，补货点 ${reorderPoint}`,
        amount: '',
        severity: 'LOW',
        ownerUserId: fallbackOwner,
        link: '/erp',
        stock: {
          warehouseId: row.warehouseId,
          variantId: row.variantId,
          sku: variantSkus.get(row.variantId) || '',
          quantity: Math.max(1, Math.ceil(reorderPoint - onHand)),
        },
      });
    }
    for (const row of tasks) {
      if (row.assigneeType !== 'STAFF' || !row.assigneeId) continue;
      out.push({
        kind: 'TASK_OVERDUE',
        kindLabel: RISK_KIND_LABELS.TASK_OVERDUE,
        entityKey: `task:${row.id}`,
        title: `任务超期：${row.title}`,
        detail: `截止 ${row.dueDate} 仍未完成`,
        amount: '',
        severity: 'LOW',
        ownerUserId: row.assigneeId,
        link: '/project',
      });
    }
    return { signals: out, erpAvailable };
  }

  /**
   * 扫描并按异常派责任任务（幂等：同一异常只保留一条）；返回本次扫描结果。
   * 库存低于补货点先落一张「补货申请」（正式采购单，状态待审批，后续仍走采购审批），
   * 任务锚在该采购单周期上，采购岗位接手后无需再从零录入。
   */
  async dispatchRisks(org: HrmOrg) {
    const signals = await this.scan(org);
    for (const signal of signals) {
      // 建单失败不静默：任务照派（业务不能停），但把失败原因写进任务描述，
      // 采购岗位接手时看得见「这张单没自动生成」，不会拿着任务去找不到单据。
      let replenishFailure = '';
      const replenish = signal.stock
        ? await this.ensureReplenishment(org, signal).catch(
            (error: unknown) => {
              replenishFailure =
                error instanceof Error ? error.message : String(error);
              return null;
            },
          )
        : null;
      const sourceId =
        replenish && signal.stock
          ? `stock:${signal.stock.warehouseId}:${signal.stock.variantId}:o${replenish.orderId}`
          : signal.entityKey;
      const title = replenish
        ? `补货申请：${signal.title.replace(/^.*：/, '')}`
        : signal.title;
      const description = replenish
        ? `${signal.detail}；${replenish.created ? '已生成' : '沿用既有'}采购申请 ${replenish.orderNo}（待审批）`
        : replenishFailure
          ? `${signal.detail}；自动建单失败：${replenishFailure}，请手工补采购单`
          : signal.detail;
      const ownerUserId = replenish
        ? replenish.ownerUserId
        : signal.ownerUserId;
      await this.tasks
        .assign({
          assigneeUserId: ownerUserId,
          orgType: org.orgType,
          orgUserId: org.orgUserId,
          assignedBy: 'system',
          source: 'risk',
          sourceId,
          title,
          description,
          link: signal.link,
          category: 'matter',
          priority: signal.severity === 'HIGH' ? 'URGENT' : 'HIGH',
          createdBy: org.orgUserId,
          sourceStatus: 'OPEN',
          sourceStatusLabel: replenish ? '待审批补货' : '待处置',
        })
        .catch(() => null);
      await this.mechanisms
        .dispatch(org, 'risk.detected', {
          kind: signal.kind,
          kindLabel: signal.kindLabel,
          entityKey: signal.entityKey,
          title,
          detail: description,
          amount: signal.amount,
          severity: signal.severity,
          ownerUserId,
          ...(replenish ? { purchaseOrderId: replenish.orderId } : {}),
        })
        .catch(() => null);
    }
    return signals;
  }

  /** 采购岗位：角色码或岗位名称关键词命中即可，找不到回落组织负责人。 */
  private async purchaserOf(org: HrmOrg): Promise<string> {
    const rows = await this.prisma.orgStaff.findMany({
      where: {
        orgType: org.orgType,
        orgUserId: org.orgUserId,
        status: 'ACTIVE',
      },
      select: { memberUserId: true, roles: true, positions: true },
    });
    const roles = ['PURCHASE', 'PURCHASING', 'BUYER', '采购'];
    const keywords = ['采购', '供应', 'buyer', 'purchas'];
    const hit = rows.find((row) => {
      const codes = Array.isArray(row.roles)
        ? (row.roles as unknown[]).map((item) => String(item).toUpperCase())
        : [];
      if (codes.some((code) => roles.includes(code))) return true;
      const names = Array.isArray(row.positions)
        ? (row.positions as { name?: unknown }[])
            .map((item) =>
              typeof item?.name === 'string' ? item.name.toLowerCase() : '',
            )
            .filter(Boolean)
        : [];
      return names.some((name) =>
        keywords.some((keyword) => name.includes(keyword)),
      );
    });
    return hit?.memberUserId || org.orgUserId;
  }

  /**
   * 补货申请（幂等）：同一仓库 + 变体已有在途补货单（待审批/已批准/收货中）就复用，
   * 否则按「补货点 − 现存」生成一张待审批采购单。
   *
   * 建单整体交给 ERP 写端口：同源未关闭单的复用判断、SKU/税率/默认供应商、当日单号流水
   * 与 `erp.purchase.created` 事件都只在 ERP 域里实现一份。原先这里是「读端口读五遍 +
   * 直写 erp_purchase_orders」，而且号源与经手人口径都和 ErpService 不一致
   * （CG- 流水一个用当日计数一个用别的窗口、`createdBy` 这里写 orgUserId、ERP 写 actorId），
   * 同一张表两套口径只会让采购台账对不上。
   */
  private async ensureReplenishment(
    org: HrmOrg,
    signal: RiskSignal,
  ): Promise<{
    orderId: number;
    orderNo: string;
    ownerUserId: string;
    created: boolean;
  } | null> {
    const stock = signal.stock;
    if (!stock) return null;
    const ownerUserId = await this.purchaserOf(org);
    const ensured = await this.erpWrites.ensureReplenishmentOrder(org, {
      warehouseId: stock.warehouseId,
      variantId: stock.variantId,
      sourceNo: `stock:${stock.warehouseId}:${stock.variantId}`,
      quantity: stock.quantity,
      reason: signal.detail,
    });
    if (!ensured) return null;
    return {
      orderId: ensured.orderId,
      orderNo: ensured.orderNo,
      ownerUserId,
      // 复用已有单据（本轮没新建）也要让派单侧知道：任务文案区分「已生成」与「沿用既有」
      created: ensured.created,
    };
  }

  async list(user: CurrentUser, query: Row) {
    const org = await this.scope.resolve(user);
    const kind = typeof query.kind === 'string' ? query.kind : '';
    const { signals, erpAvailable } = await this.collectSignals(org);
    const filtered = signals.filter((item) => !kind || item.kind === kind);
    filtered.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
    );
    const byKind = RISK_KINDS.map((key) => ({
      kind: key,
      kindLabel: RISK_KIND_LABELS[key],
      count: filtered.filter((item) => item.kind === key).length,
    }));
    const names = await this.scope.names(
      filtered.map((item) => item.ownerUserId),
    );
    return {
      scannedAt: new Date().toISOString(),
      total: filtered.length,
      high: filtered.filter((item) => item.severity === 'HIGH').length,
      // ERP 读数降级标注：页面据此提示「ERP 数据暂不可用」，其余异常照常展示。
      erpAvailable,
      byKind,
      list: filtered.slice(0, 300).map((item) => ({
        ...item,
        ownerName: names.get(item.ownerUserId) || item.ownerUserId,
      })),
    };
  }

  /** 手动触发一次扫描派单（负责人/管理员）。 */
  async runScan(user: CurrentUser) {
    const org = await this.scope.resolve(user);
    this.scope.requireAdmin(org);
    const signals = await this.dispatchRisks(org);
    return { scannedAt: new Date().toISOString(), total: signals.length };
  }

  /**
   * 结案复核（P4-6 的关闭口径）：任务侧准备关闭经营异常责任任务前调用，
   * 按当前库表现场复扫同一实体——异常仍在就拒绝关闭，不认「点完成」。
   * 组织键从派发时写在任务 description 里的行取，口径与派发完全一致。
   */
  async recheck(
    orgKey: { orgType: string; orgUserId: string },
    sourceId: string,
  ) {
    if (!orgKey.orgUserId || !sourceId) return { cleared: true, reason: '' };
    // 补货任务的完成依据是「补货申请已成立」（docs §8.4）：在途补货单存在即放行，
    // 不必等库存真的回到补货点以上（那由采购审批/入库链路推进）。
    if (sourceId.startsWith('stock:')) {
      const [, warehouseId, variantId] = sourceId.split(':');
      if (warehouseId && variantId) {
        const open = await this.erp.findReplenishmentOrder(
          {
            orgType: orgKey.orgType || 'ENTERPRISE',
            orgUserId: orgKey.orgUserId,
          },
          `stock:${warehouseId}:${variantId}`,
        );
        if (open) return { cleared: true, reason: '' };
      }
    }
    const org: HrmOrg = {
      orgType: orgKey.orgType || 'ENTERPRISE',
      orgUserId: orgKey.orgUserId,
      actorId: orgKey.orgUserId,
      isOwner: true,
      isAdmin: true,
      roles: [],
      positions: [],
      department: '',
    };
    // 结案复核按原语义直读 ERP：读失败即抛，不允许「读不到＝异常已消除」。
    const signals = (await this.collectSignals(org, { strictErp: true }))
      .signals;
    // 补货任务锚带采购单周期后缀（stock:仓库:变体:o单号），复核按信号本体匹配。
    const entityKey = sourceId.replace(/:o\d+$/, '');
    const hit = signals.find((item) => item.entityKey === entityKey);
    if (!hit) return { cleared: true, reason: '' };
    return {
      cleared: false,
      reason: `异常仍未消除：${hit.detail}`,
    };
  }
}
