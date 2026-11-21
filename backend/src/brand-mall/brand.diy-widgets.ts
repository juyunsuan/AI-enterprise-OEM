import {
  BRAND_DIY_WIDGETS,
  type BrandDiyWidget,
  type BrandDiyWidgetMeta,
} from '@enterprise/contracts';

type WidgetGroup = 'base' | 'goods' | 'marketing' | 'shop' | 'assist';

const GROUP_LABELS: Record<WidgetGroup, string> = {
  base: '基础',
  goods: '商品',
  marketing: '营销',
  shop: '店铺',
  assist: '辅助',
};

type CatalogEntry = {
  name: string;
  icon: string;
  group: WidgetGroup;
  defaultProps: Record<string, unknown>;
};

/**
 * 组件目录：出包给小程序端的 `components/diy/*` 必须一一对应这里，
 * 编辑器按这份清单渲染左侧组件库与右侧属性表单的初值。
 *
 * 链接统一 `{ type, name, path, targetId }`；商品列表/券的取数在 C 端按 id 现查，
 * 所以 props 里只存 id，不存标题价格快照（否则改价要重发装修）。
 */
const CATALOG: Record<BrandDiyWidget, CatalogEntry> = {
  searchBar: {
    name: '搜索框',
    icon: 'search',
    group: 'base',
    defaultProps: { placeholder: '搜索商品', disabled: true, radius: 28 },
  },
  imageAds: {
    name: '图片广告',
    icon: 'picture',
    group: 'base',
    defaultProps: {
      mode: 'swiper',
      height: 320,
      interval: 4,
      gutter: 16,
      radius: 12,
      items: [],
    },
  },
  imageCube: {
    name: '图片魔方',
    icon: 'appstore',
    group: 'base',
    defaultProps: { layout: 'FOUR', gutter: 8, radius: 8, items: [] },
  },
  nav: {
    name: '图标导航',
    icon: 'menu',
    group: 'base',
    defaultProps: { columns: 4, items: [] },
  },
  notice: {
    name: '公告栏',
    icon: 'horn',
    group: 'base',
    defaultProps: { text: '', icon: '', speed: 60 },
  },
  title: {
    name: '标题分区',
    icon: 'file-text',
    group: 'base',
    defaultProps: { main: '标题', sub: '', align: 'left', bold: true },
  },
  richText: {
    name: '富文本',
    icon: 'edit',
    group: 'base',
    defaultProps: { html: '' },
  },
  goodsList: {
    name: '商品列表',
    icon: 'shop',
    group: 'goods',
    defaultProps: {
      source: 'RECOMMEND',
      categoryId: 0,
      productIds: [],
      limit: 10,
      columns: 2,
      style: 'CARD',
      showTitle: true,
      showSubtitle: false,
      showPrice: true,
      showSales: true,
    },
  },
  categoryLine: {
    name: '分类行',
    icon: 'category',
    group: 'goods',
    defaultProps: { limit: 10 },
  },
  coupon: {
    name: '优惠券',
    icon: 'gift',
    group: 'marketing',
    defaultProps: { couponIds: [], style: 'TWO' },
  },
  storeHead: {
    name: '店铺头部',
    icon: 'home',
    group: 'shop',
    defaultProps: { showLogo: true, showSlogan: true, showPhone: true },
  },
  assist: {
    name: '辅助区',
    icon: 'tool',
    group: 'assist',
    defaultProps: { mode: 'PHONE', label: '联系客服' },
  },
  spacer: {
    name: '辅助线/留白',
    icon: 'column-height',
    group: 'assist',
    defaultProps: { height: 12, color: 'transparent' },
  },
  pageFoot: {
    name: '底部导航',
    icon: 'bar',
    group: 'assist',
    defaultProps: { items: [] },
  },
};

const catalog = (): BrandDiyWidgetMeta[] =>
  BRAND_DIY_WIDGETS.filter((type) => CATALOG[type]).map((type) => ({
    type,
    name: CATALOG[type].name,
    icon: CATALOG[type].icon,
    group: CATALOG[type].group,
    groupLabel: GROUP_LABELS[CATALOG[type].group],
    defaultProps: { ...CATALOG[type].defaultProps },
  }));

export const BRAND_DIY_WIDGET_CATALOG = catalog();

export function isBrandWidget(value: unknown): value is BrandDiyWidget {
  return (
    typeof value === 'string' &&
    (BRAND_DIY_WIDGETS as readonly string[]).includes(value)
  );
}

/** 属性表单初值：编辑器新增组件时用，端上渲染时缺字段也按这份兜。 */
export function widgetDefaults(type: string): Record<string, unknown> {
  return isBrandWidget(type) ? { ...CATALOG[type].defaultProps } : {};
}
