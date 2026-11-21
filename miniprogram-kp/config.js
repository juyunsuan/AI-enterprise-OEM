/**
 * 知识付费云课堂运行配置（用户模板占位文件）。
 *
 * 四个值都要你在微信开发者工具里自己填（平台输出的统一包保留空串占位）：
 *  - apiBase：本站 API 基址，形如 https://host（无尾斜杠）。微信要求 request
 *    合法域名先在小程序后台登记，所以域名必须随包带出，源码里不写死任何站点。
 *  - site：站点寻址码 siteCode，所有公开接口都以 ?site= 定位租户。
 *  - siteName / themeColor：留空时回落默认值（「知识付费云课堂」/ #3370ff），
 *    实际展示还会再被服务端 /config 的同名字段覆盖，方便站点改配置不用重出包。
 */
module.exports = {
  apiBase: "",
  site: "",
  siteName: "",
  themeColor: "",
};
