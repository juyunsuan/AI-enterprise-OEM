const diy = require("../../../utils/diy-render");
const navigate = require("../../../utils/navigate");

/**
 * 底部导航组件：props.items 的字段与 app.json 的 tabBar 同构
 * （pagePath / text / iconPath / selectedIconPath），契约里就是这个形状。
 *
 * 顾客端本身有原生 tabBar，所以这个组件真正的用武之地是活动页/DIY 页里的
 * 「页面内底部导航」：路径同样过 PATH_ALIASES 映射，tab 页走 switchTab。
 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    items: [],
    active: 0,
  },
  attached() {
    const props = this.properties.props || {};
    let items = diy.list(props.items).map((item, index) => {
      const pagePath = diy.str(item.pagePath);
      return {
        key: "foot-" + index,
        text: diy.str(item.text, "导航"),
        icon: diy.str(item.iconPath),
        activeIcon: diy.str(item.selectedIconPath, diy.str(item.iconPath)),
        url: navigate.pageUrl({ type: "PAGE", path: pagePath }),
      };
    });
    if (!items.length) {
      items = [
        { key: "foot-default-0", text: "首页", icon: "", activeIcon: "", url: "/pages/index/index" },
        { key: "foot-default-1", text: "分类", icon: "", activeIcon: "", url: "/pages/category/category" },
        { key: "foot-default-2", text: "我的", icon: "", activeIcon: "", url: "/pages/me/me" },
      ];
    }
    let active = 0;
    const pages = getCurrentPages();
    if (pages.length) {
      const route = "/" + pages[pages.length - 1].route;
      items.forEach((item, index) => {
        if (item.url === route) active = index;
      });
    }
    this.setData({ items: items.slice(0, 5), active: active });
  },
  methods: {
    onTap(event) {
      const item = this.data.items[Number(event.currentTarget.dataset.index || 0)];
      if (item && item.url) navigate.push(item.url);
    },
  },
});
