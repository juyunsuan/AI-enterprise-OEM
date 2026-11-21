"use client";

import {
  ArrowLeftOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  ConfigProvider,
  Popconfirm,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  PageHero,
  Panel,
  TabStrip,
} from "@/components/ui/panel";
import {
  insightApi,
  type InsightConsultingAnalysis,
  type InsightConsultingAnalysisSummary,
} from "@/api/insight";
import {
  ConsultingForm,
  type ConsultingFormValues,
} from "./_components/consulting-form";
import { ConsultingReport } from "./_components/consulting-report";

type ConsultingTab = "new" | "history";

const TABS = [
  { key: "new", label: "发起分析" },
  { key: "history", label: "分析记录" },
];

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

export default function InsightConsultingPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [tab, setTab] = useState<ConsultingTab>("new");
  const [active, setActive] = useState<InsightConsultingAnalysis | null>(null);
  const [history, setHistory] = useState<InsightConsultingAnalysisSummary[]>(
    [],
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await insightApi.listConsultingAnalyses();
      setHistory(
        (rows as unknown as InsightConsultingAnalysisSummary[]) ?? [],
      );
    } catch (error) {
      message.error((error as Error)?.message || "分析记录加载失败");
    } finally {
      setHistoryLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const generate = async (values: ConsultingFormValues) => {
    setSubmitting(true);
    try {
      const data = (await insightApi.consultingAnalyze({
        body: values,
      })) as unknown as InsightConsultingAnalysis;
      setActive(data);
      setTab("history");
      void loadHistory();
      message.success("分析已完成");
    } catch (error) {
      message.error((error as Error)?.message || "分析失败");
      void loadHistory();
    } finally {
      setSubmitting(false);
    }
  };

  const view = async (row: InsightConsultingAnalysisSummary) => {
    setViewingId(row.id);
    try {
      const data = (await insightApi.consultingAnalysisDetail({
        params: { id: String(row.id) },
      })) as unknown as InsightConsultingAnalysis;
      setActive(data);
    } catch (error) {
      message.error((error as Error)?.message || "报告加载失败");
    } finally {
      setViewingId(null);
    }
  };

  const remove = async (id: number) => {
    setDeleting(true);
    try {
      await insightApi.removeConsultingAnalysis({ params: { id: String(id) } });
      message.success("已删除");
      if (active?.id === id) setActive(null);
      void loadHistory();
    } catch (error) {
      message.error((error as Error)?.message || "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<InsightConsultingAnalysisSummary> = [
    {
      title: "企业",
      dataIndex: "companyName",
      width: 220,
      render: (value: string, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{value}</div>
          <Tag style={{ marginTop: 4 }}>{row.industryLabel}</Tag>
        </div>
      ),
    },
    {
      title: "分析模型",
      dataIndex: "frameworkLabels",
      width: 220,
      render: (value: string[]) => (
        <div>
          {(value ?? []).slice(0, 3).map((label) => (
            <Tag key={label} style={{ marginBottom: 4 }}>
              {label}
            </Tag>
          ))}
          {(value ?? []).length > 3 ? (
            <Tag>+{(value ?? []).length - 3}</Tag>
          ) : null}
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => (
        <Tag color={STATUS_COLOR[value] ?? "default"}>
          {STATUS_LABEL[value] ?? value}
        </Tag>
      ),
    },
    {
      title: "综合评分",
      dataIndex: "overallScore",
      width: 90,
      render: (value: number, row) =>
        row.status === "success" ? `${value}/100` : "-",
    },
    {
      title: "结论 / 失败原因",
      dataIndex: "oneLineSummary",
      ellipsis: true,
      render: (value: string, row) => value || row.error || "-",
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) =>
        value ? new Date(value).toLocaleString() : "-",
    },
    {
      title: "操作",
      width: 140,
      render: (_value, row) => (
        <Space size={0}>
          <Button
            type="link"
            loading={viewingId === row.id}
            onClick={() => void view(row)}
          >
            查看
          </Button>
          <Popconfirm
            title="删除该分析记录？"
            description="删除后不可恢复，但不会影响其它报告。"
            onConfirm={() => void remove(row.id)}
          >
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <PageHero
        title="企业咨询"
        desc="提交企业数据，勾选本次要用的分析模型（BCG、SWOT、PEST、GSM、价值链、SPACE、易经、特劳特定位、4Ps/4Cs/4Rs、麦肯锡方法、波特五力、第一性原理、人力资源与企业资源等），由统一模型网关逐维度产出结论，再汇总成跨模型的综合建议；报告按账号留存可回看。"
        extra={
          active ? null : (
            <Button
              icon={<ArrowLeftOutlined aria-hidden />}
              onClick={() => router.push("/insight")}
            >
              返回工具总览
            </Button>
          )
        }
      />

      {active ? (
        <ConsultingReport
          analysis={active}
          onBack={() => setActive(null)}
          onDelete={() => void remove(active.id)}
          deleting={deleting}
        />
      ) : (
        <>
          <TabStrip
            items={TABS}
            value={tab}
            onChange={(key) => setTab(key as ConsultingTab)}
            style={{ marginBottom: 16 }}
          />
          {tab === "new" ? (
            <ConsultingForm submitting={submitting} onSubmit={generate} />
          ) : (
            <Panel
              title={
                <>
                  <HistoryOutlined aria-hidden /> 分析记录
                </>
              }
              titleExtra="按账号留存最近 50 次：成功报告可回看，失败记录保留原因。"
              extra={
                <Button
                  icon={<ReloadOutlined aria-hidden />}
                  onClick={() => void loadHistory()}
                  loading={historyLoading}
                >
                  刷新
                </Button>
              }
            >
              <Table<InsightConsultingAnalysisSummary>
                rowKey="id"
                loading={historyLoading}
                dataSource={history}
                columns={columns}
                pagination={false}
                locale={{
                  emptyText: (
                    <EmptyState text="还没有分析记录，先到「发起分析」提交企业数据。" />
                  ),
                }}
                scroll={{ x: 1100 }}
              />
            </Panel>
          )}
        </>
      )}
    </ConfigProvider>
  );
}
