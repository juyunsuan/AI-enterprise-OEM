const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");
const format = require("../../utils/format");
const labels = require("../../utils/labels");
const pay = require("../../utils/pay");

const CONSULT_WAYS = {
  CONSULT_TEXT: "TEXT",
  CONSULT_PHONE: "PHONE",
  CONSULT_VIDEO: "VIDEO",
};

const NEED_TYPES = [
  { key: "OUTPATIENT", label: "门诊绿通" },
  { key: "EXAM", label: "检查加急" },
  { key: "HOSPITAL", label: "住院安排" },
  { key: "OPERATION", label: "手术快约" },
];

const today = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
};

Page({
  data: {
    loading: true,
    submitting: false,
    service: null,
    bizLabel: "",
    consultWay: "",
    isGreen: false,
    needsPatient: false,
    practitioners: [],
    practitionerId: 0,
    patients: [],
    patientNames: [],
    patientIndex: -1,
    patientId: 0,
    days: [],
    day: "",
    slots: [],
    slotId: 0,
    slotText: "",
    consult: { symptomText: "", contactPhone: "", appointDate: "", appointTime: "09:00" },
    green: { needType: "OUTPATIENT", targetHospital: "", symptoms: "", contactPhone: "" },
    needTypes: NEED_TYPES,
    needTypeLabels: NEED_TYPES.map((item) => item.label),
    needTypeLabel: NEED_TYPES[0].label,
    today: today(),
    remark: "",
    quote: null,
    payText: "",
    flowTexts: [],
  },

  onLoad(options) {
    this.serviceId = Number(options.serviceId || options.id) || 0;
    this.practitionerId = Number(options.practitionerId) || 0;
    this.load();
  },

  onShow() {
    if (this.loaded) this.reloadPatients();
  },

  async load() {
    try {
      await auth.requireLogin();
      const [service, patients] = await Promise.all([
        api.serviceDetail(this.serviceId),
        api.patients(),
      ]);
      this.loaded = true;
      const bizType = String((service && service.bizType) || "");
      const consultWay = CONSULT_WAYS[bizType] || "";
      const practitioners = ((service && service.practitioners) || []).map((item) => ({
        ...item,
        roleLabel: labels.pick(
          { DOCTOR: "医生", MANAGER: "健管师", PHARMACIST: "药师", GUIDE: "导诊师" },
          item.role,
        ),
        priceText: format.yuan(item.priceCents),
      }));
      let practitionerId = this.practitionerId;
      if (!practitionerId && practitioners.length) practitionerId = practitioners[0].id;
      const list = patients || [];
      const latest = session.getPatientId();
      let patientIndex = list.findIndex((row) => row.id === latest);
      if (patientIndex < 0) patientIndex = list.findIndex((row) => row.isDefault);
      if (patientIndex < 0 && list.length) patientIndex = 0;
      const patientId = patientIndex >= 0 ? list[patientIndex].id : 0;
      this.setData({
        loading: false,
        service,
        bizLabel: labels.pick(labels.BIZ_LABELS, bizType),
        consultWay,
        isGreen: bizType === "GREEN",
        needsPatient:
          Boolean(service && service.needPatient) ||
          Boolean(consultWay) ||
          bizType === "GREEN",
        practitioners,
        practitionerId,
        patients: list,
        patientNames: list.map((row) => row.name + (row.relation ? "（" + labels.pick(labels.PATIENT_RELATION_LABELS, row.relation) + "）" : "")),
        patientIndex,
        patientId,
        consult: {
          ...this.data.consult,
          contactPhone: (list[patientIndex] && list[patientIndex].phone) || "",
        },
      });
      wx.setNavigationBarTitle({ title: bizType.indexOf("CONSULT_") === 0 ? "问诊预约" : "预约下单" });
      if (service && service.needSlot) this.loadDays();
      this.refreshPreview();
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || "加载失败", icon: "none" });
    }
  },

  async reloadPatients() {
    try {
      const list = (await api.patients()) || [];
      const index = list.findIndex((row) => row.id === this.data.patientId);
      this.setData({
        patients: list,
        patientNames: list.map((row) => row.name),
        patientIndex: index,
        patientId: index >= 0 ? list[index].id : 0,
      });
    } catch (error) {
      /* 返回页面时刷新失败不打扰用户 */
    }
  },

  async loadDays() {
    try {
      const rows = await api.slotDays({
        serviceId: this.serviceId,
        practitionerId: this.data.practitionerId,
        from: "",
      });
      const days = (rows || []).map((row) => ({
        ...row,
        label: format.dayLabel(row.day),
        priceText: row.minPriceCents > 0 ? format.yuan(row.minPriceCents) : "",
      }));
      const firstOpen = days.find((row) => !row.soldOut);
      this.setData({ days, day: firstOpen ? firstOpen.day : "" });
      if (firstOpen) this.loadTimeline(firstOpen.day);
      else this.setData({ slots: [], slotId: 0, slotText: "" });
    } catch (error) {
      wx.showToast({ title: error.message || "号源加载失败", icon: "none" });
    }
  },

  async loadTimeline(day) {
    try {
      const rows = await api.slotTimeline({
        day,
        serviceId: this.serviceId,
        practitionerId: this.data.practitionerId,
      });
      this.setData({
        slots: (rows || [])
          .filter((row) => row.status === "AVAILABLE" && row.remaining > 0)
          .map((row) => ({
            ...row,
            priceText: format.yuan(row.priceCents),
            label: row.startTime + "-" + row.endTime,
            doctorLabel: row.practitionerName + (row.practitionerTitle ? " " + row.practitionerTitle : ""),
          })),
        slotId: 0,
        slotText: "",
      });
    } catch (error) {
      wx.showToast({ title: error.message || "时段加载失败", icon: "none" });
    }
  },

  onDay(e) {
    const day = e.currentTarget.dataset.day;
    if (!day || e.currentTarget.dataset.sold || day === this.data.day) return;
    this.setData({ day });
    this.loadTimeline(day);
  },

  onSlot(e) {
    const slotId = Number(e.currentTarget.dataset.id) || 0;
    const slot = this.data.slots.find((row) => row.id === slotId);
    this.setData({
      slotId,
      slotText: slot ? this.data.day + " " + slot.label + " · " + slot.doctorLabel : "",
    });
  },

  onPractitioner(e) {
    const practitionerId = Number(e.currentTarget.dataset.id) || 0;
    if (practitionerId === this.data.practitionerId) return;
    this.setData({ practitionerId, slotId: 0, slotText: "" });
    if (this.data.service && this.data.service.needSlot) this.loadDays();
    this.refreshPreview();
  },

  onPatient(e) {
    const index = Number(e.detail.value);
    const patient = this.data.patients[index];
    if (!patient) return;
    session.setPatientId(patient.id);
    this.setData({
      patientIndex: index,
      patientId: patient.id,
      "consult.contactPhone": this.data.consult.contactPhone || patient.phone || "",
    });
    this.refreshPreview();
  },

  onAddPatient() {
    wx.navigateTo({ url: "/consumer/patient/edit" });
  },

  onConsultInput(e) {
    this.setData({ ["consult." + e.currentTarget.dataset.field]: e.detail.value });
  },

  onConsultDate(e) {
    this.setData({ "consult.appointDate": e.detail.value });
  },

  onConsultTime(e) {
    this.setData({ "consult.appointTime": e.detail.value });
  },

  onGreenInput(e) {
    this.setData({ ["green." + e.currentTarget.dataset.field]: e.detail.value });
  },

  onNeedType(e) {
    const item = NEED_TYPES[Number(e.detail.value)] || NEED_TYPES[0];
    this.setData({ "green.needType": item.key, needTypeLabel: item.label });
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value });
  },

  buildInput() {
    const bizType = this.data.service.bizType;
    const practitionerId = this.data.practitionerId || 0;
    const patientId = this.data.patientId || 0;
    const items = [
      {
        itemType: bizType === "EXAM" ? "EXAM" : "SERVICE",
        refId: this.serviceId,
        quantity: 1,
        skuId: 0,
        patientId: patientId,
        practitionerId: practitionerId,
      },
    ];
    const consult = this.data.consultWay
      ? {
          patientId,
          practitionerId,
          symptomText: this.data.consult.symptomText,
          attachments: [],
          contactPhone: this.data.consult.contactPhone,
          appointAt: this.data.consult.appointDate
            ? this.data.consult.appointDate + " " + this.data.consult.appointTime
            : "",
          meetingUrl: "",
        }
      : null;
    const green = this.data.isGreen
      ? {
          patientId,
          kind: this.data.green.needType === "OPERATION" ? "OPERATION" : "GREEN",
          hospitalId: 0,
          departmentId: 0,
          targetHospital: this.data.green.targetHospital,
          targetDepartment: "",
          needType: this.data.green.needType,
          urgency: "",
          demandAt: "",
          symptoms: this.data.green.symptoms,
          files: [],
          contactPhone: this.data.green.contactPhone || this.data.consult.contactPhone,
        }
      : null;
    return {
      orderType: bizType,
      items,
      slotId: this.data.slotId || 0,
      addressId: 0,
      couponTicketId: 0,
      usePoints: 0,
      remark: this.data.remark,
      receiver: { name: "", phone: "", address: "" },
      consult,
      green,
    };
  },

  async refreshPreview() {
    if (!this.data.service) return;
    if (this.data.needsPatient && !this.data.patientId) return;
    if (this.data.service.needSlot && !this.data.slotId) return;
    try {
      const res = await api.previewOrder(this.buildInput());
      const quote = (res && res.quote) || null;
      this.setData({
        quote,
        payText: quote ? format.yuan(quote.payCents) : "",
        flowTexts: quote
          ? quote.flows.map((flow) => ({
              label: flow.label,
              amount: (flow.amountCents < 0 ? "-" : "") + format.money(Math.abs(flow.amountCents)),
            }))
          : [],
      });
    } catch (error) {
      /* 试算失败在提交时再提示，避免输入过程中反复弹窗 */
    }
  },

  async onSubmit() {
    if (this.data.submitting) return;
    if (this.data.needsPatient && !this.data.patientId) {
      wx.showToast({ title: "请先选择就诊人", icon: "none" });
      return;
    }
    if (this.data.service.needSlot && !this.data.slotId) {
      wx.showToast({ title: "请选择预约时间", icon: "none" });
      return;
    }
    if (this.data.consultWay) {
      if (!this.data.consult.symptomText.trim()) {
        wx.showToast({ title: "请简要描述症状", icon: "none" });
        return;
      }
      if (!this.data.consult.contactPhone.trim()) {
        wx.showToast({ title: "请填写联系电话", icon: "none" });
        return;
      }
      if (this.data.consultWay !== "TEXT" && !this.data.consult.appointDate) {
        wx.showToast({ title: "请选择期望时间", icon: "none" });
        return;
      }
    }
    if (this.data.isGreen && !this.data.green.targetHospital.trim()) {
      wx.showToast({ title: "请填写目标医院", icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    try {
      const input = this.buildInput();
      const preview = await api.previewOrder(input);
      const quote = (preview && preview.quote) || null;
      if (quote && quote.payCents > 0) {
        const ok = await new Promise((resolve) => {
          wx.showModal({
            title: "确认下单",
            content: "应付 " + format.yuan(quote.payCents) + "，提交后请在订单页完成支付。",
            confirmText: "提交订单",
            success: (res) => resolve(res.confirm),
          });
        });
        if (!ok) {
          this.setData({ submitting: false });
          return;
        }
      }
      const created = await api.createOrder(input);
      const orderId = (created && created.id) || 0;
      const result = await pay.payOrder(orderId);
      if (!result.paid && result.reason && result.reason !== "已取消支付") {
        wx.showToast({ title: result.reason, icon: "none", duration: 2500 });
      }
      this.setData({ submitting: false });
      wx.redirectTo({ url: "/consumer/order/detail?id=" + orderId });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "下单失败", icon: "none" });
      this.setData({ submitting: false });
    }
  },
});
