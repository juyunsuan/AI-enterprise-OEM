const app = getApp();
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const fmt = require("../../utils/format");
const pay = require("../../utils/pay");

const EMPTY_PARTY = {
  name: "",
  mobile: "",
  province: "",
  city: "",
  district: "",
  address: "",
};

const MOBILE = /^1[3-9]\d{9}$/;

function trim(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

Page({
  data: {
    ready: false,
    error: "",
    needSite: false,
    themeColor: "#1f6feb",
    site: {},

    sender: Object.assign({}, EMPTY_PARTY),
    receiver: Object.assign({}, EMPTY_PARTY),

    itemName: "",
    weight: "",
    count: "1",
    length: "",
    width: "",
    height: "",
    insuredValue: "",

    insuranceEnabled: false,
    insuranceRateText: "",
    addressBook: true,
    pickupTime: true,
    pickupSlots: [],
    pickupSlot: "",
    pickupSlotIndex: -1,

    remark: "",
    protocolEnabled: true,
    protocolText: "",
    protocolOpen: false,
    agreed: false,

    quoting: false,
    quoteError: "",
    quotes: [],
    companyId: 0,
    selectedQuote: null,
    quoteStale: false,
    chargeWeightText: "",

    submitting: false,
  },

  onLoad() {
    const last = wx.getStorageSync("kuaidi_last_sender");
    if (last && typeof last === "object") {
      this.setData({ sender: Object.assign({}, EMPTY_PARTY, last) });
    }
  },

  onShow() {
    app.ensureReady().then((site) => {
      if (!site) {
        const needSite = !!app.globalData.needSite;
        this.setData({
          ready: false,
          needSite: needSite,
          error: needSite
            ? "请先在首页选择一个寄件点"
            : app.globalData.bootstrapError || "站点服务暂不可用",
        });
        return;
      }
      const rate = Number(site.insuranceRate) || 0;
      this.setData({
        ready: true,
        needSite: false,
        error: "",
        site: site,
        themeColor: site.themeColor || "#1f6feb",
        insuranceEnabled: !!site.insuranceEnabled,
        insuranceRateText: rate
          ? "费率 " + (rate * 100).toFixed(2).replace(/\.?0+$/, "") + "%，按声明价值计费"
          : "",
        addressBook: app.toggle("addressBook"),
        pickupTime: app.toggle("pickupTime"),
        pickupSlots: site.pickupSlots || [],
        protocolEnabled: !!site.protocolEnabled,
        protocolText: site.protocolText || "",
      });
    });

    const picked = app.globalData.pickedAddress;
    if (picked && picked.type && picked.party) {
      app.globalData.pickedAddress = null;
      const target = picked.type === "SENDER" ? "sender" : "receiver";
      this.setData({ [target]: Object.assign({}, EMPTY_PARTY, picked.party) });
      this.markQuoteStale();
    }
  },

  // ---------------------------------------------------------------- 表单输入

  onPartyInput(event) {
    const party = event.currentTarget.dataset.party;
    const field = event.currentTarget.dataset.field;
    const patch = {};
    patch[party + "." + field] = event.detail.value;
    this.setData(patch);
    if (field === "province") this.markQuoteStale();
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    const patch = {};
    patch[field] = event.detail.value;
    this.setData(patch);
    if (field === "weight" || field === "length" || field === "width" || field === "height" || field === "insuredValue") {
      this.markQuoteStale();
    }
  },

  onCountInput(event) {
    this.setData({ count: event.detail.value });
  },

  onSlotChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      pickupSlotIndex: index,
      pickupSlot: this.data.pickupSlots[index] || "",
    });
  },

  onAgreeChange(event) {
    this.setData({ agreed: event.detail.value.length > 0 });
  },

  openProtocol() {
    this.setData({ protocolOpen: true });
  },

  closeProtocol() {
    this.setData({ protocolOpen: false });
  },

  /** 重量/尺寸/收件省份一变，旧报价就不能再用；让顾客重新点一次报价，避免用错价下单。 */
  markQuoteStale() {
    if (!this.data.quotes.length) return;
    this.setData({ quoteStale: true });
  },

  chooseAddress(event) {
    const type = event.currentTarget.dataset.type;
    wx.navigateTo({ url: "/pages/address/list?mode=select&type=" + type });
  },

  // ---------------------------------------------------------------- 报价

  quote() {
    if (!this.data.ready) return;
    const weight = Number(this.data.weight);
    if (!(weight > 0)) {
      wx.showToast({ title: "请先填写物品重量", icon: "none" });
      return;
    }
    if (!trim(this.data.receiver.province)) {
      wx.showToast({ title: "请先填写收件省份，用于计算运费", icon: "none" });
      return;
    }
    this.setData({ quoting: true, quoteError: "" });
    api
      .quote({
        weightKg: weight,
        length: Number(this.data.length) || 0,
        width: Number(this.data.width) || 0,
        height: Number(this.data.height) || 0,
        insuredValue: this.data.insuranceEnabled ? Number(this.data.insuredValue) || 0 : 0,
        province: trim(this.data.receiver.province),
      })
      .then((result) => {
        const quotes = (result.quotes || []).map((item) => ({
          companyId: item.companyId,
          name: item.name,
          logo: item.logo,
          deliveryDays: item.deliveryDays,
          feeText: fmt.money(item.totalFee),
          baseText: fmt.money(item.baseFee),
          extraText: item.extraFee > 0 ? fmt.money(item.extraFee) : "",
          remoteText: item.remoteFee > 0 ? fmt.money(item.remoteFee) : "",
          insuranceText: item.insuranceFee > 0 ? fmt.money(item.insuranceFee) : "",
          remark: item.remark,
          remote: item.remote,
          totalFee: item.totalFee,
          chargeWeightKg: item.chargeWeightKg,
        }));
        const previous = this.data.companyId;
        const keep = quotes.filter((item) => item.companyId === previous)[0];
        const selected = keep || quotes[0] || null;
        this.setData({
          quoting: false,
          quotes: quotes,
          companyId: selected ? selected.companyId : 0,
          selectedQuote: selected,
          quoteStale: false,
          chargeWeightText:
            result.chargeWeightKg > 0
              ? "计费重量 " + result.chargeWeightKg + "kg"
              : "",
        });
        if (!quotes.length) {
          wx.showToast({ title: "暂无可用报价，请联系店方", icon: "none" });
        }
      })
      .catch((error) => {
        this.setData({ quoting: false, quoteError: error.message || "报价失败" });
      });
  },

  selectCompany(event) {
    const id = Number(event.currentTarget.dataset.id);
    const selected = this.data.quotes.filter((item) => item.companyId === id)[0];
    if (!selected) return;
    this.setData({ companyId: id, selectedQuote: selected });
  },

  // ---------------------------------------------------------------- 提交

  validate() {
    const sender = this.data.sender;
    const receiver = this.data.receiver;
    if (!trim(sender.name) || !MOBILE.test(trim(sender.mobile)) || !trim(sender.province) || !trim(sender.address)) {
      return "请完整填写寄件人姓名、11 位手机号和地址";
    }
    if (!trim(receiver.name) || !MOBILE.test(trim(receiver.mobile)) || !trim(receiver.province) || !trim(receiver.address)) {
      return "请完整填写收件人姓名、11 位手机号和地址";
    }
    if (!trim(this.data.itemName)) return "请填写物品名称";
    if (!(Number(this.data.weight) > 0)) return "请填写物品重量";
    if (!this.data.quotes.length || this.data.quoteStale) return "请先获取运费报价";
    if (!this.data.companyId) return "请选择快递公司";
    if (this.data.protocolEnabled && !this.data.agreed) return "请阅读并勾选寄件协议";
    return "";
  },

  submit() {
    if (this.data.submitting) return;
    const problem = this.validate();
    if (problem) {
      wx.showToast({ title: problem, icon: "none" });
      return;
    }
    this.setData({ submitting: true });
    const body = {
      companyId: this.data.companyId,
      sender: {
        name: trim(this.data.sender.name),
        mobile: trim(this.data.sender.mobile),
        province: trim(this.data.sender.province),
        city: trim(this.data.sender.city),
        district: trim(this.data.sender.district),
        address: trim(this.data.sender.address),
      },
      receiver: {
        name: trim(this.data.receiver.name),
        mobile: trim(this.data.receiver.mobile),
        province: trim(this.data.receiver.province),
        city: trim(this.data.receiver.city),
        district: trim(this.data.receiver.district),
        address: trim(this.data.receiver.address),
      },
      itemName: trim(this.data.itemName),
      itemWeightKg: Number(this.data.weight),
      itemCount: Math.max(1, Math.round(num(this.data.count, 1))),
      length: Number(this.data.length) || 0,
      width: Number(this.data.width) || 0,
      height: Number(this.data.height) || 0,
      insuredValue: this.data.insuranceEnabled ? Number(this.data.insuredValue) || 0 : 0,
      pickupSlot: this.data.pickupSlot || "",
      remark: trim(this.data.remark),
      agreed: !!this.data.agreed,
    };

    api
      .createOrder(body)
      .then((created) => {
        wx.setStorageSync("kuaidi_last_sender", body.sender);
        const mobile = body.sender.mobile;
        const goDetail = () => {
          wx.redirectTo({
            url:
              "/pages/order-detail/order-detail?orderNo=" +
              encodeURIComponent(created.orderNo) +
              "&mobile=" +
              encodeURIComponent(mobile),
          });
        };
        if (created.payParams) {
          pay
            .requestPayment(created.payParams)
            .then(() => {
              wx.showToast({ title: "支付成功", icon: "success" });
              setTimeout(goDetail, 600);
            })
            .catch((error) => {
              wx.showToast({
                title: error.cancelled ? "已取消支付，可在订单里继续付" : error.message,
                icon: "none",
              });
              setTimeout(goDetail, 900);
            })
            .then(() => this.setData({ submitting: false }));
          return;
        }
        this.setData({ submitting: false });
        wx.showModal({
          title: "下单成功",
          content: created.message || "订单已创建，请按店方提示付款取件",
          showCancel: false,
          success: goDetail,
        });
      })
      .catch((error) => {
        this.setData({ submitting: false });
        wx.showToast({ title: error.message || "下单失败", icon: "none" });
      });
  },

  noop() {},

  retry() {
    app.globalData.bootstrap = null;
    app.globalData.ready = null;
    this.onShow();
  },

  goPickSite() {
    app.goPickSite();
  },
});
