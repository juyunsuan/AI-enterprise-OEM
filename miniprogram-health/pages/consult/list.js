const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

const WAYS = [
  { key: "TEXT", label: "图文问诊", desc: "随时提问，医护空余时回复", bizType: "CONSULT_TEXT" },
  { key: "PHONE", label: "电话问诊", desc: "预约时段，医护电话回拨", bizType: "CONSULT_PHONE" },
  { key: "VIDEO", label: "视频问诊", desc: "预约时段，视频面对面", bizType: "CONSULT_VIDEO" },
];

Page({
  data: {
    ways: WAYS,
    way: "TEXT",
    doctors: [],
    consults: [],
    loggedIn: false,
    loading: false,
    consultTip: "",
  },

  onLoad() {
    this.loadDoctors();
  },

  onShow() {
    let way = "TEXT";
    try {
      way = wx.getStorageSync("health:consultWay") || "TEXT";
    } catch (e) {
      way = "TEXT";
    }
    this.setData({ way });
    const loggedIn = !!getApp().hasToken();
    this.setData({ loggedIn });
    if (loggedIn) this.loadConsults();
    else this.setData({ consults: [] });
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadDoctors(),
      this.data.loggedIn ? this.loadConsults() : Promise.resolve(),
    ]).then(() => wx.stopPullDownRefresh());
  },

  async loadDoctors() {
    try {
      const data = await api.practitioners({ page: 1, pageSize: 10 });
      this.setData({
        doctors: ((data && data.list) || []).map((row) => ({
          ...row,
          roleLabel: labels.pick(
            { DOCTOR: "医生", MANAGER: "健管师", PHARMACIST: "药师", GUIDE: "导诊师" },
            row.role,
          ),
          scoreText: row.score > 0 ? row.score.toFixed(1) : "",
        })),
      });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || "医护加载失败", icon: "none" });
    }
  },

  async loadConsults() {
    try {
      const rows = await api.consults();
      this.setData({
        consults: (rows || []).map((row) => ({
          ...row,
          statusLabel: labels.pick(labels.CONSULT_STATUS_LABELS, row.status),
          wayLabel: labels.pick(labels.CONSULT_WAY_LABELS, row.bizType),
          timeText: row.appointAt ? format.dateTime(row.appointAt) : format.shortTime(row.createdAt),
        })),
      });
    } catch (error) {
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "问诊记录加载失败", icon: "none" });
      }
    }
  },

  onWay(e) {
    const way = e.currentTarget.dataset.way;
    this.setData({ way });
    try {
      wx.setStorageSync("health:consultWay", way);
    } catch (err) {
      /* 忽略 */
    }
    wx.showToast({ title: "已选择，挑一位医护开始", icon: "none" });
  },

  onDoctor(e) {
    wx.navigateTo({
      url: "/consumer/doctor/detail?id=" + e.currentTarget.dataset.id + "&way=" + this.data.way,
    });
  },

  onConsult(e) {
    wx.navigateTo({ url: "/consumer/consult/detail?id=" + e.currentTarget.dataset.id });
  },

  onLogin() {
    this.setData({ loading: true });
    auth
      .requireLogin({ redirect: false })
      .then(() => {
        this.setData({ loading: false, loggedIn: true });
        this.loadConsults();
      })
      .catch(() => this.setData({ loading: false }));
  },

  onCall() {
    const bootstrap = getApp().globalData.bootstrap || {};
    if (!bootstrap.servicePhone) return;
    wx.makePhoneCall({ phoneNumber: bootstrap.servicePhone });
  },
});
