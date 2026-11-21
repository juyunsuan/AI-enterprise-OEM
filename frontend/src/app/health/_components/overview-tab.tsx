"use client";

import { Button, Progress, Space, Tag } from "antd";
import { useRouter } from "next/navigation";
import type { HealthGuideStep } from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import {
  HEALTH_TAB_KEYS,
  LoadError,
  StatBlock,
  StatsGrid,
  cny,
  useHealthResource,
} from "./health-common";
import { useHealthScope, useHealthShopId } from "./health-scope";

/**
 * 总览：开店引导 + 店内存量计数 + 近 7 天小趋势。
 * 完整经营看板在「看板」页签，这里只放店主每天扫一眼就够的信号。
 */

export function OverviewTab({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const router = useRouter();
  const shopId = useHealthShopId();
  const { shop, overview } = useHealthScope();
  const dashboard = useHealthResource(
    () => healthApi.dashboard({ query: { shopId, days: 7 } }),
    [shopId],
    shopId > 0,
  );

  const steps = overview?.steps ?? [];
  const done = steps.filter((item) => item.done).length;
  const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const counters = overview?.counters;
  const trend = dashboard.data?.trend ?? [];
  const peak = Math.max(1, ...trend.map((point) => Number(point.payCents || 0)));

  // 引导步骤里能落到本工作台页签的直接切，剩下的按后端给的 href 跳。
  const goStep = (step: HealthGuideStep) => {
    if (step.action && HEALTH_TAB_KEYS.includes(step.action)) {
      onNavigate(step.action);
      return;
    }
    if (step.href) router.push(step.href);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {overview && !overview.open ? (
        <Notice variant="warn">
          平台当前未开放健康管理板块：店内数据只读，恢复后小程序端与工作台自动可用。
        </Notice>
      ) : null}
      {shop?.status === "DRAFT" ? (
        <Notice variant="info">
          店铺还没上线营业：顾客扫码进不来，也不能下单。去「店铺设置」补齐资料、在「微信凭据」填好 AppID 后把状态切到「营业中」。
        </Notice>
      ) : null}

      <Panel
        title="开店引导"
        titleExtra={
          <span className="muted text-12">
            {steps.length ? `已完成 ${done}/${steps.length}` : "读取中…"}
          </span>
        }
      >
        {steps.length ? (
          <>
            <Progress percent={percent} size="small" />
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {steps.map((step) => (
                <div
                  key={step.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 12,
                    alignItems: "center",
                    borderBottom: "1px solid var(--border)",
                    paddingBottom: 10,
                  }}
                >
                  <div style={{ display: "grid", gap: 2 }}>
                    <strong>{step.label}</strong>
                    <span className="muted text-12">{step.desc}</span>
                  </div>
                  <Tag color={step.done ? "green" : "default"}>
                    {step.done ? "已完成" : "待完成"}
                  </Tag>
                  {step.done ? (
                    <span />
                  ) : (
                    <Button size="small" onClick={() => goStep(step)}>
                      去完成
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState text="还没有可执行的引导步骤：等店铺信息读取完成后这里会列出下一步。" />
        )}
      </Panel>

      <Panel
        title="店内存量"
        titleExtra={<span className="muted text-12">待审核与预警可直接点进去处理</span>}
      >
        <StatsGrid>
          <StatBlock title="顾客" value={counters?.customers ?? 0} hint="微信登录顾客总数" />
          <StatBlock title="就诊人" value={counters?.patients ?? 0} hint="已建档的就诊人" />
          <StatBlock title="机构" value={counters?.organs ?? 0} hint="医院、诊所、药房等主体" />
          <StatBlock title="医护" value={counters?.practitioners ?? 0} hint="认证通过的执业人员" />
          <JumpStat
            title="待审核"
            value={counters?.pendingAudits ?? 0}
            hint="入驻申请与机构医护认证"
            tab="organs"
            onNavigate={onNavigate}
          />
          <StatBlock title="进行中订单" value={counters?.openOrders ?? 0} hint="未完成、未取消的订单" />
          <JumpStat
            title="未处理预警"
            value={counters?.alerts ?? 0}
            hint="指标异常等待医护跟进"
            tab="metrics"
            onNavigate={onNavigate}
          />
          <StatBlock title="待随访" value={counters?.followups ?? 0} hint="待执行与已逾期任务" />
        </StatsGrid>
      </Panel>

      <Panel
        title="近 7 天"
        titleExtra={<span className="muted text-12">支付额走势，完整看板见「看板」页签</span>}
        extra={
          <Space size={8}>
            {dashboard.data ? (
              <span className="muted text-12">
                支付 {cny(dashboard.data.payCents)} · {dashboard.data.orderCount} 单 · 新增顾客{" "}
                {dashboard.data.customerNew}
              </span>
            ) : null}
            <Button size="small" loading={dashboard.loading} onClick={() => void dashboard.reload()}>
              刷新
            </Button>
          </Space>
        }
      >
        {dashboard.error ? <LoadError text={dashboard.error} /> : null}
        {trend.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {trend.map((point) => (
              <div
                key={point.day}
                style={{ display: "grid", gridTemplateColumns: "92px 1fr 120px", gap: 10, alignItems: "center" }}
              >
                <span className="text-12 muted">{point.day}</span>
                <div style={{ background: "var(--border)", borderRadius: 4, height: 10 }}>
                  <div
                    style={{
                      width: `${Math.round((Number(point.payCents || 0) / peak) * 100)}%`,
                      minWidth: Number(point.payCents) > 0 ? 2 : 0,
                      background: "var(--ant-color-primary, #3370ff)",
                      height: 10,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <span className="text-12">
                  {cny(point.payCents)} · {point.orderCount} 单
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="最近 7 天还没有成交：顾客扫码进店并完成首单后这里就有数据。" />
        )}
      </Panel>
    </div>
  );
}

/** 可点击的计数块：待审核、预警这类「点进去就办事」的入口。 */
function JumpStat({
  title,
  value,
  hint,
  tab,
  onNavigate,
}: {
  title: string;
  value: number;
  hint: string;
  tab: string;
  onNavigate: (tab: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(tab)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNavigate(tab);
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <StatBlock title={title} value={value} hint={hint} />
    </div>
  );
}
