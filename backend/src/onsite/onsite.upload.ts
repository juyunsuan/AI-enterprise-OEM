import { randomBytes } from 'node:crypto';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { parseCustomerToken } from '../private-mini/customer-token';
import { parseStaffToken } from './staff-token';
import { toolOpen } from '../tool-launch/tool-launch.holder';
import { shopStatus } from './onsite.shop.service';

const UPLOAD_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;
const UPLOAD_KINDS = [
  'checkin',
  'sign',
  'review',
  'avatar',
  'license',
] as const;
const MAX_BYTES = 5 * 1024 * 1024;

const kindQuery = z.object({
  kind: z.enum(UPLOAD_KINDS).default('checkin'),
});

/** 客户端文件名只留安全字符，且永远排在随机段后面——不允许它逃出 onsite/{shopId}/{kind}/ 前缀。 */
function sanitiseName(raw: string): string {
  const base = String(raw || '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 60);
  return base || 'file';
}

/**
 * 上门服务小程序公开上传（打卡照片 / 手写签名 / 评价图等）。
 *
 * 身份口径与两条公开通道一致：顾客令牌或技师令牌**任一有效**即可（先按顾客解析，
 * 失败再按技师解析），店铺归属只认令牌载荷里的 shopId——请求里不接受 shopCode，
 * 杜绝「借 A 店身份往 B 店目录写文件」。产物只回 {url,name,size}，不落库。
 */
export function registerOnsiteUpload(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const uploadWindow = new RateWindow(20, 60_000);

  app.post('/api/public/onsite/upload', async (c) => {
    const token = c.req.header('authorization') || '';
    let shopId = 0;
    let ownerKey = '';
    let customerError: unknown = null;
    try {
      const payload = parseCustomerToken(token);
      shopId = payload.shopId;
      ownerKey = `c:${payload.customerId}`;
    } catch (error) {
      customerError = error;
      // 技师分包的页面（打卡/签名/头像）带的是技师令牌；两种令牌共用这一个入口
      const staff = parseStaffToken(token);
      shopId = staff.shopId;
      ownerKey = `s:${staff.staffId}`;
    }
    if (!shopId) {
      throw customerError instanceof Error
        ? customerError
        : new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录小程序');
    }
    const shop = await services.prisma.onsiteShop.findFirst({
      where: { id: shopId },
      select: { id: true, ownerUserId: true, status: true },
    });
    if (!shop) {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '店铺不存在或尚未开通，请让店主在后台完成开通后再试',
      );
    }
    if (shopStatus(shop.status) === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该店铺已被平台暂停服务',
      );
    }
    // 启动闸门：工具未启动/欠费/平台停服，沿用同一停服响应
    if (!(await toolOpen('onsite', shop.ownerUserId))) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该站点尚未启动（或已停服），请到「建站管理 → 启动设置」启动后重试',
      );
    }
    const query = kindQuery.parse({ kind: c.req.query('kind') || undefined });
    uploadWindow.consume(`${shopId}:${ownerKey}`, '上传过于频繁，请稍后再试');
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    if (
      typeof file !== 'object' ||
      file === null ||
      !('size' in file) ||
      typeof file.size !== 'number'
    ) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '未收到文件：请检查表单字段名为 file',
      );
    }
    const name = 'name' in file ? String(file.name || '') : '';
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (!(UPLOAD_EXT as readonly string[]).includes(ext)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '仅支持 jpg/jpeg/png/webp/gif 图片，请重新选择',
      );
    }
    if (file.size <= 0) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '文件内容为空，请重新选择',
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '文件超过 5MB 上限，请压缩后重传',
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const safeName = `${sanitiseName(name.replace(/\.[^.]+$/, ''))}.${ext}`;
    const key = `onsite/${shopId}/${query.kind}/${randomBytes(16).toString('hex')}_${safeName}`;
    const stored = await services.storage.service.put(key, bytes);
    return c.json({
      url: stored.url || services.storage.service.urlOf(stored.key),
      name: safeName,
      size: file.size,
    });
  });
}
