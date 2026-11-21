import {
  PARK_SITE_STATUSES,
  type ParkAnnouncement,
  type ParkAnnouncementInput,
  type ParkBuilding,
  type ParkBuildingInput,
  type ParkCustomer,
  type ParkOverview,
  type ParkSite,
  type ParkSiteInput,
  type ParkStaff,
  type ParkStaffInput,
  type ParkTenant,
  type ParkTenantInput,
  type ParkUnit,
  type ParkUnitInput,
  type ParkWorkOrder,
  type ParkReservation,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../../generated/prisma';
import {
  announcementCategoryLabel,
  clip,
  customerRoleLabel,
  integer,
  iso,
  joinCode,
  jsonList,
  jsonObject,
  pageArgs,
  randomCode,
  reservationKindLabel,
  reservationStatusLabel,
  siteStatusLabel,
  staffRoleLabel,
  staffStatusLabel,
  tenantStatusLabel,
  unitStatusLabel,
  workOrderCategoryLabel,
  workOrderStatusLabel,
} from './park.helpers';

type SiteRow = Prisma.ParkSiteGetPayload<object>;
type BuildingRow = Prisma.ParkBuildingGetPayload<object>;
type UnitRow = Prisma.ParkUnitGetPayload<object>;
type TenantRow = Prisma.ParkTenantGetPayload<object>;
type StaffRow = Prisma.ParkStaffGetPayload<object>;
type CustomerRow = Prisma.ParkCustomerGetPayload<object>;
type AnnouncementRow = Prisma.ParkAnnouncementGetPayload<object>;

const siteView = (
  row: SiteRow,
  counts?: { buildings: number; units: number; tenants: number },
): ParkSite => ({
  id: row.id,
  parkCode: row.parkCode,
  name: row.name,
  logo: row.logo,
  themeColor: row.themeColor,
  province: row.province,
  city: row.city,
  district: row.district,
  addressLine: row.addressLine,
  lng: row.lng,
  lat: row.lat,
  phone: row.phone,
  notice: row.notice,
  deskSiteKey: row.deskSiteKey,
  status: row.status as ParkSite['status'],
  statusLabel: siteStatusLabel(row.status),
  buildingCount: counts?.buildings || 0,
  unitCount: counts?.units || 0,
  tenantCount: counts?.tenants || 0,
  createdAt: iso(row.createdAt),
});

const buildingView = (row: BuildingRow, unitCount: number): ParkBuilding => ({
  id: row.id,
  siteId: row.siteId,
  name: row.name,
  floors: row.floors,
  addressLine: row.addressLine,
  sort: row.sort,
  status: row.status,
  unitCount,
  createdAt: iso(row.createdAt),
});

const unitView = (
  row: UnitRow,
  buildingName: string,
  tenantName: string,
): ParkUnit => ({
  id: row.id,
  siteId: row.siteId,
  buildingId: row.buildingId,
  buildingName,
  roomNo: row.roomNo,
  floor: row.floor,
  area: Number(row.area),
  usage: row.usage,
  status: row.status as ParkUnit['status'],
  statusLabel: unitStatusLabel(row.status),
  tenantId: row.tenantId,
  tenantName,
  attributes: jsonObject(row.attributes),
  createdAt: iso(row.createdAt),
});

const tenantView = (
  row: TenantRow,
  unitNames: string[],
  memberCount: number,
): ParkTenant => ({
  id: row.id,
  siteId: row.siteId,
  name: row.name,
  creditCode: row.creditCode,
  industry: row.industry,
  contactName: row.contactName,
  contactPhone: row.contactPhone,
  unitIds: jsonList(row.unitIds)
    .map((item) => Number(item))
    .filter(Boolean),
  unitNames,
  joinCode: row.joinCode,
  status: row.status as ParkTenant['status'],
  statusLabel: tenantStatusLabel(row.status),
  memberCount,
  note: row.note,
  createdAt: iso(row.createdAt),
});

const staffView = (row: StaffRow): ParkStaff => ({
  id: row.id,
  siteId: row.siteId,
  name: row.name,
  phone: row.phone,
  staffCode: row.staffCode,
  role: row.role as ParkStaff['role'],
  roleLabel: staffRoleLabel(row.role),
  department: row.department,
  status: row.status as ParkStaff['status'],
  statusLabel: staffStatusLabel(row.status),
  createdAt: iso(row.createdAt),
});

const announcementView = (row: AnnouncementRow): ParkAnnouncement => ({
  id: row.id,
  siteId: row.siteId,
  category: row.category as ParkAnnouncement['category'],
  categoryLabel: announcementCategoryLabel(row.category),
  title: row.title,
  summary: row.summary,
  content: row.content,
  cover: row.cover,
  pinned: row.pinned,
  status: row.status as ParkAnnouncement['status'],
  statusLabel:
    row.status === 'PUBLISHED'
      ? '已发布'
      : row.status === 'OFFLINE'
        ? '已下线'
        : '草稿',
  publishedAt: iso(row.publishedAt),
  createdAt: iso(row.createdAt),
});

/** 管理端园区域：站点、空间、租户、员工、公告与概览。 */
export class ParkSiteService {
  constructor(private readonly prisma: PrismaService) {}

  async sites(user: CurrentUser): Promise<ParkSite[]> {
    const rows = await this.prisma.parkSite.findMany({
      where: { ownerUserId: user.userId },
      orderBy: [{ id: 'desc' }],
    });
    return Promise.all(
      rows.map(async (row) => {
        const [buildings, units, tenants] = await Promise.all([
          this.prisma.parkBuilding.count({ where: { siteId: row.id } }),
          this.prisma.parkUnit.count({ where: { siteId: row.id } }),
          this.prisma.parkTenant.count({ where: { siteId: row.id } }),
        ]);
        return siteView(row, { buildings, units, tenants });
      }),
    );
  }

  async requireSite(user: CurrentUser, siteId: number): Promise<SiteRow> {
    const row = await this.prisma.parkSite.findFirst({
      where: { id: siteId, ownerUserId: user.userId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '园区不存在或无权访问');
    }
    return row;
  }

  async requireSiteById(siteId: number): Promise<SiteRow> {
    const row = await this.prisma.parkSite.findUnique({
      where: { id: siteId },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '园区不存在');
    }
    return row;
  }

  async siteByCode(code: string, { requireOnline = false } = {}) {
    const parkCode = clip(code, 16).toUpperCase();
    if (!parkCode) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少园区码');
    }
    const row = await this.prisma.parkSite.findUnique({ where: { parkCode } });
    if (!row || (requireOnline && row.status !== 'ONLINE')) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '园区不存在或已停用，请返回首页重新进入',
      );
    }
    return row;
  }

  async siteByAppId(appId: string) {
    const value = clip(appId, 64);
    if (!value) return null;
    const app = await this.prisma.miniProgramApp.findFirst({
      where: { appId: value, scene: 'PARK' },
    });
    if (!app || !app.shopId) return null;
    return this.prisma.parkSite.findUnique({ where: { id: app.shopId } });
  }

  async saveSite(user: CurrentUser, body: ParkSiteInput): Promise<ParkSite> {
    const id = integer(body.id, 0);
    const existing = id ? await this.requireSite(user, id) : null;
    const data = {
      name: clip(body.name, 120),
      logo: clip(body.logo, 500),
      themeColor: clip(body.themeColor, 16) || '#3370FF',
      province: clip(body.province, 40),
      city: clip(body.city, 40),
      district: clip(body.district, 40),
      addressLine: clip(body.addressLine, 200),
      lng: Number(body.lng) || 0,
      lat: Number(body.lat) || 0,
      phone: clip(body.phone, 32),
      notice: clip(body.notice, 500),
      deskSiteKey: clip(body.deskSiteKey, 64),
    };
    if (!data.name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写园区名称');
    }
    let row: SiteRow;
    if (existing) {
      row = await this.prisma.parkSite.update({
        where: { id: existing.id },
        data,
      });
    } else {
      let parkCode = '';
      for (let i = 0; i < 20; i += 1) {
        const code = randomCode(8);
        const taken = await this.prisma.parkSite.findUnique({
          where: { parkCode: code },
        });
        if (!taken) {
          parkCode = code;
          break;
        }
      }
      if (!parkCode) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '园区码生成失败，请重试',
        );
      }
      row = await this.prisma.parkSite.create({
        data: { ...data, ownerUserId: user.userId, parkCode },
      });
    }
    const [buildings, units, tenants] = await Promise.all([
      this.prisma.parkBuilding.count({ where: { siteId: row.id } }),
      this.prisma.parkUnit.count({ where: { siteId: row.id } }),
      this.prisma.parkTenant.count({ where: { siteId: row.id } }),
    ]);
    return siteView(row, { buildings, units, tenants });
  }

  async setSiteStatus(user: CurrentUser, id: number, status: string) {
    const site = await this.requireSite(user, id);
    if (
      !PARK_SITE_STATUSES.includes(
        status as (typeof PARK_SITE_STATUSES)[number],
      )
    ) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '园区状态不合法');
    }
    const row = await this.prisma.parkSite.update({
      where: { id: site.id },
      data: { status },
    });
    const [buildings, units, tenants] = await Promise.all([
      this.prisma.parkBuilding.count({ where: { siteId: row.id } }),
      this.prisma.parkUnit.count({ where: { siteId: row.id } }),
      this.prisma.parkTenant.count({ where: { siteId: row.id } }),
    ]);
    return siteView(row, { buildings, units, tenants });
  }

  // ------------------------------------------------------------ 楼宇

  async buildings(user: CurrentUser, siteId: number): Promise<ParkBuilding[]> {
    await this.requireSite(user, siteId);
    const rows = await this.prisma.parkBuilding.findMany({
      where: { siteId },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const counts = await this.prisma.parkUnit.groupBy({
      by: ['buildingId'],
      where: { siteId },
      _count: { _all: true },
    });
    const byBuilding = new Map(
      counts.map((row) => [row.buildingId, row._count._all]),
    );
    return rows.map((row) => buildingView(row, byBuilding.get(row.id) || 0));
  }

  async saveBuilding(user: CurrentUser, body: ParkBuildingInput) {
    const site = await this.requireSite(user, body.siteId);
    const id = integer(body.id, 0);
    const name = clip(body.name, 80);
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写楼宇名称');
    }
    const duplicate = await this.prisma.parkBuilding.findFirst({
      where: { siteId: site.id, name, NOT: id ? { id } : undefined },
    });
    if (duplicate) {
      throw new BusinessException(ErrorCode.CONFLICT, '该楼宇名称已存在');
    }
    const data = {
      name,
      floors: Math.min(200, Math.max(1, integer(body.floors, 1))),
      addressLine: clip(body.addressLine, 200),
      sort: integer(body.sort, 0),
    };
    const row = id
      ? await this.prisma.parkBuilding.update({
          where: { id },
          data,
        })
      : await this.prisma.parkBuilding.create({
          data: { ...data, siteId: site.id },
        });
    const unitCount = await this.prisma.parkUnit.count({
      where: { siteId: site.id, buildingId: row.id },
    });
    return buildingView(row, unitCount);
  }

  async removeBuilding(user: CurrentUser, id: number) {
    const row = await this.prisma.parkBuilding.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '楼宇不存在');
    }
    const unitCount = await this.prisma.parkUnit.count({
      where: { siteId: row.siteId, buildingId: row.id },
    });
    if (unitCount > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该楼宇下还有房间，请先删除房间',
      );
    }
    await this.prisma.parkBuilding.delete({ where: { id: row.id } });
    return { ok: true, message: '已删除' };
  }

  // ------------------------------------------------------------ 房间

  async units(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<ParkUnit[]> {
    await this.requireSite(user, siteId);
    const buildingId = integer(query.buildingId, 0);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const rows = await this.prisma.parkUnit.findMany({
      where: {
        siteId,
        ...(buildingId ? { buildingId } : {}),
        ...(status ? { status } : {}),
        ...(keyword ? { roomNo: { contains: keyword } } : {}),
      },
      orderBy: [{ buildingId: 'asc' }, { floor: 'asc' }, { roomNo: 'asc' }],
    });
    const [buildings, tenants] = await Promise.all([
      this.prisma.parkBuilding.findMany({
        where: { siteId },
        select: { id: true, name: true },
      }),
      this.prisma.parkTenant.findMany({
        where: { siteId },
        select: { id: true, name: true },
      }),
    ]);
    const buildingNames = new Map(
      buildings.map((item) => [item.id, item.name]),
    );
    const tenantNames = new Map(tenants.map((item) => [item.id, item.name]));
    return rows.map((row) =>
      unitView(
        row,
        buildingNames.get(row.buildingId) || '',
        tenantNames.get(row.tenantId) || '',
      ),
    );
  }

  async saveUnit(user: CurrentUser, body: ParkUnitInput) {
    const site = await this.requireSite(user, body.siteId);
    const building = await this.prisma.parkBuilding.findFirst({
      where: { id: body.buildingId, siteId: site.id },
    });
    if (!building) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '楼宇不存在');
    }
    const id = integer(body.id, 0);
    const roomNo = clip(body.roomNo, 40);
    if (!roomNo) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写房间号');
    }
    const duplicate = await this.prisma.parkUnit.findFirst({
      where: {
        siteId: site.id,
        buildingId: building.id,
        roomNo,
        NOT: id ? { id } : undefined,
      },
    });
    if (duplicate) {
      throw new BusinessException(ErrorCode.CONFLICT, '该房间号已存在');
    }
    const data = {
      buildingId: building.id,
      roomNo,
      floor: integer(body.floor, 1),
      area: Number(body.area) || 0,
      usage: clip(body.usage, 24) || 'OFFICE',
      status: body.status,
      attributes: jsonObject(body.attributes) as Prisma.InputJsonValue,
    };
    const row = id
      ? await this.prisma.parkUnit.update({ where: { id }, data })
      : await this.prisma.parkUnit.create({
          data: { ...data, siteId: site.id },
        });
    const tenant = row.tenantId
      ? await this.prisma.parkTenant.findFirst({
          where: { id: row.tenantId, siteId: site.id },
        })
      : null;
    return unitView(row, building.name, tenant?.name || '');
  }

  async removeUnit(user: CurrentUser, id: number) {
    const row = await this.prisma.parkUnit.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '房间不存在');
    }
    if (row.tenantId) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该房间已绑定租户，请先在租户中解绑',
      );
    }
    await this.prisma.parkUnit.delete({ where: { id: row.id } });
    return { ok: true, message: '已删除' };
  }

  // ------------------------------------------------------------ 租户

  async tenants(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<ParkTenant[]> {
    await this.requireSite(user, siteId);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const rows = await this.prisma.parkTenant.findMany({
      where: {
        siteId,
        ...(status ? { status } : {}),
        ...(keyword ? { name: { contains: keyword } } : {}),
      },
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
    });
    const allUnits = await this.prisma.parkUnit.findMany({
      where: { siteId },
      select: { id: true, buildingId: true, roomNo: true },
    });
    const buildings = await this.prisma.parkBuilding.findMany({
      where: { siteId },
      select: { id: true, name: true },
    });
    const buildingNames = new Map(
      buildings.map((item) => [item.id, item.name]),
    );
    const unitNames = new Map(
      allUnits.map((item) => [
        item.id,
        `${buildingNames.get(item.buildingId) || ''} ${item.roomNo}`.trim(),
      ]),
    );
    const counts = await this.prisma.parkCustomer.groupBy({
      by: ['tenantId'],
      where: { siteId, tenantId: { gt: 0 } },
      _count: { _all: true },
    });
    const memberCounts = new Map(
      counts.map((item) => [item.tenantId, item._count._all]),
    );
    return rows.map((row) =>
      tenantView(
        row,
        jsonList(row.unitIds)
          .map((item) => unitNames.get(Number(item)) || '')
          .filter(Boolean),
        memberCounts.get(row.id) || 0,
      ),
    );
  }

  async saveTenant(user: CurrentUser, body: ParkTenantInput) {
    const site = await this.requireSite(user, body.siteId);
    const id = integer(body.id, 0);
    const name = clip(body.name, 120);
    if (!name) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写租户名称');
    }
    const duplicate = await this.prisma.parkTenant.findFirst({
      where: { siteId: site.id, name, NOT: id ? { id } : undefined },
    });
    if (duplicate) {
      throw new BusinessException(ErrorCode.CONFLICT, '该租户名称已存在');
    }
    const unitIds = [
      ...new Set(body.unitIds.map((item) => integer(item, 0))),
    ].filter((item) => item > 0);
    const units = unitIds.length
      ? await this.prisma.parkUnit.findMany({
          where: { siteId: site.id, id: { in: unitIds } },
        })
      : [];
    if (units.length !== unitIds.length) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '部分房间不存在');
    }
    const occupied = units.filter(
      (unit) => unit.tenantId && unit.tenantId !== id,
    );
    if (occupied.length) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `房间 ${occupied.map((unit) => unit.roomNo).join('、')} 已绑定其他租户`,
      );
    }
    const existing = id
      ? await this.prisma.parkTenant.findFirst({
          where: { id, siteId: site.id },
        })
      : null;
    if (id && !existing) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '租户不存在');
    }
    let code = existing?.joinCode || '';
    if (!code) {
      for (let i = 0; i < 20; i += 1) {
        const next = joinCode();
        const taken = await this.prisma.parkTenant.findFirst({
          where: { siteId: site.id, joinCode: next },
        });
        if (!taken) {
          code = next;
          break;
        }
      }
    }
    if (!code) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '企业加入码生成失败，请重试',
      );
    }
    const data = {
      name,
      creditCode: clip(body.creditCode, 32),
      industry: clip(body.industry, 40),
      contactName: clip(body.contactName, 64),
      contactPhone: clip(body.contactPhone, 32),
      unitIds: unitIds as Prisma.InputJsonValue,
      joinCode: code,
      status: body.status,
      note: clip(body.note, 500),
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.parkTenant.update({ where: { id: existing.id }, data })
        : await tx.parkTenant.create({
            data: { ...data, siteId: site.id },
          });
      await tx.parkUnit.updateMany({
        where: { siteId: site.id, tenantId: saved.id },
        data: { tenantId: 0, status: 'VACANT' },
      });
      if (unitIds.length) {
        await tx.parkUnit.updateMany({
          where: { siteId: site.id, id: { in: unitIds } },
          data: { tenantId: saved.id, status: 'OCCUPIED' },
        });
      }
      return saved;
    });
    const memberCount = await this.prisma.parkCustomer.count({
      where: { siteId: site.id, tenantId: row.id },
    });
    const unitNames = units.map((unit) => unit.roomNo);
    return tenantView(row, unitNames, memberCount);
  }

  async removeTenant(user: CurrentUser, id: number) {
    const row = await this.prisma.parkTenant.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '租户不存在');
    }
    await this.prisma.$transaction([
      this.prisma.parkUnit.updateMany({
        where: { siteId: row.siteId, tenantId: row.id },
        data: { tenantId: 0, status: 'VACANT' },
      }),
      this.prisma.parkCustomer.updateMany({
        where: { siteId: row.siteId, tenantId: row.id },
        data: { tenantId: 0, memberRole: 'VISITOR' },
      }),
      this.prisma.parkTenant.delete({ where: { id: row.id } }),
    ]);
    return { ok: true, message: '已删除' };
  }

  // ------------------------------------------------------------ 员工

  async staffs(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<ParkStaff[]> {
    await this.requireSite(user, siteId);
    const status = clip(query.status, 16);
    const role = clip(query.role, 20);
    const keyword = clip(query.keyword, 60);
    const rows = await this.prisma.parkStaff.findMany({
      where: {
        siteId,
        ...(status ? { status } : {}),
        ...(role ? { role } : {}),
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword } },
                { phone: { contains: keyword } },
                { staffCode: { contains: keyword } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { id: 'desc' }],
    });
    return rows.map(staffView);
  }

  async saveStaff(user: CurrentUser, body: ParkStaffInput) {
    const site = await this.requireSite(user, body.siteId);
    const id = integer(body.id, 0);
    const staffCode = clip(body.staffCode, 32).toUpperCase();
    if (!staffCode) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写员工工号');
    }
    const duplicate = await this.prisma.parkStaff.findFirst({
      where: {
        siteId: site.id,
        staffCode,
        NOT: id ? { id } : undefined,
      },
    });
    if (duplicate) {
      throw new BusinessException(ErrorCode.CONFLICT, '该工号已存在');
    }
    const data = {
      name: clip(body.name, 60),
      phone: clip(body.phone, 32),
      staffCode,
      role: body.role,
      department: clip(body.department, 40),
      status: body.status,
    };
    if (!data.name || !data.phone) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写姓名与手机号');
    }
    const row = id
      ? await this.prisma.parkStaff.update({ where: { id }, data })
      : await this.prisma.parkStaff.create({
          data: { ...data, siteId: site.id },
        });
    return staffView(row);
  }

  async setStaffStatus(user: CurrentUser, id: number, status: string) {
    const row = await this.prisma.parkStaff.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '员工不存在');
    }
    const updated = await this.prisma.parkStaff.update({
      where: { id: row.id },
      data: { status },
    });
    return staffView(updated);
  }

  // ------------------------------------------------------------ 顾客

  async customers(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ) {
    await this.requireSite(user, siteId);
    const { page, pageSize, offset } = pageArgs(query);
    const tenantId = integer(query.tenantId, 0);
    const keyword = clip(query.keyword, 60);
    const where: Prisma.ParkCustomerWhereInput = {
      siteId,
      ...(tenantId ? { tenantId } : {}),
      ...(keyword
        ? {
            OR: [
              { nickname: { contains: keyword } },
              { phone: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [rows, total, tenants] = await Promise.all([
      this.prisma.parkCustomer.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.parkCustomer.count({ where }),
      this.prisma.parkTenant.findMany({
        where: { siteId },
        select: { id: true, name: true },
      }),
    ]);
    const tenantNames = new Map(tenants.map((item) => [item.id, item.name]));
    const list: ParkCustomer[] = rows.map((row: CustomerRow) => ({
      id: row.id,
      siteId: row.siteId,
      nickname: row.nickname,
      phone: row.phone,
      avatar: row.avatar,
      tenantId: row.tenantId,
      tenantName: tenantNames.get(row.tenantId) || '',
      memberRole: row.memberRole as ParkCustomer['memberRole'],
      memberRoleLabel: customerRoleLabel(row.memberRole),
      status: row.status,
      lastLoginAt: iso(row.lastLoginAt),
      createdAt: iso(row.createdAt),
    }));
    return { list, total, page, pageSize };
  }

  async setCustomerRole(user: CurrentUser, id: number, memberRole: string) {
    const row = await this.prisma.parkCustomer.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '用户不存在');
    }
    const updated = await this.prisma.parkCustomer.update({
      where: { id: row.id },
      data: { memberRole },
    });
    const tenant = updated.tenantId
      ? await this.prisma.parkTenant.findFirst({
          where: { id: updated.tenantId, siteId: updated.siteId },
        })
      : null;
    return {
      id: updated.id,
      siteId: updated.siteId,
      nickname: updated.nickname,
      phone: updated.phone,
      avatar: updated.avatar,
      tenantId: updated.tenantId,
      tenantName: tenant?.name || '',
      memberRole: updated.memberRole as ParkCustomer['memberRole'],
      memberRoleLabel: customerRoleLabel(updated.memberRole),
      status: updated.status,
      lastLoginAt: iso(updated.lastLoginAt),
      createdAt: iso(updated.createdAt),
    };
  }

  // ------------------------------------------------------------ 公告

  async announcements(
    user: CurrentUser,
    siteId: number,
    query: Record<string, unknown>,
  ): Promise<ParkAnnouncement[]> {
    await this.requireSite(user, siteId);
    const category = clip(query.category, 24);
    const status = clip(query.status, 16);
    const keyword = clip(query.keyword, 60);
    const rows = await this.prisma.parkAnnouncement.findMany({
      where: {
        siteId,
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(keyword ? { title: { contains: keyword } } : {}),
      },
      orderBy: [{ pinned: 'desc' }, { id: 'desc' }],
    });
    return rows.map(announcementView);
  }

  async publicAnnouncements(siteId: number, category = '', limit = 30) {
    const rows = await this.prisma.parkAnnouncement.findMany({
      where: {
        siteId,
        status: 'PUBLISHED',
        ...(category ? { category } : {}),
      },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(50, Math.max(1, limit)),
    });
    return rows.map(announcementView);
  }

  async publicAnnouncement(siteId: number, id: number) {
    const row = await this.prisma.parkAnnouncement.findFirst({
      where: { id, siteId, status: 'PUBLISHED' },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '公告不存在或已下线');
    }
    return announcementView(row);
  }

  async saveAnnouncement(user: CurrentUser, body: ParkAnnouncementInput) {
    const site = await this.requireSite(user, body.siteId);
    const id = integer(body.id, 0);
    const data = {
      category: body.category,
      title: clip(body.title, 160),
      summary: clip(body.summary, 300),
      content: String(body.content || '').slice(0, 200_000),
      cover: clip(body.cover, 500),
      pinned: Boolean(body.pinned),
      status: body.status,
      publishedAt: body.status === 'PUBLISHED' ? new Date() : undefined,
    };
    if (!data.title) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请填写公告标题');
    }
    const row = id
      ? await this.prisma.parkAnnouncement.update({ where: { id }, data })
      : await this.prisma.parkAnnouncement.create({
          data: { ...data, siteId: site.id },
        });
    return announcementView(row);
  }

  async setAnnouncementStatus(user: CurrentUser, id: number, status: string) {
    const row = await this.prisma.parkAnnouncement.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '公告不存在');
    }
    const updated = await this.prisma.parkAnnouncement.update({
      where: { id: row.id },
      data: {
        status,
        ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
      },
    });
    return announcementView(updated);
  }

  async removeAnnouncement(user: CurrentUser, id: number) {
    const row = await this.prisma.parkAnnouncement.findFirst({
      where: { id, siteId: { in: await this.siteIdsOf(user) } },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '公告不存在');
    }
    await this.prisma.parkAnnouncement.delete({ where: { id: row.id } });
    return { ok: true, message: '已删除' };
  }

  // ------------------------------------------------------------ 概览

  async overview(user: CurrentUser, siteIdRaw?: number): Promise<ParkOverview> {
    const sites = await this.prisma.parkSite.findMany({
      where: { ownerUserId: user.userId },
      select: { id: true, status: true },
    });
    const siteIds = siteIdRaw
      ? sites.filter((item) => item.id === siteIdRaw).map((item) => item.id)
      : sites.map((item) => item.id);
    if (siteIdRaw && !siteIds.length) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '园区不存在或无权访问');
    }
    if (!siteIds.length) {
      return {
        siteCount: 0,
        onlineSiteCount: 0,
        tenantCount: 0,
        customerCount: 0,
        pendingReservations: 0,
        pendingWorkOrders: 0,
        todayCheckins: 0,
        recentReservations: [],
        recentWorkOrders: [],
      };
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [
      tenantCount,
      customerCount,
      pendingReservations,
      pendingWorkOrders,
      todayCheckins,
      reservations,
      workOrders,
    ] = await Promise.all([
      this.prisma.parkTenant.count({ where: { siteId: { in: siteIds } } }),
      this.prisma.parkCustomer.count({ where: { siteId: { in: siteIds } } }),
      this.prisma.parkReservation.count({
        where: { siteId: { in: siteIds }, status: 'PENDING' },
      }),
      this.prisma.parkWorkOrder.count({
        where: {
          siteId: { in: siteIds },
          status: { in: ['PENDING', 'ASSIGNED', 'PROCESSING'] },
        },
      }),
      this.prisma.parkReservation.count({
        where: {
          siteId: { in: siteIds },
          status: 'CHECKED_IN',
          checkedInAt: { gte: todayStart },
        },
      }),
      this.prisma.parkReservation.findMany({
        where: { siteId: { in: siteIds } },
        orderBy: { id: 'desc' },
        take: 5,
      }),
      this.prisma.parkWorkOrder.findMany({
        where: { siteId: { in: siteIds } },
        orderBy: { id: 'desc' },
        take: 5,
      }),
    ]);
    const recentReservations: ParkReservation[] = reservations.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      kind: row.kind as ParkReservation['kind'],
      kindLabel: reservationKindLabel(row.kind),
      applicantName: row.applicantName,
      applicantPhone: row.applicantPhone,
      visitorName: row.visitorName,
      visitorPhone: row.visitorPhone,
      visitorCompany: row.visitorCompany,
      plateNo: row.plateNo,
      companions: row.companions,
      quantity: row.quantity,
      depositAmount: Number(row.depositAmount),
      buildingId: row.buildingId,
      unitId: row.unitId,
      resourceName: row.resourceName,
      startAt: iso(row.startAt),
      endAt: iso(row.endAt),
      purpose: row.purpose,
      note: row.note,
      status: row.status as ParkReservation['status'],
      statusLabel: reservationStatusLabel(row.status),
      approvalId: row.approvalId,
      checkedInAt: iso(row.checkedInAt),
      createdAt: iso(row.createdAt),
    }));
    const recentWorkOrders: ParkWorkOrder[] = workOrders.map((row) => ({
      id: row.id,
      siteId: row.siteId,
      orderNo: row.orderNo,
      category: row.category as ParkWorkOrder['category'],
      categoryLabel: workOrderCategoryLabel(row.category),
      title: row.title,
      reporterName: row.reporterName,
      reporterPhone: row.reporterPhone,
      buildingId: row.buildingId,
      unitId: row.unitId,
      location: row.location,
      urgency: row.urgency,
      status: row.status as ParkWorkOrder['status'],
      statusLabel: workOrderStatusLabel(row.status),
      assigneeStaffId: row.assigneeStaffId,
      assigneeName: row.assigneeName,
      rating: row.rating,
      finishedAt: iso(row.finishedAt),
      createdAt: iso(row.createdAt),
    }));
    return {
      siteCount: sites.length,
      onlineSiteCount: sites.filter((item) => item.status === 'ONLINE').length,
      tenantCount,
      customerCount,
      pendingReservations,
      pendingWorkOrders,
      todayCheckins,
      recentReservations,
      recentWorkOrders,
    };
  }

  private async siteIdsOf(user: CurrentUser): Promise<number[]> {
    const rows = await this.prisma.parkSite.findMany({
      where: { ownerUserId: user.userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
