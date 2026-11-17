import { text } from '../common/api';
import { parseId } from '../common/parse-id';
import type { CurrentUser } from '../auth/current-user';
import { InsightService } from './insight.service';

/**
 * 智慧分析界面侧接口（登录态）。方法名与 `Insight_*` 端点后缀一一对应，
 * 由 automation-routes 的 `moduleHandlers('Insight_', ...)` 按参数顺序自动派发
 * （user → 路径参数 → 查询 → 请求体）。
 *
 * 采集配置分治：热点侧（无 `Trend` 前缀）固定 scope='hotspot'，趋势侧（`*Trend*`）固定
 * scope='trend'，两侧共用同一套 service 实现，只按采集目的隔离读写。
 */
export class InsightController {
  constructor(private readonly service: InsightService) {}

  async overview(user: CurrentUser) {
    return this.service.overview(user);
  }

  async listSubscriptions(user: CurrentUser) {
    return this.service.listSubscriptions(user, 'hotspot');
  }

  async saveSubscription(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.saveSubscription(user, body, 'hotspot');
  }

  async removeSubscription(user: CurrentUser, id: string) {
    return this.service.removeSubscription(
      user,
      parseId(id, '订阅 ID'),
      'hotspot',
    );
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
      'hotspot',
    );
  }

  async collectNow(user: CurrentUser, id: string) {
    return this.service.collectNow(user, parseId(id, '订阅 ID'), 'hotspot');
  }

  async listSources(user: CurrentUser, query: Record<string, unknown>) {
    return this.service.listSources(user, query, 'hotspot');
  }

  async saveSource(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.saveSource(user, body, 'hotspot');
  }

  async removeSource(user: CurrentUser, id: string) {
    return this.service.removeSource(user, parseId(id, '数据源 ID'), 'hotspot');
  }

  async listRuns(user: CurrentUser, query: Record<string, unknown>) {
    return this.service.listRuns(user, query, 'hotspot');
  }

  // ---------- 趋势侧采集配置（同一模式与实现，配置按采集目的分开）----------

  async listTrendSubscriptions(user: CurrentUser) {
    return this.service.listSubscriptions(user, 'trend');
  }

  async saveTrendSubscription(
    user: CurrentUser,
    body: Record<string, unknown>,
  ) {
    return this.service.saveSubscription(user, body, 'trend');
  }

  async removeTrendSubscription(user: CurrentUser, id: string) {
    return this.service.removeSubscription(
      user,
      parseId(id, '订阅 ID'),
      'trend',
    );
  }

  async toggleTrendSubscription(
    user: CurrentUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    return this.service.toggleSubscription(
      user,
      parseId(id, '订阅 ID'),
      text(body.status),
      'trend',
    );
  }

  async collectTrendNow(user: CurrentUser, id: string) {
    return this.service.collectNow(user, parseId(id, '订阅 ID'), 'trend');
  }

  async listTrendSources(user: CurrentUser, query: Record<string, unknown>) {
    return this.service.listSources(user, query, 'trend');
  }

  async saveTrendSource(user: CurrentUser, body: Record<string, unknown>) {
    return this.service.saveSource(user, body, 'trend');
  }

  async removeTrendSource(user: CurrentUser, id: string) {
    return this.service.removeSource(user, parseId(id, '数据源 ID'), 'trend');
  }

  async listTrendRuns(user: CurrentUser, query: Record<string, unknown>) {
    return this.service.listRuns(user, query, 'trend');
  }

  listSkills() {
    return this.service.listSkills();
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
