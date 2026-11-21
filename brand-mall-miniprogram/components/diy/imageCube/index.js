const diy = require("../../../utils/diy-render");
const navigate = require("../../../utils/navigate");

/**
 * 图片魔方：layout=FOUR 是 2×2 四宫格（格子高 240rpx），TWO 是一行两栏（高 300rpx）。
 * 高度与间距都是设计稿 rpx，和编辑器预览口径一致，所以装修所见即所得。
 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    rows: [],
  },
  attached() {
    const props = this.properties.props || {};
    const isFour = diy.str(props.layout, "FOUR") === "FOUR";
    const total = isFour ? 4 : 2;
    const cellHeight = isFour ? 240 : 300;
    const gutter = diy.numIn(props.gutter, 0, 99, 8);
    const radius = diy.numIn(props.radius, 0, 999, 8);
    const source = diy.list(props.items);
    const rows = [];
    for (let index = 0; index < total; index += 2) {
      const row = [];
      for (let slot = 0; slot < 2; slot += 1) {
        const item = source[index + slot] || {};
        row.push({
          key: "cube-" + (index + slot),
          image: diy.str(item.image),
          link: diy.linkOf(item.link),
          // 行内只在非末格加间距，最后一格靠容器 padding 收边，避免整行右偏。
          style:
            "height:" +
            cellHeight +
            "rpx;border-radius:" +
            radius +
            "rpx;" +
            (slot === 0 ? "margin-right:" + gutter + "rpx;" : ""),
        });
      }
      rows.push({
        key: "cube-row-" + index,
        cells: row,
        style: "margin-bottom:" + gutter + "rpx",
      });
    }
    this.setData({ rows: rows, gutter: gutter });
  },
  methods: {
    onTap(event) {
      const dataset = event.currentTarget.dataset;
      const row = this.data.rows[Number(dataset.row || 0)];
      const cell = row && row.cells[Number(dataset.cell || 0)];
      if (cell && cell.image) navigate.open(cell.link);
    },
  },
});
