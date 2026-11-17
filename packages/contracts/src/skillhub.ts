import { z } from "zod";
import { contentAgentSkillSchema } from "./content";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/** SkillHub（api.skillhub.cn）公开技能目录：只读搜索、详情与安装。 */
export const skillHubSkillSchema = z.object({
  slug: z.string(),
  name: z.string(),
  summary: z.string().default(""),
  category: z.string().default(""),
  categoryLabel: z.string().default(""),
  downloads: z.number().default(0),
  stars: z.number().default(0),
  version: z.string().default(""),
  iconUrl: z.string().default(""),
  publisherName: z.string().default(""),
  publisherVerified: z.boolean().default(false),
  namespaceHandle: z.string().default(""),
  updatedAt: z.string().default(""),
});
export type SkillHubSkill = z.infer<typeof skillHubSkillSchema>;

export const skillHubSecuritySchema = z.object({
  name: z.string(),
  status: z.string().default(""),
  statusText: z.string().default(""),
});
export const skillHubVersionSchema = z.object({
  version: z.string().default(""),
  changelog: z.string().default(""),
  createdAt: z.string().default(""),
});
export const skillHubDetailSchema = skillHubSkillSchema.extend({
  summaryZh: z.string().default(""),
  overview: z.string().default(""),
  homepage: z.string().default(""),
  installs: z.number().default(0),
  security: z.array(skillHubSecuritySchema).default([]),
  versions: z.array(skillHubVersionSchema).default([]),
});
export type SkillHubDetail = z.infer<typeof skillHubDetailSchema>;

export const skillHubEndpoints = {
  SkillHub_list: {
    method: "get" as const,
    path: "/enterprise/skillhub/skills",
    params: z.object({}),
    query: z.object({
      keyword: z.string().max(120).default(""),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(16),
    }),
    body: z.undefined(),
    response: envelope(
      z.object({
        list: z.array(skillHubSkillSchema),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    ),
  },
  SkillHub_detail: {
    method: "get" as const,
    path: "/enterprise/skillhub/skills/:slug",
    params: z.object({ slug: z.string().min(1).max(120) }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(skillHubDetailSchema),
  },
  SkillHub_install: {
    method: "post" as const,
    path: "/enterprise/skillhub/skills/:slug/install",
    params: z.object({ slug: z.string().min(1).max(120) }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(contentAgentSkillSchema),
  },
};
