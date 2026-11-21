"use client";
// 评价口碑：顾客评价的放行/隐藏与回复、技师申诉裁决、意见反馈处理，三个页签共用一套评价动作。
import { PanelTabs } from "@/components/ui/panel";
import { useOnsitePanel } from "../_components/onsite-common";
import { OnsiteShell } from "../_components/onsite-shell";
import { AppealPanel } from "../_components/appeal-panel";
import { FeedbackPanel } from "../_components/feedback-panel";
import { ReviewPanel } from "../_components/review-panel";

const PANELS = ["review", "appeal", "feedback"];

function ReviewView() {
  const [panel, setPanel] = useOnsitePanel("review", PANELS);
  return (
    <PanelTabs
      value={panel}
      onChange={setPanel}
      items={[
        { key: "review", label: "评价", children: <ReviewPanel /> },
        { key: "appeal", label: "技师申诉", children: <AppealPanel /> },
        { key: "feedback", label: "意见反馈", children: <FeedbackPanel /> },
      ]}
    />
  );
}

export default function OnsiteReviewPage() {
  return (
    <OnsiteShell
      active="review"
      title="评价口碑"
      desc="这一页决定顾客在小程序里「看到什么口碑」：放行后的评价才会展示并计入技师评分，你的回复紧跟在评价下方并通知顾客；技师申诉一旦裁定成立，对应差评会被隐藏并重算评分；意见反馈处理完即结案。切到对应页签处理，动作实时生效，无需重新发布小程序。"
    >
      <ReviewView />
    </OnsiteShell>
  );
}
