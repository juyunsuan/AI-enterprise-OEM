const api = require("../../utils/api");
const agent = require("../../utils/agent");

/**
 * 代理分享海报：后端只给文案 + 小程序码，排版在端上 canvas 完成。
 * 出图后可直接保存相册或预览转发，避免把 SVG 塞进小程序 image。
 */
const W = 750;
const H = 1180;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

function clip(text, max) {
  const value = String(text || "");
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

Page({
  data: {
    loading: true,
    poster: null,
    imagePath: "",
    saving: false,
    errorText: "",
  },

  onLoad() {
    this.gate = agent.ensureAgent();
  },

  async onShow() {
    const gate = this.gate || agent.ensureAgent();
    this.gate = null;
    const profile = await gate.catch(() => null);
    if (!profile) return;
    await this.load();
  },

  async load() {
    this.setData({ loading: true, errorText: "" });
    try {
      const poster = await api.agentPoster();
      this.setData({ poster: poster, loading: false });
      await this.draw(poster);
    } catch (error) {
      this.setData({
        loading: false,
        errorText: (error && error.message) || "海报生成失败，请稍后重试",
      });
    }
  },

  onPullDownRefresh() {
    this.load()
      .catch(() => undefined)
      .then(() => wx.stopPullDownRefresh());
  },

  draw(poster) {
    return new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: poster.qrcodeUrl,
        success: (res) => resolve(res.path),
        fail: () =>
          reject(
            new Error(
              "小程序码图片加载失败，请确认对象存储域名已加入小程序 downloadFile 合法域名"
            )
          ),
      });
    }).then(
      (qrPath) =>
        new Promise((resolve, reject) => {
          const ctx = wx.createCanvasContext("poster", this);
          const grad = ctx.createLinearGradient(0, 0, 0, H);
          grad.addColorStop(0, "#3370ff");
          grad.addColorStop(1, "#1d4ed8");
          ctx.setFillStyle(grad);
          ctx.fillRect(0, 0, W, H);

          ctx.setGlobalAlpha(0.08);
          ctx.setFillStyle("#ffffff");
          ctx.beginPath();
          ctx.arc(640, 120, 180, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(90, 1050, 220, 0, Math.PI * 2);
          ctx.fill();
          ctx.setGlobalAlpha(1);

          ctx.setTextAlign("center");
          ctx.setFillStyle("#ffffff");
          ctx.setFontSize(46);
          ctx.fillText(clip(poster.shopName, 12), W / 2, 150);
          ctx.setFontSize(26);
          ctx.setFillStyle("#dbeafe");
          ctx.fillText(clip(poster.title, 20), W / 2, 210);
          ctx.setFontSize(22);
          ctx.fillText(clip(poster.subtitle, 24), W / 2, 256);

          ctx.setFillStyle("#ffffff");
          roundRect(ctx, 90, 330, 570, 640, 28);
          ctx.fill();
          ctx.setFillStyle("#1f2937");
          ctx.setFontSize(28);
          ctx.fillText("微信扫码，马上预约", W / 2, 400);

          ctx.setFillStyle("#f3f4f6");
          roundRect(ctx, 225, 440, 300, 300, 16);
          ctx.fill();
          ctx.drawImage(qrPath, 240, 455, 270, 270);

          ctx.setFillStyle("#4b5563");
          ctx.setFontSize(24);
          ctx.fillText("长按识别小程序码", W / 2, 800);
          ctx.setFillStyle("#9ca3af");
          ctx.setFontSize(22);
          ctx.fillText("店铺码 " + poster.shopCode, W / 2, 845);
          if (poster.contact) {
            ctx.setFillStyle("#3370ff");
            ctx.setFontSize(24);
            ctx.fillText(clip(poster.contact, 24), W / 2, 900);
          }

          ctx.setFillStyle("#dbeafe");
          ctx.setFontSize(20);
          ctx.setGlobalAlpha(0.85);
          ctx.fillText("专业上门 · 准时到达 · 售后无忧", W / 2, 1070);
          ctx.setGlobalAlpha(1);

          ctx.draw(false, () => {
            wx.canvasToTempFilePath(
              {
                canvasId: "poster",
                x: 0,
                y: 0,
                width: W,
                height: H,
                destWidth: W,
                destHeight: H,
                fileType: "png",
                success: (res) => {
                  this.setData({ imagePath: res.tempFilePath });
                  resolve();
                },
                fail: () => reject(new Error("海报导出失败，请稍后重试")),
              },
              this
            );
          });
        })
    ).catch((error) => {
      this.setData({ errorText: (error && error.message) || "海报绘制失败" });
    });
  },

  preview() {
    if (!this.data.imagePath) return;
    wx.previewImage({ urls: [this.data.imagePath] });
  },

  save() {
    if (!this.data.imagePath || this.data.saving) return;
    this.setData({ saving: true });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.imagePath,
      success: () => wx.showToast({ title: "已保存到相册", icon: "success" }),
      fail: (err) => {
        const denied = String((err && err.errMsg) || "").indexOf("auth deny") >= 0;
        if (denied) {
          wx.showModal({
            title: "需要相册权限",
            content: "请在设置中允许保存图片到相册后再试。",
            confirmText: "去设置",
            success: (res) => {
              if (res.confirm) wx.openSetting();
            },
          });
        } else {
          wx.showToast({ title: "保存失败，请重试", icon: "none" });
        }
      },
      complete: () => this.setData({ saving: false }),
    });
  },
});
