/**
 * 数字人分身小程序包内配置（模板占位文件）。
 *
 * `apiBase / siteCode / siteName / themeColor` 四个键必须保持「键名 + 空串」各占一行：
 * 下面这些「键名 + 空串」占位由你在微信开发者工具里按平台「小程序发布说明」逐项填写
 * （平台输出的是统一源码分发包，包内不含账号参数；
 * 要填哪些键见平台「建站管理 → 小程序发布说明」。
 * 仓库里这份源码永不改动，所有站点共用。
 *
 * - apiBase：本站 API 基址（https://host，无尾斜杠）。微信要求 request 合法域名
 *   先在小程序后台登记，域名必须随包带出，端上不写死任何站点。
 * - siteCode：站点寻址码，所有公开接口都靠 ?site= 定位租户。
 * - siteName / themeColor：留空时回落服务端 /config 的同名字段，
 *   站点改装修配置不必重新出包。
 * - templateVersion：不用改，只给后台「内置模板」卡片显示模板版本。
 */
module.exports = {
  templateVersion: "1.0.0",
  apiBase: "",
  siteCode: "",
  siteName: "",
  themeColor: "",
};
