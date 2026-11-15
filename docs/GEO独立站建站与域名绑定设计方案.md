# 营销工具 · GEO 独立站（Framely 建站器）改造设计方案

> 版本：v0.1（草案，待用户确认决策点后进入开发）
> 日期：2026-11-13
> 参考包：Framely（`C:\Users\Administrator\Downloads\Framely-main.zip`，MIT，已解压到 `E:\wwwroot\oem-enterprise-backups\framely-ref\Framely-main`，仅思路与代码范式参考，不整体引入）
> 需求：①把营销工具 GEO 里的「GEO 建站（独立站）」入口从外链换成站内可用的拖拽建站工具；②用户可自己绑定域名；③平台管理员可配置按月扣积分。
> 口径约束（沿用既有决策）：不引入第二套账号体系；所有 AI 调用走系统模型网关；出站请求走统一 transport 层；积分计费复用 `module_pricing` + 日批；数据永不自动删除，欠费只冻结。

---

## 一、现状：要替换的到底是什么

一句话结论：**当前「GEO 建站」不是一个功能，是一个硬编码外链按钮。**

| 位置 | 现状 |
|---|---|
| [geo-tab.tsx:29](file:///E:/wwwroot/oem-enterprise/frontend/src/app/marketing-tools/_components/geo-tab.tsx#L29) | `const GEO_SITE_URL = "https://aiworkin.com/cn/dashboard/geo-sites"` |
| [geo-tab.tsx:37](file:///E:/wwwroot/oem-enterprise/frontend/src/app/marketing-tools/_components/geo-tab.tsx#L37) | 页签 `{ value: "site", label: "GEO 建站" }` |
| [geo-tab.tsx:201-219](file:///E:/wwwroot/oem-enterprise/frontend/src/app/marketing-tools/_components/geo-tab.tsx#L201-L219) | 提示「建站、内容发布与看板都在那边，本系统不保存建站数据」+ `window.open` |
| [marketing-tools/page.tsx:155-161](file:///E:/wwwroot/oem-enterprise/frontend/src/app/marketing-tools/page.tsx#L155-L161)、[:256](file:///E:/wwwroot/oem-enterprise/frontend/src/app/marketing-tools/page.tsx#L256) | 工具卡描述与首屏长文案都写明「新窗口打开 AIworkin GEO 独立站看板」 |
| [config/routes.ts:621](file:///E:/wwwroot/oem-enterprise/frontend/src/config/routes.ts#L621) | 帮助中心文案同步描述 |

后端侧：**零 surface**。没有站点模型、没有路由、没有表 —— 所以本次是纯新建，不存在历史数据迁移，只需按「导航结构调整同步修改规范」把上述 4 处文案一起改掉，并删掉硬编码域名（违反「禁止硬编码本机地址」既有约束）。

---

## 二、Framely 参考包分析

### 2.1 它实际是什么（读码结论，不是 README 口径）

单表 + 单编辑器 + Host 路由的极简静态站生成器：

- **数据**：`Page` 一张表（[schema.prisma](file:///E:/wwwroot/oem-enterprise-backups/framely-ref/Framely-main/prisma/schema.prisma)）：`userId / title / previewImage / favicon / visible / content(LongText JSON) / subdomain(@unique)`。
- **内容模型**：元素树 `EditorElement = { id, styles: React.CSSProperties, name, type, category, content: EditorElement[] | { innerText | imageUrl|href|destinationUrl } }`，整棵树 `JSON.stringify` 存进 `content`（[editor-provider.tsx:10](file:///E:/wwwroot/oem-enterprise-backups/framely-ref/Framely-main/src/app/providers/editor-provider.tsx#L10)、[editor-navigation.tsx:107](file:///E:/wwwroot/oem-enterprise-backups/framely-ref/Framely-main/src/app/components/editor/editor-navigation.tsx#L107)）。
- **元素目录**：13 个 —— h1~h6、p、span、container、2Col、3Col、image、link（[elements.ts](file:///E:/wwwroot/oem-enterprise-backups/framely-ref/Framely-main/src/app/components/editor/editor-sidebar/tabs/components-tab/elements.ts)）。`ElementTypes` 里声明了 `video` 但拖放分支没实现，属于半成品。
- **样式面板**：宽/高、margin/padding、border 色/宽/圆角、填充色、透明度、背景图位置、文本对齐、字体/字重/字号/字距/行高、transform（旋转/斜切）。
- **交互实现**：**原生 HTML5 DnD**（`dataTransfer.setData("componentType")`），文本用 `contentEditable`，容器递归渲染 `Recursive`（[container.tsx:23](file:///E:/wwwroot/oem-enterprise-backups/framely-ref/Framely-main/src/app/components/editor/site-editor/editor-components/container.tsx#L23)、[text.tsx:37](file:///E:/wwwroot/oem-enterprise-backups/framely-ref/Framely-main/src/app/components/editor/site-editor/editor-components/text.tsx#L37)）。撤销/重做是 reducer history，图层树 + 设备预览（Desktop/Tablet/Mobile）+ 预览模式齐备。整包只有 63 个 ts/tsx、编辑器内核约 1300 行。
- **交付**：`middleware.ts` 读 `host` 取首段当 subdomain → rewrite 到 `/[domain]` → 服务端读 `content` 用 `liveMode` 渲染；`unstable_cache` 15 分钟 + `revalidateTag(subdomain)` 失效。

### 2.2 README 宣称 vs 实际实现（关键差异，直接决定工作量）

| README 说法 | 代码实际 | 后果 |
|---|---|---|
| "custom domain support" | **完全没实现**。只有 subdomain，`Page.subdomain` 唯一；没有域名表、没有 DNS 校验、没有证书逻辑 | 用户自助绑域名全部要我们自己建（可复用本仓库活码域名范式） |
| "Multi-tenancy" | 只有 `NEXT_PUBLIC_ROOT_DOMAIN` 通配子域 + Host rewrite | 自定义域名的 TLS/回源 Host 要重新设计 |
| 「AI 建站」/SEO | 无任何站点级 SEO：只有全局 `layout.tsx` metadata；`[slug]` 路由是 `Domain Slug Coming Soon` 占位 | 单页站、无 URL 结构、无 sitemap/robots/JSON-LD —— 对「GEO 独立站」是致命缺口，必须自建 |
| 图片 | 只让粘贴 URL，`next/image remotePatterns hostname: "**"` | 任意域外链 → SSRF/热链/合规风险；要改成本站 OSS + 数字资产登记 |
| 账号 | 强绑定 Clerk（`auth()` 散落在每个 server action 与 editor 页面） | 必须整体替换为本站 Hono 会话，不能留 Clerk |
| 移动端 | 编辑器在移动端直接拒绝渲染 | 需保留提示或补齐 |

### 2.3 值得直接借的三点

1. **元素样式内联化（`CSSProperties` 存 JSON）**：发布渲染不依赖 Tailwind/shadcn 类名，这是我们能把编辑器搬进 antd 前端而不产生样式打架的根本原因。
2. **原生 DnD + 递归渲染**：不引入 dnd-kit / craft.js 等重型依赖，代码量小、可读、易改造成受控组件。
3. **content 树 + 唯一 slug + 缓存失效**：发布链路范式可平移（我们的 `unstable_cache` 等价物是本站的 Next Route Cache / `revalidateTag`）。

### 2.4 不借的部分

| Framely 做法 | 本方案 | 原因 |
|---|---|---|
| 独立 Next 15 应用 + Clerk + 独立 MySQL | 移植为本站 `frontend` 内的组件 + 本站会话 | 不引入第二套账号、第二个部署单元、第二个库 |
| Prisma 6 + `LongText` 裸字符串 | 本站 Prisma 5.22，`content Json` + `@@map`，MySQL/PG 双库 | 双库平滑兼容是既有硬需求 |
| middleware 读 Host 分流 | 公开路由 `/geo-site/[slug]` + 域名解析中间件（活码 `x-lk-site` 范式） | 本站前端无 middleware，nginx 只有一条 `server_name` |
| Umami 埋点 | 复用本站访问统计/资产台账 | 不额外引第三方脚本 |
| 只有 13 个元素 | 扩到落地页/GEO 所需元素 + 模板 | 原目录做不出可交付的营销站 |

---

## 三、集成形态选型（决策点 1）

| 方案 | 说明 | 成本 | 判断 |
|---|---|---|---|
| **A. 站内移植（推荐）** | 把 reducer/DnD/递归渲染/元素目录移植进 `frontend`，外壳用 antd 重写，数据与鉴权走本站契约 | 中（内核 ~1300 行 + 外壳重写） | ✅ 身份、org 隔离、积分、OSS、域名、审计全在本站，天然复用；无跨域 iframe 认证问题 |
| B. 独立服务 + iframe | 保留 Framely 原样部署在子域，改 Clerk 为本站会话校验 | 高（多一个部署单元 + 会话桥 + CSP + 双库） | ❌ 需要第二套账号/计费/OSS，且违背「不引入第二套账号」 |
| C. monorepo 子应用 | Framely 作为 `packages/framely`，与本站共享 Prisma client | 中高 | ⚠️ 仍是两个 Next 版本、两套 UI 库同时维护，收益不及 A |

**选 A。** 注意：MIT 允许移植改造，README/版权头保留出处声明；移植后不再跟进上游（作者已停止更新，风险可接受）。

另需说明：仓库里已有 [LowCodePage](file:///E:/wwwroot/oem-enterprise/backend/prisma/schema.prisma#L5653)（低代码应用页面，`config Json` 可存 CUSTOM 画布组件树）与 AI 画布，但它们面向**内部业务应用页**，字段绑定/权限模型与对外营销站完全不同，**不复用其引擎**，只沿用「组件树存 Json」这一存储范式。

---

## 四、数据模型（Prisma，MySQL 主 + PG 生成物，迁移号 `0097_geo_site_builder`）

```prisma
/// GEO 独立站（营销工具 · GEO · 建站）
model GeoSite {
  id             Int      @id @default(autoincrement())
  /// 归属账号（与 GeoProject 同口径：企业用户本人 / 代客作业职员）
  ownerUserId    String   @map("owner_user_id") @db.VarChar(64)
  enterpriseId   Int      @default(0) @map("enterprise_id")
  /// 关联 GEO 项目（0 = 未关联；用于把品牌上下文与选题灌进站点）
  geoProjectId   Int      @default(0) @map("geo_project_id")
  title          String   @db.VarChar(120)
  /// 平台子域 slug：{slug}.<站点域名>，全局唯一、小写字母数字连字符
  slug           String   @unique @db.VarChar(63)
  /// 元素树 JSON（Framely EditorElement[] 同构）
  content        Json     @default("[]")
  /// 站点级 SEO/GEO 档案 JSON：meta/OG/JSON-LD/hreflang/llms.txt 开关
  seo            Json     @default("{}")
  favicon        String   @default("") @db.VarChar(500)
  coverImage     String   @default("") @db.VarChar(500)
  /// DRAFT | PUBLISHED | SUSPENDED（欠费停服，数据保留）
  status         String   @default("DRAFT") @db.VarChar(16)
  publishedAt    DateTime? @map("published_at") @db.DateTime
  /// 发布快照：线上读这份，编辑草稿不影响线上
  publishedContent Json?   @map("published_content")
  /// 计费周期锚点（首次计费月）
  billingFrom    DateTime  @default(now()) @map("billing_from")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  @@index([ownerUserId])
  @@index([enterpriseId])
  @@index([status])
  @@map("geo_sites")
}

/// 用户绑定的自定义域名（一域名一行，站点可多域名）
model GeoSiteDomain {
  id          Int      @id @default(autoincrement())
  siteId      Int      @map("site_id")
  ownerUserId String   @map("owner_user_id") @db.VarChar(64)
  domain      String   @unique @db.VarChar(253)
  /// 随机探针令牌，仿活码 domainKey
  verifyToken String   @map("verify_token") @db.VarChar(32)
  /// PENDING | VERIFYING | ACTIVE | ERROR | DISABLED
  status      String   @default("PENDING") @db.VarChar(16)
  /// 主域名（canonical，一个站只有一个）
  isPrimary   Int      @default(0) @map("is_primary") @db.TinyInt
  lastCheckAt DateTime? @map("last_check_at") @db.DateTime
  lastError   String   @default("") @map("last_error") @db.VarChar(500)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  @@index([siteId])
  @@map("geo_site_domains")
}

/// 站点月度账单：唯一键 (siteId, periodMonth) 是出账幂等的硬保证
model GeoSiteBill {
  id          Int      @id @default(autoincrement())
  siteId      Int      @map("site_id")
  ownerUserId String   @map("owner_user_id") @db.VarChar(64)
  /// 账期 YYYY-MM
  periodMonth String   @map("period_month") @db.VarChar(7)
  pointsAmount Decimal  @default(0) @map("points_amount") @db.Decimal(18, 4)
  /// CHARGED | FAILED_ARREARS | WAIVED
  status      String   @default("CHARGED") @db.VarChar(16)
  txId        Int      @default(0) @map("tx_id")
  createdAt   DateTime @default(now()) @map("created_at")
  @@unique([siteId, periodMonth], map: "geo_site_bills_site_period_uniq")
  @@map("geo_site_bills")
}
```

> **为什么必须有 `geo_site_bills`**：`points.debit()` 没有幂等键（[points.service.ts:185](file:///E:/wwwroot/oem-enterprise/backend/src/points/points.service.ts#L185)），CRM 席位月费靠 `todayKey()` 做 refId 只够防「同日重复」，撑不住重启/补跑/手工重跑。用唯一索引把「一站一月一账单」钉死，出账前先 `findUnique` 存在即跳过，才是可重入的。

---

## 五、域名绑定（决策点 2，本方案最大的工程不确定性）

### 5.1 两级域名

1. **平台子域（一期先做，零风险）**：`{slug}.<平台站点域名>`。站点域名取 `SiteSettings.siteUrl` 的 host（[site-settings.service.ts](file:///E:/wwwroot/oem-enterprise/backend/src/platform/site-settings.service.ts)），环境变量 `GEO_SITE_ROOT_DOMAIN` 兜底；需在 nginx 加 `*.域名` 通配 `server_name` + 通配证书，并在 CORS 白名单放行（[app.ts:100-135](file:///E:/wwwroot/oem-enterprise/backend/src/http/app.ts#L100-L135) 的同源判定已按 Host 放行）。
2. **用户自定义域名（一期只做绑定与校验，二期接证书）**：用户填域名 → 我们给一条 CNAME 记录（`geo.<用户域> → {slug}.<平台站>`) 或直接把 A/CNAME 指到平台入口 + 一条 TXT 记录 `_geoauth.<用户域>` 值为 `verifyToken`。

### 5.2 校验方式

仓库既有范式是**活码域名的 HTTP 探针**（[livecode.service.ts:201-257](file:///E:/wwwroot/oem-enterprise/backend/src/livecode/livecode.service.ts#L201-L257)：请求 `https://<domain>/s/_probe_<key>` 找 `data-lk-probe` 标记），**全站没有任何 DNS 查询代码**。

本方案两者并用，顺序是「先 TXT 后探针」：

1. TXT 校验（证明域名所有权，`node:dns` `resolveTxt`，出站走 transport 白名单）；
2. 探针校验（证明解析与回源正确：`GET https://<domain>/_geo_probe?token=`，响应必须回显 token）；
3. 通过即 `ACTIVE`，24 小时定时复验 + 每小时预算 3 次（沿用 `refreshStaleDomains` 节流口径），失败置 `ERROR` 并在页面显示可操作提示（遵循「前置条件阻断时必须给出可操作入口」：给解析记录值、给「重新检测」按钮、给文档链接）。

> 探针必须防滥用：仅回显 token、不回显任何业务数据、按 IP 限流。TXT 查询要设超时（2s）与失败降级为「仅探针校验」，避免本机无外网 DNS 时功能全瘫。

### 5.3 解析与渲染

- 前端新增公开路由 `frontend/src/app/geo-site/[slug]/page.tsx`（SSR 渲染 `publishedContent`）与 `route.ts`（输出 `robots.txt`/`sitemap.xml`/`llms.txt`）。
- 新增 `backend` 公开通道 `/api/public/geo-sites/resolve?host=` → `{ slug, seo }`，前端渲染时按 `host` 反查；仿 [livecode.public.ts:74-120](file:///E:/wwwroot/oem-enterprise/backend/src/livecode/livecode.public.ts#L74-L120) 的 header 传租户口径。
- 公开 HTML 响应补 CSP + `frame-ancestors 'none'`（本站前端目前完全没有 headers 配置，只有活码 HTML 有，[livecode.public.ts:47-60](file:///E:/wwwroot/oem-enterprise/backend/src/livecode/livecode.public.ts#L47-L60)）。
- 缓存：发布时 `revalidateTag('geo-site:'+slug)`，读取侧 60s 缓存（Framely 的 900s 对我们太慢，改站点内容会长时间不生效）。

### 5.4 自定义域名的 TLS 与备案（必须让业务知情）

- **通配符证书不覆盖用户自有域名**，所以真正的「用户绑域名上线」必须有证书方案。三条路：
  - (a) 反代换 **Caddy / OpenResty + on-demand TLS（ACME）**：自动签发续期，改造 `infra/nginx/enterprise.conf`（现在是单 `server_name localhost`，[:4](file:///E:/wwwroot/oem-enterprise/infra/nginx/enterprise.conf#L4)）—— 运维改动最大，但体验最好，**推荐二期做**；
  - (b) 用户自带证书上传（我们只存加密后的 pem 并配到反代）—— 合规可控但门槛高；
  - (c) 一期不做 TLS，仅做「校验 + 上线指引」，把域名停在 `VERIFIED_PENDING_TLS` 状态并明确文案。
- **中国大陆合规**：域名解析到境内服务器需 ICP 备案；用户绑域名时必须像活码那样强制勾选「已备案 / 证书与内容责任自负」承诺（现成范式：[livecode.service.ts:127-165](file:///E:/wwwroot/oem-enterprise/backend/src/livecode/livecode.service.ts#L127-L165)），未勾选不给绑定。
- **禁止列表**：不能拿本站或平台域名当用户域名（同活码 `normalizeDomain` 口径 [:36-56](file:///E:/wwwroot/oem-enterprise/backend/src/livecode/livecode.service.ts#L36-L56)）；协议只接受 http/https（沿用 `normalizeSiteUrl` 的既有约束）。
- **内容合规**：公开站属对外发布内容，需接入现有敏感词/技能包安全审查通道，出站 UA 遵循 Bot 标识合规口径。

---

## 六、GEO/SEO 能力（决策点 3：这是「独立站」之所以在 GEO 板块的理由）

Framely 只有站点标题，直接把「GEO 建站」换过来等于做了一个没有优化能力的静态站。本期必须补齐，且这才是与「发稿平台推荐 / 选题池 / 可见度报告」的联动点：

| 能力 | 说明 |
|---|---|
| 站点 SEO 档案 | `seo` Json：title 模板、description、canonical、OG/Twitter、`twitter:card`、主题色、`hreflang`（多语言站点） |
| 结构化数据 | 按站勾选 JSON-LD：`Organization` / `WebSite` / `Product` / `FAQPage` / `Article` / `BreadcrumbList`；字段自动灌自 `GeoProject.brand / brandAliases / industry`（[schema:1488](file:///E:/wwwroot/oem-enterprise/backend/prisma/schema.prisma#L1488)）与 `MktContext` 品牌上下文 |
| `robots.txt` / `sitemap.xml` / **`llms.txt`** | 公开路由自动生成；`llms.txt` 是 AI 引擎抓取友好性的关键增量（GEO 场景专属，Framely 完全没有） |
| 语义化渲染 | 元素树渲染成真实标签（`h1`→`<h1>`、段落→`<p>`），首屏纯 HTML 无 JS 依赖，AI 爬虫可直接读 |
| 选题池一键成页 | `GeoTopic` → 生成落地页草稿（走系统 AI 网关，计积分），把「选题 → 成站 → 被引用」串成闭环 |
| 可见度回灌 | 站点发布后，把其域名自动加入 `GeoProject` 监控范围，`GeoObservation.citationDomains`（[schema:1575](file:///E:/wwwroot/oem-enterprise/backend/prisma/schema.prisma#L1575)）命中本站即标为「自有被引用」，报告里直接体现「GEO 建站有没有带来引用」 |
| 元素与模板扩充 | 新增 `button / form / video-embed / faq / testimonial / cta-banner / nav / footer / divider / spacer / icon / rich-text` 与 8~10 套 GEO 落地页模板（行业向） |
| 图片落库 | 禁用任意域外链，图片走本站 OSS + **数字资产登记**（遵循既有「图片生成后的资产登记规范」），Framely 的 `remotePatterns "**"` 一律不采纳 |

---

## 七、按月扣积分（决策点 4）

### 7.1 计费主体

不新建计费体系，直接复用 `module_pricing`（[schema:7211](file:///E:/wwwroot/oem-enterprise/backend/prisma/schema.prisma#L7211)）：

| 字段 | 值 | 含义 |
|---|---|---|
| `code` | `geo_site` | 新计费主体 |
| `mode` | `METERED` | 只有 METERED 扣费 |
| `unit` | `site_month` | 站·月 |
| `unitPriceAmount` | 管理员填（积分/站/月） | 例 50 |
| `freeQuotaAmount` | 管理员填 | 每月免费站点数 |
| `minChargeAmount` | 起扣额 | 防微账单噪声 |
| `enabled` | 开关 | 关掉＝全站免费，零迁移回滚 |

管理员**现有界面零开发即可配置**：`PricingService.update()` 按 code upsert（[pricing.service.ts:43](file:///E:/wwwroot/oem-enterprise/backend/src/points/pricing.service.ts#L43)），接口 `PUT /enterprise/admin/points/pricing/geo_site`（[points.routes.ts:208](file:///E:/wwwroot/oem-enterprise/backend/src/points/points.routes.ts#L208)），界面在「平台管理后台 → 积分中心 → 价目与用量」（[points-tab.tsx:97,434-535](file:///E:/wwwroot/oem-enterprise/frontend/src/app/admin/_components/points-tab.tsx#L434-L535)）。

必做补齐：[ai-usage.ts:7-34](file:///E:/wwwroot/oem-enterprise/frontend/src/lib/ai-usage.ts#L7-L34) `BILLING_SUBJECT_LABELS` 加 `geo_site: "GEO 独立站·站点月费"`，`TX_SCENE_LABELS`（[:70-81](file:///E:/wwwroot/oem-enterprise/frontend/src/lib/ai-usage.ts#L70-L81)）加 `geo_site` 流水文案，否则积分中心显示裸 code。

### 7.2 出账

在 `PointsBillingService.runDailyBatch()` 里，紧跟 CRM 席位月费（[points-billing.service.ts:66,171](file:///E:/wwwroot/oem-enterprise/backend/src/points/points-billing.service.ts#L171)）加一个同构分支：

```
if (snapshotAt.getDate() === 1) {
  summary.seatCharged   = await this.chargeCrmSeats(snapshotAt);
  summary.geoSiteCharged = await this.chargeGeoSites(snapshotAt);   // 新增
  summary.geoSiteSuspended = await this.suspendOverdueSites();      // 新增
}
```

`chargeGeoSites()` 口径：

1. 取当前自然月 `periodMonth = YYYY-MM`；
2. 按 `ownerUserId` 聚合 `status IN (PUBLISHED, SUSPENDED)` 的站点数（**SUSPENDED 也继续计费**还是停计？→ 决策点 4b，见下）；
3. 逐站 `geo_site_bills` `findUnique(siteId, periodMonth)`，已有即跳过；
4. 优先插入账单行（占住唯一键）再 `points.charge(owner,'geo_site',qty,periodMonth)` —— `charge()` 自带 METERED 判定 + 月免费额 + 起扣额 + 流水 + `UsageEvent`（[points.service.ts:400-494](file:///E:/wwwroot/oem-enterprise/backend/src/points/points.service.ts#L400-L494)）；
5. `POINTS_INSUFFICIENT` → 按站标 `FAILED_ARREARS`，走 `markArrears`（[:228](file:///E:/wwwroot/oem-enterprise/backend/src/points/points-billing.service.ts#L228)）；
6. 首月/末月按天折算（决策点 4c）。

### 7.3 欠费与停服

- 余额不足：账户进 `ARREARS`（全站新增拦截既有机制生效）+ 该 owner 的 `PUBLISHED` 站置 `SUSPENDED`；**已发布 HTML 保留 72 小时缓冲**（给充值时间，避免抖动即停站），缓冲期站点页顶插一条「站点已欠费，请在 X 前充值」提示。
- 续费复活：沿用 `refreshArrearsStatus()`，余额回正即 `ACTIVE`，站点自动回 `PUBLISHED`，**数据永不删除**（既有硬口径）。
- 用户侧自助：站点列表显示「本月已扣 / 下月扣费日 / 剩余可扣积分」，充值入口直达积分中心。
- 管理员可设：宽限小时数、是否允许 `SUSPENDED` 继续计费、站点数上限（仿活码 `QR_MAX_DOMAINS` 每用户 100 上限口径）。

---

## 八、平台管理员配置面（决策点 5）

| 配置 | 落点 | 说明 |
|---|---|---|
| 站点月费积分价 / 免费站点数 / 起扣额 / 启停 | `module_pricing.geo_site`，现有「价目与用量」面板 | 零新增页面 |
| 板块开关 | `FeatureToggle` code `geo-site`，[feature-catalog.data.ts:87](file:///E:/wwwroot/oem-enterprise/backend/src/feature/feature-catalog.data.ts#L87) 同风格新增 `menu('geo-site','marketing-tools',...)` | 关掉即页签隐藏 + `/enterprise/geo/site/*` 前缀进 `FEATURE_API_PREFIXES` 拦截 |
| 平台子域根域名 | `SiteSettings.siteUrl` 的 host；新增可选 `GEO_SITE_ROOT_DOMAIN` 覆盖 | 不硬编码 |
| 自定义域名总开关 / 是否需要备案承诺 / 每用户域名上限 / 是否允许用户站被 iframe | 新 `GeoSiteSettingsService`，KV 存 `SystemSetting`（同 `site_settings` 单 JSON 行范式） | 前端在 admin 新增「GEO 建站设置」卡片，并入现有 [admin/[section]/page.tsx:88](file:///E:/wwwroot/oem-enterprise/frontend/src/app/admin/%5Bsection%5D/page.tsx#L88) 的 `geo` 分区（`geo-settings-tab.tsx` 现有内容不动） |
| 全站站点清单与强制下线 | admin「GEO 管理设置」新页签 | 合规处置入口（含操作人/时间审计字段，仿 `autoCollectBy/autoCollectAt`） |

---

## 九、API 契约与代码骨架

新增契约（`packages/contracts/src/endpoints.ts` 或按新域拆 `geo-site.ts` 再在 endpoints.ts 汇总 import）：

```
# 企业/用户侧 /enterprise/geo/site/*
GeoSite_list | create | detail | update | publish | unpublish | delete
GeoSite_saveDraft | duplicate | templates | generateFromTopic（选题池成页）
GeoSite_domainList | domainBind | domainVerify | domainRemove | domainSetPrimary
GeoSite_billing（本站费用与下月扣费日）

# 平台管理侧 /enterprise/admin/geo-site/*
Admin_geoSiteSettingsGet | Update
Admin_geoSiteList | Admin_geoSiteForceOffline | Admin_geoSiteStats
（月费单价复用现有 Admin points pricing 接口，不重复建）
```

后端骨架（沿用 `backend/src/geo/` 现有风格，命令式或 route-group 二选一 —— **本域端点多且要 docs，走 route-groups**）：

```
backend/src/geo-site/
  geo-site.service.ts          # CRUD/发布/缓存失效/org 隔离
  geo-site-domain.service.ts    # 绑定+TXT/探针校验+复验
  geo-site.render.service.ts    # 元素树 → 安全 HTML + SEO 头 + JSON-LD
  geo-site.settings.service.ts  # 平台 KV
  geo-site.billing.service.ts   # 月账单/停服/复活（供 points 日批回调）
  geo-site.controller.ts
backend/src/http/route-groups/geo-site.ts   # 注册进 http/routes.ts
backend/src/http/services.ts                 # DI 装配
```

前端骨架：

```
frontend/src/app/marketing-tools/_components/geo-site-view/
  index.tsx        # 站点列表 + 账单摘要（进页面即加载，不加手动刷新按钮）
  builder/         # 移植内核：provider(reducer) / dnd-canvas / element/* / layers / inspector(antd)
  domain-modal.tsx # 绑定域名 + 解析指引 + 重新检测
  seo-drawer.tsx   # SEO/GEO 档案与 JSON-LD 勾选
frontend/src/app/geo-site/[slug]/page.tsx   # 公开渲染（SSR）
frontend/src/app/geo-site/[slug]/sitemap.xml|robots.txt|llms.txt/route.ts
frontend/src/api/geo-site.ts · query/geo-site.ts
```

必须同步改的既有文案/入口（4 处，见 §一表格），并把 `GEO_SITE_URL` 常量整体删除。

守卫与交付动作：`pnpm prisma:migrate:deploy`（MySQL，绕开仓库 wrapper 的既有约束）+ `pnpm db:gen:pg` 双库生成 → `pnpm api:docs` 重生成 `docs/api/openapi.json`（CI 逐字节校验）→ `pnpm check:architecture`（路由基线）→ 新增 `scripts/verify-marketing-geo-site.mjs` 并挂 root `test:*`。

---

## 十、分期

| 阶段 | 内容 | 可交付判据 |
|---|---|---|
| **P0 闭环**（先让「GEO 建站」在站内真的能用） | 数据模型与迁移；编辑器内核移植（先保留 Framely 13 元素）+ antd 外壳；`/enterprise/geo/site/*` 契约与路由；平台子域发布与 SSR 渲染；`module_pricing.geo_site` + 月批出账 + 欠费停服/复活；文案替换 + FeatureToggle | 建一个站、发布到 `{slug}.平台域名`、看到扣费流水与积分中心账单；关掉开关入口即消失 |
| **P1 域名 + GEO 能力** | 自定义域名绑定与 TXT/探针校验、复验与失败可操作指引；（证书方案按决策点 2 选 (a)/(b)/(c) 其一落地）；SEO 档案 + JSON-LD + `robots/sitemap/llms.txt`；图片走 OSS + 资产登记；元素目录与 8~10 套 GEO 模板 | 用户绑自有域并校验通过，页面 Lighthouse SEO 分 ≥95，`llms.txt` 可访问 |
| **P2 联动与规模化** | 选题池一键成页、站点域名自动进 GEO 监控、引用命中回灌可见度报告；站点版本历史/回滚、多页面站、表单收集（复用问卷底座）、导出静态站、内容审核 | 报告页能显示「本站被 AI 引用 N 次」 |

---

## 十一、待用户确认的决策点

| # | 问题 | 我的推荐 |
|---|---|---|
| 1 | 集成形态 A/B/C | **A 站内移植**（§三） |
| 2 | 自定义域名证书方案：(a) 反代 on-demand TLS、(b) 用户上传证书、(c) P1 先只做校验不做 TLS | **P1 先 (c) 校验+指引，P1.5 落 (a)**；(a) 需运维改 nginx→Caddy，风险最高不能一期吞 |
| 3 | 计费粒度：按站扣（`site_month`）/ 按站套餐分档（基础·标准·旗舰）/ 免费 N 站 + 超出扣 | **按站扣 + 管理员配免费站数**（复用 `freeQuotaAmount`，语义最直白、零新表） |
| 4b | `SUSPENDED` 站点是否继续计费 | **停服即停计**（否则用户感知「没服务还在扣」投诉率高），但需保留 72h 缓冲 |
| 4c | 首月/末月是否按天折算 | **按天折算**（`unitPrice × 在册天数/当月天数`，四舍五入到 4 位），比「首月免费」更不易被薅 |
| 5 | 平台管理员配置面放哪 | 价目复用现有「积分中心 → 价目与用量」，其余放「GEO 管理设置」新页签（不新建 ADMIN_SECTIONS 分区） |
| 6 | 是否允许用户把站挂在自己域后仍被本站 iframe 预览（CSP 取舍） | 发布预览用本站域渲染，用户域只对外，`frame-ancestors 'none'` |
| 7 | ICP 备案承诺是否硬阻断 | **硬阻断**（不勾选不能绑定用户域），与活码口径一致 |

---

## 十二、风险清单

| 风险 | 影响 | 处置 |
|---|---|---|
| 自定义域名 TLS 与通配 `server_name` 需改反代 | 不可由代码单方解决，可能卡上线 | 决策点 2 拆期；先子域闭环 |
| `contentEditable` + 用户自定义 URL 的 XSS/`javascript:` 注入 | 公开站跨站脚本 | 渲染只输出白名单标签与内联样式，URL 协议限 http/https，图片域名限本站 OSS，禁止任意 HTML 落库 |
| 任意域图片外链（Framely 原样） | SSRF/热链盗图/合规 | 强制 OSS + 资产登记，编辑器改成图片选择器 |
| 元素树 Json 无限增长/深度炸弹 | 存储与渲染打挂 | 保存时校验节点数上限（如 2000）与深度（≤12），体积上限 2MB（仿技能包 Comfy 图 2MB 上限口径） |
| 双库兼容（PG 侧 `Json` 取值、`@@map` 生成物） | PG 环境功能挂 | 沿用双库不兼容点清单排查法；`content` 存 `Json` 不做 SQL 侧 JSON 路径查询 |
| 月批幂等不足致重复扣费 | 资金类投诉 | `geo_site_bills` 唯一键先插后扣（§四说明） |
| 15 分钟缓存导致「改了不生效」（Framely 原口径） | 用户困惑 | 降到 60s + 发布即 `revalidateTag`，预览走草稿绕过缓存 |
| 编辑器移动端不可用（Framely 原样） | 移动端体验断档 | P0 保留提示，明确「桌面端编辑」 |
| 上游 Framely 不再维护 | 无法跟版 | 已移植进本站，自维护；保留 MIT 出处声明 |
| 与现有低代码/AI 画布被误认为重复建设 | 评审反复 | 边界写清：低代码＝内部应用页，本模块＝对外营销站（SEO/GEO/域名/备案） |

---

## 十三、验收清单（P0）

1. 营销工具 → GEO → 「GEO 建站」页签在站内打开站点列表，无新窗口、无硬编码外部域名（`grep GEO_SITE_URL` 为空）。
2. 拖拽建元素→保存→发布，`{slug}.<平台站点域名>` 首屏 HTML 可直接 curl 到内容（不依赖 JS）。
3. 平台后台「价目与用量」出现 `geo_site`（GEO 独立站·站点月费）行，改单价后次月出账按新价。
4. 月批跑后：积分流水出现 `scene=geo_site` 且备注含账期，`geo_site_bills` 一站一月一条；同月重复执行日批不产生第二条扣费。
5. 余额不足：站点转 `SUSPENDED`（72h 缓冲带提示），充值后自动恢复 `PUBLISHED`，数据零丢失。
6. 关掉 `geo-site` 功能开关：页签消失且 `/enterprise/geo/site/*` 全部 403。
7. `pnpm api:docs` 后 `openapi.json` 与路由一致，`pnpm check:architecture` 通过，`scripts/verify-marketing-geo-site.mjs` 全绿。
