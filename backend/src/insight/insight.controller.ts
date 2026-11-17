import { text } from '../common/api';
import { parseId } from '../common/parse-id';
import type { CurrentUser } from '../auth/current-user';
import { InsightService } from './insight.service';

/**
 * 智慧分析界面侧接口（登录态）。方法名与 `Insight_*` 端点后缀一一对应，
 * 由 automation-routes 的 `moduleHandlers('Insight_', ...)` 按参数顺序自动派发
 * （user → 路径参数 → 查询 → 请求体）。
 */
export class InsightController {
  constructor(private readonly service: InsightService) {}

  async overview(user: CurrentUser) {
    return this.service.overview(user);
  }

  async listSubscriptions(user: CurrentUser) {
    return this.service.listSubscriptions(user);
  }

  async saveSubscription(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.saveSubscription(user, body);
  }

  async removeSubscription(user: CurrentUser, id: string) {
    return this.service.removeSubscription(user, parseId(id, '订阅 ID'));
  }

  async toggleSubscription(
    user: CurrentUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    return this.service.toggleSubscription(
      user,
      parseId(id, '订阅 ID'),
      text(body.status),
    );
  }

  async collectNow(user: CurrentUser, id: string) {
    return this.service.collectNow(user, parseId(id, '订阅 ID'));
  }

  async listHotspots(user: CurrentUser, query: Record<string, unknown>) {
    return this.service.listHotspots(user, query);
  }

  async hotspotDetail(user: CurrentUser, id: string) {
    return this.service.hotspotDetail(user, parseId(id, '热点 ID'));
  }

  async listMetrics(user: CurrentUser, query: Record<string, unknown>) {
    return this.service.listMetrics(user, query);
  }

  async trendsOverview(user: CurrentUser) {
    return this.service.trendsOverview(user);
  }

  async generateReport(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.generateReport(user, body);
  }

  async listReports(user: CurrentUser, query: Record<string, unknown>) {
    return this.service.listReports(user, strOr(query.kind));
  }

  async tagAssets(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.tagAssets(user, body);
  }

  async syncLedger(user: CurrentUser) {
    return this.service.syncLedger(user);
  }

  async reviewHotspot(
    user: CurrentUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    return this.service.reviewHotspot(user, parseId(id, '热点 ID'), body);
  }

  async getSettings(user: CurrentUser) {
    return this.service.getSettings(user);
  }

  async saveSettings(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.saveSettings(user, body);
  }
}

function strOr(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}
