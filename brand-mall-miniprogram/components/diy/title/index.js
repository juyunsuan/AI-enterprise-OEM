const diy = require("../../../utils/diy-render");

/** 标题分区：align 支持 left/center/right，与编辑器预览同一套口径。 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    main: "标题",
    sub: "",
    alignClass: "left",
    bold: true,
  },
  attached() {
    const props = this.properties.props || {};
    const align = diy.str(props.align, "left");
    this.setData({
      main: diy.str(props.main, "标题"),
      sub: diy.str(props.sub),
      alignClass: align === "center" || align === "right" ? align : "left",
      bold: diy.bool(props.bold, true),
    });
  },
});
