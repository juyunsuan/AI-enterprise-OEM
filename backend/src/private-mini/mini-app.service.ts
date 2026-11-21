import {
  MINI_APP_STATUSES,
  MINI_TEMPLATE_KEYS,
  type MiniAppInput,
  type MiniAppStatus,
  type MiniAppTestResult,
  type MiniAppView,
  type PrivateMiniScene,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { PrismaService } from '../prisma/prisma.service';
import { MiniAppCrypto } from './mini-app-crypto';

/** 自营小程序主体归属：由业务侧（上门服务 / 电商）解析店铺后传入，本服务不认会话。 */
export type MiniAppSubject = {
  ownerUserId: string;
  scene: PrivateMiniScene;
  shopId: number;
  shopName: string;
};

type AppRow = {
  id: number;
  appId: string;
  appSecretCipher: string;
  mchId: string;
  payApiV3KeyCipher: string;
  payCertSerial: string;
  payPrivateKeyCipher: string;
  payEnabled: number;
  mapKeyCipher: string;
  templates: unknown;
  qrcodeUrl: string;
  status: string;
  lastError: string;
  verifiedAt: Date | null;
};

/** 文本列写库前统一截断；类型收紧到 string，避免把对象 stringify 成 `[object Object]` 存进库。 */
const CLAMP = (value: string | null | undefined, max: number) =>
  (value ?? '').slice(0, max);

function appStatus(value: string | undefined): MiniAppStatus {
  for (const status of MINI_APP_STATUSES) {
    if (status === value) return status;
  }
  return 'UNVERIFIED';
}

/** JSON 列在 MySQL/PG 两侧取回的形状不一致，统一成字符串字典。 */
function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const key of MINI_TEMPLATE_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    // 只认字符串：模板 id 被填成对象时按空处理，不能把 [object Object] 写进库里
    if (typeof raw === 'string' && raw.trim()) {
      out[key] = raw.trim().slice(0, 128);
    }
  }
  return out;
}

/**
 * 自营小程序主体服务：凭据保存（分字段加密）、掩码回显、连通自检、
 * 以及给上层（出包直传 / 订阅消息 / C 端登录 / 微信支付）取运行时凭据。
 *
 * 三条硬口径：
 * 1. 任何出参只回 `xxxConfigured`，密文与明文都不出后端；
 * 2. AppID 全局唯一——同一个小程序主体不允许被两个店铺重复占用（否则直传会互相覆盖版本）；
 * 3. 自检失败不阻断保存，只把状态与错误留在台账上，页面据此给下一步动作。
 */
export class MiniAppService {
  private readonly crypto = new MiniAppCrypto();

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MiniProgramClient,
  ) {}

  private scope(subject: MiniAppSubject, field: string) {
    return `${subject.ownerUserId}:${subject.scene}:${subject.shopId}:${field}`;
  }

  /** 兼容历史密文：旧 scope 不含 ownerUserId，读不到新 scope 时再试一次旧口径。 */
  private decryptField(
    subject: MiniAppSubject,
    field: string,
    sealed: string,
  ): string {
    if (!sealed) return '';
    const next = this.crypto.decrypt(this.scope(subject, field), sealed);
    if (next) return next;
    return this.crypto.decrypt(
      `${subject.scene}:${subject.shopId}:${field}`,
      sealed,
    );
  }

  private async row(subject: MiniAppSubject): Promise<AppRow | null> {
    return this.prisma.miniProgramApp.findUnique({
      where: {
        ownerUserId_scene_shopId: {
          ownerUserId: subject.ownerUserId,
          scene: subject.scene,
          shopId: subject.shopId,
        },
      },
    });
  }

  /** 上层用：主体是否已具备可用的 AppID + AppSecret（引导步骤判定）。 */
  async configured(subject: MiniAppSubject): Promise<boolean> {
    const row = await this.row(subject);
    return Boolean(row?.appId && row.appSecretCipher);
  }

  async payEnabled(subject: MiniAppSubject): Promise<boolean> {
    const row = await this.row(subject);
    return Number(row?.payEnabled || 0) === 1 && Boolean(row?.mchId);
  }

  async view(subject: MiniAppSubject): Promise<MiniAppView> {
    const row = await this.row(subject);
    return {
      configured: Boolean(row?.appId),
      scene: subject.scene,
      shopId: subject.shopId,
      appId: CLAMP(row?.appId, 64),
      appSecretConfigured: Boolean(row?.appSecretCipher),
      mchId: CLAMP(row?.mchId, 64),
      payCertSerial: CLAMP(row?.payCertSerial, 128),
      payKeyConfigured: Boolean(row?.payApiV3KeyCipher),
      payCertConfigured: Boolean(row?.payPrivateKeyCipher),
      payEnabled: Number(row?.payEnabled || 0) === 1,
      mapKeyConfigured: Boolean(row?.mapKeyCipher),
      templates: stringMap(row?.templates),
      qrcodeUrl: CLAMP(row?.qrcodeUrl, 500),
      status: appStatus(row?.status),
      lastError: CLAMP(row?.lastError, 500),
      verifiedAt: row?.verifiedAt ? row.verifiedAt.toISOString() : '',
    };
  }

  /** 留空即保留原值：密钥只写不读，改一处不必重填全部。 */
  private keepOr(
    currentCipher: string,
    next: string | undefined,
    scope: string,
  ): string {
    const plain = String(next ?? '').trim();
    if (!plain) return currentCipher || '';
    if (plain.length > 8192) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `凭据内容过长（${scope}），请确认粘贴的是完整文件内容`,
      );
    }
    return this.crypto.encrypt(scope, plain);
  }

  async save(
    subject: MiniAppSubject,
    body: MiniAppInput,
  ): Promise<MiniAppView> {
    const appId = String(body.appId || '').trim();
    if (!appId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请填写小程序 AppID（微信公众平台 → 开发管理 → 开发设置 → AppID）',
      );
    }
    if (!/^wx[0-9a-zA-Z]{14,32}$/.test(appId)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        'AppID 格式不对：应形如 wx1234567890abcdef，请从微信公众平台复制',
      );
    }
    const taken = await this.prisma.miniProgramApp.findFirst({
      where: {
        appId,
        NOT: {
          ownerUserId: subject.ownerUserId,
          scene: subject.scene,
          shopId: subject.shopId,
        },
      },
    });
    if (taken) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该 AppID 已绑定到另一部自营小程序，请先在原店铺解绑后再填',
      );
    }
    const current = await this.row(subject);
    const data = {
      ownerUserId: subject.ownerUserId,
      scene: subject.scene,
      shopId: subject.shopId,
      appId,
      appSecretCipher: this.keepOr(
        current?.appSecretCipher || '',
        body.appSecret,
        this.scope(subject, 'appSecret'),
      ),
      mchId: String(body.mchId || '')
        .trim()
        .slice(0, 64),
      payApiV3KeyCipher: this.keepOr(
        current?.payApiV3KeyCipher || '',
        body.payApiV3Key,
        this.scope(subject, 'payApiV3Key'),
      ),
      payCertSerial: String(body.payCertSerial || '')
        .trim()
        .slice(0, 128),
      payPrivateKeyCipher: this.keepOr(
        current?.payPrivateKeyCipher || '',
        body.payPrivateKey,
        this.scope(subject, 'payPrivateKey'),
      ),
      payEnabled: body.payEnabled === true ? 1 : 0,
      mapKeyCipher: this.keepOr(
        current?.mapKeyCipher || '',
        body.mapKey,
        this.scope(subject, 'mapKey'),
      ),
      templates: stringMap(body.templates),
    };
    const row = await this.prisma.miniProgramApp.upsert({
      where: {
        ownerUserId_scene_shopId: {
          ownerUserId: subject.ownerUserId,
          scene: subject.scene,
          shopId: subject.shopId,
        },
      },
      create: data,
      update: data,
    });
    // 换了 AppID 就等于换了主体：自检结论必须重来，否则页面会挂着旧店的「凭据可用」。
    if (row.status !== 'UNVERIFIED' && current?.appId !== appId) {
      await this.prisma.miniProgramApp.update({
        where: { id: row.id },
        data: { status: 'UNVERIFIED', lastError: '', verifiedAt: null },
      });
    }
    await this.audit(
      subject.ownerUserId,
      'mini-app.save',
      subject.scene,
      appId,
    );
    return this.view(subject);
  }

  /** 连通自检：AppID + AppSecret 能否取到 access_token；失败也落台账。 */
  async test(subject: MiniAppSubject): Promise<MiniAppTestResult> {
    const runtime = await this.runtime(subject, { requireEnabled: false });
    if (!runtime) {
      return {
        ok: false,
        shopName: subject.shopName,
        message: '请先填写 AppID 与 AppSecret 再自检',
      };
    }
    try {
      await this.client.accessToken(runtime, true);
      const row = await this.row(subject);
      if (row) {
        await this.prisma.miniProgramApp.update({
          where: { id: row.id },
          data: { status: 'VERIFIED', lastError: '', verifiedAt: new Date() },
        });
      }
      return {
        ok: true,
        shopName: subject.shopName,
        message: '连接成功，AppID / AppSecret 可用',
      };
    } catch (error) {
      const message = CLAMP(
        error instanceof Error ? error.message : '连接失败',
        500,
      );
      const row = await this.row(subject);
      if (row) {
        await this.prisma.miniProgramApp.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            lastError: message,
            verifiedAt: new Date(),
          },
        });
      }
      return { ok: false, shopName: subject.shopName, message };
    }
  }

  /**
   * 微信接口运行时凭据（code2Session / access_token / 小程序码 / 订阅消息）。
   * 自营主体不受平台版「启用开关」约束：店铺状态由业务侧判定。
   */
  async runtime(
    subject: MiniAppSubject,
    options: { requireEnabled?: boolean } = {},
  ): Promise<{ appId: string; appSecret: string } | null> {
    void options;
    const row = await this.row(subject);
    if (!row?.appId) return null;
    const appSecret = this.decryptField(
      subject,
      'appSecret',
      row.appSecretCipher,
    );
    if (!appSecret) return null;
    return { appId: row.appId, appSecret };
  }

  async requireRuntime(subject: MiniAppSubject) {
    const runtime = await this.runtime(subject);
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `「${subject.shopName}」尚未配置小程序 AppID / AppSecret，请到「发布与凭据」页填写并自检`,
      );
    }
    return runtime;
  }

  /** 微信支付 APIv3 运行时（下单/回调解密/退款用），未配齐返回 null 由上层降级为线下收款。 */
  async payRuntime(subject: MiniAppSubject) {
    const row = await this.row(subject);
    if (!row || Number(row.payEnabled || 0) !== 1 || !row.mchId) return null;
    const apiV3Key = this.decryptField(
      subject,
      'payApiV3Key',
      row.payApiV3KeyCipher,
    );
    const privateKey = this.decryptField(
      subject,
      'payPrivateKey',
      row.payPrivateKeyCipher,
    );
    if (!apiV3Key || !privateKey || !row.payCertSerial) return null;
    return {
      mchId: row.mchId,
      appId: row.appId,
      apiV3Key,
      certSerial: row.payCertSerial,
      privateKey,
    };
  }

  /** 腾讯地图 key（车费算距）：缺省时上层走直线距离降级，不报错。 */
  async mapKey(subject: MiniAppSubject): Promise<string> {
    const row = await this.row(subject);
    if (!row?.mapKeyCipher) return '';
    return this.decryptField(subject, 'mapKey', row.mapKeyCipher);
  }

  async templates(subject: MiniAppSubject): Promise<Record<string, string>> {
    const row = await this.row(subject);
    return stringMap(row?.templates);
  }

  async saveQrcode(subject: MiniAppSubject, url: string) {
    const row = await this.row(subject);
    if (!row) return '';
    await this.prisma.miniProgramApp.update({
      where: { id: row.id },
      data: { qrcodeUrl: CLAMP(url, 500) },
    });
    return CLAMP(url, 500);
  }

  /** 店铺删除时连带清掉主体（密文留在库里没有归属人反而更危险）。 */
  async removeForShop(subject: MiniAppSubject) {
    await this.prisma.miniProgramApp
      .deleteMany({
        where: { scene: subject.scene, shopId: subject.shopId },
      })
      .catch(() => undefined);
  }

  private async audit(
    userId: string,
    action: string,
    scene: string,
    appId: string,
  ) {
    await this.prisma.auditLog
      .create({
        data: { userId, action, detail: `${scene} ${appId}`.slice(0, 500) },
      })
      .catch(() => undefined);
  }
}
