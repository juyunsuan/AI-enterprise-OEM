import {
  DH_ACCOUNTS,
  DH_MEMBER_STATUS,
  type DhBalanceLogRow,
  type DhMemberRow,
  type DhMemberUpdateInput,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { PrismaService } from '../prisma/prisma.service';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { DH_SCENE, clip, siteConfigOf } from './dh.shared';
import { issueDhMemberToken, verifyDhMemberToken } from './dh.token';

type SiteRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanSite']['findUnique']>>
>;
type MemberRow = NonNullable<
  Awaited<ReturnType<PrismaService['digitalHumanMember']['findUnique']>>
>;

export type DhAccount = 'point' | 'body' | 'voice';

const ACCOUNT_FIELD: Record<DhAccount, 'point' | 'bodyQuota' | 'voiceQuota'> = {
  point: 'point',
  body: 'bodyQuota',
  voice: 'voiceQuota',
};

function accountOf(value: string): DhAccount {
  for (const item of DH_ACCOUNTS) {
    if (item === value) return item;
  }
  throw new BusinessException(ErrorCode.BAD_REQUEST, '账户类型不对');
}

function memberStatusOf(value: string): 'ACTIVE' | 'FROZEN' | 'DELETED' {
  for (const item of DH_MEMBER_STATUS) {
    if (item === value) return item;
  }
  return 'ACTIVE';
}

function isVip(row: { vipExpireAt: Date | null }, now = new Date()): boolean {
  return Boolean(row.vipExpireAt && row.vipExpireAt.getTime() > now.getTime());
}

/** 登录入参（C 端 wx.login code 换 openid，tuid 为邀请人会员 id）。 */
export type DhLoginInput = {
  code: string;
  nickname?: string;
  avatar?: string;
  tuid?: number;
};

/**
 * 数字人会员服务：管理端台账（调整资产/冻结）+ C 端登录与三账户流水。
 *
 * 三条口径：
 * 1. 余额变动一律「先写流水再落余额」同一事务内完成，失败整体回滚；
 * 2. 扣减账户前先判余额，余额不足给出可操作指引（去充值/去充值形象点），不出现负数；
 * 3. 会员与平台账号物理隔离：openid 归站点，令牌只签 `mid+sid`。
 */
export class DhMemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
  ) {}

  // ---------------- C 端：站点寻址 / 登录 / 鉴权 ----------------

  async siteOfCode(siteCode: string): Promise<SiteRow> {
    const code = clip(siteCode, 16).toUpperCase();
    const site = code
      ? await this.prisma.digitalHumanSite.findUnique({
          where: { siteCode: code },
        })
      : null;
    if (!site) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '站点不存在：请确认小程序包的 config.js 已注入正确的 site 编码',
      );
    }
    if (site.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.NOT_FOUND, '该站点已关闭');
    }
    // 启动闸门：登录与全部匿名读接口都经这里取站点，一次判住整条 C 端通道
    if (!(await toolOpen('digital-human', site.userId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    return site;
  }

  subjectOf(site: SiteRow) {
    return {
      ownerUserId: site.userId,
      scene: DH_SCENE,
      shopId: site.id,
      shopName: site.siteName || `数字人小程序 ${site.siteCode}`,
    };
  }

  async login(siteCode: string, body: DhLoginInput) {
    const site = await this.siteOfCode(siteCode);
    if (site.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '站点暂停服务中，请稍后再试',
      );
    }
    const runtime = await this.miniApp.requireRuntime(this.subjectOf(site));
    const session = await this.client.code2Session(runtime, body.code);
    const now = new Date();
    let member = await this.prisma.digitalHumanMember.findUnique({
      where: { siteId_openid: { siteId: site.id, openid: session.openId } },
    });
    if (member && member.status === 'FROZEN') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号已被站点冻结，请联系站点客服',
      );
    }
    if (member && member.status === 'DELETED') {
      await this.prisma.digitalHumanMember.update({
        where: { id: member.id },
        data: { status: 'ACTIVE' },
      });
      member = { ...member, status: 'ACTIVE' };
    }
    if (!member) {
      const referrer = await this.referrerOf(site.id, Number(body.tuid) || 0);
      member = await this.prisma.digitalHumanMember.create({
        data: {
          siteId: site.id,
          userId: site.userId,
          openid: session.openId,
          unionId: clip(session.unionId, 64),
          nickname: clip(body.nickname, 60) || '微信用户',
          avatar: clip(body.avatar, 500),
          referrerId: referrer?.id || 0,
          parentReferrerId: referrer?.referrerId || 0,
          loginCount: 1,
          lastLoginAt: now,
        },
      });
      await this.claimGift(site, member);
    } else {
      member = await this.prisma.digitalHumanMember.update({
        where: { id: member.id },
        data: {
          nickname: clip(body.nickname, 60) || member.nickname,
          avatar: clip(body.avatar, 500) || member.avatar,
          unionId: clip(session.unionId, 64) || member.unionId,
          loginCount: { increment: 1 },
          lastLoginAt: now,
        },
      });
    }
    return {
      token: issueDhMemberToken({ memberId: member.id, siteId: site.id }),
      member: await this.memberView(member.id),
    };
  }

  private async referrerOf(siteId: number, referrerId: number) {
    if (!referrerId) return null;
    return this.prisma.digitalHumanMember.findFirst({
      where: { id: referrerId, siteId, status: 'ACTIVE' },
      select: { id: true, referrerId: true },
    });
  }

  async authenticate(siteCode: string, authorization: string | undefined) {
    const site = await this.siteOfCode(siteCode);
    const payload = verifyDhMemberToken(authorization || '');
    if (payload.siteId !== site.id) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录站点不一致，请重新进入小程序',
      );
    }
    const member = await this.prisma.digitalHumanMember.findUnique({
      where: { id: payload.memberId },
    });
    if (!member || member.siteId !== site.id) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '账号不存在，请重新进入小程序',
      );
    }
    if (member.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '账号已被冻结，请联系站点客服',
      );
    }
    return { site, member };
  }

  /** 登录后领取新人礼（一次）：vip 天数 + 三类点数，全部写流水留痕。 */
  private async claimGift(site: SiteRow, member: MemberRow) {
    if (member.giftClaimed) return;
    const gift = siteConfigOf(site).gift;
    if (!gift.vipDays && !gift.point && !gift.body && !gift.voice) {
      await this.prisma.digitalHumanMember.update({
        where: { id: member.id },
        data: { giftClaimed: true },
      });
      return;
    }
    const vipExpireAt =
      gift.vipDays > 0
        ? new Date(Date.now() + gift.vipDays * 86_400_000)
        : member.vipExpireAt;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.digitalHumanMember.update({
        where: { id: member.id },
        data: {
          giftClaimed: true,
          vipExpireAt,
          point: { increment: gift.point },
          bodyQuota: { increment: gift.body },
          voiceQuota: { increment: gift.voice },
        },
      });
      const logs = [
        gift.point > 0
          ? { account: 'point', delta: gift.point, after: updated.point }
          : null,
        gift.body > 0
          ? { account: 'body', delta: gift.body, after: updated.bodyQuota }
          : null,
        gift.voice > 0
          ? { account: 'voice', delta: gift.voice, after: updated.voiceQuota }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null);
      for (const log of logs) {
        await tx.digitalHumanBalanceLog.create({
          data: {
            siteId: member.siteId,
            memberId: member.id,
            account: log.account,
            delta: log.delta,
            balanceAfter: log.after,
            bizType: 'gift',
            remark: '新人礼',
          },
        });
      }
    });
  }

  async memberView(memberId: number): Promise<DhMemberRow> {
    const member = await this.prisma.digitalHumanMember.findUnique({
      where: { id: memberId },
    });
    if (!member) throw new BusinessException(ErrorCode.NOT_FOUND, '会员不存在');
    const workCount = await this.prisma.digitalHumanWork.count({
      where: { memberId: member.id, siteId: member.siteId },
    });
    return this.toMemberRow(member, workCount);
  }

  // ---------------- 资产流水 ----------------

  /**
   * 资产变动（负数为扣减）：同一事务内先校验余额、再落余额与流水。
   * 返回变动后的余额；余额不足直接抛业务错，由上层转成人话指引。
   */
  async applyBalance(input: {
    siteId: number;
    memberId: number;
    account: DhAccount;
    delta: number;
    bizType: string;
    refId?: number;
    remark?: string;
    isRefund?: boolean;
  }): Promise<number> {
    const account = accountOf(input.account);
    const delta = Math.round(input.delta);
    if (!delta)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '变动数量不能为 0');
    const field = ACCOUNT_FIELD[account];
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.digitalHumanMember.findFirst({
        where: { id: input.memberId, siteId: input.siteId },
      });
      if (!member)
        throw new BusinessException(ErrorCode.NOT_FOUND, '会员不存在');
      const before = member[field];
      const after = before + delta;
      if (after < 0) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          account === 'point'
            ? `算力不足（需要 ${Math.abs(delta)}，当前 ${before}），请到「会员」页充值后再试`
            : account === 'body'
              ? `形象克隆点不足（需要 ${Math.abs(delta)}，当前 ${before}），请充值后再试`
              : `声音克隆点不足（需要 ${Math.abs(delta)}，当前 ${before}），请充值后再试`,
        );
      }
      const updated = await tx.digitalHumanMember.update({
        where: { id: member.id },
        data: { [field]: after },
      });
      const balanceAfter =
        account === 'point'
          ? updated.point
          : account === 'body'
            ? updated.bodyQuota
            : updated.voiceQuota;
      await tx.digitalHumanBalanceLog.create({
        data: {
          siteId: input.siteId,
          memberId: member.id,
          account,
          delta,
          balanceAfter,
          bizType: clip(input.bizType, 24),
          refId: Math.max(0, Math.round(input.refId || 0)),
          remark: clip(input.remark, 200),
          isRefund: input.isRefund === true,
        },
      });
      return balanceAfter;
    });
  }

  requireVip(site: SiteRow, member: MemberRow) {
    const config = siteConfigOf(site);
    if (config.login.mustVip && !isVip(member)) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '站点开启了会员专享，请先开通会员后再使用合成功能',
      );
    }
  }

  // ---------------- 管理端台账 ----------------

  async adminList(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const keyword = text(query.keyword).trim().slice(0, 40);
    const status = text(query.status).trim().toUpperCase();
    const vipOnly = text(query.vipOnly) === 'true';
    const promoterOnly = text(query.promoterOnly) === 'true';
    const where = {
      siteId: site.id,
      ...(status && status !== 'ALL'
        ? { status }
        : { status: { not: 'DELETED' } }),
      ...(keyword
        ? {
            OR: [
              { nickname: { contains: keyword } },
              { phone: { contains: keyword } },
            ],
          }
        : {}),
      ...(vipOnly ? { vipExpireAt: { gt: new Date() } } : {}),
      ...(promoterOnly ? { promoterLevel: { gt: 0 } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanMember.count({ where }),
      this.prisma.digitalHumanMember.findMany({
        where,
        orderBy: [{ lastLoginAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const ids = rows.map((row) => row.id);
    const grouped = ids.length
      ? await this.prisma.digitalHumanWork.groupBy({
          by: ['memberId'],
          where: { siteId: site.id, memberId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const workCount = new Map(
      grouped.map((row) => [row.memberId, row._count._all]),
    );
    const list = rows.map((row) =>
      this.toMemberRow(row, workCount.get(row.id) || 0),
    );
    return pageOf(list, total, page, pageSize);
  }

  async adminUpdate(user: CurrentUser, body: DhMemberUpdateInput) {
    const site = await this.siteOfOwner(user.userId);
    const member = await this.prisma.digitalHumanMember.findFirst({
      where: { id: body.id, siteId: site.id },
    });
    if (!member) throw new BusinessException(ErrorCode.NOT_FOUND, '会员不存在');
    const remark = clip(body.remark, 200) || '站点方调整';
    if (body.pointDelta) {
      await this.applyBalance({
        siteId: site.id,
        memberId: member.id,
        account: 'point',
        delta: body.pointDelta,
        bizType: 'admin',
        remark,
      });
    }
    if (body.bodyDelta) {
      await this.applyBalance({
        siteId: site.id,
        memberId: member.id,
        account: 'body',
        delta: body.bodyDelta,
        bizType: 'admin',
        remark,
      });
    }
    if (body.voiceDelta) {
      await this.applyBalance({
        siteId: site.id,
        memberId: member.id,
        account: 'voice',
        delta: body.voiceDelta,
        bizType: 'admin',
        remark,
      });
    }
    const data: Record<string, unknown> = {};
    if (body.vipDays) {
      const base =
        member.vipExpireAt && member.vipExpireAt.getTime() > Date.now()
          ? member.vipExpireAt.getTime()
          : Date.now();
      data.vipExpireAt = new Date(
        Math.max(Date.now(), base + body.vipDays * 86_400_000),
      );
    }
    if (body.status) data.status = body.status;
    if (Object.keys(data).length) {
      await this.prisma.digitalHumanMember.update({
        where: { id: member.id },
        data,
      });
    }
    await this.audit(
      user.userId,
      'dh.member.update',
      `member=${member.id} point${body.pointDelta || 0} body${body.bodyDelta || 0} voice${body.voiceDelta || 0} vip${body.vipDays || 0}`,
    );
    return this.memberView(member.id);
  }

  async balanceLogs(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.siteOfOwner(user.userId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const memberId = Number(query.memberId || 0);
    const account = text(query.account).trim();
    const where = {
      siteId: site.id,
      ...(memberId > 0 ? { memberId } : {}),
      ...(account ? { account } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.digitalHumanBalanceLog.count({ where }),
      this.prisma.digitalHumanBalanceLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const nameOf = await this.nameMap(
      site.id,
      rows.map((row) => row.memberId),
    );
    const list: DhBalanceLogRow[] = rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      nickname: nameOf.get(row.memberId) || `会员#${row.memberId}`,
      account: accountOf(row.account),
      delta: row.delta,
      balanceAfter: row.balanceAfter,
      bizType: row.bizType,
      isRefund: row.isRefund,
      remark: row.remark,
      createdAt: row.createdAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  // ---------------- 共用 ----------------

  /** 站点主人校验：整站只有主人能进管理端，会员令牌进不来这里。 */
  async siteOfOwner(userId: string): Promise<SiteRow> {
    const site = await this.prisma.digitalHumanSite.findUnique({
      where: { userId },
    });
    if (!site) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '数字人站点尚未创建');
    }
    if (site.status === 'CLOSED') {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '站点已关闭');
    }
    return site;
  }

  async nameMap(siteId: number, ids: number[]) {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.prisma.digitalHumanMember.findMany({
      where: { siteId, id: { in: unique } },
      select: { id: true, nickname: true },
    });
    return new Map(rows.map((row) => [row.id, row.nickname]));
  }

  private toMemberRow(member: MemberRow, workCount: number): DhMemberRow {
    return {
      id: member.id,
      nickname: member.nickname,
      avatar: member.avatar,
      phone: member.phone,
      point: member.point,
      bodyQuota: member.bodyQuota,
      voiceQuota: member.voiceQuota,
      vipExpireAt: member.vipExpireAt ? member.vipExpireAt.toISOString() : null,
      isVip: isVip(member),
      promoterLevel: member.promoterLevel,
      commissionBalance: member.commissionBalance,
      commissionTotal: member.commissionTotal,
      referrerId: member.referrerId,
      status: memberStatusOf(member.status),
      workCount,
      loginCount: member.loginCount,
      lastLoginAt: member.lastLoginAt ? member.lastLoginAt.toISOString() : null,
      createdAt: member.createdAt.toISOString(),
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
