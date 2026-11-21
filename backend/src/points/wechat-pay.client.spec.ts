import { generateKeyPairSync } from 'node:crypto';
import { BusinessException } from '../common/business.exception';

/**
 * 统一微信支付客户端。这里钉的是**退款状态口径**，它是本轮收口里最贵的一条：
 *
 * 五个业务域原先都按「HTTP 200 且拿到 refund_id」把售后单写成已退款。可微信的
 * `PROCESSING / ABNORMAL / CHANGE` 同样是 200——钱没出去，账上却已经退完，
 * 而本仓没有退款回调路由，事后没有任何机制会把它纠正回来。
 * 现在只有 `status === 'SUCCESS'` 才算成功；缺状态也按未完成处理，宁可不落账。
 *
 * 重试是安全的：退款单号 `out_refund_no` 由业务侧固定，微信侧按它幂等。
 */

jest.mock('../http/transport', () => ({
  httpRequest: jest.fn(),
}));

import { httpRequest } from '../http/transport';
import { WechatPayClient } from './wechat-pay.client';
import type { WechatCredentials } from './wechat-pay.client';

const mockedHttp = httpRequest as unknown as jest.Mock;

// 请求签名走真实 RSA：用一次性生成的密钥对，签名逻辑本身不是这里的被测点
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

// 用真实类型标注：字段少一个或名字写错，tsc 就会在这里拦下，而不是到运行期才炸
const credentials: WechatCredentials = {
  appId: 'wx-app',
  mchId: '1900000109',
  apiv3Key: 'a'.repeat(32),
  certSerial: 'SERIAL',
  privateKey,
  notifyUrl: 'https://shop.example/api/public/brand-mall/pay/notify/3',
  configured: true,
};

function reply(body: Record<string, unknown>) {
  mockedHttp.mockResolvedValue({
    ok: true,
    status: 200,
    data: JSON.stringify(body),
  });
}

const refundInput = {
  outTradeNo: 'O202611190001',
  outRefundNo: 'RF202611190001',
  reason: '买家申请退款',
  totalCents: 19900,
  refundCents: 19900,
};

describe('WechatPayClient.refund 状态口径', () => {
  beforeEach(() => mockedHttp.mockReset());

  it('SUCCESS 才算成功，并回退款单号', async () => {
    reply({ refund_id: '5000000385202611190000000001', status: 'SUCCESS' });
    const result = await new WechatPayClient().refund(credentials, refundInput);
    expect(result).toEqual({
      refundId: '5000000385202611190000000001',
      status: 'SUCCESS',
    });
  });

  it.each([
    ['PROCESSING', '还在处理'],
    ['ABNORMAL', '退款异常'],
    ['CHANGE', '已转零钱异常'],
    ['', '状态缺失'],
  ])(
    'status=%s（%s）一律抛错：业务侧不会把没退成功的单子写成已退款',
    async (status) => {
      reply({ refund_id: '5000000385202611190000000002', status });
      await expect(
        new WechatPayClient().refund(credentials, refundInput),
      ).rejects.toBeInstanceOf(BusinessException);
      let message = '';
      try {
        await new WechatPayClient().refund(credentials, refundInput);
      } catch (error) {
        message = error instanceof Error ? error.message : '';
      }
      expect(message).toContain('微信退款未完成');
      // 文案要带状态与微信退款单号，操作员才知道去商户平台核哪一笔
      expect(message).toContain('5000000385202611190000000002');
      expect(message).toContain(status || '未返回');
    },
  );

  it('不带 notifyUrl 时不提交 notify_url（域名没配的店主也必须能退款）', async () => {
    reply({ refund_id: 'r1', status: 'SUCCESS' });
    const withoutNotify = { ...credentials, notifyUrl: '' };
    await new WechatPayClient().refund(withoutNotify, refundInput);
    const [, options] = mockedHttp.mock.calls[0];
    expect(JSON.parse(String(options.body))).not.toHaveProperty('notify_url');
  });

  it('带 notifyUrl 时按原样提交（有回调路由的部署保持既有行为）', async () => {
    reply({ refund_id: 'r1', status: 'SUCCESS' });
    await new WechatPayClient().refund(credentials, refundInput);
    const [, options] = mockedHttp.mock.calls[0];
    expect(JSON.parse(String(options.body)).notify_url).toBe(
      credentials.notifyUrl,
    );
  });
});

describe('WechatPayClient.refundQuery', () => {
  beforeEach(() => mockedHttp.mockReset());

  it('按商户退款单号查状态：GET 到 out-refund-no 路径并回 status', async () => {
    mockedHttp.mockResolvedValue({
      ok: true,
      status: 200,
      data: JSON.stringify({
        refund_id: '5000000385202611190000000003',
        status: 'SUCCESS',
      }),
    });
    const result = await new WechatPayClient().refundQuery(
      credentials,
      'RF202611190001',
    );
    expect(result).toEqual({
      refundId: '5000000385202611190000000003',
      status: 'SUCCESS',
    });
    const [url, options] = mockedHttp.mock.calls[0];
    expect(String(url)).toContain(
      '/v3/refund/domestic/out-refund-no/RF202611190001',
    );
    expect(options.method).toBe('GET');
  });

  it('查不到（HTTP 404）时如实抛错，不返回「当作成功」的空值', async () => {
    mockedHttp.mockResolvedValue({
      ok: false,
      status: 404,
      data: JSON.stringify({ message: 'RESOURCE_NOT_FOUND' }),
    });
    await expect(
      new WechatPayClient().refundQuery(credentials, 'RF-NOT-EXIST'),
    ).rejects.toThrow(/微信支付接口失败/);
  });
});
