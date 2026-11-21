/** 作品播放页：广场与分享落地页共用；分享路径带 tuid 形成两级分销归因。 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");
const format = require("../../utils/format");
const session = require("../../utils/session");

Page({
  data: {
    themeStyle: "",
    work: null,
    createdAt: "",
    loading: true,
    error: "",
  },

  onLoad(options) {
    // 分享链接带 tuid 时先暂存，等静默登录时一并提交给后端做邀请归因。
    const tuid = Number(options.tuid || 0);
    if (tuid > 0) {
      try {
        wx.setStorageSync("digital-human:tuid", tuid);
      } catch (e) {
        /* 忽略 */
      }
    }
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    this.id = Number(options.id || 0);
    app.ensureReady().then(() => this.load());
    auth.ensureMember().catch(() => null);
  },

  onShareAppMessage() {
    const member = session.getMember();
    const work = this.data.work || {};
    return {
      title: work.title || "AI 数字人作品",
      path:
        "/pages/play/play?id=" +
        this.id +
        (member ? "&tuid=" + member.id : ""),
      imageUrl: work.coverUrl || "",
    };
  },

  load() {
    if (!this.id) {
      this.setData({ loading: false, error: "作品不存在" });
      return;
    }
    api
      .work(this.id)
      .then((work) => {
        this.setData({
          work: work,
          createdAt: format.dateTime(work.createdAt),
          loading: false,
        });
        api.shareWork(this.id).catch(() => undefined);
      })
      .catch((error) => {
        this.setData({ loading: false, error: (error && error.message) || "作品加载失败" });
      });
  },

  goCreate() {
    wx.switchTab({ url: "/pages/create/create" });
  },

  onShareTap() {
    wx.showToast({ title: "点右上角即可分享给好友", icon: "none" });
  },

  saveVideo() {
    const work = this.data.work;
    if (!work || !work.resultVideoUrl) return;
    wx.showLoading({ title: "保存中" });
    wx.downloadFile({
      url: work.resultVideoUrl,
      success(res) {
        wx.saveVideoToPhotosAlbum({
          filePath: res.tempFilePath,
          success() {
            wx.hideLoading();
            wx.showToast({ title: "已保存到相册" });
          },
          fail() {
            wx.hideLoading();
            wx.showToast({ title: "保存失败，请检查相册权限", icon: "none" });
          },
        });
      },
      fail() {
        wx.hideLoading();
        wx.showToast({ title: "下载失败，请重试", icon: "none" });
      },
    });
  },
});
