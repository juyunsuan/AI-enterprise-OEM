import { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { TaskCenterService } from '../task-center/task-center.service';
import { stub } from '../../test/doubles';
import { buildWorkflowCatalog } from './workflow-catalog';
import { WorkflowEngine } from './workflow-engine';
import type { WorkflowRuntime } from './workflow.types';

/**
 * N15=A：工作流里的浏览器步骤复用契约 `action` 节点（零新节点）。
 * `RpaChrome_*`（含发起会话 / 查进展 / 暂停 / 停止 / 重试）本来就是契约端点，
 * 自动出现在节点面板里；这里把「目录派生 + 引擎派发 + 浏览器动作计入预算」钉成不变量，
 * 免得哪天契约侧一改，工作流的浏览器步骤悄悄断掉。
 */
const ACTOR = new CurrentUser('u1', '测试员', 'member');

function node(seed: {
  id: string;
  type: string;
  kind: string;
  name?: string;
  operationId?: string;
  params?: Record<string, unknown>;
  config?: Record<string, unknown>;
}) {
  return {
    name: '',
    operationId: '',
    params: {},
    position: { x: 0, y: 0 },
    config: {},
    ...seed,
  };
}

function edge(id: string, source: string, target: string) {
  return {
    id,
    source,
    target,
    sourceHandle: '',
    targetHandle: '',
    mapping: {},
  };
}

type StepLike = {
  id: number;
  runId: number;
  nodeId: string;
  nodeType: string;
  status: string;
  output: unknown;
  error: string;
  attempts: number;
  durationMs: number;
};

function build(
  nodes: ReturnType<typeof node>[],
  edges: ReturnType<typeof edge>[],
  runtime: WorkflowRuntime,
) {
  const runRow: Record<string, unknown> = {
    id: 7,
    workflowId: 1,
    version: 1,
    trigger: 'MANUAL',
    status: 'PENDING',
    input: {},
    output: {},
    actorId: ACTOR.userId,
    error: '',
    sourceType: '',
    sourceId: '',
    dedupeKey: null,
    budgets: {},
    usage: {},
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-11-10T00:00:00.000Z'),
  };
  const stepRows: StepLike[] = [];
  const prisma = stub<PrismaService>({
    workflowRun: {
      findUnique: jest.fn(() => Promise.resolve({ ...runRow })),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(runRow, data);
        return Promise.resolve({ ...runRow });
      }),
    },
    workflowVersion: {
      findFirst: jest.fn(() => Promise.resolve({ graph: { nodes, edges } })),
    },
    workflowRunStep: {
      findMany: jest.fn(() => Promise.resolve(stepRows)),
      findFirst: jest.fn(({ where }: { where: { nodeId: string } }) =>
        Promise.resolve(
          stepRows.find((step) => step.nodeId === where.nodeId) ?? null,
        ),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: stepRows.length + 1, ...data } as StepLike;
        stepRows.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: number };
          data: Record<string, unknown>;
        }) => {
          const row = stepRows.find((item) => item.id === where.id)!;
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
    },
  });
  const engine = new WorkflowEngine(prisma, stub<TaskCenterService>({}));
  engine.setRuntime(runtime);
  return {
    engine,
    runRow,
    stepOf: (nodeId: string) => stepRows.find((step) => step.nodeId === nodeId),
  };
}

describe('工作流浏览器步骤（N15=A）', () => {
  it('节点目录按契约派生：浏览器 / RPA 动作以中文名出现在「RPA自动化」组里', () => {
    const specs = buildWorkflowCatalog({});
    const start = specs.find((spec) => spec.key === 'RpaChrome_startSession');
    expect(start).toMatchObject({
      kind: 'action',
      name: '发起浏览器自动操作',
      group: 'RPA自动化',
      write: true,
    });
    const devices = specs.find((spec) => spec.key === 'RpaChrome_devices');
    expect(devices).toMatchObject({
      kind: 'action',
      name: '查看本地 Chrome 设备',
      write: false,
    });
  });

  it('发起浏览器会话：参数进 body，按发起人身份走内部自执行器，并计入浏览器动作预算', async () => {
    const runOperation = jest.fn(async () => ({
      status: 200,
      code: 0,
      message: 'ok',
      data: { session: { id: 12 } },
    }));
    const ctx = build(
      [
        node({ id: 'n0', type: 'trigger', kind: 'trigger.manual' }),
        node({
          id: 'n1',
          type: 'action',
          kind: 'RpaChrome_startSession',
          params: { clientId: 'dev-1', goal: '把列表第一页采下来' },
        }),
      ],
      [edge('e1', 'n0', 'n1')],
      { runOperation },
    );

    await ctx.engine.start(7, ACTOR);

    const call = runOperation.mock.calls[0] as unknown[];
    expect(call[0]).toBe(ACTOR);
    expect(call[1]).toBe('wf-7-n1');
    expect(call[2]).toBe('RpaChrome_startSession');
    expect(call[3]).toMatchObject({
      body: { clientId: 'dev-1', goal: '把列表第一页采下来' },
    });
    expect(ctx.runRow.status).toBe('DONE');
    expect(ctx.runRow.usage).toMatchObject({ browserActions: 1 });
  });

  it('浏览器动作失败（HTTP 5xx）默认让节点失败，allowFailure 时才放行', async () => {
    const runOperation = jest.fn(async () => ({
      status: 500,
      code: 1,
      message: '设备离线',
      data: null,
    }));
    const failing = build(
      [
        node({ id: 'n0', type: 'trigger', kind: 'trigger.manual' }),
        node({ id: 'n1', type: 'action', kind: 'RpaChrome_startSession' }),
      ],
      [edge('e1', 'n0', 'n1')],
      { runOperation },
    );
    await failing.engine.start(7, ACTOR);
    expect(failing.stepOf('n1')?.status).toBe('FAILED');
    expect(failing.runRow.status).toBe('FAILED');

    const tolerated = build(
      [
        node({ id: 'n0', type: 'trigger', kind: 'trigger.manual' }),
        node({
          id: 'n1',
          type: 'action',
          kind: 'RpaChrome_startSession',
          config: { allowFailure: true },
        }),
      ],
      [edge('e1', 'n0', 'n1')],
      { runOperation },
    );
    await tolerated.engine.start(7, ACTOR);
    expect(tolerated.stepOf('n1')?.status).toBe('DONE');
  });
});
