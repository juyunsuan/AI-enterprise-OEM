const api = require("../../utils/api");
const format = require("../../utils/format");
const staff = require("../../utils/staff");

Page({
  data: {
    loading: true,
    list: [],
    total: 0,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await staff.requireStaff();
      const data = await api.staffArticles({ pageSize: 50 });
      this.setData({
        loading: false,
        total: (data && data.total) || 0,
        list: ((data && data.list) || []).map((row) => ({
          ...row,
          statusLabel: staff.pick(staff.ARTICLE_STATUS_LABELS, row.status),
          auditLabel: staff.pick(staff.AUDIT_STATUS_LABELS, row.auditStatus),
          timeText: format.dateTime(row.publishedAt || row.createdAt),
        })),
      });
    } catch (error) {
      this.setData({ loading: false });
      staff.handleError(error, "文章加载失败");
    }
  },

  onCreate() {
    wx.navigateTo({ url: "/practitioner/article/edit" });
  },

  onEdit(e) {
    wx.navigateTo({ url: "/practitioner/article/edit?id=" + e.currentTarget.dataset.id });
  },

  onOffline(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "下线文章",
      content: "下线后顾客端不再展示，可再次编辑提交重新审核。",
      success: (res) => {
        if (!res.confirm) return;
        api
          .staffOfflineArticle(id)
          .then(() => {
            wx.showToast({ title: "已下线" });
            this.load();
          })
          .catch((error) => staff.handleError(error, "下线失败"));
      },
    });
  },
});
