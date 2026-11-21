import type { IdentityService } from '../identity/identity.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import type { ContentModelSettingService } from './model-setting.service';
import type { AipddAssetClient } from './aipdd-asset.client';
import type { PublishReviewService } from '../moderation/publish-review.service';
import { DigitalAssetService } from './digital-asset.service';
import { stub } from '../../test/doubles';

/**
 * 自有字节的台账记账规则（`registerOwned` / `forgetByOssKey`）。
 *
 * GB·天存储费是把某人所有 `digital_asset_entries` 的 `fileSize` 加起来算的，
 * 于是两条规则直接决定「用户会不会为同一份字节付第二遍钱」：
 * 1. **同一个对象键重复入账＝覆盖写**：重新生成小程序码、重出同名版本都走这里；
 *    如果每次 insert 一行，店主多点几次生成就多付几份存储费，而且永远不会降。
 * 2. **字节被删除时账行必须同批消失**：删掉一个代码包版本只删了对象、留着账行，
 *    等于为已经不存在的字节持续计费，用户在任何页面上都看不出来。
 */

type Row = Record<string, unknown>;

function setup() {
  const rows: Row[] = [];
  const shares: Row[] = [];
  let seq = 1;
  const find = (where: Row) =>
    rows.find((row) =>
      Object.entries(where).every(([key, expected]) => row[key] === expected),
    );
  const prisma = {
    digitalAssetEntry: {
      findFirst: async ({ where }: { where: Row }) => find(where) ?? null,
      findMany: async ({ where, select }: { where: Row; select?: Row }) => {
        const hit = rows.filter((row) =>
          Object.entries(where).every(
            ([key, expected]) => row[key] === expected,
          ),
        );
        if (!select) return hit;
        return hit.map((row) =>
          Object.fromEntries(
            Object.keys(select)
              .filter((key) => row[key] !== undefined)
              .map((key) => [key, row[key]]),
          ),
        );
      },
      create: async ({ data }: { data: Row }) => {
        const row = { id: seq++, ...data };
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error('台账行不存在');
        Object.assign(row, data);
        return row;
      },
      deleteMany: async ({
        where,
      }: {
        where: { id?: { in: number[] }; ossKey?: string };
      }) => {
        const before = rows.length;
        const ids = where.id?.in;
        for (let i = rows.length - 1; i >= 0; i--) {
          const hit = ids
            ? ids.includes(Number(rows[i].id))
            : rows[i].ossKey === where.ossKey;
          if (hit) rows.splice(i, 1);
        }
        return { count: before - rows.length };
      },
    },
    contentSharedAsset: {
      deleteMany: async ({ where }: { where: Row }) => {
        const assetIds = (where.assetId as { in: string[] }).in;
        const before = shares.length;
        for (let i = shares.length - 1; i >= 0; i--) {
          if (assetIds.includes(String(shares[i].assetId))) shares.splice(i, 1);
        }
        return { count: before - shares.length };
      },
    },
    // 替身同时支持两种调用形态：`$transaction([op, op])` 与
    // `$transaction(async (tx) => ...)`（registerOwned / forgetByOssKey 各用一种）。
    // 回调拿到的 tx 就是这份替身本身——假库没有真事务语义，但方法面完全一致。
    $transaction: async (ops: unknown): Promise<unknown> => {
      if (typeof ops === 'function') {
        const run = ops as (tx: unknown) => Promise<unknown>;
        return run(facade);
      }
      const list = ops as Promise<unknown>[];
      const out: unknown[] = [];
      for (const op of list) out.push(await op);
      return out;
    },
  };
  // 回调式 $transaction 拿到的 tx 就是这份替身本身（假库没有真事务语义，方法面一致）
  const facade = prisma as unknown as Record<string, unknown>;
  const service = new DigitalAssetService(
    stub<PrismaService>(prisma),
    stub<ContentModelSettingService>(),
    stub<AipddAssetClient>(),
    stub<IdentityService>(),
    stub<StorageService>(),
    stub<PublishReviewService>(),
  );
  return { service, rows, shares, prisma };
}

const owned = (ossKey: string, sizeBytes: number, name?: string) => ({
  ossKey,
  url: `https://oss.example/${ossKey}`,
  sizeBytes,
  name,
  type: 'image',
  labels: ['poster'],
});

describe('自有字节台账：同一对象键只算一份', () => {
  it('重复登记同一个 ossKey 时更新原行，不再插第二条账', async () => {
    const { service, rows } = setup();
    const first = await service.registerOwned(
      'u1',
      owned('private-mini/qrcode/BRAND/3/qrcode-abc.png', 20_000),
    );
    const second = await service.registerOwned(
      'u1',
      owned('private-mini/qrcode/BRAND/3/qrcode-abc.png', 21_000),
    );
    expect(second).toBe(first);
    expect(rows).toHaveLength(1);
    // 体积按最新一次覆盖：旧值留着就是多收钱
    expect(Number(rows[0].fileSize)).toBeCloseTo(21_000 / 1024 / 1024, 10);
  });

  it('不同对象键各记一条（不同页面的码是不同工件）', async () => {
    const { service, rows } = setup();
    await service.registerOwned('u1', owned('a/x.png', 1024));
    await service.registerOwned('u1', owned('a/y.png', 1024));
    expect(rows).toHaveLength(2);
  });

  it('换店铺/换归属不会误覆盖别人的账行', async () => {
    const { service, rows } = setup();
    await service.registerOwned('u1', owned('shared/key.png', 1024));
    const otherId = await service.registerOwned(
      'u2',
      owned('shared/key.png', 4096),
    );
    expect(rows).toHaveLength(2);
    const mine = rows.find((row) => row.userId === 'u2');
    expect(Number(mine?.fileSize)).toBeCloseTo(4096 / 1024 / 1024, 10);
    expect(otherId).toBe(mine?.id);
  });

  it('缺归属或缺对象键直接拒写', async () => {
    const { service, rows } = setup();
    await expect(
      service.registerOwned(' ', owned('a.png', 10)),
    ).rejects.toThrow(/拒绝写入无主字节记录/);
    await expect(
      service.registerOwned('u1', { ...owned('a.png', 10), ossKey: '' }),
    ).rejects.toThrow(/拒绝写入无主字节记录/);
    expect(rows).toHaveLength(0);
  });
});

describe('自有字节台账：删字节就得出账', () => {
  it('按对象键清账，连带删掉它的共享授权', async () => {
    const { service, rows, shares } = setup();
    const id = await service.registerOwned(
      'u1',
      owned('releases/1.zip', 5_000_000),
    );
    // 伪造一条共享授权，验证清账不会把授权留在世上指向一个已删资产
    shares.push({ assetId: String(id), ownerUserId: 'u1' });
    expect(await service.forgetByOssKey('releases/1.zip')).toBe(1);
    expect(rows).toHaveLength(0);
    expect(shares).toHaveLength(0);
  });

  it('空键不动任何账；查不到的键返回 0（调用方据此知道没清掉）', async () => {
    const { service, rows } = setup();
    await service.registerOwned('u1', owned('releases/2.zip', 1024));
    expect(await service.forgetByOssKey('')).toBe(0);
    expect(await service.forgetByOssKey('releases/does-not-exist.zip')).toBe(0);
    expect(rows).toHaveLength(1);
  });

  it('同一个键有多条历史脏账时一次清干净', async () => {
    const { service, rows, prisma } = setup();
    await service.registerOwned('u1', owned('releases/3.zip', 1024));
    // 收口前的老数据：同键多行（当时没有覆盖写）
    await prisma.digitalAssetEntry.create({
      data: {
        userId: 'u1',
        ossKey: 'releases/3.zip',
        fileSize: 1,
        type: 'file',
        name: 'releases/3.zip',
        url: 'x',
        previewUrl: 'x',
        aipddAssetId: -777,
        migratedFrom: 'system',
        labels: [],
      },
    });
    expect(await service.forgetByOssKey('releases/3.zip')).toBe(2);
    expect(rows).toHaveLength(0);
  });
});
