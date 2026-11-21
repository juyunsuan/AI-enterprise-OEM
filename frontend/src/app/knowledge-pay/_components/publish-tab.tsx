"use client";

// 发布页：直接下载统一源码包（zip），解压后在微信开发者工具里自己填参数、编译上传。
// 没有「生成代码包」按钮，也没有发布台账：包是平台模板源码，点了就下。
import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";

export function PublishTab({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <MiniProgramPublishGuide tool="knowledge-pay" onOpenSettings={onOpenSettings} />
  );
}
