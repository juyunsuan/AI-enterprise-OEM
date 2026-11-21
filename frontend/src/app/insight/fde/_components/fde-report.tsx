"use client";

import {
  DeleteOutlined,
  LeftOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { Button, Popconfirm, Progress, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  type FdeOpportunity,
  type InsightFdeAnalysis,
} from "@enterprise/contracts";
import { Notice, Panel, StatCard, StatGrid } from "@/components/ui/panel";

const PRIORITY_COLOR: Record<string, string> = {
  P0: "red",
  P1: "blue",
  P2: "default",
};

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

function scoreColor(value: number): string {
  if (value >= 75) return "#16a34a";
  if (value >= 50) return "#d97706";
  return "#dc2626";
}

const opportunityColumns: ColumnsType<FdeOpportunity> = [
  {
    title: "优先级",
    dataIndex: "priority",
    width: 84,
    render: (value: string) => (
      <Tag color={PRIORITY_COLOR[value] ?? "default"}>{value || "P1"}</Tag>
    ),
  },
  {
    title: "场景",
    dataIndex: "name",
    width: 180,
    render: (value: string, row) => (
      <div>
        <div style={{ fontWeight: 600 }}>{value}</div>
        <div className="muted text-12">{row.aiPattern}</div>
      </div>
    ),
  },
  {
    title: "对应痛点",
    dataIndex: "painPoint",
    width: 220,
    render: (value: string) => <span className="text-12">{value}</span>,
  },
  {
    title: "价值 / 可行",
    width: 120,
    render: (_v, row) => (
      <span className="text-12">
        价值 {row.valueScore} · 可行 {row.feasibilityScore}
      </span>
    ),
  },
  {
    title: "阶段",
    dataIndex: "phase",
    width: 100,
    render: (value: string) => <span className="text-12">{value}</span>,
  },
  {
    title: "预期影响",
    dataIndex: "expectedImpact",
    width: 220,
    render: (value: string) => <span className="text-12">{value}</span>,
  },
  {
    title: "依赖 / 风险",
    width: 240,
    render: (_v, row) => (
      <div className="text-12">
        <div>依赖：{row.dependency || "待确认"}</div>
        <div className="muted">风险：{row.risk || "待确认"}</div>
      </div>
    ),
  },
];

export function FdeReport({
  analysis,
  onBack,
  onDelete,
  deleting,
}: {
  analysis: InsightFdeAnalysis;
  onBack: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const result = analysis.result;
  if (!result) {
    return (
      <Panel
        title="分析报告"
        titleExtra={`${analysis.industryLabel} · ${new Date(analysis.createdAt).toLocaleString()}`}
        extra={<Button onClick={onBack}>返回</Button>}
      >
        <Notice variant="error">
          {analysis.error || "这次分析没有产出结果，请返回后重试。"}
        </Notice>
      </Panel>
    );
  }

  const p0Count = result.opportunities.filter(
    (item) => item.priority === "P0",
  ).length;

  return (
    <>
      <Panel
        title="分析报告"
        titleExtra={`${analysis.industryLabel} · ${new Date(analysis.createdAt).toLocaleString()} · ${
          STATUS_LABEL[analysis.status] ?? analysis.status
        }`}
        extra={
          <Space wrap>
            <Tag color={STATUS_COLOR[analysis.status] ?? "default"}>
              {STATUS_LABEL[analysis.status] ?? analysis.status}
            </Tag>
            <Button icon={<LeftOutlined aria-hidden />} onClick={onBack}>
              返回
            </Button>
            <Popconfirm
              title="删除这份分析报告？"
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
          <StatCard
            label="AI-FDE 就绪度"
            value={`${result.overview.readinessScore}/100`}
            hint={result.overview.readinessLevel}
          />
          <StatCard
            label="优先场景（P0）"
            value={p0Count}
            hint={`候选场景 ${result.opportunities.length} 个`}
          />
          <StatCard
            label="路线图阶段"
            value={result.roadmap.length}
            hint={result.roadmap[0]?.duration ?? "待确认"}
          />
          <StatCard
            label="生成模型"
            value={analysis.model || "未记录"}
            hint={`${analysis.companyName}`}
          />
        </StatGrid>
        <Notice variant="info">{result.overview.oneLineDiagnosis}</Notice>
        {result.overview.industryBenchmark ? (
          <p className="muted text-12" style={{ marginBottom: 0 }}>
            行业基准对比：{result.overview.industryBenchmark}
          </p>
        ) : null}
      </Panel>

      <Panel
        title="就绪度诊断"
        titleExtra="六个维度各 0-100 分；分数是判断，evidence 是判断依据。"
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          {result.dimensions.map((dimension) => (
            <div key={`${dimension.key}-${dimension.label}`}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 4,
                }}
              >
                <strong>{dimension.label}</strong>
                <span style={{ color: scoreColor(dimension.score) }}>
                  {dimension.score}/100
                </span>
              </div>
              <Progress
                percent={dimension.score}
                showInfo={false}
                strokeColor={scoreColor(dimension.score)}
                size="small"
              />
              <div className="muted text-12">
                {dimension.verdict}
                {dimension.evidence ? ` · 依据：${dimension.evidence}` : ""}
              </div>
            </div>
          ))}
        </Space>
      </Panel>

      <Panel
        title="场景优先级"
        titleExtra="先做高频、规则清晰、数据可得、错误可兜底的场景；P0 只留 1-2 个。"
      >
        <Table<FdeOpportunity>
          rowKey={(row) => `${row.name}-${row.painPoint}`}
          dataSource={result.opportunities}
          columns={opportunityColumns}
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
        />
        {result.deferredOpportunities.length ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              暂缓场景（现在不做，但值得记录）
            </div>
            <Table<FdeOpportunity>
              rowKey={(row) => `deferred-${row.name}-${row.painPoint}`}
              dataSource={result.deferredOpportunities}
              columns={[
                {
                  title: "场景",
                  dataIndex: "name",
                  width: 180,
                },
                {
                  title: "暂缓原因 / 依赖",
                  dataIndex: "dependency",
                  render: (value: string) => (
                    <span className="text-12">{value || "待确认"}</span>
                  ),
                },
                {
                  title: "价值 / 可行",
                  width: 140,
                  render: (_v, row) => (
                    <span className="text-12">
                      价值 {row.valueScore} · 可行 {row.feasibilityScore}
                    </span>
                  ),
                },
                {
                  title: "风险",
                  dataIndex: "risk",
                  render: (value: string) => (
                    <span className="text-12">{value || "待确认"}</span>
                  ),
                },
              ]}
              pagination={false}
              size="small"
            />
          </div>
        ) : null}
      </Panel>

      <Panel
        title="AI-FDE 交付模式"
        titleExtra="嵌入式小队 + 业务共创 + 双周演示；先验证价值，再谈规模化。"
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          {result.deliveryModel.name}
        </div>
        <div className="muted text-12" style={{ marginBottom: 16 }}>
          {result.deliveryModel.summary}
        </div>
        <Table
          rowKey="role"
          dataSource={result.deliveryModel.pod}
          pagination={false}
          size="small"
          columns={[
            { title: "角色", dataIndex: "role", width: 200 },
            { title: "职责", dataIndex: "responsibility" },
          ]}
        />
        {result.deliveryModel.cadence.length ? (
          <div style={{ marginTop: 12 }}>
            <Space wrap size={8}>
              {result.deliveryModel.cadence.map((item) => (
                <Tag key={item}>{item}</Tag>
              ))}
            </Space>
          </div>
        ) : null}
      </Panel>

      <Panel
        title="技术架构与数据底座"
        titleExtra="模型只是其中一层：接入、模型、知识、集成、应用、评测、安全要一起设计。"
      >
        <Space orientation="vertical" size={14} style={{ width: "100%" }}>
          {result.architecture.map((layer) => (
            <div key={layer.layer}>
              <div style={{ fontWeight: 600 }}>{layer.layer}</div>
              <div className="text-12">{layer.recommendation}</div>
              {layer.keyDecisions.length ? (
                <Space wrap size={6} style={{ marginTop: 6 }}>
                  {layer.keyDecisions.map((item) => (
                    <Tag key={item} color="blue">
                      {item}
                    </Tag>
                  ))}
                </Space>
              ) : null}
            </div>
          ))}
        </Space>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            marginTop: 20,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>数据底座动作</div>
            <BulletList items={result.dataFoundation} />
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>治理与安全动作</div>
            <BulletList items={result.governance} />
          </div>
        </div>
      </Panel>

      <Panel
        title="分阶段路线图"
        titleExtra="每阶段都要有可验收交付物和退出标准；第一阶段控制在 6-8 周。"
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          {result.roadmap.map((phase) => (
            <div
              key={`${phase.phase}-${phase.name}`}
              style={{
                border: "1px solid var(--line, #e5e7eb)",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <Space wrap>
                <Tag color="blue">{phase.phase}</Tag>
                <strong>{phase.name}</strong>
                <span className="muted text-12">{phase.duration}</span>
              </Space>
              <div className="text-12" style={{ marginTop: 8 }}>
                {phase.objective}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                  marginTop: 12,
                }}
              >
                <div>
                  <div className="muted text-12" style={{ marginBottom: 4 }}>
                    交付物
                  </div>
                  <BulletList items={phase.deliverables} />
                </div>
                <div>
                  <div className="muted text-12" style={{ marginBottom: 4 }}>
                    退出标准
                  </div>
                  <BulletList items={phase.exitCriteria} />
                </div>
              </div>
            </div>
          ))}
        </Space>
      </Panel>

      <Panel
        title="KPI 与验收"
        titleExtra="没有基线的指标先补基线；指标要能被业务系统或人工稳定计量。"
      >
        <Table
          rowKey="name"
          dataSource={result.kpis}
          pagination={false}
          size="small"
          columns={[
            { title: "指标", dataIndex: "name", width: 180 },
            { title: "基线", dataIndex: "baseline", width: 140 },
            { title: "目标", dataIndex: "target", width: 140 },
            { title: "口径 / 数据来源", dataIndex: "measure" },
          ]}
        />
      </Panel>

      <Panel
        title="风险与化解"
        titleExtra="数据、集成、模型、组织、合规五类风险都要有负责人和缓解动作。"
      >
        <Table
          rowKey={(row) => `${row.type}-${row.risk}`}
          dataSource={result.risks}
          pagination={false}
          size="small"
          columns={[
            {
              title: "类型",
              dataIndex: "type",
              width: 100,
              render: (value: string) => <Tag>{value}</Tag>,
            },
            { title: "风险", dataIndex: "risk", width: 320 },
            { title: "缓解动作", dataIndex: "mitigation" },
          ]}
        />
      </Panel>

      {result.infoGaps.length ? (
        <Panel
          title="还需要补充的信息"
          titleExtra="这些信息会显著影响判断；补齐后重新分析，结论会更准。"
        >
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            {result.infoGaps.map((gap) => (
              <div key={`${gap.topic}-${gap.question}`}>
                <div style={{ fontWeight: 600 }}>{gap.topic}</div>
                <div className="text-12">{gap.why}</div>
                <div className="text-12">需要确认：{gap.question}</div>
              </div>
            ))}
          </Space>
        </Panel>
      ) : null}

      <Panel
        title="第一周就可以开始"
        titleExtra="先做不依赖大预算的动作，尽快拿到真实反馈。"
      >
        <NumberedList items={result.firstWeek} />
        {result.assumptions.length ? (
          <div style={{ marginTop: 16 }}>
            <div className="muted text-12" style={{ marginBottom: 6 }}>
              本次分析的假设
            </div>
            <BulletList items={result.assumptions} />
          </div>
        ) : null}
      </Panel>

      <Notice variant="warn">
        <Space size={6} wrap>
          <SafetyCertificateOutlined aria-hidden />
          本报告由 AI 生成：分数、金额、周期均为建议值，立项前请由业务、财务、IT
          与合规共同复核；对外承诺类动作必须保留人工确认。
        </Space>
      </Notice>
    </>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return <span className="muted text-12">未给出</span>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((item) => (
        <li key={item} className="text-12" style={{ marginBottom: 4 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  if (!items.length) return <span className="muted text-12">未给出</span>;
  return (
    <ol style={{ margin: 0, paddingLeft: 20 }}>
      {items.map((item) => (
        <li key={item} className="text-12" style={{ marginBottom: 6 }}>
          {item}
        </li>
      ))}
    </ol>
  );
}
