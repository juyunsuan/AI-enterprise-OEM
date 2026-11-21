import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { httpRequest } from '../http/transport';
import { AccountCrypto } from './account-crypto';
import { SiteSettingsService } from '../platform/site-settings.service';

/** AIPDD 平台签发的 APIKey 形态（与 enterprise 原 apikey.service 口径一致）。 */
const AIPDD_KEY_PATTERN = /^sk-[a-fA-F0-9]{48}$/;

/**
 * 平台级 AIPDD APIKey 的专用配置键（system_settings 存 AES-256-GCM 密文）：
 * 供「基础数据」通道使用（省市字典、平台字典项等参照数据），
 * 禁止通过通用系统参数接口读取或覆盖（见 admin/admin.service.ts 的隔离）。
 */
export const AIPDD_PLATFORM_KEY_SETTINGS = 'aipdd_platform_key';

/** 注册引导地址：env 可覆盖，但只认 http/https 协议，非法值回落默认官网，避免部署方误配出可点脚本链接。 */
function safeRegisterUrl(): string {
  const fallback = 'https://www.aipdd.work';
  let url: URL;
  try {
    url = new URL(process.env.AIPDD_REGISTER_URL || fallback);
  } catch {
    return fallback;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
  return url.toString().replace(/\/$/, '');
}

type VerifyEnvelope = {
  code?: number;
  data?: {
    userId?: string;
    id?: string;
    username?: string;
    nickName?: string;
    avatar?: string;
  } | null;
};

/**
 * AIPDD APIKey 绑定（N:1）：多个本地用户可绑同一把上游 Key，按 SHA-256 指纹归并；
 * 密文落库（AES-256-GCM），任何接口永不回显原文。
 * `resolveToken()` 是全系统访问上游的唯一凭证入口（M3 会把各模块接到这里）。
 */
export class AipddKeyService {
  private readonly crypto = new AccountCrypto();

  constructor(private readonly prisma: PrismaService) {}

  /** 验真：以 Bearer <key> 请求上游用户信息；开发态可 AIPDD_KEY_VERIFY=off 跳过。 */
  private async verify(key: string): Promise<{
    aipddUserId: string;
    profile: Prisma.InputJsonObject | null;
  }> {
    if (process.env.AIPDD_KEY_VERIFY === 'off') {
      // 冒烟/离线开发：不请求上游，用指纹派生一个稳定的占位身份
      const fakeId = createHash('sha256')
        .update(key)
        .digest('hex')
        .slice(0, 12);
      return { aipddUserId: `dev-${fakeId}`, profile: null };
    }
    const base = (
      process.env.AIPDD_KEY_VERIFY_URL ||
      `${process.env.JAVA_BASE_URL || 'https://api.aipdd.work'}/user/info`
    ).replace(/\/$/, '');
    let response;
    try {
      response = await httpRequest<VerifyEnvelope>(base, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        cache: 'no-store',
        timeoutMs: Number(process.env.AIPDD_VERIFY_TIMEOUT_MS || 8000),
        operation: 'aipdd:key-verify',
      });
    } catch {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'AIPDD 验真服务暂时不可用，请稍后重试',
      );
    }
    const data = response.data?.data;
    if (response.ok && response.data?.code === 0 && data) {
      const userId = String(data.userId ?? data.id ?? '').trim();
      if (userId) {
        return {
          aipddUserId: userId,
          profile: {
            username: data.username || '',
            nickName: data.nickName || '',
            avatar: data.avatar || '',
          },
        };
      }
    }
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      'AIPDD APIKey 验证失败：请检查 Key 是否有效',
    );
  }

  /** 绑定/追加：验真 → 指纹归并 → 加密落库 → 按 (用户, Key) 建绑定；不删除既有 Key。 */
  async bind(userId: string, plainKey: string) {
    const key = plainKey.trim();
    if (!AIPDD_KEY_PATTERN.test(key)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'AIPDD APIKey 格式不正确（应为 sk- 开头的 51 位字符）',
      );
    }
    const identity = await this.verify(key);
    const fingerprint = this.crypto.fingerprint(key);
    const existing = await this.prisma.aipddKey.findUnique({
      where: { keyFingerprint: fingerprint },
    });
    const keyRow = existing
      ? await this.prisma.aipddKey.update({
          where: { id: existing.id },
          data: {
            keyCipher: this.crypto.encrypt(key),
            aipddUserId: identity.aipddUserId,
            ...(identity.profile ? { aipddProfile: identity.profile } : {}),
            status: 'ACTIVE',
            lastVerifiedAt: new Date(),
          },
        })
      : await this.prisma.aipddKey.create({
          data: {
            keyFingerprint: fingerprint,
            keyCipher: this.crypto.encrypt(key),
            aipddUserId: identity.aipddUserId,
            ...(identity.profile ? { aipddProfile: identity.profile } : {}),
            lastVerifiedAt: new Date(),
          },
        });
    const boundAt = new Date();
    await this.prisma.userAipddBinding.upsert({
      where: { userId_keyId: { userId, keyId: keyRow.id } },
      create: { userId, keyId: keyRow.id, boundAt },
      update: { boundAt },
    });
    await this.prisma.auditLog
      .create({
        data: {
          userId,
          action: 'AIPDD_KEY_BOUND',
          detail: `key#${keyRow.id} aipdd=${identity.aipddUserId}`,
        },
      })
      .catch(() => undefined);
    return this.status(userId);
  }

  /**
   * 注册引导信息（绑定页展示）：上游官网地址 + 管理员在站点设置里配置的 AIPDD 推荐码。
   * 推荐码本就是对外分享拉新用的（佣金归管理员、新用户得算力），对已登录用户明文回传。
   */
  private async referralInfo() {
    const site = new SiteSettingsService(this.prisma);
    const settings = await site.view();
    return {
      registerUrl: safeRegisterUrl(),
      referralCode: settings.aipddReferralCode,
    };
  }

  /** 用户的全部 Key 绑定（按绑定时间升序；最早绑定的可用 Key 为主 Key）。 */
  private async bindingsOf(userId: string) {
    const bindings = await this.prisma.userAipddBinding.findMany({
      where: { userId },
      orderBy: { boundAt: 'asc' },
    });
    if (!bindings.length) return [];
    const keys = await this.prisma.aipddKey.findMany({
      where: { id: { in: bindings.map((row) => row.keyId) } },
    });
    const byId = new Map(keys.map((key) => [key.id, key]));
    const items: Array<{
      binding: (typeof bindings)[number];
      key: (typeof keys)[number];
    }> = [];
    for (const binding of bindings) {
      const key = byId.get(binding.keyId);
      if (key) items.push({ binding, key });
    }
    return items;
  }

  /** 当前绑定状态（脱敏）：永不返回原文；keys 为全部绑定，bound 表示至少一把可用。 */
  async status(userId: string) {
    const referral = await this.referralInfo();
    const items = await this.bindingsOf(userId);
    if (!items.length) return { bound: false as const, keys: [], ...referral };
    const shared = await Promise.all(
      items.map((item) =>
        this.prisma.userAipddBinding.count({
          where: { keyId: item.key.id },
        }),
      ),
    );
    const primary = items.find((item) => item.key.status === 'ACTIVE');
    const keys = items.map((item, index) => ({
      bindingId: item.binding.id,
      keyId: item.key.id,
      masked: this.mask(item.key.keyCipher),
      aipddUserId: item.key.aipddUserId || '',
      profile: item.key.aipddProfile ?? null,
      boundAt: item.binding.boundAt.toISOString(),
      lastVerifiedAt: item.key.lastVerifiedAt?.toISOString() || null,
      status: item.key.status,
      /** 同一把上游 Key 当前被多少个本地用户绑定（N:1 可见性）。 */
      sharedWith: shared[index] || 0,
      primary: primary?.key.id === item.key.id,
    }));
    const head = primary || items[0];
    return {
      bound: Boolean(primary),
      masked: this.mask(head.key.keyCipher),
      aipddUserId: head.key.aipddUserId || '',
      profile: head.key.aipddProfile ?? null,
      boundAt: head.binding.boundAt.toISOString(),
      lastVerifiedAt: head.key.lastVerifiedAt?.toISOString() || null,
      sharedWith: shared[items.indexOf(head)] || 0,
      keys,
      ...referral,
    };
  }

  /** 解绑指定 Key；不传 keyId 时清空该用户全部绑定（兼容旧调用）。 */
  async unbind(userId: string, keyId?: number) {
    const deleted = await this.prisma.userAipddBinding.deleteMany({
      where: { userId, ...(keyId ? { keyId } : {}) },
    });
    if (!deleted.count)
      throw new BusinessException(ErrorCode.NOT_FOUND, '尚未绑定 AIPDD APIKey');
    await this.prisma.auditLog
      .create({
        data: {
          userId,
          action: 'AIPDD_KEY_UNBOUND',
          detail: keyId ? `key#${keyId}` : `all(${deleted.count})`,
        },
      })
      .catch(() => undefined);
    return { unbound: true, count: deleted.count };
  }

  /** 主 Key：最早绑定的可用 Key；新增 Key 只用于通知聚合，不改变模型/计费通道。 */
  private async primaryKeyOf(userId: string) {
    const items = await this.bindingsOf(userId);
    return items.find((item) => item.key.status === 'ACTIVE')?.key || null;
  }

  /** 全部可用绑定（通知按 Key 所属账号聚合时使用；明文只在调用栈内存活）。 */
  async activeBindings(userId: string) {
    const items = await this.bindingsOf(userId);
    const out: Array<{
      keyId: number;
      aipddUserId: string;
      boundAt: Date;
      plain: string;
    }> = [];
    for (const item of items) {
      if (item.key.status !== 'ACTIVE') continue;
      try {
        out.push({
          keyId: item.key.id,
          aipddUserId: String(item.key.aipddUserId || ''),
          boundAt: item.binding.boundAt,
          plain: this.crypto.decrypt(item.key.keyCipher),
        });
      } catch {
        // 单把 Key 密文损坏时跳过，不影响其他 Key 的通知与调用。
      }
    }
    return out;
  }

  /** 指定 Key 的明文（通知标记已读要用到具体 Key）。 */
  async resolveTokenForKey(keyId: number): Promise<string> {
    const key = await this.prisma.aipddKey.findUnique({
      where: { id: keyId },
    });
    if (!key || key.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '指定的 AIPDD APIKey 已失效，请重新绑定',
      );
    }
    return this.crypto.decrypt(key.keyCipher);
  }

  /**
   * 凭证解析器（全系统唯一入口）：本地用户 → 最早绑定的可用 Key → 解密出上游 Bearer 令牌。
   * 未绑定时抛业务错误，前端引导去「模型服务 → API Key 管理」页绑定。
   */
  async resolveToken(userId: string): Promise<string> {
    const key = await this.primaryKeyOf(userId);
    if (!key) {
      const items = await this.bindingsOf(userId);
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        items.length
          ? '绑定的 AIPDD APIKey 已失效，请重新绑定'
          : '请先在「模型服务 → API Key 管理」绑定 AIPDD API Key，再使用需要同步上游的功能',
      );
    }
    return this.crypto.decrypt(key.keyCipher);
  }

  /** 主 Key 对应的 AIPDD 用户身份（模型配置贯通用：取最早绑定的可用 Key）。 */
  async resolveAipddUserId(userId: string): Promise<string> {
    const key = await this.primaryKeyOf(userId);
    return key ? String(key.aipddUserId || '') : '';
  }

  // ---------- 平台级 AIPDD APIKey（基础数据通道） ----------

  /**
   * 平台 Key 状态（管理后台展示）：只回掩码与来源，永不回显原文。
   * 环境变量 `AIPDD_PLATFORM_KEY` 是部署兜底，后台保存过则以库内密文为准。
   */
  async platformKeyView() {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: AIPDD_PLATFORM_KEY_SETTINGS },
    });
    if (row?.value) {
      return {
        configured: true as const,
        source: 'db' as const,
        masked: this.mask(row.value),
        updatedAt: row.updatedAt.toISOString(),
      };
    }
    const env = String(process.env.AIPDD_PLATFORM_KEY || '').trim();
    if (env) {
      return {
        configured: true as const,
        source: 'env' as const,
        masked: this.maskPlain(env),
        updatedAt: null,
      };
    }
    return {
      configured: false as const,
      source: 'none' as const,
      masked: '',
      updatedAt: null,
    };
  }

  /** 保存 / 换绑平台 Key：格式校验 → 在线验真（AIPDD_KEY_VERIFY=off 时跳过）→ 加密落库。 */
  async savePlatformKey(userId: string, plainKey: string) {
    const key = plainKey.trim();
    if (!AIPDD_KEY_PATTERN.test(key)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'AIPDD APIKey 格式不正确（应为 sk- 开头的 51 位字符）',
      );
    }
    const identity = await this.verify(key);
    const cipher = this.crypto.encrypt(key);
    await this.prisma.systemSetting.upsert({
      where: { key: AIPDD_PLATFORM_KEY_SETTINGS },
      create: { key: AIPDD_PLATFORM_KEY_SETTINGS, value: cipher },
      update: { value: cipher },
    });
    await this.prisma.auditLog
      .create({
        data: {
          userId,
          action: 'AIPDD_PLATFORM_KEY_SAVED',
          detail: `aipdd=${identity.aipddUserId}`,
        },
      })
      .catch(() => undefined);
    return this.platformKeyView();
  }

  /** 清除库内平台 Key（环境变量兜底仍在则不算已清除）；基础数据随之回落本地字典。 */
  async clearPlatformKey(userId: string) {
    await this.prisma.systemSetting
      .delete({ where: { key: AIPDD_PLATFORM_KEY_SETTINGS } })
      .catch(() => undefined);
    await this.prisma.auditLog
      .create({
        data: { userId, action: 'AIPDD_PLATFORM_KEY_CLEARED', detail: '' },
      })
      .catch(() => undefined);
    return this.platformKeyView();
  }

  /** 平台 Key 原文：库内密文优先，其次部署环境变量；都没配返回空串。 */
  async resolvePlatformToken(): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: AIPDD_PLATFORM_KEY_SETTINGS },
    });
    if (row?.value) {
      try {
        return this.crypto.decrypt(row.value);
      } catch {
        throw new BusinessException(
          ErrorCode.SERVICE_UNAVAILABLE,
          '平台 AIPDD APIKey 无法解密（EXTERNAL_CRED_KEY 变更过），请到「平台管理后台 → 系统配置」重新保存',
        );
      }
    }
    return String(process.env.AIPDD_PLATFORM_KEY || '').trim();
  }

  /**
   * 基础数据凭证（省市字典、平台字典项等参照数据）：平台 Key 优先，
   * 没绑 Key 的普通用户也能拿到参照数据；平台 Key 未配置时回落本人绑定的 Key。
   */
  async baseDataToken(userId: string): Promise<string> {
    const platform = await this.resolvePlatformToken();
    if (platform) return platform;
    return this.resolveToken(userId);
  }

  /** 从密文解出原文后只展示头尾：前缀 + 末 4 位，永不回显完整 Key。 */
  private mask(keyCipher: string): string {
    try {
      return this.maskPlain(this.crypto.decrypt(keyCipher));
    } catch {
      return 'sk-****';
    }
  }

  /** 明文只取头尾用于展示（不落日志、不进接口返回）。 */
  private maskPlain(plain: string): string {
    return plain ? `${plain.slice(0, 3)}****${plain.slice(-4)}` : '';
  }
}
