import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { httpRequest, TransportError } from '../http/transport';
import type {
  MiniProgramRuntime,
  MiniProgramSettingsService,
} from './miniprogram.settings';

const API_BASE = (
  process.env.WECHAT_MP_API_BASE || 'https://api.weixin.qq.com'
).replace(/\/+$/, '');
const API_TIMEOUT_MS = 15_000;
const MAX_JSON_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type WxPayload = { errcode?: number; errmsg?: string };

export type WxSession = {
  openId: string;
  unionId: string;
  sessionKey: string;
};

/**
 * 微信小程序 HTTP 客户端：`code2Session`、access_token 单飞缓存与无限制小程序码。
 * 登录与二维码生成都要求 `enabled + 完整凭据`，出站请求只走 httpRequest。
 */
export class MiniProgramClient {
  private readonly tokens = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly settings: MiniProgramSettingsService) {}

  /** wx.login 的 code 换 openId / unionId / session_key。 */
  async code2Session(
    runtime: MiniProgramRuntime,
    jsCode: string,
  ): Promise<WxSession> {
    const code = String(jsCode || '').trim();
    if (!code) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '缺少微信登录 code');
    }
    const query = new URLSearchParams({
      appid: runtime.appId,
      secret: runtime.appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    });
    const data = await this.request<
      WxPayload & { openid?: string; unionid?: string; session_key?: string }
    >(`${API_BASE}/sns/jscode2session?${query.toString()}`, {
      operation: 'miniprogram-code2session',
    });
    const code2 = Number(data.errcode || 0);
    if (code2 !== 0 || !data.openid) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        `微信登录失败（${code2 || '未知'}）${data.errmsg ? `：${data.errmsg}` : ''}，请重试或联系平台管理员核对 AppID / AppSecret`,
      );
    }
    return {
      openId: data.openid,
      unionId: String(data.unionid || ''),
      sessionKey: String(data.session_key || ''),
    };
  }

  /** 用 AppID / AppSecret 取一次 access_token：后台连接自检复用。 */
  async accessToken(runtime: MiniProgramRuntime, force = false) {
    const cached = this.tokens.get(runtime.appId);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = this.pending.get(runtime.appId);
    if (pending) return pending;
    const task = this.fetchAccessToken(runtime).finally(() =>
      this.pending.delete(runtime.appId),
    );
    this.pending.set(runtime.appId, task);
    return task;
  }

  private async fetchAccessToken(runtime: MiniProgramRuntime) {
    const query = new URLSearchParams({
      grant_type: 'client_credential',
      appid: runtime.appId,
      secret: runtime.appSecret,
    });
    const data = await this.request<
      WxPayload & { access_token?: string; expires_in?: number }
    >(`${API_BASE}/cgi-bin/token?${query.toString()}`, {
      operation: 'miniprogram-token',
    });
    if (!data.access_token) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `获取微信 access_token 失败（${data.errcode ?? '未知'}）${data.errmsg ? `：${data.errmsg}` : ''}，请核对 AppID / AppSecret`,
      );
    }
    const ttl = Math.max(Number(data.expires_in || 7200) - 300, 60);
    this.tokens.set(runtime.appId, {
      value: data.access_token,
      expiresAt: Date.now() + ttl * 1000,
    });
    return data.access_token;
  }

  /**
   * 无限制小程序码（`getwxacodeunlimit`）：成功回 PNG 字节，失败回 JSON 错误。
   * 因此按字节读，再按 content-type 分流。
   */
  async unlimitedQrcode(
    runtime: MiniProgramRuntime,
    input: { scene: string; page?: string; envVersion?: string },
    retried = false,
  ): Promise<Buffer> {
    const token = await this.accessToken(runtime, retried);
    let result;
    try {
      result = await httpRequest<Uint8Array>(
        `${API_BASE}/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scene: String(input.scene || 'home').slice(0, 32),
            page: input.page || 'pages/index/index',
            check_path: false,
            env_version: input.envVersion === 'trial' ? 'trial' : 'release',
            width: 430,
          }),
          timeoutMs: API_TIMEOUT_MS,
          readAs: 'bytes',
          maxBytes: MAX_IMAGE_BYTES,
          operation: 'miniprogram-qrcode',
        },
      );
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        error instanceof TransportError && error.kind === 'timeout'
          ? '微信接口响应超时，请稍后重试'
          : '连接微信接口失败，请检查服务器网络',
      );
    }
    const contentType = result.headers.get('content-type') || '';
    const bytes = Buffer.from(result.data || new Uint8Array());
    if (
      contentType.includes('image') ||
      bytes.subarray(0, 2).toString() === 'ÿØ'
    ) {
      return bytes;
    }
    const payload = this.decodeJson(bytes);
    const code = Number(payload.errcode || 0);
    if (!retried && [40001, 40014, 42001].includes(code)) {
      this.tokens.delete(runtime.appId);
      return this.unlimitedQrcode(runtime, input, true);
    }
    throw new BusinessException(
      ErrorCode.SERVICE_UNAVAILABLE,
      `生成小程序码失败（${code || '未知'}）${payload.errmsg ? `：${payload.errmsg}` : ''}`,
    );
  }

  private async request<T>(
    url: string,
    options: { operation: string },
  ): Promise<T> {
    let result;
    try {
      result = await httpRequest<T>(url, {
        method: 'GET',
        timeoutMs: API_TIMEOUT_MS,
        readAs: 'json',
        maxBytes: MAX_JSON_BYTES,
        operation: options.operation,
      });
    } catch (error) {
      if (error instanceof BusinessException) throw error;
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        error instanceof TransportError && error.kind === 'timeout'
          ? '微信接口响应超时，请稍后重试'
          : '连接微信接口失败，请检查服务器网络',
      );
    }
    if (!result.ok) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `微信接口暂不可用（HTTP ${result.status}）`,
      );
    }
    return (result.data || {}) as T;
  }

  private decodeJson(bytes: Buffer): WxPayload {
    try {
      return JSON.parse(bytes.toString('utf8')) as WxPayload;
    } catch {
      return {};
    }
  }
}
