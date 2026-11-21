const api = require("../../utils/api");
const format = require("../../utils/format");

const HISTORY_KEY = "card-shop:miniprogram:search-history";
const HISTORY_MAX = 8;

/** 商品搜索：按名称搜在售商品，历史词只存本地，不上传。 */
Page({
  data: {
    themeStyle: "",
    enabled: true,
    keyword: "",
    history: [],
    list: [],
    page: 1,
    pageSize: 20,
    loading: false,
    finished: false,
    searched: false,
    error: "",
  },

  onLoad() {
    const app = getApp();
    this.setData({
      themeStyle: app.globalData.themeStyle,
      history: this.readHistory(),
    });
    app.ensureReady().then(() =>
      this.setData({
        themeStyle: app.globalData.themeStyle,
        enabled: app.toggle("search"),
      }),
    );
  },

  readHistory() {
    try {
      const raw = wx.getStorageSync(HISTORY_KEY);
      return Array.isArray(raw) ? raw.slice(0, HISTORY_MAX) : [];
    } catch (e) {
      return [];
    }
  },

  remember(keyword) {
    const next = [keyword]
      .concat(this.readHistory().filter((item) => item !== keyword))
      .slice(0, HISTORY_MAX);
    try {
      wx.setStorageSync(HISTORY_KEY, next);
    } catch (e) {
      /* 存不下不影响本次搜索 */
    }
    this.setData({ history: next });
  },

  clearHistory() {
    try {
      wx.removeStorageSync(HISTORY_KEY);
    } catch (e) {
      /* 忽略 */
    }
    this.setData({ history: [] });
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  onConfirm() {
    this.submit();
  },

  useHistory(event) {
    const keyword = String(event.currentTarget.dataset.keyword || "");
    this.setData({ keyword: keyword });
    this.submit();
  },

  submit() {
    const keyword = String(this.data.keyword || "").trim();
    if (!keyword) {
      wx.showToast({ title: "请输入商品关键词", icon: "none" });
      return;
    }
    this.remember(keyword);
    this.load(true);
  },

  onReachBottom() {
    if (this.data.loading || this.data.finished) return;
    this.load();
  },

  load(reset) {
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true, error: "" });
    return api
      .goods({ keyword: this.data.keyword, page: page, pageSize: this.data.pageSize })
      .then((data) => {
        const stockMode = (getApp().bootstrap() || {}).stockDisplayMode || "ACTUAL";
        const list = ((data && data.list) || []).map((goods) =>
          Object.assign({}, goods, {
            priceText: format.money(goods.price),
            stockText: format.stockText(goods.stock, stockMode),
          }),
        );
        this.setData({
          list: reset ? list : this.data.list.concat(list),
          page: page,
          loading: false,
          searched: true,
          finished: !data || list.length < this.data.pageSize,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          searched: true,
          error: (error && error.message) || "搜索失败",
        });
      });
  },

  openGoods(event) {
    wx.navigateTo({
      url: "/pages/goods/detail?id=" + event.currentTarget.dataset.id,
    });
  },
});
