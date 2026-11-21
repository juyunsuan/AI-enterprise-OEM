import { createHash, randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  type MiniprogramBuiltin,
  type MiniprogramPackageFile,
  type MiniprogramStatus,
} from '@enterprise/contracts';
import { stableAssetName } from '../common/asset-key';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { updateDir } from '../upgrade/upgrade.config';
import { maskOpenId } from '../wechat-mp/wechat-mp-crypto';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { SystemAssetService } from '../system-asset/system-asset.service';
import type { MiniProgramClient } from './miniprogram.client';
import type { MiniProgramSettingsService } from './miniprogram.settings';

const ZIP_NAME = /^[A-Za-z0-9._-]+\.zip$/i;

export function builtinDir() {
  return resolve(
    process.env.MINIPROGRAM_BUILTIN_DIR || resolve(updateDir(), 'miniprogram'),
  );
}

/**
 * 用户版小程序：平台内置包扫描、小程序码与 openId 绑定。
 * 代码包由管理员下载后在微信开发者工具里自行上传；平台不代编译、不代传，也不维护发布台账。
 */
export class MiniProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly assets: SystemAssetService,
    private readonly settings: MiniProgramSettingsService,
    private readonly client: MiniProgramClient,
  ) {}

  async uploadQrcodeImage(
    userId: string,
    file: File,
  ): Promise<MiniprogramPackageFile> {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '上传的图片为空');
    }
    if (bytes.length > 10 * 1024 * 1024) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        '小程序码图片不能超过 10MB',
      );
    }
    const fileName = (file.name || 'qrcode.png')
      .split('/')
      .pop()!
      .slice(0, 160);
    const result = await this.assets.put({
      ownerUserId: userId,
      path: `miniprogram/qrcode/${randomUUID()}/${fileName}`,
      bytes,
      name: fileName,
      assetType: 'image',
      bizRef: 'miniprogram-qrcode',
    });
    return {
      fileName,
      fileSize: bytes.length,
      ossKey: result.key,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async qrcode(
    userId: string,
    body: {
      mode: 'GENERATE' | 'UPLOAD';
      fileName?: string;
      ossKey?: string;
    },
  ) {
    let url = '';
    if (body.mode === 'UPLOAD') {
      if (!body.ossKey) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '请先上传小程序码图片',
        );
      }
      url = this.storage.urlOf(body.ossKey);
    } else {
      const runtime = await this.settings.requireRuntime();
      const png = await this.client.unlimitedQrcode(runtime, {
        scene: 'home',
        page: 'pages/index/index',
      });
      // 站点级小程序码：归属取操作人（站点唯一管理员），入账后才能核对存储用量
      const uploaded = await this.assets.put({
        ownerUserId: userId,
        path: `miniprogram/qrcode/qrcode-${stableAssetName('home|pages/index/index')}.png`,
        bytes: png,
        assetType: 'image',
        bizRef: 'miniprogram-qrcode',
      });
      url = this.storage.urlOf(uploaded.key);
    }
    await this.settings.saveQrcode(url, userId);
    await this.audit(
      userId,
      'miniprogram.qrcode.' + body.mode.toLowerCase(),
      '更新小程序码',
    );
    return { qrcodeUrl: url };
  }

  // ---------- 平台内置包 ----------

  /** 扫描服务器 `update/miniprogram/*.zip`：随代码版本携带，不占台账。 */
  async listBuiltin(): Promise<{ items: MiniprogramBuiltin[] }> {
    const dir = builtinDir();
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      return { items: [] };
    }
    const items: MiniprogramBuiltin[] = [];
    for (const name of names) {
      if (!ZIP_NAME.test(name)) continue;
      try {
        const info = await stat(resolve(dir, name));
        if (!info.isFile()) continue;
        items.push({
          fileName: name,
          fileSize: info.size,
          version:
            basename(name, '.zip').replace(/^miniprogram-?/i, '') || name,
          updatedAt: info.mtime.toISOString(),
        });
      } catch {
        // 单个文件读取失败跳过，不影响其余条目
      }
    }
    items.sort((a, b) => b.fileName.localeCompare(a.fileName));
    return { items };
  }

  /** 内置包下载：校验文件名（防目录穿越），返回绝对路径由路由层回字节。 */
  async builtinFile(file: string) {
    const name = basename(String(file || '').trim());
    if (!name || name !== String(file || '').trim() || !ZIP_NAME.test(name)) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '文件名不合法');
    }
    const path = resolve(builtinDir(), name);
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a file');
    } catch {
      throw new BusinessException(ErrorCode.NOT_FOUND, '内置包不存在');
    }
    return { path, fileName: name };
  }

  // ---------- 用户绑定 ----------

  async status(user: CurrentUser): Promise<MiniprogramStatus> {
    const [settings, binding] = await Promise.all([
      this.settings.load(),
      this.prisma.miniProgramBinding.findUnique({
        where: { userId: user.userId },
      }),
    ]);
    return {
      enabled: settings.enabled,
      bound: Boolean(binding),
      openIdMasked: binding ? maskOpenId(binding.openId) : '',
      boundAt: binding?.createdAt.toISOString() || null,
    };
  }

  /** 用 wx.login 的 code 解析 openId 并绑定到当前登录账号。 */
  async bind(user: CurrentUser, code: string): Promise<MiniprogramStatus> {
    const runtime = await this.settings.requireRuntime();
    const session = await this.client.code2Session(runtime, code);
    await this.upsertBinding(user.userId, session.openId, session.unionId);
    await this.audit(user.userId, 'miniprogram.bind', '绑定小程序 openId');
    return this.status(user);
  }

  findByOpenId(openId: string) {
    if (!openId) return null;
    return this.prisma.miniProgramBinding.findUnique({ where: { openId } });
  }

  /** unionId → 已绑定的站内账号（跨通道免登：迷你程序 openId 与站号不同）。 */
  async findByUnionId(unionId: string) {
    if (!unionId) return null;
    return this.prisma.miniProgramBinding.findFirst({ where: { unionId } });
  }

  /**
   * 写入绑定关系：双向冲突（openId 已属他人 / 当前账号已绑其他 openId）一律拒绝，
   * 与微信服务号同一口径，要求先在原处解绑。
   */
  async upsertBinding(userId: string, openId: string, unionId = '') {
    const [openBound, userBound] = await Promise.all([
      this.prisma.miniProgramBinding.findUnique({ where: { openId } }),
      this.prisma.miniProgramBinding.findUnique({ where: { userId } }),
    ]);
    if (openBound && openBound.userId !== userId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该微信已绑定其他账号，请先在原账号解绑后再试',
      );
    }
    if (userBound && userBound.openId !== openId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '当前账号已绑定其他微信，请先解绑后再试',
      );
    }
    await this.prisma.miniProgramBinding.upsert({
      where: { openId },
      create: { userId, openId, unionId: unionId || null },
      update: { userId, ...(unionId ? { unionId } : {}) },
    });
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
