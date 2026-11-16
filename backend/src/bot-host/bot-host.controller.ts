import { CurrentUser } from '../auth/current-user';
import { ok } from '../common/api';
import { BotHostService } from './bot-host.service';

/**
 * Bot 主机的界面侧接口（登录态）：主机台账 / 对话下发 / 定时任务。
 * 客户端通道（免登录、只认主机令牌）在 bot-host.public.ts，不从这里出。
 */
export class BotHostController {
  constructor(private readonly hosts: BotHostService) {}

  async list(user: CurrentUser, query?: Record<string, unknown>) {
    return ok(await this.hosts.list(user, query?.kind));
  }

  async pair(user: CurrentUser, body: Record<string, unknown>) {
    return ok(await this.hosts.pair(user, body));
  }

  async setStatus(
    user: CurrentUser,
    hostId: string,
    body: Record<string, unknown>,
  ) {
    return ok(await this.hosts.setStatus(user, hostId, body.enabled !== false));
  }

  async remove(user: CurrentUser, hostId: string) {
    return ok(await this.hosts.remove(user, hostId));
  }

  async rotateToken(user: CurrentUser, hostId: string) {
    return ok(await this.hosts.rotateToken(user, hostId));
  }

  async channels(user: CurrentUser, hostId: string) {
    return ok(await this.hosts.channels(user, hostId));
  }

  async workspaces(user: CurrentUser, hostId: string) {
    return ok(await this.hosts.workspaces(user, hostId));
  }

  async modelGrant(user: CurrentUser, hostId: string) {
    return ok(await this.hosts.modelGrant(user, hostId));
  }

  async saveModelGrant(
    user: CurrentUser,
    hostId: string,
    body: Record<string, unknown>,
  ) {
    return ok(await this.hosts.saveModelGrant(user, hostId, body));
  }

  async removeModelGrant(user: CurrentUser, hostId: string) {
    return ok(await this.hosts.removeModelGrant(user, hostId));
  }

  async conversation(user: CurrentUser, hostId: string) {
    return ok(await this.hosts.conversation(user, hostId));
  }

  async send(user: CurrentUser, hostId: string, body: Record<string, unknown>) {
    return ok(await this.hosts.send(user, hostId, body));
  }

  async cancel(user: CurrentUser, commandCode: string) {
    return ok(await this.hosts.cancel(user, commandCode));
  }

  async schedules(user: CurrentUser) {
    return ok(await this.hosts.schedules(user));
  }

  async createSchedule(user: CurrentUser, body: Record<string, unknown>) {
    return ok(await this.hosts.createSchedule(user, body));
  }

  async updateSchedule(
    user: CurrentUser,
    id: string,
    body: Record<string, unknown>,
  ) {
    return ok(await this.hosts.updateSchedule(user, id, body));
  }

  async removeSchedule(user: CurrentUser, id: string) {
    return ok(await this.hosts.removeSchedule(user, id));
  }

  async runSchedule(user: CurrentUser, id: string) {
    return ok(await this.hosts.runSchedule(user, id));
  }

  async scheduleRuns(user: CurrentUser, id: string) {
    return ok(await this.hosts.scheduleRuns(user, id));
  }
}
