import type {
  DhBgmGroupInput,
  DhBgmGroupRow,
  DhBgmInput,
  DhBgmRow,
  DhPresetVoiceInput,
  DhPresetVoiceRow,
  DhVoiceGroupInput,
  DhVoiceGroupRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { clip } from './dh.shared';
import type { DhMemberService } from './dh.member.service';

/**
 * 公共素材库：TTS 音色（分组 + 音色）与背景音乐（分组 + 曲目）。
 *
 * siteId=0 是平台全局库，所有站点可见但只读；站点自建行 siteId 为本站。
 * 管理端只能改自己的行；C 端只看到启用项。
 */
export class DhLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly member: DhMemberService,
  ) {}

  // ---------------- 音色分组 ----------------

  async voiceGroups(user: CurrentUser): Promise<DhVoiceGroupRow[]> {
    const site = await this.member.siteOfOwner(user.userId);
    const rows = await this.prisma.digitalHumanVoiceGroup.findMany({
      where: { siteId: { in: [0, site.id] } },
      orderBy: [{ siteId: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      take: 300,
    });
    const counts = rows.length
      ? await this.prisma.digitalHumanPresetVoice.groupBy({
          by: ['groupId'],
          where: { groupId: { in: rows.map((row) => row.id) } },
          _count: { _all: true },
        })
      : [];
    const countOf = new Map(
      counts.map((row) => [row.groupId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      sort: row.sort,
      enabled: row.enabled,
      voiceCount: countOf.get(row.id) || 0,
    }));
  }

  async saveVoiceGroup(user: CurrentUser, body: DhVoiceGroupInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const name = clip(body.name, 60);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写分组名称');
    const existing = body.id
      ? await this.prisma.digitalHumanVoiceGroup.findFirst({
          where: { id: body.id, siteId: site.id },
        })
      : null;
    if (body.id && !existing) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '分组不存在或为平台全局分组（只读）',
      );
    }
    const row = existing
      ? await this.prisma.digitalHumanVoiceGroup.update({
          where: { id: existing.id },
          data: { name, sort: body.sort, enabled: body.enabled },
        })
      : await this.prisma.digitalHumanVoiceGroup.create({
          data: {
            siteId: site.id,
            name,
            sort: body.sort,
            enabled: body.enabled,
          },
        });
    return {
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      sort: row.sort,
      enabled: row.enabled,
      voiceCount: await this.prisma.digitalHumanPresetVoice.count({
        where: { groupId: row.id },
      }),
    } satisfies DhVoiceGroupRow;
  }

  async removeVoiceGroup(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanVoiceGroup.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '分组不存在或为平台全局分组（只读）',
      );
    const used = await this.prisma.digitalHumanPresetVoice.count({
      where: { groupId: row.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `分组下还有 ${used} 个音色，请先移出或删除后再删分组`,
      );
    }
    await this.prisma.digitalHumanVoiceGroup.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------------- 公共音色 ----------------

  async presetVoices(
    user: CurrentUser,
    groupId?: number,
  ): Promise<DhPresetVoiceRow[]> {
    const site = await this.member.siteOfOwner(user.userId);
    const rows = await this.prisma.digitalHumanPresetVoice.findMany({
      where: {
        siteId: { in: [0, site.id] },
        ...(groupId ? { groupId } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return rows.map((row) => this.presetRow(row));
  }

  async savePresetVoice(user: CurrentUser, body: DhPresetVoiceInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const speakerId = clip(body.speakerId, 120);
    if (!speakerId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写供应商音色标识',
      );
    }
    const groupId = Math.max(0, Math.round(body.groupId || 0));
    if (groupId) {
      const group = await this.prisma.digitalHumanVoiceGroup.findFirst({
        where: { id: groupId, siteId: { in: [0, site.id] } },
        select: { id: true },
      });
      if (!group)
        throw new BusinessException(ErrorCode.BAD_REQUEST, '音色分组不存在');
    }
    const existing = body.id
      ? await this.prisma.digitalHumanPresetVoice.findFirst({
          where: { id: body.id, siteId: site.id },
        })
      : null;
    if (body.id && !existing) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '音色不存在或为平台全局音色（只读）',
      );
    }
    const data = {
      siteId: site.id,
      groupId,
      name: clip(body.name, 60),
      speakerId,
      gender: clip(body.gender, 8),
      language: clip(body.language, 16) || 'zh',
      demoUrl: clip(body.demoUrl, 500),
      tags: clip(body.tags, 120),
      sort: body.sort,
      enabled: body.enabled,
    };
    const row = existing
      ? await this.prisma.digitalHumanPresetVoice.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.digitalHumanPresetVoice.create({ data });
    return this.presetRow(row);
  }

  async removePresetVoice(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanPresetVoice.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '音色不存在或为平台全局音色（只读）',
      );
    await this.prisma.digitalHumanPresetVoice.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------------- BGM ----------------

  async bgmGroups(user: CurrentUser): Promise<DhBgmGroupRow[]> {
    const site = await this.member.siteOfOwner(user.userId);
    const rows = await this.prisma.digitalHumanBgmGroup.findMany({
      where: { siteId: { in: [0, site.id] } },
      orderBy: [{ siteId: 'asc' }, { sort: 'asc' }, { id: 'asc' }],
      take: 300,
    });
    const counts = rows.length
      ? await this.prisma.digitalHumanBgm.groupBy({
          by: ['groupId'],
          where: { groupId: { in: rows.map((row) => row.id) } },
          _count: { _all: true },
        })
      : [];
    const countOf = new Map(
      counts.map((row) => [row.groupId, row._count._all]),
    );
    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      sort: row.sort,
      enabled: row.enabled,
      bgmCount: countOf.get(row.id) || 0,
    }));
  }

  async saveBgmGroup(user: CurrentUser, body: DhBgmGroupInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const name = clip(body.name, 60);
    if (!name)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写分组名称');
    const existing = body.id
      ? await this.prisma.digitalHumanBgmGroup.findFirst({
          where: { id: body.id, siteId: site.id },
        })
      : null;
    if (body.id && !existing) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '分组不存在或为平台全局分组（只读）',
      );
    }
    const row = existing
      ? await this.prisma.digitalHumanBgmGroup.update({
          where: { id: existing.id },
          data: { name, sort: body.sort, enabled: body.enabled },
        })
      : await this.prisma.digitalHumanBgmGroup.create({
          data: {
            siteId: site.id,
            name,
            sort: body.sort,
            enabled: body.enabled,
          },
        });
    return {
      id: row.id,
      siteId: row.siteId,
      name: row.name,
      sort: row.sort,
      enabled: row.enabled,
      bgmCount: await this.prisma.digitalHumanBgm.count({
        where: { groupId: row.id },
      }),
    } satisfies DhBgmGroupRow;
  }

  async removeBgmGroup(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanBgmGroup.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '分组不存在或为平台全局分组（只读）',
      );
    const used = await this.prisma.digitalHumanBgm.count({
      where: { groupId: row.id },
    });
    if (used > 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `分组下还有 ${used} 首背景音乐，请先移出或删除后再删分组`,
      );
    }
    await this.prisma.digitalHumanBgmGroup.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async bgms(user: CurrentUser, groupId?: number): Promise<DhBgmRow[]> {
    const site = await this.member.siteOfOwner(user.userId);
    const rows = await this.prisma.digitalHumanBgm.findMany({
      where: {
        siteId: { in: [0, site.id] },
        ...(groupId ? { groupId } : {}),
      },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      groupId: row.groupId,
      name: row.name,
      url: row.url,
      durationSec: row.durationSec,
      sort: row.sort,
      enabled: row.enabled,
    }));
  }

  async saveBgm(user: CurrentUser, body: DhBgmInput) {
    const site = await this.member.siteOfOwner(user.userId);
    const url = clip(body.url, 500);
    if (!url)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请上传或填写音频地址',
      );
    const groupId = Math.max(0, Math.round(body.groupId || 0));
    if (groupId) {
      const group = await this.prisma.digitalHumanBgmGroup.findFirst({
        where: { id: groupId, siteId: { in: [0, site.id] } },
        select: { id: true },
      });
      if (!group)
        throw new BusinessException(ErrorCode.BAD_REQUEST, 'BGM 分组不存在');
    }
    const existing = body.id
      ? await this.prisma.digitalHumanBgm.findFirst({
          where: { id: body.id, siteId: site.id },
        })
      : null;
    if (body.id && !existing) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '曲目不存在或为平台全局曲目（只读）',
      );
    }
    const data = {
      siteId: site.id,
      groupId,
      name: clip(body.name, 80),
      url,
      durationSec: body.durationSec,
      sort: body.sort,
      enabled: body.enabled,
    };
    const row = existing
      ? await this.prisma.digitalHumanBgm.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.digitalHumanBgm.create({ data });
    return {
      id: row.id,
      siteId: row.siteId,
      groupId: row.groupId,
      name: row.name,
      url: row.url,
      durationSec: row.durationSec,
      sort: row.sort,
      enabled: row.enabled,
    } satisfies DhBgmRow;
  }

  async removeBgm(user: CurrentUser, id: number) {
    const site = await this.member.siteOfOwner(user.userId);
    const row = await this.prisma.digitalHumanBgm.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row)
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '曲目不存在或为平台全局曲目（只读）',
      );
    await this.prisma.digitalHumanBgm.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------------- C 端 ----------------

  /** C 端音色库：只回启用项，平台全局 + 本站自建，分组名一并下发。 */
  async publicVoices(siteId: number) {
    const groups = await this.prisma.digitalHumanVoiceGroup.findMany({
      where: { siteId: { in: [0, siteId] }, enabled: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    const voices = await this.prisma.digitalHumanPresetVoice.findMany({
      where: { siteId: { in: [0, siteId] }, enabled: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return groups
      .map((group) => ({
        id: group.id,
        name: group.name,
        voices: voices
          .filter((voice) => voice.groupId === group.id)
          .map((voice) => ({
            id: voice.id,
            name: voice.name,
            speakerId: voice.speakerId,
            gender: voice.gender,
            language: voice.language,
            demoUrl: voice.demoUrl,
          })),
      }))
      .filter((group) => group.voices.length > 0);
  }

  async publicBgms(siteId: number) {
    const rows = await this.prisma.digitalHumanBgm.findMany({
      where: { siteId: { in: [0, siteId] }, enabled: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      durationSec: row.durationSec,
    }));
  }

  private presetRow(row: {
    id: number;
    siteId: number;
    groupId: number;
    name: string;
    speakerId: string;
    gender: string;
    language: string;
    demoUrl: string;
    tags: string;
    sort: number;
    enabled: boolean;
  }): DhPresetVoiceRow {
    return {
      id: row.id,
      siteId: row.siteId,
      groupId: row.groupId,
      name: row.name,
      speakerId: row.speakerId,
      gender: row.gender,
      language: row.language,
      demoUrl: row.demoUrl,
      tags: row.tags,
      sort: row.sort,
      enabled: row.enabled,
    };
  }
}
