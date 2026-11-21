import { randomBytes } from 'node:crypto';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { parseCustomerToken } from '../private-mini/customer-token';
import { parseParkStaffToken } from './park.token';

const UPLOAD_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const kindQuery = z.object({
  kind: z
    .enum(['repair', 'announcement', 'activity', 'cover'])
    .default('repair'),
});

const safeName = (raw: string): string =>
  String(raw || '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 60) || 'file';

/** 园区小程序公开上传：顾客或员工令牌任一有效，产物只回直链、不落库。 */
export function registerParkUpload(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const uploadWindow = new RateWindow(30, 60_000);

  app.post('/api/public/park/upload', async (c) => {
    const customerToken = (
      c.req.header('authorization') ||
      c.req.header('x-park-token') ||
      ''
    )
      .trim()
      .replace(/^Bearer\s+/i, '');
    const staffToken = (
      c.req.header('x-park-staff-token') ||
      c.req.header('authorization') ||
      ''
    )
      .trim()
      .replace(/^Bearer\s+/i, '');
    let siteId = 0;
    let ownerKey = '';
    try {
      const payload = parseCustomerToken(customerToken);
      if (payload.scene !== 'PARK') {
        throw new BusinessException(
          ErrorCode.UNAUTHORIZED,
          '登录状态不属于园区小程序',
        );
      }
      siteId = payload.shopId;
      ownerKey = `c-${payload.customerId}`;
    } catch {
      const staff = parseParkStaffToken(staffToken);
      siteId = staff.parkId;
      ownerKey = `s-${staff.staffId}`;
    }
    const site = await services.prisma.parkSite.findUnique({
      where: { id: siteId },
      select: { id: true, status: true },
    });
    if (!site) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '园区不存在');
    }
    if (site.status !== 'ONLINE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '园区已暂停服务',
      );
    }
    const query = kindQuery.parse({ kind: c.req.query('kind') || undefined });
    uploadWindow.consume(`${siteId}:${ownerKey}`, '上传过于频繁，请稍后再试');
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
        '仅支持 jpg/jpeg/png/webp/gif 图片',
      );
    }
    if (file.size <= 0) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '文件内容为空');
    }
    if (file.size > MAX_BYTES) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '文件超过 10MB 上限，请压缩后重传',
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const fileName = `${safeName(name.replace(/\.[^.]+$/, ''))}.${ext}`;
    const key = `park/${siteId}/${ownerKey}/${query.kind}/${randomBytes(
      16,
    ).toString('hex')}_${fileName}`;
    const stored = await services.storage.service.put(key, bytes);
    return c.json({
      url: stored.url || services.storage.service.urlOf(stored.key),
      name: fileName,
      size: file.size,
    });
  });
}
