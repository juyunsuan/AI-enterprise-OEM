import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import type { HealthCrypto } from './health-crypto';
import type { HealthMonitorService } from './health.monitor.service';
import {
  HealthStaffService,
  type HealthStaffIdentity,
} from './health.staff.service';

/**
 * AI 医护的口径回归（健康域只存引用，不造 AI）。
 *
 * 这里锁两件事：
 * 1. AI 医护的开关与绑定只有本店管理员（医护端 role=MANAGER）能改；
 * 2. 「未开启」与「未绑定」是两条不同的拒绝理由，且都在真正调用 AI客服之前拦下——
 *    钩子一次都不该被触发，否则前端会拿到一个「开关明明关着」的答案。
 */

const SHOP_ID = 7;

const staffCtx = (
  role: string,
  deskAiAgentId: number,
): HealthStaffIdentity => ({
  shopId: SHOP_ID,
  roleLabel: role,
  practitioner: {
    id: 11,
    shopId: SHOP_ID,
    organId: 0,
    hospitalId: 0,
    departmentId: 0,
    teamId: 0,
    name: '张医生',
    role,
    title: '',
    avatar: '',
    phone: '',
    city: '',
    intro: '',
    goodAtJson: [],
    licenseNo: '',
    commissionPercent: 0,
    deskAiAgentId,
    auditStatus: 'APPROVED',
    status: 'ON',
    scoreSum: 0,
    scoreCount: 0,
  },
});

type Asks = { ownerUserId: string; agentId: number; question: string }[];

/** 最小假库：只实现被测路径用到的成员，写操作记进 writes 便于断言「没落库」。 */
const newService = (input: {
  aiStaffEnabled: boolean;
  writes: string[];
  asks: Asks;
}) => {
  const service = new HealthStaffService(
    stub<PrismaService>({
      healthShop: {
        findFirst: () =>
          Promise.resolve({
            id: SHOP_ID,
            ownerUserId: '1001',
            aiStaffEnabled: input.aiStaffEnabled,
          }),
        updateMany: () => {
          input.writes.push('shop.aiStaffEnabled');
          return Promise.resolve({ count: 1 });
        },
      },
      healthPractitioner: {
        findMany: () => Promise.resolve([]),
        updateMany: () => {
          input.writes.push('practitioner.deskAiAgentId');
          return Promise.resolve({ count: 1 });
        },
      },
      auditLog: { create: () => Promise.resolve({}) },
    }),
    stub<HealthMonitorService>(),
    stub<HealthCrypto>(),
  );
  // 问答钩子按 services.ts 的装配形态替身：健康域拿到的答案一律原样透传。
  service.aiAnswer = (ask) => {
    input.asks.push({
      ownerUserId: ask.ownerUserId,
      agentId: ask.agentId,
      question: ask.question,
    });
    return Promise.resolve({
      agentId: ask.agentId,
      agentName: '小卫',
      answer: '建议先规范测量并记录 3 天血压。',
      references: [{ title: '高血压随访手册', ref: 'kb://1' }],
      handoff: false,
    });
  };
  service.aiAgentList = () =>
    Promise.resolve([
      { id: 5, name: '小卫', mode: 'BOT', status: 'ON', statusLabel: '在岗' },
    ]);
  return service;
};

describe('HealthStaffService AI 医护', () => {
  it('非本店管理员改 AI 医护开关会被拒绝，且不落库', async () => {
    const writes: string[] = [];
    const asks: Asks = [];
    const service = newService({ aiStaffEnabled: false, writes, asks });

    await expect(
      service.aiEnabledSave(staffCtx('DOCTOR', 5), { enabled: true }),
    ).rejects.toThrow('仅本店管理员可设置 AI 医护');
    await expect(
      service.aiBindingSave(staffCtx('GUIDE', 0), {
        practitionerId: 12,
        agentId: 5,
      }),
    ).rejects.toThrow('仅本店管理员可设置 AI 医护');
    expect(writes).toEqual([]);
  });

  it('开关未开启时提问直接拒绝，不会去调 AI客服', async () => {
    const writes: string[] = [];
    const asks: Asks = [];
    const service = newService({ aiStaffEnabled: false, writes, asks });

    await expect(
      service.aiAsk(staffCtx('DOCTOR', 5), { question: '血压 150/95 怎么办' }),
    ).rejects.toThrow('AI 医护未开启');
    expect(asks).toEqual([]);
  });

  it('已开启但未绑定 AI 客服时给的是「请先绑定」，与未开启区分开', async () => {
    const writes: string[] = [];
    const asks: Asks = [];
    const service = newService({ aiStaffEnabled: true, writes, asks });

    await expect(
      service.aiAsk(staffCtx('DOCTOR', 0), { question: '血压 150/95 怎么办' }),
    ).rejects.toThrow('请先绑定 AI 客服');
    expect(asks).toEqual([]);

    // 开关与绑定都齐了才放行，答案原样透传回来。
    const answer = await service.aiAsk(staffCtx('DOCTOR', 5), {
      question: '  血压 150/95 怎么办  ',
    });
    expect(asks).toEqual([
      { ownerUserId: '1001', agentId: 5, question: '血压 150/95 怎么办' },
    ]);
    expect(answer).toEqual({
      agentName: '小卫',
      answer: '建议先规范测量并记录 3 天血压。',
      references: [{ title: '高血压随访手册', ref: 'kb://1' }],
      handoff: false,
    });
  });
});
