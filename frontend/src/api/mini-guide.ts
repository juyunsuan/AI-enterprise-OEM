import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 「小程序发布说明」客户端。
 *
 * 三处入口（建站管理·小程序板块 / 各工具发布页 / 帮助中心）共用这一份取数口径：
 * - `view`：带 `tool` 时按这个工具 + 当前账号渲染（含本账号要填的值与站点域名）；
 * - `shared`：不带账号参数的通用版，给建站管理板块右侧那种「先讲清怎么做」的入口用；
 * - 管理侧两个方法给平台后台「小程序管理 → 小程序发布说明」页签用。
 */
export const miniGuideApi = {
  view: endpoint(endpoints.MiniGuide_view),
  shared: endpoint(endpoints.MiniGuide_shared),
  /** 直接下载源码包：按工具码现打 zip，返回下载直链（没有「生成代码包」这一步） */
  downloadPackage: endpoint(endpoints.MiniGuide_downloadPackage),
};

export const miniGuideAdminApi = {
  detail: endpoint(endpoints.MiniGuideAdmin_view),
  save: endpoint(endpoints.MiniGuideAdmin_save),
};
