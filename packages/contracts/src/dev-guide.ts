import { z } from "zod";

/**
 * 平台后台「二次开发指引」契约。
 *
 * 正文真源在仓库 `docs/dev-kit/`，后台只渲染真源并分发套件，不另存一份正文。
 * 管理员只能在 `system_settings` 里维护「本站补充说明」，避免形成第二份规范。
 */

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });

export const DEV_KIT_DOC_KEYS = [
  "architecture",
  "api",
  "third-party",
  "principles",
] as const;

/** 技能清单的唯一真源：打包脚本、后台下载按钮与守卫脚本都读这里。 */
export const DEV_KIT_SKILLS = {
  "ub-mode": {
    slug: "ub-mode",
    version: "1.0.0",
    title: "ub-mode 工程纪律",
    description:
      "First Make it Work / Then Make it Right / Practice 三阶段工程纪律；Codex 用 $ub-mode、Claude 用 /ub-mode 触发。",
    zipFile: "ub-mode-v1.0.0.zip",
  },
  "enterprise-contract": {
    slug: "enterprise-contract",
    version: "1.0.0",
    title: "本系统契约开发",
    description:
      "新增或修改 HTTP 接口、错误码时的标准动作：契约 → 后端派发 → 前端 endpoint → 重生成与守卫。",
    zipFile: "enterprise-contract-v1.0.0.zip",
  },
  "enterprise-miniapp": {
    slug: "enterprise-miniapp",
    version: "1.0.0",
    title: "本系统小程序开发",
    description:
      "新增小程序 / 新终端的标准动作：复用 shared/mini-core、只写差异、保持 ES5 底线并同步校验。",
    zipFile: "enterprise-miniapp-v1.0.0.zip",
  },
  "enterprise-review": {
    slug: "enterprise-review",
    version: "1.0.0",
    title: "本系统提交前自检",
    description:
      "提交前自检：令牌隔离、顾客态双条件、网络出口唯一，以及必跑的架构守卫与未验证项报告。",
    zipFile: "enterprise-review-v1.0.0.zip",
  },
} as const;

export type DevKitSkillKey = keyof typeof DEV_KIT_SKILLS;

export const devGuideDocSchema = z.object({
  key: z.enum(DEV_KIT_DOC_KEYS),
  title: z.string(),
  /** 真源路径（相对仓库根），后台页用来提示「改这里刷新即变」。 */
  source: z.string(),
  markdown: z.string(),
});
export type DevGuideDoc = z.infer<typeof devGuideDocSchema>;

export const devGuideDownloadSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string().default(""),
  fileName: z.string(),
  downloadUrl: z.string(),
  /** 文件不在 downloads 目录时为 false，后台只展示不可下载。 */
  available: z.boolean(),
});
export type DevGuideDownload = z.infer<typeof devGuideDownloadSchema>;

export const devGuideCommandSchema = z.object({
  label: z.string(),
  command: z.string(),
});

export const devGuideViewSchema = z.object({
  kitVersion: z.string(),
  docs: z.array(devGuideDocSchema),
  skills: z.array(devGuideDownloadSchema),
  kit: devGuideDownloadSchema,
  commands: z.array(devGuideCommandSchema),
  aiPrompt: z.string(),
  notice: z.string(),
  noticeUpdatedAt: z.string().nullable(),
});
export type DevGuideView = z.infer<typeof devGuideViewSchema>;

export const devGuideSaveBodySchema = z.object({
  notice: z.string().max(20_000),
});
export type DevGuideSaveBody = z.infer<typeof devGuideSaveBodySchema>;

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

export const devGuideEndpoints = {
  /** 平台管理员：开发指引真源、下载清单与本站补充说明。 */
  DevGuideAdmin_view: get(
    "/enterprise/admin/dev-guide/detail",
    z.object({}),
    devGuideViewSchema,
  ),
  /** 平台管理员：只保存本站补充说明，主体正文仍由仓库真源渲染。 */
  DevGuideAdmin_save: post(
    "/enterprise/admin/dev-guide/save",
    devGuideSaveBodySchema,
    devGuideViewSchema,
  ),
};
