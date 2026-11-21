import { createHash } from 'node:crypto';
import type {
  MiniGuideAdminView,
  MiniGuideDownloadResult,
  MiniGuideSaveBody,
  MiniGuideView,
} from '@enterprise/contracts';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { resolveSiteUrl } from '../common/site-url';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { ToolCode } from '../tool-launch/tool-launch.catalog';
import {
  MAIN_PACKAGE_LIMIT,
  assertPackageSize,
  buildStoreZip,
  collectTemplate,
  readTemplateMeta,
  templateDirFrom,
} from '../private-mini/package-builder';
import {
  MINI_GUIDE_BY_CODE,
  miniGuideToolName,
  type MiniGuideRootRow,
  type MiniGuideToolMeta,
} from './mini-guide.catalog';

/**
 * 「小程序发布说明」服务。
 *
 * 产品口径（见 contracts/mini-guide.ts）：平台**不替用户编译、不代传微信**，
 * 用户下载平台统一输出的源码分发包（zip），自己在微信开发者工具里填参数、
 * 编译、预览、上传、提审。所以这一页的职责是把「这个账号该填什么」逐条摆出来：
 * - 正文（话术）：管理员在后台维护，存 system_settings 单行 JSON；
 *   缺行 / 坏 JSON 回落到内置默认正文，保证最坏情况仍有完整流程；
 * - 域名清单：由站点设置（resolveSiteUrl）自动生成，微信三类服务器域名同 origin；
 * - 账号参数：apiBase / 租户码 / appid 从**这个账号自己的**根实体取，
 *   取不到就写进 blockers 告诉用户下一步去哪补齐，绝不给空字符串了事。
 */

/** 正文与工具级补充正文的存放键（system_settings 单行 JSON）。 */
const SETTINGS_KEY = 'mini_program_publish_guide';

/** 模板元信息缓存时长：模板文件不随请求变，60 秒足够追上发版。 */
const TEMPLATE_CACHE_MS = 60_000;

/** 内置默认正文：新流程的最小完备话术，后台一行没配也能照着发出去。 */
export const DEFAULT_GUIDE_BODY = [
  '建站管理下的小程序由平台统一输出「源码分发包（zip）」，平台不代编译、不代传微信。',
  '你自己完成以下几步即可上线：',
  '· 下载源码分发包并解压；',
  '· 打开微信开发者工具 → 导入项目，选择解压出来的目录；',
  '· 编辑根目录 config.js：把 apiBase 填成下方「需要填写的参数」里的站点地址（无尾斜杠），租户码按本页给出的值原样填入；',
  '· 编辑 project.config.json：把 appid 换成你自己的小程序 AppID（微信公众平台 → 设置与开发 → 基本设置 可查）；',
  '· 本地调试可在开发者工具「详情 → 本地设置」勾选「不校验合法域名」；正式上传与线上使用必须在微信公众平台配好 request / uploadFile / downloadFile 三类合法域名（见下方清单），否则接口全部不可用；',
  '· 开发者工具预览通过后「上传」代码；',
  '· 到微信公众平台 → 版本管理，提交审核，审核通过后发布。',
  '域名与参数由平台按你的账号自动生成；改站点域名后本页会自动同步。',
].join('\n');

type GuideStore = {
  body: string;
  overrides: Record<string, string>;
  updatedAt: string | null;
};

// 契约里 domain/value/step 只随视图导出，这里从视图类型取子项类型复用
type DomainItem = MiniGuideView['domains'][number];
type ValueItem = MiniGuideView['values'][number];
type StepItem = MiniGuideView['steps'][number];

/** 微信后台要求登记的服务器域名类别：同一站点 origin，每一类都要添加一遍。 */
const WECHAT_DOMAIN_KINDS = [
  'request 合法域名',
  'uploadFile 合法域名',
  'downloadFile 合法域名',
] as const;

const clip = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

function normalizeStore(raw: unknown, rowUpdatedAt: Date | null): GuideStore {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const overrides: Record<string, string> = {};
  const stored = (
    input.overrides && typeof input.overrides === 'object'
      ? input.overrides
      : {}
  ) as Record<string, unknown>;
  for (const [code, value] of Object.entries(stored)) {
    // 只接受合法工具码：改名/下线工具后残留的补充正文自然被丢弃
    if (!MINI_GUIDE_BY_CODE.has(code as ToolCode)) continue;
    const body = clip(value, 6000);
    if (body) overrides[code] = body;
  }
  return {
    body: clip(input.body, 20_000),
    overrides,
    updatedAt:
      typeof input.updatedAt === 'string'
        ? input.updatedAt
        : rowUpdatedAt
          ? rowUpdatedAt.toISOString()
          : null,
  };
}

type TemplateMeta = {
  available: boolean;
  version: string;
  sizeBytes: number;
};

export class MiniGuideService {
  private readonly templateCache = new Map<
    string,
    { value: TemplateMeta; at: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** 读后台正文；缺行 / 坏 JSON 回落默认正文（不写库，读取路径保持无副作用）。 */
  private async loadStore(): Promise<GuideStore> {
    const row = await this.prisma.systemSetting
      .findUnique({ where: { key: SETTINGS_KEY } })
      .catch(() => null);
    if (!row?.value)
      return { body: DEFAULT_GUIDE_BODY, overrides: {}, updatedAt: null };
    try {
      return normalizeStore(JSON.parse(row.value), row.updatedAt);
    } catch {
      return { body: DEFAULT_GUIDE_BODY, overrides: {}, updatedAt: null };
    }
  }

  /** 站点 origin → 微信三类服务器域名清单；未配置时 configured=false 并给出下一步。 */
  private buildDomains(origin: string): DomainItem[] {
    return WECHAT_DOMAIN_KINDS.map((label) => ({
      label,
      origin,
      configured: Boolean(origin),
    }));
  }

  /** 模板元信息：目录缺失只影响展示（available=false），不让说明页 500。 */
  private async templateMeta(meta: MiniGuideToolMeta): Promise<TemplateMeta> {
    if (!meta.template) return { available: false, version: '', sizeBytes: 0 };
    const dir = templateDirFrom(
      meta.template.envName,
      meta.template.fallbackDir,
    );
    const hit = this.templateCache.get(dir);
    if (hit && Date.now() - hit.at < TEMPLATE_CACHE_MS) return hit.value;
    let value: TemplateMeta = { available: false, version: '', sizeBytes: 0 };
    try {
      const read = await readTemplateMeta(dir);
      value = {
        available: read.available,
        version: read.version,
        sizeBytes: read.sizeBytes,
      };
    } catch {
      // 模板目录缺失：pkg.available=false，页面照常出，下载入口由各自发布页处理
    }
    this.templateCache.set(dir, { value, at: Date.now() });
    return value;
  }

  /** 固定操作步骤：不依赖后台正文，最坏情况（正文为空）也有完整流程可走。 */
  /**
   * 步骤清单。
   * - 具体工具：按该工具的 config.js 键名写清要填什么；
   * - 通用版（建站管理板块右侧抽屉、帮助中心章节）：给一套与工具无关的通用步骤，
   *   再回落成空数组会让用户看到"稍后会自动出现"，而后台其实一直在维护；
   * - Web 工具（国际独立站）：不产出小程序包，返回空由前端给出定向说明。
   */
  private genericSteps(): StepItem[] {
    return [
      {
        title: '在对应工具的发布页直接下载源码包',
        detail:
          '点「下载源码包」直接得到平台统一模板源码（zip），不需要先出包；包内不含任何账号参数。',
      },
      {
        title: '导入微信开发者工具',
        detail:
          '微信开发者工具 → 导入项目 → 选择解压出来的目录，AppID 先填你自己的小程序 AppID。',
      },
      {
        title: '填 config.js 参数',
        detail:
          '把 apiBase 填成下方「服务器域名清单」里的站点前缀（无尾斜杠），租户码（shopCode / siteCode / marketCode 之一，看工具）填该工具发布页给出的值。',
      },
      {
        title: '填 project.config.json 的 appid',
        detail: '微信公众平台 → 设置与开发 → 基本设置 里可查自己的 AppID。',
      },
      {
        title: '配服务器域名',
        detail:
          '微信公众平台 → 开发管理 → 开发设置 → 服务器域名，把 request / uploadFile / downloadFile 三栏都填成站点前缀；本地调试可临时勾选「不校验合法域名」。',
      },
      {
        title: '预览自测',
        detail: '首页能拉到数据、能登录、能下单再谈上传，避免上传后白屏。',
      },
      {
        title: '上传并提审发布',
        detail:
          '开发者工具「上传」→ 微信公众平台 → 版本管理 → 提交审核 → 审核通过自行发布。',
      },
    ];
  }

  private buildSteps(meta?: MiniGuideToolMeta): StepItem[] {
    if (!meta) return this.genericSteps();
    if (!meta.hasPackage) return [];
    const tenantKey = meta.tenant?.configKey;
    const fillDetail = tenantKey
      ? `打开解压目录根部的 config.js，把 apiBase 与 ${tenantKey} 按本页「需要填写的参数」逐条复制填入（apiBase 无尾斜杠）。`
      : '打开解压目录根部的 config.js，按本页「需要填写的参数」逐条复制填入。';
    return [
      {
        title: '下载源码分发包',
        detail:
          '在本工具的发布页（或「建站管理 → 小程序」）下载平台统一输出的源码分发包（zip）并解压。统一包不含任何账号参数，参数由你在下一步自己填。',
      },
      {
        title: '导入微信开发者工具',
        detail:
          '微信开发者工具 → 导入项目 → 选择解压出来的目录；AppID 先用你自己的（没有可到微信公众平台注册一个测试号先本地跑）。',
      },
      { title: '填 config.js 参数', detail: fillDetail },
      {
        title: '填 project.config.json 的 appid',
        detail:
          '把 "appid" 改成你的小程序 AppID（微信公众平台 → 设置与开发 → 基本设置）。',
      },
      {
        title: '配置微信服务器域名',
        detail:
          '微信公众平台 → 开发管理 → 开发设置 → 服务器域名：把下方域名清单里的 origin 分别加入 request / uploadFile / downloadFile 三类。「不校验合法域名」勾选仅限开发者工具本地调试，线上必须配好域名。',
      },
      {
        title: '预览与上传代码',
        detail:
          '真机预览核心流程（下单/支付回跳/我的）通过后，点「上传」填写版本号与备注。',
      },
      {
        title: '提审与发布',
        detail:
          '微信公众平台 → 版本管理 → 提交审核；审核通过后点「发布」。类目、隐私接口声明按微信公众平台提示补齐。',
      },
    ];
  }

  /** 本账号要填的参数值：apiBase + 租户码 + appid；取不到的进 blockers。 */
  private async buildValues(
    user: CurrentUser,
    meta: MiniGuideToolMeta,
    origin: string,
    blockers: string[],
  ): Promise<ValueItem[]> {
    const values: ValueItem[] = [
      {
        key: 'apiBase',
        label: 'API 基址（站点域名）',
        value: origin || '（站点域名未配置，见下方提示）',
        hint: 'config.js → apiBase 字段，整段复制、不要带结尾斜杠',
      },
    ];
    let root: MiniGuideRootRow | undefined;
    if (meta.tenant) {
      const roots = await meta.tenant.listRoots(this.prisma, user.userId);
      root = roots.find((item) => item.code) || roots[0];
      if (root?.code) {
        const multiHint = meta.tenant.multiRoot
          ? `；当前展示的是「${root.name}」，多店铺/站点请分别到各自发布页查看`
          : '';
        values.push({
          key: meta.tenant.configKey,
          label: meta.tenant.label,
          value: root.code,
          hint: `config.js → ${meta.tenant.configKey} 字段；取值来源：${meta.tenant.source}${multiHint}`,
        });
      } else {
        blockers.push(
          `还没查到你的${meta.rootNoun}寻址码：请先到「建站管理 → ${miniGuideToolName(meta.code)}」创建${meta.rootNoun}，创建后本页会自动带出应填的 ${meta.tenant.configKey}。`,
        );
      }
    }
    // AppID：知识付费挂在站点行 wxAppId，其余场景按 (scene, shopId) 查 miniprogram_apps
    let appId = '';
    if (meta.scene && root) {
      const app = await this.prisma.miniProgramApp
        .findUnique({
          where: {
            ownerUserId_scene_shopId: {
              ownerUserId: user.userId,
              scene: meta.scene,
              shopId: meta.tenant?.accountLevel ? 0 : root.id,
            },
          },
        })
        .catch(() => null);
      appId = app?.appId || '';
    } else if (root?.appId) {
      appId = root.appId;
    }
    values.push({
      key: 'appid',
      label: '小程序 AppID',
      value: appId || '（尚未登记，填你自己小程序的 AppID）',
      hint:
        'project.config.json → "appid" 字段；AppID 在微信公众平台 → 设置与开发 → 基本设置查询。' +
        (meta.scene
          ? '也可在「小程序主体凭据」里登记后由本页自动带出。'
          : '在知识付费站点设置里保存后由本页自动带出。'),
    });
    return values;
  }

  /**
   * 直接下载源码包：按工具码读模板 → 现打 zip → 对象存储 → 返回直链。
   *
   * 产品口径（2026-11-19）：不再有「生成代码包」这一步，也不写发布台账；
   * 包是平台统一模板源码（不含账号参数），每次点下载都按当前模板现打一份，
   * 对象键用内容哈希，同一份模板重复下载只覆盖同一个对象。
   */
  async downloadPackage(
    user: CurrentUser,
    tool: ToolCode,
  ): Promise<MiniGuideDownloadResult> {
    const meta = MINI_GUIDE_BY_CODE.get(tool);
    if (!meta) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '未知的小程序工具');
    }
    if (!meta.hasPackage || !meta.template) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `「${miniGuideToolName(tool)}」是 Web 产物，不提供小程序源码包`,
      );
    }
    const dir = templateDirFrom(
      meta.template.envName,
      meta.template.fallbackDir,
    );
    const entries: Awaited<ReturnType<typeof collectTemplate>> =
      await collectTemplate(dir).catch(
        () => [] as Awaited<ReturnType<typeof collectTemplate>>,
      );
    if (!entries.some((entry) => entry.name === 'app.json')) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `${miniGuideToolName(tool)} 的小程序模板暂不可用（模板目录 ${dir}），请确认仓库模板完整后重试`,
      );
    }
    const bytes = buildStoreZip(entries);
    assertPackageSize(bytes.length, entries.length);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const fileName = `${tool}-miniprogram-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}.zip`;
    const stored = await this.storage.put(
      `enterprise/${user.userId}/mini-source/${tool}/${sha256.slice(0, 16)}.zip`,
      bytes,
    );
    return {
      url: this.storage.urlOf(stored.key),
      fileName,
      fileSize: bytes.length,
      sha256,
    };
  }

  /** 用户侧视图：某工具（或通用）的发布说明，含本账号参数与域名清单。 */
  async viewForUser(
    user: CurrentUser,
    tool?: ToolCode,
  ): Promise<MiniGuideView> {
    const store = await this.loadStore();
    const blockers: string[] = [];
    const origin = await resolveSiteUrl(this.prisma);
    if (!origin) {
      blockers.push(
        '站点域名尚未配置：请平台管理员到「平台管理后台 → 站点设置 → 站点域名」填写对外 https 域名（如 https://example.com）。填好后本页的 apiBase 与微信合法域名清单会自动生成；在此之前请勿把包内的 apiBase 指向 localhost 提审。',
      );
    }
    const meta = tool ? MINI_GUIDE_BY_CODE.get(tool) : undefined;
    const body =
      (meta && store.overrides[meta.code]) || store.body || DEFAULT_GUIDE_BODY;
    const domains = meta && !meta.hasPackage ? [] : this.buildDomains(origin);
    const values =
      meta && meta.hasPackage
        ? await this.buildValues(user, meta, origin, blockers)
        : [];
    if (meta && !meta.hasPackage) {
      blockers.push(
        `「${miniGuideToolName(meta.code)}」是 Web 产物，不提供小程序源码分发包：站点请在「国际独立站 → 站点管理 → 发布」直接发布（平台子域或绑定自有域名），无需走微信开发者工具。`,
      );
    }
    const template =
      meta && meta.hasPackage ? await this.templateMeta(meta) : null;
    const view: MiniGuideView = {
      toolCode: meta ? meta.code : null,
      toolName: meta ? miniGuideToolName(meta.code) : '小程序发布说明',
      body,
      domains,
      values,
      steps: this.buildSteps(meta),
      pkg: {
        available: Boolean(template?.available),
        fileName: meta && meta.hasPackage ? `${meta.code}-miniprogram.zip` : '',
        version: template?.version || '',
        sizeBytes: template?.sizeBytes || 0,
        withinLimit: (template?.sizeBytes || 0) <= MAIN_PACKAGE_LIMIT,
        // 统一包是平台产物，**不含账号参数**（新口径的关键区别：旧「按店注入」路径已废弃，
        // 这个字段恒为 false，防止有人以后又把注入加回统一包路径）。
        injected: false,
      },
      blockers,
      updatedAt: store.updatedAt,
    };
    return view;
  }

  /** 通用说明（建站管理·小程序板块右侧）：正文 + 域名 + 步骤，不含账号参数。 */
  async sharedView(): Promise<MiniGuideView> {
    const store = await this.loadStore();
    const blockers: string[] = [];
    const origin = await resolveSiteUrl(this.prisma);
    if (!origin) {
      blockers.push(
        '站点域名尚未配置：请平台管理员到「平台管理后台 → 站点设置 → 站点域名」填写对外 https 域名，各工具发布页的合法域名清单由它自动生成。',
      );
    }
    return {
      toolCode: null,
      toolName: '建站管理 · 全部小程序',
      body: store.body || DEFAULT_GUIDE_BODY,
      domains: this.buildDomains(origin),
      values: [],
      steps: this.buildSteps(),
      pkg: {
        available: false,
        fileName: '',
        version: '',
        sizeBytes: 0,
        withinLimit: true,
        injected: false,
      },
      blockers,
      updatedAt: store.updatedAt,
    };
  }

  async adminView(): Promise<MiniGuideAdminView> {
    const store = await this.loadStore();
    return {
      body: store.body,
      overrides: Object.entries(store.overrides).map(([code, body]) => ({
        toolCode: code as ToolCode,
        toolName: miniGuideToolName(code as ToolCode),
        body,
      })),
      updatedAt: store.updatedAt,
    };
  }

  /** 保存正文：管理员校验在控制器做（与 ToolLaunchAdmin/MarketplaceAdmin 同一装配口径）。 */
  async save(user: CurrentUser, body: MiniGuideSaveBody) {
    const overrides: Record<string, string> = {};
    for (const item of body.overrides || []) {
      if (!MINI_GUIDE_BY_CODE.has(item.toolCode)) continue;
      const text = clip(item.body, 6000);
      if (text) overrides[item.toolCode] = text;
    }
    const store = {
      body: clip(body.body, 20_000),
      overrides,
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: JSON.stringify(store) },
      create: { key: SETTINGS_KEY, value: JSON.stringify(store) },
    });
    void user; // 预留操作人：管理员审计走平台统一 audit 链，这里不落额外字段
    return this.adminView();
  }
}
