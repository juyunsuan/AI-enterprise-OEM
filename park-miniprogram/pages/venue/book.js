const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");

Page({
  data: {
    id: 0,
    loading: true,
    resource: null,
    slots: [],
    slotId: 0,
    isEquipment: false,
    quantity: 1,
    startDate: "",
    endDate: "",
    startTime: "09:00",
    endTime: "18:00",
    purpose: "",
    note: "",
    submitting: false,
  },

  onLoad(options) {
    this.setData({ id: Number(options.id || 0) });
    this.load();
  },

  load() {
    if (!this.data.id) return;
    this.setData({ loading: true });
    auth
      .ensureLogin()
      .then(() => api.resourceDetail(this.data.id))
      .then((resource) => {
        const today = new Date();
        const fmt = (value) =>
          `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
            value.getDate(),
          ).padStart(2, "0")}`;
        this.setData({
          loading: false,
          resource,
          slots: (resource && resource.slots) || [],
          isEquipment: Boolean(resource && resource.kind === "EQUIPMENT"),
          startDate: fmt(today),
          endDate: fmt(today),
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

  pickSlot(event) {
    this.setData({ slotId: Number(event.currentTarget.dataset.id) });
  },

  onPicker(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  submit() {
    if (this.data.submitting) return;
    const customer = session.getCustomer();
    if (this.data.isEquipment) {
      if (!this.data.startDate || !this.data.endDate) {
        wx.showToast({ title: "请选择租赁日期", icon: "none" });
        return;
      }
      this.setData({ submitting: true });
      auth
        .ensureLogin()
        .then(() =>
          api.createReservation({
            kind: "EQUIPMENT",
            resourceId: this.data.resource.id,
            quantity: Number(this.data.quantity) || 1,
            startAt: `${this.data.startDate}T${this.data.startTime}:00+08:00`,
            endAt: `${this.data.endDate}T${this.data.endTime}:00+08:00`,
            visitorName: customer.nickname || "园区用户",
            visitorPhone: customer.phone || "",
            purpose: this.data.purpose,
            note: this.data.note,
          }),
        )
        .then(() => {
          wx.showToast({ title: "已提交，等待审批", icon: "success" });
          setTimeout(() => wx.navigateTo({ url: "/pages/visitor/list" }), 600);
        })
        .catch((error) => {
          wx.showToast({
            title: (error && error.message) || "提交失败",
            icon: "none",
          });
        })
        .then(() => this.setData({ submitting: false }));
      return;
    }
    if (!this.data.slotId) {
      wx.showToast({ title: "请选择时段", icon: "none" });
      return;
    }
    const slot = (this.data.slots || []).find(
      (item) => item.id === this.data.slotId,
    );
    if (!slot) return;
    this.setData({ submitting: true });
    auth
      .ensureLogin()
      .then(() =>
        api.createReservation({
          kind: this.data.resource.kind,
          resourceId: this.data.resource.id,
          slotId: slot.id,
          visitorName: customer.nickname || "园区用户",
          visitorPhone: customer.phone || "",
          startAt: slot.startAt,
          endAt: slot.endAt,
          purpose: this.data.purpose,
          note: this.data.note,
        }),
      )
      .then(() => {
        wx.showToast({ title: "已提交，等待审批", icon: "success" });
        setTimeout(() => wx.switchTab({ url: "/pages/visitor/list" }), 600);
      })
      .catch((error) => {
        wx.showToast({
          title: (error && error.message) || "提交失败",
          icon: "none",
        });
      })
      .then(() => this.setData({ submitting: false }));
  },
});
