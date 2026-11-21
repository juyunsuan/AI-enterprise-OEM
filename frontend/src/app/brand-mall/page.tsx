"use client";
import { useMemo, useState } from "react";
import { Button, List, Space, Tag } from "antd";
import { useRouter } from "next/navigation";
import { BRAND_SHOP_STATUS_LABELS } from "@enterprise/contracts";
import { EmptyState, Panel, TabStrip } from "@/components/ui/panel";
import { moneyCny } from "@/lib/money";
import {
  useBrandShopDetails,
  useBrandShops,
  useBrandStatTrend,
  useBrandTopProducts,
} from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "./_components/brand-shell";
import { ShopCard } from "./_components/shop-card";
import { StatBoard } from "./_components/stat-board";
import { BrandTrendChart } from "./_components/trend-chart";
import { StatusTag, withShop } from "./_components/brand-common";
import { ToolLaunchBanner } from "@/components/tool-launch/launch-banner";

/** 趋势图的时间窗：契约里 days 允许 7-90，超出会被 query schema 直接拒掉。 */
const DAY_OPTIONS = [
  { key: "7", label: "近 7 天" },
  { key: "15", label: "近 15 天" },
  { key: "30", label: "近 30 天" },
  { key: "90", label: "近 90 天" },
];

export default function BrandOverviewPage() {
  return (
    <BrandShell
      active="overview"
      title="电商小程序工具"
      desc="你自己的微信小程序商城：商品、订单、顾客、优惠券、页面装修与发版都在这一处管。收款进自己的微信商户号，平台只负责把代码包传成开发版，提审与发布在你自己的微信公众平台完成。"
    >
      <ToolLaunchBanner tool="brand-mall" />
      <BrandOverview />
    </BrandShell>
  );
}

function BrandOverview() {
  const router = useRouter();
  const { shopId, shop, shops, meta, selectShop } = useBrandScope();
  const shopsQuery = useBrandShops();
  const shopIds = useMemo(() => shops.map((item) => item.id), [shops]);
  // 每家店单独一个自检查询：某一家读失败只是那张卡片显示「读取中」，不拖垮整页。
  const details = useBrandShopDetails(shopIds);
  const [days, setDays] = useState(30);
  const trend = useBrandStatTrend({ shopId }, days);
  const topProducts = useBrandTopProducts({ shopId }, 10);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="我的商城"
        extra={
          <span className="muted text-12">
            配额 {meta?.shopCount ?? 0}/{meta?.shopQuota ?? "—"}
          </span>
        }
      >
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          }}
        >
          {(shopsQuery.data ?? []).map((item, index) => (
            <ShopCard
              key={item.id}
              shop={item}
              meta={meta}
              detail={details[index]?.data ?? null}
              current={item.id === shopId}
              onSelect={() => selectShop(item.id)}
            />
          ))}
        </div>
      </Panel>

      {shop ? (
        <Panel
          title="今日看板"
          titleExtra={
            <Space size={6}>
              <span className="muted text-12">店铺</span>
              <strong>{shop.name}</strong>
              <StatusTag meta={meta} kind="shop" value={shop.status} />
            </Space>
          }
          extra={
            <Button size="small" onClick={() => router.push(withShop("/brand-mall/setting", shopId))}>
              店铺设置
            </Button>
          }
        >
          <StatBoard shopId={shopId} meta={meta} />
        </Panel>
      ) : null}

      <Panel
        title="经营趋势"
        extra={
          <TabStrip
            items={DAY_OPTIONS.map((item) => ({ key: item.key, label: item.label }))}
            value={String(days)}
            onChange={(key) => setDays(Number(key))}
            style={{ width: "fit-content", marginBottom: 0 }}
          />
        }
      >
        {trend.isError ? (
          <EmptyState text={trend.error.message || "趋势数据读取失败"} />
        ) : (
          <BrandTrendChart points={trend.data ?? []} />
        )}
      </Panel>

      <Panel
        title="热销商品 Top 10"
        extra={
          <Button
            size="small"
            type="link"
            onClick={() => router.push(withShop("/brand-mall/goods", shopId))}
          >
            去商品管理
          </Button>
        }
      >
        {topProducts.data?.length ? (
          <List
            size="small"
            dataSource={topProducts.data}
            renderItem={(row, index) => (
              <List.Item
                actions={[
                  <Button
                    key="detail"
                    size="small"
                    type="link"
                    onClick={() =>
                      router.push(withShop(`/brand-mall/goods?keyword=${encodeURIComponent(row.title)}`, shopId))
                    }
                  >
                    查看商品
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={6}>
                      <Tag>{index + 1}</Tag>
                      <span>{row.title}</span>
                    </Space>
                  }
                  description={
                    <span className="muted text-12">
                      销量 {row.sales} · 销售额 {moneyCny(row.amount)}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <EmptyState
            text="还没有成交数据。先去上架商品并分享小程序码，出单后这里会按销量排序。"
            action={
              <Button
                type="primary"
                onClick={() => router.push(withShop("/brand-mall/goods", shopId))}
              >
                去上架商品
              </Button>
            }
          />
        )}
      </Panel>

      {shop && shop.status !== "ONLINE" ? (
        <Panel title="营业状态">
          <OfflineNotice status={shop.status} shopId={shopId} />
        </Panel>
      ) : null}
    </div>
  );
}

/** 未上线 / 被停服时把原因和「去哪儿改」说清楚，而不是只在卡片上挂个灰徽标。 */
function OfflineNotice({ status, shopId }: { status: string; shopId: number }) {
  const router = useRouter();
  const text =
    status === "SUSPENDED"
      ? "店铺被平台停服，顾客端已无法下单。请联系平台核实原因后恢复。"
      : status === "CLOSED"
        ? "店铺已关闭，商品与订单仍保留，重新开业即可恢复顾客端。"
        : "店铺还没正式营业：完成上方上线自检的所有项目后，在店铺设置里点「开始营业」。";
  return (
    <Space orientation="vertical" size={8} style={{ width: "100%" }}>
      <span className="muted text-12">
        当前状态：{BRAND_SHOP_STATUS_LABELS[status] ?? status}
      </span>
      <span>{text}</span>
      <div>
        <Button
          type="primary"
          size="small"
          onClick={() =>
            router.push(withShop(status === "CLOSED" ? "/brand-mall/setting" : "/brand-mall", shopId))
          }
        >
          {status === "CLOSED" ? "去重新开业" : "去上线自检"}
        </Button>
      </div>
    </Space>
  );
}
