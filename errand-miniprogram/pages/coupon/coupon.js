const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: { loading: true, error: "", mine: [], available: [] },

  onShow() {
    this.load();
  },

  load() {
    this.setData({ loading: true, error: "" });
    Promise.all([
      auth.ensureLogin().then(() => api.myCoupons()),
      api.bootstrap(),
    ])
      .then(([mine, site]) => {
        this.setData({
          loading: false,
          mine: (mine || []).map((row) =>
            Object.assign({}, row, {
              valueText: row.type === "PERCENT" ? row.discountValue + "% 折扣" : "¥" + row.discountValue,
              minText: row.minAmount > 0 ? "满 ¥" + row.minAmount + " 可用" : "无门槛",
            })
          ),
          available: (site && site.coupons) || [],
        });
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "优惠券读取失败" });
      });
  },

  claim(event) {
    const id = Number(event.currentTarget.dataset.id);
    auth
      .ensureLogin()
      .then(() => api.claimCoupon(id))
      .then(() => {
        wx.showToast({ title: "领取成功" });
        this.load();
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "领取失败", icon: "none" }));
  },
});