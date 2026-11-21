import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestBodyLimit } from '../http/app';

describe('Hono attachment request size limits', () => {
  const app = new Hono();
  app.use('*', (c, next) =>
    bodyLimit({
      maxSize: requestBodyLimit(c.req.path),
      onError: (c) =>
        c.json(
          {
            code: 413,
            message: '请求内容过大，请减少单次上传的文件数量后重试',
            data: null,
          },
          413,
        ),
    })(c, next),
  );
  app.post('*', async (c) => {
    const body = await c.req.json<{ files: { contentBase64: string }[] }>();
    return c.json(
      { size: Buffer.from(body.files[0].contentBase64, 'base64').length },
      201,
    );
  });
  const tenMB = JSON.stringify({
    files: [
      { contentBase64: Buffer.alloc(10 * 1024 * 1024).toString('base64') },
    ],
  });
  function post(path: string, body: string) {
    return app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  }
  it.each([
    '/enterprise/identity/provider-application/attachments',
    '/api/backend/enterprise/flex/onboardings/attachments/',
  ])('accepts a 10MB file at %s', async (path) => {
    const response = await post(path, tenMB);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ size: 10 * 1024 * 1024 });
  });
  it('keeps the 12MB limit for ordinary JSON', async () => {
    const response = await post('/ordinary-json', tenMB);
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 413 });
  });
  it('rejects uploads above 16MB', async () => {
    const response = await post(
      '/enterprise/flex/onboardings/attachments',
      JSON.stringify({
        files: [{ contentBase64: 'x'.repeat(17 * 1024 * 1024) }],
      }),
    );
    expect(response.status).toBe(413);
  });
});

/**
 * 上限分级必须与各服务自己声明的上限同级：中间件先按默认 12MB 拦一刀，
 * 业务侧那句"文件超过 100MB"的有用报错就永远到不了用户眼前。
 */
describe('requestBodyLimit 分级', () => {
  it.each([
    ['/enterprise/content/uploads', 100 * 1024 * 1024],
    ['/enterprise/content/digital-assets/upload', 100 * 1024 * 1024],
    ['/api/public/digital-human/upload', 100 * 1024 * 1024],
    ['/enterprise/community/uploads', 50 * 1024 * 1024],
    ['/enterprise/admin/upgrade/upload', 512 * 1024 * 1024],
    ['/enterprise/flex/onboardings/attachments', 16 * 1024 * 1024],
    ['/enterprise/crm/customer/create', 12 * 1024 * 1024],
    [
      '/api/backend/enterprise/content/digital-assets/upload',
      100 * 1024 * 1024,
    ],
  ] as const)('%s → %s 字节', (path, expected) => {
    expect(requestBodyLimit(path)).toBe(expected);
  });
});
