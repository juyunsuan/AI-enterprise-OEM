import {
  apiEnvelope,
  endpoints,
  miniprogramPackageFileSchema,
  type MiniprogramPackageFile,
} from "@enterprise/contracts";
import { endpoint } from "./endpoint";
import { http } from "./http";

/** 用户版小程序·用户侧：绑定状态与微信绑定。 */
export const miniProgramApi = {
  status: endpoint(endpoints.MiniProgram_status),
  bind: endpoint(endpoints.MiniProgram_bind),
};

/** 用户版小程序·平台管理端：配置、小程序码与内置包。 */
export const miniProgramAdminApi = {
  settings: endpoint(endpoints.MiniProgramAdmin_settings),
  saveSettings: endpoint(endpoints.MiniProgramAdmin_saveSettings),
  test: endpoint(endpoints.MiniProgramAdmin_test),
  qrcode: endpoint(endpoints.MiniProgramAdmin_qrcode),
  builtin: endpoint(endpoints.MiniProgramAdmin_builtin),
};

/** 小程序码图片上传（UPLOAD 模式）：返回 OSS 元数据，再交给 qrcode 写回设置。 */
export async function uploadMiniProgramQrcode(
  file: File,
): Promise<MiniprogramPackageFile> {
  const form = new FormData();
  form.append("file", file);
  const result = await http(
    "/api/backend/enterprise/admin/miniprogram/qrcode/upload",
    apiEnvelope(miniprogramPackageFileSchema),
    { method: "POST", body: form, timeoutMs: 60000 },
  );
  if (!result.data.data) throw new Error("小程序码上传没有返回结果");
  return result.data.data;
}

/** 内置代码包下载：走后端二进制路由，直接由浏览器打开保存。 */
export function builtinDownloadUrl(fileName: string) {
  return `/api/backend/enterprise/admin/miniprogram/builtin/${encodeURIComponent(fileName)}/download`;
}
