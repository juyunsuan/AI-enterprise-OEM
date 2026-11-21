/**
 * 健康管理小程序的包内配置。
 *
 * `apiBase` 与 `shopCode` 在仓库里是空串占位：由你在微信开发者工具里按发布说明填写
 * （见 backend/src/private-mini/package-builder.ts）。微信要求 request 合法域名在小程序
 * 后台预先登记，所以域名本质上要随包带出；店铺码决定这部小程序属于哪家健康管理店铺。
 * 本地调试可在「我的 → 服务器地址」临时覆盖 apiBase，保存值优先于本文件。
 */
module.exports = {
  templateVersion: "1.1.0",
  apiBase: "",
  shopCode: "",
};
