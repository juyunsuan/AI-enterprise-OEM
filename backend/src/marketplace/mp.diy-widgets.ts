import {
  MP_DIY_WIDGETS,
  type MpDiyWidget,
  type MpDiyWidgetMeta,
} from '@enterprise/contracts';
import type { DiyWidgetDescriptor } from '../commerce-core/diy';

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
 * 市场/店铺两级装修共用一份组件目录。
 *
 * 与品牌商城同构（`commerce-core/diy.ts` 的白名单与条数上限），额外多一个
 * `shopList`：市场首页需要「店铺楼层」，店铺页不渲染它（端上按 scope 屏蔽）。
 * 链接统一 `{ type, name, path, targetId }`，商品/券只存 id 不存价格快照。
 */
const CATALOG: Record<MpDiyWidget, CatalogEntry> = {
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
      shopId: 0,
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
    defaultProps: { showLogo: true, showSlogan: true, showFollow: true },
  },
  shopList: {
    name: '店铺楼层',
    icon: 'appstore-add',
    group: 'shop',
    defaultProps: { limit: 6, columns: 2, style: 'CARD', showIntro: true },
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
};

const catalog = (): MpDiyWidgetMeta[] =>
  MP_DIY_WIDGETS.filter((type) => CATALOG[type]).map((type) => ({
    type,
    name: CATALOG[type].name,
    icon: CATALOG[type].icon,
    group: CATALOG[type].group,
    groupLabel: GROUP_LABELS[CATALOG[type].group],
    defaultProps: { ...CATALOG[type].defaultProps },
  }));

export const MP_DIY_WIDGET_CATALOG = catalog();

/** 供 `commerce-core/diy.ts` 归一化用的描述符（名称/分组/初值）。 */
export const MP_DIY_DESCRIPTORS: DiyWidgetDescriptor[] =
  MP_DIY_WIDGET_CATALOG.map((item) => ({
    type: item.type,
    name: item.name,
    group: item.group,
    defaultProps: item.defaultProps,
  }));

export function isMpWidget(value: unknown): value is MpDiyWidget {
  return (
    typeof value === 'string' &&
    (MP_DIY_WIDGETS as readonly string[]).includes(value)
  );
}
