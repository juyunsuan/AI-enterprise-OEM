import {
  PARK_SITE_STATUSES,
  PARK_SITE_STATUS_LABELS,
  PARK_STAFF_ROLES,
  PARK_STAFF_ROLE_LABELS,
  type MiniAppInput,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { ParkPackageService } from './park.package.service';
import type { ParkApprovalService } from './park.approval.service';
import type { ParkReservationService } from './park.reservation.service';
import type { ParkResourceService } from './park.resource.service';
import type { ParkActivityService } from './park.activity.service';
import type { ParkOrderService } from './park.order.service';
import type { ParkLeaseService } from './park.lease.service';
import type { ParkOpsService } from './park.ops.service';
import type { ParkSiteService } from './park.site.service';
import type { ParkWorkOrderService } from './park.workorder.service';
import { clip, integer, stringList } from './park.helpers';

type Row = Record<string, unknown>;

/** 园区控制器：方法名与契约 `Park_*` 后缀一一对应，只做参数透传。 */
export class ParkController {
  constructor(
    private readonly siteService: ParkSiteService,
    private readonly approvalService: ParkApprovalService,
    private readonly reservationService: ParkReservationService,
    private readonly workOrderService: ParkWorkOrderService,
    private readonly resourceService: ParkResourceService,
    private readonly activityService: ParkActivityService,
    private readonly orderService: ParkOrderService,
    private readonly leaseService: ParkLeaseService,
    private readonly opsService: ParkOpsService,
    private readonly miniApp: MiniAppService,
    private readonly packageService: ParkPackageService,
  ) {}

  private async subject(user: CurrentUser, id: string) {
    const site = await this.siteService.requireSite(user, integer(id, 0));
    return {
      ownerUserId: site.ownerUserId,
      scene: 'PARK' as const,
      shopId: site.id,
      shopName: site.name,
    };
  }

  async meta(user: CurrentUser) {
    return {
      sites: await this.siteService.sites(user),
      siteStatuses: PARK_SITE_STATUSES.map((value) => ({
        value,
        label: PARK_SITE_STATUS_LABELS[value] || value,
      })),
      staffRoles: PARK_STAFF_ROLES.map((value) => ({
        value,
        label: PARK_STAFF_ROLE_LABELS[value] || value,
      })),
    };
  }

  overview(user: CurrentUser, query: Row) {
    const siteId = integer(query.siteId, 0);
    return this.siteService.overview(user, siteId || undefined);
  }

  sites(user: CurrentUser) {
    return this.siteService.sites(user);
  }

  siteSave(user: CurrentUser, body: Row) {
    return this.siteService.saveSite(user, body as never);
  }

  siteStatus(user: CurrentUser, body: Row) {
    return this.siteService.setSiteStatus(
      user,
      integer(body.id, 0),
      clip(body.status, 16),
    );
  }

  buildings(user: CurrentUser, query: Row) {
    return this.siteService.buildings(user, integer(query.siteId, 0));
  }

  buildingSave(user: CurrentUser, body: Row) {
    return this.siteService.saveBuilding(user, body as never);
  }

  buildingRemove(user: CurrentUser, body: Row) {
    return this.siteService.removeBuilding(user, integer(body.id, 0));
  }

  units(user: CurrentUser, query: Row) {
    return this.siteService.units(user, integer(query.siteId, 0), query);
  }

  unitSave(user: CurrentUser, body: Row) {
    return this.siteService.saveUnit(user, body as never);
  }

  unitRemove(user: CurrentUser, body: Row) {
    return this.siteService.removeUnit(user, integer(body.id, 0));
  }

  tenants(user: CurrentUser, query: Row) {
    return this.siteService.tenants(user, integer(query.siteId, 0), query);
  }

  tenantSave(user: CurrentUser, body: Row) {
    return this.siteService.saveTenant(user, body as never);
  }

  tenantRemove(user: CurrentUser, body: Row) {
    return this.siteService.removeTenant(user, integer(body.id, 0));
  }

  staffs(user: CurrentUser, query: Row) {
    return this.siteService.staffs(user, integer(query.siteId, 0), query);
  }

  staffSave(user: CurrentUser, body: Row) {
    return this.siteService.saveStaff(user, body as never);
  }

  staffStatus(user: CurrentUser, body: Row) {
    return this.siteService.setStaffStatus(
      user,
      integer(body.id, 0),
      clip(body.status, 16),
    );
  }

  customers(user: CurrentUser, query: Row) {
    return this.siteService.customers(user, integer(query.siteId, 0), query);
  }

  customerRole(user: CurrentUser, body: Row) {
    return this.siteService.setCustomerRole(
      user,
      integer(body.id, 0),
      clip(body.memberRole, 16),
    );
  }

  announcements(user: CurrentUser, query: Row) {
    return this.siteService.announcements(
      user,
      integer(query.siteId, 0),
      query,
    );
  }

  announcementSave(user: CurrentUser, body: Row) {
    return this.siteService.saveAnnouncement(user, body as never);
  }

  announcementStatus(user: CurrentUser, body: Row) {
    return this.siteService.setAnnouncementStatus(
      user,
      integer(body.id, 0),
      clip(body.status, 16),
    );
  }

  announcementRemove(user: CurrentUser, body: Row) {
    return this.siteService.removeAnnouncement(user, integer(body.id, 0));
  }

  approvals(user: CurrentUser, query: Row) {
    return this.approvalService.list(user, query);
  }

  invoices(user: CurrentUser, query: Row) {
    return this.opsService.invoices(user, query);
  }

  invoiceIssue(user: CurrentUser, body: Row) {
    return this.opsService.issueInvoice(user, body);
  }

  invoiceVoid(user: CurrentUser, body: Row) {
    return this.opsService.voidInvoice(user, integer(body.id, 0));
  }

  patrolPlans(user: CurrentUser, query: Row) {
    return this.opsService.patrolPlans(user, integer(query.siteId, 0));
  }

  patrolPlanSave(user: CurrentUser, body: Row) {
    return this.opsService.savePatrolPlan(user, body);
  }

  patrolPlanRemove(user: CurrentUser, body: Row) {
    return this.opsService.removePatrolPlan(user, integer(body.id, 0));
  }

  patrolRecords(user: CurrentUser, query: Row) {
    return this.opsService.patrolRecords(user, query);
  }

  parkingPermits(user: CurrentUser, query: Row) {
    return this.opsService.parkingPermits(user, query);
  }

  parkingPermitAction(user: CurrentUser, body: Row) {
    return this.opsService.parkingAction(user, body);
  }

  assets(user: CurrentUser, query: Row) {
    return this.opsService.assets(user, integer(query.siteId, 0));
  }

  assetSave(user: CurrentUser, body: Row) {
    return this.opsService.saveAsset(user, body);
  }

  assetRemove(user: CurrentUser, body: Row) {
    return this.opsService.removeAsset(user, integer(body.id, 0));
  }

  meters(user: CurrentUser, query: Row) {
    return this.opsService.meters(user, integer(query.siteId, 0));
  }

  meterSave(user: CurrentUser, body: Row) {
    return this.opsService.saveMeter(user, body);
  }

  meterRemove(user: CurrentUser, body: Row) {
    return this.opsService.removeMeter(user, integer(body.id, 0));
  }

  resources(user: CurrentUser, query: Row) {
    return this.resourceService.list(user, integer(query.siteId, 0));
  }

  resourceSave(user: CurrentUser, body: Row) {
    return this.resourceService.save(user, body as never);
  }

  resourceStatus(user: CurrentUser, body: Row) {
    return this.resourceService.setStatus(
      user,
      integer(body.id, 0),
      clip(body.status, 16),
    );
  }

  resourceRemove(user: CurrentUser, body: Row) {
    return this.resourceService.remove(user, integer(body.id, 0));
  }

  resourceSlots(user: CurrentUser, query: Row) {
    return this.resourceService.slots(
      user,
      integer(query.resourceId, 0),
      typeof query.from === 'string' ? query.from : undefined,
      typeof query.to === 'string' ? query.to : undefined,
    );
  }

  resourceGenerateSlots(user: CurrentUser, body: Row) {
    return this.resourceService.generateSlots(user, body as never);
  }

  async approvalDetail(user: CurrentUser, id: string) {
    return this.approvalService.detail(user, integer(id, 0));
  }

  async approvalAction(user: CurrentUser, body: Row) {
    const approval = await this.approvalService.adminAct(
      user,
      integer(body.id, 0),
      clip(body.action, 16) as 'approve' | 'reject' | 'withdraw',
      clip(body.comment, 500),
    );
    if (approval.bizType === 'VISITOR' || approval.bizType === 'VENUE') {
      await this.reservationService.syncByApprovalId(
        user,
        approval.id,
        approval.status,
      );
    }
    return this.approvalService.detail(user, approval.id);
  }

  reservations(user: CurrentUser, query: Row) {
    return this.reservationService.adminList(user, query);
  }

  reservationDetail(user: CurrentUser, query: Row) {
    return this.reservationService.adminDetail(user, integer(query.id, 0));
  }

  reservationAction(user: CurrentUser, body: Row) {
    return this.reservationService.adminAct(
      user,
      integer(body.id, 0),
      clip(body.action, 16) as
        'approve' | 'reject' | 'cancel' | 'checkin' | 'complete',
      clip(body.comment, 500),
    );
  }

  workOrders(user: CurrentUser, query: Row) {
    return this.workOrderService.adminList(user, query);
  }

  workOrderDetail(user: CurrentUser, query: Row) {
    return this.workOrderService.adminDetail(user, integer(query.id, 0));
  }

  workOrderAssign(user: CurrentUser, body: Row) {
    return this.workOrderService.adminAssign(
      user,
      integer(body.id, 0),
      integer(body.staffId, 0),
      clip(body.note, 500),
    );
  }

  workOrderAction(user: CurrentUser, body: Row) {
    return this.workOrderService.adminAct(
      user,
      integer(body.id, 0),
      clip(body.action, 16),
      {
        note: clip(body.note, 500),
        result: clip(body.result, 3000),
        images: stringList(body.images),
        feeAmount: Number(body.feeAmount) || 0,
      },
    );
  }

  activities(user: CurrentUser, query: Row) {
    return this.activityService.list(user, integer(query.siteId, 0), query);
  }

  activitySave(user: CurrentUser, body: Row) {
    return this.activityService.save(user, body as never);
  }

  activityStatus(user: CurrentUser, body: Row) {
    return this.activityService.setStatus(
      user,
      integer(body.id, 0),
      clip(body.status, 16),
    );
  }

  activityRemove(user: CurrentUser, body: Row) {
    return this.activityService.remove(user, integer(body.id, 0));
  }

  activitySignups(user: CurrentUser, query: Row) {
    return this.activityService.signups(user, integer(query.activityId, 0));
  }

  leases(user: CurrentUser, query: Row) {
    return this.leaseService.leases(user, integer(query.siteId, 0), query);
  }

  leaseSave(user: CurrentUser, body: Row) {
    return this.leaseService.saveLease(user, body as never);
  }

  leaseStatus(user: CurrentUser, body: Row) {
    return this.leaseService.setLeaseStatus(
      user,
      integer(body.id, 0),
      clip(body.status, 16),
    );
  }

  leaseRemove(user: CurrentUser, body: Row) {
    return this.leaseService.removeLease(user, integer(body.id, 0));
  }

  bills(user: CurrentUser, query: Row) {
    return this.leaseService.bills(user, query);
  }

  billGenerate(user: CurrentUser, body: Row) {
    return this.leaseService.generateBill(user, body as never);
  }

  billAction(user: CurrentUser, body: Row) {
    return this.leaseService.billAction(
      user,
      integer(body.id, 0),
      clip(body.action, 16),
      clip(body.note, 500),
    );
  }

  orders(user: CurrentUser, query: Row) {
    return this.orderService.list(user, query);
  }

  orderAction(user: CurrentUser, body: Row) {
    return this.orderService.action(
      user,
      integer(body.id, 0),
      clip(body.action, 16),
      clip(body.note, 500),
    );
  }

  flow(user: CurrentUser, query: Row) {
    return this.approvalService.flow(
      user,
      integer(query.siteId, 0),
      clip(query.bizType, 24),
    );
  }

  flowSave(user: CurrentUser, body: Row) {
    return this.approvalService.saveFlow(user, body as never);
  }

  async wechat(user: CurrentUser, id: string) {
    return this.miniApp.view(await this.subject(user, id));
  }

  async saveWechat(user: CurrentUser, id: string, body: MiniAppInput) {
    return this.miniApp.save(await this.subject(user, id), body);
  }

  async testWechat(user: CurrentUser, id: string) {
    return this.miniApp.test(await this.subject(user, id));
  }

  package(user: CurrentUser, id: string) {
    return this.packageService.download(user, integer(id, 0));
  }
}
