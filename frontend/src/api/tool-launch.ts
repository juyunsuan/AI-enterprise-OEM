import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 建站工具「启动设置」客户端。
 *
 * 用户侧四个方法给卡片页 / 启动页 / 各工具横幅共用；
 * 管理侧给平台后台「启动计费口径」页用（价目仍存 module_pricing，与「价目与用量」同一真源）。
 */
export const toolLaunchApi = {
  states: endpoint(endpoints.ToolLaunch_states),
  detail: endpoint(endpoints.ToolLaunch_detail),
  start: endpoint(endpoints.ToolLaunch_start),
  stop: endpoint(endpoints.ToolLaunch_stop),
};

export const toolLaunchAdminApi = {
  overview: endpoint(endpoints.ToolLaunchAdmin_overview),
  savePricing: endpoint(endpoints.ToolLaunchAdmin_savePricing),
  savePolicy: endpoint(endpoints.ToolLaunchAdmin_savePolicy),
  subscriptions: endpoint(endpoints.ToolLaunchAdmin_subscriptions),
  toggle: endpoint(endpoints.ToolLaunchAdmin_toggle),
};
