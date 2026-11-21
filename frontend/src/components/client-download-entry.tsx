"use client";

import { DesktopOutlined, MobileOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { useSiteBrand } from "@/lib/site-brand";
import { useI18n } from "@/lib/i18n/i18n";

/**
 * 顶栏下载入口：手机端（AWBot）与 PC 端（AWBotDSH）各一个图标，管理员配了地址才出现，点击新窗口打开。
 * 地址由「站点设置 → 手机端下载地址 / PC 端下载地址」维护，未配置的那一项不渲染。
 */
export function ClientDownloadEntries() {
  const { t } = useI18n();
  const { mobileDownloadUrl, pcDownloadUrl } = useSiteBrand();
  const entries = [
    {
      key: "download-mobile",
      label: t("下载 AWBot 手机端"),
      url: (mobileDownloadUrl || "").trim(),
      icon: <MobileOutlined />,
    },
    {
      key: "download-pc",
      label: t("下载 AWBotDSH PC 端"),
      url: (pcDownloadUrl || "").trim(),
      icon: <DesktopOutlined />,
    },
  ];

  return (
    <>
      {entries
        .filter((entry) => entry.url)
        .map((entry) => (
          <Tooltip title={entry.label} key={entry.key}>
            <Button
              type="text"
              size="small"
              icon={entry.icon}
              style={{ opacity: 0.65 }}
              aria-label={entry.label}
              onClick={() =>
                // 管理员填的是下载页或安装包地址：一律新窗口打开，避免把本站页面顶掉。
                window.open(entry.url, "_blank", "noopener,noreferrer")
              }
            />
          </Tooltip>
        ))}
    </>
  );
}