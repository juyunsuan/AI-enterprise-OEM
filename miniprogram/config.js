/**
 * 小程序运行配置。
 *
 * `apiBase` 是站内接口的基址（客户自有域名）。微信要求 request 合法域名在
 * 小程序后台预先登记，因此这个域名本质上要随包带出——打包时用
 * `MINIPROGRAM_API_BASE` 注入（见 scripts/pack-miniprogram.mjs）。
 *
 * 留空时不写死任何地址：小程序「我的 → 服务器地址」里可随时填写并保存，
 * 便于本地调试与临时切换；保存值优先于本文件。
 */
module.exports = {
  apiBase: "",
};
