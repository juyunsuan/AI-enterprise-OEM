"use client";

// 订单履约：店主处理顾客订单的唯一入口（派单、推进状态、收款登记、加钟、签收、取消）。
import { OnsiteShell } from "../_components/onsite-shell";
import { OrderPanel } from "../_components/order-panel";

/**
 * 一单一条主线：待付款 → 待接单 → 已接单 → 出发 → 到达 → 服务中 → 完成 → 签收 → 评价。
 * 钱直接进店主自己的微信商户号，平台不经手；没配商户号时可以用「线下收款标记」闭环。
 */
export default function OnsiteOrderPage() {
  return (
    <OnsiteShell
      active="order"
      title="订单履约"
      desc="顾客在小程序下的每一单都进这里：先派单或让技师自接单，再按出发、到达、开始、完成四个节点推进；未付款的单可以登记线下收款，也可以在顾客确认不了时代签收。状态只能按流程往前推，退款处理中的单要先去「售后与安全」把退款处理完。"
    >
      <OrderPanel />
    </OnsiteShell>
  );
}
