import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BusinessException } from '../common/business.exception';
import { extractZipBufferToDir } from '../miniprogram/zip-extract';
import {
  MAIN_PACKAGE_LIMIT,
  assertPackageSize,
  buildStoreZip,
  collectTemplate,
  injectAppId,
  injectConfig,
  readTemplateMeta,
  zipStats,
  type PackageEntry,
} from './package-builder';

/** 包内只放三样必需文件，其余按用例追加：出包器的正确性不该依赖仓库模板内容。 */
async function fixture(configBody: string) {
  const dir = await mkdtemp(join(tmpdir(), 'onsite-template-'));
  await writeFile(join(dir, 'config.js'), configBody, 'utf8');
  await writeFile(
    join(dir, 'app.json'),
    '{"pages":["pages/index/index"]}',
    'utf8',
  );
  await writeFile(
    join(dir, 'project.config.json'),
    JSON.stringify(
      { compileType: 'miniprogram', appid: 'touristappid' },
      null,
      2,
    ),
    'utf8',
  );
  return dir;
}

const entry = (name: string, text: string): PackageEntry => ({
  name,
  content: Buffer.from(text, 'utf8'),
  mtime: new Date('2026-01-01T00:00:00Z'),
});

describe('private-mini/package-builder', () => {
  it('把空串占位注入成店铺配置，并如实回报注入了哪些键', async () => {
    const dir = await fixture(
      'module.exports = {\n  templateVersion: "1.0.0",\n  apiBase: "",\n  shopCode: "",\n};\n',
    );
    try {
      const entries = await collectTemplate(dir);
      const injected = injectConfig(
        entries,
        { apiBase: 'https://example.com', shopCode: 'AB23CD4E' },
        dir,
      );
      expect(injected.sort()).toEqual(['apiBase', 'shopCode']);
      const config = entries.find((item) => item.name === 'config.js');
      expect(config?.content.toString('utf8')).toContain(
        'apiBase: "https://example.com"',
      );
      // templateVersion 不是空串占位，不属于注入目标，必须原样保留
      expect(config?.content.toString('utf8')).toContain(
        'templateVersion: "1.0.0"',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('模板键被填过值时拒绝注入，而不是静默出一个连错域的包', async () => {
    const dir = await fixture(
      'module.exports = {\n  apiBase: "https://old.example",\n};\n',
    );
    try {
      const entries = await collectTemplate(dir);
      expect(() =>
        injectConfig(entries, { apiBase: 'https://new.example' }, dir),
      ).toThrow(BusinessException);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('缺 app.json / config.js / project.config.json 任一项就不出包', async () => {
    const entries = [entry('pages/index/index.js', 'Page({})')];
    let message = '';
    try {
      injectConfig(entries, { apiBase: 'https://example.com' }, '/tmp/none');
    } catch (error) {
      message = error instanceof BusinessException ? error.message : '未知';
    }
    expect(message).toContain('app.json');
  });

  it('出包时写入店铺 AppID，下载到的 zip 可直接被开发者工具导入', async () => {
    const entries = [
      entry('config.js', 'module.exports = { apiBase: "" };\n'),
      entry('app.json', '{}'),
      entry('project.config.json', '{"appid":"touristappid"}'),
    ];
    expect(injectAppId(entries, 'wx1234567890abcdef')).toBe(true);
    const config = JSON.parse(
      entries
        .find((item) => item.name === 'project.config.json')!
        .content.toString('utf8'),
    ) as { appid: string };
    expect(config.appid).toBe('wx1234567890abcdef');
    // 同 AppID 重复出包不该改写文件（内容一致时返回 false，避免无意义 diff）
    expect(injectAppId(entries, 'wx1234567890abcdef')).toBe(false);
  });

  it('产出的 zip 能被既有解包器还原（字节一致、条目名 POSIX）', async () => {
    const entries = [
      entry('config.js', 'module.exports = { apiBase: "" };\n'),
      entry('utils/request.js', '// 中文注释不应该破坏条目名\n'),
    ];
    const bytes = buildStoreZip(entries);
    expect(zipStats(bytes).sha256).toHaveLength(64);
    const out = await mkdtemp(join(tmpdir(), 'onsite-unzip-'));
    try {
      expect(await extractZipBufferToDir(bytes, out)).toBe(2);
      expect(await readFile(join(out, 'utils/request.js'), 'utf8')).toContain(
        '中文注释',
      );
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });

  it('超过微信主包上限时拒绝出包，并把提示写成可执行的下一步', () => {
    expect(() => assertPackageSize(MAIN_PACKAGE_LIMIT + 1, 120)).toThrow(
      BusinessException,
    );
    try {
      assertPackageSize(MAIN_PACKAGE_LIMIT + 1, 120);
    } catch (error) {
      const message = error instanceof BusinessException ? error.message : '';
      expect(message).toContain('2MB');
      expect(message).toContain('对象存储');
    }
    expect(() => assertPackageSize(1024, 30)).not.toThrow();
  });

  it('模板元信息读得到版本号（出包版本号默认按它续排）', async () => {
    const dir = await fixture(
      'module.exports = {\n  templateVersion: "2.3.4",\n};\n',
    );
    try {
      const meta = await readTemplateMeta(dir);
      expect(meta).toMatchObject({
        available: true,
        version: '2.3.4',
        entryCount: 3,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
