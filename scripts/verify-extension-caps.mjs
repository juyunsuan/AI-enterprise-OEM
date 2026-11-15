/**
 * 插件能力声明一致性守卫（docs/Agent编排与插件能力契约方案.md §六 C3/S5）。
 *
 * 不连库、不驱动浏览器：只读契约产物 + 插件源码，逐条钉住「声明与实现不许漂移」。
 * 三类真实漂移就是本脚本的验收对象（先红后绿）：
 *   1) 目录里的动作闭集与插件 IMPLEMENTED_PRIMITIVES 对不上（多/少都报）；
 *   2) 插件回报的错误码不在 BROWSER_TASK_ERROR_CODES 里（历史 PAGE_CHANGED / UNKNOWN_ACTION 自造词）；
 *   3) 协议版本 / 能力位 / 站点矩阵 / 版本号四处各写一份，改一处忘一处。
 *
 * 用法：node scripts/verify-extension-caps.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const extDir = path.join(root, "extensions", "aipdd-enterprise");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const readExt = (name) => readFileSync(path.join(extDir, name), "utf8");
const rel = (file) => path.relative(root, file).split(path.sep).join("/");

const errors = [];
const fail = (message) => errors.push(message);

// 契约以 dist 为准：CI 先 build 再跑守卫，这里读到的是「服务端真在用的那一份」。
const require = createRequire(path.join(root, "package.json"));
const contracts = require(path.join(root, "packages/contracts/dist/index.js"));

/* ---------------------------------------------------------------- 解析小工具 */

/** 取 `const NAME = [ "a", "b" ]` 里的字符串字面量（保持文件顺序）。 */
function stringArray(src, name) {
  const matched = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!matched) return null;
  return [...matched[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

/** 取 `const NAME = { key: [ "a", "b" ], ... }` 这种「分类 → 站点模式数组」的表。 */
function siteMap(src, name) {
  const body = src.match(new RegExp(`const ${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};`));
  if (!body) return null;
  const table = {};
  for (const key of ["distribution", "acquisition"]) {
    const list = body[1].match(new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
    table[key] = list ? [...list[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]) : null;
  }
  return table;
}

/** 取 `const NAME = <expr>;` 的原始表达式（用于比对不是纯数字的常量，如 `10 * 1024 * 1024`）。 */
function rawConst(src, name) {
  return (src.match(new RegExp(`const ${name}\\s*=\\s*([^;]+);`)) || [])[1]?.trim() || "";
}

const sameSet = (a, b) => a.length === b.length && [...new Set(a)].sort().join("|") === [...new Set(b)].sort().join("|");
const diff = (a, b) => ({
  onlyA: a.filter((item) => !b.includes(item)),
  onlyB: b.filter((item) => !a.includes(item)),
});

/* ---------------------------------------------------------------- 读取声明面 */

const manifest = JSON.parse(readExt("manifest.json"));
const chromeRpaSrc = readExt("chrome-rpa.js");
const bridgeSrc = readExt("bridge.js");
const backgroundSrc = readExt("background.js");
const executorSrc = readExt("rpa-executor.js");
const releaseSrc = read("backend/src/distribution/extension-release.ts");

/* ---------------------------------------------------------------- 1) 动作闭集 ↔ 插件实现 */

const contractPrimitives = contracts.extensionActionPrimitives("chrome");
const implPrimitives = stringArray(chromeRpaSrc, "IMPLEMENTED_PRIMITIVES");
if (!implPrimitives) {
  fail("chrome-rpa.js: 找不到 IMPLEMENTED_PRIMITIVES");
} else {
  const { onlyA, onlyB } = diff(contractPrimitives, implPrimitives);
  if (onlyA.length || onlyB.length) {
    fail(
      `chrome-rpa.js: IMPLEMENTED_PRIMITIVES 与契约 RC_ACTIONS 不一致` +
        `${onlyA.length ? `；契约有插件没实现：${onlyA.join(",")}` : ""}` +
        `${onlyB.length ? `；插件多报：${onlyB.join(",")}` : ""}`,
    );
  }
  // 光登记名字还不够：每个原语的字面量必须真的出现在后台或页面执行器里。
  const implSrc = `${chromeRpaSrc}\n${executorSrc}`;
  for (const primitive of implPrimitives) {
    if (!implSrc.includes(`"${primitive}"`) && !implSrc.includes(`'${primitive}'`)) {
      fail(`chrome-rpa.js: 原语 ${primitive} 只在能力清单里，插件里没有实现`);
    }
  }
}

/* ---------------------------------------------------------------- 2) 协议版本一致 */

const protoOf = (src, name) => Number((src.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`)) || [])[1]);
const bridgeProto = protoOf(bridgeSrc, "PROTOCOL_VERSION");
const rpaProto = protoOf(chromeRpaSrc, "PROTOCOL_VERSION");
const contractProto = contracts.BROWSER_TASK_PROTOCOL_VERSION;
for (const [label, value] of [
  ["bridge.js", bridgeProto],
  ["chrome-rpa.js", rpaProto],
]) {
  if (value !== contractProto) fail(`${label}: PROTOCOL_VERSION=${value} 与契约 ${contractProto} 不一致`);
}

/* ---------------------------------------------------------------- 3) 能力族一致 */

const families = stringArray(chromeRpaSrc, "CAPABILITY_FAMILIES");
if (families && !sameSet(families, contracts.EXTENSION_CAPABILITY_KEYS)) {
  fail(`chrome-rpa.js: CAPABILITY_FAMILIES 与契约 EXTENSION_CAPABILITY_KEYS 不一致（${families.join(",")}）`);
}

/* ---------------------------------------------------------------- 4) 插件回报码 ⊆ 契约词汇表 */

const vocab = new Set(contracts.BROWSER_TASK_ERROR_CODES);
for (const name of readdirSync(extDir).filter((file) => file.endsWith(".js"))) {
  const src = readExt(name);
  // 只认全大写常量词（任务错误码一律 UPPER_SNAKE）；`code: "Enter"` 这类 KeyboardEvent 属性不在此列。
  for (const match of src.matchAll(/\bcode\s*:\s*["']([A-Z][A-Z0-9_]*)["']/g)) {
    if (!vocab.has(match[1])) fail(`extensions/aipdd-enterprise/${name}: 错误码 ${match[1]} 不在 BROWSER_TASK_ERROR_CODES`);
  }
}

/* ---------------------------------------------------------------- 5) 站点声明的三处同源 */

const bgSites = siteMap(backgroundSrc, "DECLARED_SITES");
const bridgeSites = siteMap(bridgeSrc, "SITE_PATTERNS");
if (!bgSites) fail("background.js: 找不到 DECLARED_SITES");
if (!bridgeSites) fail("bridge.js: 找不到 SITE_PATTERNS");
for (const key of ["distribution", "acquisition"]) {
  const contractSites = contracts.extensionCapabilityDefOf(key)?.sitePermissions || [];
  const layers = [
    ["background.js:DECLARED_SITES", bgSites?.[key]],
    ["bridge.js:SITE_PATTERNS", bridgeSites?.[key]],
    [`契约 ${key}.sitePermissions`, contractSites],
  ];
  for (const [label, list] of layers) {
    if (!list) {
      fail(`${label}: 缺少 ${key} 站点清单`);
      continue;
    }
    if (!sameSet(list, contractSites)) {
      const { onlyA, onlyB } = diff(list, contractSites);
      fail(
        `${label} 与契约 ${key}.sitePermissions 不一致` +
          `${onlyA.length ? `；多出：${onlyA.join(",")}` : ""}` +
          `${onlyB.length ? `；缺少：${onlyB.join(",")}` : ""}`,
      );
    }
  }
}

/* ---------------------------------------------------------------- 6) 能力声明里的错误码 ⊆ 契约词汇表 */

for (const key of contracts.EXTENSION_CAPABILITY_KEYS) {
  const def = contracts.extensionCapabilityDefOf(key);
  for (const code of def?.errors || []) {
    if (!vocab.has(code)) fail(`契约 ${key} 能力声明了词表外的错误码 ${code}`);
  }
}

/* ---------------------------------------------------------------- 7) 版本与限额四处对齐 */

const manifestVersion = manifest.version;
const releaseVersion = (releaseSrc.match(/version:\s*['"]([^'"]+)['"]/) || [])[1];
const releaseMin = (releaseSrc.match(/minVersion:\s*['"]([^'"]+)['"]/) || [])[1];
const releasePath = (releaseSrc.match(/downloadPath:\s*['"]([^'"]*)['"]/) || [])[1];
if (releaseVersion !== manifestVersion) {
  fail(`extension-release.ts: version=${releaseVersion} 与 manifest.json=${manifestVersion} 不一致`);
}
if (releaseMin !== contracts.BROWSER_AGENT_MIN_VERSION) {
  fail(`extension-release.ts: minVersion=${releaseMin} 与契约 BROWSER_AGENT_MIN_VERSION=${contracts.BROWSER_AGENT_MIN_VERSION} 不一致`);
}
if (releasePath && !releasePath.endsWith(`-v${manifestVersion}.zip`)) {
  fail(`extension-release.ts: downloadPath=${releasePath} 的版本与 manifest.json=${manifestVersion} 不一致`);
}
const readmeVersion = (read("extensions/aipdd-enterprise/README.md").match(/浏览器插件（v([0-9.]+)）/) || [])[1];
if (readmeVersion !== manifestVersion) {
  fail(`extensions/aipdd-enterprise/README.md: 标题版本=${readmeVersion} 与 manifest.json=${manifestVersion} 不一致`);
}

// 页面执行器与后台的限额必须同口径（改一处忘一处＝实际生效值两套）。
const limitOf = (src, name) => Number((src.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`)) || [])[1]);
for (const [name, contractName] of [
  ["SNAPSHOT_TEXT_MAX", "RC_SNAPSHOT_TEXT_MAX"],
  ["HARVEST_LIMIT_MAX", "RC_HARVEST_LIMIT"],
  ["WAIT_MAX_MS", "RC_WAIT_MAX_MS"],
]) {
  const pluginValue = limitOf(executorSrc, name);
  if (pluginValue !== contracts[contractName]) {
    fail(`rpa-executor.js: ${name}=${pluginValue} 与契约 ${contractName}=${contracts[contractName]} 不一致`);
  }
}
// 后台把多帧正文合并成一份快照（N7=A）：合并上限也必须与契约同源，否则页面执行器守得住、后台守不住。
const bgSnapshotMax = limitOf(chromeRpaSrc, "SNAPSHOT_TEXT_MAX");
if (bgSnapshotMax !== contracts.RC_SNAPSHOT_TEXT_MAX) {
  fail(`chrome-rpa.js: SNAPSHOT_TEXT_MAX=${bgSnapshotMax} 与契约 RC_SNAPSHOT_TEXT_MAX=${contracts.RC_SNAPSHOT_TEXT_MAX} 不一致`);
}
const uploadMaxBackend = rawConst(chromeRpaSrc, "UPLOAD_MAX_BYTES");
const uploadMaxExecutor = rawConst(executorSrc, "UPLOAD_MAX_BYTES");
if (!/^10\s*\*\s*1024\s*\*\s*1024$/.test(uploadMaxBackend.replace(/\s+/g, " "))) {
  fail(`chrome-rpa.js: UPLOAD_MAX_BYTES=${uploadMaxBackend} 不等于 10MB 上限`);
}
if (uploadMaxBackend !== uploadMaxExecutor) {
  fail(`rpa-executor.js: UPLOAD_MAX_BYTES 与背景页不一致（${uploadMaxExecutor} / ${uploadMaxBackend}）`);
}

/* ---------------------------------------------------------------- 汇总 */

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `插件能力声明一致（原语 ${contractPrimitives.length} 个 · 站点 ${(bgSites?.distribution?.length || 0) + (bgSites?.acquisition?.length || 0)} 条 · 协议 v${contractProto}）`,
  );
}
