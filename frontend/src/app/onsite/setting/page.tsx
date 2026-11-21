"use client";

// 店铺设置：资料与交易参数 / 城市与车费 / 客服与私域（AI 客服站点与企微 SCRM 活码，两条链路互不依赖）。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { SettingTab } from "../_components/setting-tab";
import { CityPanel } from "../_components/city-panel";
import { ServiceConfigPanel } from "../_components/service-config-panel";

const PANELS = ["shop", "city", "service"];

function SettingView() {
  const [panel, setPanel] = useOnsitePanel("shop", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "shop", label: "店铺与交易", children: <SettingTab /> },
        { key: "city", label: "城市与车费", children: <CityPanel /> },
        { key: "service", label: "客服与私域", children: <ServiceConfigPanel /> },
      ]}
    />
  );
}

export default function OnsiteSettingPage() {
  return (
    <OnsiteShell
      active="setting"
      title="店铺设置"
      desc="店铺资料决定小程序的门面，交易参数决定预约与算价口径：时间片粒度与前后缓冲决定可约时段怎么切，最多可约天数、最少提前预约、自动取消分钟影响订单寿命，派单模式决定是技师自接单还是店铺统一派单。改这些不用重新出包——端上每次启动都会拉最新配置。"
    >
      <SettingView />
    </OnsiteShell>
  );
}
