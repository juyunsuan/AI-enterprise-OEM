"use client";
// 财务分账：收入概览与佣金台账、余额与充值、技师结算、提现审核。资金直进店主自己的商户账户，平台不经手也不垫佣。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { BalancePanel } from "../_components/balance-panel";
import { FinanceOverviewPanel } from "../_components/finance-overview-panel";
import { SettlementPanel } from "../_components/settlement-panel";
import { WithdrawalPanel } from "../_components/withdrawal-panel";

const PANELS = ["overview", "balance", "settlement", "withdrawal"];

function FinanceView() {
  const [panel, setPanel] = useOnsitePanel("overview", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "overview", label: "收入与分账", children: <FinanceOverviewPanel /> },
        { key: "balance", label: "余额与充值", children: <BalancePanel /> },
        { key: "settlement", label: "技师结算", children: <SettlementPanel /> },
        { key: "withdrawal", label: "提现审核", children: <WithdrawalPanel /> },
      ]}
    />
  );
}

export default function OnsiteFinancePage() {
  return (
    <OnsiteShell
      active="finance"
      title="财务分账"
      desc="成交金额、佣金与各承担方的账在这页逐单可核：佣金按层级规则矩阵从成交额中拆出，技师与代理按比例分担，平台不垫钱；余额是顾客的储值负债，充值到账需店主确认；技师结算与提现审核只做状态推进与打款登记，资金走店主自己的微信/支付宝或对公账户。"
    >
      <FinanceView />
    </OnsiteShell>
  );
}
