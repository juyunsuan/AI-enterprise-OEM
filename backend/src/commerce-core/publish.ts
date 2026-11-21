/**
 * 出包与发版边界：哪些配置打进代码包（改了要重新出包），哪些是 C 端启动现拉（改了不用发版）。
 *
 * 这条边界是页面上一句说明的来源，店主最容易问的是「我改了店铺名，要不要重新上传小程序」。
 */

/** 写入模板 `config.js` 的键：与私域小程序底座的注入实现一一对应。 */
export const MINI_INJECT_KEYS = [
  'apiBase',
  'shopCode',
  'appName',
  'themeColor',
  'appId',
] as const;
export type MiniInjectKey = (typeof MINI_INJECT_KEYS)[number];

/** 走 bootstrap 接口现拉的键：改这些顾客刷新即生效，不需要发版。 */
export const MINI_RUNTIME_KEYS = [
  'slogan',
  'navigationTitle',
  'servicePhone',
  'logo',
  'features',
  'payEnabled',
  'qrcodeUrl',
] as const;
export type MiniRuntimeKey = (typeof MINI_RUNTIME_KEYS)[number];

const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]{1,20})?$/;

export function isValidReleaseVersion(version: string): boolean {
  return VERSION_PATTERN.test(String(version || '').trim());
}

export function releaseVersionHint(): string {
  return '版本号需形如 1.0.0，可带 -beta.1 之类的后缀';
}

/**
 * 店主改的是业务字段，包里注入的是键名，这里给出对应关系：
 * 改了店铺名等于改了注入的 `appName`，必须重新出包。
 */
export const CONFIG_KEY_ALIASES: Record<string, string> = {
  shopName: 'appName',
  shopCode: 'shopCode',
  apiBaseUrl: 'apiBase',
  theme: 'themeColor',
  themeColor: 'themeColor',
  appId: 'appId',
  phone: 'servicePhone',
};

export function isInjectKey(key: string): boolean {
  return (MINI_INJECT_KEYS as readonly string[]).includes(String(key || ''));
}

function resolveKey(key: string): string {
  const name = String(key || '').trim();
  return CONFIG_KEY_ALIASES[name] || name;
}

export interface ChangeClassification {
  /** 需要重新出包并上传微信的改动项。 */
  republish: string[];
  /** 刷新即生效的改动项。 */
  runtime: string[];
  /** 中台未登记的键：保守按需要发版处理，避免改了不生效却告诉店主不用发版。 */
  unknown: string[];
}

export function classifyConfigChange(
  changedKeys: string[],
): ChangeClassification {
  const result: ChangeClassification = {
    republish: [],
    runtime: [],
    unknown: [],
  };
  for (const key of changedKeys) {
    const name = resolveKey(key);
    if (!name) continue;
    if (isInjectKey(name)) result.republish.push(name);
    else if ((MINI_RUNTIME_KEYS as readonly string[]).includes(name))
      result.runtime.push(name);
    else result.unknown.push(name);
  }
  return result;
}

/**
 * 发版说明的一句话口径：微信侧只接受开发版，提审与发布由用户在自己的公众平台完成。
 * 界面文案必须引用这里，避免两个业务各写一套合规话术。
 */
export const MINI_UPLOAD_DISCLAIMER =
  '本站只生成开发版并直传到你的小程序后台，提交审核与发布请在微信公众平台完成';

/** 需要重新出包的改动项文案；空数组表示「本次改动刷新即生效」。 */
export function republishHint(classification: ChangeClassification): string {
  const keys = [...classification.republish, ...classification.unknown];
  if (keys.length === 0)
    return '本次改的都是运行期配置，顾客刷新即生效，不用重新出包';
  return `改了 ${keys.join(' / ')}，需要重新出包并上传开发版`;
}
