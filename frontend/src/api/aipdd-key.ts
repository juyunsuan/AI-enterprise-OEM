import { apiEnvelope, z } from "@enterprise/contracts";
import { http, type HttpOptions } from "./http";

/**
 * AIPDD APIKey 绑定接口（/enterprise/account/aipdd-key，N:1）：
 * 开源版本地能力，未纳入统一 contracts 生成表，直接用底层 http() + 宽松信封校验。
 */
const BASE = "/api/backend/enterprise/account";

export interface AipddKeyBinding {
  bindingId: number;
  keyId: number;
  /** 脱敏串（sk-****abcd），永不回显原文。 */
  masked: string;
  aipddUserId: string;
  profile?: { username?: string; nickName?: string; avatar?: string } | null;
  boundAt: string;
  lastVerifiedAt: string | null;
  status: string;
  /** 同一把上游 Key 被多少个本地用户绑定。 */
  sharedWith: number;
  /** 主 Key：模型/计费调用使用最早绑定的可用 Key。 */
  primary: boolean;
}

export interface AipddKeyStatus {
  bound: boolean;
  /** 已绑定时的脱敏串（主 Key），永不回显原文。 */
  masked?: string;
  aipddUserId?: string;
  profile?: { username?: string; nickName?: string; avatar?: string } | null;
  boundAt?: string;
  lastVerifiedAt?: string | null;
  /** 同一把上游 Key 被多少个本地用户绑定。 */
  sharedWith?: number;
  /** 当前账号的全部绑定（含已失效，便于逐个解绑）。 */
  keys?: AipddKeyBinding[];
  /** 上游官网地址（引导注册用）。 */
  registerUrl: string;
  /** 管理员在站点设置配置的 AIPDD 推荐码；空串＝未配置，不展示引导。 */
  referralCode: string;
}

const statusSchema = apiEnvelope(z.unknown());

async function call<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const result = await http(path, statusSchema, options);
  return result.data.data as T;
}

export const aipddKeyApi = {
  status: (options?: HttpOptions) =>
    call<AipddKeyStatus>(`${BASE}/aipdd-key`, { ...options }),
  bind: (key: string, options?: HttpOptions) =>
    call<AipddKeyStatus>(`${BASE}/aipdd-key`, {
      ...options,
      method: "PUT",
      body: { key },
    }),
  unbind: (keyId?: number, options?: HttpOptions) =>
    call<{ unbound: boolean; count: number }>(
      `${BASE}/aipdd-key${keyId ? `?keyId=${encodeURIComponent(keyId)}` : ""}`,
      {
        ...options,
        method: "DELETE",
      },
    ),
};
