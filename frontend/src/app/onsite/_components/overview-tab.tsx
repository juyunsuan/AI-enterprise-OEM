"use client";

// 总览：店铺状态与营业开关 + 上线步骤（缺什么给什么入口），页签导航本身由外壳负责。
import {
  CheckCircleOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { App, Button, Space, Switch } from "antd";
import { useRouter } from "next/navigation";
import { useOnsiteShopActions } from "@/query/onsite";
import {
  EmptyState,
  Notice,
  Panel,
  StatCard,
  StatGrid,
} from "@/components/ui/panel";
import { statusText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

export function OverviewTab() {
  const router = useRouter();
  const { message } = App.useApp();
  const { shop, overview, reloadOverview } = useOnsiteScope();
  const setStatus = useOnsiteShopActions().setStatus;

  if (!shop) {
    return (
      <Panel title="我的上门服务店铺">
        <EmptyState text="店铺信息还没就绪，请刷新页面或稍后再试。" />
      </Panel>
    );
  }

  const toggleOnline = async (checked: boolean) => {
    await setStatus.mutateAsync({
      params: { id: String(shop.id) },
      body: { status: checked ? "ONLINE" : "DRAFT", reason: "" },
    });
    message.success(checked ? "已开启营业，小程序端可以下单了" : "已切回未上线状态");
    await reloadOverview();
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel title="我的上门服务店铺">
        <StatGrid>
          <StatCard
            label="店铺名称"
            value={shop.name}
            hint={`店铺码 ${shop.shopCode}`}
          />
          <StatCard
            label="营业状态"
            value={statusText("shop", shop.status)}
            hint={
              shop.status === "SUSPENDED"
                ? shop.offReason || "平台已停服"
                : "小程序端能否下单以这里为准"
            }
          />
          <StatCard
            label="在线收款"
            value={shop.payEnabled ? "已配置" : "未配置"}
            hint={
              shop.payEnabled
                ? "顾客付款直接进你自己的商户号"
                : "未配商户号时只能线下收款标记"
            }
          />
          <StatCard
            label="小程序主体"
            value={shop.appConfigured ? "已绑定" : "未绑定"}
            hint="绑定自己的 AppID 后才能出包上传"
          />
        </StatGrid>
        <Space style={{ marginTop: 16 }}>
          <span>开启营业</span>
          <Switch
            checked={shop.status === "ONLINE"}
            loading={setStatus.isPending}
            disabled={shop.status === "SUSPENDED"}
            onChange={(checked) => void toggleOnline(checked)}
          />
        </Space>
        {shop.status === "DRAFT" ? (
          <Notice variant="warn">
            店铺还没开启营业。开启前需要完成微信凭据自检；服务与技师没配好就营业，顾客会看到空目录。
          </Notice>
        ) : null}
      </Panel>

      <Panel title="上线步骤">
        {(overview?.steps ?? []).map((step) => (
          <div
            key={step.key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: "1px solid rgba(31,35,41,0.06)",
            }}
          >
            <Space align="start">
              {step.done ? (
                <CheckCircleOutlined style={{ color: "#00b42a", marginTop: 4 }} />
              ) : (
                <ThunderboltOutlined style={{ color: "#ff9a2e", marginTop: 4 }} />
              )}
              <div>
                <div>{step.label}</div>
                <div className="muted">{step.desc}</div>
              </div>
            </Space>
            {step.done || !step.href ? null : (
              <Button type="link" onClick={() => router.push(step.href)}>
                {step.action || "去完成"} <RightOutlined />
              </Button>
            )}
          </div>
        ))}
        <Notice variant="info">
          小程序码用于线下物料与朋友圈投放：在「小程序发布 → 代码包与上传」生成，扫码直接进入本店铺首页。
        </Notice>
      </Panel>
    </Space>
  );
}
