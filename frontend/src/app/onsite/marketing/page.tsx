"use client";
// 营销增长：券、邀请有礼与邀请记录。奖励与券都只走站内余额/积分/券，不做现金返利。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { ActivityPanel } from "../_components/activity-panel";
import { CouponPanel } from "../_components/coupon-panel";
import { InvitePanel } from "../_components/invite-panel";

const PANELS = ["coupon", "activity", "invite"];

function MarketingView() {
  const [panel, setPanel] = useOnsitePanel("coupon", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "coupon", label: "优惠券", children: <CouponPanel /> },
        { key: "activity", label: "邀请有礼", children: <ActivityPanel /> },
        { key: "invite", label: "邀请记录", children: <InvitePanel /> },
      ]}
    />
  );
}

export default function OnsiteMarketingPage() {
  return (
    <OnsiteShell
      active="marketing"
      title="营销增长"
      desc="券：满减/折扣/新客券按分类或服务限定使用范围，发券按顾客定向；邀请有礼：被邀请人首单支付成功后给邀请人发余额/积分/券，一条绑定只发一次；邀请记录看谁在帮你带人。营销只发放站内权益，不做现金返利，也不需要重新出包。"
    >
      <MarketingView />
    </OnsiteShell>
  );
}
