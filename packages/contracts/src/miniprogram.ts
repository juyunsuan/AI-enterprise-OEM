import { z } from "zod";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/**
 * 用户版小程序（移动办公延伸）与平台后台「小程序管理」。
 *
 * 发布链路＝「平台内置源码包 + 小程序码」：后台维护小程序配置、生成 / 上传小程序码，
 * 管理员下载 `pnpm pack:miniprogram` 产出的源码包，在微信开发者工具里填参数、编译、上传与提审。
 * 平台不再代编译、不再代传微信，也不维护代码包台账。
 *
 * 小程序启动读取 `/api/public/miniprogram/bootstrap`（免登录），登录走
 * `/api/public/miniprogram/login`（wx.login 的 code 换会话，或账号密码登录后绑定）。
 * 业务数据（任务 / 审批 / 客服 / 消息）全部复用站内现有契约，不另开一套。
 */

/** 进小程序的业务 tab（对应小程序端页面与后台功能开关），一个键一个页签。 */
export const MINIPROGRAM_FEATURES = [
  "tasks",
  "oa",
  "service",
  "notifications",
  "annualReport",
] as const;
export type MiniprogramFeature = (typeof MINIPROGRAM_FEATURES)[number];
export const MINIPROGRAM_FEATURE_LABELS: Record<string, string> = {
  tasks: "我的任务",
  oa: "OA 审批",
  service: "客服会话",
  notifications: "系统消息",
  annualReport: "工商年报",
};

/** 站点域名：只预填，整体可编辑（客户自有域名，不写死外链协议）。 */
export const miniprogramFeatureToggleSchema = z.object({
  key: z.enum(MINIPROGRAM_FEATURES),
  enabled: z.boolean().default(true),
});
export type MiniprogramFeatureToggle = z.infer<
  typeof miniprogramFeatureToggleSchema
>;

/** 平台内置包：仓库 `miniprogram/` 用 `pnpm pack:miniprogram` 产出，落在服务器 `update/miniprogram/`。 */
export const miniprogramBuiltinSchema = z.object({
  fileName: z.string(),
  fileSize: z.number(),
  version: z.string(),
  updatedAt: z.string(),
});
export type MiniprogramBuiltin = z.infer<typeof miniprogramBuiltinSchema>;

export const miniprogramSettingsViewSchema = z.object({
  enabled: z.boolean(),
  appName: z.string(),
  appId: z.string(),
  appSecretConfigured: z.boolean(),
  siteDomain: z.string(),
  themeColor: z.string(),
  features: z.array(miniprogramFeatureToggleSchema),
  qrcodeUrl: z.string(),
  boundCount: z.number(),
  updatedAt: z.string(),
});
export type MiniprogramSettingsView = z.infer<
  typeof miniprogramSettingsViewSchema
>;

export const miniprogramSettingsInputSchema = z.object({
  enabled: z.boolean().default(false),
  appName: z.string().trim().max(60).default(""),
  appId: z.string().trim().max(64).default(""),
  /** 留空表示保留原值。 */
  appSecret: z.string().max(128).optional(),
  siteDomain: z.string().trim().max(200).default(""),
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "主题色需为 #RRGGBB")
    .default("#3370ff"),
  features: z.array(miniprogramFeatureToggleSchema).max(12).default([]),
});
export type MiniprogramSettingsInput = z.infer<
  typeof miniprogramSettingsInputSchema
>;

/** 上传图片（目前只用于小程序码）的元数据。 */
export const miniprogramPackageFileSchema = z.object({
  fileName: z.string(),
  fileSize: z.number(),
  ossKey: z.string(),
  sha256: z.string(),
});
export type MiniprogramPackageFile = z.infer<
  typeof miniprogramPackageFileSchema
>;

/** 小程序启动配置（免登录）。功能开关关闭的 tab 在小程序端整个不渲染。 */
export const miniprogramBootstrapSchema = z.object({
  enabled: z.boolean(),
  appName: z.string(),
  siteDomain: z.string(),
  themeColor: z.string(),
  features: z.record(z.string(), z.boolean()),
});
export type MiniprogramBootstrap = z.infer<typeof miniprogramBootstrapSchema>;

/** 小程序登录：wx.login 的 code 换会话；带账号密码时先登录再绑定 code 所属 openId。 */
export const miniprogramLoginInputSchema = z.object({
  code: z.string().trim().max(128).optional(),
  username: z.string().trim().max(64).optional(),
  password: z.string().max(128).optional(),
});
export type MiniprogramLoginInput = z.infer<
  typeof miniprogramLoginInputSchema
>;

export const miniprogramProfileSchema = z.object({
  userId: z.string(),
  username: z.string(),
  nickname: z.string(),
});
export type MiniprogramProfile = z.infer<typeof miniprogramProfileSchema>;

export const miniprogramLoginResultSchema = z.object({
  /** 是否已与站内账号绑定；未绑定时 token 为空，小程序据此引导账号密码登录。 */
  bound: z.boolean(),
  token: z.string().default(""),
  profile: miniprogramProfileSchema.nullable().default(null),
});
export type MiniprogramLoginResult = z.infer<
  typeof miniprogramLoginResultSchema
>;

export const miniprogramBindInputSchema = z.object({
  /** wx.login 取得的一次性 code；服务端据此解析小程序 openId 并绑定当前账号。 */
  code: z.string().trim().min(1).max(128),
});
export type MiniprogramBindInput = z.infer<typeof miniprogramBindInputSchema>;

export const miniprogramStatusSchema = z.object({
  enabled: z.boolean(),
  bound: z.boolean(),
  openIdMasked: z.string(),
  boundAt: z.string().nullable(),
});
export type MiniprogramStatus = z.infer<typeof miniprogramStatusSchema>;

export const miniprogramEndpoints = {
  /** 用户侧：当前账号在小程序通道的绑定状态（小程序「我的」页展示）。 */
  MiniProgram_status: {
    method: "get" as const,
    path: "/enterprise/miniprogram/status",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(miniprogramStatusSchema),
  },
  /** 用户侧：把小程序 openId（由 code 解析）绑定到当前登录账号。 */
  MiniProgram_bind: {
    method: "post" as const,
    path: "/enterprise/miniprogram/binding",
    params: z.object({}),
    query: emptyQuery,
    body: miniprogramBindInputSchema,
    response: envelope(miniprogramStatusSchema),
  },

  MiniProgramAdmin_settings: {
    method: "get" as const,
    path: "/enterprise/admin/miniprogram/settings",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(miniprogramSettingsViewSchema),
  },
  MiniProgramAdmin_saveSettings: {
    method: "put" as const,
    path: "/enterprise/admin/miniprogram/settings",
    params: z.object({}),
    query: emptyQuery,
    body: miniprogramSettingsInputSchema,
    response: envelope(miniprogramSettingsViewSchema),
  },
  /** 连接自检：用配置的 AppID / AppSecret 取一次 access_token，验证凭据是否可用。 */
  MiniProgramAdmin_test: {
    method: "post" as const,
    path: "/enterprise/admin/miniprogram/settings/test",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({}),
    response: envelope(
      z.object({
        ok: z.boolean(),
        appName: z.string().default(""),
        message: z.string().default(""),
      }),
    ),
  },
  /**
   * 小程序码：`mode=GENERATE` 用配置的凭据调微信接口生成（需 AppID / AppSecret），
   * `mode=UPLOAD` 由管理员上传图片（multipart 走单独路由，不进 JSON 契约）。
   */
  MiniProgramAdmin_qrcode: {
    method: "post" as const,
    path: "/enterprise/admin/miniprogram/qrcode",
    params: z.object({}),
    query: emptyQuery,
    body: z.object({
      mode: z.enum(["GENERATE", "UPLOAD"]).default("GENERATE"),
      /** UPLOAD 模式下的图片元数据；GENERATE 模式忽略。 */
      fileName: z.string().trim().max(160).optional(),
      ossKey: z.string().trim().max(400).optional(),
    }),
    response: envelope(z.object({ qrcodeUrl: z.string() })),
  },
  /**
   * 平台内置包（服务器 `update/miniprogram/*.zip`）：随代码版本携带。
   * 下载走二进制路由（`/enterprise/admin/miniprogram/builtin/:file/download`），不进 JSON 契约。
   */
  MiniProgramAdmin_builtin: {
    method: "get" as const,
    path: "/enterprise/admin/miniprogram/builtin",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ items: z.array(miniprogramBuiltinSchema) })),
  },
} as const;
