import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

/**
 * 营销工具 · GEO 独立站建站器的安全与业务不变量守卫。
 *
 * 与 verify-creative-community.mjs 同风格：只做静态断言，盯「这道闸还在不在、默认是不是最严那一档」，
 * 不盯排版与行号。这个模块比一般业务更危险，因为它把用户提交的元素树直接渲染成**公开可访问的 HTML**，
 * 还会拿用户填的域名去发请求、按站点每月扣真金白银的积分，所以下面每一条都是刻意收紧的结果，
 * 要放宽必须显式改本脚本并在 PR 里说清为什么。
 */
const root = resolve(import.meta.dirname, '..');
const cache = new Map();
function source(file) {
  if (!cache.has(file)) {
    cache.set(file, readFileSync(join(root, file), 'utf8'));
  }
  return cache.get(file);
}
function has(file, pattern, message) {
  // 不用 assert.match：失败时它会把整份源码贴进日志，反而看不出少了哪道闸
  assert.ok(pattern.test(source(file)), `${file} 闸门缺失：${message}`);
}
function lacks(file, pattern, message) {
  assert.ok(
    !pattern.test(source(file)),
    `${file} 出现不该有的写法：${message}`,
  );
}
function count(file, pattern) {
  return [...source(file).matchAll(new RegExp(pattern.source, 'g'))].length;
}
/** 取两个标记之间的片段，用来盯「某个函数里有没有某道校验」这种局部约束。 */
function between(file, start, end, message) {
  const text = source(file);
  const from = text.indexOf(start);
  assert.ok(from >= 0, `${file} 找不到片段起点：${message}（起点 ${start}）`);
  const to = text.indexOf(end, from);
  assert.ok(to > from, `${file} 找不到片段终点：${message}（终点 ${end}）`);
  return text.slice(from, to);
}
/** 目录里所有实现文件（跳过单测：单测允许出现被禁写法的反面样本）。 */
function implementations(dir) {
  const abs = join(root, dir);
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const name = join(dir, entry.name);
    if (entry.isDirectory()) return implementations(name);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')
      ? [name]
      : [];
  });
}

const DIR = 'backend/src/geo-site';
const SHARED = `${DIR}/geo-site.shared.ts`;
const SERVICE = `${DIR}/geo-site.service.ts`;
const DOMAIN = `${DIR}/geo-site-domain.service.ts`;
const BILLING = `${DIR}/geo-site.billing.service.ts`;
const SETTINGS = `${DIR}/geo-site.settings.service.ts`;
const RENDER = `${DIR}/geo-site.render.service.ts`;
const PUBLIC = `${DIR}/geo-site.public.ts`;
const SCHEDULER = `${DIR}/geo-site.scheduler.ts`;
const CONTROLLER = `${DIR}/geo-site.controller.ts`;
const SERVICES = 'backend/src/http/services.ts';
const ROUTES = 'backend/src/http/automation-routes.ts';
const APP = 'backend/src/http/app.ts';
const MAIN = 'backend/src/main.ts';
const FEATURE = 'backend/src/feature/feature-catalog.data.ts';
const CONTRACT = 'packages/contracts/src/geo-site.ts';
const ENDPOINTS = 'packages/contracts/src/endpoints.ts';
const SCHEMA = 'backend/prisma/schema.prisma';
const SCHEMA_PG = 'backend/prisma/schema.postgres.prisma';
/** PostgreSQL 版是 `pnpm db:gen:pg` 派生的生产物、按约定不入库；本地存在时顺带校验，CI 只验事实源。 */
const SCHEMA_TARGETS = [SCHEMA, SCHEMA_PG].filter((file) =>
  existsSync(join(root, file)),
);
const MIGRATION =
  'backend/prisma/migrations/0097_geo_site_builder/migration.sql';
const FRONT_DIR = 'frontend/src/app/international-site/_components';
const FRONT_LIST = `${FRONT_DIR}/geo-site-list.tsx`;
const FRONT_EDITOR = `${FRONT_DIR}/geo-site-editor.tsx`;
const FRONT_DOMAINS = `${FRONT_DIR}/geo-site-domains.tsx`;
const FRONT_BILLING = `${FRONT_DIR}/geo-site-billing.tsx`;
const FRONT_CANVAS = `${FRONT_DIR}/geo-site-canvas.tsx`;
const FRONT_TREE = `${FRONT_DIR}/geo-site-tree.ts`;
const FRONT_PAGES = `${FRONT_DIR}/geo-site-pages.tsx`;
const FRONT_MENUS = `${FRONT_DIR}/geo-site-menus.tsx`;
const FRONT_CONTENTS = `${FRONT_DIR}/geo-site-contents.tsx`;
const FRONT_SCRIPTS = `${FRONT_DIR}/geo-site-scripts.tsx`;
const FRONT_TEMPLATES = `${FRONT_DIR}/geo-site-templates.tsx`;
const FRONT_ELEMENTS = `${FRONT_DIR}/geo-site-elements.ts`;
const FRONT_LOG = `${FRONT_DIR}/geo-site-log.tsx`;
const PAGE = `${DIR}/geo-site-page.service.ts`;
const PAGE_TPL = `${DIR}/geo-site-page.templates.ts`;
const MENU = `${DIR}/geo-site-menu.service.ts`;
const CONTENT = `${DIR}/geo-site-content.service.ts`;
const TEMPLATE = `${DIR}/geo-site-template.service.ts`;
const LOG = `${DIR}/geo-site-publish-log.ts`;
const CMS_CONTROLLER = `${DIR}/geo-site-cms.controller.ts`;
const RENDER_DATA = `${DIR}/geo-site.render-data.service.ts`;
const MIG_CMS = 'backend/prisma/migrations/0099_site_cms/migration.sql';
const MIG_TPL = 'backend/prisma/migrations/0100_site_templates/migration.sql';
/** 多语言把唯一键从「站点内」改成「站点 + 语言内」，以这一版迁移后的库状态为准。 */
const MIG_LANG = 'backend/prisma/migrations/0104_geo_site_multilingual/migration.sql';
const FRONT_GEO_TAB = 'frontend/src/app/marketing-tools/_components/geo-tab.tsx';
const FRONT_PAGE = 'frontend/src/app/international-site/page.tsx';
const FRONT_ADMIN = 'frontend/src/app/admin/_components/geo-site-admin.tsx';
const FRONT_ADMIN_TAB = 'frontend/src/app/admin/_components/geo-site-manage-tab.tsx';
const FRONT_API = 'frontend/src/api/geo-site.ts';
const FRONT_QUERY = 'frontend/src/query/geo-site.ts';
const FRONT_LABELS = 'frontend/src/lib/ai-usage.ts';
const NEXT_CONFIG = 'frontend/next.config.ts';
const NGINX = 'infra/nginx/enterprise.conf';

test('公开页出站只经统一传输层，模块内不许自己 fetch', () => {
  for (const file of implementations(DIR)) {
    lacks(
      file,
      /(?<![\w.$])fetch\s*\(/,
      '所有出站要走 http/transport.ts（超时、字节上限、日志才统一生效）',
    );
  }
  has(DOMAIN, /import \{ httpRequest \} from '\.\.\/http\/transport'/, '域名校验经统一传输层');
  assert.ok(count(DOMAIN, /httpRequest</) >= 2, 'DoH 查询与探针回连都要走传输层');
});

test('渲染：文本与属性全量转义，URL 与样式过白名单，CSP 收到最严一档', () => {
  // 元素树是用户提交、直接吐给公网的，这里漏一个口子就是全站存储型 XSS
  for (const fn of ['escapeHtml', 'safeSiteUrl', 'cssTextFromStyles']) {
    has(RENDER, new RegExp(`${fn}\\(`), `${fn} 必须用在渲染路径上`);
  }
  has(
    SHARED,
    /function cssValueOf\(key: string, value: string \| number\): string/,
    '样式值统一走 cssValueOf 出口',
  );
  has(SHARED, /value === 0 \|\| UNITLESS_STYLE_KEYS\.has\(key\)/, '无单位属性与 0 不补 px');
  has(SHARED, /return `\$\{value\}px`/, '其余数字补 px，与 React 内联样式对齐');
  has(SHARED, /return safeStyleValue\(value\)/, '字符串值仍逐个过白名单');
  has(
    SHARED,
    /const STYLE_OK = \/\^\[a-zA-Z0-9 ,\.%\(\)#'\+:\x2f\-\]\*\$\/;/,
    '样式值字符白名单',
  );
  has(SHARED, /javascript\|expression\|url\\s\*\(|@import/, '样式里挡掉 url() / expression / @import');
  has(SHARED, /url\.protocol !== 'http:' && url\.protocol !== 'https:'/, 'URL 只放 http(s)');
  has(SHARED, /raw\.startsWith\('\/'\) \|\| raw\.startsWith\('#'\)/, '站内相对路径仍可点（否则落地页按钮全废）');
  has(PUBLIC, /"default-src 'none'"/, '默认不放行任何资源');
  has(PUBLIC, /'x-frame-options': 'DENY'/, '公开页不许被嵌套（防钓鱼套壳）');
  has(PUBLIC, /'x-content-type-options': 'nosniff'/, '不许嗅探成脚本');
  has(PUBLIC, /"connect-src 'none'"/, '页面里的脚本不许回连任何接口');
  has(PUBLIC, /"base-uri 'none'"/, '不许改写 <base>');
  has(PUBLIC, /'frame-src https:\/\/www\.youtube-nocookie\.com/, '视频只嵌这三家播放器');
  assert.ok(
    count(PUBLIC, /const BASE_CSP = \[/) === 1,
    '静态基线只有一份定义，别出现两套口径',
  );
  has(
    PUBLIC,
    /'content-security-policy': buildCsp\(/,
    '正文页 CSP 按页面脚本动态生成，不在这里另写一份',
  );
  has(RENDER, /export function buildCsp/, '按页 CSP 只有渲染层一个实现点');
  const dynamicCsp = between(
    RENDER,
    'export function buildCsp',
    '\n}',
    '按页 CSP 的实现体',
  );
  for (const directive of [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "style-src 'unsafe-inline'",
  ]) {
    assert.ok(
      dynamicCsp.includes(directive),
      `按页 CSP 必须保住基线档位：缺 ${directive}（放行脚本不等于放宽一切）`,
    );
  }
  assert.ok(
    !/script-src[^;]*\*/.test(dynamicCsp),
    '按页 CSP 不许出现通配 script-src',
  );
});

test('公开入口按 IP 限流，未发布/停服/被处置各回各状态码', () => {
  has(PUBLIC, /function limited\(ip: string, limit = 120\)/, '每分钟 120 次/IP');
  has(PUBLIC, /limited\(clientIp\(c\)\)/, '公开路由入口先过限流');
  assert.ok(
    count(PUBLIC, /throttled\(/) >= 6,
    'robots / sitemap / llms 六条路由也要限流（每次都要查库，不是免费静态文件）',
  );
  has(PUBLIC, /c\.req\.header\('x-forwarded-for'\)/, '按真实来源 IP 计数');
  has(PUBLIC, /'x-robots-tag': status === 200 \? 'noindex' : 'noindex, nofollow'/, '非 200 一律禁止收录');
  // 「正文没发但 sitemap 里有」是最容易被忽略的自相矛盾
  has(PUBLIC, /publishedContent/, '只渲染已发布快照，不渲染草稿');
  has(PUBLIC, /by-host\/robots\.txt/, 'robots 与正文同源');
  has(PUBLIC, /by-host\/sitemap\.xml/, 'sitemap 与正文同源');
  has(PUBLIC, /by-host\/llms\.txt/, 'llms.txt 与正文同源');
});

test('元素树硬上限：节点数、嵌套深度与序列化体积封顶', () => {
  has(SHARED, /maxNodes: 2000/, '单站 2000 个元素封顶');
  has(SHARED, /maxDepth: 12/, '嵌套 12 层封顶');
  has(SHARED, /maxJsonBytes: 2 \* 1024 \* 1024/, '内容体积 2MB 封顶');
  has(SHARED, /export function assertElementTree/, '结构校验是唯一的入口闸门');
  has(SERVICE, /assertElementTree\(body\.content/, '保存草稿过闸');
  has(
    SERVICE,
    /assertElementTree\(jsonOf\(home\?\.content \?\? row\.content/,
    '发布再过一次闸（存量脏数据不许发出去）',
  );
  assert.ok(count(SHARED, /GEO_SITE_LIMITS\./) >= 4, '上限只有一份常量，不散落魔法数');
});

test('slug：字符集、保留字与唯一性，不许抢本站路由', () => {
  has(SHARED, /const SLUG_PATTERN = \/\^\[a-z0-9\]\(\[a-z0-9-\]\{1,61\}\[a-z0-9\]\)\?\$\//, '2-63 位小写字母数字连字符');
  const reserved = between(SHARED, 'const RESERVED_SLUGS = new Set([', ']);', '保留字名单');
  for (const word of ['admin', 'api', 'geo-site', 'dashboard', 'static', 'assets']) {
    assert.ok(reserved.includes(`'${word}'`), `保留字必须含 ${word}（否则站点会盖掉站内路由）`);
  }
  assert.ok(reserved.includes(`'probe'`), '探针路径也要占住');
  has(SERVICE, /uniqueSlug\(/, 'slug 撞车时自动加后缀');
  has(SHARED, /function toText/, '只认标量：对象一律当空串，免得渲染出 [object Object]');
});

test('自定义域名：归一化、拒本站与平台域、拒裸 IP，默认就要承诺备案', () => {
  has(SHARED, /export function normalizeSiteDomain/, '域名归一化唯一实现点');
  has(SHARED, /host === item \|\| host\.endsWith\(`\.\$\{item\}`\)/, '平台自身域名与其子域一律拒绝');
  has(SHARED, /item\.endsWith\(`\.\$\{host\}`\)/, '反向包含也拒（用根域冒充子域）');
  has(SHARED, /\^\\d\{1,3\}\(\\\.\\d\{1,3\}\)\{3\}\$/, '裸 IP 直接拒（签不出证书也挂不了 TXT）');
  has(SETTINGS, /needsIcpAck: true/, '备案承诺默认开启');
  has(DOMAIN, /config\.needsIcpAck && !body\.icpAcknowledged/, '未承诺即拒，不给过');
  has(DOMAIN, /!config\.customDomainEnabled/, '平台关掉自定义域名时给硬阻断');
  has(DOMAIN, /「平台管理后台 → 独立站设置」中启用/, '阻断文案要指到能改的地方');
  has(DOMAIN, /count >= config\.maxDomainsPerSite/, '单站点名域名数上限');
});

test('域名所有权校验三步走：TXT 令牌、公网解析、探针回连', () => {
  has(DOMAIN, /const TXT_PREFIX = '_geo-site-verify\.'/, 'TXT 前缀与页面指引同源');
  has(DOMAIN, /const PROBE_PATH = '\/_geo-site\/probe'/, '探针路径');
  has(DOMAIN, /https:\/\/dns\.alidns\.com\/resolve/, 'DoH 主通道');
  has(DOMAIN, /https:\/\/dns\.google\/resolve/, 'DoH 备通道（单源挂掉不能整体卡死）');
  has(DOMAIN, /lookup\(txtName, 'TXT'\)/, '第一步读 TXT');
  has(DOMAIN, /row\.verifyToken/, '令牌逐字节比对');
  has(DOMAIN, /privateHit/, '第二步解析结果必须落公网');
  has(DOMAIN, /export function isPrivateAddress/, '私网判定独立实现');
  has(DOMAIN, /lookup\(row\.domain, 'CNAME'\)/, 'CNAME 到平台地址是合法形态');
  has(DOMAIN, /PROBE_PATH\}\?token=/, '第三步真打用户域名回连探针');
  has(PUBLIC, /app\.get\('\/_geo-site\/probe', probe\)/, '探针在服务端挂载');
  has(DOMAIN, /isPrimary: count === 0 \? 1 : 0/, '首个域名自动当主域名');
  has(DOMAIN, /域名尚未校验通过，不能设为主域名/, '设主域名要有可执行的前置提示');
});

test('按月扣积分：双唯一键幂等、首月按天折算、余额不足只记欠费', () => {
  has(BILLING, /GEO_SITE_BILL_SCENE = 'geo_site'/, '计费主体码（价目表与流水 scene 共用）');
  has(BILLING, /const idempotencyKey = `\$\{GEO_SITE_BILL_SCENE\}:\$\{siteId\}:\$\{periodMonth\}`/, '站点 + 月份一个幂等键');
  has(BILLING, /this\.points\.debitTx\(/, '扣费走积分既有口径，不自建流水');
  has(BILLING, /where: \{ siteId_periodMonth: \{ siteId: entry\.siteId, periodMonth \} \}/, '出账前先查账单行');
  has(BILLING, /function isUniqueViolation/, '并发撞唯一键要吞掉（MySQL 1062 / PG 23505）');
  has(BILLING, /code === 'P2002' \|\| String\(error\)\.includes\('23505'\)/, '双方言唯一键都要认');
  has(BILLING, /export function proratedDays/, '首月按计费锚点折算天数');
  has(BILLING, /unitPriceAmount \?\? 0/, '未配价目即不扣费');
  has(BILLING, /row\.enabled === 1 && row\.mode === 'METERED'/, '价目停用时按免费处理');
  has(BILLING, /status: 'ARREARS'/, '余额不足只把账单记欠费');
  has(BILLING, /freeSites/, '免费站点数由价目表的 freeQuota 决定');
});

test('欠费只冻结不删数据，平台处置的站点不参与自动复活', () => {
  has(BILLING, /settings\.suspendOnArrears/, '自动停服是可关的策略，默认开');
  has(SETTINGS, /suspendOnArrears: true/, '默认开启欠费停服');
  has(SETTINGS, /graceHours: 72/, '默认给 72 小时宽限');
  has(SETTINGS, /intOf\(input\.graceHours, d\.graceHours, 0, 720\)/, '宽限时长后台可调但封顶 30 天');
  has(BILLING, /settings\.graceHours \* 3600_000/, '宽限按小时换算');
  has(BILLING, /if \(!site \|\| site\.offBy\) continue;/, '平台强制下线的站点不许被日批自动复活');
  lacks(BILLING, /geoSite\.delete/, '欠费流程里绝不能删站点');
  lacks(BILLING, /geoSiteDomain\.delete/, '欠费流程里绝不能解域名');
  has(BILLING, /status: site\.publishedContent \? 'PUBLISHED' : 'DRAFT'/, '复活时回到该回的状态');
});

test('合规处置闭环：下线必留原因、用户不许自行重发、只有平台能解除', () => {
  // 没有 adminOnline，强制下线就成了死胡同（用户侧发布被拦，只能改库）
  const offline = between(SERVICE, 'async adminOffline(', 'async adminOnline(', '强制下线实现');
  has(SERVICE, /async adminOnline\(/, '解除下线入口存在');
  const online = between(SERVICE, 'async adminOnline(', '/* ------------------------------ 内部工具', '解除下线实现');
  for (const snippet of [offline, online]) {
    assert.ok(
      /isPlatformAdmin/.test(snippet),
      '平台侧动作必须在服务层收口管理员身份',
    );
  }
  assert.ok(/offBy:\s*user\.username \|\| user\.userId/.test(offline), '下线要留操作人');
  assert.ok(
    /'内容需整改后重新发布，请联系平台复核'/.test(offline),
    '原因留空也要有兜底文案（offReason 是「平台处置」的判据，不能空）',
  );
  assert.ok(/offBy: ''/.test(online) && /offReason: ''/.test(online), '解除要清掉处置标记');
  assert.ok(
    /status: unpaid\s*\?\s*'SUSPENDED'/.test(online),
    '仍有欠费账单的站点解除后继续停服',
  );
  has(CONTRACT, /export function geoSiteStatusLabel\(/, '文案分流规则在契约层单一实现');
  const publish = between(SERVICE, 'async publish(', 'async unpublish(', '发布实现');
  assert.ok(/if \(row\.offBy\) \{/.test(publish), '被平台处置的站点不许用户自己点发布复活');
  assert.ok(/站点已被平台下线处置/.test(publish), '拦截文案要说明找谁解除');
  // 同一个 SUSPENDED 状态背后是两件事：欠费和合规处置，列表口径混了会误导建站者
  has(SHARED, /if \(offReason && status === 'SUSPENDED'\) return '平台下线'/, '状态文案按处置/欠费分流');
  has(SERVICE, /geoSiteStatusLabel\(row\.status, row\.offReason\)/, '用户侧列表用分流后的文案');
  has(FRONT_ADMIN, /geoSiteStatusLabel\(row\.status, row\.offReason\)/, '台账列表同样分流');
  has(PUBLIC, /site\.offReason/, '停服页要区分处置与欠费两种提示');
});

test('站点数量上限、企业隔离与删除范围', () => {
  has(SERVICE, /total >= settings\.maxSitesPerOwner/, '建站前查上限');
  has(SERVICE, /请先删除不再使用的站点，或联系平台管理员调整上限/, '阻断要给出路');
  has(SETTINGS, /maxSitesPerOwner: GEO_SITE_LIMITS\.maxSitesDefault/, '上限有默认值，不配也能跑');
  has(SERVICE, /geoSiteDomain\.deleteMany\(\{ where: \{ siteId: row\.id \} \}\)/, '删站连带解域名');
  has(SERVICE, /geoSiteBill\.deleteMany\(\{ where: \{ siteId: row\.id \} \}\)/, '删站连带清账单（否则幂等键会拦住下一座同名站点）');
  has(SERVICE, /requireSite\(user/, '每个站点动作都先按归属取站');
  has(SERVICE, /enterpriseId/, '站点按企业隔离');
});

test('契约端点、路由挂载与 DI 三处一致', () => {
  for (const op of [
    'meta',
    'list',
    'create',
    'detail',
    'update',
    'saveContent',
    'publish',
    'unpublish',
    'duplicate',
    'remove',
    'domains',
    'bindDomain',
    'verifyDomain',
    'removeDomain',
    'setPrimaryDomain',
    'billing',
  ]) {
    has(CONTRACT, new RegExp(`GeoSite_${op}: \\{`), `GeoSite_${op} 要在契约登记`);
    has(CONTROLLER, new RegExp(`\\b${op}\\(`), `控制器要有 ${op} 方法`);
  }
  for (const op of ['getSettings', 'saveSettings', 'page', 'offline', 'online', 'stats']) {
    has(CONTRACT, new RegExp(`GeoSiteAdmin_${op}: \\{`), `GeoSiteAdmin_${op} 要在契约登记`);
  }
  has(CONTRACT, /path: "\/enterprise\/admin\/geo-site\/online"/, '解除下线走 admin 路径');
  has(CONTRACT, /path: "\/enterprise\/geo\/site\//, '企业侧端点收敛在 /enterprise/geo/site 前缀下');
  has(ENDPOINTS, /\.\.\.geoSiteEndpoints,/, 'endpoints 要 spread GEO 建站端点');
  has(ROUTES, /moduleHandlers\('GeoSite_', c\.geoSiteController\)/, '企业侧挂控制器');
  has(ROUTES, /moduleHandlers\('GeoSiteAdmin_', c\.geoSiteController\)/, '平台侧挂同一控制器');
  has(SERVICES, /new GeoSiteController\(/, '控制器进 DI 容器');
  has(SERVICES, /new GeoSiteBillingService\(/, '计费服务进 DI 容器');
  has(SERVICES, /new GeoSiteScheduler\(/, '调度器进 DI 容器');
  has(APP, /registerGeoSitePublic\(app, services\)/, '公开渲染通道挂载');
  has(MAIN, /geoSiteScheduler\.onModuleInit\(\)/, '出账与巡检随进程启动');
  assert.ok(count(MAIN, /geoSiteScheduler\.onModuleDestroy\(\)/) >= 2, '异常与退出路径都要停表');
});

test('功能开关：只关建站，不动其它 GEO 能力', () => {
  // 前缀必须比 GEO 其它模块更长，靠最长前缀命中，否则会把采集/分析一起关掉
  has(FEATURE, /'geo-site': \['\/enterprise\/geo\/site'\]/, 'API 前缀单独一条');
  has(FEATURE, /menu\(\s*'geo-site',/, '功能码 geo-site 单独成项');
  has(FEATURE, /'\/marketing-tools\?tab=geo-site'/, '深链入口带 tab 参数');
  has(FRONT_LIST, /useGeoSiteMeta/, '列表读 meta（上限与开关都来自后端，不在前端写死）');
});

test('数据模型双方言一致，幂等键随迁移落库', () => {
  for (const file of SCHEMA_TARGETS) {
    for (const model of ['GeoSite', 'GeoSiteDomain', 'GeoSiteBill']) {
      has(file, new RegExp(`model ${model} \\{`), `${file} 缺 ${model}`);
    }
  }
  has(SCHEMA, /off_by/, '处置操作人列');
  has(SCHEMA, /off_reason/, '处置原因列（用户侧要看到）');
  has(SCHEMA, /billing_from/, '首月折算锚点列');
  const sql = source(MIGRATION);
  const tables = [...sql.matchAll(/CREATE TABLE `(\w+)`/g)].map((m) => m[1]);
  for (const table of ['geo_sites', 'geo_site_domains', 'geo_site_bills']) {
    assert.ok(tables.includes(table), `迁移缺表 ${table}`);
  }
  assert.ok(/UNIQUE INDEX `geo_sites_slug_key`/.test(sql), 'slug 全局唯一');
  assert.ok(/UNIQUE INDEX `geo_site_domains_domain_key`/.test(sql), '域名全局唯一（抢注即冲突）');
  assert.ok(
    /UNIQUE INDEX `geo_site_bills_site_period_uniq`\(`site_id`, `period_month`\)/.test(sql),
    '账单按 [站点, 月份] 唯一，这是月费不重复扣的最后一道保险',
  );
});

test('前端接线：独立站已拆成一级页面，旧 ?tab=geo-site 直接跳转', () => {
  has(FRONT_PAGE, /import \{ GeoSiteView \} from "\.\/_components\/geo-site-list"/, '国际独立站页面挂站内建站器');
  has(FRONT_PAGE, /PAGE_META\["\/international-site"\]/, '页面标题走统一路由元数据');
  has(
    FRONT_GEO_TAB,
    /get\("tab"\) === "geo-site"\)[\s\S]{0,80}window\.location\.replace\("\/international-site"\)/,
    '功能目录的旧深链 ?tab=geo-site 要跳转到独立页面',
  );
  lacks(FRONT_GEO_TAB, /GeoSiteView/, 'GEO 页签不再内嵌建站器');
  lacks(FRONT_GEO_TAB, /dashboard\/geo-sites/, '旧的站外看板外链要拆干净');
  for (const file of implementations(FRONT_DIR)) {
    lacks(file, /https?:\/\/[\w.-]*aiworkin\.com/, '前端不硬编码站外地址');
    lacks(file, /localhost|127\.0\.0\.1|:1690|:3000/, '前端不硬编码本机地址');
  }
  // 用户偏好：进入即加载、写后自动重拉，列表页不放手动刷新按钮
  for (const file of [FRONT_LIST, FRONT_ADMIN]) {
    lacks(file, />刷新<|icon=\{<ReloadOutlined/, `${file} 不许有手动刷新按钮`);
  }
  has(FRONT_QUERY, /useBusinessQuery/, '查询走 business hook（失效重拉统一生效）');
  // 弹窗都是 destroyOnHidden：Form 实例只在打开后挂上，回填/清空必须等 afterOpenChange，否则控制台报「useForm 未连接」
  has(FRONT_EDITOR, /afterOpenChange=\{seedSetting\}/, '站点设置表单在弹窗打开后才回填');
  has(
    FRONT_LIST,
    /afterOpenChange=\{\(open\) => \{[\s\S]{0,200}?form\.resetFields\(\)/,
    '新建表单在弹窗打开后才清空',
  );
  has(FRONT_QUERY, /online: useBusinessMutation/, '解除下线在前端接线');
  has(FRONT_API, /adminOnline: endpoint\(endpoints\.GeoSiteAdmin_online\)/, '前端 API 层登记解除下线');
  has(FRONT_ADMIN, /解除下线/, '台账给出解除按钮');
  has(FRONT_ADMIN, /Popconfirm/, '解除要二次确认');
  has(
    FRONT_ADMIN_TAB,
    /key: "sites"[\s\S]{0,80}<GeoSiteLedgerView \/>/,
    '台账挂进独立站管理',
  );
  has(FRONT_ADMIN_TAB, /GeoSiteSettingsView/, '建站设置挂进独立站管理');
  has(FRONT_EDITOR, /site\.offReason/, '编辑器的停服横幅显示处置原因');
  has(FRONT_EDITOR, /未保存的修改/, '离开编辑器要提醒脏数据');
  has(FRONT_DOMAINS, /row.txtName/, '域名面板把 TXT 记录名直接给出来（可复制）');
  has(FRONT_DOMAINS, /rows.length >= maxDomains/, '额度用满时在按钮上先拦住，不等后端报错');
  has(FRONT_DOMAINS, /ICP 备案/, '绑定前要求承诺备案');
  has(FRONT_BILLING, /rowKey="periodMonth"/, '账单面板按月列出扣费流水');
  has(FRONT_CANVAS, /RawImg/, '画布里的图走本站封装');
  has(FRONT_TREE, /function replaceChild\(/, '元素树改写走同一套纯函数');
  has(FRONT_LABELS, /geo_site: "GEO 独立站月费"/, '积分流水与用量都显示主体名');
});

test('建站模板：够选、字段齐、每个都能直接发布', () => {
  const TPL = `${DIR}/geo-site.templates.ts`;
  const text = source(TPL);
  const keys = [...text.matchAll(/^ {4}key: '([a-z-]+)',$/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 10, `模板至少 10 套（现 ${keys.length} 套），用户才有得挑`);
  assert.equal(new Set(keys).size, keys.length, '模板 key 不许重复');
  assert.ok(keys.includes('geo-landing'), '缺省模板 geo-landing 必须在');
  has(TPL, /export const DEFAULT_TEMPLATE_KEY = 'geo-landing'/, '新建站点的缺省模板要指向 geo-landing');
  // 选择器缩略图要吃这些字段，缺一个前端就会显示成空白卡片
  for (const field of ['tag:', 'theme:', 'accent:', 'heroBg:']) {
    assert.ok(text.includes(field), `模板缺少 ${field} 字段（选择器缩略图依赖它）`);
  }
  assert.ok(
    count(TPL, /\.\.\.geoSiteSeoDefaults/) >= 1,
    'SEO 默认值必须铺底，否则发布页没有 canonical/og 口径',
  );
  // href 只允许站内锚点：safeSiteUrl 会拦掉 mailto:/tel:，模板里写了等于点了没反应
  const hrefs = [...text.matchAll(/href: '([^']*)'/g)].map((m) => m[1]);
  for (const href of hrefs) {
    assert.ok(
      href === '' || href.startsWith('#') || href.startsWith('/'),
      `模板链接 ${href} 过不了 safeSiteUrl 白名单`,
    );
  }
  has(FRONT_LIST, /role="radiogroup"/, '模板选择器整组可键盘操作');
  has(FRONT_LIST, /heroIsDark/, '缩略图按首屏明暗切换骨架条颜色，避免深字压深底');
});

test('访问通道：主站路径与自定义域名两条路都要通', () => {
  has(NEXT_CONFIG, /source: "\/geo-site\/:slug"/, '主站域名下 /geo-site/:slug 透传后端');
  has(
    NEXT_CONFIG,
    /source: "\/geo-site\/:slug\/:path\*"/,
    '子页面与爬虫三件套一起透传（站点已是多页结构，只转首页会点不动导航）',
  );
  has(
    NEXT_CONFIG,
    /if \(process\.env\.NODE_ENV === "production"\) return publicPaths/,
    '公开路径生产环境也要 rewrite（否则主站域名下打不开站点）',
  );
  has(NGINX, /location = \/_geo-site\/probe/, '探针单独转发');
  has(NGINX, /api\/public\/geo-sites\/by-host/, '按 Host 反查站点');
  has(NGINX, /api\/public\/geo-sites\/by-host\/llms\.txt/, '自定义域名下的 llms.txt');
});

/* ------------------------------------------------------------------ *
 * 站点 CMS（多页面 / 菜单 / 内容库 / 页面脚本 / 模板库 / 发布台账）
 * ------------------------------------------------------------------ */

test('CMS 数据模型：页面、菜单、内容、模板四张表随迁移落库', () => {
  for (const file of SCHEMA_TARGETS) {
    for (const model of [
      'GeoSitePage',
      'GeoSiteMenuItem',
      'GeoSiteArticle',
      'GeoSiteProduct',
      'GeoSitePublishLog',
      'GeoSiteTemplate',
    ]) {
      has(file, new RegExp(`model ${model} \\{`), `${file} 缺 ${model}`);
    }
  }
  // (siteId, lang, path) 唯一是「同语言内首页唯一 + 路径不冲突」的最后一道保险，靠代码判重迟早会漏
  has(
    SCHEMA,
    /@@unique\(\[siteId, lang, path\], map: "geo_site_pages_site_lang_path_uniq"\)/,
    '页面路径按站点+语言唯一',
  );
  const cms = source(MIG_CMS);
  for (const table of [
    'geo_site_pages',
    'geo_site_menu_items',
    'geo_site_articles',
    'geo_site_products',
    'geo_site_publish_logs',
  ]) {
    assert.ok(
      new RegExp(`CREATE TABLE .*${table}`).test(cms),
      `迁移 0099 缺表 ${table}`,
    );
  }
  assert.ok(
    /UNIQUE INDEX `geo_site_pages_site_path_uniq`\(`site_id`, `path`\)/.test(cms),
    '页面唯一键初始版本由 0099 建出',
  );
  // 多语言上线后必须把旧唯一键换成 (site_id, lang, path)，否则同名英文页建不出来
  const lang = source(MIG_LANG);
  assert.ok(
    /DROP INDEX `geo_site_pages_site_path_uniq`/.test(lang) &&
      /ADD UNIQUE INDEX `geo_site_pages_site_lang_path_uniq`\(`site_id`, `lang`, `path`\)/.test(lang),
    '多语言迁移要把页面唯一键换成 (site_id, lang, path)',
  );
  assert.ok(
    /ADD UNIQUE INDEX `geo_site_articles_site_lang_slug_uniq`\(`site_id`, `lang`, `slug`\)/.test(lang) &&
      /ADD UNIQUE INDEX `geo_site_products_site_lang_slug_uniq`\(`site_id`, `lang`, `slug`\)/.test(lang),
    '文章与产品 slug 也按语言各自唯一',
  );
  assert.ok(
    /CREATE TABLE .*geo_site_templates/.test(source(MIG_TPL)),
    '迁移 0100 建模板表',
  );
});

test('多页面不变量：首页唯一、存量站点懒建回落、删页连带清菜单', () => {
  has(PAGE, /async ensureHome\(siteId: number\)/, '存量站点懒建首页（否则老站点进 CMS 是空白页）');
  has(
    PAGE,
    /where: \{ siteId_lang_path: \{ siteId, lang, path: '' \} \}/,
    '懒建按 (siteId, lang, path) 幂等',
  );
  has(PAGE, /Array\.isArray\(site\.content\) \? site\.content : \[\]/, '懒建首页把 geo_sites.content 灌进页面表');
  has(PAGE, /的首页已存在，请直接编辑或另建带路径的页面/, '同语言的新建不许再占首页路径');
  has(PAGE, /'首页不能删除：站点至少要保留一个首页'/, '首页删不掉');
  has(PAGE, /'首页不能下线：整站下线请用站点列表的「下线」'/, '首页不能单独下线（否则站点根路径 404）');
  has(PAGE, /path: `page-\$\{current\.id\}`, isHome: 0/, '换首页时原首页腾出路径而不是丢内容');
  has(PAGE, /targetType: 'PAGE', targetId: row\.id/, '删页面连带清掉指向它的菜单项');
  has(PAGE, /normalizePagePath\(body\.path\)/, '路径统一归一化（前后斜杠、大小写、越界段）');
  has(PAGE, /assertCapacity\(site\.id\)/, '单站页面数封顶');
  has(SHARED, /maxPagesPerSite/, '页面上限是共享常量，不散落魔法数');
  // 首页双写：管理端预览与 rendered-html 读的是站点列，不写就会出现两份首页；
  // 多语言后只把「默认语言首页」写回站点列，其他语言的首页不该覆盖站点主口径。
  const save = between(PAGE, 'async saveContent(', 'async saveScripts(', '页面草稿保存');
  assert.ok(
    /\(row\.isHome \|\| row\.path === ''\)/.test(save) &&
      /this\.prisma\.geoSite\.update\(\{/.test(save) &&
      /normalizeLanguage\(row\.lang, site\.defaultLanguage\)/.test(save),
    '默认语言首页草稿必须双写 geo_sites.content',
  );
});

test('页面自定义 JS：内联与白名单外一律拒，平台/站点/独立域名三道闸缺一不可', () => {
  has(SHARED, /'只允许 https 绝对地址，且不支持内联脚本'/, '内联脚本与非 https 直接进拒绝列表');
  has(SHARED, /hostMatchesScriptPattern\(host, whitelist\)/, '主机必须逐条过平台白名单');
  has(SHARED, /export function normalizeScriptEntries/, '脚本归一化只有共享层一个实现点');
  has(SHARED, /maxScriptsPerPage/, '单页脚本条数封顶');
  // 落库前就过滤，渲染层才敢不再净化：顺序反了等于把脏数据存进线上快照
  const scripts = between(PAGE, 'async saveScripts(', 'async reorder(', '页面脚本保存');
  assert.ok(/if \(!settings\.customScriptEnabled\)/.test(scripts), '闸一：平台总开关');
  assert.ok(/settings\.scriptHostWhitelist/.test(scripts), '闸一之二：按平台白名单过滤');
  assert.ok(/rejected/.test(scripts), '被拒的条目要原样回给用户看原因');
  const publish = between(PAGE, 'async publish(', 'async offline(', '页面发布');
  assert.ok(
    /normalizeScriptEntries\(row\.scripts, whitelist\)/.test(publish),
    '发布时按当下白名单再过滤一次：平台收紧后旧草稿不许照原样上线',
  );
  has(RENDER_DATA, /if \(!fromHost \|\| site\.scriptsEnabled !== 1\) return \[\];/, '闸二+闸三：站点开关与独立域名');
  const tags = between(RENDER, 'function scriptTags(', '\n}', '脚本标签渲染');
  assert.ok(/\/\^https:\\\/\\\/\//i.test(tags), '渲染只认 https 绝对地址（第二道兜底）');
  assert.ok(/escapeHtml\(script\.src\)/.test(tags), '脚本地址仍要转义后再拼进 HTML');
  assert.ok(!/dangerouslySetInnerHTML|innerHTML/.test(tags), '脚本注入不许走内联 HTML 拼接之外的口子');
});

test('菜单只能链到本站对象，链不到就整项不渲染', () => {
  has(MENU, /private normalizeTargetType/, '菜单目标类型有白名单');
  has(MENU, /await this\.assertTargetOwned\(site\.id, targetType, targetId\)/, '建菜单先验目标归属本站');
  has(MENU, /if \(row\.targetType === 'PAGE'\) return online\.pages\.has\(row\.targetId\);/, '导航只挂线上存在的页面');
  has(MENU, /online\.articles\.has\(row\.targetId\)/, '文章下线后导航同步消失');
  has(CONTENT, /where: \{ siteId: row\.siteId, targetType, targetId: row\.id \}/, '删内容连带清菜单');
  has(CONTENT, /uniqueSlug\(kind, site\.id, lang, body\.slug, title\)/, '内容 slug 同语言内唯一');
  has(CONTENT, /const where: Record<string, unknown> = \{ siteId, status: 'PUBLISHED' \}/, '公开列表只认已发布');
});

test('模板库：套用不越站、落库过元素树、数量封顶，删除结果符合 okResult', () => {
  has(TEMPLATE, /assertElementTree\(body\.content \?\? \[\]\)/, '另存模板与页面同一道结构闸');
  has(TEMPLATE, /MAX_TEMPLATES_PER_SITE = 100/, '单站模板数封顶');
  has(TEMPLATE, /if \(row\.siteId !== site\.id\)/, '改他人模板即拒');
  has(TEMPLATE, /if \(page\.siteId !== template\.siteId\)/, '跨站套用即拒（防把内容写进别人页面）');
  has(TEMPLATE, /return this\.pages\.saveContent\(user, \{ id: page\.id, content \}\);/, '套用统一走页面保存（首页双写不被绕过）');
  // okResult 的 message 是必填字段：漏了会在写库成功之后因响应校验回 500，比不返回更难查
  has(TEMPLATE, /return \{ ok: true, message: '[^']+' \};/, '删除模板返回带 message 的 okResult');
  has(SERVICE, /geoSiteTemplate\.deleteMany\(\{ where: \{ siteId: row\.id \} \}\)/, '删站连带清模板');
  // 内置页面模板的骨架本身也是元素树，写坏了新用户一进 CMS 就拿到脏画布
  has(PAGE_TPL, /export function pageTemplateElements/, '整页模板可按 key 取骨架');
  has(PAGE_TPL, /export function pageTemplateOf/, '页面类型缺省骨架');
});

test('发布台账是旁路：写失败绝不中断发布，四类对象都要留痕', () => {
  const writer = between(LOG, 'export async function writeGeoSitePublishLog', '\n}\n', '台账写入');
  assert.ok(/try \{/.test(writer) && /catch/.test(writer), '台账必须包在 try/catch 里');
  assert.ok(/console\.warn/.test(writer), '失败要能在日志里看到，但不能冒泡');
  for (const [file, label] of [
    [SERVICE, '站点发布/下线/平台处置'],
    [PAGE, '页面发布/下线'],
    [CONTENT, '内容发布/下线'],
  ]) {
    assert.ok(
      count(file, /writeGeoSitePublishLog\(/) >= 2,
      `${label} 至少要成对留痕（发布 + 回撤），现 ${count(file, /writeGeoSitePublishLog\(/)} 处`,
    );
  }
  has(SERVICE, /target: 'SITE'/, '整站动作按 SITE 记');
  has(PAGE, /target: 'PAGE'/, '单页动作按 PAGE 记');
  has(CONTENT, /target: kind === 'article' \? 'ARTICLE' : 'PRODUCT'/, '内容动作按类型记');
  // 平台处置与企业自发行动作要分开：混成「整站发布」会让复核的人误读成用户自己发的
  assert.ok(
    count(SERVICE, /target: 'ADMIN'/) >= 2,
    '强制下线与解除处置都要按 ADMIN 留痕（成对出现才看得出闭环）',
  );
  has(LOG, /ADMIN: '平台处置'/, '台账动作文案含平台处置');
  has(SERVICE, /async publishLog\(/, '企业侧可读本站台账');
  has(SERVICE, /Math\.min\(100,/, '台账分页大小封顶，别被人拿 pageSize 拖库');
  has(FRONT_LOG, /useGeoSitePublishLog/, '前端台账面板接线');
});

test('CMS 端点、控制器与 DI 三处一致', () => {
  for (const prefix of ['GeoSitePage_', 'GeoSiteMenu_', 'GeoSiteContent_', 'GeoSiteTemplate_']) {
    has(ROUTES, new RegExp(`moduleHandlers\\('${prefix}', c\\.geoSite\\w+Controller\\)`), `${prefix} 要挂控制器`);
    has(CONTRACT, new RegExp(`${prefix}\\w+: \\{`), `${prefix} 端点要在契约登记`);
  }
  // 页面/内容/模板三组都有同名的 detail/save/remove，靠不同前缀分流；合并到一个控制器会互相覆盖
  assert.ok(
    count(ROUTES, /moduleHandlers\('GeoSite/) >= 4,
    'CMS 每组端点各自成前缀，别图省事合并控制器',
  );
  has(CONTROLLER, /publishLog\(/, '企业侧控制器暴露发布台账');
  has(CMS_CONTROLLER, /class GeoSiteTemplateController/, '模板控制器存在');
  has(CMS_CONTROLLER, /class GeoSitePageController/, '页面控制器存在');
  has(SERVICES, /new GeoSitePageService\(/, '页面服务进 DI');
  has(SERVICES, /new GeoSiteMenuService\(/, '菜单服务进 DI');
  has(SERVICES, /new GeoSiteContentService\(/, '内容服务进 DI');
  has(SERVICES, /new GeoSiteTemplateService\(/, '模板服务进 DI');
  has(FRONT_API, /templateApply: endpoint\(endpoints\.GeoSiteTemplate_apply\)/, '前端 API 登记套用模板');
  has(FRONT_API, /publishLog: endpoint\(endpoints\.GeoSite_publishLog\)/, '前端 API 登记发布台账');
  // CMS 写操作互相引用（菜单指页面、页面取数内容库），只刷一张表会让别的面板停在旧数据
  has(FRONT_QUERY, /const REFRESH = \[SITE, "admin-geo-site"\]/, '站点写操作两侧一起失效');
  assert.ok(
    count(FRONT_QUERY, /useBusinessMutation/) >= 20,
    'CMS 写操作全部经 useBusinessMutation，才有统一的失效重拉',
  );
});

test('工作台面板：页面/菜单/内容库/脚本/模板库/台账六个入口都在，且不塞手动刷新按钮', () => {
  for (const [panel, label] of [
    ['"pages"', '页面'],
    ['"menu"', '菜单'],
    ['"contents"', '内容库'],
    ['"scripts"', '脚本'],
    ['"templates"', '模板库'],
    ['"log"', '台账'],
  ]) {
    has(FRONT_EDITOR, new RegExp(`setPanel\\(${panel.replace(/"/g, '\\"')}\\)`), `编辑器要有${label}面板入口`);
    has(FRONT_EDITOR, new RegExp(`setPanel\\(${panel.replace(/"/g, '\\"')}\\)\}>\\s*\\n\\s*${label}`), `${label}按钮文案要在`);
  }
  for (const file of [FRONT_PAGES, FRONT_MENUS, FRONT_CONTENTS, FRONT_SCRIPTS, FRONT_TEMPLATES, FRONT_LOG]) {
    lacks(file, />刷新<|icon=\{<ReloadOutlined/, `${file} 不许有手动刷新按钮`);
    has(file, /useGeoSite|useBusiness/, `${file} 走查询 hook（进入即加载、写后自动重拉）`);
  }
  has(FRONT_TEMPLATES, /存选中区块/, '区块模板从当前选中节点另存');
  has(FRONT_TEMPLATES, /onApplied/, '套用结果回灌画布，省一次重取也不会把新内容判成脏数据');
  has(FRONT_MENUS, /useGeoSitePickers/, '菜单目标从页面/文章/产品三张短表里选');
  has(FRONT_CONTENTS, /"article"/, '内容库含文章');
  has(FRONT_CONTENTS, /"product"/, '内容库含产品');
  has(FRONT_SCRIPTS, /whitelist/, '脚本面板把平台白名单摊给用户看，别让人反复试');
});

/**
 * 组件库必须覆盖后端白名单：曾经 navBar/footerNav 只在渲染层存在，
 * 站长在「菜单」里加完菜单，左侧却找不到可以拖进页面的菜单区块。
 */
test('组件库覆盖全部动态区块：菜单/列表/详情都能从左侧拖进画布并单独设计', () => {
  const dynamic = [...source(SHARED).matchAll(/^\s*'(\w+)',$/gm)].map(
    (m) => m[1],
  );
  const dynamicTypes = [
    'navBar',
    'footerNav',
    'postList',
    'postGrid',
    'articleBody',
    'articleMeta',
    'relatedPosts',
    'productList',
    'productGrid',
    'productInfo',
  ];
  assert.ok(
    dynamicTypes.every((type) => dynamic.includes(type)),
    '后端动态元素清单变了，守卫脚本要同步',
  );
  for (const type of dynamicTypes) {
    has(FRONT_ELEMENTS, new RegExp(`dynamicItem\\(\\s*"${type}"`), `左侧组件库要有 ${type} 区块`);
    has(FRONT_ELEMENTS, new RegExp(`\\b${type}: \\{ kind:`), `画布预览口径要覆盖 ${type}`);
  }
  has(FRONT_ELEMENTS, /group: "站点模块"/, '动态区块单独成组，不和普通文本/媒体混在一起');
  has(FRONT_ELEMENTS, /"站点模块"/, 'PALETTE_GROUPS 要渲染「站点模块」分组');
  // 画布里必须按真实数据渲染，否则拖进去只是一个空段落，站长没法据此设计
  has(FRONT_CANVAS, /useGeoSiteMenus/, '导航区块预览读真实菜单树');
  has(FRONT_CANVAS, /useGeoSiteContents/, '列表区块预览读真实内容库');
  has(FRONT_CANVAS, /isDynamicType\(node\.type\)/, '画布要把动态区块分流到专属预览');
  has(FRONT_EDITOR, /cms: \{[\s\S]*?siteId/, '编辑器要把站点上下文交给画布取数');
});

/**
 * 顶部导航不许有默认：曾经页面没放导航区块时，渲染层会凭空补一条，
 * 结果站长改不动那条导航（它不在元素树里，画布上也选不到），只能被迫接受。
 */
test('导航只能由页面里的区块产生：渲染层不许再自动补一条', () => {
  lacks(RENDER, /autoNav|autoFooterNav/, '渲染层不许自动补导航');
  lacks(RENDER, /withNav/, 'withNav 补位开关已删除，不该回潮');
  lacks(RENDER, /hasElementOfType/, '「有区块就不补」的判定随补位一起删除');
  has(
    RENDER,
    /hasDynamicElement\(input\.elements\) \? CMS_CSS/,
    'CMS 样式改由元素树里有没有动态区块决定',
  );
  has(RENDER_DATA, /nav,/, '渲染上下文仍要给导航区块提供菜单数据');
});

test('导航区块的文案与空态：没加菜单时提示去「菜单」加，而不是静默空白', () => {
  has(FRONT_CANVAS, /点上方「菜单」/, '导航区块空态要指路到菜单面板');
  has(FRONT_CANVAS, /顶部导航还没有菜单项|页脚导航还没有菜单项/, '区分顶部/页脚两种空态');
  has(FRONT_EDITOR, /本页还没有导航/, '页面没有导航区块时左栏要指路');
  has(FRONT_EDITOR, /hasNavBlock/, '指路提示只在缺导航区块时出现');
});

/**
 * 落点必须先于容器判定：曾经只有 container 接 onDragOver，
 * 指针落在第一个区块上就被根 __body 接走，一律「inside → 追加到末尾」，
 * 于是无论怎么拖都只能排到最后，第一个位置永远到不了。
 */
test('拖拽要能排到最顶部：叶子节点也接落点，before/after 由指针位置决定', () => {
  const view = between(
    FRONT_CANVAS,
    'export function NodeView',
    'export function Canvas',
    'NodeView 里判定落点',
  );
  // 拖拽事件挂在所有节点上，而不是只挂在容器上（否则第一个区块的上沿没有落点）
  has(FRONT_CANVAS, /const container = isContainer\(node\)/, '落点判定要区分容器与叶子');
  assert.ok(
    /onDragOver:[\s\S]*?dropPositionOf\(event, container\)/.test(view),
    `${FRONT_CANVAS} 闸门缺失：onDragOver 要按指针位置算 before/after/inside`,
  );
  assert.ok(
    /onDrop:[\s\S]*?dropPositionOf\(event, container\)/.test(view),
    `${FRONT_CANVAS} 闸门缺失：onDrop 要按指针位置落点，不能一律 inside`,
  );
  // 落点三档与插入线：没有指示线，站长看不出会插到哪
  has(FRONT_CANVAS, /ratio < 0?\.\d+\s*\?\s*"before"/, '上半区要判成 before');
  has(FRONT_CANVAS, /"before" \| "after" \| "inside"|drop === "before" \|\| drop === "after"/, '要有插入位指示');
  // 新元素按落点插入：inside 追加、before/after 插到同级
  has(FRONT_TREE, /export function insertNear\(/, '新建元素要支持按落点插入');
  const insert = between(
    FRONT_TREE,
    'export function insertNear(',
    'export function moveNode(',
    'insertNear 实现',
  );
  assert.ok(
    /position === "before" \? 0 : kids\(target\)\.length/.test(insert),
    `${FRONT_TREE} 闸门缺失：目标是 __body 时 before 要插到首个子级`,
  );
  // 拖拽只能落到 __body 的首/末子级，不能再造出第二个 __body
  const move = between(
    FRONT_TREE,
    'export function moveNode(',
    'export function cloneWithNewIds(',
    'moveNode 实现',
  );
  assert.ok(
    /position === "before" \? 0 : kids\(target\.node\)\.length/.test(move),
    `${FRONT_TREE} 闸门缺失：拖动到 __body 上下沿要落到它的首/末子级`,
  );
  lacks(FRONT_CANVAS, /hoverId|setHover/, '悬停高亮已由落点指示替代，不该残留两套状态');
});
