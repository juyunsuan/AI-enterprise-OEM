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
  type InsightFdeAnalysis,
  type InsightFdeAnalysisSummary,
} from "@/api/insight";
import { FdeForm, type FdeFormValues } from "./_components/fde-form";
import { FdeReport } from "./_components/fde-report";

type FdeTab = "new" | "history";

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

export default function InsightFdePage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [tab, setTab] = useState<FdeTab>("new");
  const [active, setActive] = useState<InsightFdeAnalysis | null>(null);
  const [history, setHistory] = useState<InsightFdeAnalysisSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await insightApi.listFdeAnalyses();
      setHistory((rows as unknown as InsightFdeAnalysisSummary[]) ?? []);
    } catch (error) {
      message.error((error as Error)?.message || "分析记录加载失败");
    } finally {
      setHistoryLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const generate = async (values: FdeFormValues) => {
    setSubmitting(true);
    try {
      const data = (await insightApi.fdeAnalyze({
        body: values,
      })) as unknown as InsightFdeAnalysis;
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

  const view = async (row: InsightFdeAnalysisSummary) => {
    setViewingId(row.id);
    try {
      const data = (await insightApi.fdeAnalysisDetail({
        params: { id: String(row.id) },
      })) as unknown as InsightFdeAnalysis;
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
      await insightApi.removeFdeAnalysis({ params: { id: String(id) } });
      message.success("已删除");
      if (active?.id === id) setActive(null);
      void loadHistory();
    } catch (error) {
      message.error((error as Error)?.message || "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<InsightFdeAnalysisSummary> = [
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
      title: "就绪度",
      dataIndex: "readinessScore",
      width: 90,
      render: (value: number, row) =>
        row.status === "success" ? `${value}/100` : "-",
    },
    {
      title: "诊断 / 失败原因",
      dataIndex: "oneLineDiagnosis",
      ellipsis: true,
      render: (value: string, row) => value || row.error || "-",
    },
    {
      title: "模型",
      dataIndex: "model",
      width: 160,
      ellipsis: true,
      render: (value: string) => value || "-",
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
        title="AI-FDE实施分析"
        desc="只需提交公司情况：企业画像、核心流程、最痛的 3 个问题、系统与数据条件、目标与约束。系统按 AI-FDE（AI 前置交付工程师）方法，输出就绪度诊断、场景优先级、交付组织、技术架构、分阶段路线图、KPI 与风险清单；可补充行业成果资料，报告按账号留存。"
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
        <FdeReport
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
            onChange={(key) => setTab(key as FdeTab)}
            style={{ marginBottom: 16 }}
          />
          {tab === "new" ? (
            <FdeForm submitting={submitting} onSubmit={generate} />
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
              <Table<InsightFdeAnalysisSummary>
                rowKey="id"
                loading={historyLoading}
                dataSource={history}
                columns={columns}
                pagination={false}
                locale={{
                  emptyText: (
                    <EmptyState text="还没有分析记录，先到「发起分析」提交公司情况。" />
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
