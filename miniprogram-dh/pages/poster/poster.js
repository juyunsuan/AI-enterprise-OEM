/**
 * 分享海报：后台只存版式坐标，头像与小程序码在端上 canvas 合成后保存/分享。
 * 不依赖任何服务端图片合成能力，也不往服务器装绘图软件。
 */
const api = require("../../utils/api");
const auth = require("../../utils/auth");

Page({
  data: {
    themeStyle: "",
    posters: [],
    poster: null,
    qrcodeUrl: "",
    member: null,
    canvasPath: "",
    drawing: false,
    error: "",
  },

  onShow() {
    const app = getApp();
    this.setData({ themeStyle: app.globalData.themeStyle });
    app.ensureReady().then(() => this.load());
  },

  onShareAppMessage() {
    const member = this.data.member;
    return {
      title: "AI 数字人分身，一张照片就能开口说话",
      path: "/pages/index/index" + (member ? "?tuid=" + member.id : ""),
      imageUrl: this.data.canvasPath || "",
    };
  },

  load() {
    return auth
      .ensureMember()
      .then((member) => {
        this.setData({ member: member });
        return Promise.all([
          api.posters(),
          api.qrcode().catch(() => ({ qrcodeUrl: "" })),
        ]);
      })
      .then(([posters, qrcode]) => {
        const list = posters || [];
        this.setData({
          posters: list,
          qrcodeUrl: (qrcode && qrcode.qrcodeUrl) || "",
          error: list.length ? "" : "站点暂未配置分享海报",
        });
        if (list.length) this.select(0);
      })
      .catch((error) => {
        this.setData({ error: (error && error.message) || "加载失败" });
      });
  },

  select(event) {
    const index = typeof event === "number" ? event : Number(event.currentTarget.dataset.index);
    const poster = this.data.posters[index];
    if (!poster) return;
    this.setData({ poster: poster, canvasPath: "" });
    this.draw(poster);
  },

  draw(poster) {
    const that = this;
    this.setData({ drawing: true });
    wx.createSelectorQuery()
      .in(this)
      .select("#posterCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node) {
          that.setData({ drawing: false });
          return;
        }
        const canvas = item.node;
        const ctx = canvas.getContext("2d");
        that.loadImage(canvas, poster.bgUrl, (bg) => {
          if (!bg) {
            that.setData({ drawing: false, error: "海报背景加载失败" });
            return;
          }
          canvas.width = bg.width;
          canvas.height = bg.height;
          ctx.clearRect(0, 0, bg.width, bg.height);
          ctx.drawImage(bg, 0, 0, bg.width, bg.height);

          const avatarUrl = that.data.member && that.data.member.avatar;
          const qrUrl = that.data.qrcodeUrl;
          that.loadImage(canvas, avatarUrl, (avatar) => {
            if (avatar) that.drawAvatar(ctx, poster, avatar);
            that.loadImage(canvas, qrUrl, (qr) => {
              if (qr) that.drawQr(ctx, poster, qr);
              that.exportImage(canvas, bg.width, bg.height);
            });
          });
        });
      });
  },

  loadImage(canvas, url, done) {
    if (!url) {
      done(null);
      return;
    }
    const image = canvas.createImage();
    image.onload = () => done(image);
    image.onerror = () => done(null);
    image.src = url;
  },

  drawAvatar(ctx, poster, image) {
    const size = Math.max(20, poster.avatarSize || 0);
    const x = poster.avatarX || 0;
    const y = poster.avatarY || 0;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, x, y, size, size);
    ctx.restore();
  },

  drawQr(ctx, poster, image) {
    const size = Math.max(20, poster.qrSize || 0);
    ctx.drawImage(image, poster.qrX || 0, poster.qrY || 0, size, size);
  },

  exportImage(canvas, width, height) {
    const that = this;
    wx.canvasToTempFilePath({
      canvas: canvas,
      destWidth: width,
      destHeight: height,
      success(res) {
        that.setData({ canvasPath: res.tempFilePath, drawing: false });
      },
      fail() {
        that.setData({ drawing: false, error: "海报生成失败，请重试" });
      },
    });
  },

  savePoster() {
    if (!this.data.canvasPath) {
      wx.showToast({ title: "海报还在生成中", icon: "none" });
      return;
    }
    wx.saveImageToPhotosAlbum({
      filePath: this.data.canvasPath,
      success() {
        wx.showToast({ title: "已保存到相册" });
      },
      fail() {
        wx.showToast({ title: "保存失败，请检查相册权限", icon: "none" });
      },
    });
  },

  previewPoster() {
    if (!this.data.canvasPath) return;
    wx.previewImage({ urls: [this.data.canvasPath] });
  },

  onShareTap() {
    wx.showToast({ title: "点右上角分享给好友", icon: "none" });
  },
});
