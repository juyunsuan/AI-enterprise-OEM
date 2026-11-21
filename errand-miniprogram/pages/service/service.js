Page({
  data: { url: "" },
  onLoad(options) {
    let url = "";
    try {
      url = decodeURIComponent(options.url || "");
    } catch (error) {
      url = "";
    }
    this.setData({ url: url });
  },
});