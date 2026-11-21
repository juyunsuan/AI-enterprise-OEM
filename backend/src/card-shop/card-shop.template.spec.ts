import {
  collectTemplate,
  injectAppId,
  injectConfig,
  readTemplateMeta,
  templateDirFrom,
} from '../private-mini/package-builder';

/**
 * 仓库内模板是「出包」的唯一来源：app.json 声明的每一页都必须四件套齐全，
 * config.js 的五个空串占位必须能被注入。这里不碰数据库与对象存储，
 * 只守住「模板本身坏了」这一类问题，避免店主点了出包才发现少页面。
 */
const TEMPLATE_DIR = templateDirFrom(
  'MINIPROGRAM_CARD_SHOP_DIR',
  'card-shop-miniprogram',
);

const readJson = (entries: { name: string; content: Buffer }[], name: string) =>
  JSON.parse(
    entries.find((entry) => entry.name === name)!.content.toString('utf8'),
  ) as Record<string, unknown>;

describe('card-shop 小程序模板', () => {
  it('app.json 声明的每一页都有 js / json / wxml', async () => {
    const entries = await collectTemplate(TEMPLATE_DIR);
    const names = new Set(entries.map((entry) => entry.name));
    const app = readJson(entries, 'app.json') as {
      pages: string[];
      tabBar?: { list: { pagePath: string }[] };
    };
    expect(app.pages.length).toBe(14);
    for (const page of app.pages) {
      for (const ext of ['js', 'json', 'wxml']) {
        expect(names.has(`${page}.${ext}`)).toBe(true);
      }
    }
    const tabs = (app.tabBar?.list || []).map((item) => item.pagePath);
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) expect(app.pages).toContain(tab);
  });

  it('出包注入五个站点占位，并保留模板版本号', async () => {
    const entries = await collectTemplate(TEMPLATE_DIR);
    const injected = injectConfig(
      entries,
      {
        apiBase: 'https://shop.example.com',
        siteCode: 'AB23CD4E',
        appName: '测试小店',
        themeColor: '#fa5151',
        deskSiteKey: 'desk-key-1',
      },
      TEMPLATE_DIR,
    );
    expect(injected.sort()).toEqual([
      'apiBase',
      'appName',
      'deskSiteKey',
      'siteCode',
      'themeColor',
    ]);
    const config = entries
      .find((entry) => entry.name === 'config.js')!
      .content.toString('utf8');
    expect(config).toContain('apiBase: "https://shop.example.com"');
    expect(config).toContain('siteCode: "AB23CD4E"');
    expect(config).toContain('templateVersion: "1.0.0"');

    expect(injectAppId(entries, 'wx1234567890abcdef')).toBe(true);
    const project = readJson(entries, 'project.config.json') as {
      appid: string;
    };
    expect(project.appid).toBe('wx1234567890abcdef');
  });

  it('模板元信息可读：可出包、版本号用于自动续排', async () => {
    const meta = await readTemplateMeta(TEMPLATE_DIR);
    expect(meta.available).toBe(true);
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(meta.entryCount).toBeGreaterThan(50);
    expect(meta.sizeBytes).toBeGreaterThan(0);
  });
});
