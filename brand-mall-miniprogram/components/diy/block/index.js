/**
 * 装修组件派发器：把发布快照里的一个组件实例交给对应类型的渲染器。
 *
 * 小程序没有「按字符串动态取组件」的写法，只能用 wx:if 链显式列出 14 种类型；
 * 链尾兜底成可读文案，出现「未知组件」就说明组件目录（后端
 * brand.diy-widgets.ts）与端上实现脱节了，比静默渲染成空白好排查。
 */
Component({
  properties: {
    type: { type: String, value: "" },
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
});
