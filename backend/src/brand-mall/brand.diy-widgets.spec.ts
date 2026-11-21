import { BRAND_DIY_WIDGETS } from '@enterprise/contracts';
import {
  BRAND_DIY_WIDGET_CATALOG,
  isBrandWidget,
  widgetDefaults,
} from './brand.diy-widgets';

/**
 * 组件目录是「后端校验 / 编辑器 / 小程序渲染器」三方的接缝：
 * 这一组测试的意义在于防止任何一侧偷偷多出或漏掉一个类型——
 * 漏了会在顾客端表现为空白块，而这类问题线上很难被发现。
 */
describe('BrandDiyWidgets', () => {
  it('覆盖契约声明的每一个组件类型，且不含契约外的类型', () => {
    const types = BRAND_DIY_WIDGET_CATALOG.map((item) => item.type);
    expect(new Set(types).size).toBe(types.length);
    expect([...types].sort()).toEqual([...BRAND_DIY_WIDGETS].sort());
  });

  it('每个组件都有中文名、分组与默认属性', () => {
    for (const widget of BRAND_DIY_WIDGET_CATALOG) {
      expect(widget.name.length).toBeGreaterThan(0);
      expect(widget.groupLabel.length).toBeGreaterThan(0);
      expect(['base', 'goods', 'marketing', 'shop', 'assist']).toContain(
        widget.group,
      );
      expect(typeof widget.defaultProps).toBe('object');
    }
  });

  it('白名单外的类型一律拒绝，默认属性回空对象', () => {
    expect(isBrandWidget('goodsList')).toBe(true);
    expect(isBrandWidget('evilHtmlBlock')).toBe(false);
    expect(widgetDefaults('evilHtmlBlock')).toEqual({});
  });

  it('默认属性是副本，调用方改不动目录本身', () => {
    const first = widgetDefaults('goodsList');
    first.limit = 999;
    expect(widgetDefaults('goodsList').limit).not.toBe(999);
  });
});
