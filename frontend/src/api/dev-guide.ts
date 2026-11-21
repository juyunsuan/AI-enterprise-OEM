import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * 平台后台「二次开发指引」客户端。
 *
 * 主体正文来自仓库 docs/dev-kit/（后端只读渲染），这里只负责取数与保存「本站补充说明」，
 * 不维护第二份规则文案。
 */
export const devGuideAdminApi = {
  detail: endpoint(endpoints.DevGuideAdmin_view),
  save: endpoint(endpoints.DevGuideAdmin_save),
};
