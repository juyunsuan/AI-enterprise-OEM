/**
 * 打包智慧分析「采集 SKILL 包」→ zip（供 frontend/public/downloads/ 分发）。
 *
 * 口径：
 * - 包内容只有一个契约派生的事实来源：packages/contracts 的 INSIGHT_COLLECTION_SKILLS
 *   （SKILL.md 正文与 field-mapping.json 都是它的一部分），手写副本一律不要。
 * - zip 根目录摊平（SKILL.md 直接在根），与浏览器插件包同口径：用户解压出的目录名即包名，
 *   丢进 BotBuddy / WorkBuddy / Codex 的技能目录就能被识别。
 * - 文件名 = `${slug}-v${version}.zip`，必须与契约 zipFile 一致（verify-insight-skills.mjs 断言）。
 *
 * 用法：node scripts/pack-insight-skills.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { collectFiles, listZipEntries, writeStoreZip } from "./lib/zip-store.mjs";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const contracts = require(path.join(root, "packages/contracts/dist/index.js"));

const skills = contracts.INSIGHT_COLLECTION_SKILLS;
const outDir = path.join(root, "frontend", "public", "downloads");
/** 逐包写盘的中转目录（zip 条目名由 collectFiles 生成，保证与插件包同一套分隔符规则）。 */
const stageDir = path.join(root, "scripts", "tmp", "insight-skills");

rmSync(stageDir, { recursive: true, force: true });

for (const key of Object.keys(skills)) {
  const skill = skills[key];
  const dir = path.join(stageDir, skill.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `${skill.skillMarkdown.trimEnd()}\n`, "utf8");
  writeFileSync(
    path.join(dir, "field-mapping.json"),
    `${JSON.stringify({ table: skill.targetTable, dedupBy: skill.dedupKeys, fields: skill.fieldMapping }, null, 2)}\n`,
    "utf8",
  );

  const out = path.join(outDir, skill.zipFile);
  const { count, backslash } = writeStoreZip(out, collectFiles(dir, ""));
  const entries = listZipEntries(out);
  console.log(
    `已打包 ${skill.slug} v${skill.version} → frontend/public/downloads/${skill.zipFile}（${count} 个条目：${entries.join(", ")}，反斜杠条目 ${backslash}）`,
  );
  if (backslash) process.exit(1);
}

rmSync(stageDir, { recursive: true, force: true });
