const diy = require("../../../utils/diy-render");
const navigate = require("../../../utils/navigate");

/** 搜索框：默认 disabled=true（编辑器初值），此时只作展示、点击不跳搜索页。 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    placeholder: "搜索商品",
    radius: 28,
    disabled: true,
  },
  attached() {
    const props = this.properties.props || {};
    this.setData({
      placeholder: diy.str(props.placeholder, "搜索商品"),
      radius: diy.numIn(props.radius, 0, 999, 28),
      disabled: diy.bool(props.disabled, true),
    });
  },
  methods: {
    onTap() {
      if (this.data.disabled) return;
      navigate.push("/pages/search/search");
    },
  },
});
