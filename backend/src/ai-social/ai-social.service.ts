import type { AiSocialEntry, AiSocialLink } from '@enterprise/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { aiSocialWebTarget, aiSocialWebUrl } from './ai-social.target';

/**
 * AI 社交入口：社交能力全部由 AIworkin 的 DSH 社交插件提供，
 * 本服务只判断「是否绑定可用的 AIPDD Key」并给出插件对应的网页入口。
 *
 * 入口与更新后的插件面板一致：主入口（聊天/分身/人脉/小组）、更多（招聘/撮合/技能/应用）、
 * 交流与治理（好友/私信/通知/开发者）。地址不写死：优先 AIWORKIN_WEB_URL，
 * 其次复用已有的 SNS_WEB_URL；两者都没配时返回空入口。
 */
export class AiSocialService {
  constructor(private readonly prisma: PrismaService) {}

  private links(): AiSocialLink[] {
    const target = aiSocialWebTarget();
    if (target.mode === 'aiworkin') {
      const url = (path: string) => aiSocialWebUrl(path, target);
      return [
        { key: 'chat', url: url('/chat') },
        { key: 'twins', url: url('/dashboard/twins') },
        { key: 'discover', url: url('/discover') },
        { key: 'groups', url: url('/groups') },
        { key: 'hiring', url: url('/hiring') },
        { key: 'matching', url: url('/work-market/demand') },
        { key: 'skills', url: url('/skills') },
        { key: 'apps', url: url('/apps') },
        { key: 'friends', url: url('/network') },
        { key: 'mail', url: url('/mail') },
        { key: 'notifications', url: url('/notifications') },
        { key: 'developers', url: url('/developers') },
      ];
    }
    if (target.mode === 'sns') {
      const url = (path: string) => aiSocialWebUrl(path, target);
      return [
        { key: 'chat', url: url('/mail') },
        { key: 'discover', url: url('/discover') },
        { key: 'groups', url: url('/groups') },
        { key: 'hiring', url: url('/hiring') },
        { key: 'apps', url: url('/apps') },
        { key: 'developers', url: url('/developers') },
        { key: 'friends', url: url('/network') },
        { key: 'profile', url: url('/me') },
        { key: 'resume', url: url('/resume') },
      ];
    }
    return [];
  }

  async entry(userId: string): Promise<AiSocialEntry> {
    const target = aiSocialWebTarget();
    const base = {
      webMode: target.mode,
      webUrl: target.base,
      links: [] as AiSocialLink[],
    };
    const binding = await this.prisma.userAipddBinding.findMany({
      where: { userId },
      select: { keyId: true },
    });
    if (!binding.length) return { ...base, keyBound: false, state: 'UNBOUND' };
    const active = await this.prisma.aipddKey.count({
      where: {
        id: { in: binding.map((row) => row.keyId) },
        status: 'ACTIVE',
      },
    });
    if (!active) return { ...base, keyBound: false, state: 'KEY_INACTIVE' };
    return {
      ...base,
      keyBound: true,
      state: 'READY',
      links: this.links(),
    };
  }
}
