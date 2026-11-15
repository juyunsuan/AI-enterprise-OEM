import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  type MiniprogramBuiltin,
  type MiniprogramCodeUploadInput,
  type MiniprogramCodeUploadResult,
  type MiniprogramPackageFile,
  type MiniprogramReleaseRow,
  type MiniprogramReleaseSave,
  type MiniprogramReleaseUpdate,
  type MiniprogramStatus,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { updateDir } from '../upgrade/upgrade.config';
import { maskOpenId } from '../wechat-mp/wechat-mp-crypto';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { OssService } from '../oss/oss.service';
import type { IdentityService } from '../identity/identity.service';
import type { MiniProgramClient } from './miniprogram.client';
import type { MiniProgramCiService } from './miniprogram-ci.service';
import type { MiniProgramSettingsService } from './miniprogram.settings';

type ReleaseRow = {
  id: number;
  version: string;
  channel: string;
  fileName: string;
  fileSize: number;
  ossKey: string;
  sha256: string;
  changelog: string;
  minBaseLib: string;
  qrcodeUrl: string;
  downloadCount: number;
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const ZIP_NAME = /^[A-Za-z0-9._-]+\.zip$/i;

export function builtinDir() {
  return resolve(
    process.env.MINIPROGRAM_BUILTIN_DIR || resolve(updateDir(), 'miniprogram'),
  );
}

/**
 * 用户版小程序：代码包台账（版本 / 通道 / 小程序码）、openId 绑定与内置包扫描。
 * 微信侧的上传与提审发布由管理员在开发者工具 / 公众平台完成，本服务只做托管与下载。
 */
export class MiniProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oss: OssService,
    private readonly settings: MiniProgramSettingsService,
    private readonly client: MiniProgramClient,
    private readonly identity: IdentityService,
    private readonly ci: MiniProgramCiService,
  ) {}

  private toRow(row: ReleaseRow): MiniprogramReleaseRow {
    return {
      id: row.id,
      version: row.version,
      // 库里是 VARCHAR，出参按契约收窄到两个通道值。
      channel: row.channel === 'BETA' ? 'BETA' : 'STABLE',
      fileName: row.fileName,
      fileSize: row.fileSize,
      sha256: row.sha256,
      changelog: row.changelog,
      minBaseLib: row.minBaseLib,
      qrcodeUrl: row.qrcodeUrl,
      enabled: row.enabled,
      downloadCount: row.downloadCount,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ---------- 代码包台账 ----------

  async listReleases(query: Record<string, unknown>) {
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const channel = text(query.channel, 'all').trim();
    const keyword = text(query.keyword).trim().slice(0, 40);
    const where = {
      ...(channel && channel !== 'all' ? { channel } : {}),
      ...(keyword
        ? {
            OR: [
              { version: { contains: keyword } },
              { fileName: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.miniProgramRelease.count({ where }),
      this.prisma.miniProgramRelease.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    return pageOf(
      rows.map((row) => this.toRow(row)),
      total,
      page,
      pageSize,
    );
  }

  /** 上传 zip 二进制：算 SHA-256 供管理员核对，返回元数据由 saveRelease 落库。 */
  async uploadPackage(file: File): Promise<MiniprogramPackageFile> {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!bytes.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '上传的文件为空');
    }
    if (bytes.length > 200 * 1024 * 1024) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        '小程序代码包不能超过 200MB',
      );
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const fileName = (file.name || 'miniprogram.zip')
      .split('/')
      .pop()!
      .slice(0, 160);
    const result = await this.oss.upload(
      `miniprogram/releases/${randomUUID()}/${fileName}`,
      bytes,
    );
    return { fileName, fileSize: bytes.length, ossKey: result.key, sha256 };
  }

  /** 上传小程序码图片（UPLOAD 模式）：只留元数据，URL 由 qrcode() 写回设置。 */
  async uploadQrcodeImage(file: File): Promise<MiniprogramPackageFile> {
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
    const result = await this.oss.upload(
      `miniprogram/qrcode/${randomUUID()}/${fileName}`,
      bytes,
    );
    return {
      fileName,
      fileSize: bytes.length,
      ossKey: result.key,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async saveRelease(
    userId: string,
    body: MiniprogramReleaseSave,
  ): Promise<MiniprogramReleaseRow> {
    const exists = await this.prisma.miniProgramRelease.findFirst({
      where: { version: body.version, channel: body.channel },
    });
    if (exists) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `「${body.channel === 'BETA' ? '预览' : '稳定'}」通道下已存在版本 ${body.version}`,
      );
    }
    const row = await this.prisma.miniProgramRelease.create({
      data: {
        version: body.version,
        channel: body.channel,
        fileName: body.fileName,
        fileSize: body.fileSize,
        ossKey: body.ossKey,
        sha256: body.sha256,
        changelog: body.changelog,
        minBaseLib: body.minBaseLib,
        enabled: body.enabled,
        createdBy: userId,
      },
    });
    await this.audit(
      userId,
      'miniprogram.release.save',
      `新增代码包 ${row.version}`,
    );
    return this.toRow(row);
  }

  async updateRelease(
    userId: string,
    id: string,
    body: MiniprogramReleaseUpdate,
  ): Promise<MiniprogramReleaseRow> {
    const current = await this.prisma.miniProgramRelease.findUnique({
      where: { id: Number(id) },
    });
    if (!current) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '代码包不存在');
    }
    const version = body.version ?? current.version;
    const channel = body.channel ?? current.channel;
    if (version !== current.version || channel !== current.channel) {
      const dup = await this.prisma.miniProgramRelease.findFirst({
        where: { version, channel, NOT: { id: current.id } },
      });
      if (dup) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `「${channel === 'BETA' ? '预览' : '稳定'}」通道下已存在版本 ${version}`,
        );
      }
    }
    const row = await this.prisma.miniProgramRelease.update({
      where: { id: current.id },
      data: {
        version,
        channel,
        ...(body.changelog !== undefined ? { changelog: body.changelog } : {}),
        ...(body.minBaseLib !== undefined
          ? { minBaseLib: body.minBaseLib }
          : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        // 换文件：文件名 / 大小 / 对象键 / 摘要一起换，避免新旧文件元数据打架。
        ...(body.fileName !== undefined ? { fileName: body.fileName } : {}),
        ...(body.fileSize !== undefined ? { fileSize: body.fileSize } : {}),
        ...(body.ossKey !== undefined ? { ossKey: body.ossKey } : {}),
        ...(body.sha256 !== undefined ? { sha256: body.sha256 } : {}),
      },
    });
    await this.audit(
      userId,
      'miniprogram.release.update',
      `更新代码包 ${row.version}`,
    );
    return this.toRow(row);
  }

  async removeRelease(userId: string, id: string) {
    const current = await this.prisma.miniProgramRelease.findUnique({
      where: { id: Number(id) },
    });
    if (!current) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '代码包不存在');
    }
    await this.prisma.miniProgramRelease.delete({ where: { id: current.id } });
    if (current.ossKey) {
      await this.oss.remove(current.ossKey).catch(() => undefined);
    }
    await this.audit(
      userId,
      'miniprogram.release.remove',
      `删除代码包 ${current.version}`,
    );
    return { removed: true };
  }

  /** 下载代码包：返回对象存储直链并累计下载量。 */
  async downloadRelease(id: string) {
    const current = await this.prisma.miniProgramRelease.findUnique({
      where: { id: Number(id) },
    });
    if (!current) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '代码包不存在');
    }
    await this.prisma.miniProgramRelease
      .update({
        where: { id: current.id },
        data: { downloadCount: { increment: 1 } },
      })
      .catch(() => undefined);
    return {
      url: this.oss.keyUrlOf(current.ossKey),
      fileName: current.fileName,
    };
  }

  /**
   * 直传微信：把选定的代码包（台账版本或平台内置包）上传为微信开发版。
   * 只到「上传」为止——提审与发布仍在微信公众平台。
   */
  async uploadCode(
    userId: string,
    body: MiniprogramCodeUploadInput,
  ): Promise<MiniprogramCodeUploadResult> {
    const { appId, privateKey, robot } =
      await this.settings.requireUploadCredentials();
    const { bytes, version, desc } =
      body.source === 'BUILTIN'
        ? await this.builtinPackage(body.fileName)
        : await this.releasePackage(body.releaseId);
    await this.ci.upload({ bytes, appId, privateKey, robot, version, desc });
    const uploadedAt = new Date().toISOString();
    await this.settings.saveUploadResult(version, uploadedAt);
    await this.audit(
      userId,
      'miniprogram.upload-code',
      `直传微信开发版 ${version}`,
    );
    return {
      version,
      uploadedAt,
      message: `已上传为微信开发版（版本号 ${version}）；请到微信公众平台「版本管理」提交审核并发布`,
    };
  }

  private async releasePackage(releaseId?: number) {
    if (!releaseId) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择要上传的代码包版本',
      );
    }
    const row = await this.prisma.miniProgramRelease.findUnique({
      where: { id: Number(releaseId) },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '代码包不存在');
    if (!row.ossKey) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '该版本没有代码包文件，请重新上传后再直传微信',
      );
    }
    return {
      bytes: await this.oss.read(row.ossKey, 200 * 1024 * 1024),
      version: row.version,
      desc: row.changelog || `版本 ${row.version}`,
    };
  }

  private async builtinPackage(fileName?: string) {
    const name = String(fileName || '').trim();
    if (!name) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '请选择要上传的平台内置包',
      );
    }
    const file = await this.builtinFile(name);
    return {
      bytes: await readFile(file.path),
      version:
        basename(file.fileName, '.zip').replace(/^miniprogram-?/i, '') ||
        '0.0.0',
      desc: `平台内置包 ${file.fileName}`,
    };
  }

  // ---------- 小程序码 ----------

  /**
   * `GENERATE` 用配置的凭据调微信接口生成无限制小程序码；`UPLOAD` 由管理员上传图片。
   * 两者都写回设置里的站点级小程序码（releaseId 传入时同时挂到该版本上）。
   */
  async qrcode(
    userId: string,
    body: {
      mode: 'GENERATE' | 'UPLOAD';
      fileName?: string;
      ossKey?: string;
      releaseId?: number;
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
      url = this.oss.keyUrlOf(body.ossKey);
    } else {
      const runtime = await this.settings.requireRuntime();
      const png = await this.client.unlimitedQrcode(runtime, {
        scene: 'home',
        page: 'pages/index/index',
      });
      const uploaded = await this.oss.upload(
        `miniprogram/qrcode/${randomUUID()}/qrcode-${Date.now()}.png`,
        png,
      );
      url = this.oss.keyUrlOf(uploaded.key);
    }
    await this.settings.saveQrcode(url, userId);
    if (body.releaseId) {
      await this.prisma.miniProgramRelease
        .update({
          where: { id: Number(body.releaseId) },
          data: { qrcodeUrl: url },
        })
        .catch(() => undefined);
    }
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
