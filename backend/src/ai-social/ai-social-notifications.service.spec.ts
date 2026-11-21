jest.mock('../http/transport', () => ({ httpRequest: jest.fn() }));

import { httpRequest } from '../http/transport';
import type { AipddKeyService } from '../account/aipdd-key.service';
import { stub } from '../../test/doubles';
import { AiSocialNotificationsService } from './ai-social-notifications.service';

const mocked = httpRequest as jest.MockedFunction<typeof httpRequest>;

type Binding = {
  keyId: number;
  aipddUserId: string;
  plain: string;
  boundAt: Date;
};

function keysOf(bindings: Binding[]): AipddKeyService {
  return stub<AipddKeyService>({
    activeBindings: jest.fn().mockResolvedValue(bindings),
  });
}

const envelope = (data: unknown) => ({
  status: 200,
  ok: true,
  headers: new Headers(),
  data: { code: 0, message: 'ok', data },
});

function upstream(list: unknown[]) {
  mocked.mockImplementation(async (url) => {
    const target = String(url);
    if (target.includes('/unread-count')) return envelope({ count: 2 });
    if (target.includes('/read-all')) return envelope({ updated: 3 });
    if (target.includes('/read')) return envelope({ read: true });
    return envelope({ list });
  });
}

const row = {
  id: 'n-1',
  title: '新私信',
  content: '你好',
  actionTarget: '/mail',
  eventType: 'NEW_MAIL',
  sourceId: 'm-1',
  readAt: null,
  createdAt: '2026-11-21T00:00:00.000Z',
};

beforeEach(() => {
  mocked.mockReset();
  process.env.AIWORKIN_BASE_URL = 'https://api.aiworkin.test';
  process.env.AIWORKIN_WEB_URL = 'https://www.aiworkin.test';
  process.env.AIWORKIN_WEB_LOCALE = 'cn';
});

describe('AiSocialNotificationsService 多 Key 聚合', () => {
  it('同一账号多把 Key 只按最新 Key 拉一次；不同账号分别拉取并去重', async () => {
    upstream([row]);
    const service = new AiSocialNotificationsService(
      keysOf([
        {
          keyId: 1,
          aipddUserId: 'a',
          plain: 'k1',
          boundAt: new Date('2026-01-01'),
        },
        {
          keyId: 2,
          aipddUserId: 'a',
          plain: 'k2',
          boundAt: new Date('2026-02-01'),
        },
        {
          keyId: 3,
          aipddUserId: 'b',
          plain: 'k3',
          boundAt: new Date('2026-03-01'),
        },
      ]),
    );
    const data = await service.snapshot('u-1');
    expect(data.available).toBe(true);
    expect(data.rows).toHaveLength(2);
    expect(data.rows.map((item) => item.externalId).sort()).toEqual([
      '2:n-1',
      '3:n-1',
    ]);
    expect(data.unread).toBe(4);
    expect(data.rows[0].link).toBe('https://www.aiworkin.test/cn/mail');
    expect(data.rows[0].body).toBe('你好');
    // 账号 a 只用最新 Key（k2），账号 b 用 k3；每个账号列表 + 未读数各一次。
    const auths = mocked.mock.calls.map((call) =>
      String((call[1]?.headers as Record<string, unknown>)?.authorization),
    );
    expect(auths).toContain('Bearer k2');
    expect(auths).toContain('Bearer k3');
    expect(auths).not.toContain('Bearer k1');
    expect(mocked).toHaveBeenCalledTimes(4);
  });

  it('同一账号最新 Key 失效时回退到更早的可用 Key', async () => {
    mocked.mockImplementation(async (url) => {
      const target = String(url);
      const auth = String(
        (
          (
            mocked.mock.calls.at(-1)?.[1] as {
              headers?: Record<string, unknown>;
            }
          )?.headers || {}
        ).authorization,
      );
      if (auth === 'Bearer k2') throw new Error('invalid key');
      if (target.includes('/unread-count')) return envelope({ count: 1 });
      return envelope({ list: [row] });
    });
    const service = new AiSocialNotificationsService(
      keysOf([
        {
          keyId: 1,
          aipddUserId: 'a',
          plain: 'k1',
          boundAt: new Date('2026-01-01'),
        },
        {
          keyId: 2,
          aipddUserId: 'a',
          plain: 'k2',
          boundAt: new Date('2026-02-01'),
        },
      ]),
    );
    const data = await service.snapshot('u-1');
    expect(data.available).toBe(true);
    expect(data.rows[0].externalId).toBe('1:n-1');
  });

  it('标记已读按外部编号里的 Key 路由；已解绑的 Key 拒绝', async () => {
    upstream([]);
    const keys = keysOf([
      {
        keyId: 2,
        aipddUserId: 'a',
        plain: 'k2',
        boundAt: new Date('2026-02-01'),
      },
    ]);
    const service = new AiSocialNotificationsService(keys);
    await expect(service.read('u-1', '2:n-1')).resolves.toEqual({
      id: '2:n-1',
      read: true,
    });
    expect(String(mocked.mock.calls[0][0])).toBe(
      'https://api.aiworkin.test/api/v1/notifications/n-1/read',
    );
    expect(
      (mocked.mock.calls[0][1]?.headers as Record<string, unknown>)
        ?.authorization,
    ).toBe('Bearer k2');
    await expect(service.read('u-1', '9:n-1')).rejects.toThrow(
      '通知所属的 API Key 已解绑',
    );
    await expect(service.read('u-1', 'n-1')).rejects.toThrow('通知编号无效');
  });

  it('全部已读按账号各调一次，单账号失败不影响其他账号', async () => {
    let calls = 0;
    mocked.mockImplementation(async (url) => {
      const target = String(url);
      if (!target.includes('/read-all')) return envelope({});
      calls += 1;
      if (calls === 1) throw new Error('network');
      return envelope({ updated: 3 });
    });
    const service = new AiSocialNotificationsService(
      keysOf([
        {
          keyId: 1,
          aipddUserId: 'a',
          plain: 'k1',
          boundAt: new Date('2026-01-01'),
        },
        {
          keyId: 2,
          aipddUserId: 'b',
          plain: 'k2',
          boundAt: new Date('2026-02-01'),
        },
      ]),
    );
    await expect(service.readAll('u-1')).resolves.toEqual({ updated: 3 });
    expect(mocked).toHaveBeenCalledTimes(2);
  });
});
