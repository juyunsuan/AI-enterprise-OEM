import { endpoints } from "@enterprise/contracts";
import { endpoint } from "@/api/endpoint";

/**
 * AI 调用账号界面层：给所有类型的 Agent-Bot（BotBuddy 主机 / MoBot 手机 /
 * WorkBuddy 企业云）准备第三方平台凭据库；凭据按「设备主体」绑定授权，
 * 一台设备可绑多份凭据、一份凭据也可授权给多台设备，两个方向各有入口。
 * 后端：/enterprise/ai-call/*（登录态）与 /api/v1/ai-call/*（API Key 机器通道）；
 * 主机 / 手机还有 x-bot-token 设备通道 /api/public/{bot-host,mobot}/ai-call/*。
 */

/** 绑定主体类型：与后端 AI_CALL_PRINCIPAL_KINDS 同口径。 */
export type AiCallPrincipalKind = "DESKTOP" | "MOBOT" | "WORKBUDDY";

export const AI_CALL_PRINCIPAL_LABEL: Record<AiCallPrincipalKind, string> = {
  DESKTOP: "BotBuddy 主机",
  MOBOT: "MoBot 手机",
  WORKBUDDY: "WorkBuddy 企业账号",
};

export type AiCallBinding = {
  principalKind: AiCallPrincipalKind;
  principalId: number;
  name: string;
};

/** 设备主体的选项键：`kind:principalId`，与绑定表的复合唯一键同构。 */
export function agentKey(kind: AiCallPrincipalKind, principalId: number) {
  return `${kind}:${principalId}`;
}

export function parseAgentKey(key: string): {
  kind: AiCallPrincipalKind;
  principalId: number;
} {
  const index = key.indexOf(":");
  return {
    kind: key.slice(0, index) as AiCallPrincipalKind,
    principalId: Number(key.slice(index + 1)),
  };
}

export type AiCallAccount = {
  id: number;
  createdBy: string;
  name: string;
  platform: string;
  loginUrl: string;
  username: string;
  extra: Record<string, unknown>;
  status: string;
  notes: string;
  hasPassword: boolean;
  hasApiKey: boolean;
  hasCookie: boolean;
  bindings: AiCallBinding[];
  createdAt: string;
  updatedAt: string;
};

const accountsApi = endpoint(endpoints.AiCall_accounts);
const createAccountApi = endpoint(endpoints.AiCall_createAccount);
const updateAccountApi = endpoint(endpoints.AiCall_updateAccount);
const deleteAccountApi = endpoint(endpoints.AiCall_removeAccount);
const bindingsApi = endpoint(endpoints.AiCall_bindings);
const saveBindingsApi = endpoint(endpoints.AiCall_saveBindings);
const saveAccountAgentsApi = endpoint(endpoints.AiCall_saveAccountAgents);

async function load<T>(work: Promise<unknown>): Promise<{
  data: T | null;
  message: string;
}> {
  try {
    return { data: (await work) as T, message: "" };
  } catch (error) {
    return { data: null, message: (error as Error).message || "加载失败" };
  }
}

async function mutate<T>(work: Promise<unknown>): Promise<T> {
  return (await work) as T;
}

export const aiCallApi = {
  accounts: () => load<AiCallAccount[]>(accountsApi({})),
  createAccount: (body: Record<string, unknown>) =>
    mutate<AiCallAccount>(createAccountApi({ body })),
  updateAccount: (id: number, body: Record<string, unknown>) =>
    mutate<AiCallAccount>(updateAccountApi({ params: { id: String(id) }, body })),
  deleteAccount: (id: number) =>
    mutate<{ id: number }>(deleteAccountApi({ params: { id: String(id) } })),
  /** 某台设备（主机 / 手机 / WorkBuddy 账号）已绑定的凭据库账号 id。 */
  bindings: (kind: AiCallPrincipalKind, principalId: number) =>
    load<{ accountIds: number[] }>(
      bindingsApi({ query: { kind, principalId: String(principalId) } }),
    ),
  /** 整组替换某台设备的绑定清单（空数组＝全部解绑）。 */
  saveBindings: (
    kind: AiCallPrincipalKind,
    principalId: number,
    accountIds: number[],
  ) =>
    mutate<{ accountIds: number[] }>(
      saveBindingsApi({ body: { kind, principalId, accountIds } }),
    ),
  /** 反向：整组替换某个凭据授权给的 Agent 清单，一份凭据可同时给多台主机 / 手机 / 企云账号用。 */
  saveAccountAgents: (
    id: number,
    bindings: { kind: AiCallPrincipalKind; principalId: number }[],
  ) =>
    mutate<AiCallAccount>(
      saveAccountAgentsApi({
        params: { id: String(id) },
        body: { bindings },
      }),
    ),
};

export const AI_CALL_STATUS_LABEL: Record<string, string> = {
  active: "启用",
  disabled: "停用",
};

export const AI_CALL_STATUS_OPTIONS = Object.entries(
  AI_CALL_STATUS_LABEL,
).map(([value, label]) => ({ value, label }));

/** 其他字段：一行一条 `键: 值`，存成后端 extra 的键值对。 */
export function extraLines(extra: Record<string, unknown> | undefined) {
  return Object.entries(extra || {})
    .map(([key, value]) => `${key}: ${String(value ?? "")}`)
    .join("\n");
}

export function parseExtraLines(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const index = line.search(/[:：]/);
      if (index < 0) return;
      const key = line.slice(0, index).trim();
      if (key) result[key] = line.slice(index + 1).trim();
    });
  return result;
}
