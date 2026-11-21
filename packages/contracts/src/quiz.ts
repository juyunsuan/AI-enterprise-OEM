import { z } from "zod";
import { pageQuerySchema, pageSchema } from "./pagination";

const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ code: z.number(), message: z.string(), data: data.nullable() });
const emptyQuery = z.object({});

/**
 * 答题小程序（智汇答题形态）：站点 → 题库 → 题目 → 交卷记录。
 *
 * 题库与答题记录都落在账号自己的多维表格里：题目一行一题，交卷记录一行一次，
 * 后台「多维表格」可直接筛选、导出、接飞书同步；小程序只经公开通道读写。
 * AI 解析/出题/复盘走统一模型网关，AI 客服只绑定 service-desk 已有站点，不另设客服实体。
 */

export const QUIZ_BANK_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED"] as const;
export type QuizBankStatus = (typeof QUIZ_BANK_STATUSES)[number];
export const QUIZ_BANK_STATUS_LABELS: Record<QuizBankStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CLOSED: "已关闭",
};

export const QUIZ_QUESTION_TYPES = ["single", "multiple", "judge"] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];
export const QUIZ_QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
};
/** 多维表格里存中文，题库表人工录入也能直接看懂；服务端负责与枚举互转。 */
export const QUIZ_QUESTION_TYPE_TABLE_LABELS: Record<QuizQuestionType, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
};

export const QUIZ_MODES = ["practice", "exam"] as const;
export type QuizMode = (typeof QUIZ_MODES)[number];
export const QUIZ_MODE_LABELS: Record<QuizMode, string> = {
  practice: "练习",
  exam: "考试",
};

export const QUIZ_ANSWER_MAX = 6;
export const QUIZ_PARTICIPANT_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const quizOptionSchema = z.object({
  key: z.string().min(1).max(2),
  label: z.string().min(1).max(200),
  imageUrl: z.string().max(500).default(""),
});
export type QuizOption = z.infer<typeof quizOptionSchema>;

export const quizQuestionSchema = z.object({
  id: z.number(),
  type: z.enum(QUIZ_QUESTION_TYPES),
  title: z.string(),
  imageUrl: z.string(),
  options: z.array(quizOptionSchema),
  answer: z.string(),
  analysis: z.string(),
  category: z.string(),
  sort: z.number(),
});
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

/** 公开题面：不带正确答案与解析，防止前端直接看到答案。 */
export const quizPublicQuestionSchema = quizQuestionSchema.omit({
  answer: true,
  analysis: true,
});
export type QuizPublicQuestion = z.infer<typeof quizPublicQuestionSchema>;

export const quizSettingsSchema = z.object({
  /** 考试倒计时（秒）；练习不计时。 */
  durationSec: z.number().int().min(60).max(24 * 3600).default(600),
  /** 每次考试的抽题数；练习始终返回全量题目。 */
  examCount: z.number().int().min(1).max(200).default(20),
  passScore: z.number().int().min(0).max(100).default(60),
  randomize: z.boolean().default(true),
  showAnalysis: z.boolean().default(true),
  aiExplain: z.boolean().default(true),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const quizSiteSettingsSchema = z.object({
  /** 进入考试/练习前是否要求填昵称与单位。 */
  registerRequired: z.boolean().default(true),
  /** 参考包「审核制」：开启后后台可看到待审核参赛者（当前版本只做标记，不做拦答）。 */
  checkUser: z.boolean().default(false),
  allowPractice: z.boolean().default(true),
  allowExam: z.boolean().default(true),
});
export type QuizSiteSettings = z.infer<typeof quizSiteSettingsSchema>;

export const quizMaterialSchema = z.object({
  title: z.string().min(1).max(120),
  url: z.string().min(1).max(500),
  type: z.string().max(16).default("file"),
});
export type QuizMaterial = z.infer<typeof quizMaterialSchema>;

export const quizSiteSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  slogan: z.string(),
  themeColor: z.string(),
  coverUrl: z.string(),
  deskSiteKey: z.string(),
  aiEnabled: z.boolean(),
  materials: z.array(quizMaterialSchema),
  settings: quizSiteSettingsSchema,
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type QuizSite = z.infer<typeof quizSiteSchema>;

export const quizPublicSiteSchema = quizSiteSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});
export type QuizPublicSite = z.infer<typeof quizPublicSiteSchema>;

export const quizBankSchema = z.object({
  id: z.number(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  coverUrl: z.string(),
  status: z.enum(QUIZ_BANK_STATUSES),
  settings: quizSettingsSchema,
  questionTableId: z.number(),
  attemptTableId: z.number(),
  questionCount: z.number(),
  attemptCount: z.number(),
  sort: z.number(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type QuizBank = z.infer<typeof quizBankSchema>;

export const quizPublicBankSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string(),
  coverUrl: z.string(),
  questionCount: z.number(),
  durationSec: z.number(),
  examCount: z.number(),
  settings: quizSettingsSchema,
});
export type QuizPublicBank = z.infer<typeof quizPublicBankSchema>;

export const QUIZ_PARTICIPANT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;
export type QuizParticipantStatus =
  (typeof QUIZ_PARTICIPANT_STATUSES)[number];
export const QUIZ_PARTICIPANT_STATUS_LABELS: Record<
  QuizParticipantStatus,
  string
> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};

export const quizParticipantSchema = z.object({
  rowId: z.number(),
  participantId: z.string(),
  nickname: z.string(),
  company: z.string(),
  department: z.string(),
  status: z.enum(QUIZ_PARTICIPANT_STATUSES),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type QuizParticipant = z.infer<typeof quizParticipantSchema>;

export const quizViewerSchema = quizParticipantSchema.omit({
  rowId: true,
  createdAt: true,
  updatedAt: true,
});
export type QuizViewer = z.infer<typeof quizViewerSchema>;

export const quizRegisterBodySchema = z.object({
  participantId: z.string().regex(QUIZ_PARTICIPANT_PATTERN),
  nickname: z.string().max(60).default(""),
  company: z.string().max(120).default(""),
  department: z.string().max(120).default(""),
});

export const quizReviewParticipantBodySchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).default(""),
});

export const quizBootstrapSchema = z.object({
  site: quizPublicSiteSchema,
  banks: z.array(quizPublicBankSchema),
  viewer: quizViewerSchema.nullable(),
});
export type QuizBootstrap = z.infer<typeof quizBootstrapSchema>;

export const quizStartBodySchema = z.object({
  mode: z.enum(QUIZ_MODES).default("practice"),
  count: z.number().int().min(1).max(200).optional(),
  participantId: z.string().regex(QUIZ_PARTICIPANT_PATTERN).optional(),
});
export const quizStartResultSchema = z.object({
  bank: quizPublicBankSchema,
  mode: z.enum(QUIZ_MODES),
  questions: z.array(quizPublicQuestionSchema),
});
export type QuizStartResult = z.infer<typeof quizStartResultSchema>;

export const quizSubmitAnswerSchema = z.object({
  questionId: z.number().int().positive(),
  answer: z.string().max(QUIZ_ANSWER_MAX).default(""),
});
export type QuizSubmitAnswer = z.infer<typeof quizSubmitAnswerSchema>;

export const quizSubmitBodySchema = z.object({
  participantId: z.string().regex(QUIZ_PARTICIPANT_PATTERN),
  nickname: z.string().max(60).default(""),
  company: z.string().max(120).default(""),
  department: z.string().max(120).default(""),
  mode: z.enum(QUIZ_MODES).default("practice"),
  durationSec: z.number().int().min(0).max(24 * 3600).default(0),
  answers: z.array(quizSubmitAnswerSchema).max(500),
});
export type QuizSubmitBody = z.infer<typeof quizSubmitBodySchema>;

export const quizAnswerResultSchema = z.object({
  questionId: z.number(),
  title: z.string(),
  category: z.string(),
  correct: z.boolean(),
  yourAnswer: z.string(),
  correctAnswer: z.string(),
  analysis: z.string(),
});
export const quizSubmitResultSchema = z.object({
  attemptId: z.number(),
  score: z.number(),
  total: z.number(),
  correct: z.number(),
  wrongCount: z.number(),
  durationSec: z.number(),
  passScore: z.number(),
  passed: z.boolean(),
  /** 题库关闭「答后看解析」时这里为 false，answers 里的解析为空。 */
  showAnalysis: z.boolean(),
  answers: z.array(quizAnswerResultSchema),
  wrongIds: z.array(z.number()),
  rank: z.number().nullable(),
});
export type QuizSubmitResult = z.infer<typeof quizSubmitResultSchema>;

export const quizAttemptSchema = z.object({
  id: z.number(),
  participantId: z.string(),
  nickname: z.string(),
  company: z.string(),
  department: z.string(),
  score: z.number(),
  total: z.number(),
  correct: z.number(),
  durationSec: z.number(),
  mode: z.string(),
  wrongIds: z.array(z.number()),
  submittedAt: z.string(),
});
export type QuizAttempt = z.infer<typeof quizAttemptSchema>;

export const quizRankRowSchema = z.object({
  rank: z.number(),
  participantId: z.string(),
  nickname: z.string(),
  bestScore: z.number(),
  bestDurationSec: z.number(),
  attempts: z.number(),
  lastAt: z.string(),
});
export type QuizRankRow = z.infer<typeof quizRankRowSchema>;

/** 练习模式逐题判分：只回判分与解析，不写交卷记录。 */
export const quizCheckBodySchema = z.object({
  questionId: z.number().int().positive(),
  answer: z.string().max(QUIZ_ANSWER_MAX).default(""),
  participantId: z.string().max(64).default(""),
});
export const quizCheckResultSchema = z.object({
  correct: z.boolean(),
  correctAnswer: z.string(),
  analysis: z.string(),
});
export type QuizCheckResult = z.infer<typeof quizCheckResultSchema>;

export const quizExplainBodySchema = z.object({
  questionId: z.number().int().positive(),
  participantId: z.string().max(64).default(""),
  selected: z.string().max(QUIZ_ANSWER_MAX).default(""),
});
export const quizAttemptAnalysisBodySchema = z.object({
  participantId: z.string().regex(QUIZ_PARTICIPANT_PATTERN),
});
export const quizAiTextSchema = z.object({
  text: z.string(),
  model: z.string(),
});
export type QuizAiText = z.infer<typeof quizAiTextSchema>;

export const quizSaveSiteBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slogan: z.string().trim().max(200).default(""),
  themeColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#1bd0ad"),
  coverUrl: z.string().trim().max(500).default(""),
  /** 绑定已有 AI 客服站点（service-desk siteKey）；空串＝小程序不展示客服入口。 */
  deskSiteKey: z.string().trim().max(64).default(""),
  aiEnabled: z.boolean().default(true),
  materials: z.array(quizMaterialSchema).max(50).default([]),
  settings: quizSiteSettingsSchema.partial().optional(),
});

export const quizCreateBankBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  coverUrl: z.string().trim().max(500).default(""),
  sort: z.number().int().min(0).max(9999).default(0),
  settings: quizSettingsSchema.partial().optional(),
});
export const quizUpdateBankBodySchema = quizCreateBankBodySchema.partial();

export const quizQuestionInputSchema = z.object({
  type: z.enum(QUIZ_QUESTION_TYPES),
  title: z.string().trim().min(1).max(2000),
  imageUrl: z.string().trim().max(500).default(""),
  options: z.array(quizOptionSchema).max(6).default([]),
  answer: z.string().trim().min(1).max(QUIZ_ANSWER_MAX),
  analysis: z.string().trim().max(4000).default(""),
  category: z.string().trim().max(60).default(""),
  sort: z.number().int().min(0).max(999999).default(0),
});
export type QuizQuestionInput = z.infer<typeof quizQuestionInputSchema>;

export const quizAiGenerateBodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  count: z.number().int().min(1).max(20).default(5),
  type: z.enum(QUIZ_QUESTION_TYPES).optional(),
});
export const quizAiGenerateResultSchema = z.object({
  created: z.number(),
  questions: z.array(quizQuestionSchema),
});

export const quizResultsQuerySchema = pageQuerySchema.extend({
  mode: z.enum(QUIZ_MODES).optional(),
  keyword: z.string().max(120).optional(),
});
export const quizRankQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const quizEndpoints = {
  Quiz_site: {
    method: "get" as const,
    path: "/enterprise/quiz/site",
    params: emptyQuery,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(quizSiteSchema),
  },
  Quiz_saveSite: {
    method: "put" as const,
    path: "/enterprise/quiz/site",
    params: emptyQuery,
    query: emptyQuery,
    body: quizSaveSiteBodySchema,
    response: envelope(quizSiteSchema),
  },
  Quiz_banks: {
    method: "get" as const,
    path: "/enterprise/quiz/banks",
    params: emptyQuery,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(quizBankSchema)),
  },
  Quiz_createBank: {
    method: "post" as const,
    path: "/enterprise/quiz/banks",
    params: emptyQuery,
    query: emptyQuery,
    body: quizCreateBankBodySchema,
    response: envelope(quizBankSchema),
  },
  Quiz_updateBank: {
    method: "put" as const,
    path: "/enterprise/quiz/banks/:id",
    params: z.object({ id: z.string().min(1) }),
    query: emptyQuery,
    body: quizUpdateBankBodySchema,
    response: envelope(quizBankSchema),
  },
  Quiz_publishBank: {
    method: "post" as const,
    path: "/enterprise/quiz/banks/:id/publish",
    params: z.object({ id: z.string().min(1) }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(quizBankSchema),
  },
  Quiz_closeBank: {
    method: "post" as const,
    path: "/enterprise/quiz/banks/:id/close",
    params: z.object({ id: z.string().min(1) }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(quizBankSchema),
  },
  Quiz_reopenBank: {
    method: "post" as const,
    path: "/enterprise/quiz/banks/:id/reopen",
    params: z.object({ id: z.string().min(1) }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(quizBankSchema),
  },
  Quiz_removeBank: {
    method: "delete" as const,
    path: "/enterprise/quiz/banks/:id",
    params: z.object({ id: z.string().min(1) }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z.object({ removed: z.boolean(), questionTableId: z.number(), attemptTableId: z.number() }),
    ),
  },
  Quiz_questions: {
    method: "get" as const,
    path: "/enterprise/quiz/banks/:id/questions",
    params: z.object({ id: z.string().min(1) }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.array(quizQuestionSchema)),
  },
  Quiz_createQuestion: {
    method: "post" as const,
    path: "/enterprise/quiz/banks/:id/questions",
    params: z.object({ id: z.string().min(1) }),
    query: emptyQuery,
    body: quizQuestionInputSchema,
    response: envelope(quizQuestionSchema),
  },
  Quiz_updateQuestion: {
    method: "put" as const,
    path: "/enterprise/quiz/banks/:id/questions/:rowId",
    params: z.object({ id: z.string().min(1), rowId: z.string().min(1) }),
    query: emptyQuery,
    body: quizQuestionInputSchema,
    response: envelope(quizQuestionSchema),
  },
  Quiz_removeQuestion: {
    method: "delete" as const,
    path: "/enterprise/quiz/banks/:id/questions/:rowId",
    params: z.object({ id: z.string().min(1), rowId: z.string().min(1) }),
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(z.object({ removed: z.boolean() })),
  },
  Quiz_aiGenerate: {
    method: "post" as const,
    path: "/enterprise/quiz/banks/:id/ai-generate",
    params: z.object({ id: z.string().min(1) }),
    query: emptyQuery,
    body: quizAiGenerateBodySchema,
    response: envelope(quizAiGenerateResultSchema),
  },
  Quiz_results: {
    method: "get" as const,
    path: "/enterprise/quiz/banks/:id/results",
    params: z.object({ id: z.string().min(1) }),
    query: quizResultsQuerySchema,
    body: z.undefined(),
    response: envelope(pageSchema(quizAttemptSchema)),
  },
  Quiz_rank: {
    method: "get" as const,
    path: "/enterprise/quiz/banks/:id/rank",
    params: z.object({ id: z.string().min(1) }),
    query: quizRankQuerySchema,
    body: z.undefined(),
    response: envelope(z.array(quizRankRowSchema)),
  },
  Quiz_participants: {
    method: "get" as const,
    path: "/enterprise/quiz/participants",
    params: emptyQuery,
    query: pageQuerySchema.extend({
      status: z.enum(QUIZ_PARTICIPANT_STATUSES).optional(),
      keyword: z.string().max(120).optional(),
    }),
    body: z.undefined(),
    response: envelope(pageSchema(quizParticipantSchema)),
  },
  Quiz_reviewParticipant: {
    method: "post" as const,
    path: "/enterprise/quiz/participants/:rowId/review",
    params: z.object({ rowId: z.string().min(1) }),
    query: emptyQuery,
    body: quizReviewParticipantBodySchema,
    response: envelope(quizParticipantSchema),
  },
  Quiz_package: {
    method: "get" as const,
    path: "/enterprise/quiz/package",
    params: emptyQuery,
    query: emptyQuery,
    body: z.undefined(),
    response: envelope(
      z.object({
        url: z.string(),
        fileName: z.string(),
        fileSize: z.number(),
        sha256: z.string(),
      }),
    ),
  },
};