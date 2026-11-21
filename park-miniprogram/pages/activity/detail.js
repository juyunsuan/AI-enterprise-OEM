const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");

Page({
  data: {
    id: 0,
    loading: true,
    activity: null,
    signup: null,
    name: "",
    phone: "",
    note: "",
    submitting: false,
  },

  onLoad(options) {
    const customer = session.getCustomer();
    this.setData({
      id: Number(options.id || 0),
      name: customer.nickname || "",
      phone: customer.phone || "",
    });
    this.load();
  },

  load() {
    if (!this.data.id) return;
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() =>
        Promise.all([api.activityDetail(this.data.id), api.activityMy()]),
      )
      .then(([activity, mine]) => {
        const signup = (Array.isArray(mine) ? mine : []).find(
          (item) => item.activity && item.activity.id === this.data.id,
        );
        this.setData({
          loading: false,
          activity,
          signup: signup ? signup.signup : null,
        });
      })
      .catch((error) => {
        this.setData({ loading: false });
        wx.showToast({
          title: (error && error.message) || "读取失败",
          icon: "none",
        });
      });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  signup() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    api
      .activitySignup(
        this.data.id,
        this.data.name,
        this.data.phone,
        this.data.note,
      )
      .then(() => {
        wx.showToast({ title: "报名成功", icon: "success" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "报名失败",
          icon: "none",
        }),
      )
      .then(() => this.setData({ submitting: false }));
  },

  cancel() {
    api
      .activityCancel(this.data.id)
      .then(() => {
        wx.showToast({ title: "已取消报名", icon: "success" });
        this.load();
      })
      .catch((error) =>
        wx.showToast({
          title: (error && error.message) || "取消失败",
          icon: "none",
        }),
      );
  },
});
