"use client";

import { useEffect, useState } from "react";
import { App, Button, Space, Switch } from "antd";
import type { ErrandAdminSettings } from "@enterprise/contracts";
import { errandAdminApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";

/**
 * 平台后台 · 跑腿工具总闸：整块业务开关、是否允许在线收款、是否允许 AI 辅助。
 * 与各工具「启动计费」页放一起，平台管理员在一个地方看完。
 */
export function ErrandAdminPanel() {
  const { message } = App.useApp();
  const [data, setData] = useState<ErrandAdminSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    errandAdminApi
      .settings()
      .then((row) => setData(row ?? null))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "读取失败"));
  }, []);

  const save = async (patch: Partial<Pick<ErrandAdminSettings, "enabled" | "payAllowed" | "aiAllowed">>) => {
    if (!data) return;
    setSaving(true);
    try {
      const next = await errandAdminApi.saveSettings({
        body: {
          enabled: patch.enabled ?? data.enabled,
          payAllowed: patch.payAllowed ?? data.payAllowed,
          aiAllowed: patch.aiAllowed ?? data.aiAllowed,
        },
      });
      setData(next ?? data);
      message.success("跑腿平台设置已保存");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="跑腿小程序 · 平台总闸"
      titleExtra={<span className="text-12 muted">只影响整块业务与在线收款/AI 能力，不介入单个站点的经营</span>}
    >
      {error ? <Notice variant="error">{error}</Notice> : null}
      {data ? (
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div>
              <div className="text-12 muted">站点</div>
              <strong>{data.siteTotal}</strong>
              <span className="text-12 muted">（营业 {data.onlineSiteTotal}）</span>
            </div>
            <div>
              <div className="text-12 muted">订单</div>
              <strong>{data.orderTotal}</strong>
            </div>
            <div>
              <div className="text-12 muted">已支付金额</div>
              <strong>{data.gmvTotal}</strong>
            </div>
            <div>
              <div className="text-12 muted">骑手</div>
              <strong>{data.riderTotal}</strong>
            </div>
          </div>
          <Space wrap size={24}>
            <Space>
              <span>整块业务</span>
              <Switch
                checked={data.enabled}
                loading={saving}
                onChange={(checked) => void save({ enabled: checked })}
              />
            </Space>
            <Space>
              <span>允许在线收款</span>
              <Switch
                checked={data.payAllowed}
                loading={saving}
                onChange={(checked) => void save({ payAllowed: checked })}
              />
            </Space>
            <Space>
              <span>允许 AI 辅助</span>
              <Switch
                checked={data.aiAllowed}
                loading={saving}
                onChange={(checked) => void save({ aiAllowed: checked })}
              />
            </Space>
            <Button
              size="small"
              onClick={() => {
                errandAdminApi
                  .settings()
                  .then((row) => setData(row ?? null))
                  .catch(() => undefined);
              }}
            >
              刷新
            </Button>
          </Space>
          <Notice variant="info">
            关闭整块业务后：新站点/出包/骑手审核全部拒绝，已有数据保留；关闭在线收款后顾客只能线下结算；
            关闭 AI 后调度建议与经营复盘不可用，不影响订单。
          </Notice>
        </Space>
      ) : null}
    </Panel>
  );
}