"use client";
import { useRouter } from "next/navigation";
import type { BrandMeta } from "@enterprise/contracts";
import { StatCard, StatGrid } from "@/components/ui/panel";
import { useBrandStatOverview } from "@/query/brand-mall";
import { moneyCny } from "@/lib/money";
import { withShop } from "./brand-common";

/**
 * 今日看板：一次 `BrandMall_statOverview` 全出，卡片点击直接落到对应列表页并带上 shopId。
 * 「待发货 / 待付款 / 待处理售后」三张卡是每天开工的第一屏，数字必须能点进去处理。
 */
export function StatBoard({
  shopId,
  meta,
}: {
  shopId: number;
  meta: BrandMeta | null;
}) {
  const router = useRouter();
  const { data } = useBrandStatOverview({ shopId });
  if (!data) return null;
  const go = (path: string) => router.push(withShop(path, shopId));

  return (
    <StatGrid>
      <StatCard
        label="今日订单"
        value={data.todayOrderCount}
        hint={`累计 ${data.totalOrderCount} 笔`}
        onClick={() => go("/brand-mall/order")}
      />
      <StatCard
        label="今日成交额"
        value={moneyCny(data.todayOrderAmount)}
        hint={`累计 ${moneyCny(data.totalOrderAmount)}`}
        onClick={() => go("/brand-mall/order")}
      />
      <StatCard
        label="今日新顾客"
        value={data.todayCustomerCount}
        hint={`顾客总数 ${data.totalCustomerCount}`}
        onClick={() => go("/brand-mall/customer")}
      />
      <StatCard
        label="待发货"
        value={data.pendingShipCount}
        hint={data.pendingShipCount ? "有订单等着发货" : "已发完"}
        onClick={() => go("/brand-mall/order?status=PAID")}
      />
      <StatCard
        label="待付款"
        value={data.pendingPaymentCount}
        hint="超时自动取消，见店铺设置的交易参数"
        onClick={() => go("/brand-mall/order?status=PENDING_PAYMENT")}
      />
      <StatCard
        label="待处理售后"
        value={data.pendingRefundCount}
        hint={
          meta && !meta.payAllowed
            ? "平台已关闭在线收款，退款走线下"
            : "售后超时不处理会影响顾客体验"
        }
        onClick={() => go("/brand-mall/refund?status=PENDING")}
      />
      <StatCard
        label="在售商品"
        value={data.onlineProductCount}
        hint={`支付转化 ${data.payConversionPercent}%`}
        onClick={() => go("/brand-mall/goods")}
      />
    </StatGrid>
  );
}
