Page({
  data: {
    site: {},
    list: [],
  },

  onShow: function () {
    var site = getApp().site();
    this.setData({
      site: site,
      list: site.materials || [],
    });
  },

  openMaterial: function (event) {
    var item = this.data.list[event.currentTarget.dataset.index];
    if (!item || !item.url) return;
    var url = item.url;
    var type = String(item.type || "").toLowerCase();
    var isImage = type === "image" || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url);
    var isVideo = type === "video" || /\.(mp4|mov|m3u8)(\?|$)/i.test(url);
    if (isImage) {
      wx.previewImage({ urls: [url], current: url });
      return;
    }
    if (isVideo) {
      wx.previewMedia({ sources: [{ url: url, type: "video" }] });
      return;
    }
    wx.showLoading({ title: "正在打开…" });
    wx.downloadFile({
      url: url,
      success: function (res) {
        wx.hideLoading();
        if (res.statusCode !== 200) {
          wx.setClipboardData({ data: url });
          wx.showToast({ title: "已复制下载链接", icon: "none" });
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          showMenu: true,
          fail: function () {
            wx.setClipboardData({ data: url });
            wx.showToast({ title: "已复制下载链接", icon: "none" });
          },
        });
      },
      fail: function () {
        wx.hideLoading();
        wx.setClipboardData({ data: url });
        wx.showToast({ title: "已复制下载链接", icon: "none" });
      },
    });
  },
});