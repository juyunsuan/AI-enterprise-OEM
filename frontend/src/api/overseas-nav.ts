import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/** 出海导航：用户端只读可见树；后台管理分类与站点。 */
export const overseasNavApi = {
  tree: endpoint(endpoints.OverseasNav_tree),
  adminTree: endpoint(endpoints.AdminOverseasNav_tree),
  saveCategory: endpoint(endpoints.AdminOverseasNav_saveCategory),
  removeCategory: endpoint(endpoints.AdminOverseasNav_removeCategory),
  saveItem: endpoint(endpoints.AdminOverseasNav_saveItem),
  removeItem: endpoint(endpoints.AdminOverseasNav_removeItem),
};