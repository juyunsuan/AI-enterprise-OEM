/**
 * 卡密商城小程序包内配置（模板占位文件）。
 *
 * 下面这些「键名 + 空串」占位由你在微信开发者工具里按平台「小程序发布说明」逐项填写
 * （平台输出的是统一源码分发包，包内不含账号参数）：
 *  - apiBase：本站 API 基址（https://host，无尾斜杠），微信 request 合法域名需先登记；
 *  - siteCode：站点寻址码，所有公开接口靠 `?site=` 定位租户，一部小程序只属于一个站点；
 *  - appName / themeColor：店名与主题色，留空时回落 bootstrap 的同名字段，
 *    店主改装修不用重出包；
 *  - deskSiteKey：绑定的 AI 客服服务站 key，非空时客服页用 web-view 打开会话；
 *  - templateVersion：不用改，仅供后台「内置模板」卡片展示版本号。
 */
module.exports = {
  templateVersion: "1.0.0",
  apiBase: "",
  siteCode: "",
  appName: "",
  themeColor: "",
  deskSiteKey: "",
};
