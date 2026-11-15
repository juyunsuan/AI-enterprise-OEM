import { ContentAgentService } from './agent.service';
import { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';

/**
 * Agent 与 Workbuddy 主机共用 content_agent_conversations，但分属两个台面：
 * Agent 的会话列表与单会话入口都必须钉在 scene=agent 上，
 * 否则主机对话会跑进 Agent 的会话列表。
 */
function serviceWith(findFirst: jest.Mock) {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = stub<PrismaService>({
    contentAgentConversation: { findMany, findFirst },
  });
  const service = new ContentAgentService(
    prisma,
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
  );
  return { service, findMany, findFirst };
}

const user = new CurrentUser('u1', 'tester', 'user');

describe('ContentAgentService 会话台面隔离', () => {
  it('会话列表只查 scene=agent，主机对话不进 Agent 列表', async () => {
    const { service, findMany } = serviceWith(jest.fn());
    await service.listConversations(user);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', scene: 'agent' },
      }),
    );
  });

  it('按编号打开会话时同样带 scene=agent：主机会话对 Agent 不可见', async () => {
    const { service, findFirst } = serviceWith(
      jest.fn().mockResolvedValue(null),
    );
    const caught = await service
      .messages(user, '3')
      .catch((error: unknown) => error);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 3, userId: 'u1', scene: 'agent' },
    });
    expect(caught).toBeInstanceOf(BusinessException);
    expect((caught as BusinessException).errorCode).toBe(ErrorCode.NOT_FOUND);
  });
});
