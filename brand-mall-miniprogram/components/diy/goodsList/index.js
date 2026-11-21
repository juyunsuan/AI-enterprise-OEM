const api = require("../../../utils/api");
const diy = require("../../../utils/diy-render");
const format = require("../../../utils/format");
const navigate = require("../../../utils/navigate");

/**
 * 商品列表：装修里只存「数据源 + id」（source / categoryId / productIds），
 * 标题价格一律按 id 现查。缓存价格的话店主改价就得重新发一次装修，
 * 所以这个组件每次进页面都自己拉一次列表接口。
 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    items: [],
    columns: 2,
    cellStyle: "width:50%",
    isList: false,
    showTitle: true,
    showSubtitle: false,
    showPrice: true,
    showSales: true,
    loaded: false,
  },
  attached() {
    const props = this.properties.props || {};
    const columns = diy.numIn(props.columns, 1, 3, 2);
    const style = diy.str(props.style, "CARD");
    this.setData({
      isList: style === "LIST",
      columns: columns,
      cellStyle: "width:" + (100 / columns).toFixed(4) + "%",
      showTitle: diy.bool(props.showTitle, true),
      showSubtitle: diy.bool(props.showSubtitle, false),
      showPrice: diy.bool(props.showPrice, true),
      showSales: diy.bool(props.showSales, true),
    });
    this.load();
  },
  methods: {
    /** 按数据源拼查询条件：RECOMMEND 走热卖标，MANUAL 只能先取一页再按 id 过滤（后端暂无按 id 批量接口）。 */
    queryParams() {
      const props = this.properties.props || {};
      const source = diy.str(props.source, "RECOMMEND").toUpperCase();
      const limit = diy.numIn(props.limit, 1, 60, 10);
      const query = { pageSize: Math.min(50, limit), page: 1 };
      if (source === "CATEGORY") {
        query.categoryId = diy.num(props.categoryId, 0);
      } else if (source === "RECOMMEND") {
        query.tag = "isHot";
        query.sort = "SALES_DESC";
      } else if (source === "MANUAL") {
        query.pageSize = 50;
      }
      return { source: source, limit: limit, query: query, ids: diy.numbers(props.productIds) };
    },

    load() {
      const plan = this.queryParams();
      return api
        .products(plan.query)
        .then((data) => {
          let list = (data && data.list) || [];
          if (plan.source === "RECOMMEND" && list.length === 0) {
            // 店铺没打热卖标时退化成「按销量取一批」，首页不至于空一块。
            const fallback = Object.assign({}, plan.query);
            delete fallback.tag;
            return api.products(fallback);
          }
          return { list: list };
        })
        .then((data) => {
          let list = (data && data.list) || [];
          if (plan.source === "MANUAL" && plan.ids.length) {
            const map = new Map(list.map((row) => [row.id, row]));
            list = plan.ids.map((id) => map.get(id)).filter((row) => !!row);
          }
          this.setData({
            loaded: true,
            items: list.slice(0, plan.limit).map((row) => ({
              id: row.id,
              title: row.title,
              subtitle: row.subtitle,
              image: row.coverImage,
              priceText: format.money(row.price),
              originText: Number(row.marketPrice || 0) > Number(row.price || 0)
                ? format.money(row.marketPrice)
                : "",
              sales: row.sales,
            })),
          });
        })
        .catch(() => this.setData({ loaded: true, items: [] }));
    },

    onTap(event) {
      const id = event.currentTarget.dataset.id;
      if (id) navigate.goProduct(Number(id));
    },
  },
});
