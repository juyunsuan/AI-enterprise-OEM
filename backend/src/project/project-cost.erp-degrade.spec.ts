import { CurrentUser } from '../auth/current-user';
import type { HrmOrg, HrmScopeService } from '../hrm/hrm.scope';
import type { MechanismService } from '../mechanisms/mechanism.service';
import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { OUTBOX_POLICY } from '../commerce-core/outbox-policy';
import { noopErpPort } from '../erp/erp-port';
import type { ErpPort } from '../erp/erp-port';
import { ProjectCostService } from './project-cost.service';

/**
 * ERP 故障不拖垮项目成本页：采购单 ↔ 应付对账的读数全部走 ErpPort，
 * 抛错或超时都降级为空列表 + erpAvailable=false（「ERP 数据暂不可用」），
 * 接口不整页 500；超时必须有界（慢实现到点返回，不挂住请求）。
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

function build(erp: ErpPort) {
  return new ProjectCostService(
    stub<PrismaService>({}),
    stub<HrmScopeService>({
      resolve: jest.fn(async () => org),
      requireAdmin: jest.fn(),
    }),
    stub<MechanismService>({ dispatch: jest.fn(async () => undefined) }),
    erp,
  );
}

describe('ProjectCostService × ERP 读侧降级', () => {
  it('ERP 抛错时对账页返回空态而不是整页报错', async () => {
    const failing = stub<ErpPort>({
      ...noopErpPort,
      listPurchaseOrdersForReconcile: async () => {
        throw new Error('ERP 库不可用');
      },
      listPurchaseOrderPayables: async () => {
        throw new Error('ERP 库不可用');
      },
      listVendors: async () => {
        throw new Error('ERP 库不可用');
      },
    });
    const result = await build(failing).purchaseReconciliation(user, {});
    expect(result.erpAvailable).toBe(false);
    expect(result.list).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('ERP 慢实现（超过桥超时）不挂住主链路：超时到点即拿降级空态返回', async () => {
    const hanging = stub<ErpPort>({
      ...noopErpPort,
      listPurchaseOrdersForReconcile: () => new Promise(() => undefined),
      listPurchaseOrderPayables: () => new Promise(() => undefined),
      listVendors: () => new Promise(() => undefined),
    });
    const service = build(hanging);
    jest.useFakeTimers();
    try {
      const pending = service.purchaseReconciliation(user, {});
      let settled = false;
      const tracked = pending.then((value) => {
        settled = true;
        return value;
      });
      // 对账页有「先并行、后续接供应商名」两段读数，各需一轮超时：推进两轮桥超时。
      for (let wave = 0; wave < 3 && !settled; wave += 1) {
        await jest.advanceTimersByTimeAsync(OUTBOX_POLICY.timeoutMs + 50);
      }
      const result = await tracked;
      // 断言：超时不阻断——定时器到点就返回降级值，而不是继续挂起。
      expect(settled).toBe(true);
      expect(result.erpAvailable).toBe(false);
      expect(result.list).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
