import { safeText } from './text';
/**
 * DIY 装修：组件白名单校验与属性归一化。
 *
 * 组件目录本身留在业务侧（名称、图标、默认属性是各业务自己的表现层），
 * 引擎只保证「存进库的页面树只含白名单组件、属性含初值、条数不超限」，
 * 这样小程序端渲染器遇到的数据结构在两个业务里完全一致。
 */

export interface DiyWidgetDescriptor {
  type: string;
  name: string;
  group: string;
  defaultProps: Record<string, unknown>;
}

export interface DiyNode {
  type: string;
  props: Record<string, unknown>;
}

export interface DiyLink {
  type: string;
  name: string;
  path: string;
  targetId: string;
}

export const DIY_LIMITS = {
  /** 单页最多组件数，超过后小程序首屏渲染会明显卡顿。 */
  maxWidgets: 40,
  /** 单个组件内的条目数上限（轮播图、导航、商品列表共用）。 */
  maxItems: 12,
  maxTitleLength: 40,
} as const;

export function diyWidgetTypes(catalog: DiyWidgetDescriptor[]): string[] {
  return catalog.map((item) => item.type);
}

export function normalizeDiyLink(link: unknown): DiyLink {
  const raw = (
    link && typeof link === 'object' && !Array.isArray(link) ? link : {}
  ) as Record<string, unknown>;
  return {
    type: (safeText(raw.type) || 'NONE').slice(0, 20),
    name: safeText(raw.name).slice(0, DIY_LIMITS.maxTitleLength),
    // 路径只允许站内绝对路径，防止装修把顾客带到外部域名
    path: safeText(raw.path).startsWith('/')
      ? safeText(raw.path).slice(0, 200)
      : '',
    targetId: safeText(raw.targetId).slice(0, 64),
  };
}

export interface NormalizeOptions {
  /** 超出上限时是截断还是报错；页面保存用截断，发布自检用报错。 */
  overflow?: 'TRIM' | 'REJECT';
}

export interface NormalizeResult {
  nodes: DiyNode[];
  /** 逐条可展示给店主的中文说明；无问题为空数组。 */
  errors: string[];
}

/**
 * 属性合并策略：先铺组件初值，再覆盖用户改动，
 * `items` 数组单独按 maxItems 截断——图片类组件最容易塞上百张图。
 */
export function normalizeDiyPage(
  input: unknown,
  catalog: DiyWidgetDescriptor[],
  options: NormalizeOptions = {},
): NormalizeResult {
  const byType = new Map(catalog.map((item) => [item.type, item]));
  const rows = Array.isArray(input) ? input : [];
  const errors: string[] = [];
  const nodes: DiyNode[] = [];
  for (const row of rows) {
    if (nodes.length >= DIY_LIMITS.maxWidgets) {
      const message = `单个页面最多 ${DIY_LIMITS.maxWidgets} 个组件`;
      if (options.overflow === 'REJECT') {
        if (!errors.includes(message)) errors.push(message);
        continue;
      }
      break;
    }
    const raw = (row ?? {}) as Record<string, unknown>;
    const type = safeText(raw.type);
    const descriptor = byType.get(type);
    if (!descriptor) {
      errors.push(`未知组件「${type || '空'}」，已忽略`);
      continue;
    }
    const props = { ...descriptor.defaultProps } as Record<string, unknown>;
    const given = (raw.props ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(given)) {
      if (key === 'items' && Array.isArray(value)) {
        if (value.length > DIY_LIMITS.maxItems) {
          errors.push(
            `「${descriptor.name}」条目超过 ${DIY_LIMITS.maxItems} 个，已截取前 ${DIY_LIMITS.maxItems} 个`,
          );
        }
        props[key] = value.slice(0, DIY_LIMITS.maxItems);
        continue;
      }
      props[key] = value;
    }
    nodes.push({ type, props });
  }
  return { nodes, errors };
}

/** 首页之外的活动页共用同一份校验；发布前自检统计未识别的组件。 */
export function diyUnknownTypes(
  input: unknown,
  catalog: DiyWidgetDescriptor[],
): string[] {
  const known = new Set(diyWidgetTypes(catalog));
  const rows = Array.isArray(input) ? input : [];
  return [
    ...new Set(
      rows
        .map((row) => safeText(((row ?? {}) as Record<string, unknown>).type))
        .filter((type) => type !== '' && !known.has(type)),
    ),
  ];
}
