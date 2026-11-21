const api = require("../../../utils/api");
const auth = require("../../../utils/auth");
const diy = require("../../../utils/diy-render");
const format = require("../../../utils/format");
const navigate = require("../../../utils/navigate");

/**
 * 优惠券组件：装修里只存 couponIds，券面信息按 id 现查 /coupon/shop。
 * 公开接口一次返回全店在发的券（后端上限 50 张），所以选中的 id 在前端过滤，
 * 没指定 id 时取可领取的前几张兜底。
 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    items: [],
    isTwo: true,
    themeColor: "#fa3534",
  },
  attached() {
    const props = this.properties.props || {};
    const ctx = this.properties.ctx || {};
    const ids = diy.numbers(props.couponIds);
    this.setData({
      isTwo: diy.str(props.style, "TWO") === "TWO",
      themeColor: ctx.themeColor || "#fa3534",
    });
    api
      .shopCoupons()
      .then((rows) => {
        const all = rows || [];
        const map = {};
        all.forEach((row) => {
          map[row.id] = row;
        });
        const picked = ids.length
          ? ids.map((id) => map[id]).filter((row) => !!row)
          : all;
        this.setData({
          items: picked.slice(0, 8).map((row) => this.decorate(row)),
        });
      })
      .catch(() => this.setData({ items: [] }));
  },
  methods: {
    decorate(row) {
      return {
        id: row.id,
        name: row.name,
        valueText: format.couponValueText(row),
        ruleText: format.couponRuleText(row),
        received: false,
      };
    },

    onReceive(event) {
      const index = Number(event.currentTarget.dataset.index || 0);
      const item = this.data.items[index];
      if (!item || item.received) return;
      auth
        .ensureLogin()
        .then(() => api.receiveCoupon(item.id))
        .then(() => {
          const key = "items[" + index + "].received";
          const patch = {};
          patch[key] = true;
          this.setData(patch);
          wx.showToast({ title: "领取成功", icon: "none" });
        })
        .catch((error) => auth.showError(error));
    },

    goCenter() {
      navigate.push("/pages/coupon/list");
    },
  },
});
