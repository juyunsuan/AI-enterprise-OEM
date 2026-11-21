"use client";

import { DeleteOutlined, LeftOutlined } from "@ant-design/icons";
import { Button, Popconfirm, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CONSULTING_FRAMEWORK_AXES,
  type ConsultingFrameworkKey,
  type ConsultingFrameworkResult,
  type ConsultingRecommendation,
  type InsightConsultingAnalysis,
} from "@enterprise/contracts";
import {
  Notice,
  Panel,
  StatCard,
  StatGrid,
} from "@/components/ui/panel";

const STATUS_COLOR: Record<string, string> = {
  success: "green",
  failed: "red",
  running: "blue",
  pending: "default",
};

const STATUS_LABEL: Record<string, string> = {
  success: "已完成",
  failed: "失败",
  running: "生成中",
  pending: "排队中",
};

const POINT_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

const recommendationColumns: ColumnsType<ConsultingRecommendation> = [
  {
    title: "时间",
    dataIndex: "horizon",
    width: 110,
    render: (value: string) => <Tag color="blue">{value || "待定"}</Tag>,
  },
  {
    title: "建议",
    dataIndex: "title",
    width: 200,
    render: (value: string, row) => (
      <div>
        <div style={{ fontWeight: 600 }}>{value}</div>
        <div className="muted text-12">{row.action}</div>
      </div>
    ),
  },
  {
    title: "依据",
    dataIndex: "rationale",
    width: 240,
    render: (value: string, row) => (
      <div className="text-12">
        <div>{value || "-"}</div>
        {row.frameworks.length ? (
          <div className="muted" style={{ marginTop: 4 }}>
            关联：{row.frameworks.join("、")}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    title: "衡量指标",
    dataIndex: "kpi",
    width: 160,
    render: (value: string) => <span className="text-12">{value || "-"}</span>,
  },
  {
    title: "风险与应对",
    dataIndex: "risk",
    width: 220,
    render: (value: string) => <span className="text-12">{value || "-"}</span>,
  },
];

export function ConsultingReport({
  analysis,
  onBack,
  onDelete,
  deleting,
}: {
  analysis: InsightConsultingAnalysis;
  onBack: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const result = analysis.result;
  if (!result) {
    return (
      <Panel
        title="咨询报告"
        titleExtra={`${analysis.industryLabel} · ${new Date(analysis.createdAt).toLocaleString()}`}
        extra={<Button onClick={onBack}>返回</Button>}
      >
        <Notice variant="error">
          {analysis.error || "这次分析没有产出结果，请返回后重试。"}
        </Notice>
      </Panel>
    );
  }

  return (
    <>
      <Panel
        title="咨询报告"
        titleExtra={`${analysis.companyName} · ${analysis.industryLabel} · ${new Date(
          analysis.createdAt,
        ).toLocaleString()} · ${STATUS_LABEL[analysis.status] ?? analysis.status}`}
        extra={
          <Space wrap>
            <Tag color={STATUS_COLOR[analysis.status] ?? "default"}>
              {analysis.model || "统一模型网关"}
            </Tag>
            <Button icon={<LeftOutlined aria-hidden />} onClick={onBack}>
              返回
            </Button>
            <Popconfirm
              title="删除该分析记录？"
              description="删除后不可恢复，但不会影响其它报告。"
              onConfirm={onDelete}
            >
              <Button
                danger
                icon={<DeleteOutlined aria-hidden />}
                loading={deleting}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <StatGrid>
          <StatCard label="综合评分" value={`${result.overview.overallScore}/100`} />
          <StatCard label="分析模型" value={`${result.frameworks.length} 个`} />
          <StatCard label="发展阶段" value={result.overview.stage || "待确认"} />
          <StatCard label="短板/待补信息" value={`${result.infoGaps.length} 项`} />
        </StatGrid>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {result.overview.oneLineSummary}
          </div>
          {result.overview.focus ? (
            <div className="muted" style={{ marginTop: 6 }}>
              本次最该解决：{result.overview.focus}
            </div>
          ) : null}
          <Space wrap style={{ marginTop: 10 }}>
            {analysis.frameworkLabels.map((label) => (
              <Tag key={label}>{label}</Tag>
            ))}
          </Space>
        </div>
      </Panel>

      {result.frameworks.map((framework) => (
        <FrameworkPanel key={framework.key} framework={framework} />
      ))}

      <Panel
        title="综合建议"
        titleExtra="按时间跨度排序：先做能验证方向的动作，再投入需要组织与预算的工程。"
      >
        <Table<ConsultingRecommendation>
          rowKey={(row) => `${row.horizon}-${row.title}`}
          dataSource={result.recommendations}
          columns={recommendationColumns}
          pagination={false}
          scroll={{ x: 930 }}
        />
      </Panel>

      <Panel title="跨模型洞察" titleExtra="模型之间互相印证或冲突的地方，往往就是决策的关键。">
        <div style={{ display: "grid", gap: 12 }}>
          {result.crossInsights.map((item) => (
            <div key={item.title}>
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div className="text-12" style={{ marginTop: 4 }}>
                {item.detail}
              </div>
              {item.frameworks.length ? (
                <div className="muted text-12" style={{ marginTop: 4 }}>
                  关联：{item.frameworks.join("、")}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="风险清单">
        <Table
          rowKey={(row) => row.risk}
          dataSource={result.risks}
          pagination={false}
          columns={[
            { title: "风险", dataIndex: "risk" },
            { title: "应对", dataIndex: "mitigation" },
          ]}
        />
      </Panel>

      <div className="crm-two-col">
        <Panel title="需要补充的信息" titleExtra="补齐后再分析，结论会更可靠。">
          {result.infoGaps.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.infoGaps.map((item) => (
                <li key={item.question} style={{ marginBottom: 8 }}>
                  <b>{item.topic}</b>：{item.question}
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted">暂无</div>
          )}
        </Panel>
        <Panel title="分析假设" titleExtra="模型在信息不足时采用的前提，请核对。">
          {result.assumptions.length ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.assumptions.map((item) => (
                <li key={item} style={{ marginBottom: 8 }}>
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted">暂无</div>
          )}
        </Panel>
      </div>
    </>
  );
}

function FrameworkPanel({ framework }: { framework: ConsultingFrameworkResult }) {
  const axes =
    CONSULTING_FRAMEWORK_AXES[framework.key as ConsultingFrameworkKey];
  return (
    <Panel
      title={
        <Space>
          <span>{framework.label}</span>
          <Tag color="blue">{framework.score}/100</Tag>
        </Space>
      }
      titleExtra={framework.verdict}
    >
      <p style={{ marginTop: 0 }}>{framework.summary}</p>
      {framework.key === "yijing" ? (
        <div className="muted text-12" style={{ marginBottom: 8 }}>
          易经分析只作决策启发与思考框架，不构成吉凶预测、命理判断或投资建议。
        </div>
      ) : null}

      {axes && framework.matrix.length ? (
        <MatrixPlot points={framework.matrix} axes={axes} />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
          marginTop: 12,
        }}
      >
        {framework.sections.map((section) => (
          <div key={section.title}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {section.title}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {section.items.map((item) => (
                <li key={item} className="text-12" style={{ marginBottom: 4 }}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {framework.actions.length ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>行动建议</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {framework.actions.map((item) => (
              <li key={item} className="text-12" style={{ marginBottom: 4 }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

function MatrixPlot({
  points,
  axes,
}: {
  points: ConsultingFrameworkResult["matrix"];
  axes: { xLabel: string; yLabel: string };
}) {
  const width = 380;
  const height = 250;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const px = (value: number) => padLeft + (value / 100) * plotW;
  const py = (value: number) => padTop + (1 - value / 100) * plotH;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${axes.yLabel} × ${axes.xLabel} 定位图`}
      style={{ width: "100%", maxWidth: 460, height: "auto" }}
    >
      <rect x={padLeft} y={padTop} width={plotW} height={plotH} fill="#f8fafc" />
      <line
        x1={padLeft + plotW / 2}
        y1={padTop}
        x2={padLeft + plotW / 2}
        y2={padTop + plotH}
        stroke="#cbd5e1"
        strokeDasharray="4 4"
      />
      <line
        x1={padLeft}
        y1={padTop + plotH / 2}
        x2={padLeft + plotW}
        y2={padTop + plotH / 2}
        stroke="#cbd5e1"
        strokeDasharray="4 4"
      />
      <rect
        x={padLeft}
        y={padTop}
        width={plotW}
        height={plotH}
        fill="none"
        stroke="#94a3b8"
      />
      {points.map((point, index) => (
        <g key={`${point.label}-${index}`}>
          <circle
            cx={px(point.x)}
            cy={py(point.y)}
            r={point.size ? 5 + (point.size / 100) * 8 : 6}
            fill={POINT_COLORS[index % POINT_COLORS.length]}
            fillOpacity={0.72}
            stroke={POINT_COLORS[index % POINT_COLORS.length]}
          />
          <text
            x={px(point.x) + 8}
            y={py(point.y) + 4}
            fontSize={9}
            fill="#334155"
          >
            {point.label}
          </text>
        </g>
      ))}
      <text
        x={padLeft + plotW / 2}
        y={height - 8}
        fontSize={9}
        textAnchor="middle"
        fill="#475569"
      >
        {axes.xLabel}
      </text>
      <text
        x={12}
        y={padTop + plotH / 2}
        fontSize={9}
        textAnchor="middle"
        fill="#475569"
        transform={`rotate(-90 12 ${padTop + plotH / 2})`}
      >
        {axes.yLabel}
      </text>
    </svg>
  );
}
