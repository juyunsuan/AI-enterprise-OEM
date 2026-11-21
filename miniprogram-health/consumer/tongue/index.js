const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");

const MAX_PICK_BYTES = 20 * 1024 * 1024;
const TAG_CLASSES = ["tag-blue", "tag-green", "tag-orange"];

function featureTags(row) {
  return [row.tongueColor, row.coatingColor, row.tongueShape]
    .filter(Boolean)
    .map(function (text, index) {
      return { text: text, cls: TAG_CLASSES[index % TAG_CLASSES.length] };
    });
}

Page({
  data: {
    enabled: true,
    loading: true,
    analyzing: false,
    imagePath: "",
    localPath: "",
    result: null,
    featureTags: [],
    confidenceText: "",
    history: [],
  },

  onLoad() {
    const app = getApp();
    const bootstrap = app.globalData.bootstrap;
    if (bootstrap && bootstrap.tongueEnabled === false) {
      this.setData({ enabled: false, loading: false });
    }
  },

  onShow() {
    if (!this.data.enabled) return;
    this.loadHistory();
  },

  onPullDownRefresh() {
    this.loadHistory().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  async loadHistory() {
    try {
      await auth.requireLogin();
      const data = (await api.tongueRecords(1, 15)) || {};
      const list = (data.list || []).map(function (row) {
        return {
          ...row,
          timeText: format.shortTime(row.createdAt),
          tags: [row.tongueColor, row.coatingColor].filter(Boolean),
        };
      });
      this.setData({ loading: false, history: list });
    } catch (error) {
      this.setData({ loading: false });
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "记录加载失败", icon: "none" });
      }
    }
  },

  onChooseImage() {
    const that = this;
    const accept = function (path, size) {
      if (size && size > MAX_PICK_BYTES) {
        wx.showToast({ title: "照片过大，请重新拍摄", icon: "none" });
        return;
      }
      that.setData({
        imagePath: path,
        localPath: path,
        result: null,
        featureTags: [],
        confidenceText: "",
      });
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["camera", "album"],
        success(res) {
          const file = (res.tempFiles || [])[0] || {};
          accept(file.tempFilePath, file.size);
        },
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["camera", "album"],
      success(res) {
        const file = (res.tempFiles || [])[0] || {};
        accept((res.tempFilePaths || [])[0], file.size);
      },
    });
  },

  onPreview() {
    if (!this.data.imagePath) return;
    wx.previewImage({ urls: [this.data.imagePath] });
  },

  onReset() {
    this.setData({
      imagePath: "",
      localPath: "",
      result: null,
      featureTags: [],
      confidenceText: "",
    });
  },

  async onAnalyze() {
    if (this.data.analyzing) return;
    if (!this.data.localPath) {
      wx.showToast({ title: "请先拍照或从相册选择", icon: "none" });
      return;
    }
    try {
      await auth.requireLogin();
    } catch (error) {
      return;
    }
    this.setData({ analyzing: true });
    try {
      const uploadPath = await this.compress(this.data.localPath);
      const row = await api.tongueAnalyze(uploadPath);
      this.applyResult(row);
      wx.showToast({ title: "分析完成", icon: "success" });
      await this.loadHistory();
    } catch (error) {
      if (error && error.code !== 401) {
        wx.showToast({ title: error.message || "分析失败，请重试", icon: "none" });
      }
    } finally {
      this.setData({ analyzing: false });
    }
  },

  async onHistory(e) {
    const id = Number(e.currentTarget.dataset.id) || 0;
    if (!id) return;
    try {
      const row = await api.tongueRecordDetail(id);
      this.setData({ localPath: "" });
      this.applyResult(row);
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } catch (error) {
      wx.showToast({ title: error.message || "记录读取失败", icon: "none" });
    }
  },

  /** 端上先压一轮再传：手机原图常超 8MB，压缩失败就交给后端体积校验兜底。 */
  compress(path) {
    if (!wx.compressImage) return Promise.resolve(path);
    return new Promise(function (resolve) {
      wx.compressImage({
        src: path,
        quality: 72,
        success(res) {
          resolve((res && res.tempFilePath) || path);
        },
        fail() {
          resolve(path);
        },
      });
    });
  },

  applyResult(row) {
    if (!row) return;
    this.setData({
      result: row,
      featureTags: featureTags(row),
      confidenceText: Number(row.confidence) > 0 ? row.confidence + "%" : "未给出",
      imagePath: row.imageUrl || this.data.imagePath,
    });
  },

  onCall() {
    const app = getApp();
    const phone = (app.globalData.bootstrap && app.globalData.bootstrap.servicePhone) || "";
    if (!phone) {
      wx.showToast({ title: "店铺未留客服电话", icon: "none" });
      return;
    }
    wx.makePhoneCall({ phoneNumber: phone });
  },
});