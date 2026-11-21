import {
  DH_CHANNEL_CAPABILITIES,
  DH_CHANNEL_PROTOCOLS,
  type DhChannelCapability,
  type DhChannelInput,
  type DhChannelProtocol,
  type DhChannelRow,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { MiniAppCrypto } from '../private-mini/mini-app-crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { clip } from './dh.shared';
import {
  PROVIDER_DEFAULT_BASE_URL,
  probeChannel,
  type ProviderRuntime,
} from './dh.provider';

type ChannelRow = {
  id: number;
  userId: string;
  capability: string;
  protocol: string;
  name: string;
  baseUrl: string;
  keyCipher: string;
  modelTier: string;
  secretCipher: string;
  enabled: boolean;
  isDefault: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
};

function capabilityOf(value: string): DhChannelCapability {
  for (const item of DH_CHANNEL_CAPABILITIES) {
    if (item === value) return item;
  }
  throw new BusinessException(ErrorCode.BAD_REQUEST, '渠道能力取值不对');
}

function protocolOf(value: string): DhChannelProtocol {
  for (const item of DH_CHANNEL_PROTOCOLS) {
    if (item === value) return item;
  }
  throw new BusinessException(ErrorCode.BAD_REQUEST, '渠道协议取值不对');
}

/**
 * 数字人模型渠道服务：本站「模型配置」范式在数字人域的落地
 * （形象训练 / 声音克隆 / TTS / 对口型 四类能力，各自一条默认渠道生效）。
 *
 * 口径与小程序主体凭据一致：密钥 AES-256-GCM 密文入库，任何出参只回
 * `keyConfigured`；改 baseUrl/key 后清空自检结论，强制重测。
 */
export class DhChannelService {
  private readonly crypto = new MiniAppCrypto();

  constructor(private readonly prisma: PrismaService) {}

  private scope(userId: string, idOrName: number | string, field: string) {
    return `dh-channel:${userId}:${String(idOrName)}:${field}`;
  }

  private keepOr(
    currentCipher: string,
    next: string | undefined,
    scope: string,
  ) {
    const plain = String(next ?? '').trim();
    if (!plain) return currentCipher || '';
    return this.crypto.encrypt(scope, plain.slice(0, 512));
  }

  private toRow(
    row: ChannelRow,
    keyConfigured: boolean,
    secretConfigured: boolean,
  ): DhChannelRow {
    return {
      id: row.id,
      capability: capabilityOf(row.capability),
      protocol: protocolOf(row.protocol),
      name: row.name,
      baseUrl: row.baseUrl,
      modelTier: row.modelTier,
      keyConfigured,
      secretConfigured,
      enabled: row.enabled,
      isDefault: row.isDefault,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(user: CurrentUser, capability?: string): Promise<DhChannelRow[]> {
    const rows = await this.prisma.digitalHumanChannel.findMany({
      where: {
        userId: user.userId,
        ...(capability ? { capability } : {}),
      },
      orderBy: [{ capability: 'asc' }, { isDefault: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    return rows.map((row) =>
      this.toRow(row, Boolean(row.keyCipher), Boolean(row.secretCipher)),
    );
  }

  async save(user: CurrentUser, body: DhChannelInput): Promise<DhChannelRow> {
    const capability = capabilityOf(String(body.capability || ''));
    const protocol = protocolOf(String(body.protocol || 'fox'));
    const name = clip(body.name, 64);
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写渠道名称');
    }
    const baseUrl = clip(body.baseUrl, 300);
    if (protocol === 'custom' && baseUrl && !/^https:\/\//i.test(baseUrl)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '接口地址必须使用 https，凭据与任务数据不允许明文传输',
      );
    }
    const modelTier = clip(body.modelTier, 64);
    const existing = body.id
      ? await this.prisma.digitalHumanChannel.findFirst({
          where: { id: body.id, userId: user.userId },
        })
      : null;
    if (body.id && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '渠道不存在');
    }
    const dup = await this.prisma.digitalHumanChannel.findFirst({
      where: {
        userId: user.userId,
        capability,
        name,
        ...(existing ? { id: { not: existing.id } } : {}),
      },
    });
    if (dup) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `同一能力下已有同名渠道「${name}」，请换个名称`,
      );
    }
    const scopeBase = existing ? existing.id : `${capability}:${name}`;
    const data = {
      userId: user.userId,
      capability,
      protocol,
      name,
      baseUrl,
      modelTier,
      keyCipher: this.keepOr(
        existing?.keyCipher || '',
        body.key,
        this.scope(user.userId, scopeBase, 'key'),
      ),
      secretCipher: this.keepOr(
        existing?.secretCipher || '',
        body.secret,
        this.scope(user.userId, scopeBase, 'secret'),
      ),
      enabled: body.enabled !== false,
      isDefault: body.isDefault === true,
    };
    const row = existing
      ? await this.prisma.digitalHumanChannel.update({
          where: { id: existing.id },
          data: {
            ...data,
            // 换地址或换密钥等于换通道：自检结论作废，强制重测后才允许投任务
            ...(existing.baseUrl !== baseUrl || body.key
              ? { verifiedAt: null }
              : {}),
          },
        })
      : await this.prisma.digitalHumanChannel.create({ data });
    if (row.isDefault) {
      await this.prisma.digitalHumanChannel.updateMany({
        where: { userId: user.userId, capability, id: { not: row.id } },
        data: { isDefault: false },
      });
    }
    return this.toRow(row, Boolean(row.keyCipher), Boolean(row.secretCipher));
  }

  async remove(user: CurrentUser, id: number) {
    const row = await this.prisma.digitalHumanChannel.findFirst({
      where: { id, userId: user.userId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '渠道不存在');
    await this.prisma.digitalHumanChannel.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async test(user: CurrentUser, id: number) {
    const row = await this.prisma.digitalHumanChannel.findFirst({
      where: { id, userId: user.userId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '渠道不存在');
    const runtime = this.runtimeOf(row);
    const result = await probeChannel(runtime);
    await this.prisma.digitalHumanChannel.update({
      where: { id: row.id },
      data: { verifiedAt: result.ok ? new Date() : null },
    });
    return result;
  }

  /** 任务发起用：默认渠道优先，缺省回落该能力下最早启用的一条；没有就报指引。 */
  async requireRuntime(userId: string, capability: string) {
    const row = await this.pickChannel(userId, capability);
    if (!row) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `尚未配置可用的「${capabilityLabel(capability)}」渠道，请到数字人工具「模型渠道」添加并启用`,
      );
    }
    return { rowId: row.id, runtime: this.runtimeOf(row) };
  }

  async peekRuntime(userId: string, capability: string) {
    const row = await this.pickChannel(userId, capability);
    return row ? this.runtimeOf(row) : null;
  }

  /** webhook 校验密钥（渠道级共享；一个供应商账号配一条渠道即可）。 */
  async channelSecret(userId: string, channelId: number): Promise<string> {
    const row = await this.prisma.digitalHumanChannel.findFirst({
      where: { id: channelId, userId },
    });
    if (!row?.secretCipher) return '';
    return this.crypto.decrypt(
      this.scope(userId, row.id, 'secret'),
      row.secretCipher,
    );
  }

  private async pickChannel(userId: string, capability: string) {
    const rows = await this.prisma.digitalHumanChannel.findMany({
      where: { userId, capability, enabled: true },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      take: 2,
    });
    return rows[0] || null;
  }

  private runtimeOf(row: ChannelRow): ProviderRuntime {
    const protocol = protocolOf(row.protocol);
    const apiKey = row.keyCipher
      ? this.crypto.decrypt(
          this.scope(row.userId, row.id, 'key'),
          row.keyCipher,
        )
      : '';
    return {
      protocol,
      baseUrl: row.baseUrl || PROVIDER_DEFAULT_BASE_URL[protocol] || '',
      apiKey,
      modelTier: row.modelTier,
    };
  }
}

function capabilityLabel(value: string): string {
  if (value === 'voice-clone') return '声音克隆';
  if (value === 'body-train') return '形象训练';
  if (value === 'tts') return '语音合成';
  if (value === 'lipsync') return '对口型';
  return value;
}
