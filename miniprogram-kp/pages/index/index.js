/**
 * 首页：轮播 + 公告滚动 + 分类栏目 + 热门推荐，全部按站点开关决定是否渲染。
 */
const api = require("../../utils/api");
const format = require("../../utils/format");
const linkHelper = require("../../utils/link");

const CATEGORY_LIMIT = 6; // 首页最多展示的分类栏目数，再多就变成列表页了
const PER_CATEGORY = 6; // 每个分类栏目最多 6 条，横向滑动

Page({
  data: {
    themeStyle: "",
    siteName: "",
    slogan: "",
    moreTitle: "更多推荐",
    hotWords: [],
    show: {
      search: true,
      banner: true,
      notice: true,
      categories: true,
      hot: true,
    },
    banners: [],
    notices: [],
    categoryBlocks: [],
    hotList: [],
    siteDisabled: false,
    loading: true,
    error: "",
  },

  onShow() {
    const app = getApp();
    this.syncRuntime(app);
    // 配置是异步的：先按缓存渲染，ready 后再同步一次，避免首帧漏开关。
    app.ensureReady().then(() => {
      this.syncRuntime(app);
      this.loadSections();
    });
  },

  onPullDownRefresh() {
    this.loadSections(true).then(() => wx.stopPullDownRefresh());
  },

  /** 主题色/站点名/功能开关这类运行时值统一从 globalData 同步到本页 data。 */
  syncRuntime(app) {
    const config = app.globalData.config || {};
    this.setData({
      themeStyle: app.globalData.themeStyle,
      siteName: app.globalData.siteName,
      slogan: app.globalData.slogan,
      moreTitle: app.configValue("moreTitle", "更多推荐"),
      hotWords: String(config.hotWords || "")
        .split(",")
        .filter((word) => !!word)
        .slice(0, 6),
      siteDisabled: !app.siteEnabled(),
      show: {
        search: app.toggle("search"),
        banner: app.toggle("indexBanner"),
        notice: app.toggle("indexNotice"),
        categories: app.toggle("indexCategories"),
        hot: app.toggle("indexHot"),
      },
    });
  },

  loadSections(force) {
    if (this.data.siteDisabled) {
      this.setData({ loading: false, error: "站点暂未开放，请稍后再来" });
      return Promise.resolve();
    }
    if (this.loadingPromise && !force) return this.loadingPromise;

    const show = this.data.show;
    const jobs = [];

    jobs.push(
      api
        .banners()
        .then((data) => ({
          banners: ((data && data.list) || []).filter((item) => item.image),
        }))
        .catch(() => ({ banners: [] })),
    );
    jobs.push(
      show.notice
        ? api
            .notices({ limit: 6 })
            .then((data) => ({ notices: (data && data.list) || [] }))
            .catch(() => ({ notices: [] }))
        : Promise.resolve({ notices: [] }),
    );
    jobs.push(
      show.hot
        ? api
            .resources({ kind: "hot", pageSize: 6 })
            .then((data) => ({ hotList: format.decorateList(data && data.list) }))
            .catch(() => ({ hotList: [] }))
        : Promise.resolve({ hotList: [] }),
    );

    this.loadingPromise = Promise.all(jobs).then((results) => {
      const merged = Object.assign.apply(null, [{}].concat(results));
      this.setData({
        banners: merged.banners,
        notices: merged.notices,
        hotList: merged.hotList,
        loading: false,
        error: "",
      });
      // 分类栏目要按分类逐个取热门内容，依赖 categories 结果，放在后面串一次。
      if (!show.categories) {
        this.setData({ categoryBlocks: [] });
        this.loadingPromise = null;
        return;
      }
      return this.loadCategoryBlocks().then(() => {
        this.loadingPromise = null;
      });
    });
    return this.loadingPromise;
  },

  /** 每个分类取前 6 条热门内容，空分类整栏不渲染，避免出现「标题 + 空白」。 */
  loadCategoryBlocks() {
    return api
      .categories()
      .then((data) => ((data && data.list) || []).slice(0, CATEGORY_LIMIT))
      .catch(() => [])
      .then((categories) =>
        Promise.all(
          categories.map((category) =>
            api
              .resources({
                categoryId: category.id,
                kind: "hot",
                pageSize: PER_CATEGORY,
              })
              .then((data) => ({
                category: category,
                list: format.decorateList(data && data.list),
              }))
              .catch(() => ({ category: category, list: [] })),
          ),
        ),
      )
      .then((blocks) => {
        this.setData({
          categoryBlocks: blocks.filter((block) => block.list.length),
        });
      });
  },

  onBannerTap(event) {
    const item = this.data.banners[event.currentTarget.dataset.index];
    if (item) linkHelper.open(item.link);
  },

  onNoticeTap(event) {
    const item = this.data.notices[event.currentTarget.dataset.index];
    if (!item) return;
    wx.navigateTo({
      url: "/pages/notice-detail/notice-detail?id=" + item.id,
    });
  },

  goNoticeList() {
    wx.navigateTo({ url: "/pages/notice/notice" });
  },

  goSearch() {
    wx.navigateTo({ url: "/pages/search/search" });
  },

  goCategory(event) {
    const id = event.currentTarget.dataset.id;
    const title = event.currentTarget.dataset.title || "分类";
    wx.navigateTo({
      url:
        "/pages/list/list?categoryId=" +
        id +
        "&title=" +
        encodeURIComponent(title),
    });
  },

  goKindList(event) {
    const kind = event.currentTarget.dataset.kind;
    const title = event.currentTarget.dataset.title || "内容列表";
    wx.navigateTo({
      url: "/pages/list/list?kind=" + kind + "&title=" + encodeURIComponent(title),
    });
  },

  goMore() {
    wx.navigateTo({
      url: "/pages/more/more?title=" + encodeURIComponent(this.data.moreTitle),
    });
  },

  openResource(event) {
    wx.navigateTo({
      url: "/pages/details/details?id=" + event.currentTarget.dataset.id,
    });
  },

  onShareAppMessage() {
    return { title: this.data.siteName, path: "/pages/index/index" };
  },
});
