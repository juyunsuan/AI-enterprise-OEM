/**
 * 智慧分析「采集先行 + 两侧配置分治」后端口径验证（docs/智慧分析板块设计方案.md §四~§六、§十四）。
 *
 * 口径：
 * - 打临时实例（regression-instance.mjs --port=1695），不碰 1690 日常实例。
 * - 只验契约与数据流，不依赖在线采集通道：无设备时 collectNow 允许 dispatched=false，
 *   但必须给得出原因与入口，不能静默成功。
 * - 两个工具同一套采集模式与方法，配置按采集目的分治：热点侧端点族只管 purpose=hotspot，
 *   趋势侧端点族只管 purpose=trend-*；跨侧读写必须被拒或被当作不存在。
 * - 自建账号、自清数据源/排班/批次，收尾不留副作用。
 *
 * 用法：
 *   node scripts/regression-instance.mjs --port=1695 -- node scripts/verify-insight-collection.mjs
 */
import { createLocalSessionSuite } from "./harness.mjs";

const suite = await createLocalSessionSuite();
const { api, assert, prisma, disconnect } = suite;

const ACCOUNT = "verify-insight-collect";
const HOTSPOT = "/enterprise/insight";
const TREND = "/enterprise/insight/trends";

let userId = "";

/** 业务失败（校验被拒）：HTTP 非 2xx 或信封 code 非 0，且带可读原因。 */
function rejected(res, name, keyword) {
  const message = String(res.data?.message ?? "");
  assert(
    res.status >= 400 || (res.data && res.data.code !== 0),
    name,
    `http=${res.status} message=${message.slice(0, 70)}`,
  );
  if (keyword) {
    assert(
      message.includes(keyword),
      `${name}·原因可行动`,
      `期望包含「${keyword}」，实际「${message.slice(0, 90)}」`,
    );
  }
}

async function ensureAccount(username) {
  const existing = await prisma.account.findFirst({ where: { username } });
  if (existing) return existing;
  return prisma.account.create({ data: { username, role: "USER" } });
}

try {
  const health = await api("GET", "/health");
  assert(health.data?.code === 0, "health");

  const account = await ensureAccount(ACCOUNT);
  userId = String(account.id);

  // 干净起点：同名验证账号的历史残留全部清掉（批次/数据源/排班都按 userId 归零）
  await prisma.insightCollectionRun.deleteMany({ where: { userId } });
  await prisma.insightCollectionSource.deleteMany({ where: { userId } });
  await prisma.insightSubscription.deleteMany({ where: { userId } });

  // ---------- 采集包清单（两侧共用的底座，下载入口只有一份）----------
  const skills = await api("GET", `${HOTSPOT}/skills`, null, ACCOUNT);
  const packs = skills.data?.data ?? [];
  assert(packs.length === 3, "采集 SKILL 包三个（hotspot/trend/site）", `实际 ${packs.length}`);
  assert(
    packs.every((item) => item.downloadUrl === `/downloads/${item.zipFile}`),
    "下载链接＝静态目录文件名",
    packs.map((item) => item.downloadUrl).join(" / "),
  );

  // ---------- 热点侧数据源校验：闭集 + 占位符 + 无目的不采集 ----------
  rejected(
    await api("POST", `${HOTSPOT}/sources`, { name: "坏目的", purpose: "whatever", keyword: "k" }, ACCOUNT),
    "热点侧·采集目的必须落在自己的闭集",
    "采集目的无效",
  );
  rejected(
    await api("POST", `${HOTSPOT}/sources`, { name: "坏类型", purpose: "hotspot", kind: "ftp", keyword: "k" }, ACCOUNT),
    "热点侧·数据源类型必须落在闭集",
    "数据源类型无效",
  );
  rejected(
    await api("POST", `${HOTSPOT}/sources`, { name: "坏平台", purpose: "hotspot", kind: "platformSearch", platform: "myspace", keyword: "k" }, ACCOUNT),
    "内容平台必须落在闭集",
    "内容平台只支持",
  );
  rejected(
    await api("POST", `${HOTSPOT}/sources`, { name: "没关键词", purpose: "hotspot", kind: "platformSearch", platform: "xiaohongshu" }, ACCOUNT),
    "数据源必须给关键词/话题/账号",
    "关键词",
  );
  rejected(
    await api(
      "POST",
      `${HOTSPOT}/sources`,
      { name: "无占位符站点", purpose: "hotspot", kind: "customSite", siteUrl: "https://example.com", urlTemplate: "https://example.com/list", keyword: "k" },
      ACCOUNT,
    ),
    "自定义网站源头必须带占位符",
    "{keyword}",
  );
  rejected(
    await api(
      "POST",
      `${HOTSPOT}/sources`,
      { name: "非 http 站点", purpose: "hotspot", kind: "customSite", siteUrl: "ftp://example.com", urlTemplate: "https://example.com/{keyword}", keyword: "k" },
      ACCOUNT,
    ),
    "站点地址必须 http/https",
    "http/https",
  );

  const contentSource = await api(
    "POST",
    `${HOTSPOT}/sources`,
    { name: "验证-小红书搜索", purpose: "hotspot", kind: "platformSearch", platform: "xiaohongshu", keyword: "验证关键词" },
    ACCOUNT,
  );
  const contentSourceId = contentSource.data?.data?.id ?? 0;
  assert(contentSourceId > 0, "平台搜索数据源创建成功", `id=${contentSourceId}`);
  assert(
    contentSource.data?.data?.skillKey === "hotspot" && contentSource.data?.data?.targetTable === "content",
    "内容源头派生 hotspot 包并落「热点内容」表",
    `${contentSource.data?.data?.skillKey}/${contentSource.data?.data?.targetTable}`,
  );

  const siteSource = await api(
    "POST",
    `${HOTSPOT}/sources`,
    {
      name: "验证-自定义站点",
      purpose: "hotspot",
      kind: "customSite",
      siteUrl: "https://www.smzdm.com",
      urlTemplate: "https://www.smzdm.com/search/{keyword}/p{page}/",
      keyword: "家居",
      loginRequired: true,
    },
    ACCOUNT,
  );
  const siteSourceId = siteSource.data?.data?.id ?? 0;
  assert(siteSource.data?.data?.skillKey === "site", "自定义网站源头派生 site 泛化包", siteSource.data?.data?.skillKey);

  const hotspotList = await api("GET", `${HOTSPOT}/sources`, null, ACCOUNT);
  assert((hotspotList.data?.data ?? []).length === 2, "热点侧清单只有两条（不含趋势源头）", `${(hotspotList.data?.data ?? []).length}`);

  // ---------- 趋势侧数据源：同一套校验，但只管 trend-* 那组目的 ----------
  rejected(
    await api("POST", `${TREND}/sources`, { name: "跨侧目的", purpose: "hotspot", kind: "ecomList", platform: "taobao", keyword: "k" }, ACCOUNT),
    "趋势侧不许配热点目的",
    "全域内容热点分析",
  );
  rejected(
    await api("POST", `${TREND}/sources`, { name: "跨侧类型", purpose: "trend-element", kind: "platformSearch", platform: "xiaohongshu", keyword: "k" }, ACCOUNT),
    "趋势侧不许配社媒页面对象类型",
    "不属于「流行趋势分析」的采集配置",
  );
  rejected(
    await api("POST", `${TREND}/sources`, { name: "坏电商平台", purpose: "trend-commercial", kind: "ecomList", platform: "xiaohongshu", keyword: "k" }, ACCOUNT),
    "电商平台必须落在电商闭集",
    "电商平台只支持",
  );

  const ecomSource = await api(
    "POST",
    `${TREND}/sources`,
    { name: "验证-淘宝列表", purpose: "trend-commercial", kind: "ecomList", platform: "taobao", keyword: "冲锋衣" },
    ACCOUNT,
  );
  const ecomSourceId = ecomSource.data?.data?.id ?? 0;
  assert(
    ecomSource.data?.data?.skillKey === "trend" && ecomSource.data?.data?.targetTable === "ecommerce",
    "电商源头派生 trend 包并落「电商选品观测」表",
    `${ecomSource.data?.data?.skillKey}/${ecomSource.data?.data?.targetTable}`,
  );
  assert(
    ecomSource.data?.data?.pageObjectLabel === "列表页",
    "ecomList 默认页面对象＝列表页",
    ecomSource.data?.data?.pageObjectLabel,
  );

  const trendDefault = await api(
    "POST",
    `${TREND}/sources`,
    { name: "验证-缺省目的", platform: "jd", keyword: "连衣裙" },
    ACCOUNT,
  );
  assert(
    trendDefault.data?.data?.purpose === "trend-element" && trendDefault.data?.data?.kind === "ecomList",
    "趋势侧缺省落自己的目的与类型（不会掉进热点口径）",
    `${trendDefault.data?.data?.purpose}/${trendDefault.data?.data?.kind}`,
  );
  const trendDefaultId = trendDefault.data?.data?.id ?? 0;

  const trendSite = await api(
    "POST",
    `${TREND}/sources`,
    { name: "验证-趋势自定义站点", purpose: "trend-element", kind: "customSite", siteUrl: "https://www.4anr.com", urlTemplate: "https://www.4anr.com/search/{keyword}", keyword: "新中式" },
    ACCOUNT,
  );
  assert(
    trendSite.data?.data?.skillKey === "site",
    "趋势侧的自定义网站源头同样走 site 泛化包",
    trendSite.data?.data?.skillKey,
  );
  const trendSiteId = trendSite.data?.data?.id ?? 0;

  const trendList = await api("GET", `${TREND}/sources`, null, ACCOUNT);
  const trendIds = (trendList.data?.data ?? []).map((item) => item.id);
  assert(trendIds.length === 3, "趋势侧清单三条", `${trendIds.length}`);
  assert(
    !trendIds.includes(contentSourceId) && !trendIds.includes(siteSourceId),
    "趋势侧清单不含热点侧源头",
    trendIds.join(","),
  );

  // ---------- 跨侧越权：改与删都要当成不存在 ----------
  rejected(
    await api("POST", `${HOTSPOT}/sources`, { id: ecomSourceId, name: "改坏", purpose: "hotspot", kind: "platformSearch", platform: "xiaohongshu", keyword: "k" }, ACCOUNT),
    "热点侧改不到趋势侧源头",
    "数据源不存在",
  );
  rejected(
    await api("DELETE", `${TREND}/sources/${contentSourceId}`, null, ACCOUNT),
    "趋势侧删不到热点侧源头",
    "数据源不存在",
  );
  const crossQuery = await api("GET", `${TREND}/sources?purpose=hotspot`, null, ACCOUNT);
  rejected(crossQuery, "趋势侧列表按热点目的过滤被拒", "「内容互动热度」是「全域内容热点分析」的采集配置");

  // ---------- 无数据源不采集：目的下没有启用源头就建不出排班 ----------
  rejected(
    await api("POST", `${HOTSPOT}/subscriptions`, { name: "验证-色彩趋势", purpose: "trend-color", keywords: ["色卡"], frequency: "daily" }, ACCOUNT),
    "热点侧不许建趋势排班",
    "流行趋势分析",
  );
  const noSourceTrendSub = await api(
    "POST",
    `${TREND}/subscriptions`,
    { name: "验证-色彩趋势", purpose: "trend-color", keywords: ["色卡"], frequency: "daily" },
    ACCOUNT,
  );
  rejected(noSourceTrendSub, "trend-color 无启用数据源时拒绝建排班", "无数据源不采集");

  const sub = await api(
    "POST",
    `${HOTSPOT}/subscriptions`,
    { name: "验证-热点订阅", purpose: "hotspot", platforms: ["xiaohongshu"], keywords: ["露营"], frequency: "daily" },
    ACCOUNT,
  );
  const subId = sub.data?.data?.id ?? 0;
  assert(subId > 0, "热点排班创建成功", `id=${subId} message=${String(sub.data?.message).slice(0, 60)}`);
  const boundSourceIds = (sub.data?.data?.sourceIds ?? []).map(Number);
  assert(
    boundSourceIds.includes(contentSourceId) && boundSourceIds.includes(siteSourceId),
    "未指定数据源时自动挂该目的下全部启用源头",
    boundSourceIds.join(","),
  );
  assert(
    !boundSourceIds.some((id) => trendIds.includes(id)),
    "不会串挂趋势侧源头",
    boundSourceIds.join(","),
  );
  assert(
    (sub.data?.data?.keywords ?? []).includes("验证关键词"),
    "数据源关键词自动并进排班（采集目标自包含）",
    (sub.data?.data?.keywords ?? []).join(","),
  );

  const trendSub = await api(
    "POST",
    `${TREND}/subscriptions`,
    { name: "验证-趋势排班", purpose: "trend-commercial", keywords: ["连衣裙"], frequency: "daily" },
    ACCOUNT,
  );
  const trendSubId = trendSub.data?.data?.id ?? 0;
  assert(trendSubId > 0, "趋势排班创建成功", `id=${trendSubId} message=${String(trendSub.data?.message).slice(0, 60)}`);
  const trendBound = (trendSub.data?.data?.sourceIds ?? []).map(Number);
  assert(
    trendBound.includes(ecomSourceId),
    "趋势排班自动挂同目的的趋势侧源头",
    trendBound.join(","),
  );
  assert(
    !trendBound.includes(contentSourceId) && !trendBound.includes(trendDefaultId),
    "趋势排班既不挂热点侧源头，也不挂别的采集目的",
    trendBound.join(","),
  );

  // ---------- 两侧列表互不可见 ----------
  const hotSubList = await api("GET", `${HOTSPOT}/subscriptions`, null, ACCOUNT);
  const trendSubList = await api("GET", `${TREND}/subscriptions`, null, ACCOUNT);
  assert(
    (hotSubList.data?.data ?? []).every((item) => item.purpose === "hotspot"),
    "热点侧排班列表只含热点目的",
    (hotSubList.data?.data ?? []).map((item) => item.purpose).join(","),
  );
  assert(
    (trendSubList.data?.data ?? []).every((item) => String(item.purpose).startsWith("trend-")),
    "趋势侧排班列表只含趋势目的",
    (trendSubList.data?.data ?? []).map((item) => item.purpose).join(","),
  );
  rejected(
    await api("DELETE", `${HOTSPOT}/subscriptions/${trendSubId}`, null, ACCOUNT),
    "热点侧删不到趋势排班",
    "订阅不存在",
  );

  // ---------- 手动采集：派发结果与查看入口都落在本页 ----------
  const collect = await api("POST", `${HOTSPOT}/subscriptions/${subId}/collect`, null, ACCOUNT);
  const collectData = collect.data?.data ?? {};
  assert(collect.status < 400 && typeof collectData.dispatched === "boolean", "热点侧手动采集返回派发结果", JSON.stringify(collectData).slice(0, 80));
  assert(!!collectData.reason, "派发结果带可读结论", String(collectData.reason).slice(0, 70));
  assert(
    !String(collectData.entryPath ?? "").startsWith("/insight/") || String(collectData.entryPath).startsWith("/insight/hotspot"),
    "热点侧入口不跳到趋势页",
    collectData.entryPath,
  );

  const trendCollect = await api("POST", `${TREND}/subscriptions/${trendSubId}/collect`, null, ACCOUNT);
  const trendCollectData = trendCollect.data?.data ?? {};
  assert(trendCollect.status < 400 && typeof trendCollectData.dispatched === "boolean", "趋势侧手动采集返回派发结果", JSON.stringify(trendCollectData).slice(0, 80));
  assert(
    !String(trendCollectData.entryPath ?? "").startsWith("/insight/") || String(trendCollectData.entryPath).startsWith("/insight/trends"),
    "趋势侧入口不跳到热点页",
    trendCollectData.entryPath,
  );

  const runs = await api("GET", `${HOTSPOT}/runs?page=1&pageSize=10`, null, ACCOUNT);
  assert(Array.isArray(runs.data?.data?.list), "热点侧批次分页结构", `total=${runs.data?.data?.total}`);
  assert(
    collectData.dispatched ? runs.data?.data?.total >= 1 : runs.data?.data?.total === 0,
    "热点侧批次数与派发一致（每个数据源一轮）",
    `total=${runs.data?.data?.total} dispatched=${collectData.dispatched}`,
  );
  const trendRuns = await api("GET", `${TREND}/runs?page=1&pageSize=10`, null, ACCOUNT);
  assert(
    trendCollectData.dispatched ? trendRuns.data?.data?.total >= 1 : trendRuns.data?.data?.total === 0,
    "趋势侧批次数与派发一致",
    `total=${trendRuns.data?.data?.total} dispatched=${trendCollectData.dispatched}`,
  );
  assert(
    (trendRuns.data?.data?.list ?? []).every((item) => trendIds.includes(item.sourceId)),
    "趋势侧批次只列趋势侧源头",
    (trendRuns.data?.data?.list ?? []).map((item) => item.sourceId).join(","),
  );
  rejected(
    await api("GET", `${TREND}/runs?sourceId=${contentSourceId}`, null, ACCOUNT),
    "趋势侧按热点源头查批次被拒",
    "不在「流行趋势分析」的采集配置里",
  );

  // ---------- 两侧总览各数自己那组采集配置 ----------
  const overview = await api("GET", `${HOTSPOT}/hotspot/overview`, null, ACCOUNT);
  const ov = overview.data?.data ?? {};
  assert(ov.sourceCount === 2 && ov.enabledSourceCount === 2, "热点总览只数热点侧数据源", `source=${ov.sourceCount}/${ov.enabledSourceCount}`);
  assert(
    (ov.presetTables ?? []).some((item) => item.key === "ecommerce"),
    "热点总览仍列出「电商选品观测」预置表（同一底座）",
    (ov.presetTables ?? []).map((item) => item.key).join(","),
  );
  const trendsOverview = await api("GET", `${TREND}/overview`, null, ACCOUNT);
  const tov = trendsOverview.data?.data ?? {};
  assert(tov.sourceCount === 3 && tov.enabledSourceCount === 3, "趋势总览只数趋势侧数据源", `source=${tov.sourceCount}/${tov.enabledSourceCount}`);
  assert(
    typeof tov.runCount24h === "number" && typeof tov.lastRunAt === "string",
    "趋势总览带采集健康度",
    `run24h=${tov.runCount24h} lastRunAt=${tov.lastRunAt}`,
  );

  // ---------- 删源头要收口：同侧排班不再引用它 ----------
  const removeSite = await api("DELETE", `${HOTSPOT}/sources/${siteSourceId}`, null, ACCOUNT);
  assert(removeSite.data?.code === 0, "删除热点侧自定义站点数据源");
  const afterRemove = await api("GET", `${HOTSPOT}/subscriptions`, null, ACCOUNT);
  const stillBound = (afterRemove.data?.data ?? []).flatMap((item) => (item.sourceIds ?? []).map(Number));
  assert(!stillBound.includes(siteSourceId), "删掉的源头已从同侧排班摘除", stillBound.join(","));
  assert(
    !stillBound.includes(siteSourceId) && stillBound.includes(contentSourceId),
    "热点侧排班只剩自己的源头，趋势侧排班不受影响",
    stillBound.join(","),
  );
} finally {
  if (userId) {
    await prisma.insightCollectionRun.deleteMany({ where: { userId } });
    await prisma.insightCollectionSource.deleteMany({ where: { userId } });
    await prisma.insightSubscription.deleteMany({ where: { userId } });
    await prisma.account.delete({ where: { id: Number(userId) } }).catch(() => undefined);
  }
  await disconnect();
  console.log(suite.summary());
  if (suite.counts().failed) process.exitCode = 1;
}
