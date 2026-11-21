import { createHash, randomBytes } from 'node:crypto';
import {
  z,
  type QuizAttempt,
  type QuizBank,
  type QuizParticipant,
  type QuizParticipantStatus,
  type QuizQuestion,
  type QuizQuestionInput,
  type QuizRankRow,
  type QuizSettings,
  type QuizSite,
  type QuizSiteSettings,
  type QuizSubmitResult,
  type QuizViewer,
  quizCheckBodySchema,
  quizCreateBankBodySchema,
  quizMaterialSchema,
  quizQuestionInputSchema,
  quizRegisterBodySchema,
  quizReviewParticipantBodySchema,
  quizSettingsSchema,
  quizSiteSettingsSchema,
  quizSubmitBodySchema,
  quizUpdateBankBodySchema,
} from '@enterprise/contracts';
import { Prisma } from '../../generated/prisma';
import { aiChat, parseJsonObject } from '../ai/ai-gateway';
import { CurrentUser } from '../auth/current-user';
import { pageOf, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import { DataTableService } from '../data-table/data-table.service';
import type { ChatMessage } from '../geo/geo-llm.client';
import { IdentityService } from '../identity/identity.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertPackageSize,
  buildStoreZip,
  collectTemplate,
  templateDirFrom,
} from '../private-mini/package-builder';
import type { StorageService } from '../storage/storage.service';

type SiteRow = Prisma.QuizSiteGetPayload<object>;
type BankRow = Prisma.QuizBankGetPayload<object>;
type Row = { id: number; data: Prisma.JsonValue; createdAt: Date };
type CreateBankInput = z.infer<typeof quizCreateBankBodySchema>;
type UpdateBankInput = z.infer<typeof quizUpdateBankBodySchema>;

const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
const ROW_SCAN_LIMIT = 5000;
const QUESTION_COUNT_MAX = 5000;

const TYPE_LABEL: Record<string, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
};
const TYPE_BY_LABEL: Record<string, QuizQuestion['type']> = {
  单选: 'single',
  多选: 'multiple',
  判断: 'judge',
  single: 'single',
  multiple: 'multiple',
  judge: 'judge',
};

const QUESTION_FIELDS = [
  {
    name: '题型',
    fieldKey: 'q_type',
    fieldType: 'select',
    choices: ['单选', '多选', '判断'],
    required: true,
  },
  { name: '题干', fieldKey: 'title', fieldType: 'text', required: true },
  { name: '题图', fieldKey: 'image_url', fieldType: 'url' },
  { name: '选项A', fieldKey: 'option_a', fieldType: 'text' },
  { name: '选项B', fieldKey: 'option_b', fieldType: 'text' },
  { name: '选项C', fieldKey: 'option_c', fieldType: 'text' },
  { name: '选项D', fieldKey: 'option_d', fieldType: 'text' },
  { name: '选项E', fieldKey: 'option_e', fieldType: 'text' },
  { name: '选项F', fieldKey: 'option_f', fieldType: 'text' },
  { name: '正确答案', fieldKey: 'answer', fieldType: 'text', required: true },
  { name: '解析', fieldKey: 'analysis', fieldType: 'text' },
  { name: '分类', fieldKey: 'category', fieldType: 'text' },
  { name: '排序', fieldKey: 'sort_order', fieldType: 'number' },
];

const PARTICIPANT_FIELDS = [
  {
    name: '参赛者标识',
    fieldKey: 'participant_id',
    fieldType: 'text',
    required: true,
  },
  { name: '昵称', fieldKey: 'nickname', fieldType: 'text' },
  { name: '单位', fieldKey: 'company', fieldType: 'text' },
  { name: '部门', fieldKey: 'department', fieldType: 'text' },
  {
    name: '审核状态',
    fieldKey: 'status',
    fieldType: 'select',
    choices: ['待审核', '已通过', '已驳回'],
  },
  { name: '审核备注', fieldKey: 'note', fieldType: 'text' },
  { name: '提交时间', fieldKey: 'created_at', fieldType: 'date' },
  { name: '更新时间', fieldKey: 'updated_at', fieldType: 'date' },
];

const PARTICIPANT_STATUS_LABEL: Record<QuizParticipantStatus, string> = {
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
};
const PARTICIPANT_STATUS_BY_LABEL: Record<string, QuizParticipantStatus> = {
  待审核: 'PENDING',
  已通过: 'APPROVED',
  已驳回: 'REJECTED',
};

const ATTEMPT_FIELDS = [
  {
    name: '参赛者标识',
    fieldKey: 'participant_id',
    fieldType: 'text',
    required: true,
  },
  { name: '昵称', fieldKey: 'nickname', fieldType: 'text' },
  { name: '单位', fieldKey: 'company', fieldType: 'text' },
  { name: '部门', fieldKey: 'department', fieldType: 'text' },
  { name: '得分', fieldKey: 'score', fieldType: 'number' },
  { name: '总题数', fieldKey: 'total', fieldType: 'number' },
  { name: '答对数', fieldKey: 'correct', fieldType: 'number' },
  { name: '用时秒', fieldKey: 'duration_sec', fieldType: 'number' },
  {
    name: '模式',
    fieldKey: 'mode',
    fieldType: 'select',
    choices: ['练习', '考试'],
  },
  { name: '错题编号', fieldKey: 'wrong_ids', fieldType: 'text' },
  { name: '答题明细', fieldKey: 'detail', fieldType: 'json' },
  { name: '交卷时间', fieldKey: 'submitted_at', fieldType: 'date' },
];

function newCode() {
  const bytes = randomBytes(12);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

const iso = (value: Date | null) => (value ? value.toISOString() : null);
const clip = (value: unknown, max: number) => text(value).slice(0, max);

function objectOf(
  value: Prisma.JsonValue | undefined | null,
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function parseSettings(value: Prisma.JsonValue): QuizSettings {
  const base = quizSettingsSchema.parse({});
  return quizSettingsSchema.parse({ ...base, ...objectOf(value) });
}

function parseSiteSettings(value: Prisma.JsonValue): QuizSiteSettings {
  const base = quizSiteSettingsSchema.parse({});
  return quizSiteSettingsSchema.parse({ ...base, ...objectOf(value) });
}

function parseMaterials(value: Prisma.JsonValue) {
  const parsed = z.array(quizMaterialSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  }
  return text(value)
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function normalizeAnswer(value: unknown) {
  return Array.from(
    new Set(
      clip(value, 16)
        .toUpperCase()
        .replace(/[^A-F]/g, '')
        .split(''),
    ),
  )
    .sort()
    .join('');
}

function optionList(type: QuizQuestion['type'], data: Record<string, unknown>) {
  if (type === 'judge') {
    return [
      { key: 'A', label: '正确', imageUrl: '' },
      { key: 'B', label: '错误', imageUrl: '' },
    ];
  }
  const options: { key: string; label: string; imageUrl: string }[] = [];
  'ABCDEF'.split('').forEach((key) => {
    const label = text(data[`option_${key.toLowerCase()}`]).trim();
    if (label) options.push({ key, label, imageUrl: '' });
  });
  return options;
}

function questionOf(row: Row): QuizQuestion {
  const data = objectOf(row.data);
  const type = TYPE_BY_LABEL[text(data.q_type)] || 'single';
  return {
    id: row.id,
    type,
    title: text(data.title),
    imageUrl: text(data.image_url),
    options: optionList(type, data),
    answer: normalizeAnswer(data.answer),
    analysis: text(data.analysis),
    category: text(data.category),
    sort: Number(data.sort_order) || 0,
  };
}

function participantOf(row: Row): QuizParticipant {
  const data = objectOf(row.data);
  const status = PARTICIPANT_STATUS_BY_LABEL[text(data.status)] || 'PENDING';
  return {
    rowId: row.id,
    participantId: text(data.participant_id),
    nickname: text(data.nickname),
    company: text(data.company),
    department: text(data.department),
    status,
    note: text(data.note),
    createdAt: text(data.created_at) || row.createdAt.toISOString(),
    updatedAt: text(data.updated_at) || row.createdAt.toISOString(),
  };
}

function questionRowData(input: QuizQuestionInput) {
  const type = input.type;
  const options =
    type === 'judge'
      ? [
          { key: 'A', label: '正确' },
          { key: 'B', label: '错误' },
        ]
      : input.options.map((item) => ({
          key: item.key.trim().toUpperCase(),
          label: item.label.trim(),
        }));
  if (!options.length) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '请至少填写一个选项');
  }
  const keys = options.map((item) => item.key);
  if (new Set(keys).size !== keys.length) {
    throw new BusinessException(ErrorCode.BAD_REQUEST, '选项编号不能重复');
  }
  const answer = normalizeAnswer(input.answer);
  if (!answer) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '请填写正确答案（A/B/C…）',
    );
  }
  if (answer.split('').some((key) => !keys.includes(key))) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      `正确答案只能从 ${keys.join(' / ')} 中选`,
    );
  }
  if (type !== 'multiple' && answer.length !== 1) {
    throw new BusinessException(
      ErrorCode.BAD_REQUEST,
      '单选/判断题只能有一个答案',
    );
  }
  const data: Record<string, unknown> = {
    q_type: TYPE_LABEL[type],
    title: input.title,
    image_url: input.imageUrl,
    answer,
    analysis: input.analysis,
    category: input.category,
    sort_order: input.sort,
  };
  'ABCDEF'.split('').forEach((key) => {
    data[`option_${key.toLowerCase()}`] =
      options.find((item) => item.key === key)?.label || '';
  });
  return data;
}

function isCorrect(
  type: QuizQuestion['type'],
  yourAnswer: string,
  correctAnswer: string,
) {
  const mine = normalizeAnswer(yourAnswer);
  const expected = normalizeAnswer(correctAnswer);
  if (!mine) return false;
  if (type === 'multiple') return mine === expected;
  return mine.length === 1 && mine === expected;
}

function shuffle<T>(list: T[]): T[] {
  const next = list.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(Math.random() * (index + 1));
    [next[index], next[pick]] = [next[pick], next[index]];
  }
  return next;
}

/**
 * 答题小程序：站点 → 题库 → 题目/交卷记录（多维表格）。
 *
 * 题库与记录都不另建一套业务表：题目一行一题写进 `data_tables`，交卷一行一次写进另一张
 * `data_tables`，后台可直接筛选、导出、接飞书同步。AI 出题/解析/复盘全部走统一模型网关，
 * AI 客服只绑定已有 service-desk 站点，不在答题域另建客服实体。
 */
export class QuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataTables: DataTableService,
    private readonly identity: IdentityService,
    private readonly storage: StorageService,
  ) {}

  // ---------- 站点 ----------

  private viewSite(row: SiteRow): QuizSite {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      slogan: row.slogan,
      themeColor: row.themeColor,
      coverUrl: row.coverUrl,
      deskSiteKey: row.deskSiteKey,
      aiEnabled: row.aiEnabled,
      materials: parseMaterials(row.materials),
      settings: parseSiteSettings(row.settings),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async siteRowOf(user: CurrentUser) {
    return this.prisma.quizSite.findUnique({
      where: { ownerUserId: user.userId },
    });
  }

  private async ensureSite(user: CurrentUser) {
    const exists = await this.siteRowOf(user);
    if (exists) return exists;
    try {
      return await this.prisma.quizSite.create({
        data: {
          ownerUserId: user.userId,
          code: newCode(),
          name: `${user.username || '我的'}答题`,
          settings: quizSiteSettingsSchema.parse({}),
          materials: [],
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const again = await this.siteRowOf(user);
        if (again) return again;
      }
      throw error;
    }
  }

  async downloadPackage(user: CurrentUser) {
    const dir = templateDirFrom('MINIPROGRAM_QUIZ_DIR', 'quiz-miniprogram');
    const entries: Awaited<ReturnType<typeof collectTemplate>> =
      await collectTemplate(dir).catch(
        () => [] as Awaited<ReturnType<typeof collectTemplate>>,
      );
    if (!entries.some((entry) => entry.name === 'app.json')) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `答题小程序模板暂不可用（模板目录 ${dir}），请确认仓库内 quiz-miniprogram/ 完整`,
      );
    }
    const bytes = buildStoreZip(entries);
    assertPackageSize(bytes.length, entries.length);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const fileName = `quiz-miniprogram-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}.zip`;
    const stored = await this.storage.put(
      `enterprise/${user.userId}/mini-source/quiz/${sha256.slice(0, 16)}.zip`,
      bytes,
    );
    return {
      url: this.storage.urlOf(stored.key),
      fileName,
      fileSize: bytes.length,
      sha256,
    };
  }

  async site(user: CurrentUser) {
    const row = await this.siteRowOf(user);
    return row ? this.viewSite(row) : null;
  }

  async saveSite(user: CurrentUser, body: Record<string, unknown>) {
    const current = await this.ensureSite(user);
    const input = z
      .object({
        name: z.string().trim().min(1).max(120),
        slogan: z.string().trim().max(200).default(''),
        themeColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default('#1bd0ad'),
        coverUrl: z.string().trim().max(500).default(''),
        deskSiteKey: z.string().trim().max(64).default(''),
        aiEnabled: z.boolean().default(true),
        materials: z.array(quizMaterialSchema).max(50).default([]),
        settings: quizSiteSettingsSchema.partial().optional(),
      })
      .parse(body);
    const settings = parseSiteSettings(current.settings);
    const row = await this.prisma.quizSite.update({
      where: { id: current.id },
      data: {
        name: input.name,
        slogan: input.slogan,
        themeColor: input.themeColor,
        coverUrl: input.coverUrl,
        deskSiteKey: input.deskSiteKey,
        aiEnabled: input.aiEnabled,
        materials: input.materials,
        settings: quizSiteSettingsSchema.parse({
          ...settings,
          ...(input.settings || {}),
        }),
      },
    });
    await this.identity.audit(user.userId, '答题站点设置', input.name);
    return this.viewSite(row);
  }

  // ---------- 参赛者审核（多维表格） ----------

  /** 首次需要审核时按需建参赛者表；并发建表用「仅当仍为 0 才占用」收口。 */
  private async ensureParticipantTable(user: CurrentUser, site: SiteRow) {
    if (site.participantTableId > 0) return site.participantTableId;
    const table = await this.dataTables.create(user, {
      name: `参赛者·${site.name}`.slice(0, 200),
      description:
        '答题小程序参赛者资料与审核状态：一行一人，审核通过后才能答题。',
    });
    const tableId = Number(table.id);
    try {
      await this.dataTables.addFields(user, tableId, PARTICIPANT_FIELDS);
    } catch (error) {
      await this.dataTables.remove(user, tableId).catch(() => undefined);
      throw error;
    }
    const updated = await this.prisma.quizSite.updateMany({
      where: { id: site.id, participantTableId: 0 },
      data: { participantTableId: tableId },
    });
    if (updated.count > 0) return tableId;
    await this.dataTables.remove(user, tableId).catch(() => undefined);
    const again = await this.prisma.quizSite.findUnique({
      where: { id: site.id },
    });
    return again?.participantTableId || 0;
  }

  private async participantRows(tableId: number) {
    const rows = await this.prisma.dataTableRow.findMany({
      where: { tableId },
      orderBy: { id: 'desc' },
      take: ROW_SCAN_LIMIT,
      select: { id: true, data: true, createdAt: true },
    });
    return rows.map(participantOf);
  }

  private async findParticipant(tableId: number, participantId: string) {
    if (!tableId || !participantId) return null;
    const rows = await this.participantRows(tableId);
    return rows.find((item) => item.participantId === participantId) || null;
  }

  private viewerOf(row: QuizParticipant): QuizViewer {
    return {
      participantId: row.participantId,
      nickname: row.nickname,
      company: row.company,
      department: row.department,
      status: row.status,
      note: row.note,
    };
  }

  private async upsertParticipant(
    user: CurrentUser,
    site: SiteRow,
    input: z.infer<typeof quizRegisterBodySchema>,
  ) {
    const tableId = await this.ensureParticipantTable(user, site);
    if (!tableId) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '参赛者表创建失败，请稍后重试',
      );
    }
    const settings = parseSiteSettings(site.settings);
    const existing = await this.findParticipant(tableId, input.participantId);
    // 审核通过后资料锁定，避免改资料绕过审核（与参考包「一经审核通过不可修改」一致）。
    if (existing && existing.status === 'APPROVED' && settings.checkUser) {
      return existing;
    }
    const status = settings.checkUser ? '待审核' : '已通过';
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      participant_id: input.participantId,
      nickname: input.nickname,
      company: input.company,
      department: input.department,
      status,
      note: existing?.note || '',
      created_at: existing?.createdAt || now,
      updated_at: now,
    };
    if (existing) {
      const updated = await this.dataTables.updateRow(
        user,
        tableId,
        existing.rowId,
        payload,
      );
      return participantOf({
        id: updated.id,
        data: updated.data as Prisma.JsonValue,
        createdAt: new Date(existing.createdAt),
      });
    }
    const created = await this.dataTables.appendSystemRow(
      tableId,
      payload,
      `quiz:${site.code}`,
    );
    return participantOf({
      id: created.id,
      data: created.data as Prisma.JsonValue,
      createdAt: new Date(),
    });
  }

  async publicRegister(siteCode: string, body: Record<string, unknown>) {
    const site = await this.prisma.quizSite.findUnique({
      where: { code: siteCode },
    });
    if (!site || site.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '答题站点不存在或已停用',
      );
    }
    const input = quizRegisterBodySchema.parse(body);
    const settings = parseSiteSettings(site.settings);
    if (settings.checkUser && !input.nickname.trim()) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '请先填写昵称');
    }
    const owner = new CurrentUser(site.ownerUserId, 'quiz-owner', 'user');
    const participant = await this.upsertParticipant(owner, site, input);
    return this.viewerOf(participant);
  }

  private async publicViewer(site: SiteRow, participantId: string) {
    if (!participantId || !site.participantTableId) return null;
    const row = await this.findParticipant(
      site.participantTableId,
      participantId,
    );
    return row ? this.viewerOf(row) : null;
  }

  private async assertApproved(site: SiteRow, participantId: string) {
    const settings = parseSiteSettings(site.settings);
    if (!settings.checkUser) return;
    const viewer = await this.publicViewer(site, participantId);
    if (!viewer) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '请先提交参赛资料');
    }
    if (viewer.status === 'REJECTED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        viewer.note
          ? `参赛资料已被驳回：${viewer.note}`
          : '参赛资料已被驳回，请修改后重新提交',
      );
    }
    if (viewer.status !== 'APPROVED') {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '参赛资料待审核，通过后才能答题',
      );
    }
  }

  async participants(user: CurrentUser, query: Record<string, unknown>) {
    const site = await this.siteRowOf(user);
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(
      Math.max(Math.floor(Number(query.pageSize) || 20), 1),
      200,
    );
    if (!site || !site.participantTableId) {
      return pageOf<QuizParticipant>([], 0, page, pageSize);
    }
    const status = text(query.status);
    const keyword = text(query.keyword).trim().toLowerCase();
    const rows = await this.participantRows(site.participantTableId);
    const filtered = rows.filter((item) => {
      if (status && item.status !== status) return false;
      if (!keyword) return true;
      return [item.nickname, item.company, item.department, item.participantId]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
    return pageOf(
      filtered.slice((page - 1) * pageSize, page * pageSize),
      filtered.length,
      page,
      pageSize,
    );
  }

  async reviewParticipant(
    user: CurrentUser,
    rowId: number,
    body: Record<string, unknown>,
  ) {
    const site = await this.siteRowOf(user);
    if (!site || !site.participantTableId) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '还没有参赛者');
    }
    const row = await this.prisma.dataTableRow.findFirst({
      where: { id: rowId, tableId: site.participantTableId },
      select: { id: true, data: true, createdAt: true },
    });
    if (!row) {
      throw new BusinessException(ErrorCode.NOT_FOUND, '该参赛者不存在');
    }
    const input = quizReviewParticipantBodySchema.parse(body);
    const payload = {
      ...objectOf(row.data),
      status: PARTICIPANT_STATUS_LABEL[input.status],
      note: input.note,
      updated_at: new Date().toISOString(),
    };
    const owner = new CurrentUser(site.ownerUserId, 'quiz-owner', 'user');
    const updated = await this.dataTables.updateRow(
      owner,
      site.participantTableId,
      row.id,
      payload,
    );
    await this.identity.audit(
      user.userId,
      '答题参赛者审核',
      `#${row.id} ${PARTICIPANT_STATUS_LABEL[input.status]}`,
    );
    return participantOf({
      id: updated.id,
      data: updated.data as Prisma.JsonValue,
      createdAt: row.createdAt,
    });
  }

  // ---------- 题库 ----------

  private async bankRow(user: CurrentUser, id: number) {
    const site = await this.siteRowOf(user);
    if (!site)
      throw new BusinessException(ErrorCode.NOT_FOUND, '答题站点还不存在');
    const row = await this.prisma.quizBank.findFirst({
      where: { id, siteId: site.id },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '该题库不存在');
    return row;
  }

  private async bankView(
    row: BankRow,
    questionCount?: number,
  ): Promise<QuizBank> {
    const count =
      questionCount ??
      (await this.prisma.dataTableRow.count({
        where: { tableId: row.questionTableId },
      }));
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      coverUrl: row.coverUrl,
      status: row.status as QuizBank['status'],
      settings: parseSettings(row.settings),
      questionTableId: row.questionTableId,
      attemptTableId: row.attemptTableId,
      questionCount: count,
      attemptCount: row.attemptCount,
      sort: row.sort,
      publishedAt: iso(row.publishedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async banks(user: CurrentUser) {
    const site = await this.siteRowOf(user);
    if (!site) return [];
    const rows = await this.prisma.quizBank.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const counts = rows.length
      ? await this.prisma.dataTableRow.groupBy({
          by: ['tableId'],
          where: { tableId: { in: rows.map((row) => row.questionTableId) } },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(
      counts.map((item) => [item.tableId, item._count._all]),
    );
    return Promise.all(
      rows.map((row) =>
        this.bankView(row, countMap.get(row.questionTableId) || 0),
      ),
    );
  }

  async createBank(user: CurrentUser, body: Record<string, unknown>) {
    const input: CreateBankInput = quizCreateBankBodySchema.parse(body);
    const site = await this.ensureSite(user);
    const questionTable = await this.dataTables.create(user, {
      name: `答题题库·${input.title}`.slice(0, 200),
      description: `答题小程序「${site.name}」题库：一行一题，可直接筛选、导出、接飞书同步。`,
    });
    const attemptTable = await this.dataTables.create(user, {
      name: `答题记录·${input.title}`.slice(0, 200),
      description: `答题小程序「${site.name}」交卷记录：一行一次，含得分、用时与错题编号。`,
    });
    const questionTableId = Number(questionTable.id);
    const attemptTableId = Number(attemptTable.id);
    try {
      await this.dataTables.addFields(user, questionTableId, QUESTION_FIELDS);
      await this.dataTables.addFields(user, attemptTableId, ATTEMPT_FIELDS);
      const settings = quizSettingsSchema.parse(input.settings || {});
      const row = await this.prisma.quizBank.create({
        data: {
          siteId: site.id,
          code: newCode(),
          title: input.title,
          description: input.description,
          coverUrl: input.coverUrl,
          settings: settings,
          sort: input.sort,
          questionTableId,
          attemptTableId,
        },
      });
      await this.identity.audit(
        user.userId,
        '答题建题库',
        `#${row.id} ${row.title}`,
      );
      return this.bankView(row, 0);
    } catch (error) {
      await this.dataTables
        .remove(user, questionTableId)
        .catch(() => undefined);
      await this.dataTables.remove(user, attemptTableId).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '同名题库已存在，请换一个名称',
        );
      }
      throw error;
    }
  }

  async updateBank(
    user: CurrentUser,
    id: number,
    body: Record<string, unknown>,
  ) {
    const current = await this.bankRow(user, id);
    const input: UpdateBankInput = quizUpdateBankBodySchema.parse(body);
    const settings = input.settings
      ? quizSettingsSchema.parse({
          ...parseSettings(current.settings),
          ...input.settings,
        })
      : parseSettings(current.settings);
    let row: BankRow;
    try {
      row = await this.prisma.quizBank.update({
        where: { id: current.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
          ...(input.sort !== undefined ? { sort: input.sort } : {}),
          settings: settings,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BusinessException(
          ErrorCode.CONFLICT,
          '同名题库已存在，请换一个名称',
        );
      }
      throw error;
    }
    await this.identity.audit(
      user.userId,
      '答题改题库',
      `#${row.id} ${row.title}`,
    );
    return this.bankView(row);
  }

  async publishBank(user: CurrentUser, id: number) {
    const current = await this.bankRow(user, id);
    const questionCount = await this.prisma.dataTableRow.count({
      where: { tableId: current.questionTableId },
    });
    if (!questionCount) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '题库还没有题目，先录入或让 AI 生成',
      );
    }
    const row = await this.prisma.quizBank.update({
      where: { id: current.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: current.publishedAt || new Date(),
      },
    });
    return this.bankView(row, questionCount);
  }

  async closeBank(user: CurrentUser, id: number) {
    const current = await this.bankRow(user, id);
    const row = await this.prisma.quizBank.update({
      where: { id: current.id },
      data: { status: 'CLOSED' },
    });
    return this.bankView(row);
  }

  async reopenBank(user: CurrentUser, id: number) {
    const current = await this.bankRow(user, id);
    const row = await this.prisma.quizBank.update({
      where: { id: current.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: current.publishedAt || new Date(),
      },
    });
    return this.bankView(row);
  }

  async removeBank(user: CurrentUser, id: number) {
    const current = await this.bankRow(user, id);
    await this.dataTables
      .remove(user, current.questionTableId)
      .catch(() => undefined);
    await this.dataTables
      .remove(user, current.attemptTableId)
      .catch(() => undefined);
    await this.prisma.quizBank.delete({ where: { id: current.id } });
    await this.identity.audit(
      user.userId,
      '答题删题库',
      `#${current.id} ${current.title}`,
    );
    return {
      removed: true,
      questionTableId: current.questionTableId,
      attemptTableId: current.attemptTableId,
    };
  }

  private async questionRows(tableId: number): Promise<Row[]> {
    return this.prisma.dataTableRow.findMany({
      where: { tableId },
      orderBy: { id: 'asc' },
      take: QUESTION_COUNT_MAX,
      select: { id: true, data: true, createdAt: true },
    });
  }

  async questions(user: CurrentUser, id: number) {
    const bank = await this.bankRow(user, id);
    const rows = await this.questionRows(bank.questionTableId);
    return rows.map(questionOf).sort((a, b) => a.sort - b.sort || a.id - b.id);
  }

  async createQuestion(
    user: CurrentUser,
    id: number,
    body: Record<string, unknown>,
  ) {
    const bank = await this.bankRow(user, id);
    const input = quizQuestionInputSchema.parse(body);
    const created = await this.dataTables.createRow(
      user,
      bank.questionTableId,
      questionRowData(input),
    );
    return questionOf({
      id: created.id,
      data: created.data as Prisma.JsonValue,
      createdAt: new Date(),
    });
  }

  async updateQuestion(
    user: CurrentUser,
    id: number,
    rowId: number,
    body: Record<string, unknown>,
  ) {
    const bank = await this.bankRow(user, id);
    const input = quizQuestionInputSchema.parse(body);
    const updated = await this.dataTables.updateRow(
      user,
      bank.questionTableId,
      rowId,
      questionRowData(input),
    );
    return questionOf({
      id: updated.id,
      data: updated.data as Prisma.JsonValue,
      createdAt: new Date(),
    });
  }

  async removeQuestion(user: CurrentUser, id: number, rowId: number) {
    const bank = await this.bankRow(user, id);
    await this.dataTables.deleteRow(user, bank.questionTableId, rowId);
    return { removed: true };
  }

  async aiGenerate(
    user: CurrentUser,
    id: number,
    body: Record<string, unknown>,
  ) {
    const bank = await this.bankRow(user, id);
    const input = z
      .object({
        prompt: z.string().trim().min(1).max(4000),
        count: z.number().int().min(1).max(20).default(5),
        type: z.enum(['single', 'multiple', 'judge']).optional(),
      })
      .parse(body);
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是题库编辑。只输出一个 JSON 对象：{"questions":[{"type":"single|multiple|judge","title":"题干","options":["选项1","选项2"],"answer":"A","analysis":"解析","category":"分类"}]}。判断题 options 固定为 ["正确","错误"]，answer 为 A 或 B；多选题 answer 用连续字母（如 "AB"）。不要输出 JSON 以外的任何文字。',
      },
      {
        role: 'user',
        content: [
          `请根据下面的资料出 ${input.count} 道题。`,
          input.type ? `题型限定：${TYPE_LABEL[input.type]}。` : '',
          '资料：',
          input.prompt,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];
    const result = await aiChat(this.prisma, {
      userId: user.userId,
      messages,
      maxTokens: 2000,
      timeoutMs: 90_000,
      module: 'quiz',
      operation: 'quiz_generate',
      charge: { code: 'ai_service', refId: bank.code },
    });
    const parsed = parseJsonObject(result.reply);
    const list =
      parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
    const inputs: QuizQuestionInput[] = [];
    for (const item of list) {
      const normalized = this.normalizeAiQuestion(item);
      if (normalized) inputs.push(normalized);
      if (inputs.length >= input.count) break;
    }
    if (!inputs.length) {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'AI 没有返回可用题目，请补充资料或稍后重试',
      );
    }
    const created = await this.dataTables.createRows(
      user,
      bank.questionTableId,
      inputs.map(questionRowData),
    );
    const questions = created.map((row) =>
      questionOf({
        id: row.id,
        data: row.data as Prisma.JsonValue,
        createdAt: new Date(),
      }),
    );
    await this.identity.audit(
      user.userId,
      '答题AI出题',
      `#${bank.id} ${bank.title} · ${questions.length} 题`,
    );
    return { created: questions.length, questions };
  }

  private normalizeAiQuestion(value: unknown): QuizQuestionInput | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const body = value as Record<string, unknown>;
    const rawType = text(body.type).trim().toLowerCase();
    const type =
      TYPE_BY_LABEL[rawType] ||
      TYPE_BY_LABEL[text(body.type).trim()] ||
      'single';
    const rawOptions = Array.isArray(body.options) ? body.options : [];
    const options = rawOptions
      .slice(0, 6)
      .map((item, index) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const row = item as Record<string, unknown>;
          return {
            key:
              text(row.key).trim().toUpperCase() ||
              String.fromCharCode(65 + index),
            label: text(row.label || row.text).trim(),
            imageUrl: '',
          };
        }
        return {
          key: String.fromCharCode(65 + index),
          label: text(item)
            .replace(/^[A-Fa-f][.、:：]\s*/, '')
            .trim(),
          imageUrl: '',
        };
      })
      .filter((item) => item.label);
    let answer = text(body.answer).trim().toUpperCase();
    if (type === 'judge') {
      if (answer === '正确' || answer === 'TRUE' || answer === '对')
        answer = 'A';
      if (answer === '错误' || answer === 'FALSE' || answer === '错')
        answer = 'B';
    }
    const parsed = quizQuestionInputSchema.safeParse({
      type,
      title: text(body.title).trim(),
      imageUrl: '',
      options,
      answer,
      analysis: text(body.analysis).trim(),
      category: text(body.category).trim(),
      sort: 0,
    });
    return parsed.success ? parsed.data : null;
  }

  // ---------- 记录与排行 ----------

  private async attemptRows(bank: BankRow): Promise<QuizAttempt[]> {
    const rows = await this.prisma.dataTableRow.findMany({
      where: { tableId: bank.attemptTableId },
      orderBy: { id: 'desc' },
      take: ROW_SCAN_LIMIT,
      select: { id: true, data: true, createdAt: true },
    });
    return rows.map((row) => this.attemptOf(row));
  }

  private attemptOf(row: Row): QuizAttempt {
    const data = objectOf(row.data);
    return {
      id: row.id,
      participantId: text(data.participant_id),
      nickname: text(data.nickname),
      company: text(data.company),
      department: text(data.department),
      score: Number(data.score) || 0,
      total: Number(data.total) || 0,
      correct: Number(data.correct) || 0,
      durationSec: Number(data.duration_sec) || 0,
      mode: text(data.mode) || '考试',
      wrongIds: parseIds(data.wrong_ids),
      submittedAt: text(data.submitted_at) || row.createdAt.toISOString(),
    };
  }

  private rankOf(attempts: QuizAttempt[], limit: number): QuizRankRow[] {
    const best = new Map<
      string,
      {
        participantId: string;
        nickname: string;
        bestScore: number;
        bestDurationSec: number;
        attempts: number;
        lastAt: string;
      }
    >();
    for (const item of attempts) {
      if (!item.participantId) continue;
      // 排行榜只统计考试；练习用于错题与记录，不参与排名。
      if (item.mode !== '考试') continue;
      const current = best.get(item.participantId);
      if (!current) {
        best.set(item.participantId, {
          participantId: item.participantId,
          nickname: item.nickname || '匿名选手',
          bestScore: item.score,
          bestDurationSec: item.durationSec,
          attempts: 1,
          lastAt: item.submittedAt,
        });
        continue;
      }
      current.attempts += 1;
      if (item.nickname && current.nickname === '匿名选手') {
        current.nickname = item.nickname;
      }
      if (item.submittedAt > current.lastAt) current.lastAt = item.submittedAt;
      if (
        item.score > current.bestScore ||
        (item.score === current.bestScore &&
          item.durationSec < current.bestDurationSec)
      ) {
        current.bestScore = item.score;
        current.bestDurationSec = item.durationSec;
      }
    }
    return [...best.values()]
      .sort(
        (a, b) =>
          b.bestScore - a.bestScore ||
          a.bestDurationSec - b.bestDurationSec ||
          a.lastAt.localeCompare(b.lastAt),
      )
      .slice(0, limit)
      .map((item, index) => ({ rank: index + 1, ...item }));
  }

  async results(user: CurrentUser, id: number, query: Record<string, unknown>) {
    const bank = await this.bankRow(user, id);
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(
      Math.max(Math.floor(Number(query.pageSize) || 20), 1),
      200,
    );
    const mode = text(query.mode);
    const keyword = text(query.keyword).trim().toLowerCase();
    const all = await this.attemptRows(bank);
    const filtered = all.filter((item) => {
      if (mode === 'practice' && item.mode !== '练习') return false;
      if (mode === 'exam' && item.mode !== '考试') return false;
      if (!keyword) return true;
      return [item.nickname, item.company, item.department, item.participantId]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
    return pageOf(
      filtered.slice((page - 1) * pageSize, page * pageSize),
      filtered.length,
      page,
      pageSize,
    );
  }

  async rank(user: CurrentUser, id: number, query: Record<string, unknown>) {
    const bank = await this.bankRow(user, id);
    const limit = Math.min(
      Math.max(Math.floor(Number(query.limit) || 20), 1),
      100,
    );
    return this.rankOf(await this.attemptRows(bank), limit);
  }

  // ---------- 公开通道 ----------

  private async publicBank(bankCode: string) {
    const bank = await this.prisma.quizBank.findUnique({
      where: { code: bankCode },
    });
    if (!bank) throw new BusinessException(ErrorCode.NOT_FOUND, '题库不存在');
    const site = await this.prisma.quizSite.findUnique({
      where: { id: bank.siteId },
    });
    if (!site || site.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.SERVICE_UNAVAILABLE,
        '答题站点已停用',
      );
    }
    if (bank.status !== 'PUBLISHED') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        bank.status === 'CLOSED' ? '题库已关闭' : '题库尚未发布',
      );
    }
    return { bank, site };
  }

  private publicBankView(bank: BankRow, questionCount: number) {
    const settings = parseSettings(bank.settings);
    return {
      code: bank.code,
      title: bank.title,
      description: bank.description,
      coverUrl: bank.coverUrl,
      questionCount,
      durationSec: settings.durationSec,
      examCount: settings.examCount,
      settings,
    };
  }

  async publicBootstrap(siteCode: string, participantId = '') {
    const site = await this.prisma.quizSite.findUnique({
      where: { code: siteCode },
    });
    if (!site || site.status !== 'ACTIVE') {
      throw new BusinessException(
        ErrorCode.NOT_FOUND,
        '答题站点不存在或已停用',
      );
    }
    const banks = await this.prisma.quizBank.findMany({
      where: { siteId: site.id, status: 'PUBLISHED' },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    const counts = banks.length
      ? await this.prisma.dataTableRow.groupBy({
          by: ['tableId'],
          where: { tableId: { in: banks.map((row) => row.questionTableId) } },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(
      counts.map((item) => [item.tableId, item._count._all]),
    );
    const view = this.viewSite(site);
    return {
      site: {
        code: view.code,
        name: view.name,
        slogan: view.slogan,
        themeColor: view.themeColor,
        coverUrl: view.coverUrl,
        deskSiteKey: view.deskSiteKey,
        aiEnabled: view.aiEnabled,
        materials: view.materials,
        settings: view.settings,
      },
      banks: banks.map((bank) =>
        this.publicBankView(bank, countMap.get(bank.questionTableId) || 0),
      ),
      viewer: await this.publicViewer(site, participantId),
    };
  }

  async publicStart(bankCode: string, body: Record<string, unknown>) {
    const { bank, site } = await this.publicBank(bankCode);
    const input = z
      .object({
        mode: z.enum(['practice', 'exam']).default('practice'),
        count: z.number().int().min(1).max(200).optional(),
        participantId: z.string().max(64).default(''),
      })
      .parse(body);
    const siteSettings = parseSiteSettings(site.settings);
    if (input.mode === 'practice' && !siteSettings.allowPractice) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开放练习');
    }
    if (input.mode === 'exam' && !siteSettings.allowExam) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开放考试');
    }
    await this.assertApproved(site, input.participantId || '');
    const settings = parseSettings(bank.settings);
    const rows = await this.questionRows(bank.questionTableId);
    const questions = rows
      .map(questionOf)
      .sort((a, b) => a.sort - b.sort || a.id - b.id);
    if (!questions.length) {
      throw new BusinessException(ErrorCode.CONFLICT, '题库还没有题目');
    }
    const total = questions.length;
    let picked = questions;
    if (input.mode === 'exam') {
      const count = Math.min(input.count || settings.examCount, total);
      picked = settings.randomize
        ? shuffle(questions).slice(0, count)
        : questions.slice(0, count);
    }
    return {
      bank: this.publicBankView(bank, total),
      mode: input.mode,
      questions: picked.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        imageUrl: item.imageUrl,
        options: item.options,
        category: item.category,
        sort: item.sort,
      })),
    };
  }

  private async questionById(bank: BankRow, rowId: number) {
    const row = await this.prisma.dataTableRow.findFirst({
      where: { id: rowId, tableId: bank.questionTableId },
      select: { id: true, data: true, createdAt: true },
    });
    return row ? questionOf(row) : null;
  }

  async publicCheck(bankCode: string, body: Record<string, unknown>) {
    const { bank, site } = await this.publicBank(bankCode);
    const input = quizCheckBodySchema.parse(body);
    await this.assertApproved(site, input.participantId);
    const question = await this.questionById(bank, input.questionId);
    if (!question)
      throw new BusinessException(ErrorCode.NOT_FOUND, '题目不存在');
    const settings = parseSettings(bank.settings);
    return {
      correct: isCorrect(question.type, input.answer, question.answer),
      correctAnswer: question.answer,
      analysis: settings.showAnalysis ? question.analysis : '',
    };
  }

  async publicSubmit(bankCode: string, body: Record<string, unknown>) {
    const { bank, site } = await this.publicBank(bankCode);
    const input = quizSubmitBodySchema.parse(body);
    await this.assertApproved(site, input.participantId);
    const settings = parseSettings(bank.settings);
    const rows = await this.questionRows(bank.questionTableId);
    const byId = new Map(rows.map((row) => [row.id, questionOf(row)]));
    const answerMap = new Map<number, string>();
    for (const item of input.answers) {
      if (byId.has(item.questionId))
        answerMap.set(item.questionId, item.answer);
    }
    if (!answerMap.size) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '没有可判分的答案');
    }
    const results = [...answerMap.entries()].map(([questionId, answer]) => {
      const question = byId.get(questionId)!;
      const correct = isCorrect(question.type, answer, question.answer);
      return {
        questionId,
        title: question.title,
        category: question.category,
        correct,
        yourAnswer: normalizeAnswer(answer),
        correctAnswer: question.answer,
        analysis: settings.showAnalysis ? question.analysis : '',
      };
    });
    const total = results.length;
    const correct = results.filter((item) => item.correct).length;
    const score = total ? Math.round((correct / total) * 100) : 0;
    const wrongIds = results
      .filter((item) => !item.correct)
      .map((item) => item.questionId);
    const submittedAt = new Date();
    const created = await this.dataTables.appendSystemRow(
      bank.attemptTableId,
      {
        participant_id: input.participantId,
        nickname: clip(input.nickname, 60),
        company: clip(input.company, 120),
        department: clip(input.department, 120),
        score,
        total,
        correct,
        duration_sec: input.durationSec,
        mode: input.mode === 'practice' ? '练习' : '考试',
        wrong_ids: wrongIds.join(','),
        detail: {
          answers: results.map((item) => ({
            questionId: item.questionId,
            answer: item.yourAnswer,
            correct: item.correct,
          })),
        },
        submitted_at: submittedAt.toISOString(),
      },
      `quiz:${bank.code}`,
    );
    await this.prisma.quizBank.update({
      where: { id: bank.id },
      data: { attemptCount: { increment: 1 } },
    });
    const rank =
      input.mode === 'exam'
        ? this.rankOf(await this.attemptRows(bank), ROW_SCAN_LIMIT).find(
            (item) => item.participantId === input.participantId,
          )
        : null;
    return {
      attemptId: created.id,
      score,
      total,
      correct,
      wrongCount: wrongIds.length,
      durationSec: input.durationSec,
      passScore: settings.passScore,
      passed: score >= settings.passScore,
      showAnalysis: settings.showAnalysis,
      answers: results,
      wrongIds,
      rank: rank ? rank.rank : null,
    } satisfies QuizSubmitResult;
  }

  async publicAttempts(bankCode: string, participantId: string, limit = 20) {
    const { bank, site } = await this.publicBank(bankCode);
    if (!participantId) return [];
    await this.assertApproved(site, participantId);
    const rows = await this.attemptRows(bank);
    return rows
      .filter((item) => item.participantId === participantId)
      .slice(0, Math.min(Math.max(limit, 1), 100));
  }

  async publicRank(bankCode: string, limit = 20) {
    const { bank } = await this.publicBank(bankCode);
    const rows = this.rankOf(
      await this.attemptRows(bank),
      Math.min(Math.max(limit, 1), 100),
    );
    // 公开排行不暴露参赛者标识：它是错题/记录接口的凭据，只留在本机。
    return rows.map((row) => ({ ...row, participantId: '' }));
  }

  async publicWrong(bankCode: string, participantId: string) {
    const { bank, site } = await this.publicBank(bankCode);
    if (!participantId) return [];
    await this.assertApproved(site, participantId);
    const attempts = (await this.attemptRows(bank)).filter(
      (item) => item.participantId === participantId,
    );
    const latest = attempts.find((item) => item.wrongIds.length) || attempts[0];
    if (!latest || !latest.wrongIds.length) return [];
    const rows = await this.prisma.dataTableRow.findMany({
      where: { tableId: bank.questionTableId, id: { in: latest.wrongIds } },
      orderBy: { id: 'asc' },
      select: { id: true, data: true, createdAt: true },
    });
    return rows.map(questionOf);
  }

  private async chat(
    ownerUserId: string,
    operation: string,
    refId: string,
    messages: ChatMessage[],
    maxTokens = 700,
  ) {
    const result = await aiChat(this.prisma, {
      userId: ownerUserId,
      messages,
      maxTokens,
      timeoutMs: 60_000,
      module: 'quiz',
      operation,
      charge: { code: 'ai_service', refId },
    });
    return { text: clip(result.reply, 4000), model: result.model };
  }

  async publicExplain(bankCode: string, body: Record<string, unknown>) {
    const { bank, site } = await this.publicBank(bankCode);
    const settings = parseSettings(bank.settings);
    if (!site.aiEnabled) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开启 AI 解析');
    }
    if (!settings.aiExplain) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '该题库未开启 AI 解析');
    }
    const input = z
      .object({
        questionId: z.number().int().positive(),
        participantId: z.string().max(64).default(''),
        selected: z.string().max(6).default(''),
      })
      .parse(body);
    const question = await this.questionById(bank, input.questionId);
    if (!question)
      throw new BusinessException(ErrorCode.NOT_FOUND, '题目不存在');
    const options = question.options
      .map((item) => `${item.key}. ${item.label}`)
      .join('\n');
    return this.chat(site.ownerUserId, 'quiz_explain', bank.code, [
      {
        role: 'system',
        content:
          '你是答题助教。用 120 字以内的中文解释这道题为什么选这个答案，指出易错点；不要重复整段题干，不要编造事实。',
      },
      {
        role: 'user',
        content: [
          `题干：${question.title}`,
          options ? `选项：\n${options}` : '',
          `正确答案：${question.answer}`,
          input.selected ? `学员选择：${normalizeAnswer(input.selected)}` : '',
          question.analysis ? `题库解析：${question.analysis}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ]);
  }

  async publicAttemptAnalysis(
    bankCode: string,
    attemptId: number,
    body: Record<string, unknown>,
  ) {
    const { bank, site } = await this.publicBank(bankCode);
    const input = z
      .object({ participantId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) })
      .parse(body);
    await this.assertApproved(site, input.participantId);
    if (!site.aiEnabled) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '站点未开启 AI 复盘');
    }
    const row = await this.prisma.dataTableRow.findFirst({
      where: { id: attemptId, tableId: bank.attemptTableId },
      select: { id: true, data: true, createdAt: true },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '答题记录不存在');
    const attempt = this.attemptOf(row);
    if (attempt.participantId !== input.participantId) {
      throw new BusinessException(
        ErrorCode.FORBIDDEN,
        '只能复盘自己的答题记录',
      );
    }
    const wrongQuestions = attempt.wrongIds.length
      ? (
          await this.prisma.dataTableRow.findMany({
            where: {
              tableId: bank.questionTableId,
              id: { in: attempt.wrongIds },
            },
            orderBy: { id: 'asc' },
            select: { id: true, data: true, createdAt: true },
          })
        ).map(questionOf)
      : [];
    if (!wrongQuestions.length) {
      return { text: '本次全部答对，保持这个状态。', model: 'rule' };
    }
    return this.chat(
      site.ownerUserId,
      'quiz_attempt_analysis',
      bank.code,
      [
        {
          role: 'system',
          content:
            '你是学习教练。根据错题用 150 字以内中文给出 3 条薄弱点与复习建议，按 1/2/3 分点，不要空话。',
        },
        {
          role: 'user',
          content: [
            `本次得分：${attempt.score} 分（${attempt.correct}/${attempt.total}）`,
            `错题：\n${wrongQuestions
              .map(
                (item, index) =>
                  `${index + 1}. [${item.category || '未分类'}] ${item.title}（正确答案 ${item.answer}）`,
              )
              .join('\n')}`,
          ].join('\n'),
        },
      ],
      900,
    );
  }
}
