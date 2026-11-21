import { BusinessException } from '../common/business.exception';
import { ErrorCode } from '../common/error-code';
import type { DigitalAssetService } from '../content/digital-asset.service';
import type { OssUploadResult } from '../oss/oss.service';
import type { StorageService } from '../storage/storage.service';

/**
 * 系统资产层：字节的**归属与台账**入口（方案 §10.1 的采集层）。
 *
 * 为什么不把 userId 塞进 `StorageService`：门面要保持纯粹（换底座只改门面），
 * 而"这笔字节属于谁、是什么业务对象"是领域信息；且各私域的对象键约定已经写死在
 * 历史 URL 里（`enterprise/{userId}/…`、站点素材目录等），不能因为收口就改路径。
 * 所以这一层做两件事：字节仍交门面落桶，随后把结果登记进 `digital_asset_entries`。
 *
 * 只有入账后的字节才会被 `PointsBillingService` 的 GB·天日批读到——
 * 没入账的字节既不计费也不可治理，这正是本轮要清零的债。
 */

export type SystemAssetPutInput = {
  /** 字节归属账号：存储计费按它归集，缺失直接拒写 */
  ownerUserId: string;
  /** 相对上传目录的对象路径（沿用调用方既有约定） */
  path: string;
  bytes: Buffer;
  /** 台账展示名，缺省取对象末段 */
  name?: string;
  /** 台账类型（image/file/video…），缺省按扩展名推断 */
  assetType?: string;
  /** 业务引用（订单号 / shopId / 站点码等），排障与配额核对用 */
  bizRef?: string;
  labels?: string[];
};

export type SystemAssetResult = OssUploadResult & { assetId: number };

export class SystemAssetService {
  constructor(
    private readonly storage: StorageService,
    private readonly assets: DigitalAssetService,
  ) {}

  /** 落桶 + 入账：字节写入仍然只经门面，台账在这里补齐。 */
  async put(input: SystemAssetPutInput): Promise<SystemAssetResult> {
    const owner = String(input.ownerUserId || '').trim();
    if (!owner) {
      throw new BusinessException(
        ErrorCode.BAD_REQUEST,
        '缺少字节归属账号（ownerUserId），拒绝写入无主字节',
      );
    }
    const uploaded = await this.storage.put(input.path, input.bytes);
    const assetId = await this.assets.registerOwned(owner, {
      ossKey: uploaded.key,
      url: uploaded.url,
      sizeBytes: uploaded.size,
      name: input.name,
      type: input.assetType,
      labels: [...(input.labels ?? []), input.bizRef ?? 'system'].filter(
        Boolean,
      ),
    });
    return { ...uploaded, assetId };
  }

  /**
   * 删除字节并**同批清掉台账行**。
   *
   * 原来这里只删字节，注释说「台账行由调用方负责」——而实际没有任何调用方去删：
   * 用户删掉一个代码包版本，对象没了，GB·天快照还在按那条行收费。
   * 字节与账必须一起走，所以收在门面里；调用方不需要、也不该记得第二件事。
   */
  async remove(key: string): Promise<void> {
    if (!key) return;
    await this.storage.remove(key);
    await this.assets.forgetByOssKey(key);
  }

  urlOf(key: string): string {
    return this.storage.urlOf(key);
  }
}
