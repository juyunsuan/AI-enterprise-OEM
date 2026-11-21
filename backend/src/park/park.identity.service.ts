import type { CustomerTokenPayload } from '../private-mini/customer-token';
import {
  issueCustomerToken,
  parseCustomerToken,
} from '../private-mini/customer-token';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { PrismaService } from '../prisma/prisma.service';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { Prisma } from '../../generated/prisma';
import { clip, customerRoleLabel, iso } from './park.helpers';
import { issueParkStaffToken, parseParkStaffToken } from './park.token';
import type { ParkSiteService } from './park.site.service';

type SiteRow = Prisma.ParkSiteGetPayload<object>;
type CustomerRow = Prisma.ParkCustomerGetPayload<object>;
type StaffRow = Prisma.ParkStaffGetPayload<object>;

export type ParkIdentity = {
  site: SiteRow;
  customer: CustomerRow;
};

export type ParkStaffIdentity = {
  site: SiteRow;
  staff: StaffRow;
};

const profileView = async (prisma: PrismaService, customer: CustomerRow) => {
  const tenant = customer.tenantId
    ? await prisma.parkTenant.findFirst({
        where: { id: customer.tenantId, siteId: customer.siteId },
      })
    : null;
  return {
    customerId: customer.id,
    siteId: customer.siteId,
    nickname: customer.nickname,
    phone: customer.phone,
    avatar: customer.avatar,
    tenantId: customer.tenantId,
    tenantName: tenant?.name || '',
    memberRole: customer.memberRole,
    memberRoleLabel: customerRoleLabel(customer.memberRole),
    status: customer.status,
  };
};

/** 园区 C 端身份：微信登录、企业绑定、个人资料；与其它小程序顾客表物理隔离。 */
export class ParkIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: ParkSiteService,
    private readonly miniApp: MiniAppService,
    private readonly client: MiniProgramClient,
  ) {}

  async login(parkCode: string, code: string) {
    const site = await this.sites.siteByCode(parkCode, { requireOnline: true });
    const runtime = await this.miniApp.requireRuntime({
      ownerUserId: site.ownerUserId,
      scene: 'PARK',
      shopId: site.id,
      shopName: site.name,
    });
    const session = await this.client.code2Session(runtime, code);
    const row = await this.prisma.parkCustomer.upsert({
      where: {
        siteId_openid: { siteId: site.id, openid: session.openId },
      },
      create: {
        siteId: site.id,
        openid: session.openId,
        unionId: session.unionId,
        lastLoginAt: new Date(),
      },
      update: {
        ...(session.unionId ? { unionId: session.unionId } : {}),
        lastLoginAt: new Date(),
      },
    });
    if (row.status !== 'ACTIVE') {
      throw new BusinessException(ErrorCode.FORBIDDEN, '该账号已被园区停用');
    }
    const token = issueCustomerToken({
      scene: 'PARK',
      shopId: site.id,
      customerId: row.id,
      openid: row.openid,
    });
    return { token, profile: await profileView(this.prisma, row) };
  }

  async identity(token: string): Promise<ParkIdentity> {
    const payload: CustomerTokenPayload = parseCustomerToken(token);
    if (payload.scene !== 'PARK') {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态不属于园区小程序，请重新进入',
      );
    }
    const [site, customer] = await Promise.all([
      this.prisma.parkSite.findUnique({ where: { id: payload.shopId } }),
      this.prisma.parkCustomer.findFirst({
        where: { id: payload.customerId, siteId: payload.shopId },
      }),
    ]);
    if (!site || !customer) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录状态已失效，请重新进入小程序',
      );
    }
    if (site.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '园区已暂停服务，请联系园区管理员',
      );
    }
    return { site, customer };
  }

  async profile(customer: CustomerRow) {
    return profileView(this.prisma, customer);
  }

  async updateProfile(customer: CustomerRow, body: Record<string, unknown>) {
    const updated = await this.prisma.parkCustomer.update({
      where: { id: customer.id },
      data: {
        ...(typeof body.nickname === 'string'
          ? { nickname: clip(body.nickname, 60) }
          : {}),
        ...(typeof body.phone === 'string'
          ? { phone: clip(body.phone, 32) }
          : {}),
        ...(typeof body.avatar === 'string'
          ? { avatar: clip(body.avatar, 500) }
          : {}),
      },
    });
    return profileView(this.prisma, updated);
  }

  async bindTenant(customer: CustomerRow, codeRaw: string) {
    const code = clip(codeRaw, 12).toUpperCase();
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写企业加入码');
    }
    const tenant = await this.prisma.parkTenant.findFirst({
      where: {
        siteId: customer.siteId,
        joinCode: code,
        status: 'ACTIVE',
      },
    });
    if (!tenant) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '企业加入码无效，请向园区管理员确认',
      );
    }
    const updated = await this.prisma.parkCustomer.update({
      where: { id: customer.id },
      data: {
        tenantId: tenant.id,
        memberRole: 'EMPLOYEE',
      },
    });
    const profile = await profileView(this.prisma, updated);
    return { ...profile, tenantName: tenant.name };
  }

  async staffBind(parkCode: string, phoneRaw: string, staffCodeRaw: string) {
    const site = await this.sites.siteByCode(parkCode, { requireOnline: true });
    const phone = clip(phoneRaw, 32);
    const staffCode = clip(staffCodeRaw, 32).toUpperCase();
    const staff = await this.prisma.parkStaff.findFirst({
      where: {
        siteId: site.id,
        phone,
        staffCode,
        status: 'ACTIVE',
      },
    });
    if (!staff) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '手机号或工号不正确，请联系园区管理员',
      );
    }
    const token = issueParkStaffToken({
      scene: 'PARK',
      parkId: site.id,
      staffId: staff.id,
    });
    return {
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        role: staff.role,
        department: staff.department,
        siteName: site.name,
        parkCode: site.parkCode,
      },
    };
  }

  async staffIdentity(token: string): Promise<ParkStaffIdentity> {
    const payload = parseParkStaffToken(token);
    const [site, staff] = await Promise.all([
      this.prisma.parkSite.findUnique({ where: { id: payload.parkId } }),
      this.prisma.parkStaff.findFirst({
        where: { id: payload.staffId, siteId: payload.parkId },
      }),
    ]);
    if (!site || !staff || staff.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '员工身份已失效，请重新绑定',
      );
    }
    if (site.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '园区已暂停服务',
      );
    }
    return { site, staff };
  }

  async staffWorkbench(identity: ParkStaffIdentity) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [approvals, workOrders, checkins, reservations] = await Promise.all([
      this.prisma.parkApprovalTask.count({
        where: {
          approverType: 'STAFF',
          approverId: identity.staff.id,
          status: 'PENDING',
        },
      }),
      this.prisma.parkWorkOrder.count({
        where: {
          siteId: identity.site.id,
          status: { in: ['PENDING', 'ASSIGNED', 'PROCESSING'] },
          OR: [{ assigneeStaffId: 0 }, { assigneeStaffId: identity.staff.id }],
        },
      }),
      this.prisma.parkReservation.count({
        where: {
          siteId: identity.site.id,
          status: 'CHECKED_IN',
          checkedInAt: { gte: today },
        },
      }),
      this.prisma.parkReservation.count({
        where: { siteId: identity.site.id, status: 'APPROVED' },
      }),
    ]);
    return {
      site: {
        id: identity.site.id,
        name: identity.site.name,
        parkCode: identity.site.parkCode,
      },
      staff: {
        id: identity.staff.id,
        name: identity.staff.name,
        role: identity.staff.role,
        roleLabel: identity.staff.role,
        department: identity.staff.department,
      },
      counts: { approvals, workOrders, checkins, reservations },
      updatedAt: iso(new Date()),
    };
  }
}
