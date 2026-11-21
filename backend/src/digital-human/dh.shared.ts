import { randomBytes, randomInt } from 'node:crypto';
import { dhDiyPageSchema, type DhDiyPage } from '@enterprise/contracts';

/** 自营小程序主体场景：数字人工具固定 DIGITAL_HUMAN，shopId 即站点 id。 */
export const DH_SCENE = 'DIGITAL_HUMAN' as const;

/** 站点寻址码字母表同 mall 口径：去掉易混淆的 I/O/0/1。 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function dhSiteCode(): string {
  let out = '';
  for (let index = 0; index < 8; index += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** 卡密码：16 位大写数字混合，站点内唯一由 (siteId, code) 约束兜底。 */
export function dhCardCode(): string {
  return randomBytes(12).toString('hex').toUpperCase().slice(0, 16);
}

/** 订单号：日期时间 + 随机段，长度 40 内可反查排障。 */
export function dhOrderNo(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `DH${stamp}${randomInt(1_000_000).toString().padStart(6, '0')}`;
}

/** webhook 定位 token：回调 URL 带它，杜绝跨站伪造完成任务。 */
export function dhCallbackToken(): string {
  return randomBytes(24).toString('base64url');
}

export function clip(value: string | null | undefined, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** JSON 列在 MySQL/PG 两侧取回形状不一致（PG 可能给字符串），统一按默认值合并。 */
export function mergeJson<T extends object>(value: unknown, base: T): T {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...base };
  return { ...base, ...(raw as Partial<T>) };
}

/** 历史站点可能存过自由结构的装修数据，解析失败按空装修处理。 */
export function diyPageOf(value: unknown): DhDiyPage {
  const parsed = dhDiyPageSchema.safeParse(mergeJson(value, {}));
  return parsed.success ? parsed.data : { components: [] };
}

/** 品牌默认（brand JSON）。 */
export const DH_DEFAULT_BRAND = {
  shareTitle: '',
  shareImage: '',
  navigationTitle: '',
};

/** 模块显隐默认：默认全开，站点方按需关闭。 */
export const DH_DEFAULT_TOGGLES: Record<string, boolean> = {
  indexSwiper: true,
  indexNotice: true,
  bodyClone: true,
  voiceClone: true,
  aiWrite: true,
  ttsAudio: true,
  worksPage: true,
  vipPage: true,
  card: true,
  commissionPage: true,
  poster: true,
  feedback: true,
  serviceDesk: true,
  agreement: true,
};

/** 计价默认（单位：点数/次），端上按它展示消耗预估。 */
export const DH_DEFAULT_PRICING = {
  pointTitle: '算力',
  priceVideo: 10,
  priceTts: 1,
  priceBody: 3,
  priceVoice: 3,
};

export const DH_DEFAULT_GIFT = { vipDays: 0, point: 0, body: 0, voice: 0 };
export const DH_DEFAULT_LOGIN = { mustVip: false };
export const DH_DEFAULT_CLONE = {
  bodyMinSec: 5,
  bodyMaxSec: 60,
  voiceMinSec: 10,
  voiceMaxSec: 60,
  scriptMaxLen: 800,
};
export const DH_DEFAULT_COMMISSION = {
  enabled: false,
  level1Rate: 20,
  level2Rate: 5,
  joinType: 'auto' as const,
  payPackageId: 0,
  minWithdrawCents: 1000,
};

/** 站点行 → 类型化配置集（服务层统一从这里取，不再散读 JSON 列）。 */
export type DhSiteConfig = {
  brand: typeof DH_DEFAULT_BRAND;
  toggles: Record<string, boolean>;
  pricing: typeof DH_DEFAULT_PRICING;
  gift: typeof DH_DEFAULT_GIFT;
  login: typeof DH_DEFAULT_LOGIN;
  clone: typeof DH_DEFAULT_CLONE;
  commission: typeof DH_DEFAULT_COMMISSION;
};

export function siteConfigOf(row: {
  brand: unknown;
  toggles: unknown;
  pricing: unknown;
  gift: unknown;
  login: unknown;
  clone: unknown;
  commission: unknown;
}): DhSiteConfig {
  return {
    brand: mergeJson(row.brand, DH_DEFAULT_BRAND),
    toggles: mergeJson(row.toggles, DH_DEFAULT_TOGGLES),
    pricing: mergeJson(row.pricing, DH_DEFAULT_PRICING),
    gift: mergeJson(row.gift, DH_DEFAULT_GIFT),
    login: mergeJson(row.login, DH_DEFAULT_LOGIN),
    clone: mergeJson(row.clone, DH_DEFAULT_CLONE),
    commission: mergeJson(row.commission, DH_DEFAULT_COMMISSION),
  };
}

export function toggleOn(config: DhSiteConfig, key: string): boolean {
  return config.toggles[key] !== false;
}
