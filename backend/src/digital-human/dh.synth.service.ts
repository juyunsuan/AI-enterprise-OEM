import type {
  DhBodyRow,
  DhTaskRow,
  DhVoiceRow,
  DhWorkRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { PrismaService } from '../prisma/prisma.service';
import type { DhChannelService } from './dh.channel.service';
import {
  querySupported,
  queryTask,
  submitTask,
  type DhTaskKind,
  type ProviderOutcome,
  type ProviderRuntime,
} from './dh.provider';
import { clip, dhCallbackToken, siteConfigOf } from './dh.shared';
import type { DhMemberService } from './dh.member.service';

/**
 * 数字人合成服务：形象训练 / 声音克隆 / 视频合成（TTS→对口型） 的任务状态机。
 *
 * 一条合成 = 若干异步任务串行：
 *   形象/声音克隆：提交 → 训练中 → 可用（失败退点）
 *   视频合成：扣算力 → TTS（或自传音频）→ 对口型 → 成片（任一环节失败按实际扣费原路退回）
 *
 * 任务推进有两条腿：供应商 webhook（按 callbackToken 定位，一任务一令牌，防伪造）
 * 与端上轮询时的主动查询（fox/custom 支持）；两条腿写同一套终态处理，幂等。
 */

type SiteRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanSite']['findUnique']>>
>;
type MemberRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanMember']['findUnique']>>
>;
type WorkRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanWork']['findUnique']>>
>;
type TaskRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanTask']['findUnique']>>
>;

export type DhWorkCreateInput = {
  title?: string;
  bodyId?: number;
  voiceSource?: string;
  voiceId?: number;
  audioType?: string;
  script?: string;
  sourceAudioUrl?: string;
  bgmId?: number;
  bgmVolume?: number;
  speed?: number;
  subtitleOn?: boolean;
};

export type DhAssetCreateInput = {
  name?: string;
  mediaUrl: string;
  durationSec?: number;
};

export class DhSynthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly member: DhMemberService,
    private readonly channel: DhChannelService,
  ) {}

  // ================= C 端：形象 / 声音克隆 =================

  async createBody(
    site: SiteRow,
    member: MemberRow,
    input: DhAssetCreateInput,
  ) {
    const config = siteConfigOf(site);
    if (config.toggles.bodyClone === false) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开放形象克隆');
    }
    const videoUrl = clip(input.mediaUrl, 500);
    if (!/^https:\/\//i.test(videoUrl)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '形象视频需先上传，地址不合法',
      );
    }
    const duration = Math.max(0, Math.round(input.durationSec || 0));
    if (
      duration > 0 &&
      (duration < config.clone.bodyMinSec || duration > config.clone.bodyMaxSec)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `形象视频时长需在 ${config.clone.bodyMinSec}-${config.clone.bodyMaxSec} 秒之间`,
      );
    }
    const { runtime } = await this.channel.requireRuntime(
      site.userId,
      'body-train',
    );
    this.member.requireVip(site, member);
    const body = await this.prisma.digitalHumanBody.create({
      data: {
        siteId: site.id,
        memberId: member.id,
        name: clip(input.name, 60) || '我的形象',
        sourceVideoUrl: videoUrl,
        durationSec: duration,
        status: 0,
      },
    });
    await this.member.applyBalance({
      siteId: site.id,
      memberId: member.id,
      account: 'body',
      delta: -1,
      bizType: 'body',
      refId: body.id,
      remark: '形象克隆',
    });
    await this.startTask({
      site,
      memberId: member.id,
      kind: 'body-train',
      refTable: 'bodies',
      refId: body.id,
      runtime,
      input: { name: body.name, videoUrl, notifyUrl: '' },
      onFail: async (reason) => {
        await this.failBody(body.id, reason);
      },
    });
    return this.bodyRow(body.id);
  }

  async createVoice(
    site: SiteRow,
    member: MemberRow,
    input: DhAssetCreateInput,
  ) {
    const config = siteConfigOf(site);
    if (config.toggles.voiceClone === false) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开放声音克隆');
    }
    const audioUrl = clip(input.mediaUrl, 500);
    if (!/^https:\/\//i.test(audioUrl)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '声音样本需先上传，地址不合法',
      );
    }
    const duration = Math.max(0, Math.round(input.durationSec || 0));
    if (
      duration > 0 &&
      (duration < config.clone.voiceMinSec ||
        duration > config.clone.voiceMaxSec)
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `声音样本时长需在 ${config.clone.voiceMinSec}-${config.clone.voiceMaxSec} 秒之间`,
      );
    }
    const { runtime } = await this.channel.requireRuntime(
      site.userId,
      'voice-clone',
    );
    this.member.requireVip(site, member);
    const voice = await this.prisma.digitalHumanVoice.create({
      data: {
        siteId: site.id,
        memberId: member.id,
        name: clip(input.name, 60) || '我的声音',
        sampleAudioUrl: audioUrl,
        status: 0,
      },
    });
    await this.member.applyBalance({
      siteId: site.id,
      memberId: member.id,
      account: 'voice',
      delta: -1,
      bizType: 'voice',
      refId: voice.id,
      remark: '声音克隆',
    });
    await this.startTask({
      site,
      memberId: member.id,
      kind: 'voice-clone',
      refTable: 'voices',
      refId: voice.id,
      runtime,
      input: { name: voice.name, audioUrl, notifyUrl: '' },
      onFail: async (reason) => {
        await this.failVoice(voice.id, reason);
      },
    });
    return this.voiceRow(voice.id);
  }

  async myBodies(member: MemberRow): Promise<DhBodyRow[]> {
    const rows = await this.prisma.digitalHumanBody.findMany({
      where: { siteId: member.siteId, memberId: member.id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.bodyRowOf(row, member.nickname));
  }

  async myVoices(member: MemberRow): Promise<DhVoiceRow[]> {
    const rows = await this.prisma.digitalHumanVoice.findMany({
      where: { siteId: member.siteId, memberId: member.id },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.voiceRowOf(row, member.nickname));
  }

  // ================= C 端：视频合成 =================

  async createWork(site: SiteRow, member: MemberRow, input: DhWorkCreateInput) {
    const config = siteConfigOf(site);
    if (
      config.toggles.worksPage === false &&
      config.toggles.bodyClone === false
    ) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开放视频合成');
    }
    this.member.requireVip(site, member);
    const audioType = input.audioType === 'audio' ? 'audio' : 'tts';
    const bodyId = Math.max(0, Math.round(input.bodyId || 0));
    const script = clip(input.script, 5000);
    const sourceAudioUrl = clip(input.sourceAudioUrl, 500);
    if (audioType === 'tts' && !script) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写要合成的文案');
    }
    if (audioType === 'tts' && script.length > config.clone.scriptMaxLen) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `文案过长：最多 ${config.clone.scriptMaxLen} 字`,
      );
    }
    if (audioType === 'audio' && !/^https:\/\//i.test(sourceAudioUrl)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先上传要合成的音频',
      );
    }
    let body: { id: number; sourceVideoUrl: string } | null = null;
    if (bodyId > 0) {
      const row = await this.prisma.digitalHumanBody.findFirst({
        where: { id: bodyId, siteId: site.id, memberId: member.id },
        select: { id: true, sourceVideoUrl: true, status: true },
      });
      if (!row || row.status !== 1) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选形象不可用（克隆未完成或已失效），请重新选择',
        );
      }
      body = { id: row.id, sourceVideoUrl: row.sourceVideoUrl };
    }
    let speakerId = '';
    let voiceId = 0;
    const voiceSource = input.voiceSource === 'preset' ? 'preset' : 'clone';
    if (audioType === 'tts') {
      if (voiceSource === 'clone') {
        const voiceIdNum = Math.max(0, Math.round(input.voiceId || 0));
        const voice = await this.prisma.digitalHumanVoice.findFirst({
          where: { id: voiceIdNum, siteId: site.id, memberId: member.id },
        });
        if (!voice || voice.status !== 1 || !voice.speakerId) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '所选克隆音色不可用（克隆未完成或已失效），请重新选择',
          );
        }
        speakerId = voice.speakerId;
        voiceId = voice.id;
      } else {
        const voiceIdNum = Math.max(0, Math.round(input.voiceId || 0));
        const preset = await this.prisma.digitalHumanPresetVoice.findFirst({
          where: {
            id: voiceIdNum,
            siteId: { in: [0, site.id] },
            enabled: true,
          },
        });
        if (!preset) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            '所选音色不存在或已下架',
          );
        }
        speakerId = preset.speakerId;
        voiceId = preset.id;
      }
    }
    const bgmId = Math.max(0, Math.round(input.bgmId || 0));
    if (bgmId > 0) {
      const bgm = await this.prisma.digitalHumanBgm.findFirst({
        where: { id: bgmId, siteId: { in: [0, site.id] }, enabled: true },
        select: { id: true },
      });
      if (!bgm)
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选背景音乐不存在',
        );
    }
    const pointCost =
      audioType === 'tts' && !body
        ? config.pricing.priceTts
        : config.pricing.priceVideo;
    const work = await this.prisma.digitalHumanWork.create({
      data: {
        siteId: site.id,
        memberId: member.id,
        title: clip(input.title, 120) || clip(script, 30) || '数字人作品',
        bodyId: body?.id || 0,
        voiceSource,
        voiceId,
        voiceSpeakerId: speakerId,
        audioType,
        script,
        sourceAudioUrl,
        bgmId,
        bgmVolume: Math.min(
          100,
          Math.max(0, Math.round(input.bgmVolume ?? 30)),
        ),
        speed: Math.min(200, Math.max(50, Math.round(input.speed ?? 100))),
        subtitleOn: input.subtitleOn !== false,
        status: 0,
        stage: audioType === 'tts' ? 'tts' : 'lipsync',
        ttsStatus: audioType === 'tts' ? 0 : 2,
        pointCost,
      },
    });
    await this.member.applyBalance({
      siteId: site.id,
      memberId: member.id,
      account: 'point',
      delta: -pointCost,
      bizType: audioType === 'tts' && !body ? 'tts' : 'work',
      refId: work.id,
      remark: body ? '视频合成' : '语音合成',
    });
    if (audioType === 'audio') {
      await this.prisma.digitalHumanWork.update({
        where: { id: work.id },
        data: { audioUrl: sourceAudioUrl },
      });
      if (body) {
        await this.advanceLipsync(
          site,
          work.id,
          body.sourceVideoUrl,
          sourceAudioUrl,
        );
      } else {
        await this.finishWork(work.id, { audioUrl: sourceAudioUrl });
      }
      return this.workRow(work.id);
    }
    const { runtime } = await this.channel.requireRuntime(site.userId, 'tts');
    await this.startTask({
      site,
      memberId: member.id,
      kind: 'tts',
      refTable: 'works',
      refId: work.id,
      runtime,
      input: {
        text: script,
        voiceId: speakerId,
        speed: Math.min(2, Math.max(0.5, (input.speed ?? 100) / 100)),
        notifyUrl: '',
      },
      onFail: async (reason) => {
        await this.failWork(work.id, reason);
      },
      onSubmitted: async (submitted) => {
        await this.prisma.digitalHumanWork.update({
          where: { id: work.id },
          data: {
            ttsTaskId: submitted.providerTaskId,
            ttsStatus: submitted.finished && submitted.status === 2 ? 2 : 1,
          },
        });
        if (submitted.finished && submitted.status === 2) {
          await this.onTtsDone(work.id, submitted.resultUrl || sourceAudioUrl);
        } else if (submitted.finished) {
          await this.failWork(work.id, submitted.error || '语音合成失败');
        }
      },
    });
    return this.workRow(work.id);
  }

  async myWorks(member: MemberRow) {
    const rows = await this.prisma.digitalHumanWork.findMany({
      where: { siteId: member.siteId, memberId: member.id },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map((row) => this.workRowOf(row, member.nickname));
  }

  /** 作品状态轮询：未终态且有可查渠道时顺手推进一次，不依赖 webhook 也能收尾。 */
  async workStatus(site: SiteRow, member: MemberRow, workId: number) {
    const work = await this.prisma.digitalHumanWork.findFirst({
      where: { id: workId, siteId: site.id, memberId: member.id },
    });
    if (!work) throw new BusinessException(ErrorCode.NOT_FOUND, '作品不存在');
    if (work.status === 0) {
      await this.pollWorkTasks(site, work);
    }
    const latest = await this.prisma.digitalHumanWork.findUnique({
      where: { id: work.id },
    });
    const row = latest || work;
    return {
      id: row.id,
      status: row.status,
      stage: row.stage,
      ttsStatus: row.ttsStatus,
      lipsyncStatus: row.lipsyncStatus,
      resultVideoUrl: row.resultVideoUrl,
      audioUrl: row.audioUrl,
      failReason: row.failReason,
      isRefund: row.isRefund,
      pointCost: row.pointCost,
    };
  }

  async removeWork(site: SiteRow, member: MemberRow, workId: number) {
    const work = await this.prisma.digitalHumanWork.findFirst({
      where: { id: workId, siteId: site.id, memberId: member.id },
    });
    if (!work) throw new BusinessException(ErrorCode.NOT_FOUND, '作品不存在');
    if (work.status === 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '作品合成中，完成后再删除',
      );
    }
    await this.prisma.digitalHumanWork.delete({ where: { id: work.id } });
    return { ok: true };
  }

  async feed(site: SiteRow, page: number, pageSize: number) {
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanWork.count({
        where: { siteId: site.id, status: 1, resultVideoUrl: { not: '' } },
      }),
      this.prisma.digitalHumanWork.findMany({
        where: { siteId: site.id, status: 1, resultVideoUrl: { not: '' } },
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.memberId),
    );
    return pageOf(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        coverUrl: row.coverUrl,
        resultVideoUrl: row.resultVideoUrl,
        durationSec: row.durationSec,
        playCount: row.playCount,
        nickname: nameOf.get(row.memberId) || '用户',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async playWork(site: SiteRow, workId: number) {
    const work = await this.prisma.digitalHumanWork.findFirst({
      where: { id: workId, siteId: site.id, status: 1 },
    });
    if (!work)
      throw new BusinessException(ErrorCode.NOT_FOUND, '作品不存在或未完成');
    await this.prisma.digitalHumanWork
      .update({ where: { id: work.id }, data: { playCount: { increment: 1 } } })
      .catch(() => undefined);
    return {
      id: work.id,
      title: work.title,
      resultVideoUrl: work.resultVideoUrl,
      audioUrl: work.audioUrl,
      coverUrl: work.coverUrl,
      durationSec: work.durationSec,
      playCount: work.playCount + 1,
      shareCount: work.shareCount,
      createdAt: work.createdAt.toISOString(),
    };
  }

  async shareWork(site: SiteRow, workId: number) {
    const work = await this.prisma.digitalHumanWork.findFirst({
      where: { id: workId, siteId: site.id, status: 1 },
      select: { id: true },
    });
    if (!work) throw new BusinessException(ErrorCode.NOT_FOUND, '作品不存在');
    await this.prisma.digitalHumanWork
      .update({
        where: { id: work.id },
        data: { shareCount: { increment: 1 } },
      })
      .catch(() => undefined);
    return { ok: true };
  }

  // ================= webhook / 轮询 推进 =================

  /** webhook 入口：callbackToken 唯一定位任务；重复投递幂等。 */
  async notify(callbackToken: string, payload: unknown) {
    const task = await this.prisma.digitalHumanTask.findUnique({
      where: { callbackToken: clip(callbackToken, 48) },
    });
    if (!task) return { ok: false, message: 'task not found' };
    if (task.status === 2 || task.status === 3) {
      return { ok: true, message: 'ignored (finished)' };
    }
    const outcome = this.outcomeOf(payload, task);
    if (!outcome) return { ok: false, message: 'empty payload' };
    await this.applyOutcome(task, outcome);
    return { ok: true, message: 'success' };
  }

  private outcomeOf(payload: unknown, task: TaskRow): ProviderOutcome | null {
    const raw =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const normalize = (value: unknown) => {
      if (typeof value === 'number') {
        if (value === 1) return 2;
        if (value === 2 || value === 3) return 3;
        return 1;
      }
      const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (
        ['1', 'success', 'succeeded', 'completed', 'done', 'ready'].includes(
          text,
        )
      ) {
        return 2;
      }
      if (['2', '3', 'fail', 'failed', 'error'].includes(text)) return 3;
      return 1;
    };
    const statusValue = raw.status ?? raw.task_status ?? raw.state;
    if (statusValue === undefined) return null;
    const status = normalize(statusValue);
    const data =
      raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
        ? (raw.data as Record<string, unknown>)
        : {};
    const merged: Record<string, unknown> = { ...data, ...raw };
    const str = (keys: string[]) => {
      for (const key of keys) {
        const value = merged[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return '';
    };
    return {
      providerTaskId:
        task.providerTaskId ||
        clip(typeof raw.task_id === 'string' ? raw.task_id : '', 120),
      finished: true,
      status,
      resultUrl: str([
        'video_url',
        'videoUrl',
        'audio_url',
        'audioUrl',
        'result_url',
        'resultUrl',
        'url',
      ]),
      demoUrl: str(['demo_url', 'demoUrl']),
      externalId: str([
        'speaker_id',
        'speakerId',
        'subject_id',
        'subjectId',
        'voice_id',
        'voiceId',
      ]),
      error:
        status === 3
          ? clip(
              str([
                'fail_reason',
                'failReason',
                'errorMessage',
                'error',
                'message',
              ]),
              500,
            ) || '上游任务失败'
          : '',
    };
  }

  private async pollWorkTasks(site: SiteRow, work: WorkRow) {
    const tasks = await this.prisma.digitalHumanTask.findMany({
      where: {
        siteId: site.id,
        refTable: 'works',
        refId: work.id,
        status: { in: [0, 1] },
      },
      orderBy: { id: 'desc' },
      take: 2,
    });
    for (const task of tasks) {
      if (!task.providerTaskId) continue;
      const protocol = task.protocol as 'fox' | 'synclabs' | 'custom';
      const runtime: ProviderRuntime = {
        protocol:
          protocol === 'synclabs'
            ? 'synclabs'
            : protocol === 'custom'
              ? 'custom'
              : 'fox',
        baseUrl: '',
        apiKey: '',
        modelTier: '',
      };
      void runtime;
      const live = await this.channel.peekRuntime(site.userId, task.kind);
      if (!live || !querySupported(live, task.kind as DhTaskKind)) continue;
      try {
        const snapshot = await queryTask(
          live,
          task.kind as DhTaskKind,
          task.providerTaskId,
        );
        if (snapshot && (snapshot.status === 2 || snapshot.status === 3)) {
          await this.applyOutcome(task, snapshot);
        }
      } catch {
        // 查询失败不影响端上展示，等 webhook 或下次轮询
      }
    }
  }

  /** 任务终态统一收口：更新任务台账 → 推进业务对象（幂等）。 */
  private async applyOutcome(task: TaskRow, outcome: ProviderOutcome) {
    const fresh = await this.prisma.digitalHumanTask.findUnique({
      where: { id: task.id },
    });
    if (!fresh || fresh.status === 2 || fresh.status === 3) return;
    await this.prisma.digitalHumanTask.update({
      where: { id: fresh.id },
      data: {
        status: outcome.status,
        resultUrl: clip(outcome.resultUrl, 500),
        error: clip(outcome.error, 500),
        providerTaskId: fresh.providerTaskId || outcome.providerTaskId,
      },
    });
    if (task.kind === 'body-train') {
      if (outcome.status === 2) {
        await this.prisma.digitalHumanBody.updateMany({
          where: { id: fresh.refId },
          data: {
            status: 1,
            subjectId: clip(outcome.externalId, 120),
            failReason: '',
          },
        });
      } else {
        await this.failBody(fresh.refId, outcome.error);
      }
      return;
    }
    if (task.kind === 'voice-clone') {
      if (outcome.status === 2) {
        let speakerId = outcome.externalId;
        if (!speakerId) {
          const live = await this.channel.peekRuntime(
            task.siteId ? await this.ownerOf(task.siteId) : '',
            'voice-clone',
          );
          if (live && fresh.providerTaskId) {
            const snapshot = await queryTask(
              live,
              'voice-clone',
              fresh.providerTaskId,
            ).catch(() => null);
            speakerId = snapshot?.externalId || '';
          }
        }
        if (!speakerId) {
          await this.failVoice(
            fresh.refId,
            '上游未回填音色标识，请重试或联系站点',
          );
          return;
        }
        await this.prisma.digitalHumanVoice.updateMany({
          where: { id: fresh.refId },
          data: {
            status: 1,
            speakerId: clip(speakerId, 120),
            demoAudioUrl: clip(outcome.demoUrl, 500),
            failReason: '',
          },
        });
      } else {
        await this.failVoice(fresh.refId, outcome.error);
      }
      return;
    }
    if (task.kind === 'tts') {
      if (outcome.status === 2 && outcome.resultUrl) {
        await this.onTtsDone(fresh.refId, outcome.resultUrl);
      } else {
        await this.failWork(fresh.refId, outcome.error || '语音合成失败');
      }
      return;
    }
    if (task.kind === 'lipsync') {
      if (outcome.status === 2 && outcome.resultUrl) {
        await this.finishWork(fresh.refId, { videoUrl: outcome.resultUrl });
      } else {
        await this.failWork(fresh.refId, outcome.error || '画面合成失败');
      }
    }
  }

  private async ownerOf(siteId: number): Promise<string> {
    const site = await this.prisma.digitalHumanSite.findUnique({
      where: { id: siteId },
      select: { userId: true },
    });
    return site?.userId || '';
  }

  private async onTtsDone(workId: number, audioUrl: string) {
    const work = await this.prisma.digitalHumanWork.findUnique({
      where: { id: workId },
    });
    if (!work || work.status !== 0) return;
    await this.prisma.digitalHumanWork.update({
      where: { id: work.id },
      data: {
        audioUrl: clip(audioUrl, 500),
        ttsStatus: 2,
        stage: work.bodyId > 0 ? 'lipsync' : 'done',
      },
    });
    if (work.bodyId > 0) {
      const body = await this.prisma.digitalHumanBody.findUnique({
        where: { id: work.bodyId },
        select: { sourceVideoUrl: true },
      });
      if (!body) {
        await this.failWork(work.id, '形象素材已删除，无法继续合成');
        return;
      }
      await this.advanceLipsync(
        await this.requireSite(work.siteId),
        work.id,
        body.sourceVideoUrl,
        audioUrl,
      );
    } else {
      await this.finishWork(work.id, { audioUrl });
    }
  }

  private async advanceLipsync(
    site: SiteRow,
    workId: number,
    videoUrl: string,
    audioUrl: string,
  ) {
    const { runtime } = await this.channel.requireRuntime(
      site.userId,
      'lipsync',
    );
    const work = await this.prisma.digitalHumanWork.findUnique({
      where: { id: workId },
      select: { memberId: true },
    });
    await this.startTask({
      site,
      memberId: work?.memberId || 0,
      kind: 'lipsync',
      refTable: 'works',
      refId: workId,
      runtime,
      input: { videoUrl, audioUrl, notifyUrl: '' },
      onFail: async (reason) => {
        await this.failWork(workId, reason);
      },
      onSubmitted: async (submitted) => {
        await this.prisma.digitalHumanWork.update({
          where: { id: workId },
          data: {
            lipsyncTaskId: submitted.providerTaskId,
            lipsyncStatus: submitted.finished && submitted.status === 2 ? 2 : 1,
          },
        });
        if (submitted.finished && submitted.status === 2) {
          await this.finishWork(workId, { videoUrl: submitted.resultUrl });
        } else if (submitted.finished) {
          await this.failWork(workId, submitted.error || '画面合成失败');
        }
      },
    });
  }

  /** 建任务台账 → 提交上游 → 回填任务号；提交失败立即置败并退款。 */
  private async startTask(input: {
    site: SiteRow;
    memberId: number;
    kind: DhTaskKind;
    refTable: string;
    refId: number;
    runtime: ProviderRuntime;
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
    };
    onFail: (reason: string) => Promise<void>;
    onSubmitted?: (outcome: ProviderOutcome) => Promise<void>;
  }) {
    const siteUrl = await resolveSiteUrl(this.prisma);
    if (!siteUrl) {
      await input.onFail('站点域名未配置，异步任务回调无法送达');
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，出包与异步合成回调都依赖它。请到「平台管理后台 → 站点设置 → 站点域名」填写本站对外地址',
      );
    }
    const callbackToken = dhCallbackToken();
    const task = await this.prisma.digitalHumanTask.create({
      data: {
        siteId: input.site.id,
        memberId: input.memberId,
        kind: input.kind,
        refTable: input.refTable,
        refId: input.refId,
        protocol: input.runtime.protocol,
        provider: input.runtime.protocol,
        callbackToken,
        status: 1,
        requestUrl: `${input.runtime.baseUrl}`,
        payload: {},
      },
    });
    const notifyUrl = `${siteUrl}/api/public/digital-human/notify/${callbackToken}`;
    try {
      const outcome = await submitTask(input.runtime, input.kind, {
        ...input.input,
        notifyUrl,
      });
      await this.prisma.digitalHumanTask.update({
        where: { id: task.id },
        data: {
          providerTaskId: clip(outcome.providerTaskId, 120),
          status: outcome.finished ? outcome.status : 1,
          resultUrl: clip(outcome.resultUrl, 500),
          error: clip(outcome.error, 500),
        },
      });
      if (input.onSubmitted) await input.onSubmitted(outcome);
    } catch (error) {
      const message =
        error instanceof BusinessException
          ? error.message
          : error instanceof Error
            ? error.message
            : '上游任务提交失败';
      await this.prisma.digitalHumanTask.update({
        where: { id: task.id },
        data: { status: 3, error: clip(message, 500) },
      });
      await input.onFail(message);
      throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, message);
    }
  }

  // ================= 终态处理 =================

  private async failBody(bodyId: number, reason: string) {
    const body = await this.prisma.digitalHumanBody.findUnique({
      where: { id: bodyId },
    });
    if (!body || body.status === 2) return;
    await this.prisma.digitalHumanBody.update({
      where: { id: body.id },
      data: { status: 2, failReason: clip(reason, 300) },
    });
    await this.member
      .applyBalance({
        siteId: body.siteId,
        memberId: body.memberId,
        account: 'body',
        delta: 1,
        bizType: 'refund',
        refId: body.id,
        remark: '形象克隆失败退回',
        isRefund: true,
      })
      .catch(() => undefined);
  }

  private async failVoice(voiceId: number, reason: string) {
    const voice = await this.prisma.digitalHumanVoice.findUnique({
      where: { id: voiceId },
    });
    if (!voice || voice.status === 2) return;
    await this.prisma.digitalHumanVoice.update({
      where: { id: voice.id },
      data: { status: 2, failReason: clip(reason, 300) },
    });
    await this.member
      .applyBalance({
        siteId: voice.siteId,
        memberId: voice.memberId,
        account: 'voice',
        delta: 1,
        bizType: 'refund',
        refId: voice.id,
        remark: '声音克隆失败退回',
        isRefund: true,
      })
      .catch(() => undefined);
  }

  private async failWork(workId: number, reason: string) {
    const work = await this.prisma.digitalHumanWork.findUnique({
      where: { id: workId },
    });
    if (!work || work.status === 2) return;
    const refund = work.pointCost > 0 && !work.isRefund;
    await this.prisma.digitalHumanWork.update({
      where: { id: work.id },
      data: {
        status: 2,
        stage: 'done',
        failReason: clip(reason, 300),
        isRefund: refund ? true : work.isRefund,
      },
    });
    if (refund) {
      await this.member
        .applyBalance({
          siteId: work.siteId,
          memberId: work.memberId,
          account: 'point',
          delta: work.pointCost,
          bizType: 'refund',
          refId: work.id,
          remark: '合成失败退回',
          isRefund: true,
        })
        .catch(() => undefined);
    }
  }

  private async finishWork(
    workId: number,
    result: { videoUrl?: string; audioUrl?: string },
  ) {
    const work = await this.prisma.digitalHumanWork.findUnique({
      where: { id: workId },
    });
    if (!work) return;
    await this.prisma.digitalHumanWork.update({
      where: { id: work.id },
      data: {
        status: 1,
        stage: 'done',
        ttsStatus: work.ttsStatus === 0 ? 2 : work.ttsStatus,
        lipsyncStatus: result.videoUrl ? 2 : work.lipsyncStatus,
        resultVideoUrl: clip(result.videoUrl || work.resultVideoUrl, 500),
        audioUrl: clip(result.audioUrl || work.audioUrl, 500),
        failReason: '',
      },
    });
  }

  private async requireSite(siteId: number): Promise<SiteRow> {
    const site = await this.prisma.digitalHumanSite.findUnique({
      where: { id: siteId },
    });
    if (!site) throw new BusinessException(ErrorCode.NOT_FOUND, '站点不存在');
    return site;
  }

  // ================= 管理端台账 =================

  async adminWorks(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const statusRaw = text(query.status).trim();
    const status = statusRaw === '' ? NaN : Number(statusRaw);
    const memberId = Number(query.memberId || 0);
    const keyword = text(query.keyword).trim().slice(0, 40);
    const where = {
      siteId: site.id,
      ...(Number.isInteger(status) ? { status } : {}),
      ...(memberId > 0 ? { memberId } : {}),
      ...(keyword ? { title: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanWork.count({ where }),
      this.prisma.digitalHumanWork.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.memberId),
    );
    const list: DhWorkRow[] = rows.map((row) =>
      this.workRowOf(row, nameOf.get(row.memberId) || ''),
    );
    return pageOf(list, total, page, pageSize);
  }

  async adminRemoveWork(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanWork.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '作品不存在');
    await this.prisma.digitalHumanWork.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async adminTasks(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const kind = text(query.kind).trim();
    const statusRaw = text(query.status).trim();
    const status = statusRaw === '' ? NaN : Number(statusRaw);
    const where = {
      siteId: site.id,
      ...(kind ? { kind } : {}),
      ...(Number.isInteger(status) ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanTask.count({ where }),
      this.prisma.digitalHumanTask.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const list: DhTaskRow[] = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      refTable: row.refTable,
      refId: row.refId,
      protocol: row.protocol,
      providerTaskId: row.providerTaskId,
      status: row.status,
      resultUrl: row.resultUrl,
      error: row.error,
      attempts: row.attempts,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  /**
   * 失败任务重试：仅限上游失败（status=3）且业务对象仍在失败态。
   * 重试会按原扣费重新扣除（失败时已退回），成功后按正常链路收尾。
   */
  async retryTask(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const task = await this.prisma.digitalHumanTask.findFirst({
      where: { id, siteId: site.id },
    });
    if (!task) throw new BusinessException(ErrorCode.NOT_FOUND, '任务不存在');
    if (task.status !== 3) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '仅失败任务支持重试');
    }
    if (!task.providerTaskId && !task.refId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '任务缺少关联对象，无法重试',
      );
    }
    if (task.kind === 'body-train') {
      const body = await this.prisma.digitalHumanBody.findUnique({
        where: { id: task.refId },
      });
      if (!body)
        throw new BusinessException(ErrorCode.NOT_FOUND, '形象素材已删除');
      await this.member.applyBalance({
        siteId: site.id,
        memberId: body.memberId,
        account: 'body',
        delta: -1,
        bizType: 'body',
        refId: body.id,
        remark: '形象克隆重试',
      });
      await this.prisma.digitalHumanBody.update({
        where: { id: body.id },
        data: { status: 0, failReason: '' },
      });
      const { runtime } = await this.channel.requireRuntime(
        site.userId,
        'body-train',
      );
      await this.resubmit(task, site, runtime, {
        name: body.name,
        videoUrl: body.sourceVideoUrl,
        notifyUrl: '',
      });
      return { ok: true, message: '已重新提交形象训练' };
    }
    if (task.kind === 'voice-clone') {
      const voice = await this.prisma.digitalHumanVoice.findUnique({
        where: { id: task.refId },
      });
      if (!voice)
        throw new BusinessException(ErrorCode.NOT_FOUND, '声音素材已删除');
      await this.member.applyBalance({
        siteId: site.id,
        memberId: voice.memberId,
        account: 'voice',
        delta: -1,
        bizType: 'voice',
        refId: voice.id,
        remark: '声音克隆重试',
      });
      await this.prisma.digitalHumanVoice.update({
        where: { id: voice.id },
        data: { status: 0, failReason: '' },
      });
      const { runtime } = await this.channel.requireRuntime(
        site.userId,
        'voice-clone',
      );
      await this.resubmit(task, site, runtime, {
        name: voice.name,
        audioUrl: voice.sampleAudioUrl,
        notifyUrl: '',
      });
      return { ok: true, message: '已重新提交声音克隆' };
    }
    const work = await this.prisma.digitalHumanWork.findUnique({
      where: { id: task.refId },
    });
    if (!work) throw new BusinessException(ErrorCode.NOT_FOUND, '作品已删除');
    if (task.kind === 'tts') {
      await this.member.applyBalance({
        siteId: site.id,
        memberId: work.memberId,
        account: 'point',
        delta: -work.pointCost,
        bizType: work.bodyId > 0 ? 'work' : 'tts',
        refId: work.id,
        remark: '合成重试',
      });
      await this.prisma.digitalHumanWork.update({
        where: { id: work.id },
        data: {
          status: 0,
          stage: 'tts',
          ttsStatus: 0,
          isRefund: false,
          failReason: '',
        },
      });
      const { runtime } = await this.channel.requireRuntime(site.userId, 'tts');
      await this.resubmit(task, site, runtime, {
        text: work.script,
        voiceId: work.voiceSpeakerId,
        speed: Math.min(2, Math.max(0.5, work.speed / 100)),
        notifyUrl: '',
      });
      return { ok: true, message: '已重新提交语音合成' };
    }
    if (task.kind === 'lipsync') {
      const body = await this.prisma.digitalHumanBody.findUnique({
        where: { id: work.bodyId },
        select: { sourceVideoUrl: true },
      });
      if (!body || !work.audioUrl) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '缺少形象或音频素材，无法重试',
        );
      }
      await this.member.applyBalance({
        siteId: site.id,
        memberId: work.memberId,
        account: 'point',
        delta: -work.pointCost,
        bizType: 'work',
        refId: work.id,
        remark: '合成重试',
      });
      await this.prisma.digitalHumanWork.update({
        where: { id: work.id },
        data: {
          status: 0,
          stage: 'lipsync',
          lipsyncStatus: 0,
          isRefund: false,
          failReason: '',
        },
      });
      const { runtime } = await this.channel.requireRuntime(
        site.userId,
        'lipsync',
      );
      await this.resubmit(task, site, runtime, {
        videoUrl: body.sourceVideoUrl,
        audioUrl: work.audioUrl,
        notifyUrl: '',
      });
      return { ok: true, message: '已重新提交画面合成' };
    }
    throw new BusinessException(ErrorCode.BAD_REQUEST, '该类型任务不支持重试');
  }

  private async resubmit(
    task: TaskRow,
    site: SiteRow,
    runtime: ProviderRuntime,
    input: {
      name?: string;
      audioUrl?: string;
      videoUrl?: string;
      text?: string;
      voiceId?: string;
      speed?: number;
      notifyUrl: string;
    },
  ) {
    const siteUrl = await resolveSiteUrl(this.prisma);
    if (!siteUrl) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点域名未配置，异步回调无法送达，请先补充站点域名',
      );
    }
    const notifyUrl = `${siteUrl}/api/public/digital-human/notify/${task.callbackToken}`;
    await this.prisma.digitalHumanTask.update({
      where: { id: task.id },
      data: {
        status: 1,
        error: '',
        attempts: { increment: 1 },
        protocol: runtime.protocol,
        provider: runtime.protocol,
      },
    });
    try {
      const outcome = await submitTask(runtime, task.kind as DhTaskKind, {
        ...input,
        notifyUrl,
      });
      await this.prisma.digitalHumanTask.update({
        where: { id: task.id },
        data: {
          providerTaskId: clip(outcome.providerTaskId, 120),
          status: outcome.finished ? outcome.status : 1,
          resultUrl: clip(outcome.resultUrl, 500),
        },
      });
      if (outcome.finished && outcome.status === 2) {
        const fresh = await this.prisma.digitalHumanTask.findUnique({
          where: { id: task.id },
        });
        if (fresh) await this.applyOutcome(fresh, outcome);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '上游任务提交失败';
      await this.prisma.digitalHumanTask.update({
        where: { id: task.id },
        data: { status: 3, error: clip(message, 500) },
      });
      throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, message);
    }
    void site;
  }

  // ================= 行映射 =================

  private async bodyRow(id: number): Promise<DhBodyRow> {
    const row = await this.prisma.digitalHumanBody.findUnique({
      where: { id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '形象不存在');
    const member = await this.prisma.digitalHumanMember.findUnique({
      where: { id: row.memberId },
      select: { nickname: true },
    });
    return this.bodyRowOf(row, member?.nickname || '');
  }

  private async voiceRow(id: number): Promise<DhVoiceRow> {
    const row = await this.prisma.digitalHumanVoice.findUnique({
      where: { id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '声音不存在');
    const member = await this.prisma.digitalHumanMember.findUnique({
      where: { id: row.memberId },
      select: { nickname: true },
    });
    return this.voiceRowOf(row, member?.nickname || '');
  }

  private async workRow(id: number): Promise<DhWorkRow> {
    const row = await this.prisma.digitalHumanWork.findUnique({
      where: { id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '作品不存在');
    const member = await this.prisma.digitalHumanMember.findUnique({
      where: { id: row.memberId },
      select: { nickname: true },
    });
    return this.workRowOf(row, member?.nickname || '');
  }

  private bodyRowOf(
    row: NonNullable<
      Awaited<ReturnType<PrismaService['digitalHumanBody']['findUnique']>>
    >,
    nickname: string,
  ): DhBodyRow {
    return {
      id: row.id,
      memberId: row.memberId,
      nickname,
      name: row.name,
      sourceVideoUrl: row.sourceVideoUrl,
      coverUrl: row.coverUrl,
      durationSec: row.durationSec,
      status: row.status,
      failReason: row.failReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private voiceRowOf(
    row: NonNullable<
      Awaited<ReturnType<PrismaService['digitalHumanVoice']['findUnique']>>
    >,
    nickname: string,
  ): DhVoiceRow {
    return {
      id: row.id,
      memberId: row.memberId,
      nickname,
      name: row.name,
      sampleAudioUrl: row.sampleAudioUrl,
      demoAudioUrl: row.demoAudioUrl,
      status: row.status,
      failReason: row.failReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private workRowOf(
    row: NonNullable<
      Awaited<ReturnType<PrismaService['digitalHumanWork']['findUnique']>>
    >,
    nickname: string,
  ): DhWorkRow {
    return {
      id: row.id,
      memberId: row.memberId,
      nickname,
      title: row.title,
      bodyId: row.bodyId,
      voiceSource: row.voiceSource,
      voiceId: row.voiceId,
      audioType: row.audioType,
      script: row.script,
      status: row.status,
      stage: row.stage,
      resultVideoUrl: row.resultVideoUrl,
      audioUrl: row.audioUrl,
      coverUrl: row.coverUrl,
      durationSec: row.durationSec,
      pointCost: row.pointCost,
      isRefund: row.isRefund,
      failReason: row.failReason,
      playCount: row.playCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // 站点级资产台账（管理端）
  async adminBodies(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const memberId = Number(query.memberId || 0);
    const statusRaw = text(query.status).trim();
    const status = statusRaw === '' ? NaN : Number(statusRaw);
    const where = {
      siteId: site.id,
      ...(memberId > 0 ? { memberId } : {}),
      ...(Number.isInteger(status) ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanBody.count({ where }),
      this.prisma.digitalHumanBody.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.memberId),
    );
    return pageOf(
      rows.map((row) => this.bodyRowOf(row, nameOf.get(row.memberId) || '')),
      total,
      page,
      pageSize,
    );
  }

  async adminVoices(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.member.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const memberId = Number(query.memberId || 0);
    const statusRaw = text(query.status).trim();
    const status = statusRaw === '' ? NaN : Number(statusRaw);
    const where = {
      siteId: site.id,
      ...(memberId > 0 ? { memberId } : {}),
      ...(Number.isInteger(status) ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanVoice.count({ where }),
      this.prisma.digitalHumanVoice.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.member.nameMap(
      site.id,
      rows.map((row) => row.memberId),
    );
    return pageOf(
      rows.map((row) => this.voiceRowOf(row, nameOf.get(row.memberId) || '')),
      total,
      page,
      pageSize,
    );
  }

  async adminRemoveAsset(
    user: CurrentUser,
    table: 'bodies' | 'voices',
    id: number,
  ) {
    const site = await this.member.siteOfOwner(user.userId);
    if (table === 'bodies') {
      const row = await this.prisma.digitalHumanBody.findFirst({
        where: { id, siteId: site.id },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '形象不存在');
      await this.prisma.digitalHumanBody.delete({ where: { id: row.id } });
    } else {
      const row = await this.prisma.digitalHumanVoice.findFirst({
        where: { id, siteId: site.id },
      });
      if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '声音不存在');
      await this.prisma.digitalHumanVoice.delete({ where: { id: row.id } });
    }
    return { ok: true };
  }
}
