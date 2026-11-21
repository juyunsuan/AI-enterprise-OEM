const diy = require("../../../utils/diy-render");

/**
 * 辅助区：PHONE 直接拨号、COPY 复制客服微信号、QRCODE 展示店主上传的二维码图。
 * 客服电话来自 bootstrap 的 servicePhone，二维码只能来自 props.image（端上没有生成二维码的接口）。
 */
Component({
  properties: {
    props: { type: Object, value: {} },
    ctx: { type: Object, value: {} },
  },
  data: {
    mode: "PHONE",
    label: "联系客服",
    image: "",
    phone: "",
    deskReady: false,
  },
  attached() {
    const props = this.properties.props || {};
    const ctx = this.properties.ctx || {};
    this.setData({
      mode: diy.str(props.mode, "PHONE"),
      label: diy.str(props.label, "联系客服"),
      image: diy.str(props.image),
      phone: ((ctx.shop || {}).servicePhone || "").trim(),
      // 绑定了 AI 客服站点时，默认按钮改为打开在线会话（客服页内回落电话）
      deskReady: !!((ctx.desk || {}).embedUrl || ""),
    });
  },
  methods: {
    onTap() {
      const mode = this.data.mode;
      if (mode === "COPY") {
        const content = this.data.phone || this.data.label;
        wx.setClipboardData({
          data: content,
          success() {
            wx.showToast({ title: "已复制联系方式", icon: "none" });
          },
          fail() {},
        });
        return;
      }
      if (mode === "QRCODE") {
        if (!this.data.image) {
          wx.showToast({ title: "商家还没上传客服二维码", icon: "none" });
          return;
        }
        wx.previewImage({ urls: [this.data.image], fail() {} });
        return;
      }
      if (mode === "PHONE" && this.data.deskReady) {
        wx.navigateTo({ url: "/pages/service/index" });
        return;
      }
      if (!this.data.phone) {
        wx.showToast({ title: "商家未填写客服电话", icon: "none" });
        return;
      }
      wx.makePhoneCall({ phoneNumber: this.data.phone, fail() {} });
    },
  },
});
