import type {
  DhAppSaveBody,
  DhArticleInput,
  DhAuditInput,
  DhBgmGroupInput,
  DhBgmInput,
  DhCardBatchCreateInput,
  DhChannelInput,
  DhMemberUpdateInput,
  DhPackageInput,
  DhPosterInput,
  DhPresetVoiceInput,
  DhSettingsInput,
  DhSwiperInput,
  DhVoiceGroupInput,
  DhWriteTopicInput,
} from '@enterprise/contracts';
import type { CurrentUser } from '../auth/current-user';
import type { MiniAppService } from '../private-mini/mini-app.service';
import type { DhChannelService } from './dh.channel.service';
import type { DhCommissionService } from './dh.commission.service';
import type { DhContentService } from './dh.content.service';
import type { DhLibraryService } from './dh.library.service';
import type { DhMemberService } from './dh.member.service';
import type { DhReleaseService } from './dh.release.service';
import type { DhSiteService } from './dh.site.service';
import type { DhStoreService } from './dh.store.service';
import type { DhSynthService } from './dh.synth.service';

/**
 * 数字人小程序工具·店主侧控制器。
 * 方法名与契约 `Dh_` 后缀一一对应（`moduleHandlers` 按后缀反射取方法，名字对不上就是 400）。
 * 站点由会话账号懒创建；会员令牌进不来这里，C 端走 /api/public/digital-human/*。
 */
export class DigitalHumanController {
  constructor(
    private readonly site: DhSiteService,
    private readonly member: DhMemberService,
    private readonly channel: DhChannelService,
    private readonly library: DhLibraryService,
    private readonly synth: DhSynthService,
    private readonly content: DhContentService,
    private readonly store: DhStoreService,
    private readonly commission: DhCommissionService,
    private readonly release: DhReleaseService,
    private readonly miniApps: MiniAppService,
  ) {}

  // ---------- 站点 ----------

  async overview(user: CurrentUser) {
    return this.site.overview(user);
  }

  async settings(user: CurrentUser) {
    const site = await this.site.ensureSite(user.userId);
    return this.site.settingsView(site);
  }

  async settingsSave(user: CurrentUser, body: DhSettingsInput) {
    return this.site.saveSettings(user, body);
  }

  async miniApp(user: CurrentUser) {
    return this.release.miniAppView(user);
  }

  async miniAppSave(user: CurrentUser, body: DhAppSaveBody) {
    const site = await this.member.siteOfOwner(user.userId);
    const subject = this.member.subjectOf(site);
    await this.miniApps.save(subject, body);
    return this.miniApps.view(subject);
  }

  async miniAppTest(user: CurrentUser) {
    return this.release.miniAppTest(user);
  }

  // ---------- 模型渠道 ----------

  async channelsList(user: CurrentUser, query: Record<string, unknown>) {
    return this.channel.list(
      user,
      typeof query.capability === 'string' ? query.capability : '',
    );
  }

  async channelSave(user: CurrentUser, body: DhChannelInput) {
    return this.channel.save(user, body);
  }

  async channelRemove(user: CurrentUser, body: { id: number }) {
    return this.channel.remove(user, body.id);
  }

  async channelTest(user: CurrentUser, body: { id: number }) {
    return this.channel.test(user, body.id);
  }

  // ---------- 会员与资产 ----------

  async membersList(user: CurrentUser, query: Record<string, unknown>) {
    return this.member.adminList(user, query);
  }

  async memberUpdate(user: CurrentUser, body: DhMemberUpdateInput) {
    return this.member.adminUpdate(user, body);
  }

  async balanceLogs(user: CurrentUser, query: Record<string, unknown>) {
    return this.member.balanceLogs(user, query);
  }

  async bodiesList(user: CurrentUser, query: Record<string, unknown>) {
    return this.synth.adminBodies(user, query);
  }

  async bodyRemove(user: CurrentUser, body: { id: number }) {
    return this.synth.adminRemoveAsset(user, 'bodies', body.id);
  }

  async voicesList(user: CurrentUser, query: Record<string, unknown>) {
    return this.synth.adminVoices(user, query);
  }

  async voiceRemove(user: CurrentUser, body: { id: number }) {
    return this.synth.adminRemoveAsset(user, 'voices', body.id);
  }

  // ---------- 公共素材库 ----------

  async voiceGroupsList(user: CurrentUser) {
    return this.library.voiceGroups(user);
  }

  async voiceGroupSave(user: CurrentUser, body: DhVoiceGroupInput) {
    return this.library.saveVoiceGroup(user, body);
  }

  async voiceGroupRemove(user: CurrentUser, body: { id: number }) {
    return this.library.removeVoiceGroup(user, body.id);
  }

  async presetVoicesList(user: CurrentUser, query: Record<string, unknown>) {
    const groupId = Number(query.groupId || 0);
    return this.library.presetVoices(user, groupId > 0 ? groupId : undefined);
  }

  async presetVoiceSave(user: CurrentUser, body: DhPresetVoiceInput) {
    return this.library.savePresetVoice(user, body);
  }

  async presetVoiceRemove(user: CurrentUser, body: { id: number }) {
    return this.library.removePresetVoice(user, body.id);
  }

  async bgmGroupsList(user: CurrentUser) {
    return this.library.bgmGroups(user);
  }

  async bgmGroupSave(user: CurrentUser, body: DhBgmGroupInput) {
    return this.library.saveBgmGroup(user, body);
  }

  async bgmGroupRemove(user: CurrentUser, body: { id: number }) {
    return this.library.removeBgmGroup(user, body.id);
  }

  async bgmsList(user: CurrentUser, query: Record<string, unknown>) {
    const groupId = Number(query.groupId || 0);
    return this.library.bgms(user, groupId > 0 ? groupId : undefined);
  }

  async bgmSave(user: CurrentUser, body: DhBgmInput) {
    return this.library.saveBgm(user, body);
  }

  async bgmRemove(user: CurrentUser, body: { id: number }) {
    return this.library.removeBgm(user, body.id);
  }

  // ---------- 作品与任务 ----------

  async worksList(user: CurrentUser, query: Record<string, unknown>) {
    return this.synth.adminWorks(user, query);
  }

  async workRemove(user: CurrentUser, body: { id: number }) {
    return this.synth.adminRemoveWork(user, body.id);
  }

  async tasksList(user: CurrentUser, query: Record<string, unknown>) {
    return this.synth.adminTasks(user, query);
  }

  async taskRetry(user: CurrentUser, body: { id: number }) {
    return this.synth.retryTask(user, body.id);
  }

  // ---------- AI 文案 ----------

  async writeTopicsList(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.writeTopics(
      user,
      typeof query.kind === 'string' ? query.kind : '',
    );
  }

  async writeTopicSave(user: CurrentUser, body: DhWriteTopicInput) {
    return this.content.saveWriteTopic(user, body);
  }

  async writeTopicRemove(user: CurrentUser, body: { id: number }) {
    return this.content.removeWriteTopic(user, body.id);
  }

  async aiRecordsList(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.aiRecords(user, query);
  }

  // ---------- 套餐与订单 ----------

  async packagesList(user: CurrentUser, query: Record<string, unknown>) {
    return this.store.packages(
      user,
      typeof query.type === 'string' ? query.type : '',
    );
  }

  async packageSave(user: CurrentUser, body: DhPackageInput) {
    return this.store.savePackage(user, body);
  }

  async packageRemove(user: CurrentUser, body: { id: number }) {
    return this.store.removePackage(user, body.id);
  }

  async ordersList(user: CurrentUser, query: Record<string, unknown>) {
    return this.store.orders(user, query);
  }

  async orderRefund(user: CurrentUser, body: { id: number; reason: string }) {
    return this.store.refundOrder(user, body.id, body.reason);
  }

  // ---------- 卡密 ----------

  async cardBatchesList(user: CurrentUser, query: Record<string, unknown>) {
    return this.store.cardBatches(user, query);
  }

  async cardBatchCreate(user: CurrentUser, body: DhCardBatchCreateInput) {
    return this.store.createBatch(user, body);
  }

  async cardsList(user: CurrentUser, query: Record<string, unknown>) {
    return this.store.cards(user, query);
  }

  async cardDisable(user: CurrentUser, body: { id: number }) {
    return this.store.disableCard(user, body.id);
  }

  async cardsExport(user: CurrentUser, query: Record<string, unknown>) {
    return this.store.exportCards(user, Number(query.batchId || 0));
  }

  // ---------- 内容位 ----------

  async articlesList(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.articles(user, query);
  }

  async articleSave(user: CurrentUser, body: DhArticleInput) {
    return this.content.saveArticle(user, body);
  }

  async articleRemove(user: CurrentUser, body: { id: number }) {
    return this.content.removeArticle(user, body.id);
  }

  async swipersList(user: CurrentUser) {
    return this.content.swipers(user);
  }

  async swiperSave(user: CurrentUser, body: DhSwiperInput) {
    return this.content.saveSwiper(user, body);
  }

  async swiperRemove(user: CurrentUser, body: { id: number }) {
    return this.content.removeSwiper(user, body.id);
  }

  async postersList(user: CurrentUser) {
    return this.content.posters(user);
  }

  async posterSave(user: CurrentUser, body: DhPosterInput) {
    return this.content.savePoster(user, body);
  }

  async posterRemove(user: CurrentUser, body: { id: number }) {
    return this.content.removePoster(user, body.id);
  }

  // ---------- 分销与反馈 ----------

  async promoterAppliesList(user: CurrentUser, query: Record<string, unknown>) {
    return this.commission.applies(user, query);
  }

  async promoterApplyAudit(user: CurrentUser, body: DhAuditInput) {
    return this.commission.auditApply(user, body);
  }

  async commissionsList(user: CurrentUser, query: Record<string, unknown>) {
    return this.commission.commissions(user, query);
  }

  async withdrawsList(user: CurrentUser, query: Record<string, unknown>) {
    return this.commission.withdraws(user, query);
  }

  async withdrawAudit(user: CurrentUser, body: DhAuditInput) {
    return this.commission.auditWithdraw(user, body);
  }

  async feedbacksList(user: CurrentUser, query: Record<string, unknown>) {
    return this.content.feedbacks(user, query);
  }

  async feedbackReply(user: CurrentUser, body: { id: number; reply: string }) {
    return this.content.replyFeedback(user, body.id, body.reply);
  }

  // ---------- 小程序码 ----------

  async releaseQrcode(user: CurrentUser) {
    return this.release.qrcode(user);
  }
}
