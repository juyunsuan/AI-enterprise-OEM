"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { useSiteBrand } from "@/lib/site-brand";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * 顶栏「下载客户端」入口：只在管理员配了下载地址时出现，点击直接打开那个地址。
 * 地址由「站点设置 → 客户端下载地址」维护，未配置时整个图标不渲染。
 */
export function ClientDownloadEntry() {
  const { t } = useI18n();
  const { clientDownloadUrl } = useSiteBrand();
  const url = (clientDownloadUrl || "").trim();
  if (!url) return null;
  return (
    <Tooltip title={t("下载客户端")} key="client-download">
      <Button
        type="text"
        size="small"
        icon={<DownloadOutlined />}
        style={{ opacity: 0.65 }}
        aria-label={t("下载客户端")}
        onClick={() => {
          // 站内路径同窗口信任跳转；外链一律新标签打开，避免把本站页面顶掉。
          if (url.startsWith("/")) window.location.href = url;
          else window.open(url, "_blank", "noopener,noreferrer");
        }}
      />
    </Tooltip>
  );
}