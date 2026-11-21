import type { CurrentUser } from '../auth/current-user';
import type {
  MpAfterSaleArbitrateBody,
  MiniAppInput,
} from '@enterprise/contracts';
import type { MpAftersaleService } from './mp.aftersale.service';
import type { MpCategoryService } from './mp.category.service';
import type { MpCatalogService } from './mp.catalog.service';
import type { MpCouponService } from './mp.coupon.service';
import type { MpDiyService } from './mp.diy.service';
import type { MpFinanceService } from './mp.finance.service';
import type { MpMarketService } from './mp.market.service';
import type { MpMerchantService } from './mp.merchant.service';
import type { MpReleaseService } from './mp.release.service';
import type { MpScrmService } from './mp.scrm.service';

/**
 * 市场运营方控制器：契约 `Market_*` 由 moduleHandlers 自动派发。
 * 参数顺序固定「user → 路径参 → query → body」，返回值不套信封。
 */
export class MarketplaceController {
  constructor(
    private readonly marketService: MpMarketService,
    private readonly merchantService: MpMerchantService,
    private readonly categoryService: MpCategoryService,
    private readonly catalogService: MpCatalogService,
    private readonly aftersaleService: MpAftersaleService,
    private readonly financeService: MpFinanceService,
    private readonly releaseService: MpReleaseService,
    private readonly diyService: MpDiyService,
    private readonly couponService: MpCouponService,
    private readonly scrmService: MpScrmService,
  ) {}

  overview(user: CurrentUser) {
    return this.marketService.overview(user.userId);
  }

  detail(user: CurrentUser) {
    return this.marketService.detail(user.userId);
  }

  create(user: CurrentUser, body: Parameters<MpMarketService['create']>[1]) {
    return this.marketService.create(user.userId, body);
  }

  save(user: CurrentUser, body: Parameters<MpMarketService['save']>[1]) {
    return this.marketService.save(user.userId, body);
  }

  async status(
    user: CurrentUser,
    body: Parameters<MpMarketService['setStatus']>[1],
  ) {
    return this.marketService.setStatus(user.userId, body);
  }

  async categories(user: CurrentUser) {
    const market = await this.marketService.require(user.userId);
    return this.categoryService.list(market.id);
  }

  async categorySave(
    user: CurrentUser,
    body: Parameters<MpCategoryService['save']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.categoryService.save(market.id, body);
  }

  async categoryRemove(user: CurrentUser, body: { id: number }) {
    const market = await this.marketService.require(user.userId);
    return this.categoryService.remove(market.id, body.id);
  }

  async merchants(
    user: CurrentUser,
    query: Parameters<MpMerchantService['list']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.merchantService.list(market.id, query);
  }

  async merchantDetail(user: CurrentUser, query: { id: number }) {
    const market = await this.marketService.require(user.userId);
    return this.merchantService.detail(market.id, Number(query.id));
  }

  async merchantAudit(
    user: CurrentUser,
    body: Parameters<MpMerchantService['audit']>[2],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.merchantService.audit(market.id, user.username, body);
  }

  async merchantStatus(
    user: CurrentUser,
    body: Parameters<MpMerchantService['setStatus']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.merchantService.setStatus(market.id, body);
  }

  async products(
    user: CurrentUser,
    query: Parameters<MpCatalogService['platformList']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.catalogService.platformList(market.id, query);
  }

  async productAudits(
    user: CurrentUser,
    query: Parameters<MpCatalogService['audits']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.catalogService.audits(market.id, query);
  }

  async productAudit(
    user: CurrentUser,
    body: Parameters<MpCatalogService['audit']>[2],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.catalogService.audit(market.id, user.username, body);
  }

  async shops(
    user: CurrentUser,
    query: Parameters<MpMerchantService['shopList']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.merchantService.shopList(market.id, query);
  }

  async shopStatus(
    user: CurrentUser,
    body: Parameters<MpMerchantService['setShopStatus']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.merchantService.setShopStatus(market.id, body);
  }

  // ------------------------------------------------------------ 售后与退款台账（B2）

  async afterSales(
    user: CurrentUser,
    query: Parameters<MpAftersaleService['marketList']>[1],
  ) {
    return this.aftersaleService.marketList(user.userId, query);
  }

  async afterSaleDetail(user: CurrentUser, query: { id: number }) {
    return this.aftersaleService.marketDetail(user.userId, Number(query.id));
  }

  async afterSaleArbitrate(user: CurrentUser, body: MpAfterSaleArbitrateBody) {
    return this.aftersaleService.arbitrate(user.userId, user.username, body);
  }

  async refunds(
    user: CurrentUser,
    query: Parameters<MpAftersaleService['marketRefunds']>[1],
  ) {
    return this.aftersaleService.marketRefunds(user.userId, query);
  }

  async refundDetail(user: CurrentUser, query: { id: number }) {
    return this.aftersaleService.marketRefundDetail(
      user.userId,
      Number(query.id),
    );
  }

  async payRecords(
    user: CurrentUser,
    query: Parameters<MpAftersaleService['payRecords']>[1],
  ) {
    return this.aftersaleService.payRecords(user.userId, query);
  }

  // ------------------------------------------------------------ 抽佣 / 结算 / 提现（B2）

  async commissionRules(user: CurrentUser) {
    return this.financeService.commissionRules(user.userId);
  }

  async commissionRuleSave(
    user: CurrentUser,
    body: Parameters<MpFinanceService['commissionRuleSave']>[1],
  ) {
    return this.financeService.commissionRuleSave(user.userId, body);
  }

  async commissionRuleStatus(
    user: CurrentUser,
    body: Parameters<MpFinanceService['commissionRuleStatus']>[1],
  ) {
    return this.financeService.commissionRuleStatus(user.userId, body);
  }

  async settlements(
    user: CurrentUser,
    query: Parameters<MpFinanceService['settlements']>[1],
  ) {
    return this.financeService.settlements(user.userId, query);
  }

  async settlementDetail(user: CurrentUser, query: { id: number }) {
    return this.financeService.settlementDetail(user.userId, Number(query.id));
  }

  async settlementGenerate(
    user: CurrentUser,
    body: Parameters<MpFinanceService['settlementGenerate']>[1],
  ) {
    return this.financeService.settlementGenerate(user.userId, body);
  }

  async settlementPaid(
    user: CurrentUser,
    body: Parameters<MpFinanceService['settlementPaid']>[1],
  ) {
    return this.financeService.settlementPaid(user.userId, body);
  }

  async withdrawals(
    user: CurrentUser,
    query: Parameters<MpFinanceService['withdrawals']>[1],
  ) {
    return this.financeService.withdrawals(user.userId, query);
  }

  async withdrawalAudit(
    user: CurrentUser,
    body: Parameters<MpFinanceService['withdrawalAudit']>[1],
  ) {
    return this.financeService.withdrawalAudit(user.userId, body);
  }

  async withdrawalPaid(
    user: CurrentUser,
    body: Parameters<MpFinanceService['withdrawalPaid']>[1],
  ) {
    return this.financeService.withdrawalPaid(user.userId, body);
  }

  // ------------------------------------------------------------ 装修 / 优惠券（B3）

  diyWidgets() {
    return this.diyService.widgets();
  }

  async diyList(user: CurrentUser, query: Parameters<MpDiyService['list']>[1]) {
    const market = await this.marketService.require(user.userId);
    return this.diyService.list({ marketId: market.id, shopId: 0 }, query);
  }

  async diyDetail(user: CurrentUser, query: { id: number }) {
    const market = await this.marketService.require(user.userId);
    return this.diyService.detail(
      { marketId: market.id, shopId: 0 },
      Number(query.id),
    );
  }

  async diySave(user: CurrentUser, body: Parameters<MpDiyService['save']>[1]) {
    const market = await this.marketService.require(user.userId);
    return this.diyService.save({ marketId: market.id, shopId: 0 }, body);
  }

  async diyPublish(user: CurrentUser, body: { id: number }) {
    const market = await this.marketService.require(user.userId);
    return this.diyService.publish(
      { marketId: market.id, shopId: 0 },
      Number(body.id),
    );
  }

  async diyRemove(user: CurrentUser, body: { id: number }) {
    const market = await this.marketService.require(user.userId);
    return this.diyService.remove(
      { marketId: market.id, shopId: 0 },
      Number(body.id),
    );
  }

  async coupons(
    user: CurrentUser,
    query: Parameters<MpCouponService['marketList']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.couponService.marketList(market.id, query);
  }

  async couponSave(
    user: CurrentUser,
    body: Parameters<MpCouponService['marketSave']>[1],
  ) {
    const market = await this.marketService.require(user.userId);
    return this.couponService.marketSave(market.id, body);
  }

  async couponStatus(user: CurrentUser, body: { id: number; status: string }) {
    const market = await this.marketService.require(user.userId);
    return this.couponService.marketStatus(market.id, body.id, body.status);
  }

  // ------------------------------------------------------------ 企业微信 SCRM（B4）

  scrm(user: CurrentUser) {
    return this.scrmService.state(user.userId);
  }

  scrmToggle(user: CurrentUser, body: { enabled: boolean }) {
    return this.scrmService.toggle(user.userId, Boolean(body.enabled));
  }

  scrmRetry(user: CurrentUser) {
    return this.scrmService.retryNow(user.userId);
  }

  scrmReplay(user: CurrentUser, body: { ids?: number[] }) {
    return this.scrmService.replaySkipped(user.userId, body.ids);
  }

  // ------------------------------------------------------------ 小程序发布（scene=MARKET）

  async appDetail(user: CurrentUser) {
    return this.releaseService.appDetail(user);
  }

  async appSave(user: CurrentUser, body: MiniAppInput) {
    return this.releaseService.appSave(user, body);
  }

  async appTest(user: CurrentUser) {
    return this.releaseService.appTest(user);
  }

  async payTest(user: CurrentUser) {
    return this.releaseService.payTest(user);
  }

  async qrcodeGenerate(user: CurrentUser, body: { path?: string }) {
    return this.releaseService.qrcode(user, String(body.path || ''));
  }
}
