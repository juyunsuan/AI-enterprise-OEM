import { z } from "zod";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/**
 * 出海导航（营销工具）：两级分类 + 站点卡片。
 *
 * 默认数据由 0105 迁移随安装写入（品类参考 2345 出海导航，去掉了资讯/AI 工具等区块）；
 * 用户端只看可见分类与可见站点，管理端返回全部并支持排序、显隐与分类调整。
 */

export const overseasNavItemSchema = z.object({
  id: z.number(),
  categoryId: z.number(),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  logoUrl: z.string(),
  sortOrder: z.number(),
  visible: z.boolean(),
});
export type OverseasNavItemNode = z.infer<typeof overseasNavItemSchema>;

export const overseasNavCategorySchema = z.object({
  id: z.number(),
  parentId: z.number().nullable(),
  name: z.string(),
  sortOrder: z.number(),
  visible: z.boolean(),
  itemCount: z.number(),
});
export type OverseasNavCategoryRow = z.infer<typeof overseasNavCategorySchema>;

/** 前端组树后的节点（分类 + 条目 + 子分类）；接口只返回扁平结构，避免递归 schema。 */
export type OverseasNavCategoryNode = OverseasNavCategoryRow & {
  items: OverseasNavItemNode[];
  children: OverseasNavCategoryNode[];
};

const navTreeResponse = envelope(
  z.object({
    categories: z.array(overseasNavCategorySchema),
    items: z.array(overseasNavItemSchema),
  }),
);

const categoryIdBody = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100),
  parentId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000000).optional(),
  visible: z.boolean().optional(),
});

const itemBody = z.object({
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).default(""),
  url: z.string().trim().url().max(500),
  logoUrl: z.string().trim().max(500).default(""),
  sortOrder: z.number().int().min(0).max(1000000).optional(),
  visible: z.boolean().optional(),
});

export const overseasNavEndpoints = {
  OverseasNav_tree: {
    method: "get" as const,
    path: "/enterprise/marketing/overseas-nav/tree",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: navTreeResponse,
  },
  AdminOverseasNav_tree: {
    method: "get" as const,
    path: "/enterprise/admin/overseas-nav",
    params: z.object({}),
    query: emptyQuery,
    body: z.undefined(),
    response: navTreeResponse,
  },
  AdminOverseasNav_saveCategory: {
    method: "post" as const,
    path: "/enterprise/admin/overseas-nav/categories",
    params: z.object({}),
    query: emptyQuery,
    body: categoryIdBody,
    response: envelope(z.object({ saved: z.boolean(), id: z.number() })),
  },
  AdminOverseasNav_removeCategory: {
    method: "delete" as const,
    path: "/enterprise/admin/overseas-nav/categories/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z.object({ removed: z.boolean(), removedItems: z.number() }),
    ),
  },
  AdminOverseasNav_saveItem: {
    method: "post" as const,
    path: "/enterprise/admin/overseas-nav/items",
    params: z.object({}),
    query: emptyQuery,
    body: itemBody,
    response: envelope(z.object({ saved: z.boolean(), id: z.number() })),
  },
  AdminOverseasNav_removeItem: {
    method: "delete" as const,
    path: "/enterprise/admin/overseas-nav/items/:id",
    params: z.object({ id: z.string() }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },
};