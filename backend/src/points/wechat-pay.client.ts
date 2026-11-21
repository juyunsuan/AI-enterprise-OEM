import {
  createDecipheriv,
  createSign,
  randomBytes,
  verify as rsaVerify,
  X509Certificate,
} from 'node:crypto';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { text } from '../common/api';
import { httpRequest } from '../http/transport';

const HOST = 'https://api.mch.weixin.qq.com';
/** 平台证书缓存：拉取一次用 12 小时（微信官方建议 24h 内定时刷新，取保守值）。 */
const CERT_TTL_MS = 12 * 3600_000;

export type WechatCredentials = {
  appId: string;
  mchId: string;
  apiv3Key: string;
  certSerial: string;
  privateKey: string;
  notifyUrl: string;
  configured: boolean;
};

export type WechatTransaction = {
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  amount?: { total?: number; payer_total?: number; currency?: string };
  success_time?: string;
};

/** RSA-SHA256 请求签名（v3 Authorization 头）。 */
function signRequest(
  credentials: WechatCredentials,
  method: string,
  urlPath: string,
  body: string,
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const sign = createSign('RSA-SHA256');
  sign.update(message);
  const signature = sign.sign(credentials.privateKey, 'base64');
  return [
    `WECHATPAY2-SHA256-RSA2048 mchid="${credentials.mchId}",`,
    `nonce_str="${nonce}",`,
    `signature="${signature}",`,
    `timestamp="${timestamp}",`,
    `serial_no="${credentials.certSerial}"`,
  ].join('');
}

/** APIv3 密钥对称解密（回调 resource 与平台证书列表同一种密文格式）。 */
export function decryptApiV3(
  apiv3Key: string,
  associatedData: string,
  nonce: string,
  ciphertext: string,
): string {
  const key = Buffer.from(apiv3Key, 'utf8');
  if (key.length !== 32) {
    throw new BusinessException(
      ErrorCode.SERVICE_UNAVAILABLE,
      '微信支付 APIv3 密钥长度不正确（应为 32 字符）',
    );
  }
  const data = Buffer.from(ciphertext, 'base64');
  const authTag = data.subarray(data.length - 16);
  const body = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(nonce, 'utf8'),
  );
  decipher.setAuthTag(authTag);
  if (associatedData) decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    'utf8',
  );
}

/**
 * 回调时间戳是否落在防重放窗口内（默认 ±5 分钟，与 `WechatPayClient.parseNotify`
 * 同一口径）。公开回调路由只把密文交给业务层、拿不到完整 rawBody 时，可用它先把
 * 重放包挡在解密之前。
 */
export function notifyTimestampOk(
  timestamp: string,
  toleranceSec = 300,
): boolean {
  const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
  return Number.isFinite(skew) && skew <= toleranceSec;
}

/**
 * JSAPI 调起签名：把 `prepay_id` 组装成小程序 `wx.requestPayment` 需要的五个参数。
 * 纯本地签名、不打网络，所以做成模块级助手，让各私域业务域共用一份实现。
 */
export function buildJsapiPayParams(
  credentials: WechatCredentials,
  prepayId: string,
): {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
} {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomBytes(16).toString('hex').toUpperCase();
  const packageValue = `prepay_id=${prepayId}`;
  const sign = createSign('RSA-SHA256');
  // 微信 JSAPI 调起签名串：appId\n时间戳\n随机串\npackage\n
  sign.update(
    `${credentials.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`,
  );
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign: sign.sign(credentials.privateKey, 'base64'),
  };
}

/**
 * 微信支付 APIv3 精简客户端：Native 扫码 / H5 下单、查单、关单、
 * 平台证书下载缓存与回调验签。凭据由管理后台配置（密文存 point_settings）。
 */
export class WechatPayClient {
  private certCache: Map<string, X509Certificate> = new Map();
  private certFetchedAt = 0;

  private async call(
    credentials: WechatCredentials,
    method: 'GET' | 'POST',
    urlPath: string,
    body?: Record<string, unknown>,
    operation = 'wechat:pay',
    timeoutMs = 15000,
  ) {
    const payload = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = {
      Authorization: signRequest(credentials, method, urlPath, payload),
      Accept: 'application/json',
    };
    if (payload) headers['Content-Type'] = 'application/json';
    const response = await httpRequest<string>(`${HOST}${urlPath}`, {
      method,
      headers,
      body: payload || undefined,
      timeoutMs,
      readAs: 'text',
      operation,
    });
    if (!response.ok) {
      let detail = '';
      try {
        const parsed = JSON.parse(response.data || '{}') as {
          message?: unknown;
        };
        detail = text(parsed.message).slice(0, 200);
      } catch {
        // 非 JSON 错误体按状态码提示
      }
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `微信支付接口失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`,
      );
    }
    return JSON.parse(response.data || '{}') as Record<string, unknown>;
  }

  /** Native 下单：返回 code_url（转二维码给 PC 端扫码）。 */
  async native(
    credentials: WechatCredentials,
    order: {
      outTradeNo: string;
      description: string;
      amountCents: number;
      notifyUrl: string;
    },
  ) {
    const data = await this.call(
      credentials,
      'POST',
      '/v3/pay/transactions/native',
      {
        appid: credentials.appId,
        mchid: credentials.mchId,
        description: order.description.slice(0, 120),
        out_trade_no: order.outTradeNo,
        notify_url: order.notifyUrl,
        amount: { total: order.amountCents, currency: 'CNY' },
      },
    );
    return text(data.code_url);
  }

  /** H5 下单：返回 h5_url（移动端浏览器跳转）。 */
  async h5(
    credentials: WechatCredentials,
    order: {
      outTradeNo: string;
      description: string;
      amountCents: number;
      notifyUrl: string;
      clientIp: string;
    },
  ) {
    const data = await this.call(
      credentials,
      'POST',
      '/v3/pay/transactions/h5',
      {
        appid: credentials.appId,
        mchid: credentials.mchId,
        description: order.description.slice(0, 120),
        out_trade_no: order.outTradeNo,
        notify_url: order.notifyUrl,
        amount: { total: order.amountCents, currency: 'CNY' },
        scene_info: {
          payer_client_ip: order.clientIp,
          h5_info: { type: 'Wap' },
        },
      },
    );
    return text(data.h5_url);
  }

  /** JSAPI 下单（微信小程序内支付）：返回 prepay_id，由业务侧组装调起签名。 */
  async jsapi(
    credentials: WechatCredentials,
    order: {
      outTradeNo: string;
      description: string;
      amountCents: number;
      openid: string;
    },
  ) {
    const data = await this.call(
      credentials,
      'POST',
      '/v3/pay/transactions/jsapi',
      {
        appid: credentials.appId,
        mchid: credentials.mchId,
        description: order.description.slice(0, 120),
        out_trade_no: order.outTradeNo,
        notify_url: credentials.notifyUrl,
        amount: { total: order.amountCents, currency: 'CNY' },
        payer: { openid: order.openid },
      },
      'wechat:jsapi',
    );
    return text(data.prepay_id);
  }

  /**
   * 商家转账到零钱（批量）。只返回批次号；实际到账以微信批次结果为准。
   * 需要商户在微信支付商户平台开通「商家转账到零钱」权限，否则微信会返回无权限错误。
   */
  async transferBatch(
    credentials: WechatCredentials,
    input: {
      appId: string;
      outBatchNo: string;
      batchName: string;
      batchRemark: string;
      totalAmount: number;
      details: Array<{
        outDetailNo: string;
        amount: number;
        remark: string;
        openid: string;
      }>;
      notifyUrl?: string;
    },
  ) {
    const data = await this.call(
      credentials,
      'POST',
      '/v3/transfer/batches',
      {
        appid: input.appId,
        out_batch_no: input.outBatchNo.slice(0, 32),
        batch_name: input.batchName.slice(0, 32),
        batch_remark: input.batchRemark.slice(0, 32),
        total_amount: Math.max(1, Math.round(input.totalAmount)),
        total_num: input.details.length,
        transfer_detail_list: input.details.map((item) => ({
          out_detail_no: item.outDetailNo.slice(0, 32),
          transfer_amount: Math.max(1, Math.round(item.amount)),
          transfer_remark: item.remark.slice(0, 32),
          openid: item.openid,
        })),
        ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
      },
      'wechat:transfer',
    );
    return {
      batchId: text(data.batch_id),
      createTime: text(data.create_time),
    };
  }

  /**
   * 退款（原路退回）。金额单位是分；同一 `out_refund_no` 重复提交微信按幂等处理，
   * 所以业务侧只要固定「退款单号」就能安全重试。
   *
   * **只有微信回 `status: SUCCESS` 才算退款成功**。这一步必须收在客户端里：
   * 各业务域原先按「HTTP 200 且拿到 refund_id」就直接把售后单写成已退款，
   * 而 `CHANGE / ABNORMAL / PROCESSING` 也是 200——钱没退出去，账上却已经退完，
   * 顾客来追问时两边记录都对不上，而且没有回调路由能自愈。
   * 不是 SUCCESS 一律抛错，业务侧的「已退款」写入根本不会发生；
   * 调用方重试时用的是同一个 `out_refund_no`，微信那边幂等，不会退两笔。
   */
  async refund(
    credentials: WechatCredentials,
    input: {
      outTradeNo: string;
      outRefundNo: string;
      reason: string;
      totalCents: number;
      refundCents: number;
      /** 可选：退款接口比下单慢，业务域需要更长超时窗口时传入（默认 15s）。 */
      timeoutMs?: number;
    },
  ) {
    const data = await this.call(
      credentials,
      'POST',
      '/v3/refund/domestic/refunds',
      {
        out_trade_no: input.outTradeNo,
        out_refund_no: input.outRefundNo,
        reason: input.reason.slice(0, 80),
        // 退款回调可选：站点域名还没配的店主也必须能退款。本仓暂无退款回调路由，
        // 所以只有配了域名才带 notify_url；没配就按同步返回判定（见上面 status 口径）。
        ...(credentials.notifyUrl ? { notify_url: credentials.notifyUrl } : {}),
        amount: {
          refund: input.refundCents,
          total: input.totalCents,
          currency: 'CNY',
        },
      },
      'wechat:refund',
      input.timeoutMs,
    );
    const refundId = text(data.refund_id);
    const status = text(data.status);
    // 只认 SUCCESS：`PROCESSING`（还在处理）与 `ABNORMAL / CHANGE` 一样**不算退成功**。
    // 业务域因此停在「已同意退款」，操作员用同一个 out_refund_no 重试时微信侧幂等，
    // 最终要么回 SUCCESS 落账、要么一直不落——不会出现「账上已退、顾客没收到钱」。
    // 状态缺失同样按未完成处理：连状态都没有的回包，不足以支撑把钱记成已退。
    if (status !== 'SUCCESS') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `微信退款未完成（状态 ${status || '未返回'}${refundId ? `，退款单 ${refundId}` : ''}），本单尚未退成功。请稍后用同一退款单号重试，或在微信商户平台核对该笔退款`,
      );
    }
    return {
      refundId,
      status,
    };
  }

  /**
   * 按商户退款单号查退款状态。
   *
   * 有了它，「退款受理中」才是可收敛的状态而不是悬案：需要时（人工对账、
   * 或以后加定时轮询）按 `out_refund_no` 直接问微信，不用猜。
   */
  async refundQuery(
    credentials: WechatCredentials,
    outRefundNo: string,
  ): Promise<{ refundId: string; status: string }> {
    const data = await this.call(
      credentials,
      'GET',
      `/v3/refund/domestic/out-refund-no/${encodeURIComponent(outRefundNo)}`,
      undefined,
      'wechat:refund-query',
    );
    return {
      refundId: text(data.refund_id),
      status: text(data.status),
    };
  }

  /** 商户订单号查单（前端轮询与回调丢失兜底）。 */
  async query(credentials: WechatCredentials, outTradeNo: string) {
    const urlPath = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${credentials.mchId}`;
    return (await this.call(
      credentials,
      'GET',
      urlPath,
      undefined,
      'wechat:query',
    )) as WechatTransaction;
  }

  /** 关单（超时未支付订单回收）。 */
  async close(credentials: WechatCredentials, outTradeNo: string) {
    await this.call(
      credentials,
      'POST',
      `/v3/pay/transactions/out-trade-no/${outTradeNo}/close`,
      { mchid: credentials.mchId },
      'wechat:close',
    );
  }

  /** 平台证书列表：下载 + APIv3 解密 + 按序列号缓存，供回调验签。 */
  private async loadCertificates(credentials: WechatCredentials) {
    if (this.certCache.size && Date.now() - this.certFetchedAt < CERT_TTL_MS) {
      return this.certCache;
    }
    const data = await this.call(
      credentials,
      'GET',
      '/v3/certificates',
      undefined,
      'wechat:certs',
    );
    const list = Array.isArray(data?.list)
      ? (data.list as Record<string, unknown>[])
      : [];
    const next = new Map<string, X509Certificate>();
    for (const item of list) {
      const encrypt = (item?.encrypt_certificate || {}) as Record<
        string,
        unknown
      >;
      const pem = decryptApiV3(
        credentials.apiv3Key,
        text(encrypt.associated_data),
        text(encrypt.nonce),
        text(encrypt.ciphertext),
      );
      const serial = text(item?.serial_no);
      if (serial && pem.includes('BEGIN CERTIFICATE')) {
        next.set(serial, new X509Certificate(pem));
      }
    }
    if (!next.size) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '微信支付平台证书获取失败：返回列表为空',
      );
    }
    this.certCache = next;
    this.certFetchedAt = Date.now();
    return next;
  }

  /**
   * 回调处理：验签（平台证书公钥）→ 解密 resource → 返回交易明文。
   * 验签不过直接抛错，调用方按微信规范回 4xx/5xx 让其重试。
   */
  async parseNotify(
    credentials: WechatCredentials,
    headers: Record<string, string>,
    rawBody: string,
  ): Promise<WechatTransaction> {
    const certs = await this.loadCertificates(credentials);
    const serial = headers['wechatpay-serial'] || '';
    const nonce = headers['wechatpay-nonce-str'] || '';
    const timestamp = headers['wechatpay-timestamp'] || '';
    const signature = headers['wechatpay-signature'] || '';
    const cert = certs.get(serial) || [...certs.values()][0];
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const verified = rsaVerify(
      'RSA-SHA256',
      Buffer.from(message, 'utf8'),
      cert.publicKey,
      Buffer.from(signature, 'base64'),
    );
    if (!verified) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '微信支付回调验签失败',
      );
    }
    // 时间戳容差 5 分钟，防重放
    if (!notifyTimestampOk(timestamp)) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '微信支付回调时间戳异常',
      );
    }
    const payload = JSON.parse(rawBody || '{}') as Record<string, unknown>;
    const resource = (payload?.resource || {}) as Record<string, unknown>;
    const plain = decryptApiV3(
      credentials.apiv3Key,
      text(resource.associated_data),
      text(resource.nonce),
      text(resource.ciphertext),
    );
    return JSON.parse(plain) as WechatTransaction;
  }

  /** 测试连接：下载平台证书验证五项配置与签名链路（不产生交易）。 */
  async testConnection(credentials: WechatCredentials) {
    const certs = await this.loadCertificates(credentials);
    return { certificates: certs.size, serials: [...certs.keys()] };
  }
}
