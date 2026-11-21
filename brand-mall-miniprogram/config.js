/**
 * 电商小程序包内配置（模板占位文件）。
 *
 * `apiBase / shopCode / appName / themeColor` 四个键在仓库里保持「键名 + 空串」各占一行：
 * 平台输出的是**统一源码分发包**，包内不含任何账号参数，这四个值由你在微信开发者工具里
 * 亲手填（填什么、去哪取值，看平台「建站管理 → 小程序发布说明」）。
 * 所有租户共用同一份源码，仓库源文件永不改动。
 *
 * - apiBase：本站 API 基址（https://host，无尾斜杠）。微信要求 request 合法域名
 *   先在小程序后台登记，域名只能由你填进这里，端上不写死任何站点。
 * - shopCode：店铺寻址码，所有公开接口都靠它定位租户；一部小程序只属于一个店铺。
 * - appName / themeColor：店名与主题色，留空时回落 bootstrap 的同名字段，
 *   这样店主改了装修配置不用重出包。
 * - templateVersion：不用改，只给后台「内置模板」卡片显示模板版本。
 */
module.exports = {
  templateVersion: "1.0.0",
  apiBase: "",
  shopCode: "",
  appName: "",
  themeColor: "",
};
