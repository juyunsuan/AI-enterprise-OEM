"use client";

// 概览页签：站点经营数字 + 四类渠道就绪状态 + 待办入口。
import {
  AudioOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  VideoCameraOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { App, Button, Skeleton, Space } from "antd";
import { useCallback, useEffect, useState } from "react";
import {
  DH_CHANNEL_CAPABILITIES,
  DH_CHANNEL_CAPABILITY_LABELS,
  DH_SITE_STATUS_LABELS,
  type DhOverview,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { Notice, Panel, StatCard, StatGrid } from "@/components/ui/panel";
import { yuan } from "./shared";

export function OverviewTab({ onOpen }: { onOpen: (tab: string) => void }) {
  const { message } = App.useApp();
  const [data, setData] = useState<DhOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await digitalHumanApi.overview());
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "概览加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!data) return null;

  const missing = DH_CHANNEL_CAPABILITIES.filter((key) => !data.channelsReady[key]);
  const todo =
    data.pendingApplies + data.pendingWithdraws + data.pendingFeedbacks;

  return (
    <Space orientation="vertical" size={14} style={{ width: "100%" }}>
      {missing.length ? (
        <Notice variant="warn">
          还有 {missing.length} 类能力没有可用渠道（
          {missing.map((key) => DH_CHANNEL_CAPABILITY_LABELS[key]).join("、")}
          ），会员提交对应任务会直接失败。
          <Button type="link" size="small" onClick={() => onOpen("channels")}>
            去配置模型
          </Button>
        </Notice>
      ) : null}
      {!data.payEnabled ? (
        <Notice variant="warn">
          站点还没有可用的微信支付商户号，小程序端会隐藏支付按钮（只能浏览与卡密兑换）。
          <Button type="link" size="small" onClick={() => onOpen("publish")}>
            去配置主体凭据
          </Button>
        </Notice>
      ) : null}


      <Panel
        title="站点概况"
        titleExtra={
          <span className="muted text-12">
            {data.siteCode} · {DH_SITE_STATUS_LABELS[data.status] || data.status}
          </span>
        }
        extra={
          <Button size="small" onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        }
      >
        <StatGrid>
          <StatCard label="会员" value={data.memberCount} hint={`其中会员 ${data.vipCount}`} icon={<TeamOutlined />} />
          <StatCard label="作品" value={data.workCount} hint={`进行中任务 ${data.taskRunning}`} icon={<VideoCameraOutlined />} />
          <StatCard label="订单" value={data.orderCount} hint={`今日 ${data.todayOrderCount} 单`} icon={<WalletOutlined />} />
          <StatCard label="累计实收" value={yuan(data.paidAmountCents)} hint={`已消耗算力 ${data.pointConsumed}`} />
          <StatCard label="未用卡密" value={data.cardUnused} onClick={() => onOpen("cards")} />
          <StatCard label="待处理" value={todo} hint={`申请 ${data.pendingApplies} · 提现 ${data.pendingWithdraws} · 反馈 ${data.pendingFeedbacks}`} onClick={() => onOpen("distribution")} />
        </StatGrid>
      </Panel>

      <Panel title="能力就绪">
        <Space size={24} wrap>
          {DH_CHANNEL_CAPABILITIES.map((key) => {
            const ready = data.channelsReady[key];
            return (
              <Space key={key} size={6}>
                {ready ? (
                  <CheckCircleOutlined style={{ color: "var(--success, #52c41a)" }} aria-hidden />
                ) : (
                  <CloseCircleOutlined style={{ color: "var(--error, #ff4d4f)" }} aria-hidden />
                )}
                <span>{DH_CHANNEL_CAPABILITY_LABELS[key]}</span>
              </Space>
            );
          })}
          <Space size={6}>
            <AudioOutlined aria-hidden />
            <span>{data.payEnabled ? "微信支付已开通" : "微信支付未配置"}</span>
          </Space>
        </Space>
      </Panel>
    </Space>
  );
}
