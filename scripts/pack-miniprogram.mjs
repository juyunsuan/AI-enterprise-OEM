/**
 * 打包用户版小程序源码 → zip（供「平台管理后台 → 小程序管理 → 内置包」下载）。
 *
 * 产物落在服务器 `update/miniprogram/miniprogram-<version>.zip`（后端内置包目录
 * 就是 `<update>/miniprogram`）；管理员下载后用微信开发者工具导入上传、提审发布。
 * 本脚本只在仓库侧产出源码包，不调微信接口。
 *
 * 注入项（都不改仓库源文件，只改写进 zip 的那份）：
 * - `MINIPROGRAM_VERSION`：版本号，默认取根 package.json 的 version（不自动升版本）。
 * - `MINIPROGRAM_API_BASE`：接口基址，写进包内 `config.js` 的 `apiBase`。微信要求
 *   request 合法域名预先登记，域名本质上要随包带出；不传则保留空值（端上仍可在
 *   「我的 → 服务器地址」填写）。
 *
 * 用法：MINIPROGRAM_API_BASE=https://example.com node scripts/pack-miniprogram.mjs
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles, listZipEntries, writeStoreZip } from "./lib/zip-store.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "miniprogram");

if (!existsSync(join(srcDir, "app.json"))) {
  console.error("miniprogram/app.json 不存在，无法打包");
  process.exit(1);
}

/** 版本优先级与后端 currentVersion() 一致：环境变量 → release-manifest.json → git tag。 */
function resolveVersion() {
  const env = String(process.env.MINIPROGRAM_VERSION || "").trim();
  if (env) return env.replace(/^v/i, "");
  const file = join(root, "release-manifest.json");
  if (existsSync(file)) {
    try {
      const version = JSON.parse(readFileSync(file, "utf8")).version;
      if (version) return String(version).replace(/^v/i, "");
    } catch {
      // 清单损坏时继续回退到 git tag，不阻断打包。
    }
  }
  try {
    const described = execFileSync("git", ["describe", "--tags", "--always"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const match = described.match(/^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
    if (match) return match[1];
  } catch {
    // 非 git 仓库（如源码包内）时用兜底版本。
  }
  return "0.0.0";
}

const version = resolveVersion();

const apiBase = String(process.env.MINIPROGRAM_API_BASE || "")
  .trim()
  .replace(/\/+$/, "");
if (apiBase && !/^https?:\/\/[^\s]+$/.test(apiBase)) {
  console.error(`MINIPROGRAM_API_BASE 不是合法地址：${apiBase}`);
  process.exit(1);
}

// 微信开发者工具生成、不该随源码分发的文件：私有配置与系统临时文件。
const EXCLUDE = [/project\.private\.config\.json$/i, /^~\$/, /\.DS_Store$/i];
const files = collectFiles(srcDir).filter(
  (file) => !EXCLUDE.some((rule) => rule.test(file.name)),
);

if (apiBase) {
  const target = files.find((file) => file.name === "config.js");
  if (!target) {
    console.error("包内缺少 config.js，无法注入接口基址");
    process.exit(1);
  }
  const source = target.content.toString("utf8");
  if (!/apiBase:\s*""/.test(source)) {
    console.error("config.js 的 apiBase 占位不是空串，无法注入接口基址");
    process.exit(1);
  }
  target.content = Buffer.from(
    source.replace(/apiBase:\s*""/, `apiBase: ${JSON.stringify(apiBase)}`),
    "utf8",
  );
}

const outDir = join(root, "update", "miniprogram");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `miniprogram-${version}.zip`);
const { count, backslash } = writeStoreZip(outFile, files);

const archive = readFileSync(outFile);
const sha256 = createHash("sha256").update(archive).digest("hex");
const hasAppJson = listZipEntries(outFile).includes("app.json");

console.log(
  `已打包 ${count} 个条目 → ${outFile.replace(root + "\\", "")}（v${version}）`,
);
console.log(`  体积   ${(archive.length / 1024).toFixed(1)} KB`);
console.log(`  SHA-256 ${sha256}`);
console.log(`  app.json ${hasAppJson ? "✓" : "✗"}  反斜杠条目 ${backslash}`);
console.log(
  `  接口基址 ${apiBase || "（未注入，端上「我的 → 服务器地址」填写）"}`,
);

// 微信开发者工具导入要求：根目录有 app.json，且条目名必须是 POSIX 分隔符。
if (backslash || !hasAppJson) process.exit(1);
