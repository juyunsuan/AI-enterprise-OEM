/**
 * 跳转协议解析：轮播图/公告/精选位统一用「协议:值」写法。
 * 支持 goods:<商品ID>、category:<分类ID>、notice:<内容ID>、url:<https 链接>、none。
 */
function open(link) {
  const text = String(link || "").trim();
  if (!text || text === "none") return;
  const index = text.indexOf(":");
  const type = index > 0 ? text.slice(0, index) : "";
  const value = index > 0 ? text.slice(index + 1) : text;

  if (type === "goods") {
    wx.navigateTo({ url: "/pages/goods/detail?id=" + encodeURIComponent(value) });
    return;
  }
  if (type === "category") {
    wx.switchTab({ url: "/pages/category/category" });
    return;
  }
  if (type === "notice") {
    wx.navigateTo({ url: "/pages/article/detail?id=" + encodeURIComponent(value) });
    return;
  }
  if (type === "url") {
    wx.navigateTo({
      url: "/pages/webview/webview?url=" + encodeURIComponent(value),
    });
    return;
  }
  // 未带协议时按站内内容 ID 处理，兼容后台直接填数字
  if (/^\d+$/.test(text)) {
    wx.navigateTo({ url: "/pages/article/detail?id=" + text });
  }
}

module.exports = { open: open };
