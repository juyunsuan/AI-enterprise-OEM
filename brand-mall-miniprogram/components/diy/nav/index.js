const diy = require("../../../utils/diy-render");
const navigate = require("../../../utils/navigate");

/** 图标导航：columns 限定 2~6（与编辑器一致），每格宽度按列数换算成百分比。 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    items: [],
  },
  attached() {
    const props = this.properties.props || {};
    const columns = diy.numIn(props.columns, 2, 6, 4);
    const items = diy.list(props.items).map((item, index) => ({
      key: "nav-" + index,
      icon: diy.str(item.icon),
      text: diy.str(item.text, "导航"),
      link: diy.linkOf(item.link),
      style: "width:" + Math.floor((100 / columns) * 1000) / 1000 + "%",
    }));
    this.setData({ items: items.slice(0, 24) });
  },
  methods: {
    onTap(event) {
      const item = this.data.items[Number(event.currentTarget.dataset.index || 0)];
      if (item) navigate.open(item.link);
    },
  },
});
