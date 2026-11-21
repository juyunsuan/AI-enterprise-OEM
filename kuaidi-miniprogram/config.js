/**
 * 快递寄件小程序包内配置（模板占位文件）。
 *
 * 下面这些「键名 + 空串」占位由你在微信开发者工具里按平台「小程序发布说明」逐项填写
 * （平台输出的是统一源码分发包，包内不含账号参数）：
 *  - apiBase：本站 API 基址（https://host，无尾斜杠），微信 request 合法域名需先登记；
 *  - appName / themeColor：商家名与主题色的兜底值；端上以 bootstrap 实时值为准，
 *    店主改门面不用重出包；
 *  - templateVersion：不用改，仅供后台「内置模板」卡片展示版本号。
 *
 * 一部小程序服务一个账号下的多个寄件点，寄件点码不预置：进店按小程序 AppID
 * 拉营业中的寄件点让顾客选，或由分享链接/门店码带 `?site=寄件点码` 直达。
 * siteCode 仅作为单点部署时可手动填写的默认寄件点码（留空即不预设）。
 */
module.exports = {
  templateVersion: "1.1.0",
  apiBase: "",
  siteCode: "",
  appName: "",
  themeColor: "",
  deskSiteKey: "",
};
