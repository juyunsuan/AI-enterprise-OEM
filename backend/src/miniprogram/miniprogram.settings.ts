import {
  MINIPROGRAM_FEATURES,
  type MiniprogramFeatureToggle,
  type MiniprogramSettingsInput,
  type MiniprogramSettingsView,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import { MiniProgramCrypto } from './miniprogram-crypto';

const SETTINGS_KEY = 'miniprogram_settings';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type MiniProgramStoredSettings = {
  enabled: boolean;
  appName: string;
  appId: string;
  appSecretCipher: string;
  /** 微信代码上传密钥（`private.<appid>.key` 内容）的密文，用于后台直传代码。 */
  uploadKeyCipher: string;
  /** CI 机器人编号，微信侧 1–30。 */
  robot: number;
  siteDomain: string;
  themeColor: string;
  /** 功能开关：键为 MINIPROGRAM_FEATURES，关闭的 tab 在小程序端整个不渲染。 */
  features: Record<string, boolean>;
  qrcodeUrl: string;
  lastUploadVersion: string;
  lastUploadAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type MiniProgramRuntime = { appId: string; appSecret: string };

/** 后台直传微信所需凭据（AppID + 代码上传密钥 + 机器人编号）。 */
export type MiniProgramUploadCredentials = {
  appId: string;
  privateKey: string;
  robot: number;
};

const clampRobot = (value: unknown) =>
  Math.min(30, Math.max(1, Math.round(Number(value) || 1)));

const defaults = (): MiniProgramStoredSettings => ({
  enabled: false,
  appName: 'AIworkin',
  appId: '',
  appSecretCipher: '',
  uploadKeyCipher: '',
  robot: 1,
  siteDomain: '',
  themeColor: '#3370ff',
  features: Object.fromEntries(MINIPROGRAM_FEATURES.map((key) => [key, true])),
  qrcodeUrl: '',
  lastUploadVersion: '',
  lastUploadAt: '',
  updatedBy: '',
  updatedAt: '',
});

/** 只预填、整体可编辑：站点域名由管理员按客户自有域名填写，不写死外链协议。 */
function cleanDomain(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export class MiniProgramSettingsService {
  private cryptoInstance: MiniProgramCrypto | null = null;
  private cache: { value: MiniProgramStoredSettings; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** 未配置 EXTERNAL_CRED_KEY 的环境（单测/文档生成）不在构造期抛错。 */
  private get crypto() {
    return (this.cryptoInstance ??= new MiniProgramCrypto());
  }

  invalidate() {
    this.cache = null;
  }

  private async readRaw(): Promise<MiniProgramStoredSettings> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SETTINGS_KEY },
    });
    const base = defaults();
    if (!row?.value) return base;
    try {
      const parsed = JSON.parse(
        row.value,
      ) as Partial<MiniProgramStoredSettings>;
      const rawFeatures =
        parsed.features && typeof parsed.features === 'object'
          ? (parsed.features as Record<string, unknown>)
          : {};
      return {
        ...base,
        enabled: parsed.enabled === true,
        appName: String(parsed.appName || '').slice(0, 60) || base.appName,
        appId: String(parsed.appId || '').slice(0, 64),
        appSecretCipher: String(parsed.appSecretCipher || ''),
        uploadKeyCipher: String(parsed.uploadKeyCipher || ''),
        robot: clampRobot(parsed.robot),
        siteDomain: String(parsed.siteDomain || '').slice(0, 200),
        themeColor: HEX_COLOR.test(String(parsed.themeColor || ''))
          ? String(parsed.themeColor)
          : base.themeColor,
        features: Object.fromEntries(
          MINIPROGRAM_FEATURES.map((key) => [key, rawFeatures[key] !== false]),
        ),
        qrcodeUrl: String(parsed.qrcodeUrl || '').slice(0, 500),
        lastUploadVersion: String(parsed.lastUploadVersion || '').slice(0, 40),
        lastUploadAt: String(parsed.lastUploadAt || '').slice(0, 40),
        updatedBy: String(parsed.updatedBy || ''),
        updatedAt: String(parsed.updatedAt || ''),
      };
    } catch {
      return base;
    }
  }

  /** 启动配置 / 登录链路读取：15 秒进程内缓存，保存后主动失效。 */
  async load(): Promise<MiniProgramStoredSettings> {
    if (this.cache && Date.now() - this.cache.at < 15_000) {
      return this.cache.value;
    }
    const value = await this.readRaw();
    this.cache = { value, at: Date.now() };
    return value;
  }

  /** `requireEnabled=false` 供后台「连接自检」：填好凭据即可验证，无需先启用。 */
  async runtime(
    options: { requireEnabled?: boolean } = {},
  ): Promise<MiniProgramRuntime | null> {
    const value = await this.load();
    if (options.requireEnabled !== false && !value.enabled) return null;
    if (!value.appId || !value.appSecretCipher) return null;
    const appSecret = this.crypto.decrypt(value.appSecretCipher);
    if (!appSecret) return null;
    return { appId: value.appId, appSecret };
  }

  /** 登录 / 绑定 / 生成小程序码必须使用已启用且凭据完整的配置。 */
  async requireRuntime(
    options: { requireEnabled?: boolean } = {},
  ): Promise<MiniProgramRuntime> {
    const runtime = await this.runtime(options);
    if (!runtime) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '用户版小程序尚未启用或缺少 AppID / AppSecret，请到「平台管理后台 → 小程序管理」完成配置',
      );
    }
    return runtime;
  }

  async view(): Promise<MiniprogramSettingsView> {
    const value = await this.load();
    const [releaseCount, boundCount] = await Promise.all([
      this.prisma.miniProgramRelease.count(),
      this.prisma.miniProgramBinding.count(),
    ]);
    const features: MiniprogramFeatureToggle[] = MINIPROGRAM_FEATURES.map(
      (key) => ({ key, enabled: value.features[key] !== false }),
    );
    return {
      enabled: value.enabled,
      appName: value.appName,
      appId: value.appId,
      appSecretConfigured: Boolean(value.appSecretCipher),
      uploadKeyConfigured: Boolean(value.uploadKeyCipher),
      robot: value.robot,
      siteDomain: value.siteDomain,
      themeColor: value.themeColor,
      features,
      qrcodeUrl: value.qrcodeUrl,
      releaseCount,
      boundCount,
      lastUploadVersion: value.lastUploadVersion,
      lastUploadAt: value.lastUploadAt,
      updatedAt: value.updatedAt,
    };
  }

  /**
   * 后台直传微信所需凭据：AppID + 代码上传密钥。上传是构建动作，
   * 不要求小程序已启用（与「连接自检」同一口径），但两者都缺失时给出可执行的补配指引。
   */
  async requireUploadCredentials(): Promise<MiniProgramUploadCredentials> {
    const value = await this.load();
    if (!value.appId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先在「基础配置」填写小程序 AppID',
      );
    }
    if (!value.uploadKeyCipher) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请先在「基础配置」填写微信代码上传密钥（微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传密钥），并把本服务器公网 IP 加入其白名单',
      );
    }
    const privateKey = this.crypto.decrypt(value.uploadKeyCipher);
    if (!privateKey) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '微信代码上传密钥为空，请重新填写',
      );
    }
    return { appId: value.appId, privateKey, robot: value.robot };
  }

  /** 记录最近一次直传结果（只记上传信息，不动「配置更新时间」）。 */
  async saveUploadResult(version: string, uploadedAt: string) {
    const current = await this.readRaw();
    await this.write({
      ...current,
      lastUploadVersion: String(version || '').slice(0, 40),
      lastUploadAt: String(uploadedAt || '').slice(0, 40),
    });
  }

  /** 保存后把小程序码写回设置（生成 / 上传两条入口共用）。 */
  async saveQrcode(url: string, operatorId: string) {
    const current = await this.readRaw();
    const next: MiniProgramStoredSettings = {
      ...current,
      qrcodeUrl: String(url || '').slice(0, 500),
      updatedBy: operatorId,
      updatedAt: new Date().toISOString(),
    };
    await this.write(next);
    await this.audit(operatorId, 'miniprogram.qrcode', '更新小程序码');
    return next.qrcodeUrl;
  }

  async save(
    body: MiniprogramSettingsInput,
    operatorId: string,
  ): Promise<MiniprogramSettingsView> {
    const current = await this.readRaw();
    const appSecret = String(body.appSecret || '').trim();
    const uploadKey = String(body.uploadKey || '').trim();
    const themeColor = String(body.themeColor || '').trim();
    if (themeColor && !HEX_COLOR.test(themeColor)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '主题色需为 #RRGGBB 格式，例如 #3370ff',
      );
    }
    const features = Object.fromEntries(
      MINIPROGRAM_FEATURES.map((key) => {
        const item = (body.features || []).find((row) => row.key === key);
        return [key, item ? item.enabled !== false : true];
      }),
    );
    const next: MiniProgramStoredSettings = {
      ...current,
      enabled: body.enabled === true,
      appName:
        String(body.appName || '')
          .trim()
          .slice(0, 60) || 'AIworkin',
      appId: String(body.appId || '')
        .trim()
        .slice(0, 64),
      appSecretCipher: appSecret
        ? this.crypto.encrypt(appSecret)
        : current.appSecretCipher,
      uploadKeyCipher: uploadKey
        ? this.crypto.encrypt(uploadKey)
        : current.uploadKeyCipher,
      robot: clampRobot(body.robot),
      siteDomain: cleanDomain(body.siteDomain),
      themeColor: themeColor || current.themeColor,
      features,
      updatedBy: operatorId,
      updatedAt: new Date().toISOString(),
    };
    if (next.enabled) {
      if (!next.appId) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '启用前请填写 AppID',
        );
      }
      if (!next.appSecretCipher) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '启用前请填写 AppSecret',
        );
      }
    }
    await this.write(next);
    await this.audit(
      operatorId,
      'miniprogram.settings',
      next.enabled ? '保存并启用' : '保存',
    );
    return this.view();
  }

  private async write(value: MiniProgramStoredSettings) {
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
    this.invalidate();
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
