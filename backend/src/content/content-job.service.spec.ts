import type { ContentJob } from '@enterprise/contracts';
import { CurrentUser } from '../auth/current-user';
import { Logger } from '../common/logger';
import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import type { AipddAssetClient } from './aipdd-asset.client';
import { ContentJobService } from './content-job.service';
import type { ContentMediaService } from './content-media.service';
import type { DigitalAssetService } from './digital-asset.service';
import type { ContentModelSettingService } from './model-setting.service';

type JobRow = {
  id: number;
  userId: string;
  tool: string;
  status: string;
  input: unknown;
  models: unknown;
  output: unknown;
  assetUrl: string;
  aipddAssetId: string;
  error: string;
  source: string;
  canvasId: number;
  nodeId: string;
  runId: string;
  media: string;
  progress: number;
  cancelReason: string;
  upstreamTaskId: string;
  upstreamAcceptedAt: Date | null;
  startedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const user = new CurrentUser('u1', 'u1', 'user');
const upstreamUrl = 'https://upstream.example/result.png';
const localUrl = 'https://oss.example/result.png';

function setup(initial: Partial<JobRow> = {}) {
  let row: JobRow = {
    id: 1,
    userId: user.userId,
    tool: 'image',
    status: 'PENDING',
    input: {},
    models: {},
    output: {},
    assetUrl: '',
    aipddAssetId: '',
    error: '',
    source: 'tool',
    canvasId: 0,
    nodeId: '',
    runId: '',
    media: 'image',
    progress: 0,
    cancelReason: '',
    upstreamTaskId: '',
    upstreamAcceptedAt: null,
    startedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...initial,
  };
  const matches = (where: Record<string, unknown>) =>
    Object.entries(where).every(([key, expected]) => {
      const actual = Reflect.get(row, key);
      return expected &&
        typeof expected === 'object' &&
        'in' in expected &&
        Array.isArray(expected.in)
        ? expected.in.includes(actual)
        : actual === expected;
    });
  const prisma = {
    contentGenerationJob: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        row = { ...row, ...data };
        return row;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (!matches(where)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      ),
      findUnique: jest.fn(async () => row),
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          matches(where) ? row : null,
      ),
    },
    digitalAssetEntry: {
      findFirst: jest.fn(
        async (): Promise<{
          aipddAssetId: number;
          url: string;
          ossKey: string;
        } | null> => null,
      ),
    },
    contentCanvasProject: {
      findUnique: jest.fn(async (): Promise<unknown> => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const editImage = jest.fn(async () => ({ url: upstreamUrl }));
  const generateVideoWithReferences = jest.fn(async () => ({
    url: upstreamUrl,
  }));
  const generateImage = jest.fn(async () => ({ url: upstreamUrl }));
  const registerDeliverable = jest.fn(
    async (): Promise<{ id: number; url: string } | null> => ({
      id: -12,
      url: localUrl,
    }),
  );
  const download = jest.fn(async () => new Uint8Array([1, 2, 3]));
  const readOwnedMedia = jest.fn(
    async (): Promise<{ bytes: Buffer; name: string } | null> => null,
  );
  const service = new ContentJobService(
    stub<PrismaService>(prisma),
    stub<ContentModelSettingService>({
      resolveTarget: jest.fn(async () => undefined),
    }),
    stub<ContentMediaService>({
      editImage,
      generateVideoWithReferences,
      generateImage,
    }),
    stub<DigitalAssetService>({ registerDeliverable, readOwnedMedia }),
    stub<AipddAssetClient>({ download }),
  );
  return {
    service,
    prisma,
    mocks: {
      editImage,
      generateVideoWithReferences,
      generateImage,
      registerDeliverable,
      download,
      readOwnedMedia,
    },
    row: () => row,
  };
}

async function enqueueAndRun(
  context: ReturnType<typeof setup>,
  body: Record<string, unknown>,
  options: Parameters<ContentJobService['enqueue']>[3] = {},
) {
  const [job] = await context.service.enqueue(user, undefined, body, options);
  expect(await context.service.claim(job.id)).toBe(true);
  context.service.start(job.id);
  for (let index = 0; index < 100 && context.service.inflight(); index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  expect(context.service.inflight()).toBe(0);
  return job;
}

describe('ContentJobService 输入与产物入库', () => {
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('image-edit 保留画布多图别名，旧小工具 image 调用仍兼容', async () => {
    const context = setup();
    const job = await enqueueAndRun(context, {
      tool: 'image-edit',
      input: {
        image: 'https://x.example/1.png',
        imageUrls: ['https://x.example/1.png', 'https://x.example/2.png'],
        prompt: '换背景',
      },
    });
    expect(job.input).toMatchObject({
      image: 'https://x.example/1.png',
      imageUrls: ['https://x.example/1.png', 'https://x.example/2.png'],
    });
    expect(context.mocks.editImage).toHaveBeenCalledWith(
      user,
      undefined,
      expect.objectContaining({
        imageUrl: 'https://x.example/1.png',
        imageUrls: ['https://x.example/1.png', 'https://x.example/2.png'],
      }),
      {},
      expect.anything(),
    );

    const legacy = setup();
    await enqueueAndRun(legacy, {
      tool: 'image-edit',
      input: { image: 'https://x.example/old.png', prompt: '去水印' },
    });
    expect(legacy.mocks.editImage).toHaveBeenCalledWith(
      user,
      undefined,
      expect.objectContaining({
        imageUrl: 'https://x.example/old.png',
        imageUrls: ['https://x.example/old.png'],
      }),
      {},
      expect.anything(),
    );

    const aliasOnly = setup();
    await enqueueAndRun(aliasOnly, {
      tool: 'image-edit',
      input: {
        imageUrls: ['https://x.example/a.png', 'https://x.example/b.png'],
        prompt: '合成',
      },
    });
    expect(aliasOnly.mocks.editImage).toHaveBeenCalledWith(
      user,
      undefined,
      expect.objectContaining({
        imageUrls: ['https://x.example/a.png', 'https://x.example/b.png'],
      }),
      {},
      expect.anything(),
    );
  });

  it('video-ref 透传图片 / 视频 / 音频类型，旧 URL 数组仍按图片处理', async () => {
    const context = setup();
    const references = [
      { type: 'image', url: 'https://x.example/ref.png' },
      { type: 'video', url: 'https://x.example/ref.mp4' },
      { type: 'audio', url: 'https://x.example/ref.mp3' },
    ];
    const job = await enqueueAndRun(context, {
      tool: 'video-ref',
      input: { prompt: '混合参考', references, duration: 5 },
    });
    expect(job.input.references).toEqual(references);
    expect(context.mocks.generateVideoWithReferences).toHaveBeenCalledWith(
      user,
      undefined,
      expect.objectContaining({ references }),
      {},
      expect.anything(),
    );

    const legacy = setup();
    await enqueueAndRun(
      legacy,
      {
        tool: 'video-ref',
        input: {
          prompt: '工作室参考图',
          references: ['https://x.example/a.png', 'https://x.example/b.png'],
          duration: 5,
        },
      },
      { source: 'studio' },
    );
    expect(legacy.mocks.generateVideoWithReferences).toHaveBeenCalledWith(
      user,
      undefined,
      expect.objectContaining({
        references: [
          { type: 'image', url: 'https://x.example/a.png' },
          { type: 'image', url: 'https://x.example/b.png' },
        ],
      }),
      {},
      expect.anything(),
    );
  });

  it('画布产物入资产失败时任务 FAILED，并保留已生成产物和可执行提示', async () => {
    const context = setup();
    context.mocks.registerDeliverable.mockResolvedValueOnce(null);
    await enqueueAndRun(
      context,
      { tool: 'image', input: { prompt: '猫' } },
      { source: 'canvas', canvasId: 8, nodeId: 'g' },
    );
    expect(context.row().status).toBe('FAILED');
    expect(context.row().assetUrl).toBe(upstreamUrl);
    expect(context.row().output).toEqual({ url: upstreamUrl });
    expect(context.row().error).toContain('产物已生成，但入资产失败');
    expect(context.row().error).toContain('重试补登记');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('产物入数字资产失败 job=1'),
    );
  });

  it('重试入资产失败只补登记原产物，不重新生成', async () => {
    const context = setup();
    context.mocks.registerDeliverable.mockResolvedValueOnce(null);
    const [job] = await context.service.enqueue(
      user,
      undefined,
      { tool: 'image', input: { prompt: '猫' } },
      { source: 'studio' },
    );
    expect(await context.service.claim(job.id)).toBe(true);
    context.service.start(job.id);
    for (let index = 0; index < 100 && context.service.inflight(); index += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(context.row().status).toBe('FAILED');

    const retried: ContentJob = await context.service.retry(
      user,
      String(job.id),
    );
    expect(retried.id).toBe(job.id);
    expect(retried.status).toBe('SUCCESS');
    expect(retried.assetUrl).toBe(localUrl);
    expect(retried.aipddAssetId).toBe('-12');
    expect(retried.error).toBe('');
    expect(context.mocks.generateImage).toHaveBeenCalledTimes(1);
    expect(context.prisma.contentGenerationJob.create).toHaveBeenCalledTimes(1);
    expect(context.mocks.registerDeliverable).toHaveBeenCalledTimes(2);
    expect(context.mocks.download).toHaveBeenCalledTimes(2);
  });

  it('已有本地资产按 URL 去重，不重复下载和入账', async () => {
    const context = setup({
      status: 'FAILED',
      source: 'canvas',
      assetUrl: localUrl,
      error: '产物已生成，但入资产失败',
    });
    context.prisma.digitalAssetEntry.findFirst.mockResolvedValueOnce({
      aipddAssetId: -12,
      url: localUrl,
      ossKey: 'enterprise/u1/canvas/result.png',
    });
    const job = await context.service.retry(user, '1');
    expect(job.status).toBe('SUCCESS');
    expect(job.aipddAssetId).toBe('-12');
    expect(context.mocks.download).not.toHaveBeenCalled();
    expect(context.mocks.registerDeliverable).not.toHaveBeenCalled();
  });

  it('上游资产编号不等于本站已入库，仍须转存并登记本地台账', async () => {
    const context = setup({ aipddAssetId: '77', source: 'studio' });
    await enqueueAndRun(
      context,
      { tool: 'image', input: { prompt: '猫' } },
      { source: 'studio' },
    );
    expect(context.row().status).toBe('SUCCESS');
    expect(context.row().aipddAssetId).toBe('-12');
    expect(context.mocks.download).toHaveBeenCalledWith(upstreamUrl);
    expect(context.mocks.registerDeliverable).toHaveBeenCalledTimes(1);
  });

  it('已有本站对象键的本地台账才按编号或 URL 去重', async () => {
    const context = setup({ aipddAssetId: '-12', source: 'studio' });
    context.prisma.digitalAssetEntry.findFirst.mockResolvedValueOnce({
      aipddAssetId: -12,
      url: localUrl,
      ossKey: 'enterprise/u1/studio/result.png',
    });
    await enqueueAndRun(
      context,
      { tool: 'image', input: { prompt: '猫' } },
      { source: 'studio' },
    );
    expect(context.row().status).toBe('SUCCESS');
    expect(context.row().aipddAssetId).toBe('-12');
    expect(context.mocks.download).not.toHaveBeenCalled();
    expect(context.mocks.registerDeliverable).not.toHaveBeenCalled();
  });

  it('画布结果回写失败记录 error 日志，不把已入库任务改成失败', async () => {
    const context = setup();
    context.prisma.contentCanvasProject.findUnique.mockResolvedValueOnce({
      doc: {
        version: 1,
        nodes: [
          {
            id: 'g',
            type: 'generate',
            x: 0,
            y: 0,
            width: 280,
            data: {
              kind: 'generate',
              media: 'image',
              prompt: '猫',
              channelId: 0,
              channelName: '',
              model: '',
              count: 1,
              refs: [],
              results: [],
              lastRunId: '',
            },
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      version: 3,
      userId: user.userId,
    });
    context.prisma.contentCanvasProject.updateMany.mockRejectedValueOnce(
      new Error('数据库写回失败'),
    );
    await enqueueAndRun(
      context,
      { tool: 'image', input: { prompt: '猫' } },
      { source: 'canvas', canvasId: 8, nodeId: 'g' },
    );
    expect(context.row().status).toBe('SUCCESS');
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('画布节点结果回写失败 job=1 canvasId=8 nodeId=g'),
    );
  });
});

describe('ContentJobService 产物下载', () => {
  it('已成功任务优先回读本人自有 OSS 字节', async () => {
    const context = setup({ status: 'SUCCESS', assetUrl: localUrl });
    const bytes = Buffer.from([9, 8, 7]);
    context.mocks.readOwnedMedia.mockResolvedValueOnce({
      bytes,
      name: 'result.png',
    });
    await expect(context.service.download(user, '1')).resolves.toEqual({
      bytes,
      name: 'result.png',
      url: localUrl,
    });
    expect(context.mocks.readOwnedMedia).toHaveBeenCalledWith(user, localUrl);
    expect(context.mocks.download).not.toHaveBeenCalled();
  });

  it('老产物只有上游直链时按直链代取，且带大小上限', async () => {
    const context = setup({ status: 'SUCCESS', assetUrl: upstreamUrl });
    const bytes = new Uint8Array([1, 2, 3]);
    context.mocks.download.mockResolvedValueOnce(bytes);
    await expect(context.service.download(user, '1')).resolves.toEqual({
      bytes: Buffer.from(bytes),
      name: '',
      url: upstreamUrl,
    });
    expect(context.mocks.download).toHaveBeenCalledWith(
      upstreamUrl,
      100 * 1024 * 1024,
    );
  });

  it('不能下载别人的任务', async () => {
    const context = setup({ status: 'SUCCESS', assetUrl: upstreamUrl });
    const other = new CurrentUser('u2', 'u2', 'user');
    await expect(context.service.download(other, '1')).rejects.toThrow(
      '任务不存在',
    );
    expect(context.mocks.readOwnedMedia).not.toHaveBeenCalled();
    expect(context.mocks.download).not.toHaveBeenCalled();
  });

  it('任务未完成时不允许下载', async () => {
    const context = setup({ status: 'RUNNING', assetUrl: upstreamUrl });
    await expect(context.service.download(user, '1')).rejects.toThrow(
      '任务还没完成',
    );
    expect(context.mocks.readOwnedMedia).not.toHaveBeenCalled();
    expect(context.mocks.download).not.toHaveBeenCalled();
  });

  it('任务没有产物 URL 时给出明确错误', async () => {
    const context = setup({ status: 'SUCCESS', assetUrl: '' });
    await expect(context.service.download(user, '1')).rejects.toThrow(
      '没有可下载的产物',
    );
    expect(context.mocks.readOwnedMedia).not.toHaveBeenCalled();
    expect(context.mocks.download).not.toHaveBeenCalled();
  });
});
