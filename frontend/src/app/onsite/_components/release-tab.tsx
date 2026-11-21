"use client";

// 代码包页签：直接下载统一源码包（zip），解压后在微信开发者工具里自填参数并上传。
// 没有「生成代码包」按钮，也没有发布台账：包是平台模板源码，点了就下。
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";

export function ReleaseTab({
  onOpenTab,
}: {
  shopId: number;
  onOpenTab: (tab: string) => void;
}) {
  return (
    <MiniProgramPublishGuide
      tool="onsite"
      onOpenSettings={() => onOpenTab("wechat")}
    />
  );
}
