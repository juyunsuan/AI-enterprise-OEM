import type { MiniAppService } from '../private-mini/mini-app.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import { issueCustomerToken } from '../private-mini/customer-token';
import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { ParkApprovalService } from './park.approval.service';
import { ParkIdentityService } from './park.identity.service';
import type { ParkSiteService } from './park.site.service';

describe('园区终端身份与数据隔离', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'park-isolation-test-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('其它小程序场景的顾客令牌不能进入园区', async () => {
    const token = issueCustomerToken({
      scene: 'ERRAND',
      shopId: 9,
      customerId: 7,
      openid: 'openid-other-mini',
    });
    const service = new ParkIdentityService(
      stub<PrismaService>({}),
      stub<ParkSiteService>({}),
      stub<MiniAppService>({}),
      stub<MiniProgramClient>({}),
    );
    await expect(service.identity(token)).rejects.toThrow(
      '登录状态不属于园区小程序',
    );
  });

  it('员工端不能操作其它园区的审批单', async () => {
    const prisma = stub<PrismaService>({
      parkApproval: {
        findUnique: async () => ({ id: 1, siteId: 2 }),
      },
    });
    const service = new ParkApprovalService(prisma, stub<ParkSiteService>({}));
    await expect(service.own(1, 1)).rejects.toThrow('审批单不存在');
  });
});
