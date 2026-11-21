const diy = require("../../../utils/diy-render");
const navigate = require("../../../utils/navigate");

/** 图片广告：mode=swiper 轮播，其余按顺序单列堆叠（与编辑器预览同一布局口径）。 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    swiper: true,
    interval: 4000,
    gutter: 16,
    boxStyle: "",
    items: [],
  },
  attached() {
    const props = this.properties.props || {};
    const height = diy.numIn(props.height, 40, 1200, 320);
    const radius = diy.numIn(props.radius, 0, 999, 12);
    const gutter = diy.numIn(props.gutter, 0, 99, 16);
    const cellStyle = "height:" + height + "rpx;border-radius:" + radius + "rpx";
    const items = diy
      .list(props.items)
      .filter((item) => diy.str(item.image))
      .map((item, index) => ({
        key: "ads-" + index,
        image: diy.str(item.image),
        link: diy.linkOf(item.link),
        style: cellStyle,
      }));
    this.setData({
      swiper: diy.str(props.mode, "swiper") === "swiper",
      interval: Math.max(1, diy.num(props.interval, 4)) * 1000,
      gutter: gutter,
      // swiper 元素本身必须有高度（否则轮播区高度为 0），高度 = 图片高 + 上下留白。
      boxStyle:
        "height:" + (height + gutter * 2) + "rpx;padding:" + gutter + "rpx",
      items: items.slice(0, 10),
    });
  },
  methods: {
    onTap(event) {
      const item = this.data.items[Number(event.currentTarget.dataset.index || 0)];
      if (item) navigate.open(item.link);
    },
  },
});
