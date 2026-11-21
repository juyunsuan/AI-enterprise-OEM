const api = require("../../utils/api");
const auth = require("../../utils/auth");

const PHONE_RE = /^1[3-9]\d{9}$/;

Page({
  data: {
    loading: true,
    error: "",
    notReady: false,
    readyReason: "",
    id: 0,
    saving: false,
    tags: ["家", "公司"],
    locationText: "",
    lng: 0,
    lat: 0,
    cityId: 0,
    form: {
      contactName: "",
      phone: "",
      province: "",
      city: "",
      district: "",
      detail: "",
      houseNumber: "",
      tag: "",
      isDefault: false,
    },
  },

  onLoad(options) {
    const id = Number((options && options.id) || 0);
    this.setData({ id: id });
    wx.setNavigationBarTitle({ title: id ? "编辑地址" : "新增地址" });
    this.start();
  },

  start() {
    const app = getApp();
    app
      .ensureReady()
      .then((shop) => {
        if (!shop || !shop.shopCode) {
          this.setData({
            loading: false,
            notReady: true,
            readyReason: app.globalData.bootstrapError || "店铺尚未开通，请联系店铺方",
          });
          return null;
        }
        if (!this.data.id) {
          this.setData({ loading: false });
          return null;
        }
        return auth.ensureLogin().then(() => this.loadExisting());
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "登录失败，请重新进入小程序",
        });
      });
  },

  /** 没有单条地址接口，只能拉列表按 id 找这一条回填。 */
  loadExisting() {
    const id = this.data.id;
    return api
      .addresses()
      .then((data) => {
        const list = (data && data.list) || [];
        let row = null;
        for (let i = 0; i < list.length; i += 1) {
          if (Number(list[i].id) === id) {
            row = list[i];
            break;
          }
        }
        if (!row) {
          this.setData({ loading: false, error: "地址不存在，可能已被删除" });
          return;
        }
        const lng = Number(row.lng) || 0;
        const lat = Number(row.lat) || 0;
        this.setData({
          loading: false,
          lng: lng,
          lat: lat,
          cityId: Number(row.cityId) || 0,
          locationText: lng || lat ? "已保存地图坐标" : "",
          form: {
            contactName: row.contactName || "",
            phone: row.phone || "",
            province: row.province || "",
            city: row.city || "",
            district: row.district || "",
            detail: row.detail || "",
            houseNumber: "",
            tag: row.tag || "",
            isDefault: row.isDefault === true,
          },
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          error: (error && error.message) || "地址加载失败",
        });
      });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    const patch = {};
    patch["form." + field] = event.detail.value;
    this.setData(patch);
  },

  toggleDefault(event) {
    this.setData({ "form.isDefault": !!event.detail.value });
  },

  pickTag(event) {
    const tag = event.currentTarget.dataset.tag || "";
    this.setData({ "form.tag": this.data.form.tag === tag ? "" : tag });
  },

  /** 地图选点：拒绝授权或没有腾讯 key 时只提示，文字地址照常可保存。 */
  chooseLocation() {
    const self = this;
    wx.chooseLocation({
      success(res) {
        const patch = {
          lng: Number(res.longitude) || 0,
          lat: Number(res.latitude) || 0,
          locationText: res.name || res.address || "已选择地图位置",
        };
        if (!String(self.data.form.detail || "").trim() && res.address) {
          patch["form.detail"] = res.address + (res.name ? " " + res.name : "");
        }
        self.setData(patch);
      },
      fail(error) {
        const msg = (error && error.errMsg) || "";
        if (msg.indexOf("cancel") >= 0) return;
        self.setData({ locationText: "未取得定位或地图不可用，可继续填写文字地址" });
        wx.showToast({ title: "已降级为文字地址", icon: "none" });
      },
    });
  },

  save() {
    if (this.data.saving) return;
    const form = this.data.form;
    const contactName = String(form.contactName || "").trim();
    const phone = String(form.phone || "").trim();
    const detailBase = String(form.detail || "").trim();
    const houseNumber = String(form.houseNumber || "").trim();
    if (!contactName) {
      wx.showToast({ title: "请填写联系人", icon: "none" });
      return;
    }
    if (!PHONE_RE.test(phone)) {
      wx.showToast({ title: "请填写 11 位手机号", icon: "none" });
      return;
    }
    if (!detailBase) {
      wx.showToast({ title: "请填写详细地址", icon: "none" });
      return;
    }
    // 后端 addressBody 没有独立门牌号字段，门牌号并入 detail 一并提交
    const detail = houseNumber ? detailBase + " " + houseNumber : detailBase;
    const self = this;
    this.setData({ saving: true });
    auth
      .ensureLogin()
      .then(() =>
        api.saveAddress({
          id: this.data.id,
          contactName: contactName,
          phone: phone,
          province: String(form.province || "").trim(),
          city: String(form.city || "").trim(),
          district: String(form.district || "").trim(),
          detail: detail,
          lng: this.data.lng,
          lat: this.data.lat,
          cityId: this.data.cityId,
          tag: String(form.tag || "").trim(),
          isDefault: !!form.isDefault,
        }),
      )
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch((error) => {
        self.setData({ saving: false });
        wx.showModal({
          title: "保存失败",
          content: (error && error.message) || "请稍后重试",
          showCancel: false,
        });
      });
  },
});
