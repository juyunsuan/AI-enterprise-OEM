const diy = require("../../../utils/diy-render");

/**
 * 富文本：编辑器写入前已按小程序 rich-text 白名单清洗过标签，
 * 这里直接把 HTML 串交给 nodes，不再二次解析（端上没有 DOM，任何解析都是多余的攻击面）。
 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    html: "",
  },
  attached() {
    const props = this.properties.props || {};
    this.setData({ html: diy.str(props.html).trim() });
  },
});
