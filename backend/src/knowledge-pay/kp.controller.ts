import type { CurrentUser } from '../auth/current-user';
import { BusinessException } from '../common/business.exception';
import type { MiniProgramClient } from '../miniprogram/miniprogram.client';
import type { KnowledgePayPayService } from './kp.pay.service';
import type { KnowledgePayService } from './kp.service';

/**
 * 知识付费云课堂控制器：契约 `Kp_*` 端点由 moduleHandlers 自动派发进来。
 * 返回值不套信封（信封由装配层统一包），参数顺序固定「user → 路径参 → query → body」。
 */
export class KnowledgePayController {
  constructor(
    private readonly service: KnowledgePayService,
    private readonly wx: MiniProgramClient,
    private readonly pay: KnowledgePayPayService,
  ) {}

  async overview(user: CurrentUser) {
    return this.service.overview(user.userId);
  }

  async settings(user: CurrentUser) {
    const site = await this.service.ensureSite(user.userId);
    return this.service.settingsView(site);
  }

  async saveSettings(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['saveSettings']>[1],
  ) {
    return this.service.saveSettings(user.userId, body);
  }

  /** 连接自检：能取到 access_token 才算凭据可用（与平台级「小程序管理」同口径）。 */
  async test(user: CurrentUser) {
    const site = await this.service.ensureSite(user.userId);
    if (!site.wxAppId || !site.wxAppSecret) {
      return { ok: false, message: '尚未填写 AppID / AppSecret，无法自检' };
    }
    try {
      const runtime = this.service.requireRuntime(site);
      await this.wx.accessToken(runtime, true);
      return { ok: true, message: `AppID ${site.wxAppId} 凭据可用` };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof BusinessException
            ? error.message
            : '微信接口校验失败，请核对 AppID / AppSecret',
      };
    }
  }

  /** 支付自检：下载并验签微信支付平台证书（不产生交易）。 */
  async testPay(user: CurrentUser) {
    const site = await this.service.ensureSite(user.userId);
    try {
      return await this.pay.testConnection(site);
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof BusinessException
            ? error.message
            : '微信支付凭据校验失败，请核对商户号、证书序列号、APIv3 密钥与私钥',
      };
    }
  }

  // ---------------- 分类 ----------------

  async categories(user: CurrentUser) {
    return this.service.listCategories(user.userId);
  }

  async createCategory(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['createCategory']>[1],
  ) {
    return this.service.createCategory(user.userId, body);
  }

  async updateCategory(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['updateCategory']>[2],
  ) {
    return this.service.updateCategory(user.userId, id, body);
  }

  async removeCategory(user: CurrentUser, id: string) {
    return this.service.removeCategory(user.userId, id);
  }

  // ---------------- 内容 ----------------

  async resources(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listResources']>[1],
  ) {
    return this.service.listResources(user.userId, query);
  }

  async createResource(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['createResource']>[1],
  ) {
    return this.service.createResource(user.userId, body);
  }

  async updateResource(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['updateResource']>[2],
  ) {
    return this.service.updateResource(user.userId, id, body);
  }

  async removeResource(user: CurrentUser, id: string) {
    return this.service.removeResource(user.userId, id);
  }

  async auditResource(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['auditResource']>[2],
  ) {
    return this.service.auditResource(user.userId, id, body);
  }

  // ---------------- 课程目录（课时） ----------------

  async lessons(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listLessons']>[1],
  ) {
    return this.service.listLessons(user.userId, query);
  }

  async saveLesson(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['saveLesson']>[1],
  ) {
    return this.service.saveLesson(user.userId, body);
  }

  async updateLesson(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['updateLesson']>[2],
  ) {
    return this.service.updateLesson(user.userId, id, body);
  }

  async removeLesson(user: CurrentUser, id: string) {
    return this.service.removeLesson(user.userId, id);
  }

  // ---------------- 章节 / 讲师 ----------------

  async chapters(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listChapters']>[1],
  ) {
    return this.service.listChapters(user.userId, query);
  }

  async saveChapter(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['saveChapter']>[1],
  ) {
    return this.service.saveChapter(user.userId, body);
  }

  async updateChapter(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['updateChapter']>[2],
  ) {
    return this.service.updateChapter(user.userId, id, body);
  }

  async removeChapter(user: CurrentUser, id: string) {
    return this.service.removeChapter(user.userId, id);
  }

  async teachers(user: CurrentUser) {
    return this.service.listTeachers(user.userId);
  }

  async saveTeacher(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['saveTeacher']>[1],
  ) {
    return this.service.saveTeacher(user.userId, body);
  }

  async updateTeacher(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['updateTeacher']>[2],
  ) {
    return this.service.updateTeacher(user.userId, id, body);
  }

  async removeTeacher(user: CurrentUser, id: string) {
    return this.service.removeTeacher(user.userId, id);
  }

  // ---------------- 装修：轮播 / 公告 / 精选 ----------------

  async banners(user: CurrentUser) {
    return this.service.listBanners(user.userId);
  }

  async saveBanner(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['saveBanner']>[2],
  ) {
    return this.service.saveBanner(user.userId, undefined, body);
  }

  async updateBanner(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['saveBanner']>[2],
  ) {
    return this.service.saveBanner(user.userId, id, body);
  }

  async removeBanner(user: CurrentUser, id: string) {
    return this.service.removeBanner(user.userId, id);
  }

  async notices(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listNotices']>[1],
  ) {
    return this.service.listNotices(user.userId, query);
  }

  async saveNotice(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['saveNotice']>[2],
  ) {
    return this.service.saveNotice(user.userId, undefined, body);
  }

  async updateNotice(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['saveNotice']>[2],
  ) {
    return this.service.saveNotice(user.userId, id, body);
  }

  async removeNotice(user: CurrentUser, id: string) {
    return this.service.removeNotice(user.userId, id);
  }

  async links(user: CurrentUser) {
    return this.service.listLinks(user.userId);
  }

  async saveLink(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['saveLink']>[2],
  ) {
    return this.service.saveLink(user.userId, undefined, body);
  }

  async updateLink(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['saveLink']>[2],
  ) {
    return this.service.saveLink(user.userId, id, body);
  }

  async removeLink(user: CurrentUser, id: string) {
    return this.service.removeLink(user.userId, id);
  }

  // ---------------- 发现页导航 / 自定义单页 ----------------

  async navs(user: CurrentUser) {
    return this.service.listNavs(user.userId);
  }

  async saveNav(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['saveNav']>[1],
  ) {
    return this.service.saveNav(user.userId, body);
  }

  async updateNav(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['updateNav']>[2],
  ) {
    return this.service.updateNav(user.userId, id, body);
  }

  async removeNav(user: CurrentUser, id: string) {
    return this.service.removeNav(user.userId, id);
  }

  async pages(user: CurrentUser) {
    return this.service.listPages(user.userId);
  }

  async savePage(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['savePage']>[1],
  ) {
    return this.service.savePage(user.userId, body);
  }

  async updatePage(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['updatePage']>[2],
  ) {
    return this.service.updatePage(user.userId, id, body);
  }

  async removePage(user: CurrentUser, id: string) {
    return this.service.removePage(user.userId, id);
  }

  // ---------------- 卡密 ----------------

  async cards(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listCards']>[1],
  ) {
    return this.service.listCards(user.userId, query);
  }

  async generateCards(
    user: CurrentUser,
    body: Parameters<KnowledgePayService['generateCards']>[1],
  ) {
    return this.service.generateCards(user.userId, body);
  }

  async disableCard(user: CurrentUser, id: string) {
    return this.service.disableCard(user.userId, id);
  }

  async removeCard(user: CurrentUser, id: string) {
    return this.service.removeCard(user.userId, id);
  }

  // ---------------- 会员 / 订单 ----------------

  async members(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listMembers']>[1],
  ) {
    return this.service.listMembers(user.userId, query);
  }

  async adjustMember(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['adjustMember']>[2],
  ) {
    return this.service.adjustMember(user.userId, id, body);
  }

  async orders(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listOrders']>[1],
  ) {
    return this.service.listOrders(user.userId, query);
  }

  // ---------------- 学习台账 / 评价 ----------------

  async learnings(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listLearnings']>[1],
  ) {
    return this.service.listLearnings(user.userId, query);
  }

  async reviews(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listReviews']>[1],
  ) {
    return this.service.listReviews(user.userId, query);
  }

  async replyReview(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['replyReview']>[2],
  ) {
    return this.service.replyReview(user.userId, id, body);
  }

  async setReviewStatus(
    user: CurrentUser,
    id: string,
    body: Parameters<KnowledgePayService['setReviewStatus']>[2],
  ) {
    return this.service.setReviewStatus(user.userId, id, body);
  }

  async removeReview(user: CurrentUser, id: string) {
    return this.service.removeReview(user.userId, id);
  }

  // ---------------- 现金订单 / 微信支付 ----------------

  async cashOrders(
    user: CurrentUser,
    query: Parameters<KnowledgePayService['listCashOrders']>[1],
  ) {
    return this.service.listCashOrders(user.userId, query);
  }

  async closeCashOrder(user: CurrentUser, id: string) {
    return this.pay.close(user.userId, Number(id));
  }

  async refundCashOrder(
    user: CurrentUser,
    id: string,
    body: { reason: string },
  ) {
    return this.pay.refund(user.userId, Number(id), body.reason);
  }
}
