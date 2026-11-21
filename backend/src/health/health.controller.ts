import type {
  HealthAgreementSaveBody,
  HealthAiStaffBindingBody,
  HealthAiStaffEnabledBody,
  HealthAlertHandleBody,
  HealthAlertRuleSaveBody,
  HealthBannerSaveBody,
  HealthCitySaveBody,
  HealthCrowdGroupSaveBody,
  HealthCustomerSaveBody,
  HealthDepartmentSaveBody,
  HealthDictItemSaveBody,
  HealthDiyPageSaveBody,
  HealthFollowupRecordSaveBody,
  HealthFollowupTaskCreateBody,
  HealthHospitalSaveBody,
  HealthMedicalEventSaveBody,
  HealthMedicationSaveBody,
  HealthOrganSaveBody,
  HealthPatientPlanStartBody,
  HealthPatientSaveBody,
  HealthPlanSaveBody,
  HealthPractitionerSaveBody,
  HealthPractitionerServiceSaveBody,
  HealthPrescriptionReviewBody,
  HealthPrescriptionSaveBody,
  HealthRecordItemSaveBody,
  HealthRecordSaveBody,
  HealthScrmLinkSaveBody,
  HealthScrmPushBody,
  HealthServiceEntrySaveBody,
  HealthShopInput,
  HealthStaffSaveBody,
  HealthSurveySaveBody,
  HealthTeamSaveBody,
  MiniAppInput,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import { subjectOfShop } from './health.shared';
import type { HealthArchiveService } from './health.archive.service';
import type { HealthCareService } from './health.care.service';
import type { HealthClinicService } from './health.clinic.service';
import type { HealthContentService } from './health.content.service';
import type { HealthExamService } from './health.exam.service';
import type { HealthFinanceService } from './health.finance.service';
import type { HealthMallService } from './health.mall.service';
import type { HealthMarketingService } from './health.marketing.service';
import type { HealthMonitorService } from './health.monitor.service';
import type { HealthOrderService } from './health.order.service';
import type { HealthPlatformService } from './health.platform.service';
import type { HealthPromoterService } from './health.promoter.service';
import type { HealthReleaseService } from './health.release.service';
import type { HealthScrmService } from './health.scrm.service';
import type { HealthServiceItemService } from './health.service-item.service';
import type { HealthShopService } from './health.shop.service';
import type { HealthStatService } from './health.stat.service';
import type { HealthSubjectService } from './health.subject.service';
import type { HealthTongueService } from './health.tongue.service';

/**
 * 健康管理小程序工具·店主侧工作台。
 *
 * 方法名与契约 `Health_` 后缀一一对应（`moduleHandlers` 按后缀反射取方法，
 * 名字对不上就是 400「接口处理器缺失」）；平台侧端点走 `HealthAdminController`。
 */
export class HealthController {
  constructor(
    private readonly platform: HealthPlatformService,
    private readonly shopService: HealthShopService,
    private readonly releases: HealthReleaseService,
    private readonly scrm: HealthScrmService,
    private readonly subjects: HealthSubjectService,
    private readonly stat: HealthStatService,
    private readonly archive: HealthArchiveService,
    private readonly monitor: HealthMonitorService,
    private readonly care: HealthCareService,
    private readonly serviceItems: HealthServiceItemService,
    private readonly clinic: HealthClinicService,
    private readonly exam: HealthExamService,
    private readonly mall: HealthMallService,
    private readonly marketing: HealthMarketingService,
    private readonly ordersService: HealthOrderService,
    private readonly finance: HealthFinanceService,
    private readonly promotersService: HealthPromoterService,
    private readonly content: HealthContentService,
    private readonly tongue: HealthTongueService,
    private readonly miniApp: MiniAppService,
  ) {}

  /** 底座主体：scene=HEALTH + 本店 shopId，凭据与出包台账都按它寻址。 */
  private async subject(shopId: number) {
    return subjectOfShop(await this.shopService.subjectById(shopId));
  }

  // ---------- 元信息、概览与看板 ----------

  meta() {
    return this.platform.meta();
  }

  async overview(user: CurrentUser) {
    return this.shopService.overview(user);
  }

  async dashboard(user: CurrentUser, query: Record<string, unknown>) {
    return this.stat.dashboard(user, query);
  }

  // ---------- 店铺 ----------

  async shops(user: CurrentUser) {
    return this.shopService.shops(user);
  }

  async shopCreate(user: CurrentUser, body: HealthShopInput) {
    return this.shopService.create(user, body);
  }

  async shopDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.detail(user, query);
  }

  async shopSave(
    user: CurrentUser,
    body: HealthShopInput & { shopId: number },
  ) {
    return this.shopService.save(user, body);
  }

  async shopStatus(
    user: CurrentUser,
    body: { shopId: number; status: string; reason: string },
  ) {
    return this.shopService.status(user, body);
  }

  async shopClose(user: CurrentUser, body: { shopId: number; reason: string }) {
    return this.shopService.close(user, body);
  }

  async tradeSave(user: CurrentUser, body: Record<string, unknown>) {
    return this.shopService.tradeSave(user, body as never);
  }

  async tongueConfig(user: CurrentUser, query: Record<string, unknown>) {
    return this.tongue.config(user, query);
  }

  async tongueConfigSave(
    user: CurrentUser,
    body: {
      shopId: number;
      enabled: boolean;
      channelId: number;
      model: string;
    },
  ) {
    return this.tongue.saveConfig(user, body);
  }

  async tongueRecords(user: CurrentUser, query: Record<string, unknown>) {
    return this.tongue.records(user, query);
  }

  async tongueRecordDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.tongue.recordDetail(user, query);
  }

  async tongueRecordRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.tongue.recordRemove(user, body);
  }

  async themeSave(user: CurrentUser, body: Record<string, unknown>) {
    return this.shopService.themeSave(user, body as never);
  }

  // ---------- 微信凭据与发布 ----------

  async wechat(user: CurrentUser, query: Record<string, unknown>) {
    return this.miniApp.view(await this.subject(Number(query.shopId)));
  }

  async wechatSave(
    user: CurrentUser,
    body: Record<string, unknown> & { shopId: number },
  ) {
    const subject = await this.subject(body.shopId);
    const input: Record<string, unknown> = { ...body };
    delete input.shopId;
    return this.miniApp.save(subject, input as unknown as MiniAppInput);
  }

  async wechatTest(user: CurrentUser, body: { shopId: number }) {
    return this.miniApp.test(await this.subject(body.shopId));
  }

  async qrcode(user: CurrentUser, query: Record<string, unknown>) {
    return this.releases.qrcode(user, query);
  }

  // ---------- 店内人员与权限 ----------

  async staffList(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.staffList(user, query);
  }

  staffScopes(user: CurrentUser, query: Record<string, unknown>) {
    void user;
    void query;
    return this.shopService.staffScopes();
  }

  async staffSave(user: CurrentUser, body: HealthStaffSaveBody) {
    return this.shopService.staffSave(user, body);
  }

  async staffRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.shopService.staffRemove(user, body);
  }

  // ---------- AI客服绑定 ----------

  async serviceDeskBind(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.serviceDeskBind(user, query);
  }

  async serviceDeskBindSave(
    user: CurrentUser,
    body: { shopId: number; siteKey: string },
  ) {
    return this.shopService.serviceDeskBindSave(user, body);
  }

  // ---------- AI 医护（引用 AI客服的纯AI客服员工） ----------

  async aiStatus(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.aiStatus(user, query);
  }

  async aiEnabledSave(user: CurrentUser, body: HealthAiStaffEnabledBody) {
    return this.shopService.aiEnabledSave(user, body);
  }

  async aiBindingSave(user: CurrentUser, body: HealthAiStaffBindingBody) {
    return this.shopService.aiBindingSave(user, body);
  }

  // ---------- SCRM 松耦合对接 ----------

  async scrmLink(user: CurrentUser, query: Record<string, unknown>) {
    return this.scrm.link(user, query);
  }

  async scrmLinkSave(user: CurrentUser, body: HealthScrmLinkSaveBody) {
    return this.scrm.linkSave(user, body);
  }

  async scrmLinkRemove(user: CurrentUser, body: { shopId: number }) {
    return this.scrm.linkRemove(user, body);
  }

  async scrmEvents(user: CurrentUser, query: Record<string, unknown>) {
    return this.scrm.events(user, query);
  }

  async scrmPush(user: CurrentUser, body: HealthScrmPushBody) {
    return this.scrm.push(user, body);
  }

  async scrmSkip(user: CurrentUser, body: { shopId: number; ids: number[] }) {
    return this.scrm.skip(user, body);
  }

  // ---------- 装修、公告、入口与协议 ----------

  async bannerList(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.bannerList(user, query);
  }

  async bannerSave(user: CurrentUser, body: HealthBannerSaveBody) {
    return this.shopService.bannerSave(user, body);
  }

  async bannerRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.shopService.bannerRemove(user, body);
  }

  async noticeList(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.noticeList(user, query);
  }

  async noticeSave(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      title: string;
      content: string;
      sort: number;
      status: 'ON' | 'OFF';
    },
  ) {
    return this.shopService.noticeSave(user, body);
  }

  async noticeRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.shopService.noticeRemove(user, body);
  }

  async diyPageList(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.diyPageList(user, query);
  }

  async diyPageSave(user: CurrentUser, body: HealthDiyPageSaveBody) {
    return this.shopService.diyPageSave(user, body);
  }

  async serviceEntryList(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.serviceEntryList(user, query);
  }

  async serviceEntrySave(user: CurrentUser, body: HealthServiceEntrySaveBody) {
    return this.shopService.serviceEntrySave(user, body);
  }

  async agreementList(user: CurrentUser, query: Record<string, unknown>) {
    return this.shopService.agreementList(user, query);
  }

  async agreementSave(user: CurrentUser, body: HealthAgreementSaveBody) {
    return this.shopService.agreementSave(user, body);
  }

  // ---------- 医院、科室与城市 ----------

  async hospitals(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.hospitals(user, query);
  }

  async hospitalSave(user: CurrentUser, body: HealthHospitalSaveBody) {
    return this.subjects.hospitalSave(user, body);
  }

  async hospitalRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.subjects.hospitalRemove(user, body);
  }

  async departments(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.departments(user, query);
  }

  async departmentSave(user: CurrentUser, body: HealthDepartmentSaveBody) {
    return this.subjects.departmentSave(user, body);
  }

  async departmentRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.subjects.departmentRemove(user, body);
  }

  async cities(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.cities(user, query);
  }

  async citySave(user: CurrentUser, body: HealthCitySaveBody) {
    return this.subjects.citySave(user, body);
  }

  async cityRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.subjects.cityRemove(user, body);
  }

  // ---------- 机构、入驻申请与医护 ----------

  async organs(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.organs(user, query);
  }

  async organDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.organDetail(user, query);
  }

  async organSave(user: CurrentUser, body: HealthOrganSaveBody) {
    return this.subjects.organSave(user, body);
  }

  async organAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ) {
    return this.subjects.organAudit(user, body);
  }

  async organRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.subjects.organRemove(user, body);
  }

  async applications(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.applications(user, query);
  }

  async practitioners(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.practitioners(user, query);
  }

  async practitionerDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.practitionerDetail(user, query);
  }

  async practitionerSave(user: CurrentUser, body: HealthPractitionerSaveBody) {
    return this.subjects.practitionerSave(user, body);
  }

  async practitionerAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ) {
    return this.subjects.practitionerAudit(user, body);
  }

  async practitionerStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string; reason: string },
  ) {
    return this.subjects.practitionerStatus(user, body);
  }

  async practitionerRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.subjects.practitionerRemove(user, body);
  }

  async practitionerServiceSave(
    user: CurrentUser,
    body: HealthPractitionerServiceSaveBody,
  ) {
    return this.subjects.practitionerServiceSave(user, body);
  }

  async practitionerServiceRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.subjects.practitionerServiceRemove(user, body);
  }

  // ---------- 团队 ----------

  async teams(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.teams(user, query);
  }

  async teamDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.subjects.teamDetail(user, query);
  }

  async teamSave(user: CurrentUser, body: HealthTeamSaveBody) {
    return this.subjects.teamSave(user, body);
  }

  async teamRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.subjects.teamRemove(user, body);
  }

  async teamMemberAdd(
    user: CurrentUser,
    body: {
      shopId: number;
      teamId: number;
      practitionerId: number;
      isLeader: boolean;
    },
  ) {
    return this.subjects.teamMemberAdd(user, body);
  }

  async teamMemberRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.subjects.teamMemberRemove(user, body);
  }

  async teamNoticeSave(
    user: CurrentUser,
    body: {
      shopId: number;
      id: number;
      teamId: number;
      title: string;
      content: string;
    },
  ) {
    return this.subjects.teamNoticeSave(user, body);
  }

  async teamNoticeRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.subjects.teamNoticeRemove(user, body);
  }

  async teamJoinAudit(
    user: CurrentUser,
    body: { shopId: number; id: number; approved: boolean; reason: string },
  ) {
    return this.subjects.teamJoinAudit(user, body);
  }

  // ---------- 顾客、就诊人、人群与档案 ----------

  async customers(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.customers(user, query);
  }

  async customerDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.customerDetail(user, query);
  }

  async customerSave(user: CurrentUser, body: HealthCustomerSaveBody) {
    return this.archive.customerSave(user, body);
  }

  async customerExport(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.customerExport(user, query);
  }

  async patients(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.patients(user, query);
  }

  async patientDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.patientDetail(user, query);
  }

  async patientSave(user: CurrentUser, body: HealthPatientSaveBody) {
    return this.archive.patientSave(user, body);
  }

  async patientRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.archive.patientRemove(user, body);
  }

  async patientMove(
    user: CurrentUser,
    body: {
      shopId: number;
      patientIds: number[];
      practitionerId: number;
      crowdGroupIds: number[];
      replace: boolean;
    },
  ) {
    return this.archive.patientMove(user, body);
  }

  async crowdGroups(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.crowdGroups(user, query);
  }

  async crowdGroupSave(user: CurrentUser, body: HealthCrowdGroupSaveBody) {
    return this.archive.crowdGroupSave(user, body);
  }

  async crowdGroupRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.archive.crowdGroupRemove(user, body);
  }

  async recordDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.recordDetail(user, query);
  }

  async recordSave(user: CurrentUser, body: HealthRecordSaveBody) {
    return this.archive.recordSave(user, body);
  }

  async recordItemSave(user: CurrentUser, body: HealthRecordItemSaveBody) {
    return this.archive.recordItemSave(user, body);
  }

  async recordItemRemove(
    user: CurrentUser,
    body: { shopId: number; patientId: number; id: number },
  ) {
    return this.archive.recordItemRemove(user, body);
  }

  async medicalEventList(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.medicalEventList(user, query);
  }

  async medicalEventSave(user: CurrentUser, body: HealthMedicalEventSaveBody) {
    return this.archive.medicalEventSave(user, body);
  }

  async medicalEventRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.archive.medicalEventRemove(user, body);
  }

  async dictList(user: CurrentUser, query: Record<string, unknown>) {
    return this.archive.dictList(user, query);
  }

  async dictSave(user: CurrentUser, body: HealthDictItemSaveBody) {
    return this.archive.dictSave(user, body);
  }

  async dictRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.archive.dictRemove(user, body);
  }

  // ---------- 指标监测与预警 ----------

  async metrics(user: CurrentUser, query: Record<string, unknown>) {
    return this.monitor.metrics(user, query);
  }

  async metricSave(
    user: CurrentUser,
    body: Parameters<HealthMonitorService['metricSave']>[1],
  ) {
    return this.monitor.metricSave(user, body);
  }

  async metricRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.monitor.metricRemove(user, body);
  }

  async metricLogs(user: CurrentUser, query: Record<string, unknown>) {
    return this.monitor.metricLogs(user, query);
  }

  async metricLogSave(
    user: CurrentUser,
    body: Parameters<HealthMonitorService['metricLogSave']>[1],
  ) {
    return this.monitor.metricLogSave(user, body);
  }

  async metricLogRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.monitor.metricLogRemove(user, body);
  }

  async metricTrend(user: CurrentUser, query: Record<string, unknown>) {
    return this.monitor.metricTrend(user, query);
  }

  async alertRules(user: CurrentUser, query: Record<string, unknown>) {
    return this.monitor.alertRules(user, query);
  }

  async alertRuleSave(user: CurrentUser, body: HealthAlertRuleSaveBody) {
    return this.monitor.alertRuleSave(user, body);
  }

  async alertRuleRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.monitor.alertRuleRemove(user, body);
  }

  async alerts(user: CurrentUser, query: Record<string, unknown>) {
    return this.monitor.alerts(user, query);
  }

  async alertHandle(user: CurrentUser, body: HealthAlertHandleBody) {
    return this.monitor.alertHandle(user, body);
  }

  // ---------- 管理方案与随访 ----------

  async plans(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.plans(user, query);
  }

  async planDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.planDetail(user, query);
  }

  async planSave(user: CurrentUser, body: HealthPlanSaveBody) {
    return this.care.planSave(user, body);
  }

  async planRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.care.planRemove(user, body);
  }

  async patientPlans(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.patientPlans(user, query);
  }

  async patientPlanStart(user: CurrentUser, body: HealthPatientPlanStartBody) {
    return this.care.patientPlanStart(user, body);
  }

  async patientPlanStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string; reason: string },
  ) {
    return this.care.patientPlanStatus(user, body);
  }

  async followupTasks(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.followupTasks(user, query);
  }

  async followupDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.followupDetail(user, query);
  }

  async followupCreate(user: CurrentUser, body: HealthFollowupTaskCreateBody) {
    return this.care.followupCreate(user, body);
  }

  async followupSave(user: CurrentUser, body: HealthFollowupRecordSaveBody) {
    return this.care.followupSave(user, body);
  }

  async followupAssign(
    user: CurrentUser,
    body: { shopId: number; taskIds: number[]; practitionerId: number },
  ) {
    return this.care.followupAssign(user, body);
  }

  async followupRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.care.followupRemove(user, body);
  }

  // ---------- 量表、用药与处方 ----------

  async surveys(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.surveys(user, query);
  }

  async surveyDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.surveyDetail(user, query);
  }

  async surveySave(user: CurrentUser, body: HealthSurveySaveBody) {
    return this.care.surveySave(user, body);
  }

  async surveyRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.care.surveyRemove(user, body);
  }

  async surveyAnswers(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.surveyAnswers(user, query);
  }

  async medications(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.medications(user, query);
  }

  async medicationSave(user: CurrentUser, body: HealthMedicationSaveBody) {
    return this.care.medicationSave(user, body);
  }

  async medicationStatus(
    user: CurrentUser,
    body: { shopId: number; id: number; status: string },
  ) {
    return this.care.medicationStatus(user, body);
  }

  async medicationRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.care.medicationRemove(user, body);
  }

  async medicationLogs(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.medicationLogs(user, query);
  }

  async medicationLogSave(
    user: CurrentUser,
    body: {
      shopId: number;
      medicationId: number;
      planAt: string;
      result: string;
      note: string;
    },
  ) {
    return this.care.medicationLogSave(user, body);
  }

  async medicationEffects(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.medicationEffects(user, query);
  }

  async medicationEffectSave(
    user: CurrentUser,
    body: {
      shopId: number;
      medicationId: number;
      level: string;
      symptomText: string;
      advice: string;
    },
  ) {
    return this.care.medicationEffectSave(user, body);
  }

  async prescriptions(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.prescriptions(user, query);
  }

  async prescriptionDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.care.prescriptionDetail(user, query);
  }

  async prescriptionSave(user: CurrentUser, body: HealthPrescriptionSaveBody) {
    return this.care.prescriptionSave(user, body);
  }

  async prescriptionReview(
    user: CurrentUser,
    body: HealthPrescriptionReviewBody,
  ) {
    return this.care.prescriptionReview(user, body);
  }

  async prescriptionRevoke(
    user: CurrentUser,
    body: { shopId: number; id: number; reason: string },
  ) {
    return this.care.prescriptionRevoke(user, body);
  }

  // ---------- C6 服务项目与号源 ----------

  async services(user: CurrentUser, query: Record<string, unknown>) {
    return this.serviceItems.services(user, query);
  }

  async serviceSave(
    user: CurrentUser,
    body: Parameters<HealthServiceItemService['serviceSave']>[1],
  ) {
    return this.serviceItems.serviceSave(user, body);
  }

  async serviceStatus(
    user: CurrentUser,
    body: Parameters<HealthServiceItemService['serviceStatus']>[1],
  ) {
    return this.serviceItems.serviceStatus(user, body);
  }

  async serviceRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.serviceItems.serviceRemove(user, body);
  }

  async shiftTemplates(user: CurrentUser, query: Record<string, unknown>) {
    return this.serviceItems.shiftTemplates(user, query);
  }

  async shiftTemplateSave(
    user: CurrentUser,
    body: Parameters<HealthServiceItemService['shiftTemplateSave']>[1],
  ) {
    return this.serviceItems.shiftTemplateSave(user, body);
  }

  async shiftTemplateRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.serviceItems.shiftTemplateRemove(user, body);
  }

  async shiftGenerate(
    user: CurrentUser,
    body: Parameters<HealthServiceItemService['shiftGenerate']>[1],
  ) {
    return this.serviceItems.shiftGenerate(user, body);
  }

  async slotCalendar(user: CurrentUser, query: Record<string, unknown>) {
    return this.serviceItems.slotCalendar(user, query);
  }

  async slotBlock(
    user: CurrentUser,
    body: Parameters<HealthServiceItemService['slotBlock']>[1],
  ) {
    return this.serviceItems.slotBlock(user, body);
  }

  // ---------- C7 问诊 / 签约 / 绿通 / 导诊 ----------

  async consultRules(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.consultRules(user, query);
  }

  async consultRuleSave(
    user: CurrentUser,
    body: Parameters<HealthClinicService['consultRuleSave']>[1],
  ) {
    return this.clinic.consultRuleSave(user, body);
  }

  async consultRuleRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.clinic.consultRuleRemove(user, body);
  }

  async consults(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.consults(user, query);
  }

  async consultDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.consultDetail(user, query);
  }

  async consultCreate(
    user: CurrentUser,
    body: Parameters<HealthClinicService['consultCreate']>[1],
  ) {
    return this.clinic.consultCreate(user, body);
  }

  async consultAction(
    user: CurrentUser,
    body: Parameters<HealthClinicService['consultAction']>[1],
  ) {
    return this.clinic.consultAction(user, body);
  }

  async consultSession(
    user: CurrentUser,
    body: Parameters<HealthClinicService['consultSession']>[1],
  ) {
    return this.clinic.consultSession(user, body);
  }

  async signPackages(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.signPackages(user, query);
  }

  async signPackageSave(
    user: CurrentUser,
    body: Parameters<HealthClinicService['signPackageSave']>[1],
  ) {
    return this.clinic.signPackageSave(user, body);
  }

  async signPackageRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.clinic.signPackageRemove(user, body);
  }

  async signOrders(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.signOrders(user, query);
  }

  async signOrderDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.signOrderDetail(user, query);
  }

  async signOrderSignSave(
    user: CurrentUser,
    body: Parameters<HealthClinicService['signOrderSignSave']>[1],
  ) {
    return this.clinic.signOrderSignSave(user, body);
  }

  async greenOrders(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.greenOrders(user, query);
  }

  async greenDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.greenDetail(user, query);
  }

  async greenProgress(
    user: CurrentUser,
    body: Parameters<HealthClinicService['greenProgress']>[1],
  ) {
    return this.clinic.greenProgress(user, body);
  }

  async diseases(user: CurrentUser, query: Record<string, unknown>) {
    return this.clinic.diseases(user, query);
  }

  async diseaseSave(
    user: CurrentUser,
    body: Parameters<HealthClinicService['diseaseSave']>[1],
  ) {
    return this.clinic.diseaseSave(user, body);
  }

  async diseaseRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.clinic.diseaseRemove(user, body);
  }

  async guidanceSimulate(
    user: CurrentUser,
    body: Parameters<HealthClinicService['guidanceSimulate']>[1],
  ) {
    return this.clinic.guidanceSimulate(user, body);
  }

  // ---------- C8 体检与报告 ----------

  async examItems(user: CurrentUser, query: Record<string, unknown>) {
    return this.exam.examItems(user, query);
  }

  async examItemSave(
    user: CurrentUser,
    body: Parameters<HealthExamService['examItemSave']>[1],
  ) {
    return this.exam.examItemSave(user, body);
  }

  async examItemRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.exam.examItemRemove(user, body);
  }

  async examPackages(user: CurrentUser, query: Record<string, unknown>) {
    return this.exam.examPackages(user, query);
  }

  async examPackageDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.exam.examPackageDetail(user, query);
  }

  async examPackageSave(
    user: CurrentUser,
    body: Parameters<HealthExamService['examPackageSave']>[1],
  ) {
    return this.exam.examPackageSave(user, body);
  }

  async examPackageRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.exam.examPackageRemove(user, body);
  }

  async reports(user: CurrentUser, query: Record<string, unknown>) {
    return this.exam.reports(user, query);
  }

  async reportDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.exam.reportDetail(user, query);
  }

  async reportSave(
    user: CurrentUser,
    body: Parameters<HealthExamService['reportSave']>[1],
  ) {
    return this.exam.reportSave(user, body);
  }

  async reportRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.exam.reportRemove(user, body);
  }

  async reportAdviceSave(
    user: CurrentUser,
    body: Parameters<HealthExamService['reportAdviceSave']>[1],
  ) {
    return this.exam.reportAdviceSave(user, body);
  }

  // ---------- C9 实物商城 ----------

  async goodsCategories(user: CurrentUser, query: Record<string, unknown>) {
    return this.mall.goodsCategories(user, query);
  }

  async goodsCategorySave(
    user: CurrentUser,
    body: Parameters<HealthMallService['goodsCategorySave']>[1],
  ) {
    return this.mall.goodsCategorySave(user, body);
  }

  async goodsCategoryRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.mall.goodsCategoryRemove(user, body);
  }

  async goods(user: CurrentUser, query: Record<string, unknown>) {
    return this.mall.goods(user, query);
  }

  async goodsDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.mall.goodsDetail(user, query);
  }

  async goodsSave(
    user: CurrentUser,
    body: Parameters<HealthMallService['goodsSave']>[1],
  ) {
    return this.mall.goodsSave(user, body);
  }

  async goodsStatus(
    user: CurrentUser,
    body: Parameters<HealthMallService['goodsStatus']>[1],
  ) {
    return this.mall.goodsStatus(user, body);
  }

  async goodsRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.mall.goodsRemove(user, body);
  }

  async goodsStockAdjust(
    user: CurrentUser,
    body: Parameters<HealthMallService['goodsStockAdjust']>[1],
  ) {
    return this.mall.goodsStockAdjust(user, body);
  }

  async drugs(user: CurrentUser, query: Record<string, unknown>) {
    return this.mall.drugs(user, query);
  }

  async drugSave(
    user: CurrentUser,
    body: Parameters<HealthMallService['drugSave']>[1],
  ) {
    return this.mall.drugSave(user, body);
  }

  async drugRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.mall.drugRemove(user, body);
  }

  async expressCompanies(user: CurrentUser, query: Record<string, unknown>) {
    return this.mall.expressCompanies(user, query);
  }

  async expressSave(
    user: CurrentUser,
    body: Parameters<HealthMallService['expressSave']>[1],
  ) {
    return this.mall.expressSave(user, body);
  }

  async expressRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.mall.expressRemove(user, body);
  }

  async shippingTemplates(user: CurrentUser, query: Record<string, unknown>) {
    return this.mall.shippingTemplates(user, query);
  }

  async shippingTemplateSave(
    user: CurrentUser,
    body: Parameters<HealthMallService['shippingTemplateSave']>[1],
  ) {
    return this.mall.shippingTemplateSave(user, body);
  }

  async shippingTemplateRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.mall.shippingTemplateRemove(user, body);
  }

  async aftersales(user: CurrentUser, query: Record<string, unknown>) {
    return this.mall.aftersales(user, query);
  }

  async aftersaleDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.mall.aftersaleDetail(user, query);
  }

  async aftersaleHandle(
    user: CurrentUser,
    body: Parameters<HealthMallService['aftersaleHandle']>[1],
  ) {
    return this.mall.aftersaleHandle(user, body);
  }

  // ---------- C10 会员、券、积分与核销 ----------

  async memberLevels(user: CurrentUser, query: Record<string, unknown>) {
    return this.marketing.memberLevels(user, query);
  }

  async memberLevelSave(
    user: CurrentUser,
    body: Parameters<HealthMarketingService['memberLevelSave']>[1],
  ) {
    return this.marketing.memberLevelSave(user, body);
  }

  async memberLevelRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.marketing.memberLevelRemove(user, body);
  }

  async memberCards(user: CurrentUser, query: Record<string, unknown>) {
    return this.marketing.memberCards(user, query);
  }

  async memberCardSave(
    user: CurrentUser,
    body: Parameters<HealthMarketingService['memberCardSave']>[1],
  ) {
    return this.marketing.memberCardSave(user, body);
  }

  async memberCardRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.marketing.memberCardRemove(user, body);
  }

  async memberGrants(user: CurrentUser, query: Record<string, unknown>) {
    return this.marketing.memberGrants(user, query);
  }

  async memberGrant(
    user: CurrentUser,
    body: Parameters<HealthMarketingService['memberGrant']>[1],
  ) {
    return this.marketing.memberGrant(user, body);
  }

  async memberGrantRevoke(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.marketing.memberGrantRevoke(user, body);
  }

  async coupons(user: CurrentUser, query: Record<string, unknown>) {
    return this.marketing.coupons(user, query);
  }

  async couponSave(
    user: CurrentUser,
    body: Parameters<HealthMarketingService['couponSave']>[1],
  ) {
    return this.marketing.couponSave(user, body);
  }

  async couponRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.marketing.couponRemove(user, body);
  }

  async couponTickets(user: CurrentUser, query: Record<string, unknown>) {
    return this.marketing.couponTickets(user, query);
  }

  async pointRules(user: CurrentUser, query: Record<string, unknown>) {
    return this.marketing.pointRules(user, query);
  }

  async pointRuleSave(
    user: CurrentUser,
    body: Parameters<HealthMarketingService['pointRuleSave']>[1],
  ) {
    return this.marketing.pointRuleSave(user, body);
  }

  async pointLogs(user: CurrentUser, query: Record<string, unknown>) {
    return this.marketing.pointLogs(user, query);
  }

  async pointAdjust(
    user: CurrentUser,
    body: Parameters<HealthMarketingService['pointAdjust']>[1],
  ) {
    return this.marketing.pointAdjust(user, body);
  }

  async verify(
    user: CurrentUser,
    body: Parameters<HealthMarketingService['verify']>[1],
  ) {
    return this.marketing.verify(user, body);
  }

  // ---------- C11 统一订单与资金 ----------

  async orders(user: CurrentUser, query: Record<string, unknown>) {
    return this.ordersService.orders(user, query);
  }

  async orderDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.ordersService.detail(user, query);
  }

  async orderAction(
    user: CurrentUser,
    body: Parameters<HealthOrderService['action']>[1],
  ) {
    return this.ordersService.action(user, body);
  }

  async orderDeliver(
    user: CurrentUser,
    body: Parameters<HealthOrderService['deliver']>[1],
  ) {
    return this.ordersService.deliver(user, body);
  }

  async orderStats(user: CurrentUser, query: Record<string, unknown>) {
    return this.ordersService.orderStats(user, query);
  }

  async orderExport(user: CurrentUser, query: Record<string, unknown>) {
    return this.ordersService.orderExport(user, query);
  }

  async walletLogs(user: CurrentUser, query: Record<string, unknown>) {
    return this.finance.walletLogs(user, query);
  }

  async commissionRules(user: CurrentUser, query: Record<string, unknown>) {
    return this.finance.commissionRules(user, query);
  }

  async commissionRuleSave(
    user: CurrentUser,
    body: Parameters<HealthFinanceService['commissionRuleSave']>[1],
  ) {
    return this.finance.commissionRuleSave(user, body);
  }

  async commissionRuleRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.finance.commissionRuleRemove(user, body);
  }

  async orderShares(user: CurrentUser, query: Record<string, unknown>) {
    return this.finance.orderShares(user, query);
  }

  async earners(user: CurrentUser, query: Record<string, unknown>) {
    return this.finance.earners(user, query);
  }

  async bankCards(user: CurrentUser, query: Record<string, unknown>) {
    return this.finance.bankCards(user, query);
  }

  async bankCardSave(
    user: CurrentUser,
    body: Parameters<HealthFinanceService['bankCardSave']>[1],
  ) {
    return this.finance.bankCardSave(user, body);
  }

  async bankCardRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.finance.bankCardRemove(user, body);
  }

  async withdrawals(user: CurrentUser, query: Record<string, unknown>) {
    return this.finance.withdrawals(user, query);
  }

  async withdrawalHandle(
    user: CurrentUser,
    body: Parameters<HealthFinanceService['withdrawalHandle']>[1],
  ) {
    return this.finance.withdrawalHandle(user, body);
  }

  async promoters(user: CurrentUser, query: Record<string, unknown>) {
    return this.promotersService.promoters(user, query);
  }

  async promoterAudit(
    user: CurrentUser,
    body: Parameters<HealthPromoterService['promoterAudit']>[1],
  ) {
    return this.promotersService.promoterAudit(user, body);
  }

  async promoteLogs(user: CurrentUser, query: Record<string, unknown>) {
    return this.promotersService.promoteLogs(user, query);
  }

  async posters(user: CurrentUser, query: Record<string, unknown>) {
    return this.promotersService.posters(user, query);
  }

  async posterSave(
    user: CurrentUser,
    body: Parameters<HealthPromoterService['posterSave']>[1],
  ) {
    return this.promotersService.posterSave(user, body);
  }

  async posterRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.promotersService.posterRemove(user, body);
  }

  // ---------- C12 内容、社区与运营 ----------

  async articleCategories(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.articleCategories(user, query);
  }

  async articleCategorySave(
    user: CurrentUser,
    body: Parameters<HealthContentService['articleCategorySave']>[1],
  ) {
    return this.content.articleCategorySave(user, body);
  }

  async articleCategoryRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.content.articleCategoryRemove(user, body);
  }

  async articles(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.articles(user, query);
  }

  async articleDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.articleDetail(user, query);
  }

  async articleSave(
    user: CurrentUser,
    body: Parameters<HealthContentService['articleSave']>[1],
  ) {
    return this.content.articleSave(user, body);
  }

  async articleAudit(
    user: CurrentUser,
    body: Parameters<HealthContentService['articleAudit']>[1],
  ) {
    return this.content.articleAudit(user, body);
  }

  async articleRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.content.articleRemove(user, body);
  }

  async postTags(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.postTags(user, query);
  }

  async postTagSave(
    user: CurrentUser,
    body: Parameters<HealthContentService['postTagSave']>[1],
  ) {
    return this.content.postTagSave(user, body);
  }

  async posts(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.posts(user, query);
  }

  async postDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.postDetail(user, query);
  }

  async postAudit(
    user: CurrentUser,
    body: Parameters<HealthContentService['postAudit']>[1],
  ) {
    return this.content.postAudit(user, body);
  }

  async postRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.content.postRemove(user, body);
  }

  async postCommentAudit(
    user: CurrentUser,
    body: Parameters<HealthContentService['postCommentAudit']>[1],
  ) {
    return this.content.postCommentAudit(user, body);
  }

  async postCommentRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.content.postCommentRemove(user, body);
  }

  async questions(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.questions(user, query);
  }

  async questionDetail(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.questionDetail(user, query);
  }

  async answerAudit(
    user: CurrentUser,
    body: Parameters<HealthContentService['answerAudit']>[1],
  ) {
    return this.content.answerAudit(user, body);
  }

  async answerRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.content.answerRemove(user, body);
  }

  async reviews(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.reviews(user, query);
  }

  async reviewStats(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.reviewStats(user, query);
  }

  async reviewReply(
    user: CurrentUser,
    body: Parameters<HealthContentService['reviewReply']>[1],
  ) {
    return this.content.reviewReply(user, body);
  }

  async reviewAudit(
    user: CurrentUser,
    body: Parameters<HealthContentService['reviewAudit']>[1],
  ) {
    return this.content.reviewAudit(user, body);
  }

  async reviewAppealHandle(
    user: CurrentUser,
    body: Parameters<HealthContentService['reviewAppealHandle']>[1],
  ) {
    return this.content.reviewAppealHandle(user, body);
  }

  async reviewRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.content.reviewRemove(user, body);
  }

  async broadcasts(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.broadcasts(user, query);
  }

  async broadcastCreate(
    user: CurrentUser,
    body: Parameters<HealthContentService['broadcastCreate']>[1],
  ) {
    return this.content.broadcastCreate(user, body);
  }

  async broadcastCancel(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.content.broadcastCancel(user, body);
  }

  async hotKeywords(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.hotKeywords(user, query);
  }

  async hotKeywordSave(
    user: CurrentUser,
    body: Parameters<HealthContentService['hotKeywordSave']>[1],
  ) {
    return this.content.hotKeywordSave(user, body);
  }

  async hotKeywordRemove(
    user: CurrentUser,
    body: { shopId: number; id: number },
  ) {
    return this.content.hotKeywordRemove(user, body);
  }

  async searchLogs(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.searchLogs(user, query);
  }

  async cannedList(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.cannedList(user, query);
  }

  async cannedSave(
    user: CurrentUser,
    body: Parameters<HealthContentService['cannedSave']>[1],
  ) {
    return this.content.cannedSave(user, body);
  }

  async cannedRemove(user: CurrentUser, body: { shopId: number; id: number }) {
    return this.content.cannedRemove(user, body);
  }
}
