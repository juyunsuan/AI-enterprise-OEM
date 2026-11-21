import {
  type OnsiteArticleInput,
  type OnsiteArticleRow,
  type OnsiteFormFieldInput,
  type OnsiteFormFieldRow,
  type OnsiteShieldRow,
  type OnsiteSubmissionAuditInput,
  type OnsiteSubmissionDetail,
  type OnsiteSubmissionRow,
} from '@enterprise/contracts';
import { pageOf, pageParam, text } from '../common/api';
import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { CurrentUser } from '../auth/current-user';
import type { PrismaService } from '../prisma/prisma.service';
import { numberArray, stringArray } from './onsite.money';
import type { OnsiteStaffService } from './onsite.staff.service';
import type { OnsiteShopService } from './onsite.shop.service';

const ARTICLE_STATUSES = ['DRAFT', 'PUBLISHED', 'OFFLINE'] as const;
const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'select',
  'phone',
  'idcard',
  'date',
  'region',
] as const;

const articleStatusOf = (value: string) => {
  for (const status of ARTICLE_STATUSES) {
    if (status === value) return status;
  }
  return 'DRAFT';
};

const fieldTypeOf = (value: string) => {
  for (const type of FIELD_TYPES) {
    if (type === value) return type;
  }
  return 'text';
};

/**
 * 内容文章 + 自定义表单 + 屏蔽关系。
 *
 * 参考源码用「文章 + 自定义字段」同时承担协议公示、技师招募、代理申请三类场景，
 * 本实现照做，但把提交后的落点收敛成一条：审核通过 + createStaff 才建档为服务人员，
 * 避免任何一条报名都能直接写主表。
 */
export class OnsiteContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: OnsiteShopService,
    private readonly staff: OnsiteStaffService,
  ) {}

  // ---------- 文章 ----------

  async articles(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const status = text(query.status, 'all');
    const keyword = text(query.keyword).trim().slice(0, 40);
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(keyword ? { title: { contains: keyword } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteArticle.count({ where }),
      this.prisma.onsiteArticle.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: offset,
        take: pageSize,
      }),
    ]);
    const ids = rows.map((row) => row.id);
    const [links, submissions] = await Promise.all([
      ids.length
        ? this.prisma.onsiteArticleFormField.findMany({
            where: { articleId: { in: ids } },
            orderBy: { sortOrder: 'asc' },
          })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.onsiteFormSubmission.findMany({
            where: { shopId: shop.shopId, articleId: { in: ids } },
            select: { articleId: true },
          })
        : Promise.resolve([]),
    ]);
    const fieldsOf = new Map<number, number[]>();
    for (const link of links) {
      const bucket = fieldsOf.get(link.articleId) ?? [];
      bucket.push(link.fieldId);
      fieldsOf.set(link.articleId, bucket);
    }
    const submitCount = new Map<number, number>();
    for (const row of submissions) {
      submitCount.set(row.articleId, (submitCount.get(row.articleId) || 0) + 1);
    }
    const list: OnsiteArticleRow[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      cover: row.cover,
      formEnabled: row.formEnabled,
      formPurpose: row.formPurpose,
      sortOrder: row.sortOrder,
      status: articleStatusOf(row.status),
      pv: row.pv,
      fieldIds: fieldsOf.get(row.id) ?? [],
      submissionCount: submitCount.get(row.id) || 0,
      updatedAt: row.updatedAt.toISOString(),
    }));
    return pageOf(list, total, page, pageSize);
  }

  async saveArticle(
    user: CurrentUser,
    shopId: string,
    body: OnsiteArticleInput,
  ): Promise<OnsiteArticleRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const fieldIds = Array.from(new Set(body.fieldIds));
    if (fieldIds.length) {
      const found = await this.prisma.onsiteFormField.count({
        where: { id: { in: fieldIds }, shopId: shop.shopId },
      });
      if (found !== fieldIds.length) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '所选表单字段里有不属于本店铺的，请先到「表单字段」新建',
        );
      }
    }
    if (body.formEnabled && !fieldIds.length) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '这篇文章勾选了挂表单，请至少选择一个表单字段',
      );
    }
    const data = {
      title: body.title.trim().slice(0, 120),
      summary: body.summary.trim().slice(0, 200),
      content: String(body.content || '').slice(0, 60000),
      cover: body.cover.trim().slice(0, 500),
      formEnabled: body.formEnabled,
      formPurpose: body.formPurpose,
      sortOrder: Math.round(body.sortOrder || 0),
      status: articleStatusOf(body.status),
    };
    const row = body.id
      ? await this.prisma.onsiteArticle.update({ where: { id: body.id }, data })
      : await this.prisma.onsiteArticle.create({
          data: { shopId: shop.shopId, ...data },
        });
    await this.prisma.onsiteArticleFormField.deleteMany({
      where: { articleId: row.id },
    });
    if (fieldIds.length) {
      await this.prisma.onsiteArticleFormField.createMany({
        data: fieldIds.map((fieldId, index) => ({
          articleId: row.id,
          fieldId,
          sortOrder: index,
        })),
      });
    }
    await this.audit(user.userId, 'onsite.article.save', data.title);
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      cover: row.cover,
      formEnabled: row.formEnabled,
      formPurpose: row.formPurpose,
      sortOrder: row.sortOrder,
      status: articleStatusOf(row.status),
      pv: row.pv,
      fieldIds,
      submissionCount: 0,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async removeArticle(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteArticle.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row) throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在');
    const usedByLevel = await this.prisma.onsiteStaffLevel.count({
      where: { shopId: shop.shopId, agreementArticleId: row.id },
    });
    if (usedByLevel > 0) {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        `「${row.title}」被 ${usedByLevel} 个服务人等级的入驻协议引用，请先在等级设置里换掉它`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.onsiteArticleFormField.deleteMany({
        where: { articleId: row.id },
      }),
      this.prisma.onsiteArticle.delete({ where: { id: row.id } }),
    ]);
    return { removed: true };
  }

  // ---------- 表单字段 ----------

  async formFields(user: CurrentUser, shopId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const [rows, links] = await Promise.all([
      this.prisma.onsiteFormField.findMany({
        where: { shopId: shop.shopId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.onsiteArticleFormField.findMany({
        select: { fieldId: true },
      }),
    ]);
    const usage = new Map<number, number>();
    for (const link of links) {
      usage.set(link.fieldId, (usage.get(link.fieldId) || 0) + 1);
    }
    const list: OnsiteFormFieldRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      fieldType: fieldTypeOf(row.fieldType),
      options: stringArray(row.options),
      placeholder: row.placeholder,
      required: row.required,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      articleCount: usage.get(row.id) || 0,
    }));
    return { list };
  }

  async saveFormField(
    user: CurrentUser,
    shopId: string,
    body: OnsiteFormFieldInput,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const type = fieldTypeOf(body.fieldType);
    const options = body.options
      .map((item) => item.trim().slice(0, 40))
      .filter(Boolean);
    if (type === 'select' && options.length < 2) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '单选题至少给两个选项，否则顾客端点了没反应',
      );
    }
    const data = {
      name: body.name.trim().slice(0, 60),
      fieldType: type,
      options: type === 'select' ? options.slice(0, 30) : [],
      placeholder: body.placeholder.trim().slice(0, 80),
      required: body.required !== false,
      sortOrder: Math.round(body.sortOrder || 0),
      enabled: body.enabled !== false,
    };
    const row = body.id
      ? await this.prisma.onsiteFormField.update({
          where: { id: body.id },
          data,
        })
      : await this.prisma.onsiteFormField.create({
          data: { shopId: shop.shopId, ...data },
        });
    return {
      id: row.id,
      name: row.name,
      fieldType: fieldTypeOf(row.fieldType),
      options: stringArray(row.options),
      placeholder: row.placeholder,
      required: row.required,
      sortOrder: row.sortOrder,
      enabled: row.enabled,
      articleCount: 0,
    };
  }

  async removeFormField(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteFormField.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '表单字段不存在');
    await this.prisma.$transaction([
      this.prisma.onsiteArticleFormField.deleteMany({
        where: { fieldId: row.id },
      }),
      this.prisma.onsiteFormField.delete({ where: { id: row.id } }),
    ]);
    return { removed: true };
  }

  // ---------- 提交与审核 ----------

  async submissions(
    user: CurrentUser,
    shopId: string,
    query: Record<string, unknown>,
  ) {
    const shop = await this.shops.requireShop(user, shopId);
    const { page, pageSize, offset } = pageParam(
      query.page as string | number | undefined,
      query.pageSize as string | number | undefined,
      20,
    );
    const status = text(query.status, 'all');
    const articleId = Number(query.articleId) || 0;
    const where = {
      shopId: shop.shopId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(articleId ? { articleId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteFormSubmission.count({ where }),
      this.prisma.onsiteFormSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);
    const titles = await this.articleTitles(rows.map((row) => row.articleId));
    const list: OnsiteSubmissionRow[] = rows.map((row) =>
      this.toSubmissionRow(row, titles),
    );
    return pageOf(list, total, page, pageSize);
  }

  private async articleTitles(ids: number[]) {
    const distinct = Array.from(new Set(ids.filter((id) => id > 0)));
    if (!distinct.length) return new Map<number, string>();
    const rows = await this.prisma.onsiteArticle.findMany({
      where: { id: { in: distinct } },
      select: { id: true, title: true },
    });
    return new Map(rows.map((row) => [row.id, row.title]));
  }

  private toSubmissionRow(
    row: {
      id: number;
      articleId: number;
      name: string;
      phone: string;
      customerId: number;
      staffId: number;
      status: string;
      auditRemark: string;
      auditedAt: Date | null;
      createdAt: Date;
    },
    titles: Map<number, string>,
  ): OnsiteSubmissionRow {
    return {
      id: row.id,
      articleId: row.articleId,
      articleTitle:
        titles.get(row.articleId) ??
        (row.articleId ? `#${row.articleId}` : '直接提交'),
      name: row.name,
      phone: row.phone,
      customerId: row.customerId,
      staffId: row.staffId,
      status: row.status,
      auditRemark: row.auditRemark,
      auditedAt: row.auditedAt ? row.auditedAt.toISOString() : '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  async submissionDetail(
    user: CurrentUser,
    shopId: string,
    submissionId: string,
  ): Promise<OnsiteSubmissionDetail> {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteFormSubmission.findFirst({
      where: { id: Number(submissionId), shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '提交记录不存在');
    const data = await this.prisma.onsiteFormData.findMany({
      where: { submissionId: row.id },
      orderBy: { id: 'asc' },
    });
    const titles = await this.articleTitles([row.articleId]);
    return {
      ...this.toSubmissionRow(row, titles),
      answers: data.map((item) => ({
        label: item.label,
        value: item.value,
        fieldType: 'text',
      })),
    };
  }

  async auditSubmission(
    user: CurrentUser,
    shopId: string,
    body: OnsiteSubmissionAuditInput,
  ): Promise<OnsiteSubmissionRow> {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteFormSubmission.findFirst({
      where: { id: body.id, shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '提交记录不存在');
    if (row.status !== 'PENDING') {
      throw new BusinessException(
        ErrorCode.CONFLICT,
        '该提交已审核过，不能重复处理',
      );
    }
    let staffId = row.staffId;
    if (body.approved && body.createStaff) {
      if (!row.phone.trim()) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          '这条提交没有手机号，无法建档为服务人员，请先让对方补齐联系方式',
        );
      }
      const created = await this.staff.applyFromSubmission(shop.shopId, {
        name: row.name || '未填写',
        phone: row.phone,
      });
      staffId = created.id;
    }
    const updated = await this.prisma.onsiteFormSubmission.update({
      where: { id: row.id },
      data: {
        status: body.approved ? 'APPROVED' : 'REJECTED',
        auditRemark: body.remark.trim().slice(0, 200),
        auditedBy: user.userId,
        auditedAt: new Date(),
        staffId,
      },
    });
    await this.audit(
      user.userId,
      'onsite.submission.audit',
      `#${updated.id} ${updated.status}`,
    );
    const titles = await this.articleTitles([updated.articleId]);
    return this.toSubmissionRow(updated, titles);
  }

  /** C 端提交表单：按文章定义的字段校验必填与题型，脏值不入库。 */
  async submitForm(input: {
    shopId: number;
    articleId: number;
    customerId: number;
    answers: Record<string, string>;
  }) {
    const article = await this.prisma.onsiteArticle.findFirst({
      where: { id: input.articleId, shopId: input.shopId, status: 'PUBLISHED' },
    });
    if (!article)
      throw new BusinessException(ErrorCode.NOT_FOUND, '文章不存在或已下架');
    if (!article.formEnabled) {
      throw new BusinessException(ErrorCode.BAD_REQUEST, '这篇文章没有挂表单');
    }
    const links = await this.prisma.onsiteArticleFormField.findMany({
      where: { articleId: article.id },
      orderBy: { sortOrder: 'asc' },
    });
    const fieldIds = links.map((link) => link.fieldId);
    const fields = fieldIds.length
      ? await this.prisma.onsiteFormField.findMany({
          where: { id: { in: fieldIds }, shopId: input.shopId, enabled: true },
        })
      : [];
    const ordered = fieldIds
      .map((id) => fields.find((field) => field.id === id))
      .filter((field): field is (typeof fields)[number] => Boolean(field));
    const answers: { fieldId: number; label: string; value: string }[] = [];
    for (const field of ordered) {
      const value = String(input.answers?.[String(field.id)] ?? '').trim();
      if (!value) {
        if (field.required) {
          throw new BusinessException(
            ErrorCode.BAD_REQUEST,
            `请填写「${field.name}」`,
          );
        }
        continue;
      }
      this.assertFieldValue(field, value);
      answers.push({
        fieldId: field.id,
        label: field.name,
        value: value.slice(0, 2000),
      });
    }
    const phone = answers.find((item) => /手机/.test(item.label))?.value ?? '';
    const name =
      answers.find((item) => /(姓名|名字)/.test(item.label))?.value ?? '';
    const submission = await this.prisma.onsiteFormSubmission.create({
      data: {
        shopId: input.shopId,
        articleId: article.id,
        customerId: input.customerId,
        name: name.slice(0, 60),
        phone: phone.slice(0, 32),
      },
    });
    if (answers.length) {
      await this.prisma.onsiteFormData.createMany({
        data: answers.map((item) => ({
          submissionId: submission.id,
          fieldId: item.fieldId,
          label: item.label,
          value: item.value,
        })),
      });
    }
    return { id: submission.id, status: submission.status };
  }

  private assertFieldValue(
    field: { name: string; fieldType: string; options: unknown },
    value: string,
  ) {
    if (field.fieldType === 'phone' && !/^[0-9+\-\s]{6,20}$/.test(value)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `「${field.name}」手机号格式不对`,
      );
    }
    if (field.fieldType === 'idcard' && !/^[0-9Xx]{15,19}$/.test(value)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `「${field.name}」身份证号格式不对`,
      );
    }
    if (field.fieldType === 'number' && !/^-?\d+(\.\d+)?$/.test(value)) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        `「${field.name}」请填写数字`,
      );
    }
    if (field.fieldType === 'select') {
      const options = stringArray(field.options);
      if (options.length && !options.includes(value)) {
        throw new BusinessException(
          ErrorCode.BAD_REQUEST,
          `「${field.name}」只能从给定选项里选择`,
        );
      }
    }
  }

  // ---------- 屏蔽关系 ----------

  async shields(user: CurrentUser, shopId: string, staffId: string) {
    const shop = await this.shops.requireShop(user, shopId);
    const rows = await this.prisma.onsiteShieldLink.findMany({
      where: {
        shopId: shop.shopId,
        ...(Number(staffId) > 0 ? { staffId: Number(staffId) } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const customerIds = numberArray(rows.map((row) => row.customerId));
    const staffIds = Array.from(new Set(rows.map((row) => row.staffId)));
    const [customers, staffRows] = await Promise.all([
      customerIds.length
        ? this.prisma.onsiteCustomer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, nickname: true },
          })
        : Promise.resolve([]),
      staffIds.length
        ? this.prisma.onsiteStaff.findMany({
            where: { id: { in: staffIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const customerName = new Map(
      customers.map((row) => [row.id, row.nickname || `顾客#${row.id}`]),
    );
    const staffName = new Map(staffRows.map((row) => [row.id, row.name]));
    const list: OnsiteShieldRow[] = rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerNickname:
        customerName.get(row.customerId) ?? `顾客#${row.customerId}`,
      staffId: row.staffId,
      staffName: staffName.get(row.staffId) ?? `#${row.staffId}`,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
    }));
    return { list };
  }

  async removeShield(user: CurrentUser, shopId: string, id: number) {
    const shop = await this.shops.requireShop(user, shopId);
    const row = await this.prisma.onsiteShieldLink.findFirst({
      where: { id, shopId: shop.shopId },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '屏蔽记录不存在');
    await this.prisma.onsiteShieldLink.delete({ where: { id: row.id } });
    return { removed: true };
  }

  /** 顾客视角：他被哪些技师拉黑 / 他屏蔽了哪些技师（下单前排除用）。 */
  async blockedStaffIds(shopId: number, customerId: number) {
    const rows = await this.prisma.onsiteShieldLink.findMany({
      where: { shopId, customerId },
      select: { staffId: true },
    });
    return rows.map((row) => row.staffId);
  }

  /** C 端：只出已发布文章（协议 / 说明），正文截断由端上渲染控制。 */
  async publicArticles(shopId: number, page: number, pageSize: number) {
    const where = { shopId, status: 'PUBLISHED' };
    const [total, rows] = await Promise.all([
      this.prisma.onsiteArticle.count({ where }),
      this.prisma.onsiteArticle.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      list: rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        cover: row.cover,
        formEnabled: row.formEnabled,
        formPurpose: row.formPurpose,
        pv: row.pv,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 文章详情顺带把表单字段与选项端出来，C 端不用再拉一次接口。 */
  async publicArticleDetail(shopId: number, articleId: number) {
    const row = await this.prisma.onsiteArticle.findFirst({
      where: { id: articleId, shopId, status: 'PUBLISHED' },
    });
    if (!row)
      throw new BusinessException(ErrorCode.NOT_FOUND, '内容不存在或已下架');
    await this.prisma.onsiteArticle
      .update({ where: { id: row.id }, data: { pv: { increment: 1 } } })
      .catch(() => undefined);
    const links = row.formEnabled
      ? await this.prisma.onsiteArticleFormField.findMany({
          where: { articleId: row.id },
          orderBy: { sortOrder: 'asc' },
        })
      : [];
    const fields = links.length
      ? await this.prisma.onsiteFormField.findMany({
          where: {
            id: { in: links.map((link) => link.fieldId) },
            enabled: true,
          },
        })
      : [];
    const ordered = links
      .map((link) => fields.find((field) => field.id === link.fieldId))
      .filter((field): field is (typeof fields)[number] => Boolean(field));
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      content: row.content,
      cover: row.cover,
      formEnabled: row.formEnabled,
      fields: ordered.map((field) => ({
        id: field.id,
        name: field.name,
        fieldType: fieldTypeOf(field.fieldType),
        options: stringArray(field.options),
        placeholder: field.placeholder,
        required: field.required,
      })),
    };
  }

  private async audit(userId: string, action: string, detail: string) {
    await this.prisma.auditLog
      .create({ data: { userId, action, detail: detail.slice(0, 500) } })
      .catch(() => undefined);
  }
}
