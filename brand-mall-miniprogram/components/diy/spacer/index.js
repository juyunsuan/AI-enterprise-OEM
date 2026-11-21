const diy = require("../../../utils/diy-render");

/** 留白/辅助线：height 直接是 rpx（设计稿口径），color 支持 transparent。 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    style: "height:24rpx;background:transparent",
  },
  attached() {
    const props = this.properties.props || {};
    const height = diy.numIn(props.height, 0, 400, 12);
    const color = diy.str(props.color, "transparent") || "transparent";
    this.setData({ style: "height:" + height + "rpx;background:" + color });
  },
});
