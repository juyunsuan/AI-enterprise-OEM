import { text } from '../common/api';

/**
 * 群控任务终态的站内信口径（方案 §4.4、§4.7）。
 * BotBuddy 主机 / Mobot 手机与 WorkBuddy 企业云共用这一份文案与闸门，
 * 否则用户在同一个铃铛下拉里会看到两套写法。
 */

/** 站内信正文里不暴露设备本地路径：命中即替换成占位说明。 */
const LOCAL_PATH_PATTERN =
  /(?:[A-Za-z]:[\\/][^\s]*|\\\\[^\s]*|\/(?:home|Users|var|opt|usr|tmp|root|data)\/?[^\s]*)/g;

/** 会提醒的终态；取消由用户自己触发，不发信。 */
const NOTICE_STATUSES = ['DONE', 'FAILED', 'TIMEOUT'];

export type DispatchNoticeEntityKind = 'host_command' | 'cloud_command';

export type BotTerminalNoticePayload = {
  title: string;
  body: string;
  level: 'info' | 'error';
  commandCode: string;
  /** 台账跳转要按通道读不同的表。 */
  entityType: DispatchNoticeEntityKind;
};

export type BotTerminalNoticeSink = (
  userId: string,
  input: BotTerminalNoticePayload,
) => Promise<void>;

function clip(value: unknown, max: number) {
  return text(value).trim().slice(0, max);
}

/** 站内信正文只取回传的第一行，并把本地路径遮掉；完整输出留在执行位对话里看。 */
export function noticeSummary(raw: string) {
  const line = text(raw)
    .split('\n')
    .find((item) => item.trim())
    ?.trim();
  if (!line) return '';
  return clip(line.replace(LOCAL_PATH_PATTERN, '（本地路径已隐藏）'), 200);
}

/** 该不该提醒：Agent 派发的、或执行位侧定时到点自动跑的才发；手动下发不打扰。 */
export function shouldAnnounceTerminal(input: {
  source: string;
  kind: string;
  status: string;
}) {
  if (input.source !== 'AGENT' && input.kind !== 'schedule') return false;
  return NOTICE_STATUSES.includes(input.status);
}

export type TerminalNoticeInput = {
  /** 执行位名称：设备名或企云账号名。 */
  target: string;
  commandCode: string;
  title: string;
  /** prompt / schedule（与指令表 kind 同口径）。 */
  kind: string;
  source: string;
  status: string;
  /** 终结回执文本或失败原因。 */
  detail: string;
  /** 通道差异只体现在排障指引：设备去看客户端，云端去看账号凭据。 */
  channel: 'device' | 'cloud';
};

/** 组一条终态站内信；闸门不过或不该发时返回 null。 */
export function composeTerminalNotice(
  input: TerminalNoticeInput,
): BotTerminalNoticePayload | null {
  if (!shouldAnnounceTerminal(input)) return null;
  const fromCloud = input.channel === 'cloud';
  const entityType: DispatchNoticeEntityKind = fromCloud
    ? 'cloud_command'
    : 'host_command';
  const label = clip(input.title, 60) || '未命名任务';
  const summary =
    input.status === 'DONE'
      ? noticeSummary(input.detail) ||
        (fromCloud
          ? '云端这一轮已跑完，未回传文本结果。'
          : '设备已执行完毕，未回传文本结果。')
      : input.status === 'TIMEOUT'
        ? fromCloud
          ? '云端超时未回传结果，可在「Agent-Bot → 企云账号」里看这段云端对话；确认账号凭据可用后可重新派单。'
          : '主机超时未回传结果，请检查 BotBuddy 客户端是否还在跑；确认设备在线后可重新派单。'
        : `${
            noticeSummary(input.detail) ||
            clip(input.detail, 200) ||
            (fromCloud
              ? '云端执行失败，未回传原因'
              : '设备端执行失败，未回传原因')
          }；可在「Agent 群控」台账核对${fromCloud ? '账号凭据' : '设备在线'}后重新派单。`;
  return {
    title:
      input.status === 'DONE'
        ? `群控任务已完成：${label}`
        : input.status === 'TIMEOUT'
          ? `群控任务超时未回传：${label}`
          : `群控任务执行失败：${label}`,
    body: `${input.target} · ${
      input.kind === 'schedule' ? '定时任务' : '普通任务'
    }\n指令码 ${input.commandCode}｜${summary}`,
    level: input.status === 'DONE' ? 'info' : 'error',
    commandCode: input.commandCode,
    entityType,
  };
}
