/**
 * 打包 AWBotDSH 浏览器桥接扩展 → zip（供 GitHub release 与本机 Chrome 兜底安装）。
 *
 * 这份扩展同时服务两个载体：
 *   · AWBotDSH 内置指纹浏览器：随安装包分发（由 DSH 侧 bundled-extensions 复制）；
 *   · 本机 Chrome 兜底：用户在 chrome://extensions 里「加载已解压的扩展程序」，
 *     或在设置 → 浏览器设置 → 网页模型里拿到桥地址与令牌后填入扩展弹窗。
 *
 * zip 根目录直接放 manifest.json（不套一层目录），解压出的文件夹即可被 Chrome 直接选中。
 *
 * 用法：node scripts/pack-chrome-bridge.mjs
 * 产物：.tmp/awbotdsh-chrome-bridge-v<version>.zip（版本取自 manifest.json）
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectFiles, writeStoreZip } from "./lib/zip-store.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extDir = join(root, "bot-host-client", "chrome-bridge-extension");

const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
if (!manifest.version) {
  console.error("bot-host-client/chrome-bridge-extension/manifest.json 缺少 version");
  process.exit(1);
}

const files = collectFiles(extDir, "");
if (!files.some((item) => item.name.endsWith("manifest.json"))) {
  console.error("bot-host-client/chrome-bridge-extension/manifest.json 不存在，无法打包");
  process.exit(1);
}

const outDir = join(root, ".tmp");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `awbotdsh-chrome-bridge-v${manifest.version}.zip`);
writeStoreZip(out, files);
console.log(`已打包 ${files.length} 个条目 → ${out}（v${manifest.version}）`);
