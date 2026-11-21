import { z } from "zod";

/**
 * AI 社交入口契约。
 *
 * 社交能力由 AIworkin 的 DSH 社交插件提供（聊天 / 分身 / 人脉 / 小组 / 招聘），
 * 本系统只做入口聚合与准入：绑定 AIPDD API Key 才放行，社交数据不落本站。
 */
const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });

const get = <R extends z.ZodType>(path: string, response: R) => ({
  method: "get" as const,
  path,
  params: z.object({}),
  query: z.object({}),
  body: z.undefined(),
  response: envelope(response),
});

export const AI_SOCIAL_STATES = ["UNBOUND", "KEY_INACTIVE", "READY"] as const;
export type AiSocialState = (typeof AI_SOCIAL_STATES)[number];

export const aiSocialStateSchema = z.enum(AI_SOCIAL_STATES);

/** 入口只回 key 与地址；图标、文案与顺序由前端按 key 决定，便于多语言。 */
export const aiSocialLinkSchema = z.object({
  key: z.string(),
  url: z.string(),
});
export type AiSocialLink = z.infer<typeof aiSocialLinkSchema>;

export const aiSocialEntrySchema = z.object({
  /** 是否已绑定可用的 AIPDD API Key。 */
  keyBound: z.boolean(),
  state: aiSocialStateSchema,
  /** aiworkin＝AIworkin 网页；sns＝独立 SNS 网页；none＝未配置地址。 */
  webMode: z.enum(["aiworkin", "sns", "none"]),
  webUrl: z.string(),
  links: z.array(aiSocialLinkSchema),
});
export type AiSocialEntry = z.infer<typeof aiSocialEntrySchema>;

export const aiSocialEndpoints = {
  AiSocial_entry: get("/enterprise/ai-social/entry", aiSocialEntrySchema),
};
