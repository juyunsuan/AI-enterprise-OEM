import { randomBytes } from 'node:crypto';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { RateWindow } from '../common/rate-window';
import type { ApiEnv } from '../http/types';
import type { Services } from '../http/services';
import { parseCustomerToken } from '../private-mini/customer-token';
import { parseRentalStaffToken } from './rental-staff-token';

const UPLOAD_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'] as const;
const UPLOAD_KINDS = ['inspection', 'item', 'avatar'] as const;
const MAX_BYTES = 5 * 1024 * 1024;

const kindQuery = z.object({
  kind: z.enum(UPLOAD_KINDS).default('inspection'),
});

function sanitiseName(raw: string): string {
  const base = String(raw || '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '')
    .slice(0, 60);
  return base || 'file';
}

/** 租赁小程序公开上传：顾客或员工令牌任一有效，产物只回直链、不落库。 */
export function registerRentalUpload(
  app: OpenAPIHono<ApiEnv>,
  services: Services,
) {
  const uploadWindow = new RateWindow(20, 60_000);

  app.post('/api/public/rental/upload', async (c) => {
    const token = c.req.header('authorization') || '';
    let shopId = 0;
    let ownerKey = '';
    let customerError: unknown = null;
    try {
      const payload = parseCustomerToken(token);
      if (payload.scene !== 'RENTAL') {
        throw new BusinessException(
          ErrorCode.UNAUTHORIZED,
          '顾客身份不属于租赁门店',
        );
      }
      shopId = payload.shopId;
      ownerKey = `c:${payload.customerId}`;
    } catch (error) {
      customerError = error;
      const staff = parseRentalStaffToken(token);
      shopId = staff.shopId;
      ownerKey = `s:${staff.staffId}`;
    }
    if (!shopId) {
      throw customerError instanceof Error
        ? customerError
        : new BusinessException(ErrorCode.UNAUTHORIZED, '请先登录小程序');
    }
    const shop = await services.prisma.rentalShop.findUnique({
      where: { id: shopId },
      select: { id: true, status: true },
    });
    if (!shop) throw new BusinessException(ErrorCode.NOT_FOUND, '门店不存在');
    if (shop.status === 'SUSPENDED') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '该门店已被平台暂停服务',
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
        '仅支持 jpg/jpeg/png/webp/gif 图片',
      );
    }
    if (file.size <= 0)
      throw new BusinessException(ErrorCode.BAD_REQUEST, '文件内容为空');
    if (file.size > MAX_BYTES) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '文件超过 5MB 上限，请压缩后重传',
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const safeName = `${sanitiseName(name.replace(/\.[^.]+$/, ''))}.${ext}`;
    const key = `rental/${shopId}/${query.kind}/${randomBytes(16).toString('hex')}_${safeName}`;
    const stored = await services.storage.service.put(key, bytes);
    return c.json({
      url: stored.url || services.storage.service.urlOf(stored.key),
      name: safeName,
      size: file.size,
    });
  });
}
