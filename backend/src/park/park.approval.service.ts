import {
  PARK_STAFF_ROLES,
  type ParkApproval,
  type ParkApprovalDetail,
  type ParkApprovalFlow,
  type ParkApprovalFlowInput,
  type ParkApprovalNode,
  type ParkStaffRole,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import {
  approvalBizLabel,
  approvalStatusLabel,
  clip,
  integer,
  iso,
  jsonList,
  pageArgs,
} from './park.helpers';
import type { ParkSiteService } from './park.site.service';

type ApprovalRow = Prisma.ParkApprovalGetPayload<object>;
type TaskRow = Prisma.ParkApprovalTaskGetPayload<object>;
type LogRow = Prisma.ParkApprovalLogGetPayload<object>;
type FlowRow = Prisma.ParkApprovalFlowGetPayload<object>;

type Actor = { type: 'STAFF' | 'CUSTOMER'; id: number };

const staffRoleOf = (value: unknown): ParkStaffRole =>
  PARK_STAFF_ROLES.includes(value as ParkStaffRole)
    ? (value as ParkStaffRole)
    : 'APPROVER';

const nodeList = (value: unknown): ParkApprovalNode[] =>
  jsonList(value)
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      return {
        name: clip(row.name, 60) || '审批',
        approverType:
          row.approverType === 'TENANT_ADMIN' ? 'TENANT_ADMIN' : 'STAFF',
        role: staffRoleOf(row.role),
        staffIds: jsonList(row.staffIds)
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
        mode:
          row.mode === 'ALL' || row.mode === 'SEQUENTIAL' ? row.mode : 'ANY',
      } satisfies ParkApprovalNode;
    })
    .filter((item): item is ParkApprovalNode => Boolean(item));

const approvalView = (row: ApprovalRow): ParkApproval => ({
  id: row.id,
  siteId: row.siteId,
  bizType: row.bizType as ParkApproval['bizType'],
  bizLabel: approvalBizLabel(row.bizType),
  bizId: row.bizId,
  title: row.title,
  applicantType: row.applicantType,
  applicantName: row.applicantName,
  tenantId: row.tenantId,
  status: row.status as ParkApproval['status'],
  statusLabel: approvalStatusLabel(row.status),
  currentNode: row.currentNode,
  submittedAt: iso(row.submittedAt),
  createdAt: iso(row.createdAt),
});

const flowView = (row: FlowRow): ParkApprovalFlow => ({
  id: row.id,
  siteId: row.siteId,
  bizType: row.bizType as ParkApprovalFlow['bizType'],
  bizLabel: approvalBizLabel(row.bizType),
  name: row.name,
  nodes: nodeList(row.nodes),
  enabled: row.enabled,
  version: row.version,
  updatedAt: iso(row.updatedAt),
});

/**
 * 园区审批：只读写 park_approval_*，不落 OA。
 *
 * OA 的申请人/审批人都是站内成员，园区外部用户没有站内账号；
 * 因此外部申请走本引擎，只有园区内部人员发起的审批才由 OA 桥接（后续按需接入）。
 */
export class ParkApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
  ) {}

  async flow(user: CurrentUser, siteId: number, bizType: string) {
    await this.sites.requireSite(user, siteId);
    const row = await this.prisma.parkApprovalFlow.findUnique({
      where: { siteId_bizType: { siteId, bizType } },
    });
    return row ? flowView(row) : null;
  }

  async saveFlow(user: CurrentUser, body: ParkApprovalFlowInput) {
    await this.sites.requireSite(user, body.siteId);
    if (!body.nodes.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '至少配置一个审批节点',
      );
    }
    const nodes = body.nodes.map((node) => ({
      name: clip(node.name, 60) || '审批',
      approverType: node.approverType,
      role: node.role,
      staffIds: node.staffIds,
      mode: node.mode,
    }));
    const existing = await this.prisma.parkApprovalFlow.findUnique({
      where: {
        siteId_bizType: { siteId: body.siteId, bizType: body.bizType },
      },
    });
    const row = existing
      ? await this.prisma.parkApprovalFlow.update({
          where: { id: existing.id },
          data: {
            name: clip(body.name, 80),
            nodes: nodes,
            enabled: Boolean(body.enabled),
            version: existing.version + 1,
          },
        })
      : await this.prisma.parkApprovalFlow.create({
          data: {
            siteId: body.siteId,
            bizType: body.bizType,
            name: clip(body.name, 80),
            nodes: nodes,
            enabled: Boolean(body.enabled),
          },
        });
    return flowView(row);
  }

  async create(input: {
    siteId: number;
    bizType: string;
    bizId: number;
    title: string;
    applicantType: 'CUSTOMER' | 'STAFF';
    applicantId: number;
    applicantName: string;
    tenantId?: number;
    formData?: Record<string, unknown>;
  }): Promise<ApprovalRow> {
    const flow = await this.prisma.parkApprovalFlow.findUnique({
      where: {
        siteId_bizType: { siteId: input.siteId, bizType: input.bizType },
      },
    });
    const nodes: ParkApprovalNode[] =
      flow && flow.enabled
        ? nodeList(flow.nodes)
        : [
            {
              name: '园区审批',
              approverType: 'STAFF',
              role: 'OWNER',
              staffIds: [],
              mode: 'ANY',
            },
          ];
    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.parkApproval.create({
        data: {
          siteId: input.siteId,
          bizType: input.bizType,
          bizId: input.bizId,
          title: clip(input.title, 160),
          applicantType: input.applicantType,
          applicantId: input.applicantId,
          applicantName: clip(input.applicantName, 60),
          tenantId: input.tenantId || 0,
          formData: (input.formData || {}) as Prisma.InputJsonValue,
          flowSnapshot: nodes,
          status: 'APPROVING',
          currentNode: 0,
          submittedAt: new Date(),
        },
      });
      await tx.parkApprovalLog.create({
        data: {
          approvalId: approval.id,
          action: 'SUBMIT',
          operatorType: input.applicantType,
          operatorId: input.applicantId,
          operatorName: clip(input.applicantName, 60),
          comment: '',
        },
      });
      const created = await this.openNode(tx, approval, nodes, 0);
      return created;
    });
  }

  private async openNode(
    tx: Prisma.TransactionClient,
    approval: ApprovalRow,
    nodes: ParkApprovalNode[],
    index: number,
  ): Promise<ApprovalRow> {
    let cursor = index;
    while (cursor < nodes.length) {
      const node = nodes[cursor];
      const approvers = await this.resolveApprovers(
        tx,
        approval.siteId,
        node,
        approval.tenantId,
      );
      if (!approvers.length) {
        await tx.parkApprovalLog.create({
          data: {
            approvalId: approval.id,
            action: 'SKIP',
            operatorType: 'SYSTEM',
            operatorId: 0,
            operatorName: '系统',
            comment: `节点「${node.name}」无可用审批人，已跳过`,
          },
        });
        cursor += 1;
        continue;
      }
      await tx.parkApprovalTask.createMany({
        data: approvers.map((approver) => ({
          approvalId: approval.id,
          nodeIndex: cursor,
          nodeName: node.name,
          approverType: approver.type,
          approverId: approver.id,
          status: 'PENDING',
        })),
      });
      return tx.parkApproval.update({
        where: { id: approval.id },
        data: { currentNode: cursor },
      });
    }
    return tx.parkApproval.update({
      where: { id: approval.id },
      data: {
        status: 'APPROVED',
        currentNode: nodes.length,
        finishedAt: new Date(),
      },
    });
  }

  private async resolveApprovers(
    tx: Prisma.TransactionClient,
    siteId: number,
    node: ParkApprovalNode,
    tenantId: number,
  ): Promise<Actor[]> {
    if (node.approverType === 'TENANT_ADMIN') {
      if (!tenantId) return [];
      const rows = await tx.parkCustomer.findMany({
        where: {
          siteId,
          tenantId,
          memberRole: 'TENANT_ADMIN',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      return rows.map((row) => ({ type: 'CUSTOMER' as const, id: row.id }));
    }
    const staff = node.staffIds.length
      ? await tx.parkStaff.findMany({
          where: {
            siteId,
            id: { in: node.staffIds },
            status: 'ACTIVE',
          },
          select: { id: true },
        })
      : await tx.parkStaff.findMany({
          where: {
            siteId,
            status: 'ACTIVE',
            role: node.role,
          },
          select: { id: true },
        });
    if (staff.length) {
      return staff.map((row) => ({ type: 'STAFF' as const, id: row.id }));
    }
    const owner = await tx.parkStaff.findFirst({
      where: { siteId, status: 'ACTIVE', role: 'OWNER' },
      select: { id: true },
    });
    return owner ? [{ type: 'STAFF' as const, id: owner.id }] : [];
  }

  /** 员工端操作前先按园区归属校验，避免跨园区审批单被误操作。 */
  async own(approvalId: number, siteId: number) {
    const row = await this.prisma.parkApproval.findUnique({
      where: { id: approvalId },
    });
    if (!row || row.siteId !== siteId) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '审批单不存在');
    }
    return row;
  }

  async act(
    actor: Actor,
    approvalId: number,
    action: 'approve' | 'reject' | 'withdraw',
    comment = '',
  ): Promise<ApprovalRow> {
    const approval = await this.prisma.parkApproval.findUnique({
      where: { id: approvalId },
    });
    if (!approval) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '审批单不存在');
    }
    if (approval.status !== 'APPROVING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该审批单已结束');
    }
    if (action === 'withdraw') {
      if (
        approval.applicantType !== actor.type ||
        approval.applicantId !== actor.id
      ) {
        throw new BusinessException(
          ErrorCode.FORBIDDEN,
          '只能撤回自己提交的申请',
        );
      }
      return this.prisma.$transaction(async (tx) => {
        await tx.parkApprovalTask.updateMany({
          where: { approvalId: approval.id, status: 'PENDING' },
          data: { status: 'SKIPPED' },
        });
        const updated = await tx.parkApproval.update({
          where: { id: approval.id },
          data: {
            status: 'WITHDRAWN',
            finishedAt: new Date(),
          },
        });
        await tx.parkApprovalLog.create({
          data: {
            approvalId: approval.id,
            action: 'WITHDRAW',
            operatorType: actor.type,
            operatorId: actor.id,
            operatorName: '',
            comment: clip(comment, 500),
          },
        });
        return updated;
      });
    }
    const task = await this.prisma.parkApprovalTask.findFirst({
      where: {
        approvalId: approval.id,
        nodeIndex: approval.currentNode,
        approverType: actor.type,
        approverId: actor.id,
        status: 'PENDING',
      },
    });
    if (!task) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '当前节点没有你的待办，或你已处理过',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.parkApprovalTask.update({
        where: { id: task.id },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          action,
          comment: clip(comment, 500),
          actedAt: new Date(),
        },
      });
      await tx.parkApprovalLog.create({
        data: {
          approvalId: approval.id,
          action: action === 'approve' ? 'APPROVE' : 'REJECT',
          operatorType: actor.type,
          operatorId: actor.id,
          operatorName: '',
          comment: clip(comment, 500),
        },
      });
      if (action === 'reject') {
        await tx.parkApprovalTask.updateMany({
          where: { approvalId: approval.id, status: 'PENDING' },
          data: { status: 'SKIPPED' },
        });
        return tx.parkApproval.update({
          where: { id: approval.id },
          data: { status: 'REJECTED', finishedAt: new Date() },
        });
      }
      const nodes = nodeList(approval.flowSnapshot);
      const node = nodes[approval.currentNode];
      const current = await tx.parkApprovalTask.findMany({
        where: { approvalId: approval.id, nodeIndex: approval.currentNode },
      });
      const pending = current.filter((item) => item.status === 'PENDING');
      const allApproved = current.every((item) => item.status === 'APPROVED');
      const nodeDone =
        node?.mode === 'ANY' ? true : pending.length === 0 && allApproved;
      if (!nodeDone) {
        return tx.parkApproval.findUniqueOrThrow({
          where: { id: approval.id },
        });
      }
      if (node?.mode === 'ANY') {
        await tx.parkApprovalTask.updateMany({
          where: {
            approvalId: approval.id,
            nodeIndex: approval.currentNode,
            status: 'PENDING',
          },
          data: { status: 'SKIPPED' },
        });
      }
      return this.openNode(tx, approval, nodes, approval.currentNode + 1);
    });
  }

  /** 管理端代审：园区管理员在后台直接通过/驳回，仍写审批日志。 */
  async adminAct(
    user: CurrentUser,
    approvalId: number,
    action: 'approve' | 'reject' | 'withdraw',
    comment = '',
  ): Promise<ApprovalRow> {
    const approval = await this.prisma.parkApproval.findUnique({
      where: { id: approvalId },
    });
    if (!approval) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '审批单不存在');
    }
    await this.sites.requireSite(user, approval.siteId);
    if (approval.status !== 'APPROVING') {
      throw new BusinessException(ErrorCode.CONFLICT, '该审批单已结束');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.parkApprovalTask.updateMany({
        where: { approvalId: approval.id, status: 'PENDING' },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'SKIPPED',
          action: action === 'approve' ? 'approve' : 'reject',
          comment: clip(comment, 500),
          actedAt: new Date(),
        },
      });
      await tx.parkApprovalLog.create({
        data: {
          approvalId: approval.id,
          action: action === 'approve' ? 'APPROVE' : 'REJECT',
          operatorType: 'ADMIN',
          operatorId: 0,
          operatorName: user.actorUserId || user.userId,
          comment: clip(comment, 500),
        },
      });
      return tx.parkApproval.update({
        where: { id: approval.id },
        data: {
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          finishedAt: new Date(),
        },
      });
    });
  }

  async list(user: CurrentUser, query: Record<string, unknown>) {
    const siteId = integer(query.siteId, 0);
    await this.sites.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const bizType = clip(query.bizType, 24);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const where: Prisma.ParkApprovalWhereInput = {
      siteId,
      ...(bizType ? { bizType } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { title: { contains: keyword } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.parkApproval.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.parkApproval.count({ where }),
    ]);
    return { list: rows.map(approvalView), total, page, pageSize };
  }

  async detail(user: CurrentUser, id: number): Promise<ParkApprovalDetail> {
    const row = await this.prisma.parkApproval.findUnique({ where: { id } });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '审批单不存在');
    }
    await this.sites.requireSite(user, row.siteId);
    const [tasks, logs] = await Promise.all([
      this.prisma.parkApprovalTask.findMany({
        where: { approvalId: row.id },
        orderBy: [{ nodeIndex: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.parkApprovalLog.findMany({
        where: { approvalId: row.id },
        orderBy: { id: 'asc' },
      }),
    ]);
    const staffIds = tasks
      .filter((item) => item.approverType === 'STAFF')
      .map((item) => item.approverId);
    const customerIds = tasks
      .filter((item) => item.approverType === 'CUSTOMER')
      .map((item) => item.approverId);
    const [staff, customers] = await Promise.all([
      staffIds.length
        ? this.prisma.parkStaff.findMany({
            where: { siteId: row.siteId, id: { in: staffIds } },
            select: { id: true, name: true },
          })
        : [],
      customerIds.length
        ? this.prisma.parkCustomer.findMany({
            where: { siteId: row.siteId, id: { in: customerIds } },
            select: { id: true, nickname: true },
          })
        : [],
    ]);
    const staffNames = new Map(staff.map((item) => [item.id, item.name]));
    const customerNames = new Map(
      customers.map((item) => [item.id, item.nickname]),
    );
    return {
      ...approvalView(row),
      formData:
        row.formData &&
        typeof row.formData === 'object' &&
        !Array.isArray(row.formData)
          ? row.formData
          : {},
      tasks: tasks.map((item: TaskRow) => ({
        id: item.id,
        nodeIndex: item.nodeIndex,
        nodeName: item.nodeName,
        approverType: item.approverType,
        approverId: item.approverId,
        approverName:
          item.approverType === 'STAFF'
            ? staffNames.get(item.approverId) || ''
            : customerNames.get(item.approverId) || '',
        status: item.status,
        action: item.action,
        comment: item.comment,
        actedAt: iso(item.actedAt),
      })),
      logs: logs.map((item: LogRow) => ({
        id: item.id,
        action: item.action,
        operatorName: item.operatorName,
        comment: item.comment,
        createdAt: iso(item.createdAt),
      })),
    };
  }

  async pendingForStaff(siteId: number, staffId: number) {
    const tasks = await this.prisma.parkApprovalTask.findMany({
      where: {
        approverType: 'STAFF',
        approverId: staffId,
        status: 'PENDING',
      },
      orderBy: { id: 'asc' },
    });
    if (!tasks.length) return [];
    const approvals = await this.prisma.parkApproval.findMany({
      where: {
        siteId,
        id: { in: tasks.map((item) => item.approvalId) },
        status: 'APPROVING',
      },
    });
    const byId = new Map(approvals.map((item) => [item.id, item]));
    return tasks
      .map((task) => {
        const approval = byId.get(task.approvalId);
        if (!approval || approval.currentNode !== task.nodeIndex) return null;
        return {
          ...approvalView(approval),
          taskId: task.id,
          nodeName: task.nodeName,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async pendingForCustomer(siteId: number, customerId: number) {
    const tasks = await this.prisma.parkApprovalTask.findMany({
      where: {
        approverType: 'CUSTOMER',
        approverId: customerId,
        status: 'PENDING',
      },
      orderBy: { id: 'asc' },
    });
    if (!tasks.length) return [];
    const approvals = await this.prisma.parkApproval.findMany({
      where: {
        siteId,
        id: { in: tasks.map((item) => item.approvalId) },
        status: 'APPROVING',
      },
    });
    const byId = new Map(approvals.map((item) => [item.id, item]));
    return tasks
      .map((task) => {
        const approval = byId.get(task.approvalId);
        if (!approval || approval.currentNode !== task.nodeIndex) return null;
        return {
          ...approvalView(approval),
          taskId: task.id,
          nodeName: task.nodeName,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }
}
