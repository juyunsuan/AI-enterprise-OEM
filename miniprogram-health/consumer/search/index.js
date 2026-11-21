const api = require("../../utils/api");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

const TABS = [
  { key: "all", label: "全部" },
  { key: "goods", label: "商品" },
  { key: "service", label: "服务" },
  { key: "doctor", label: "医护" },
  { key: "article", label: "科普" },
];

const ALL_SIZE = 3;
const TAB_SIZE = 20;

Page({
  data: {
    keyword: "",
    hotKeywords: [],
    tabs: TABS,
    tab: "all",
    loading: false,
    searched: false,
    goods: [],
    services: [],
    doctors: [],
    articles: [],
  },

  onLoad(options) {
    const keyword = decodeURIComponent((options && options.keyword) || "");
    this.setData({ keyword });
    this.loadHot();
    if (keyword.trim()) this.search(keyword, "all");
  },

  async loadHot() {
    try {
      const rows = (await api.hotKeywords()) || [];
      this.setData({ hotKeywords: rows });
    } catch (error) {
      /* 热词失败不影响搜索 */
    }
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },

  onConfirm() {
    const keyword = String(this.data.keyword || "").trim();
    if (!keyword) {
      wx.showToast({ title: "请输入搜索词", icon: "none" });
      return;
    }
    this.search(keyword, this.data.tab);
  },

  onHot(e) {
    const keyword = e.currentTarget.dataset.word || "";
    if (!keyword) return;
    this.setData({ keyword });
    this.search(keyword, this.data.tab);
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab || !this.data.searched) {
      this.setData({ tab });
      return;
    }
    this.setData({ tab });
    this.search(this.data.keyword, tab);
  },

  async search(keyword, tab) {
    if (this.data.loading) return;
    this.setData({ loading: true, searched: true, keyword });
    api.logSearch(keyword).catch(() => undefined);
    try {
      const [goods, services, doctors, articles] = await Promise.all([
        tab === "all" || tab === "goods"
          ? api.goods({ keyword, page: 1, pageSize: tab === "all" ? ALL_SIZE : TAB_SIZE })
          : { list: [] },
        tab === "all" || tab === "service"
          ? api.services({ keyword, page: 1, pageSize: tab === "all" ? ALL_SIZE : TAB_SIZE })
          : { list: [] },
        tab === "all" || tab === "doctor"
          ? api.practitioners({ keyword, page: 1, pageSize: tab === "all" ? ALL_SIZE : TAB_SIZE })
          : { list: [] },
        tab === "all" || tab === "article"
          ? api.articles({ keyword, page: 1, pageSize: tab === "all" ? ALL_SIZE : TAB_SIZE })
          : { list: [] },
      ]);
      this.setData({
        loading: false,
        goods: ((goods && goods.list) || []).map((row) => ({
          ...row,
          priceText: format.yuan(row.priceCents),
          soldOut: row.stock <= 0,
        })),
        services: ((services && services.list) || []).map((row) => ({
          ...row,
          priceText: format.yuan(row.priceCents),
          bizLabel: labels.pick(labels.BIZ_LABELS, row.bizType),
        })),
        doctors: ((doctors && doctors.list) || []).map((row) => ({
          ...row,
          roleLabel: labels.pick(
            { DOCTOR: "医生", MANAGER: "健管师", PHARMACIST: "药师", GUIDE: "导诊师" },
            row.role,
          ),
          goodAtText: (row.goodAt || []).slice(0, 3).join("、"),
        })),
        articles: ((articles && articles.list) || []).map((row) => ({
          ...row,
          timeText: format.shortTime(row.publishedAt),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || "搜索失败", icon: "none" });
    }
  },

  onGoods(e) {
    wx.navigateTo({ url: "/consumer/mall/detail?id=" + e.currentTarget.dataset.id });
  },

  onService(e) {
    wx.navigateTo({ url: "/consumer/service/detail?id=" + e.currentTarget.dataset.id });
  },

  onDoctor(e) {
    wx.navigateTo({ url: "/consumer/doctor/detail?id=" + e.currentTarget.dataset.id });
  },

  onArticle(e) {
    wx.navigateTo({ url: "/consumer/article/detail?id=" + e.currentTarget.dataset.id });
  },
});
