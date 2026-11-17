/**
 * 采集 SKILL 包一致性守卫：钉住「契约声明 ↔ 前端静态包」不许漂移。
 *
 * 不连库、不起实例：只读 packages/contracts/dist 与 frontend/public/downloads 下的 zip。
 * 验收对象（改一处忘一处就会红）：
 *   1) 契约里每个采集包在前端静态目录都有对应 zip（用户打开工具点「下载」不能 404）；
 *   2) 文件名 = `${slug}-v${version}.zip`，且与契约 zipFile、后端 downloadUrl 同一份来源；
 *   3) 包内只有摊平的 SKILL.md + field-mapping.json，条目名用 POSIX 分隔符；
 *   4) SKILL.md frontmatter 的 name 就是 slug（技能目录靠它识别），description 非空；
 *   5) field-mapping 的落库列键必须真实存在于目标采集表列里，幂等锚必须是表上标了 dedup 的列。
 *
 * 用法：node scripts/verify-insight-skills.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { listZipEntries } from "./lib/zip-store.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const contracts = require(path.join(root, "packages/contracts/dist/index.js"));

const errors = [];
const fail = (message) => errors.push(message);

const skills = contracts.INSIGHT_COLLECTION_SKILLS ?? {};
const tables = contracts.INSIGHT_PRESET_TABLES ?? {};
const keys = Object.keys(skills);
if (!keys.length) fail("契约里没有 INSIGHT_COLLECTION_SKILLS，采集包目录空了");

/** zip 本地头读的是条目名，正文要另外从 store 条目里切出来（method=0，无压缩）。 */
function readZipEntry(file, name) {
  const buf = readFileSync(file);
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const compSize = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const entryName = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
    const start = p + 30 + nameLen + extraLen;
    if (entryName === name) return buf.subarray(start, start + compSize).toString("utf8");
    p = start + compSize;
  }
  return null;
}

for (const key of keys) {
  const skill = skills[key];
  const expectedName = `${skill.slug}-v${skill.version}.zip`;
  if (skill.zipFile !== expectedName) {
    fail(`${key}: zipFile=${skill.zipFile} 与 slug/version 拼出的 ${expectedName} 不一致`);
  }
  const file = path.join(root, "frontend", "public", "downloads", skill.zipFile);
  if (!existsSync(file)) {
    fail(`${key}: 静态目录缺少 frontend/public/downloads/${skill.zipFile}（跑 node scripts/pack-insight-skills.mjs）`);
    continue;
  }

  const entries = listZipEntries(file);
  if (entries.some((entry) => entry.includes("\\"))) {
    fail(`${key}: ${skill.zipFile} 里有反斜杠条目名，macOS/Linux 解压会摊平失败`);
  }
  const missing = ["SKILL.md", "field-mapping.json"].filter((n) => !entries.includes(n));
  if (missing.length) fail(`${key}: ${skill.zipFile} 缺条目 ${missing.join("/")}`);
  const extra = entries.filter((n) => n !== "SKILL.md" && n !== "field-mapping.json");
  if (extra.length) fail(`${key}: ${skill.zipFile} 多出契约未声明的条目 ${extra.join("/")}`);

  const markdown = readZipEntry(file, "SKILL.md") ?? "";
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    fail(`${key}: SKILL.md 没有 frontmatter，技能装载方无法识别`);
  } else {
    const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
    if (name !== skill.slug) fail(`${key}: SKILL.md name=${name} 与契约 slug=${skill.slug} 不一致`);
    if (!frontmatter[1].match(/^description:\s*\S.*$/m)) fail(`${key}: SKILL.md 缺 description`);
  }

  const mapping = JSON.parse(readZipEntry(file, "field-mapping.json") ?? "{}");
  const columns = tables[skill.targetTable]?.columns ?? [];
  if (!columns.length) fail(`${key}: 目标表 ${skill.targetTable} 在契约里没有列定义`);
  const fieldKeys = new Set(columns.map((col) => col.fieldKey));
  const mapped = Object.entries(skill.fieldMapping ?? {});
  if (!mapped.length) fail(`${key}: 契约 fieldMapping 为空`);
  for (const [from, to] of mapped) {
    if (!fieldKeys.has(to)) fail(`${key}: 收割字段「${from}」落到不存在的列键 ${to}`);
    if (mapping.fields?.[from] !== to) fail(`${key}: 包内 field-mapping.json 的「${from}」与契约不一致`);
  }
  const dedupColumns = columns.filter((col) => col.dedup).map((col) => col.fieldKey);
  for (const anchor of skill.dedupKeys ?? []) {
    if (!dedupColumns.includes(anchor)) {
      fail(`${key}: 幂等锚 ${anchor} 不是「${tables[skill.targetTable]?.tableName}」表标了 dedup 的列（可选：${dedupColumns.join("/")}）`);
    }
    if (!mapped.some(([, to]) => to === anchor)) {
      fail(`${key}: 幂等锚 ${anchor} 没有对应的收割字段，采集回来的行去不了重`);
    }
  }
  if (JSON.stringify(mapping.dedupBy ?? []) !== JSON.stringify(skill.dedupKeys ?? [])) {
    fail(`${key}: 包内 dedupBy 与契约不一致`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `采集 SKILL 包一致（${keys.length} 个包：${keys
      .map((key) => `${skills[key].slug}@${skills[key].version}`)
      .join(" · ")}）`,
  );
}
