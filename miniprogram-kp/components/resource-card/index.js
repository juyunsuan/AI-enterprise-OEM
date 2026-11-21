/**
 * 资源卡片组件：列表页、搜索页、收藏页共用一种「封面 + 标题 + 权限标签 + 浏览数」的横排卡片。
 * 点击事件由父页面在组件标签上监听（tap 会冒泡），组件本身不做事，方便各页决定跳哪。
 */
Component({
  properties: {
    // 由 utils/format.js 的 decorateResource/decorateList 预处理过的对象。
    item: {
      type: Object,
      value: {},
    },
  },
});
