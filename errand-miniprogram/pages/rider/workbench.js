const api = require("../../utils/api");
const auth = require("../../utils/auth");
const session = require("../../utils/session");
const fmt = require("../../utils/format");

const app = getApp();

const STATUS = {
  ACCEPTED: "已接单",
  PICKED_UP: "已取件",
  DELIVERING: "配送中",
  ARRIVED: "已送达",
};

const NEXT = {
  ACCEPTED: { action: "PICKUP", label: "已取件" },
  PICKED_UP: { action: "DELIVER", label: "开始配送" },
  DELIVERING: { action: "ARRIVE", label: "已送达" },
  ARRIVED: { action: "COMPLETE", label: "完成订单" },
};

function decorate(list) {
  return (list || []).map((row) =>
    Object.assign({}, row, {
      statusText: STATUS[row.status] || row.status,
      typeText: row.serviceType === "BUY" ? "帮我买" : "帮我送",
      next: NEXT[row.status] || null,
      timeText: fmt.time(row.createdAt),
    })
  );
}

Page({
  data: {
    hasToken: false,
    loading: false,
    error: "",
    profile: null,
    pending: [],
    active: [],
    completedToday: 0,
    incomeToday: 0,
    withdrawals: [],
    incomes: [],
    withdrawAmount: "",
    bankInfo: "",
    cards: [],
    cardIndex: 0,
    cardHolder: "",
    cardBank: "",
    cardNo: "",
    cardDefault: true,
    showCardForm: false,
    location: null,
    markers: [],
  },

  onShow() {
    const hasToken = !!session.getRiderToken();
    this.setData({ hasToken: hasToken });
    if (hasToken) {
      this.load();
      this.startLocation();
      this.requestSubscribe();
    }
  },

  onHide() {
    if (this.locationTimer) clearInterval(this.locationTimer);
  },

  requestSubscribe() {
    const templates = (app.bootstrap() && app.bootstrap().templates) || {};
    const ids = [templates.help, templates.accept].filter(Boolean);
    if (!ids.length) return;
    wx.requestSubscribeMessage({ tmplIds: ids.slice(0, 3), complete: () => {} });
  },

  startLocation() {
    if (this.locationTimer) clearInterval(this.locationTimer);
    const report = () => {
      wx.getLocation({
        type: "gcj02",
        success: (result) => {
          const location = { lng: result.longitude, lat: result.latitude };
          this.setData({
            location: location,
            markers: [
              {
                id: 1,
                longitude: location.lng,
                latitude: location.lat,
                width: 24,
                height: 24,
                callout: { content: "我的位置", display: "BYCLICK" },
              },
            ],
          });
          api.riderLocation(location.lng, location.lat).catch(() => {});
        },
      });
    };
    report();
    this.locationTimer = setInterval(report, 60_000);
  },

  load() {
    this.setData({ loading: true, error: "" });
    Promise.all([
      api.riderWorkbench(),
      api.riderWithdrawals(),
      api.riderBankCards(),
      api.riderIncomes(),
    ])
      .then(([work, withdrawals, cards, incomes]) => {
        const list = cards || [];
        this.setData({
          loading: false,
          profile: work.rider,
          pending: decorate(work.pendingOrders),
          active: decorate(work.activeOrders),
          completedToday: work.completedToday,
          incomeToday: work.incomeToday,
          withdrawals: withdrawals || [],
          incomes: incomes || [],
          cards: list,
          cardIndex: Math.max(0, list.findIndex((item) => item.isDefault)),
        });
      })
      .catch((error) => {
        if (error && error.status === 401) session.clearRider();
        this.setData({
          loading: false,
          hasToken: !!session.getRiderToken(),
          error: (error && error.message) || "工作台读取失败",
        });
      });
  },

  login() {
    auth
      .ensureRiderLogin(true)
      .then(() => {
        this.setData({ hasToken: true });
        this.load();
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "登录失败", icon: "none" }));
  },

  goRegister() {
    wx.navigateTo({ url: "/pages/rider/register" });
  },

  toggleOnline(event) {
    const online = !!event.detail.value;
    api
      .riderOnline(online, this.data.profile ? this.data.profile.serviceTypes : ["SEND", "BUY"])
      .then((profile) => this.setData({ profile: profile }))
      .catch((error) => wx.showToast({ title: (error && error.message) || "切换失败", icon: "none" }));
  },

  accept(event) {
    const id = Number(event.currentTarget.dataset.id);
    api
      .riderAccept(id)
      .then(() => {
        wx.showToast({ title: "接单成功" });
        this.load();
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "接单失败", icon: "none" }));
  },

  act(event) {
    const id = Number(event.currentTarget.dataset.id);
    const action = event.currentTarget.dataset.action;
    const note = action === "ABANDON" ? "骑手主动放弃" : "";
    api
      .riderAction(id, action, note)
      .then(() => {
        wx.showToast({ title: "已更新" });
        this.load();
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "操作失败", icon: "none" }));
  },

  bind(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  pickCard(event) {
    this.setData({ cardIndex: Number(event.detail.value) || 0 });
  },

  toggleCardForm() {
    this.setData({ showCardForm: !this.data.showCardForm });
  },

  bindCard(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  toggleCardDefault(event) {
    this.setData({ cardDefault: !!event.detail.value.length });
  },

  saveCard() {
    if (!this.data.cardHolder || !this.data.cardBank || !this.data.cardNo) {
      wx.showToast({ title: "请填写持卡人、开户行与卡号", icon: "none" });
      return;
    }
    api
      .riderSaveBankCard({
        id: 0,
        holder: this.data.cardHolder,
        bankName: this.data.cardBank,
        cardNo: this.data.cardNo,
        isDefault: this.data.cardDefault,
      })
      .then(() => {
        wx.showToast({ title: "银行卡已添加" });
        this.setData({
          showCardForm: false,
          cardHolder: "",
          cardBank: "",
          cardNo: "",
        });
        this.load();
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "添加失败", icon: "none" }));
  },

  removeCard(event) {
    const id = Number(event.currentTarget.dataset.id);
    api
      .riderRemoveBankCard(id)
      .then(() => this.load())
      .catch((error) => wx.showToast({ title: (error && error.message) || "删除失败", icon: "none" }));
  },

  withdraw() {
    const amount = Number(this.data.withdrawAmount);
    if (!(amount > 0)) {
      wx.showToast({ title: "请填写提现金额", icon: "none" });
      return;
    }
    const card = this.data.cards[this.data.cardIndex];
    if (!card && !this.data.bankInfo.trim()) {
      wx.showToast({ title: "请选择银行卡或填写收款信息", icon: "none" });
      return;
    }
    api
      .riderWithdraw(amount, card ? card.id : 0, this.data.bankInfo)
      .then(() => {
        wx.showToast({ title: "提现申请已提交" });
        this.setData({ withdrawAmount: "", bankInfo: "" });
        this.load();
      })
      .catch((error) => wx.showToast({ title: (error && error.message) || "提现失败", icon: "none" }));
  },

  logout() {
    session.clearRider();
    this.setData({ hasToken: false, profile: null, pending: [], active: [] });
  },

  openOrder(event) {
    const orderNo = event.currentTarget.dataset.no;
    wx.navigateTo({ url: "/pages/order-detail/order-detail?orderNo=" + encodeURIComponent(orderNo) });
  },
});