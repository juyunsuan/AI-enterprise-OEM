"use client";
// 顾客私域：顾客名单与拉黑、内容页留资线索跟进、号码保护屏蔽留痕审计。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { CustomerPanel } from "../_components/customer-panel";
import { ShieldPanel } from "../_components/shield-panel";
import { SubmissionPanel } from "../_components/submission-panel";

const PANELS = ["customer", "submission", "shield"];

function CustomerView() {
  const [panel, setPanel] = useOnsitePanel("customer", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "customer", label: "顾客", children: <CustomerPanel /> },
        { key: "submission", label: "留资线索", children: <SubmissionPanel /> },
        { key: "shield", label: "号码保护", children: <ShieldPanel /> },
      ]}
    />
  );
}

export default function OnsiteCustomerPage() {
  return (
    <OnsiteShell
      active="customer"
      title="顾客私域"
      desc="这里管的是进店后的「人」而不是单：拉黑立即挡掉该顾客在小程序的再次下单（历史订单与评价保留）；留资线索通过后可按手机号代客下单转成正式订单；号码保护列表是屏蔽与真实号码可见性的审计留痕。以上每项都即时反映到顾客的小程序端，不需要重新出包。"
    >
      <CustomerView />
    </OnsiteShell>
  );
}
