"use client";

// 上门服务排期分区：档期看板（时间片怎么切给顾客看）+ 休息与工作量（锁档与回看干了多久）。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { StaffRestPanel } from "../_components/staff-rest-panel";
import { TimelinePanel } from "../_components/timeline-panel";

const PANELS = ["timeline", "rest"];

function ScheduleView() {
  const [panel, setPanel] = useOnsitePanel("timeline", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "timeline", label: "排期看板", children: <TimelinePanel onOpenPanel={setPanel} /> },
        { key: "rest", label: "休息与工作量", children: <StaffRestPanel onOpenPanel={setPanel} /> },
      ]}
    />
  );
}

/**
 * 顾客端能看到哪些时间片、能不能下单，全部由这里的档期规则决定；
 * 时间片粒度、缓冲、可约天数、提前预约时长来自「店铺设置 → 交易参数」，不在本页维护。
 */
export default function OnsiteSchedulePage() {
  return (
    <OnsiteShell
      // 顶部导航没有独立的「排期」入口：本页由「技师排期」进入，高亮沿用 staff 键。
      active="staff"
      title="排期与工时"
      desc="顾客在小程序里能选哪些时间，就是这一页算出来的：排期看板按店铺的「时间片粒度」把每位在岗技师的可服务时段切成一段一段，被订单占用（含未付款，占档到超时取消为止）、被休息段盖住、超过当日接单上限、或没满足「最少提前预约时长」的时间片，在顾客端都是置灰不可选。这里看到的和顾客端完全同源，所以「为什么这一档约不上」在本页就能回答。休息与工作量页签给技师加一段休息（可跨天、可只占半天），保存后两端同步锁档；工时表回看每人每天的服务时长与在路时长，用来判断该不该调时段、调上限。要改时间片粒度、可约天数、缓冲与提前量，请到「店铺设置 → 交易与运营参数」。"
    >
      <ScheduleView />
    </OnsiteShell>
  );
}
