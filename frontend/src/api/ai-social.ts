import { endpoints } from "@enterprise/contracts";
import { endpoint } from "./endpoint";

/**
 * AI 社交入口：只取准入状态与 AIworkin DSH 社交插件的网页入口，
 * 本站不保存任何社交数据。
 */
export const aiSocialApi = {
  entry: endpoint(endpoints.AiSocial_entry),
};
