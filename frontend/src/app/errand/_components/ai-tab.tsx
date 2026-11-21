"use client";

import { useState } from "react";
import { App, Button, InputNumber, Space, Tag } from "antd";
import type { ErrandAiOpsResult } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";

/** AI 经营复盘：走平台模型网关，未配模型时自动回落规则式结论。 */
export function AiTab() {
  const { message } = App.useApp();
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<ErrandAiOpsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const row = await errandApi.aiOps({ body: { days } });
      setResult(row ?? null);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "AI 复盘失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="AI 经营复盘"
        titleExtra={
          <Space>
            <span className="muted text-12">统计范围</span>
            <InputNumber min={1} max={30} value={days} onChange={(value) => setDays(Number(value) || 7)} />
            <span className="muted text-12">天</span>
            <Button type="primary" loading={loading} onClick={() => void run()}>
              生成复盘
            </Button>
          </Space>
        }
      >
        <Notice variant="info">
          AI 使用账号在「模型服务 → 模型设置」里配置的渠道与模型（平台模型网关统一计量）；
          没有可用模型时会给出规则式结论，不影响正常经营。订单详情页的「AI 调度建议」同理。
        </Notice>
        {result ? (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <Space>
              <Tag color={result.aiGenerated ? "blue" : "default"}>
                {result.aiGenerated ? `模型：${result.model}` : "规则式兜底"}
              </Tag>
            </Space>
            <div style={{ lineHeight: 1.8 }}>{result.summary}</div>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
              {result.suggestions.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
