"use client";

// 售后与安全：退款单据处理与一键报警台账两条独立子流程，用 ?panel= 深链直达。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { AlertPanel } from "../_components/alert-panel";
import { RefundPanel } from "../_components/refund-panel";

const PANELS = ["refund", "alert"];

function AftersaleView() {
  const [panel, setPanel] = useOnsitePanel("refund", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "refund", label: "退款售后", children: <RefundPanel /> },
        { key: "alert", label: "一键报警", children: <AlertPanel /> },
      ]}
    />
  );
}

/**
 * 退款走店主自己的微信商户号原路退回，平台不经手资金；
 * 报警是服务人员的人身安全兜底，未处理的记录永远排在最前。
 */
export default function OnsiteAftersalePage() {
  return (
    <OnsiteShell
      active="aftersale"
      title="售后与安全"
      desc="两件事分开处理：退款申请在这里试算可退余额、同意或驳回，钱从你自己的微信支付商户号原路退回顾客微信，平台不经手资金；一键报警是服务人员的人身安全兜底，收到站内提醒后进来处理，处置必须写清联系了谁、结果如何。"
    >
      <AftersaleView />
    </OnsiteShell>
  );
}
