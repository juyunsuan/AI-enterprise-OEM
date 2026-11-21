const api = require("../../../utils/api");
const diy = require("../../../utils/diy-render");
const navigate = require("../../../utils/navigate");

/** 分类行：取一级分类横滑（契约里 /categories 返回的是分类树，一级就是根数组）。 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    items: [],
  },
  attached() {
    const limit = diy.numIn(
      (this.properties.props || {}).limit,
      1,
      12,
      10,
    );
    api
      .categories()
      .then((rows) => {
        this.setData({
          items: (rows || []).slice(0, limit).map((row) => ({
            id: row.id,
            name: row.name,
            image: row.image || row.icon,
          })),
        });
      })
      .catch(() => this.setData({ items: [] }));
  },
  methods: {
    onTap(event) {
      const dataset = event.currentTarget.dataset;
      navigate.goCategory(Number(dataset.id), dataset.name);
    },
  },
});
