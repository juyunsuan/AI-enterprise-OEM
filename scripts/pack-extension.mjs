/**
 * 打包 AIPDD Enterprise 浏览器插件 → zip（供 frontend/public/downloads/ 分发）。
 *
 * zip 写入共用 `scripts/lib/zip-store.mjs`（零依赖 store 打包器，条目名固定 POSIX 分隔符）。
 *
 * 用法：node scripts/pack-extension.mjs
 * 产物文件名取自 extensions/aipdd-enterprise/manifest.json 的 version，
 * 需与 backend EXTENSION_RELEASE.downloadPath 一致（verify-distribution.mjs 会断言）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles, listZipEntries, writeStoreZip } from "./lib/zip-store.mjs";

export { listZipEntries };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extDir = join(root, "extensions", "aipdd-enterprise");
// zip 根目录直接放 manifest.json（不再套一层 aipdd-enterprise/）：
// Windows「全部解压缩」会按压缩包名建一层文件夹，再套一层目录就会变成
// <包名>/aipdd-enterprise/manifest.json，用户在扩展页选 <包名> 会报「清单文件缺失」。
// 摊平后解压出的 <包名> 文件夹本身即可被「加载已解压的扩展程序」直接选中。
const dirInZip = "";

const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
const files = collectFiles(extDir, dirInZip);
if (!files.some((f) => f.name.endsWith("manifest.json"))) {
  console.error("extensions/aipdd-enterprise/manifest.json 不存在，无法打包");
  process.exit(1);
}

const out = join(
  root,
  "frontend",
  "public",
  "downloads",
  `aipdd-enterprise-v${manifest.version}.zip`,
);
const { count, backslash } = writeStoreZip(out, files);

console.log(
  `已打包 ${count} 个条目 → ${out.replace(root + "\\", "")}（v${manifest.version}，反斜杠条目 ${backslash}）`,
);
if (backslash) process.exit(1);
