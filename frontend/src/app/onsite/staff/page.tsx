"use client";

// 技师排期分区：人力台账（技师档案与接单状态）+ 等级分档参数，两条子流程各自一页签。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { StaffLevelPanel } from "../_components/staff-level-panel";
import { StaffPanel } from "../_components/staff-panel";

const PANELS = ["staff", "level"];

function StaffView() {
  const [panel, setPanel] = useOnsitePanel("staff", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "staff", label: "技师", children: <StaffPanel onOpenPanel={setPanel} /> },
        { key: "level", label: "等级", children: <StaffLevelPanel onOpenPanel={setPanel} /> },
      ]}
    />
  );
}

/**
 * 技师是顾客端「挑人」的唯一来源：状态、可服务时段、每日接单上限、车费与自定价开关
 * 都直接下发到小程序下单页；等级则给出这一档的分成、加钟费率与入驻协议。
 */
export default function OnsiteStaffPage() {
  return (
    <OnsiteShell
      active="staff"
      title="技师与等级"
      desc="技师就是顾客在小程序里挑的那批人：只有状态为「在岗」的技师会出现在技师列表、排期看板和派单候选里，改成休息/停用/离场后顾客端立刻选不到他（历史订单仍保留他的姓名与档案）。档案里的可服务时段、每日接单上限、是否允许自定服务价与车费，决定顾客能看到哪些时间片、下单时收多少钱；自助报名进来的技师要先在这里通过入驻。等级是另一件事：它给出这一档的服务费分成、加钟加收比例、升级业绩与在岗时长门槛，以及技师入驻时看到的协议文章。技师本人改头像、简介、手机号等资料会先进入「资料审核」，你通过后小程序端才换成新内容。"
    >
      <StaffView />
    </OnsiteShell>
  );
}
