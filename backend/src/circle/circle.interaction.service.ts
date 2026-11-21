import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';

/** 帖子点赞 / 收藏：唯一索引兜住并发双击，计数只按实际插入/删除增减。 */
export class CircleInteractionService {
  constructor(private readonly prisma: PrismaService) {}

  async like(
    communityId: number,
    postId: number,
    userId: number,
    like: boolean,
  ) {
    const post = await this.prisma.circlePost.findFirst({
      where: { id: postId, communityId, status: 'PUBLISHED' },
    });
    if (!post)
      throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在或已隐藏');
    if (like) {
      try {
        await this.prisma.circlePostLike.create({
          data: { communityId, postId, userId },
        });
        await this.prisma.circlePost.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 }, hotScore: { increment: 2 } },
        });
        if (post.authorUserId !== userId) {
          await this.prisma.circleNotification.create({
            data: {
              communityId,
              userId: post.authorUserId,
              type: 'LIKE',
              actorUserId: userId,
              targetType: 'POST',
              targetId: postId,
              postId,
              content: '赞了你的帖子',
            },
          });
        }
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'P2002' && code !== '23505') throw error;
      }
    } else {
      const deleted = await this.prisma.circlePostLike.deleteMany({
        where: { communityId, postId, userId },
      });
      if (deleted.count) {
        await this.prisma.circlePost.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
        });
      }
    }
    const updated = await this.prisma.circlePost.findUniqueOrThrow({
      where: { id: postId },
      select: { likeCount: true },
    });
    return { likeCount: updated.likeCount, isLiked: like };
  }

  async favorite(
    communityId: number,
    postId: number,
    userId: number,
    favorite: boolean,
  ) {
    const post = await this.prisma.circlePost.findFirst({
      where: { id: postId, communityId, status: 'PUBLISHED' },
    });
    if (!post)
      throw new BusinessException(ErrorCode.NOT_FOUND, '帖子不存在或已隐藏');
    if (favorite) {
      try {
        await this.prisma.circlePostFavorite.create({
          data: { communityId, postId, userId },
        });
        await this.prisma.circlePost.update({
          where: { id: postId },
          data: { favoriteCount: { increment: 1 } },
        });
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== 'P2002' && code !== '23505') throw error;
      }
    } else {
      const deleted = await this.prisma.circlePostFavorite.deleteMany({
        where: { communityId, postId, userId },
      });
      if (deleted.count) {
        await this.prisma.circlePost.update({
          where: { id: postId },
          data: { favoriteCount: { decrement: 1 } },
        });
      }
    }
    const updated = await this.prisma.circlePost.findUniqueOrThrow({
      where: { id: postId },
      select: { favoriteCount: true },
    });
    return { favoriteCount: updated.favoriteCount, isFavorited: favorite };
  }
}
