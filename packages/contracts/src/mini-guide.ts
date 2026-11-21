import { z } from "zod";
import { TOOL_LAUNCH_CODES } from "./tool-launch";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });

/**
 * 小程序「源码分发包 + 发布说明」契约。
 *
 * 产品口径（2026-11-19 确认）：
 * - 平台**不替用户编译、不代传微信**：用户下载平台统一输出的源码分发包（zip），
 *   在自己的微信开发者工具里编译、预览、上传、提审；
 * - 店铺参数（apiBase / 租户码 / AppID / 主题色）由用户自己在 `config.js`、
 *   `project.config.json` 里填 —— 所以说明页必须把**这个账号该填什么**逐条摆出来；
 * - 正文由平台管理员在后台维护，**域名与账号参数由配置自动渲染**，
 *   同一份数据源同时供「建站管理·小程序板块」「各工具发布页」「帮助中心」三处使用，
 *   避免三份话术各说各话。
 */

/** 微信后台要填的一类服务器域名。 */
export const miniGuideDomainSchema = z.object({
  /** request 合法域名 / uploadFile / downloadFile … */
  label: z.string(),
  /** 需要用户复制进微信后台的完整前缀，如 https://example.com */
  origin: z.string(),
  /** 站点域名未配置时为 false，说明页会给出可操作提示而不是一个空值 */
  configured: z.boolean(),
});

/** 用户要在源码里自己填的一个参数。 */
export const miniGuideValueSchema = z.object({
  /** 源码里的字段名，如 apiBase / shopCode / appid */
  key: z.string(),
  /** 中文名 */
  label: z.string(),
  /** 该账号应填的实际值（拿不到时给占位说明，不留空） */
  value: z.string(),
  /** 落在哪个文件、哪一行附近 */
  hint: z.string(),
});

export const miniGuideStepSchema = z.object({
  title: z.string(),
  detail: z.string().default(""),
});

export const miniGuidePackageSchema = z.object({
  /** 该工具是否提供源码分发包下载（国际独立站等 Web 工具为 false） */
  available: z.boolean(),
  fileName: z.string().default(""),
  version: z.string().default(""),
  sizeBytes: z.number().default(0),
  /** 主包体积闸门：超限直接说明原因，而不是让用户传到微信才发现 */
  withinLimit: z.boolean().default(true),
  /** 统一包是平台产物，不含账号参数：说明页必须讲清"下载后要自己填" */
  injected: z.literal(false).default(false),
});

export const miniGuideViewSchema = z.object({
  toolCode: z.enum(TOOL_LAUNCH_CODES).nullable(),
  toolName: z.string(),
  /** 后台可编辑正文（管理员话术），支持简单换行与项目符号 */
  body: z.string().default(""),
  domains: z.array(miniGuideDomainSchema).default([]),
  values: z.array(miniGuideValueSchema).default([]),
  steps: z.array(miniGuideStepSchema).default([]),
  pkg: miniGuidePackageSchema,
  /** 站点域名未配置等阻断项：给出下一步，而不是只说"不行" */
  blockers: z.array(z.string()).default([]),
  updatedAt: z.string().nullable(),
});
export type MiniGuideView = z.infer<typeof miniGuideViewSchema>;

/** 管理端：公共正文 + 每个工具的补充正文（可留空继承公共）。 */
export const miniGuideAdminViewSchema = z.object({
  body: z.string(),
  overrides: z
    .array(
      z.object({
        toolCode: z.enum(TOOL_LAUNCH_CODES),
        toolName: z.string(),
        body: z.string(),
      }),
    )
    .default([]),
  updatedAt: z.string().nullable(),
});
export type MiniGuideAdminView = z.infer<typeof miniGuideAdminViewSchema>;

export const miniGuideSaveBodySchema = z.object({
  body: z.string().max(20_000),
  overrides: z
    .array(z.object({ toolCode: z.enum(TOOL_LAUNCH_CODES), body: z.string().max(6000) }))
    .max(20)
    .optional(),
});
export type MiniGuideSaveBody = z.infer<typeof miniGuideSaveBodySchema>;

/** 直接下载源码包：按工具码现场打包模板源码，返回下载直链（不落发布台账）。 */
export const miniGuideDownloadBodySchema = z.object({
  tool: z.enum(TOOL_LAUNCH_CODES),
});
export type MiniGuideDownloadBody = z.infer<typeof miniGuideDownloadBodySchema>;

export const miniGuideDownloadResultSchema = z.object({
  url: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  sha256: z.string(),
});
export type MiniGuideDownloadResult = z.infer<
  typeof miniGuideDownloadResultSchema
>;

const get = <Q extends z.ZodType, R extends z.ZodType>(
  path: string,
  query: Q,
  response: R,
) => ({
  method: "get" as const,
  path,
  params: z.object({}),
  query,
  body: z.undefined(),
  response: envelope(response),
});

const post = <B extends z.ZodType, R extends z.ZodType>(
  path: string,
  body: B,
  response: R,
) => ({
  method: "post" as const,
  path,
  params: z.object({}),
  query: z.object({}),
  body,
  response: envelope(response),
});

export const miniGuideEndpoints = {
  /** 用户侧：某工具的发布说明（含本账号要填的值与域名清单） */
  MiniGuide_view: get(
    "/enterprise/mini-guide/detail",
    z.object({ tool: z.enum(TOOL_LAUNCH_CODES).optional() }),
    miniGuideViewSchema,
  ),
  /** 建站管理·小程序板块右侧的通用说明（不带具体账号参数） */
  MiniGuide_shared: get(
    "/enterprise/mini-guide/shared",
    z.object({}),
    miniGuideViewSchema,
  ),
  /** 直接下载源码包：不需要先「生成代码包」，点一下按工具码现打 zip 并返回直链 */
  MiniGuide_downloadPackage: post(
    "/enterprise/mini-guide/package",
    miniGuideDownloadBodySchema,
    miniGuideDownloadResultSchema,
  ),
  MiniGuideAdmin_view: get(
    "/enterprise/admin/mini-guide/detail",
    z.object({}),
    miniGuideAdminViewSchema,
  ),
  MiniGuideAdmin_save: post(
    "/enterprise/admin/mini-guide/save",
    miniGuideSaveBodySchema,
    miniGuideAdminViewSchema,
  ),
};
