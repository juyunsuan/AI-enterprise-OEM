const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const labels = require("../../utils/labels");

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)(\?|$)/i;

Page({
  data: {
    loading: true,
    report: null,
    files: [],
    items: [],
    advices: [],
    disclaimer: "",
    abnormalItems: 0,
  },

  onLoad(options) {
    this.reportId = Number(options && options.id) || 0;
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      await auth.requireLogin();
      const data = (await api.reportDetail(this.reportId)) || {};
      const report = data.report || {};
      const items = (data.items || []).map((row) => ({
        ...row,
        flagLabel: labels.pick(labels.REPORT_FLAG_LABELS, row.flag),
        abnormal: row.flag && row.flag !== "NORMAL",
      }));
      this.setData({
        loading: false,
        report: {
          ...report,
          typeLabel: labels.pick(labels.REPORT_TYPE_LABELS, report.type, "报告"),
          timeText: report.reportAt ? format.dateTime(report.reportAt) : "",
        },
        files: (report.files || []).filter((file) => file && file.url),
        items,
        advices: (data.advices || []).map((row) => ({
          ...row,
          timeText: row.createdAt ? format.shortTime(row.createdAt) : "",
        })),
        disclaimer: data.disclaimer || "",
        abnormalItems: items.filter((row) => row.abnormal).length,
      });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "报告加载失败", icon: "none" });
      }
    }
  },

  onFile(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (IMAGE_EXT.test(url)) {
      const images = this.data.files
        .map((file) => file.url)
        .filter((item) => IMAGE_EXT.test(item));
      wx.previewImage({ current: url, urls: images });
      return;
    }
    wx.showLoading({ title: "打开中…" });
    wx.downloadFile({
      url,
      success: (res) => {
        wx.hideLoading();
        if (res.statusCode !== 200) {
          wx.showToast({ title: "文件下载失败", icon: "none" });
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: () => wx.showToast({ title: "无法打开该文件", icon: "none" }),
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: "文件下载失败", icon: "none" });
      },
    });
  },
});
