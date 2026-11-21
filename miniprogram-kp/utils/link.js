/**
 * link 协议解析与跳转。
 *
 * 后端轮播位 / 精选推荐里的 link 字段统一是「协议:值」形式：
 *   resource:<id>    站内内容详情
 *   page:<id>        自定义单页
 *   notice:<id>      公告详情
 *   url:<https url>  外部网页（走 webview 承载页，需在小程序后台配业务域名）
 *   app:<appid>|<path> 跳转第三方小程序
 *   none / 空        不响应
 * 集中在这里实现，是为了让首页、更多推荐页、分类页对同一份数据表现一致。
 */
function parse(link) {
  const text = String(link || "");
  const index = text.indexOf(":");
  if (index < 0) return { protocol: text, value: "" };
  return {
    protocol: text.slice(0, index),
    value: text.slice(index + 1),
  };
}

function open(link) {
  const parsed = parse(link);
  if (!parsed.value || parsed.protocol === "none") return;

  if (parsed.protocol === "page") {
    wx.navigateTo({ url: "/pages/page/page?id=" + parsed.value });
    return;
  }
  if (parsed.protocol === "resource") {
    wx.navigateTo({ url: "/pages/details/details?id=" + parsed.value });
    return;
  }
  if (parsed.protocol === "notice") {
    wx.navigateTo({
      url: "/pages/notice-detail/notice-detail?id=" + parsed.value,
    });
    return;
  }
  if (parsed.protocol === "url") {
    wx.navigateTo({
      url: "/pages/webview/webview?url=" + encodeURIComponent(parsed.value),
    });
    return;
  }
  if (parsed.protocol === "app") {
    // 约定 app:<appid>|<path>，竖线后半段可为空。
    const parts = parsed.value.split("|");
    if (!parts[0]) return;
    wx.navigateToMiniProgram({
      appId: parts[0],
      path: parts[1] || "",
      fail() {
        wx.showToast({ title: "无法打开该小程序", icon: "none" });
      },
    });
    return;
  }
  wx.showToast({ title: "暂不支持的链接类型", icon: "none" });
}

module.exports = {
  parse: parse,
  open: open,
};
