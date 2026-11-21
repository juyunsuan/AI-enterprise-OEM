import { Hono } from 'hono';
import type { ApiEnv } from '../http/types';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { ToolLaunchService } from './tool-launch.service';
import { toolLaunchGateMiddleware } from './tool-launch-gate.middleware';
import {
  TOOL_LAUNCH_CATALOG,
  isLaunchGateAllowed,
  launchPathOf,
  toolCodeForAdminPath,
  toolCodeForPublicPath,
} from './tool-launch.catalog';
import { stub } from '../../test/doubles';

/**
 * 启动闸门的归属映射与放行规则。
 *
 * 这里守的是两条会「误伤营业」的边界：
 * 1) 前缀归属必须唯一且最长优先——`/enterprise/geo/site`（建站器）不能把
 *    `/enterprise/geo`（GEO 监测采集）一起拦掉；
 * 2) 自救路径永远放行——充值、启动设置本身、平台后台被挡，欠费账号就再也起不来了。
 */

describe('工具前缀归属', () => {
  it('每个工具都有唯一价目码与公开前缀', () => {
    // 数量随建站工具增加而增长，这里只守「一码唯一」不被破坏
    expect(new Set(TOOL_LAUNCH_CATALOG.map((item) => item.code)).size).toBe(
      TOOL_LAUNCH_CATALOG.length,
    );
    const pricing = TOOL_LAUNCH_CATALOG.map((item) => item.pricingCode);
    expect(new Set(pricing).size).toBe(pricing.length);
    const publics = TOOL_LAUNCH_CATALOG.map((item) => item.publicPrefix);
    expect(new Set(publics).size).toBe(publics.length);
  });

  it('建站工具的管理端前缀各自命中', () => {
    expect(toolCodeForAdminPath('/enterprise/knowledge-pay/save')).toBe(
      'knowledge-pay',
    );
    expect(toolCodeForAdminPath('/enterprise/onsite/order/ship')).toBe(
      'onsite',
    );
    expect(toolCodeForAdminPath('/enterprise/brand-mall/goods')).toBe(
      'brand-mall',
    );
    expect(toolCodeForAdminPath('/enterprise/health/shop')).toBe('health');
    expect(toolCodeForAdminPath('/enterprise/marketplace/create')).toBe(
      'marketplace',
    );
    expect(toolCodeForAdminPath('/enterprise/digital-human/task')).toBe(
      'digital-human',
    );
    expect(toolCodeForAdminPath('/enterprise/card-shop/card')).toBe(
      'card-shop',
    );
    expect(toolCodeForAdminPath('/enterprise/kuaidi/order')).toBe('kuaidi');
    expect(toolCodeForAdminPath('/enterprise/errand/order/list')).toBe(
      'errand',
    );
    expect(toolCodeForAdminPath('/enterprise/geo/site/publish')).toBe(
      'global-site',
    );
  });

  it('GEO 监测与采集不被建站器闸门牵连', () => {
    expect(toolCodeForAdminPath('/enterprise/geo/project')).toBeUndefined();
    expect(toolCodeForAdminPath('/enterprise/geo/questions')).toBeUndefined();
  });

  it('无关路径与平台后台不参与启动闸门', () => {
    expect(toolCodeForAdminPath('/enterprise/crm/customer')).toBeUndefined();
    expect(
      toolCodeForAdminPath('/enterprise/admin/brand-mall/shops'),
    ).toBeUndefined();
  });

  it('公开通道按前缀归属到市场与商城', () => {
    expect(toolCodeForPublicPath('/api/public/market/diy/shop')).toBe(
      'marketplace',
    );
    expect(toolCodeForPublicPath('/api/public/brand-mall/bootstrap')).toBe(
      'brand-mall',
    );
    expect(toolCodeForPublicPath('/api/public/knowledge-pay/resource')).toBe(
      'knowledge-pay',
    );
    expect(toolCodeForPublicPath('/api/public/geo-sites/by-host/page')).toBe(
      'global-site',
    );
    expect(
      toolCodeForPublicPath('/api/public/service-desk/session'),
    ).toBeUndefined();
  });

  it('自救前缀恒放行', () => {
    for (const path of [
      '/enterprise/tool-launch/start',
      '/enterprise/points/recharge',
      '/enterprise/account/password',
      '/enterprise/admin/brand-mall/shops',
    ]) {
      expect(isLaunchGateAllowed(path)).toBe(true);
    }
    expect(isLaunchGateAllowed('/enterprise/brand-mall/goods/save')).toBe(
      false,
    );
  });
});

describe('启动闸门中间件', () => {
  function build(closed: string[]) {
    const blocked: string[] = [];
    const launch = stub<ToolLaunchService>({
      blockIfStopped: async (code: string) => {
        blocked.push(code);
        if (closed.includes(code)) {
          throw new BusinessException(ErrorCode.TOOL_NOT_STARTED, '未启动', {
            toolCode: code,
            startUrl: launchPathOf(code as never),
          });
        }
      },
    });
    const app = new Hono<{ Variables: ApiEnv['Variables'] }>();
    app.use('*', (c, next) => {
      c.set('user', { userId: 'u1', username: 'u1', role: 'user' } as never);
      return next();
    });
    app.use('*', toolLaunchGateMiddleware(launch));
    app.all('*', (c) => c.json({ code: 0, message: 'ok', data: 'hit' }));
    // 真实链路由 app.onError 把业务异常转成信封；测试里同样收口，才能断到状态码与 data
    app.onError((err, c) =>
      err instanceof BusinessException
        ? c.json(
            { code: err.errorCode.code, message: err.message, data: err.data },
            err.getStatus() as 403,
          )
        : c.json({ code: 500, message: 'boom', data: null }, 500),
    );
    return { app, blocked };
  }

  it('未启动时写操作被拒，并且带上启动设置页地址', async () => {
    const { app, blocked } = build(['brand-mall']);
    const response = await app.request('/enterprise/brand-mall/goods/save', {
      method: 'POST',
    });
    expect(response.status).toBe(403);
    expect(blocked).toEqual(['brand-mall']);
    const body = await response.json();
    // 阻断必须自带可操作入口：错误体里给出启动设置页地址
    expect(body.code).toBe(ErrorCode.TOOL_NOT_STARTED.code);
    expect(body.data).toMatchObject({
      toolCode: 'brand-mall',
      startUrl: '/site-builder/launch?tool=brand-mall',
    });
  });

  it('读操作永不拦：页面要进得去才知道该点什么', async () => {
    const { app, blocked } = build(['brand-mall']);
    const response = await app.request('/enterprise/brand-mall/goods', {
      method: 'GET',
    });
    expect(response.status).toBe(200);
    expect(blocked).toEqual([]);
  });

  it('充值与启动设置自身不被闸门挡住', async () => {
    const { app, blocked } = build(['brand-mall']);
    for (const path of [
      '/enterprise/points/recharge/create',
      '/enterprise/tool-launch/start',
    ]) {
      const response = await app.request(path, { method: 'POST' });
      expect(response.status).toBe(200);
    }
    expect(blocked).toEqual([]);
  });

  it('已启动时写操作照常通过', async () => {
    const { app, blocked } = build([]);
    const response = await app.request('/enterprise/health/shop', {
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(blocked).toEqual(['health']);
  });

  it('内部转发前缀同样能归到工具', async () => {
    const { app, blocked } = build(['kuaidi']);
    const response = await app.request(
      '/api/backend/enterprise/kuaidi/order/create',
      {
        method: 'POST',
      },
    );
    expect(response.status).toBe(403);
    expect(blocked).toEqual(['kuaidi']);
  });
});
