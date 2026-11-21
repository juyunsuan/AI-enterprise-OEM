const diy = require("../../../utils/diy-render");

/** 公告栏：speed 是设计稿里的滚动像素/秒，按文案长度折算动画时长。 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    text: "",
    icon: "",
    duration: 12,
  },
  attached() {
    const props = this.properties.props || {};
    const text = diy.str(props.text);
    const speed = Math.max(10, diy.num(props.speed, 60));
    // 文案宽度约 每字 26rpx，加上一屏 750rpx 的位移量，除以速度得到秒数。
    const distance = 750 + text.length * 26;
    this.setData({
      text: text,
      icon: diy.str(props.icon),
      duration: Math.max(6, Math.round(distance / speed)),
    });
  },
});
