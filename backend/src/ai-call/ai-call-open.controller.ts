import { ok } from '../common/api';
import { parseId } from '../common/parse-id';
import { CurrentUser } from '../auth/current-user';
import {
  AiCallAccountService,
  type AiCallPrincipalKind,
} from './ai-call-account.service';

/**
 * AI 调用账号机器通道（x-api-key）。
 *
 * AWBotDSH 主机 / AWBot 手机 / WorkBuddy 云端 Agent 凭本系统 API Key（ek_）调用，
 * 每次都要声明自己是谁：`kind`＝DESKTOP / AWBOT / WORKBUDDY，`agentId`＝该设备的主体 ID。
 * 严格按「Agent 绑定账号」放行：只有绑定给该设备的 AI 调用账号才列得出来、才取得到明文凭据。
 *
 * 列表不含任何明文；明文只在 `GET /:id/credentials` 解密一次并记审计。
 */
export class AiCallOpenController {
  constructor(private readonly accounts: AiCallAccountService) {}

  async list(
    user: CurrentUser,
    query: { kind: AiCallPrincipalKind; agentId: number; platform?: string },
  ) {
    return ok(
      await this.accounts.openList(
        user,
        query.kind,
        query.agentId,
        query.platform,
      ),
    );
  }

  async credentials(
    user: CurrentUser,
    id: string,
    query: { kind: AiCallPrincipalKind; agentId: number },
  ) {
    return ok(
      await this.accounts.openCredentials(
        user,
        parseId(id, '账号 ID'),
        query.kind,
        query.agentId,
      ),
    );
  }
}
