"use client";

import { MiniProgramPublishGuide } from "@/components/mini-program/publish-guide";

/** 外卖发布页：与其他工具同一份统一源码包说明，单独成页签避免藏在门店设置里。 */
export function PublishTab() {
  return <MiniProgramPublishGuide tool="takeout" />;
}
