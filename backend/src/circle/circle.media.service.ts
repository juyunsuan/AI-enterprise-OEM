import { randomBytes } from 'node:crypto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../prisma/prisma.service';
import type { PublishReviewService } from '../moderation/publish-review.service';
import type { StorageService } from '../storage/storage.service';
import { clip } from './circle.shared';

type CommunityRow = Prisma.CircleCommunityGetPayload<object>;

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * 社区图片：字节走 StorageService 落自有 OSS；用户上传不登记进账号数字资产台账
 * （UGC 归社区内容，避免污染管理员素材库）；管理员封面/Logo 走「数字资产管理」选择。
 * 图片落桶后立即送内容安全检测，命中拦截就删掉对象，不留脏文件。
 */
export class CircleMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly review: PublishReviewService,
  ) {}

  async upload(community: CommunityRow, user: { id: number }, file: File) {
    const name = clip(file.name, 190) || 'image.jpg';
    const ext = name.toLowerCase().split('.').pop() || 'jpg';
    if (!IMAGE_EXT.includes(ext)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '仅支持 jpg / png / webp / gif 图片',
      );
    }
    if (!file.size)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '文件内容为空');
    if (file.size > MAX_BYTES) {
      throw new BusinessException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        '图片不能超过 8MB',
      );
    }
    const now = new Date();
    const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const key = `circle/${community.id}/${month}/${user.id}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await this.storage.put(key, bytes);
    const verdict = await this.review.guardImage(uploaded.url);
    if (verdict.status === 'block') {
      await this.storage.remove(uploaded.key).catch(() => undefined);
      throw new BusinessException(
        ErrorCode.CONTENT_MODERATION_BLOCKED,
        `图片未通过内容安全检测${verdict.note ? `：${verdict.note}` : ''}`,
      );
    }
    return {
      url: uploaded.url,
      key: uploaded.key,
      size: uploaded.size,
      moderation: verdict.status,
    };
  }

  async stat(communityId: number) {
    const rows = await this.prisma.circlePost.findMany({
      where: { communityId, status: 'PUBLISHED' },
      select: { images: true },
      take: 500,
    });
    const count = rows.reduce(
      (sum, row) => sum + (Array.isArray(row.images) ? row.images.length : 0),
      0,
    );
    return { images: count };
  }
}
