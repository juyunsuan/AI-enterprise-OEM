export type AiSocialWebTarget = {
  mode: 'aiworkin' | 'sns' | 'none';
  base: string;
  locale: string;
};

/**
 * DSH 社交插件的网页目标：优先 AIworkin 网页，其次复用已有的 SNS 网页地址。
 * 两者都没配时返回 none，入口页会提示部署方配置，不臆造地址。
 */
export function aiSocialWebTarget(): AiSocialWebTarget {
  const aiworkin = (process.env.AIWORKIN_WEB_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (aiworkin) {
    return {
      mode: 'aiworkin',
      base: aiworkin,
      locale: process.env.AIWORKIN_WEB_LOCALE === 'en' ? 'en' : 'cn',
    };
  }
  const sns = (process.env.SNS_WEB_URL || '').trim().replace(/\/+$/, '');
  if (sns) return { mode: 'sns', base: sns, locale: '' };
  return { mode: 'none', base: '', locale: '' };
}

/** 把插件里的相对路径补成可点的地址；绝对地址原样返回。 */
export function aiSocialWebUrl(
  path: string,
  target: AiSocialWebTarget = aiSocialWebTarget(),
): string {
  if (!path) return target.base;
  if (/^https?:\/\//i.test(path)) return path;
  if (!target.base) return '';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return target.mode === 'aiworkin'
    ? `${target.base}/${target.locale}${normalized}`
    : `${target.base}${normalized}`;
}
