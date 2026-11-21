import { z } from "zod";

/**
 * 租户 RBAC：主账号创建子账号（独立登录），按业务模块授权。
 * 子账号的数据归属仍是主账号（owner_user_id），这里只收窄可写的功能面；
 * 模块 key 同时用于前端菜单过滤与后端 `/enterprise/**` 路由守卫。
 */

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });

export type RbacModule = {
  key: string;
  name: string;
  /** 后端 API 路径前缀（含尾部斜杠），守卫按最长前缀匹配。 */
  prefixes: string[];
};

export const RBAC_MODULES: RbacModule[] = [
  { key: "tasks", name: "任务中心", prefixes: ["/enterprise/my-tasks/"] },
  { key: "agent", name: "AI Agent", prefixes: ["/enterprise/agent/"] },
  { key: "onsite", name: "上门服务", prefixes: ["/enterprise/onsite/"] },
  { key: "rental", name: "租赁管理", prefixes: ["/enterprise/rental/"] },
  { key: "crm", name: "客户管理", prefixes: ["/enterprise/crm/"] },
  { key: "bi", name: "BI 智能分析", prefixes: ["/enterprise/bi/"] },
  { key: "insight", name: "智慧分析", prefixes: ["/enterprise/insight/"] },
  { key: "oa", name: "协同办公", prefixes: ["/enterprise/oa/"] },
  { key: "okr", name: "OKR 计划", prefixes: ["/enterprise/okr/"] },
  { key: "hrm", name: "人事工作台", prefixes: ["/enterprise/hrm/"] },
  { key: "project", name: "项目管理", prefixes: ["/enterprise/project/"] },
  { key: "erp", name: "进销存", prefixes: ["/enterprise/erp/"] },
  { key: "brand-mall", name: "品牌商城", prefixes: ["/enterprise/brand-mall/"] },
  { key: "community", name: "创意社区", prefixes: ["/enterprise/community/"] },
  { key: "content", name: "内容创作", prefixes: ["/enterprise/content/"] },
  { key: "kb", name: "知识库", prefixes: ["/enterprise/kb/"] },
  { key: "mkt", name: "营销工具", prefixes: ["/enterprise/mkt/"] },
  // 以下模块此前只有前端菜单与功能目录有位置、RBAC 没有 key，子账号无论授权都可见可用；补齐后菜单显隐与接口守卫同口径。
  { key: "service-desk", name: "AI客服", prefixes: ["/enterprise/service-desk/"] },
  { key: "health", name: "健康管理", prefixes: ["/enterprise/health/"] },
  {
    key: "knowledge-pay",
    name: "知识付费",
    prefixes: ["/enterprise/knowledge-pay/"],
  },
  {
    key: "digital-human",
    name: "数字人工具",
    prefixes: ["/enterprise/digital-human/"],
  },
  { key: "card-shop", name: "卡密商城", prefixes: ["/enterprise/card-shop/"] },
  { key: "kuaidi", name: "快递寄件", prefixes: ["/enterprise/kuaidi/"] },
  { key: "circle", name: "圈子社区", prefixes: ["/enterprise/circle/"] },
  { key: "errand", name: "跑腿小程序", prefixes: ["/enterprise/errand/"] },
  {
    key: "marketplace",
    name: "多店铺商城",
    prefixes: ["/enterprise/marketplace/"],
  },
  { key: "mail", name: "AI邮箱服务", prefixes: ["/enterprise/mail/"] },
  { key: "data-table", name: "多维表格", prefixes: ["/enterprise/data-tables/"] },
  { key: "rpa", name: "RPA自动化", prefixes: ["/enterprise/rpa/"] },
  {
    key: "question-hall",
    name: "专题大厅",
    prefixes: ["/enterprise/question-hall/"],
  },
  {
    key: "quiz",
    name: "答题小程序",
    prefixes: ["/enterprise/quiz/"],
  },
  {
    key: "app-center",
    name: "应用中心",
    prefixes: ["/enterprise/apps/", "/enterprise/lowcode/"],
  },
  {
    key: "assets",
    name: "数字资产管理",
    prefixes: ["/enterprise/content/digital-assets/"],
  },
];

export const RBAC_SCOPE_KEYS: string[] = RBAC_MODULES.map((m) => m.key);

export const RBAC_ROLES = [
  {
    code: "ADMIN",
    name: "管理员",
    desc: "除人员与日志外的全部业务模块",
  },
  { code: "OPERATOR", name: "运营", desc: "任务 / 客户 / 内容 / 营销等日常执行" },
  { code: "FINANCE", name: "财务", desc: "BI / 进销存 / OKR 等对账与计划" },
  { code: "VIEWER", name: "只读", desc: "默认仅 BI 与智慧分析（写操作仍实时留痕）" },
] as const;

export type RbacRoleCode = (typeof RBAC_ROLES)[number]["code"];

/** 角色默认模块集：创建时可再勾选覆盖。 */
export const RBAC_ROLE_DEFAULT_SCOPES: Record<RbacRoleCode, string[]> = {
  ADMIN: RBAC_MODULES.map((m) => m.key),
  // 运营=日常执行面：客服接待与各建站工具都属日常运营，新补模块一并给到（不存在“后续再放开”）。
  OPERATOR: [
    "tasks",
    "agent",
    "crm",
    "onsite",
    "content",
    "mkt",
    "community",
    "service-desk",
    "health",
    "knowledge-pay",
    "digital-human",
    "card-shop",
    "kuaidi",
    "circle",
    "marketplace",
    "mail",
    "data-table",
    "rpa",
    "question-hall",
    "quiz",
    "app-center",
    "assets",
  ],
  FINANCE: ["tasks", "bi", "insight", "erp", "okr"],
  VIEWER: ["bi", "insight"],
};

export const RBAC_MEMBER_STATUSES = ["ACTIVE", "DISABLED"] as const;

export const rbacMemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  username: z.string(),
  roleCode: z.string(),
  scopes: z.array(z.string()),
  status: z.string(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export const rbacLogSchema = z.object({
  id: z.number(),
  actorUserId: z.string(),
  actorName: z.string(),
  subAccountId: z.number().nullable(),
  module: z.string(),
  moduleName: z.string(),
  action: z.string(),
  method: z.string(),
  path: z.string(),
  status: z.string(),
  ip: z.string(),
  createdAt: z.string(),
});

export const rbacEndpoints = {
  Rbac_context: {
    method: "get" as const,
    path: "/enterprise/rbac/context",
    params: z.object({}),
    query: z.object({}),
    body: z.undefined(),
    response: envelope(
      z.object({
        ownerUserId: z.string(),
        isSubAccount: z.boolean(),
        subAccountId: z.number().nullable(),
        subAccountName: z.string(),
        roleCode: z.string(),
        /** 主账号为 null（不限制）；子账号为模块 key 数组 */
        scopes: z.array(z.string()).nullable(),
      }),
    ),
  },
  Rbac_members: {
    method: "get" as const,
    path: "/enterprise/rbac/members",
    params: z.object({}),
    query: z.object({}),
    body: z.undefined(),
    response: envelope(
      z.object({
        roles: z.array(
          z.object({
            code: z.string(),
            name: z.string(),
            desc: z.string(),
            defaultScopes: z.array(z.string()),
          }),
        ),
        modules: z.array(
          z.object({ key: z.string(), name: z.string() }),
        ),
        items: z.array(rbacMemberSchema),
      }),
    ),
  },
  Rbac_member: {
    method: "get" as const,
    path: "/enterprise/rbac/members/:id",
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({}),
    body: z.undefined(),
    response: envelope(rbacMemberSchema),
  },
  Rbac_saveMember: {
    method: "post" as const,
    path: "/enterprise/rbac/members",
    params: z.object({}),
    query: z.object({}),
    body: z.object({
      /** 传 id 为修改；不传为新建 */
      id: z.number().int().positive().optional(),
      name: z.string().min(1).max(60),
      /** 登录名（同站内账号唯一；修改时不可改） */
      username: z.string().min(3).max(64).optional(),
      /** 新建必填；修改时传了才重置 */
      password: z.string().min(8).max(64).optional(),
      roleCode: z.enum(["ADMIN", "OPERATOR", "FINANCE", "VIEWER"]),
      scopes: z.array(z.string()).max(32),
    }),
    response: envelope(rbacMemberSchema),
  },
  Rbac_setMemberStatus: {
    method: "post" as const,
    path: "/enterprise/rbac/members/:id/status",
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({}),
    body: z.object({ status: z.enum(["ACTIVE", "DISABLED"]) }),
    response: envelope(z.object({ id: z.number(), status: z.string() })),
  },
  Rbac_removeMember: {
    method: "delete" as const,
    path: "/enterprise/rbac/members/:id",
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({}),
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },
  Rbac_operationLogs: {
    method: "get" as const,
    path: "/enterprise/rbac/operation-logs",
    params: z.object({}),
    query: z.object({
      module: z.string().optional(),
      actorUserId: z.string().optional(),
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }),
    body: z.undefined(),
    response: envelope(
      z.object({
        items: z.array(rbacLogSchema),
        total: z.number(),
        page: z.number(),
        pageSize: z.number(),
      }),
    ),
  },
};

export type RbacMember = z.infer<typeof rbacMemberSchema>;
export type RbacOperationLog = z.infer<typeof rbacLogSchema>;
