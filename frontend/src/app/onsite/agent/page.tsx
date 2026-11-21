"use client";
// 代理分销：区域代理 / 业务员 / 渠道 / 合伙人 / 分销商 / 绑定关系。归属关系决定一单成交的佣金分给谁。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { AgentRegionPanel } from "../_components/agent-region-panel";
import { ChannelPanel } from "../_components/channel-panel";
import { DistributorPanel } from "../_components/distributor-panel";
import { PartnerPanel } from "../_components/partner-panel";
import { RelationPanel } from "../_components/relation-panel";
import { SalesmanPanel } from "../_components/salesman-panel";

const PANELS = ["agent", "salesman", "channel", "partner", "distributor", "relation"];

function AgentView() {
  const [panel, setPanel] = useOnsitePanel("agent", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "agent", label: "区域代理", children: <AgentRegionPanel /> },
        { key: "salesman", label: "业务员", children: <SalesmanPanel /> },
        { key: "channel", label: "渠道商", children: <ChannelPanel /> },
        { key: "partner", label: "合伙人", children: <PartnerPanel /> },
        { key: "distributor", label: "分销商", children: <DistributorPanel /> },
        { key: "relation", label: "绑定关系", children: <RelationPanel /> },
      ]}
    />
  );
}

export default function OnsiteAgentPage() {
  return (
    <OnsiteShell
      active="agent"
      title="代理分销"
      desc="同一条顾客归属可以挂推荐人、渠道、业务员、区域代理：成交时各自按自己的比例进佣金台账，退款按比例冲销。代理按省/市/区县挂上级，业务员挂代理，合伙人是技师档案上的额外身份，分销商由顾客申请后审核定级。比例改动只影响新订单，历史单按成交快照结算。"
    >
      <AgentView />
    </OnsiteShell>
  );
}
