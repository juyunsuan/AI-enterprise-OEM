import type { DigitalAssetService } from '../content/digital-asset.service';
import type { StorageService } from '../storage/storage.service';
import { BusinessException } from '../common/business.exception';
import { SystemAssetService } from './system-asset.service';
import { stub } from '../../test/doubles';

/**
 * 系统资产层是"字节 → 台账"的唯一归口，用例守住三件事：
 * 1. 没有归属账号就**拒写**（无主字节正是本轮要消灭的东西）；
 * 2. 字节仍只经门面落桶，且对象路径原样透传（历史 URL 不能因为收口而变）；
 * 3. 落桶结果（key/url/size）必须完整交给台账登记，否则 GB·天日批读不到。
 */

function setup(options: { failLedger?: boolean } = {}) {
  const puts: { path: string; size: number }[] = [];
  const ledgers: Record<string, unknown>[] = [];
  const removed: string[] = [];
  const forgotten: string[] = [];
  const storage = stub<StorageService>({
    put: async (path: string, content: Buffer) => {
      puts.push({ path, size: content.length });
      return {
        key: `enterprise/dir/${path}`,
        url: 'https://oss.example/enterprise/dir/' + path,
        size: content.length,
      };
    },
    remove: async (key: string) => {
      removed.push(key);
    },
    signFormPost: async () => ({ action: 'https://oss', fields: {} }),
    urlOf: (key: string) => `https://oss.example/${key}`,
  });
  const assets = stub<DigitalAssetService>({
    registerOwned: async (_userId: string, input: Record<string, unknown>) => {
      if (options.failLedger) throw new Error('台账库忙');
      ledgers.push({ userId: _userId, ...input });
      return 421;
    },
    forgetByOssKey: async (key: string) => {
      forgotten.push(key);
      return 1;
    },
  });
  return {
    service: new SystemAssetService(storage, assets),
    puts,
    ledgers,
    removed,
    forgotten,
  };
}

const bytes = () => Buffer.from('hello-system-asset', 'utf8');

describe('SystemAssetService.put', () => {
  it('缺归属账号直接拒写，不落桶也不入账', async () => {
    const { service, puts, ledgers } = setup();
    await expect(
      service.put({ ownerUserId: '  ', path: 'a.png', bytes: bytes() }),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(puts).toHaveLength(0);
    expect(ledgers).toHaveLength(0);
  });

  it('对象路径原样交给门面，台账拿到 key/url/size', async () => {
    const { service, puts, ledgers } = setup();
    const result = await service.put({
      ownerUserId: 'u9',
      path: 'brand-mall/shop-3/a.png',
      bytes: bytes(),
      bizRef: 'shop:3',
    });
    expect(puts[0].path).toBe('brand-mall/shop-3/a.png');
    expect(ledgers[0]).toMatchObject({
      userId: 'u9',
      ossKey: 'enterprise/dir/brand-mall/shop-3/a.png',
      sizeBytes: 18,
    });
    expect(result.assetId).toBe(421);
    expect((ledgers[0] as { labels: string[] }).labels).toContain('shop:3');
  });

  it('台账写入失败必须冒泡：静默吞掉就等于又造了一笔无账字节', async () => {
    const { service, puts } = setup({ failLedger: true });
    await expect(
      service.put({ ownerUserId: 'u9', path: 'a.png', bytes: bytes() }),
    ).rejects.toThrow('台账库忙');
    expect(puts).toHaveLength(1);
  });
});
describe('SystemAssetService.remove', () => {
  it('删字节必须同批清台账：留着行就是为已经不存在的字节继续收 GB·天', async () => {
    const { service, removed, forgotten } = setup();
    await service.remove(
      'enterprise/dir/private-mini/releases/BRAND/3/brand-1.0.0.zip',
    );
    expect(removed).toEqual([
      'enterprise/dir/private-mini/releases/BRAND/3/brand-1.0.0.zip',
    ]);
    expect(forgotten).toEqual(removed);
  });

  it('空键不做任何事（删除入口拿到空 ossKey 时不该误清一整片账）', async () => {
    const { service, removed, forgotten } = setup();
    await service.remove('');
    expect(removed).toEqual([]);
    expect(forgotten).toEqual([]);
  });
});
