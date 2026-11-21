const api = require("../../utils/api");
const auth = require("../../utils/auth");

const TAGS = ["家", "公司", "学校"];

/** 地址编辑：省市区用小程序原生 region picker，不用手写、也不请求行政区划接口。 */
Page({
  data: {
    id: 0,
    realName: "",
    phone: "",
    region: [],
    regionText: "请选择省市区",
    detail: "",
    postalCode: "",
    isDefault: false,
    tag: "",
    tags: TAGS,
    saving: false,
    loading: false,
  },

  onLoad(query) {
    const id = Number(query.id || 0);
    if (!id) return;
    this.setData({ id: id, loading: true });
    auth
      .ensureLogin()
      .then(() => api.addresses())
      .then((rows) => {
        const hit = (rows || []).find((row) => row.id === id);
        if (!hit) {
          wx.showToast({ title: "地址不存在", icon: "none" });
          return;
        }
        this.setData({
          realName: hit.realName,
          phone: hit.phone,
          region: [hit.province, hit.city, hit.district],
          regionText: [hit.province, hit.city, hit.district].filter(Boolean).join(" ") || "请选择省市区",
          detail: hit.detail,
          postalCode: hit.postalCode || "",
          isDefault: !!hit.isDefault,
          tag: hit.tag || "",
          loading: false,
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field) return;
    const patch = {};
    patch[field] = event.detail.value;
    this.setData(patch);
  },

  onRegion(event) {
    const value = event.detail.value || [];
    this.setData({
      region: value,
      regionText: value.join(" ") || "请选择省市区",
    });
  },

  pickTag(event) {
    const tag = event.currentTarget.dataset.tag;
    if (!tag) return;
    // 同一个标签再点一次等于取消。
    this.setData({ tag: this.data.tag === tag ? "" : tag });
  },

  toggleDefault(event) {
    this.setData({ isDefault: !!event.detail.value });
  },

  /** 只靠前端校验挡不住空地址，但先挡一遍能少一次无谓请求与后端报错文案。 */
  validate() {
    if (!String(this.data.realName).trim()) return "请填写收货人";
    if (!/^1[0-9]{10}$/.test(String(this.data.phone).trim())) return "请填写正确的手机号";
    if (this.data.region.length !== 3) return "请选择省市区";
    if (!String(this.data.detail).trim()) return "请填写详细地址";
    return "";
  },

  save() {
    const message = this.validate();
    if (message) {
      wx.showToast({ title: message, icon: "none" });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });
    const body = {
      realName: String(this.data.realName).trim(),
      phone: String(this.data.phone).trim(),
      province: this.data.region[0] || "",
      city: this.data.region[1] || "",
      district: this.data.region[2] || "",
      detail: String(this.data.detail).trim(),
      postalCode: String(this.data.postalCode || "").trim(),
      isDefault: !!this.data.isDefault,
      tag: this.data.tag || "",
    };
    if (this.data.id) body.id = this.data.id;
    auth
      .ensureLogin()
      .then(() => api.saveAddress(body))
      .then(() => {
        this.setData({ saving: false });
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack({ fail() {} }), 600);
      })
      .catch((error) => {
        this.setData({ saving: false });
        auth.showError(error);
      });
  },

  remove() {
    if (!this.data.id) return;
    wx.showModal({
      title: "删除地址",
      content: "删除后不可恢复，确定吗？",
      success: (res) => {
        if (!res.confirm) return;
        api
          .removeAddress(this.data.id)
          .then(() => {
            wx.showToast({ title: "已删除", icon: "none" });
            setTimeout(() => wx.navigateBack({ fail() {} }), 600);
          })
          .catch((error) => auth.showError(error));
      },
    });
  },
});
