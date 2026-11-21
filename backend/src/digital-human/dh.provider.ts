import type { DhChannelProtocol } from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { httpRequest } from '../http/transport';
import { clip } from './dh.shared';

/**
 * 数字人供应商协议适配层（参考「AI 数字人分身系统」extend/FoxVoice|FoxLipsync 重写）。
 *
 * 统一为「异步任务」模型：提交返回 providerTaskId，完成走 webhook
 * （回调 URL 带本站 callbackToken 定位任务）+ 主动查询兜底（fox/custom 支持）。
 * 三协议差异都收在本文件：
 * - fox：api.workai.cc/api/v1，`Authorization: <key>`，响应 `{errno, message, data}`；
 * - synclabs：lipsync 代理，`x-api-key` 头，错误用 `errorMessage` 字段；TTS 为同步返回；
 * - custom：自定义网关约定（POST {base}/submit、GET {base}/status?task_id=，Bearer 鉴权），
 *   响应按 `{task_id, status, result_url, demo_url, error}` 宽容解析。
 */

export type DhTaskKind = 'voice-clone' | 'body-train' | 'tts' | 'lipsync';

export type ProviderRuntime = {
  protocol: DhChannelProtocol;
  baseUrl: string;
  apiKey: string;
  modelTier: string;
};

export const PROVIDER_DEFAULT_BASE_URL: Record<string, string> = {
  fox: 'https://api.workai.cc/api/v1',
  synclabs: 'https://lipsync.api.workai.cc',
  custom: '',
};

/** 任务终态：0 进行中 | 2 成功 | 3 失败（与 DigitalHumanTask.status 对齐）。 */
export type ProviderOutcome = {
  providerTaskId: string;
  /** 同步型能力（synclabs TTS）提交即完成。 */
  finished: boolean;
  status: number;
  resultUrl: string;
  demoUrl: string;
  /** 供应商回填的音色/人物标识（speaker_id / subject_id / voice id）。 */
  externalId: string;
  error: string;
};

const PENDING = 1;

function emptyOutcome(providerTaskId: string): ProviderOutcome {
  return {
    providerTaskId,
    finished: false,
    status: PENDING,
    resultUrl: '',
    demoUrl: '',
    externalId: '',
    error: '',
  };
}

function baseOf(rt: ProviderRuntime): string {
  const base = (
    rt.baseUrl ||
    PROVIDER_DEFAULT_BASE_URL[rt.protocol] ||
    ''
  ).replace(/\/$/, '');
  if (!base) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '该渠道未填接口地址（custom 协议必须自定义 baseUrl）',
    );
  }
  return base;
}

function headersOf(rt: ProviderRuntime): Record<string, string> {
  const common = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (rt.protocol === 'synclabs') {
    return { ...common, 'x-api-key': rt.apiKey };
  }
  if (rt.protocol === 'custom') {
    return { ...common, Authorization: `Bearer ${rt.apiKey}` };
  }
  return { ...common, Authorization: rt.apiKey };
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pick(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
  }
  return '';
}

function pickNested(source: Record<string, unknown>, keys: string[]): string {
  const direct = pick(source, keys);
  if (direct) return direct;
  return pick(recordOf(source.data), keys);
}

/** fox/synclabs/custom 三家的「是否受理」判据统一收口。 */
function accepted(payload: Record<string, unknown>, httpOk: boolean): string {
  const errno = payload.errno ?? payload.code;
  if (httpOk) {
    if (typeof errno === 'number' && errno !== 0) {
      return (
        pick(payload, ['message', 'errorMessage', 'msg']) || `errno=${errno}`
      );
    }
    if (typeof payload.errorMessage === 'string' && payload.errorMessage) {
      return payload.errorMessage;
    }
    return '';
  }
  return (
    pick(payload, ['message', 'errorMessage', 'msg']) ||
    `上游 HTTP ${typeof payload.status === 'number' || typeof payload.status === 'string' ? String(payload.status) : '未知'}，请求未被受理`
  );
}

async function callProvider(
  rt: ProviderRuntime,
  path: string,
  body: Record<string, unknown> | undefined,
  operation: string,
  timeoutMs = 20_000,
): Promise<{ payload: Record<string, unknown>; ok: boolean }> {
  const response = await httpRequest<unknown>(`${baseOf(rt)}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: headersOf(rt),
    body: body ? JSON.stringify(body) : undefined,
    timeoutMs,
    operation,
  });
  return { payload: recordOf(response.data), ok: response.ok };
}

function foxTaskType(kind: DhTaskKind): string {
  if (kind === 'voice-clone') return 'cloneVoice';
  if (kind === 'body-train') return 'cloneBody';
  if (kind === 'tts') return 'tts';
  return 'lipsync';
}

/** 归一化「成功/失败/进行中」：fox 用 1/2，synclabs 用文字，custom 两者都可能。 */
function normalizeStatus(raw: string): number {
  const value = raw.toLowerCase();
  if (
    ['1', 'success', 'succeeded', 'completed', 'done', 'ready'].includes(value)
  ) {
    return 2;
  }
  if (['2', '3', 'fail', 'failed', 'error'].includes(value)) return 3;
  if (['0', 'pending', 'waiting', 'queued'].includes(value)) return 0;
  return PENDING;
}

function outcomeFrom(
  payload: Record<string, unknown>,
  started: ProviderOutcome,
): ProviderOutcome {
  const data = recordOf(payload.data);
  const merged = { ...data, ...payload };
  const status = normalizeStatus(
    pick(merged, ['status', 'task_status', 'state']),
  );
  const finished = status === 2 || status === 3;
  return {
    ...started,
    finished,
    status: finished ? status : PENDING,
    resultUrl: pick(merged, [
      'video_url',
      'videoUrl',
      'audio_url',
      'audioUrl',
      'result_url',
      'resultUrl',
      'url',
    ]),
    demoUrl: pick(merged, ['demo_url', 'demoUrl']),
    externalId: pick(merged, [
      'speaker_id',
      'speakerId',
      'subject_id',
      'subjectId',
      'voice_id',
      'voiceId',
      'id',
    ]),
    error:
      finished && status === 3
        ? clip(
            pick(merged, [
              'fail_reason',
              'failReason',
              'errorMessage',
              'error',
              'message',
            ]),
            500,
          ) || '任务失败'
        : started.error,
  };
}

/** 提交异步任务；网络与受理失败直接抛业务错，由上层留台账。 */
export async function submitTask(
  rt: ProviderRuntime,
  kind: DhTaskKind,
  input: {
    name?: string;
    audioUrl?: string;
    videoUrl?: string;
    text?: string;
    voiceId?: string;
    lang?: string;
    volume?: number;
    speed?: number;
    notifyUrl: string;
  },
): Promise<ProviderOutcome> {
  if (!rt.apiKey) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '该渠道未配置接口密钥，请先到「模型渠道」填写并保存',
    );
  }
  if (rt.protocol === 'fox') {
    const body: Record<string, unknown> = { notify: input.notifyUrl };
    if (kind === 'voice-clone') {
      body.name = clip(input.name, 60) || '';
      body.audio_url = input.audioUrl || '';
      body.lang = input.lang || 'zh-cn';
    } else if (kind === 'body-train') {
      body.video_url = input.videoUrl || '';
    } else if (kind === 'tts') {
      body.voice_type = input.voiceId ? 'clone' : 'preset';
      body.voice_id = input.voiceId || '';
      body.text = input.text || '';
      body.lang = input.lang || 'zh-cn';
      body.volume = input.volume ?? 1;
      body.speed = input.speed ?? 1;
    } else {
      body.video_url = input.videoUrl || '';
      body.audio_url = input.audioUrl || '';
      if (input.name) body.name = clip(input.name, 60);
    }
    const path =
      kind === 'voice-clone'
        ? '/cloneVoice'
        : kind === 'body-train'
          ? '/cloneBody'
          : kind === 'tts'
            ? '/tts'
            : '/lipsync';
    const { payload, ok } = await callProvider(
      rt,
      path,
      body,
      `dh-fox-${kind}`,
    );
    const failure = accepted(payload, ok);
    if (failure) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `数字人上游受理失败：${failure}`,
      );
    }
    const taskId = pickNested(payload, ['task_id', 'taskId', 'id']);
    if (!taskId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '数字人上游未返回任务号，请稍后重试或检查渠道配置',
      );
    }
    return outcomeFrom(payload, emptyOutcome(taskId));
  }
  if (rt.protocol === 'synclabs') {
    if (kind === 'body-train') {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'Synclabs 协议不支持形象训练，请把「形象训练」渠道配为 fox 或 custom',
      );
    }
    if (kind === 'voice-clone') {
      const { payload, ok } = await callProvider(
        rt,
        '/voices/create',
        {
          name: clip(input.name, 60) || 'dh-voice',
          description: '',
          inputSamples: [input.audioUrl || ''],
          webhookUrl: input.notifyUrl,
        },
        'dh-synclabs-clone',
      );
      const failure = accepted(payload, ok);
      if (failure) {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          `数字人上游受理失败：${failure}`,
        );
      }
      const taskId = pickNested(payload, ['id', 'task_id', 'taskId']);
      if (!taskId) {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          '数字人上游未返回任务号',
        );
      }
      return emptyOutcome(taskId);
    }
    if (kind === 'tts') {
      const { payload, ok } = await callProvider(
        rt,
        '/speak',
        { transcript: input.text || '', voiceId: input.voiceId || '' },
        'dh-synclabs-tts',
      );
      const failure = accepted(payload, ok);
      if (failure) {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          `数字人上游受理失败：${failure}`,
        );
      }
      const outcome = emptyOutcome(`sync-tts-${Date.now()}`);
      const merged = { ...recordOf(payload.data), ...payload };
      const url = pick(merged, ['audioUrl', 'audio_url', 'url', 'resultUrl']);
      return {
        ...outcome,
        finished: true,
        status: url ? 2 : 3,
        resultUrl: url,
        error: url ? '' : '上游未返回音频地址',
      };
    }
    const { payload, ok } = await callProvider(
      rt,
      '/lipsync',
      {
        audioUrl: input.audioUrl || '',
        videoUrl: input.videoUrl || '',
        model: rt.modelTier || 'sync-1.6.0',
        synergize: true,
        synergizerStrength: 1,
        webhookUrl: input.notifyUrl,
      },
      'dh-synclabs-lipsync',
    );
    const failure = accepted(payload, ok);
    if (failure) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `数字人上游受理失败：${failure}`,
      );
    }
    const taskId = pickNested(payload, ['id', 'task_id']);
    if (!taskId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '数字人上游未返回任务号',
      );
    }
    return emptyOutcome(taskId);
  }
  // custom：本站约定的轻量网关协议（字段与 fox 同形，方便自建转接层）。
  const { payload, ok } = await callProvider(
    rt,
    '/submit',
    {
      kind: foxTaskType(kind),
      name: clip(input.name, 60),
      audio_url: input.audioUrl || '',
      video_url: input.videoUrl || '',
      text: input.text || '',
      voice_id: input.voiceId || '',
      speed: input.speed ?? 1,
      volume: input.volume ?? 1,
      notify_url: input.notifyUrl,
    },
    `dh-custom-${kind}`,
  );
  const failure = accepted(payload, ok);
  if (failure) {
    throw new BusinessException(
      ErrorCode.SERVICE_UNAVAILABLE,
      `数字人上游受理失败：${failure}`,
    );
  }
  const taskId = pickNested(payload, ['task_id', 'taskId', 'id']);
  if (!taskId) {
    throw new BusinessException(
      ErrorCode.SERVICE_UNAVAILABLE,
      '自定义渠道未返回 task_id',
    );
  }
  return outcomeFrom(payload, emptyOutcome(taskId));
}

/** 主动查询任务状态（synclabs 的口型任务不支持查询，由调用方按 webhook 等）。 */
export async function queryTask(
  rt: ProviderRuntime,
  kind: DhTaskKind,
  providerTaskId: string,
): Promise<ProviderOutcome | null> {
  if (rt.protocol === 'fox') {
    const { payload, ok } = await callProvider(
      rt,
      '/getTaskStatus',
      { type: foxTaskType(kind), task_id: providerTaskId },
      'dh-fox-status',
    );
    if (!ok || accepted(payload, ok)) return null;
    return outcomeFrom(payload, emptyOutcome(providerTaskId));
  }
  if (rt.protocol === 'synclabs') {
    if (kind !== 'voice-clone') return null;
    const { payload, ok } = await callProvider(
      rt,
      `/voices/${encodeURIComponent(providerTaskId)}`,
      undefined,
      'dh-synclabs-voice-detail',
    );
    if (!ok || accepted(payload, ok)) return null;
    return outcomeFrom(payload, emptyOutcome(providerTaskId));
  }
  const { payload, ok } = await callProvider(
    rt,
    `/status?task_id=${encodeURIComponent(providerTaskId)}`,
    undefined,
    'dh-custom-status',
  );
  if (!ok || accepted(payload, ok)) return null;
  return outcomeFrom(payload, emptyOutcome(providerTaskId));
}

export function querySupported(rt: ProviderRuntime, kind: DhTaskKind): boolean {
  if (rt.protocol === 'fox' || rt.protocol === 'custom') return true;
  return rt.protocol === 'synclabs' && kind === 'voice-clone';
}

/**
 * 归一化 webhook 报文（fox：{task_id,status:1|2,…}；synclabs：{id,status:'completed'|'error',…}）。
 * 归属判定不在这层：回调 URL 的 callbackToken 已唯一锁定本站任务。
 */
export function parseProviderNotify(raw: unknown): ProviderOutcome | null {
  const payload = recordOf(raw);
  const taskId = pick(payload, ['task_id', 'taskId', 'id']);
  if (!taskId) return null;
  return outcomeFrom(payload, emptyOutcome(taskId));
}

/** 渠道连通自检：不产生任务，只验证密钥与地址可达。 */
export async function probeChannel(
  rt: ProviderRuntime,
): Promise<{ ok: boolean; message: string }> {
  if (!rt.apiKey) return { ok: false, message: '未配置接口密钥' };
  try {
    if (rt.protocol === 'fox') {
      const { payload, ok } = await callProvider(
        rt,
        '/getBalance',
        undefined,
        'dh-fox-balance',
        10_000,
      );
      const failure = accepted(payload, ok);
      if (failure) return { ok: false, message: `接口拒绝：${failure}` };
      const balance = pick(recordOf(payload.data), [
        'balance',
        'total',
        'remain',
      ]);
      return {
        ok: true,
        message: balance ? `接口可用，上游余额 ${balance}` : '接口可用',
      };
    }
    if (rt.protocol === 'synclabs') {
      const { payload, ok } = await callProvider(
        rt,
        '/speak/cost?transcript=test',
        undefined,
        'dh-synclabs-cost',
        10_000,
      );
      const failure = accepted(payload, ok);
      if (failure) return { ok: false, message: `接口拒绝：${failure}` };
      return { ok: true, message: '接口可用' };
    }
    const { payload, ok } = await callProvider(
      rt,
      '/status?task_id=probe',
      undefined,
      'dh-custom-probe',
      10_000,
    );
    if (!ok && !Object.keys(payload).length) {
      return { ok: false, message: '自定义渠道不可达，请核对接口地址' };
    }
    return { ok: true, message: '接口可达（custom 协议按约定解析）' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '接口请求失败';
    return { ok: false, message: clip(message, 200) };
  }
}
