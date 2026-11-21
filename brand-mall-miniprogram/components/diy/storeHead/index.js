const diy = require("../../../utils/diy-render");

/**
 * 店铺头部：数据全部来自 bootstrap（店名/Logo/一句话简介/客服电话）。
 * 契约里没有「关注店铺」和店铺评分的 C 端接口，所以这里只呈现已有字段，
 * 不摆一个点了没反应的假按钮。
 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    showLogo: true,
    showSlogan: true,
    showPhone: true,
    shop: { name: "商城", logo: "", slogan: "", servicePhone: "" },
  },
  attached() {
    const props = this.properties.props || {};
    const ctx = this.properties.ctx || {};
    this.setData({
      showLogo: diy.bool(props.showLogo, true),
      showSlogan: diy.bool(props.showSlogan, true),
      showPhone: diy.bool(props.showPhone, true),
      shop: ctx.shop || this.data.shop,
    });
  },
  methods: {
    callShop() {
      const phone = (this.data.shop.servicePhone || "").trim();
      if (!phone) {
        wx.showToast({ title: "商家未填写客服电话", icon: "none" });
        return;
      }
      wx.makePhoneCall({ phoneNumber: phone, fail() {} });
    },
  },
});
