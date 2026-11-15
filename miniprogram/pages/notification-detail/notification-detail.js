const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

Page({
  data: {
    notice: null,
    loading: true,
  },

  onLoad(query) {
    this.noticeId = query.id;
    if (!auth.ensureLogin()) return;
    this.load();
  },

  load() {
    this.setData({ loading: true });
    return api
      .notification(this.noticeId)
      .then((notice) => {
        this.setData({
          notice: Object.assign({}, notice, {
            createdAtText: format.dateTime(notice.createdAt),
          }),
          loading: false,
        });
        wx.setNavigationBarTitle({ title: notice.title || "消息详情" });
        if (!notice.read) {
          api.readNotification(this.noticeId).catch(() => {});
        }
      })
      .catch((error) => {
        this.setData({ loading: false });
        auth.showError(error);
      });
  },

  copyLink() {
    const link = (this.data.notice && this.data.notice.link) || "";
    if (!link) return;
    wx.setClipboardData({
      data: link,
      success() {
        wx.showToast({ title: "已复制链接", icon: "success" });
      },
    });
  },
});
