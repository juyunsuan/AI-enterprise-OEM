import type { CurrentUser } from '../auth/current-user';
import type { IdentityService } from '../identity/identity.service';
import type { UserLookupService } from '../directory/user-lookup.service';
import type { PrismaService } from '../prisma/prisma.service';
import { stub } from '../../test/doubles';
import { DataTableService } from './data-table.service';

/**
 * 采集落表（docs/浏览器代理网页采集落表方案.md §五 C、§十 D3）的四条硬约束：
 * · 表头对不齐时只给本人归属的表补列——表结构是表主的资产；
 * · 未声明的中文键进 missedKeys 如实回报，不静丢一列；
 * · dedupBy 命中即更新，重投同一页不产生重复行（定时重跑的前提）；
 * · 单次 500 行、机器通道单批 200 行 ⇒ 分批提交并把批数回报。
 */

const owner = { userId: 'u1', username: 'owner', role: 'user' } as CurrentUser;
const member = {
  userId: 'u9',
  username: 'member',
  role: 'user',
} as CurrentUser;

type FieldSeed = {
  fieldKey: string;
  name: string;
  fieldType?: string;
  required?: boolean;
};

type Row = { id: number; tableId: number; createdBy: string; data: unknown };

function setup(input: {
  /** false＝表归他人所有，本人只有授权成员身份（能写行，不能改表结构）。 */
  owner?: boolean;
  fields?: FieldSeed[];
  rows?: { id: number; data: Record<string, unknown> }[];
}) {
  const tableId = 5;
  const tableOwner = input.owner === false ? 'u2' : 'u1';
  const table = {
    id: tableId,
    createdBy: tableOwner,
    name: '药店线索',
    description: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const fields = (input.fields ?? []).map((item, index) => ({
    id: index + 1,
    tableId,
    name: item.name,
    fieldKey: item.fieldKey,
    fieldType: item.fieldType ?? 'text',
    sortOrder: index,
    options: {},
    required: item.required ?? false,
    createdAt: new Date(),
  }));
  const rows: Row[] = (input.rows ?? []).map((item) => ({
    id: item.id,
    tableId,
    createdBy: tableOwner,
    data: item.data,
  }));
  const audits: string[] = [];
  let fieldSeq = fields.length + 1;
  let rowSeq = Math.max(100, ...rows.map((row) => row.id));

  const prisma = {
    dataTable: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
        where.id === tableId
          ? { ...table, createdBy: tableOwner }
          : {
              id: 9,
              createdBy: 'u1',
              name: '昆明药店',
              description: '',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
      ),
      // 按名定位同名已有表：本用例只在「新建表」分支里被问到，回 null 即建表
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 9,
        createdBy: data.createdBy,
        name: data.name,
        description: data.description ?? '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
    dataTableField: {
      findMany: jest.fn(
        async ({ where }: { where: { fieldKey?: { in: string[] } } }) => {
          if (where.fieldKey?.in) {
            return fields
              .filter((field) => where.fieldKey?.in.includes(field.fieldKey))
              .map((field) => ({ fieldKey: field.fieldKey }));
          }
          return [...fields];
        },
      ),
      findFirst: jest.fn(async () =>
        fields.length
          ? { sortOrder: Math.max(...fields.map((field) => field.sortOrder)) }
          : { sortOrder: -1 },
      ),
      createMany: jest.fn(
        async ({ data }: { data: Record<string, unknown>[] }) => {
          for (const item of data) {
            fields.push({
              id: fieldSeq++,
              tableId,
              name: String(item.name),
              fieldKey: String(item.fieldKey),
              fieldType: String(item.fieldType),
              sortOrder: Number(item.sortOrder),
              options: {},
              required: Boolean(item.required),
              createdAt: new Date(),
            });
          }
        },
      ),
    },
    dataTableRow: {
      count: jest.fn(async () => rows.length),
      findMany: jest.fn(async () =>
        rows.map((row) => ({ id: row.id, data: row.data })),
      ),
      createMany: jest.fn(
        async ({ data }: { data: Record<string, unknown>[] }) => {
          for (const item of data) {
            rows.push({
              id: ++rowSeq,
              tableId: Number(item.tableId),
              createdBy: String(item.createdBy),
              data: item.data,
            });
          }
        },
      ),
      // 落表按行 create（拿行号通知下游），与界面批量写行同一口径；double 与真实 Prisma 面保持一致。
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: ++rowSeq,
          tableId: Number(data.tableId),
          createdBy: String(data.createdBy),
          data: data.data,
        };
        rows.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: number };
          data: { data: unknown };
        }) => {
          const hit = rows.find((row) => row.id === where.id);
          if (hit) hit.data = data.data;
          return hit;
        },
      ),
    },
    dataTableGrant: {
      // 表归他人：本人是「能新增行、不能改结构」的授权成员
      findUnique: jest.fn(async () =>
        input.owner === false
          ? {
              tableId,
              granteeUserId: 'u9',
              canRead: true,
              canCreate: true,
              canUpdate: false,
              canDelete: false,
            }
          : null,
      ),
      findMany: jest.fn(async () => []),
    },
    // 授权随成员关系失效：这里给一条在职绑定，让「被授权但不能改结构」成立
    providerStaff: { findFirst: jest.fn(async () => ({ id: 1 })) },
    enterpriseProfile: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    // 数组形式事务与真实 Prisma 同口径：返回各项结果（落表要按 create 的返回行号通知下游）。
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const identity = {
    audit: jest.fn(async (_u: string, _a: string, detail: string) => {
      audits.push(detail);
    }),
    isPlatformAdmin: () => false,
  };
  const users = { displayNames: jest.fn(async () => new Map()) };
  const service = new DataTableService(
    stub<PrismaService>(prisma),
    stub<IdentityService>(identity),
    stub<UserLookupService>(users),
  );
  return {
    service,
    prisma,
    audits,
    fields,
    rows,
    createdRows: () => rows.map((row) => row.data),
  };
}

describe('采集落表 DataTable_landRows', () => {
  beforeEach(() => jest.clearAllMocks());

  it('缺列自动补表头并把行写进目标表，来源列一并落库', async () => {
    const { service, fields, rows, createdRows } = setup({
      fields: [{ fieldKey: 'shop_name', name: '药店名称' }],
    });
    const result = await service.landRows(owner, {
      tableId: 5,
      rows: [
        {
          shop_name: '一心堂',
          address: '昆明市北京路 1 号',
          phone: '0871-1234',
        },
        {
          shop_name: '健之佳',
          address: '昆明市东风西路 2 号',
          phone: '0871-5678',
        },
      ],
      fields: [
        { name: '药店名称', key: 'shop_name' },
        { name: '地址', key: 'address' },
        { name: '电话', key: 'phone' },
      ],
      source: '会话#12 · map.baidu.com',
    });
    expect(result.tableId).toBe(5);
    expect(result.tableCreated).toBe(false);
    expect(result.created).toBe(2);
    expect(result.addedFields.map((item) => item.key)).toEqual([
      'address',
      'phone',
      '_source',
    ]);
    expect(fields.map((field) => field.fieldKey)).toEqual([
      'shop_name',
      'address',
      'phone',
      '_source',
    ]);
    expect(createdRows()[0]).toEqual({
      shop_name: '一心堂',
      address: '昆明市北京路 1 号',
      phone: '0871-1234',
      _source: '会话#12 · map.baidu.com',
    });
    expect(rows).toHaveLength(2);
  });

  it('只给表名：同名没有就新建表，表头按 fields 建齐', async () => {
    const { service, prisma } = setup({});
    const result = await service.landRows(owner, {
      tableName: '昆明药店',
      rows: [{ name: '寿宝堂', tel: '13800000000' }],
      fields: [
        { name: '名称', key: 'name' },
        { name: '电话', key: 'tel' },
      ],
    });
    expect(result.tableCreated).toBe(true);
    expect(result.tableId).toBe(9);
    // 新建表本身不带列，补列走的是同一张表的 addFields
    expect(prisma.dataTable.create).toHaveBeenCalled();
    expect(result.created).toBe(1);
    expect(result.addedFields).toHaveLength(2);
  });

  it('行里出现表头之外的键：写不进去就收进 missedKeys，不静丢也不整批失败', async () => {
    const { service, prisma } = setup({
      fields: [{ fieldKey: 'shop_name', name: '药店名称' }],
    });
    const result = await service.landRows(owner, {
      tableId: 5,
      rows: [{ 药店名称: '一心堂', shop_name: '一心堂', 营业时间: '24小时' }],
    });
    // 表头名能对上就写（药店名称），对不上的如实回报，不静丢
    expect(result.missedKeys).toEqual(['营业时间']);
    expect(result.created).toBe(1);
    expect(prisma.dataTableRow.create).toHaveBeenCalledTimes(1);
  });

  it('非归属表缺列时拒补列，并点名要表主加哪些列', async () => {
    const { service, prisma } = setup({
      owner: false,
      fields: [{ fieldKey: 'shop_name', name: '药店名称' }],
    });
    await expect(
      service.landRows(member, {
        tableId: 5,
        rows: [{ shop_name: '一心堂', phone: '0871-1234' }],
        fields: [{ name: '电话', key: 'phone' }],
      }),
    ).rejects.toThrow(/不是本人归属/);
    // 表主的结构没被改动，行也没写进去
    expect(prisma.dataTableField.createMany).not.toHaveBeenCalled();
    expect(prisma.dataTableRow.create).not.toHaveBeenCalled();
  });

  it('dedupBy 命中同值则更新，重投同一页不产生重复行', async () => {
    const { service, rows, createdRows } = setup({
      fields: [
        { fieldKey: 'shop_name', name: '药店名称' },
        { fieldKey: 'phone', name: '电话' },
      ],
      rows: [{ id: 1, data: { shop_name: '一心堂', phone: '0871-1234' } }],
    });
    const result = await service.landRows(owner, {
      tableId: 5,
      dedupBy: ['药店名称'],
      rows: [
        // 同一家店：电话变了 → 更新已有行
        { shop_name: '一心堂', phone: '0871-9999' },
        // 新店 → 新增
        { shop_name: '健之佳', phone: '0871-5678' },
        // 同批自带重复 → 合并成一条，不写两行
        { shop_name: '健之佳', phone: '0871-5678' },
      ],
    });
    expect(result.updated).toBe(1);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(rows).toHaveLength(2);
    expect(createdRows()).toEqual([
      { shop_name: '一心堂', phone: '0871-9999' },
      { shop_name: '健之佳', phone: '0871-5678' },
    ]);
  });

  it('一行没变也重投：整批计跳过，不产生写操作', async () => {
    const { service, prisma } = setup({
      fields: [{ fieldKey: 'shop_name', name: '药店名称' }],
      rows: [{ id: 1, data: { shop_name: '一心堂' } }],
    });
    const result = await service.landRows(owner, {
      tableId: 5,
      dedupBy: ['shop_name'],
      rows: [{ shop_name: '一心堂' }],
    });
    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect(prisma.dataTableRow.create).not.toHaveBeenCalled();
    expect(prisma.dataTableRow.update).not.toHaveBeenCalled();
  });

  it('查重锚认不出列名就拒，不替用户猜列', async () => {
    const { service } = setup({
      fields: [{ fieldKey: 'shop_name', name: '药店名称' }],
    });
    await expect(
      service.landRows(owner, {
        tableId: 5,
        dedupBy: ['统一社会信用代码'],
        rows: [{ shop_name: '一心堂' }],
      }),
    ).rejects.toThrow(/查重列「统一社会信用代码」不在该表列里/);
  });

  it('超过单批上限分行写：400 行分两批提交，批数如实回报', async () => {
    const { service, prisma, rows } = setup({
      fields: [{ fieldKey: 'shop_name', name: '药店名称' }],
    });
    const result = await service.landRows(owner, {
      tableId: 5,
      rows: Array.from({ length: 400 }, (_item, index) => ({
        shop_name: `第 ${index + 1} 家`,
      })),
    });
    expect(result.created).toBe(400);
    expect(result.batches).toBe(2);
    // 落表按行 create（拿行号通知下游），分批边界由 $transaction 承载：两批各 200 行。
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const batches = prisma.$transaction.mock.calls.map((call) => call[0]);
    expect(batches.map((batch) => batch.length)).toEqual([200, 200]);
    expect(prisma.dataTableRow.create).toHaveBeenCalledTimes(400);
    expect(rows).toHaveLength(400);
  });

  it('500 行是硬上限：再多就分批调用，整批拒收并给出下一步', async () => {
    const { service } = setup({
      fields: [{ fieldKey: 'shop_name', name: '药店名称' }],
    });
    await expect(
      service.landRows(owner, {
        tableId: 5,
        rows: Array.from({ length: 501 }, (_item, index) => ({
          shop_name: `第 ${index + 1} 家`,
        })),
      }),
    ).rejects.toThrow(/单次最多落 500 行/);
  });

  it('既不给表编号也不给表名时拒收，空行同样拒收', async () => {
    const { service } = setup({});
    await expect(service.landRows(owner, { rows: [{ a: 1 }] })).rejects.toThrow(
      /tableId/,
    );
    await expect(
      service.landRows(owner, { tableId: 5, rows: [] }),
    ).rejects.toThrow(/请提交要写入的行/);
  });

  it('落表留痕进审计台账：一次调用一条，含新增/更新/跳过口径', async () => {
    const { service, audits } = setup({
      fields: [{ fieldKey: 'shop_name', name: '药店名称' }],
      rows: [{ id: 1, data: { shop_name: '一心堂' } }],
    });
    await service.landRows(owner, {
      tableId: 5,
      dedupBy: ['shop_name'],
      rows: [{ shop_name: '一心堂' }, { shop_name: '健之佳' }],
    });
    expect(audits).toEqual([expect.stringContaining('新增 1 更新 0 跳过 1')]);
  });
});
