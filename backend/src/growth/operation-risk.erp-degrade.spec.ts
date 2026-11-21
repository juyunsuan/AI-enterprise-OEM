import { CurrentUser } from '../auth/current-user';
import type { HrmOrg, HrmScopeService } from '../hrm/hrm.scope';
import type { MechanismService } from '../mechanisms/mechanism.service';
import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { OUTBOX_POLICY } from '../commerce-core/outbox-policy';
import { noopErpPort } from '../erp/erp-port';
import type { ErpPort } from '../erp/erp-port';
import { OperationRiskService } from './operation-risk.service';

/**
 * ERP 故障不拖垮增长雷达：
 * - 页面口径（list/dispatchRisks）下 ERP 抛错或超时都降级为空态，
 *   项目/任务类异常照常返回，并用 erpAvailable=false 标注「ERP 数据暂不可用」；
 * - 超时必须有界：慢实现（>timeout）时调用方拿降级值返回，而不是挂住；
 * - 结案复核（recheck）保持原语义：ERP 读失败要抛，绝不把「读不到」判成「异常已消除」。
 */

const org: HrmOrg = {
  orgType: 'ENTERPRISE',
  orgUserId: 'ent-1',
  actorId: 'ent-1',
  isOwner: true,
  isAdmin: true,
  roles: [],
  positions: [],
  department: '',
};
const user = new CurrentUser('ent-1', '老板', 'owner');

const overBudgetProjects = [
  { id: 10, name: '项目 X', ownerId: 'pm-1', budgetAmount: 1000 },
];

function prismaStub() {
  return stub<PrismaService>({
    pjProject: { findMany: jest.fn(async () => overBudgetProjects) },
    pjCostItem: {
      groupBy: jest.fn(
        async () => [{ projectId: 10, _sum: { amount: 1300 } }] as object[],
      ),
    },
    pjTask: { findMany: jest.fn(async () => []) },
  });
}

function scopeStub(): HrmScopeService {
  return stub<HrmScopeService>({
    resolve: jest.fn(async () => org),
    requireAdmin: jest.fn(),
    names: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, id]))),
  });
}

function build(erp: ErpPort) {
  return new OperationRiskService(
    prismaStub(),
    scopeStub(),
    stub<MechanismService>({ dispatch: jest.fn(async () => undefined) }),
    { assign: jest.fn(async () => null) },
    erp,
  );
}

describe('OperationRiskService × ERP 读侧降级', () => {
  it('ERP 抛错时增长雷达仍返回项目/任务异常，并标注 ERP 暂不可用', async () => {
    const failing = stub<ErpPort>({
      ...noopErpPort,
      listOverdueReceivables: async () => {
        throw new Error('ERP 库不可用');
      },
      listOverduePayables: async () => {
        throw new Error('ERP 库不可用');
      },
      listStock: async () => {
        throw new Error('ERP 库不可用');
      },
      listVariants: async () => {
        throw new Error('ERP 库不可用');
      },
      listVendors: async () => {
        throw new Error('ERP 库不可用');
      },
    });
    const service = build(failing);
    const result = await service.list(user, {});
    expect(result.erpAvailable).toBe(false);
    // ERP 类异常按空态计 0，项目超预算异常（ pj 库）照常。
    expect(result.total).toBe(1);
    const budget = result.byKind.find(
      (item: { kind: string }) => item.kind === 'PROJECT_OVER_BUDGET',
    );
    expect(budget?.count).toBe(1);
    const receivable = result.byKind.find(
      (item: { kind: string }) => item.kind === 'RECEIVABLE_OVERDUE',
    );
    expect(receivable?.count).toBe(0);
  });

  it('ERP 慢实现（超过桥超时）不挂住主链路：超时到点即拿降级空态返回', async () => {
    const hanging = stub<ErpPort>({
      ...noopErpPort,
      // 永不 resolve 的实现：只有 withBridgeTimeout 的定时器能让调用方脱身。
      listOverdueReceivables: () => new Promise(() => undefined),
      listOverduePayables: () => new Promise(() => undefined),
      listStock: () => new Promise(() => undefined),
    });
    const service = build(hanging);
    jest.useFakeTimers();
    try {
      const pending = service.list(user, {});
      let settled = false;
      const tracked = pending.then((value) => {
        settled = true;
        return value;
      });
      await jest.advanceTimersByTimeAsync(OUTBOX_POLICY.timeoutMs + 50);
      const result = await tracked;
      // 断言：超时不阻断——定时器到点就返回降级值，而不是继续挂起。
      expect(settled).toBe(true);
      expect(result.erpAvailable).toBe(false);
      expect(result.total).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('结案复核（strict）不因降级误判：ERP 读失败照常抛出', async () => {
    const failing = stub<ErpPort>({
      ...noopErpPort,
      listOverdueReceivables: async () => {
        throw new Error('ERP 库不可用');
      },
      listOverduePayables: async () => {
        throw new Error('ERP 库不可用');
      },
      listStock: async () => {
        throw new Error('ERP 库不可用');
      },
    });
    const service = build(failing);
    await expect(service.recheck(org, 'receivable:1')).rejects.toThrow(
      'ERP 库不可用',
    );
  });
});
