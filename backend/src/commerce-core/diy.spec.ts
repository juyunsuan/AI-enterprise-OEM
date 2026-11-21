import {
  DIY_LIMITS,
  diyUnknownTypes,
  diyWidgetTypes,
  normalizeDiyLink,
  normalizeDiyPage,
  type DiyWidgetDescriptor,
} from './diy';

const catalog: DiyWidgetDescriptor[] = [
  {
    type: 'imageAds',
    name: '图片广告',
    group: 'base',
    defaultProps: { mode: 'swiper', height: 320, items: [] },
  },
  {
    type: 'goodsList',
    name: '商品列表',
    group: 'goods',
    defaultProps: { layout: 'TWO', productIds: [] },
  },
];

describe('commerce-core/diy 页面树校验', () => {
  it('未知组件被忽略并逐条说明，白名单与业务目录一一对应', () => {
    expect(diyWidgetTypes(catalog)).toEqual(['imageAds', 'goodsList']);
    const result = normalizeDiyPage(
      [
        { type: 'seckill', props: {} },
        { type: '', props: {} },
        { type: 'imageAds', props: { height: 200 } },
      ],
      catalog,
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[1]).toContain('未知组件「空」');
  });

  it('属性合并保留组件初值，商品列表只存 id 不存快照', () => {
    const result = normalizeDiyPage(
      [
        { type: 'imageAds', props: { height: 200 } },
        { type: 'goodsList', props: { productIds: [7, 8] } },
      ],
      catalog,
    );
    expect(result.nodes[0].props).toEqual({
      mode: 'swiper',
      height: 200,
      items: [],
    });
    expect(result.nodes[1].props).toEqual({
      layout: 'TWO',
      productIds: [7, 8],
    });
  });

  it('items 超上限截取并提示，其它数组属性不受影响', () => {
    const items = Array.from(
      { length: DIY_LIMITS.maxItems + 3 },
      (_unused, index) => ({
        image: `${index}`,
      }),
    );
    const result = normalizeDiyPage(
      [{ type: 'imageAds', props: { items } }],
      catalog,
    );
    expect((result.nodes[0].props.items as unknown[]).length).toBe(
      DIY_LIMITS.maxItems,
    );
    expect(result.errors[0]).toContain('已截取');
    const longIds = Array.from({ length: 30 }, (_unused, index) => index);
    const list = normalizeDiyPage(
      [{ type: 'goodsList', props: { productIds: longIds } }],
      catalog,
    );
    expect((list.nodes[0].props.productIds as number[]).length).toBe(30);
  });

  it('组件数超限默认截断，发布自检模式下逐条报错', () => {
    const heavy = Array.from({ length: DIY_LIMITS.maxWidgets + 5 }, () => ({
      type: 'imageAds',
      props: {},
    }));
    const trimmed = normalizeDiyPage(heavy, catalog);
    expect(trimmed.nodes).toHaveLength(DIY_LIMITS.maxWidgets);
    expect(trimmed.errors).toHaveLength(0);
    const rejected = normalizeDiyPage(heavy, catalog, { overflow: 'REJECT' });
    expect(rejected.nodes).toHaveLength(DIY_LIMITS.maxWidgets);
    expect(rejected.errors).toEqual([
      `单个页面最多 ${DIY_LIMITS.maxWidgets} 个组件`,
    ]);
  });

  it('非数组入参与未知类型统计都不会抛异常', () => {
    expect(normalizeDiyPage(null, catalog)).toEqual({ nodes: [], errors: [] });
    expect(
      diyUnknownTypes([{ type: 'live' }, { type: 'nav' }], catalog),
    ).toEqual(['live', 'nav']);
  });
});

describe('commerce-core/diy 链接归一化', () => {
  it('只接受站内绝对路径，外部链接一律清空', () => {
    expect(
      normalizeDiyLink({ type: 'PRODUCT', path: '/pages/goods/detail?id=1' })
        .path,
    ).toBe('/pages/goods/detail?id=1');
    expect(normalizeDiyLink({ path: 'https://evil.example.com' }).path).toBe(
      '',
    );
    expect(normalizeDiyLink('oops')).toEqual({
      type: 'NONE',
      name: '',
      path: '',
      targetId: '',
    });
  });

  it('标题与目标 id 按上限截断', () => {
    const link = normalizeDiyLink({
      type: 'PAGE',
      name: '长'.repeat(80),
      path: `/p/${'x'.repeat(300)}`,
      targetId: '9'.repeat(100),
    });
    expect(link.name).toHaveLength(DIY_LIMITS.maxTitleLength);
    expect(link.path).toHaveLength(200);
    expect(link.targetId).toHaveLength(64);
  });
});
