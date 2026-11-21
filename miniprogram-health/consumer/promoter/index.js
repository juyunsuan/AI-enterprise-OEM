const api = require("../../../utils/api");
const auth = require("../../../utils/auth");
const format = require("../../../utils/format");

Page({
  data: {
    loading: true,
    error: "",
    center: null,
    name: "",
    phone: "",
    applying: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true, error: "" });
    return auth
      .ensureLogin()
      .then(() => api.promoterCenter())
      .then((data) => {
        const center = data || {};
        if (center.promoter) {
          center.promoter.earningText = format.yuan(center.promoter.earningCents);
          center.promoter.settleableText = format.yuan(center.promoter.settleableCents);
          center.promoter.approved =
            center.promoter.auditStatus === "APPROVED";
        }
        const patch = { center: center, loading: false };
        if (
          center.promoter &&
          center.promoter.auditStatus === "REJECTED"
        ) {
          patch.name = center.promoter.name || "";
          patch.phone = center.promoter.phone || "";
        }
        this.setData(patch);
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "推广信息加载失败",
        });
      });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    const patch = {};
    patch[field] = event.detail.value;
    this.setData(patch);
  },

  apply() {
    const name = String(this.data.name || "").trim();
    if (!name) {
      wx.showToast({ title: "请填写你的称呼", icon: "none" });
      return;
    }
    if (this.data.applying) return;
    this.setData({ applying: true });
    api
      .promoterApply({ name: name, phone: String(this.data.phone || "").trim() })
      .then((data) => {
        this.setData({ applying: false });
        wx.showToast({ title: "已提交，等待审核", icon: "none" });
        this.setData({ center: data || null, name: "", phone: "" });
        this.load();
      })
      .catch((error) => {
        this.setData({ applying: false });
        wx.showToast({
          title: (error && error.message) || "提交失败",
          icon: "none",
        });
      });
  },

  previewPoster(event) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.previewImage({ urls: [url] });
  },

  onShareAppMessage(options) {
    const center = this.data.center || {};
    const promoter = center.promoter || {};
    const posters = center.posters || [];
    const id = Number(
      (options && options.target && options.target.dataset && options.target.dataset.id) || 0
    );
    let poster = null;
    for (let i = 0; i < posters.length; i += 1) {
      if (Number(posters[i].id) === id) poster = posters[i];
    }
    if (!poster) poster = posters[0] || null;
    const path =
      (poster && poster.sharePath) ||
      (promoter.code
        ? "/pages/index/index?promoter=" + encodeURIComponent(promoter.code)
        : "/pages/index/index");
    api.promoterShare(path).catch(function () {});
    const result = {
      title:
        (poster && poster.titleText) ||
        (center.shopName || "健康服务") + "，邀请你一起看",
      path: path,
    };
    if (poster && poster.background) result.imageUrl = poster.background;
    return result;
  },
});
