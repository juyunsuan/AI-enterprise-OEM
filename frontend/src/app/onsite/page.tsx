"use client";

// 上门服务小程序工具：一个菜单进来，靠页头导航切分工作区（总览 / 目录 / 技师 / 订单 / 售后 / 评价 / 顾客 / 内容 / 发布 / 设置）。
import { OnsiteShell } from "./_components/onsite-shell";
import { OverviewTab } from "./_components/overview-tab";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

/**
 * 每个平台账号都能开一部自己的上门服务小程序：服务目录、服务人员排期、
 * 车费口径、订单履约与收款都在这个板块维护，小程序端（仓库 `miniprogram-onsite/`）
 * 按本店铺配置出包，用户下载后在微信开发者工具里自己填参数并上传发布（本站不代传）。
 */
export default function OnsitePage() {
  return (
    <OnsiteShell
      active="overview"
      title="上门服务小程序工具"
      desc="开店三步：先建店铺（它就是这部小程序的业务底座），再绑定你自己的小程序 AppID 与微信支付商户号，最后在「发布」页直接下载源码包、按发布说明在微信开发者工具自助上传与提审。顾客的钱直接进你的商户号，平台不经手资金。"
    >
      <ToolLaunchBanner tool="onsite" />
      <OverviewTab />
    </OnsiteShell>
  );
}
