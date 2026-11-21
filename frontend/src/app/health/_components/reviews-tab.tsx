"use client";

import { App, Button, Form, Input, InputNumber, Modal, Rate, Select, Space, Tag } from "antd";
import type { TableProps } from "antd";
import { useState } from "react";
import {
  type HealthReviewRow,
  type HealthReviewStatRow,
} from "@enterprise/contracts";
import { healthApi } from "@/api/health";
import { Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { DataTable, FilterBar, LoadError, StatusTag, useHealthResource } from "./health-common";
import { useHealthMeta, useHealthShopId } from "./health-scope";

/**
 * 评价：评价本身走「先审核、后展示」，申诉通过等于认可商家理由、评价转下架。
 * 评分只做服务质量口径，不涉及任何诊断结论。
 */

const PAGE_SIZE = 20;

const TARGET_KINDS = ["PRACTITIONER", "ORGAN", "GOODS", "SERVICE", "SHOP"] as const;

const TARGET_KIND_LABELS: Record<string, string> = {
  PRACTITIONER: "医护",
  ORGAN: "机构",
  GOODS: "商品",
  SERVICE: "服务",
  SHOP: "店铺",
};

const APPEAL_LABELS: Record<string, string> = {
  NONE: "无申诉",
  PENDING: "待处理",
  APPROVED: "申诉通过",
  REJECTED: "申诉驳回",
};

const APPEAL_TONE: Record<string, string> = {
  NONE: "default",
  PENDING: "gold",
  APPROVED: "green",
  REJECTED: "red",
};

const AUDIT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "全部审核态" },
  { value: "PENDING", label: "待审核" },
  { value: "APPROVED", label: "已通过" },
  { value: "REJECTED", label: "已驳回" },
  { value: "OFFLINE", label: "已下架" },
];

const SCORE_OPTIONS = [
  { value: 0, label: "不限" },
  { value: 1, label: "1 星" },
  { value: 2, label: "2 星" },
  { value: 3, label: "3 星" },
  { value: 4, label: "4 星" },
  { value: 5, label: "5 星" },
];

export function ReviewsTab() {
  const shopId = useHealthShopId();
  const [tab, setTab] = useState("review");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "review", label: "评价列表", children: <ReviewSection shopId={shopId} /> },
        { key: "stat", label: "口碑统计", children: <ReviewStatSection shopId={shopId} /> },
      ]}
    />
  );
}

/* ------------------------------ 评价列表 ------------------------------ */

type ReviewTarget = { kind: "audit" | "appeal"; row: HealthReviewRow };

function ReviewSection({ shopId }: { shopId: number }) {
  const meta = useHealthMeta();
  const { message, modal } = App.useApp();
  const [targetKind, setTargetKind] = useState("all");
  const [targetId, setTargetId] = useState(0);
  const [auditStatus, setAuditStatus] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<HealthReviewRow | null>(null);
  const [handling, setHandling] = useState<ReviewTarget | null>(null);

  const list = useHealthResource(
    () =>
      healthApi.reviews({
        query: { shopId, page, pageSize: PAGE_SIZE, targetKind, targetId, auditStatus, minScore, maxScore },
      }),
    [shopId, page, targetKind, targetId, auditStatus, minScore, maxScore],
  );
  const rows = list.data?.list ?? [];

  const removeRow = (row: HealthReviewRow) => {
    modal.confirm({
      title: "删除这条评价",
      content: "删除后不再出现在小程序与统计里，评分与口碑数据会同步变化。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await healthApi.reviewRemove({ body: { shopId, id: row.id } });
          message.success("评价已删除");
          await list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: TableProps<HealthReviewRow>["columns"] = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 170,
      render: (value: string) => value || <span className="muted">—</span>,
    },
    {
      title: "评价对象",
      dataIndex: "targetName",
      width: 170,
      render: (value: string, row) => (
        <div>
          <div>{value || `#${row.targetId}`}</div>
          <div className="muted text-12">{TARGET_KIND_LABELS[row.targetKind] ?? row.targetKind}</div>
        </div>
      ),
    },
    { title: "顾客", dataIndex: "customerLabel", width: 120 },
    {
      title: "评分",
      dataIndex: "score",
      width: 140,
      render: (value: number) => <Rate disabled value={value} count={5} />,
    },
    {
      title: "内容",
      dataIndex: "content",
      width: 280,
      render: (value: string, row) => (
        <div>
          <div>{value || <span className="muted">（未写文字）</span>}</div>
          <div className="muted text-12">
            {row.anonymous ? "匿名顾客" : row.customerLabel}
            {row.images.length ? ` · ${row.images.length} 张图` : ""}
          </div>
        </div>
      ),
    },
    {
      title: "审核",
      dataIndex: "auditStatus",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="auditStatuses" value={value} />,
    },
    {
      title: "申诉",
      dataIndex: "appealStatus",
      width: 110,
      render: (value: string) => (
        <Tag color={APPEAL_TONE[value] ?? "default"}>{APPEAL_LABELS[value] ?? value}</Tag>
      ),
    },
    {
      title: "回复",
      dataIndex: "reply",
      width: 200,
      render: (value: string) =>
        value ? <span className="text-12">{value}</span> : <span className="muted">未回复</span>,
    },
    {
      title: "评价时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 230,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setReplying(row)}>
            {row.reply ? "改回复" : "回复"}
          </Button>
          <Button
            size="small"
            type="link"
            onClick={() => setHandling({ kind: "audit", row })}
          >
            审核
          </Button>
          <Button
            size="small"
            type="link"
            disabled={row.appealStatus !== "PENDING"}
            onClick={() => setHandling({ kind: "appeal", row })}
          >
            申诉处置
          </Button>
          <Button size="small" type="link" danger onClick={() => removeRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel title="评价列表" titleBadge={list.data ? `${list.data.total}` : undefined}>
      <div style={{ marginBottom: 12 }}>
        <span className="muted text-12">
          评价先审核后展示；只能因违规内容驳回，评价分数本身不做人工调分。申诉处置通过即把该评价转为「已下架」。
        </span>
      </div>
      <FilterBar
        action={
          <Button
            size="small"
            type="link"
            onClick={() => {
              setTargetKind("all");
              setTargetId(0);
              setAuditStatus("all");
              setMinScore(0);
              setMaxScore(0);
              setPage(1);
            }}
          >
            清除筛选
          </Button>
        }
      >
        <Select
          style={{ width: 130 }}
          value={targetKind}
          onChange={(value: string) => {
            setTargetKind(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部对象" },
            ...TARGET_KINDS.map((value) => ({ value, label: TARGET_KIND_LABELS[value] ?? value })),
          ]}
        />
        <InputNumber
          style={{ width: 150 }}
          min={0}
          precision={0}
          value={targetId}
          onChange={(value) => {
            setTargetId(Number(value ?? 0));
            setPage(1);
          }}
          placeholder="对象编号，0 = 全部"
        />
        <Select
          style={{ width: 130 }}
          value={auditStatus}
          onChange={(value: string) => {
            setAuditStatus(value);
            setPage(1);
          }}
          options={AUDIT_OPTIONS}
        />
        <Select
          style={{ width: 110 }}
          value={minScore}
          onChange={(value: number) => {
            setMinScore(value);
            setPage(1);
          }}
          options={SCORE_OPTIONS}
        />
        <Select
          style={{ width: 110 }}
          value={maxScore}
          onChange={(value: number) => {
            setMaxScore(value);
            setPage(1);
          }}
          options={SCORE_OPTIONS}
        />
        <span className="muted text-12">评分区间 0 表示不限</span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthReviewRow>
        rows={rows}
        columns={columns}
        total={list.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={list.loading}
        onPage={setPage}
        scroll={{ x: 1600 }}
      />
      <Modal
        open={replying !== null}
        title="回复评价"
        width={520}
        destroyOnHidden
        footer={null}
        onCancel={() => setReplying(null)}
      >
        {replying ? (
          <ReplyFormBlock
            key={replying.id}
            shopId={shopId}
            row={replying}
            onClose={() => setReplying(null)}
            onSaved={list.reload}
          />
        ) : null}
      </Modal>
      <Modal
        open={handling !== null}
        title={handling?.kind === "appeal" ? "申诉处置" : "评价审核"}
        width={520}
        destroyOnHidden
        footer={null}
        onCancel={() => setHandling(null)}
      >
        {handling ? (
          <HandleFormBlock
            key={`${handling.kind}-${handling.row.id}`}
            shopId={shopId}
            target={handling}
            onClose={() => setHandling(null)}
            onSaved={list.reload}
          />
        ) : null}
      </Modal>
    </Panel>
  );
}

function ReplyFormBlock({
  shopId,
  row,
  onClose,
  onSaved,
}: {
  shopId: number;
  row: HealthReviewRow;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ reply: string }>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await healthApi.reviewReply({ body: { shopId, id: row.id, reply: values.reply.trim() } });
      message.success("回复已提交，顾客端可见");
      await onSaved();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "回复失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical" initialValues={{ reply: row.reply }}>
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        {row.targetName || `对象 #${row.targetId}`} · {row.score} 星 ·{" "}
        {row.anonymous ? "匿名顾客" : row.customerLabel}
      </div>
      <Form.Item
        name="reply"
        label="回复内容"
        extra="展示在该条评价下方，顾客会收到站内提醒；最多 1000 字"
        rules={[{ required: true, whitespace: true, message: "请填写回复内容" }]}
      >
        <Input.TextArea rows={4} maxLength={1000} showCount />
      </Form.Item>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          提交回复
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

function HandleFormBlock({
  shopId,
  target,
  onClose,
  onSaved,
}: {
  shopId: number;
  target: ReviewTarget;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ decision: "APPROVE" | "REJECT"; note: string }>();
  const [saving, setSaving] = useState(false);
  const isAppeal = target.kind === "appeal";
  const rejected = Form.useWatch("decision", form) === "REJECT";

  const submit = async () => {
    const values = await form.validateFields();
    const approved = values.decision !== "REJECT";
    setSaving(true);
    try {
      if (isAppeal) {
        await healthApi.reviewAppealHandle({
          body: { shopId, id: target.row.id, approved, note: (values.note ?? "").trim() },
        });
      } else {
        await healthApi.reviewAudit({
          body: { shopId, id: target.row.id, approved, reason: (values.note ?? "").trim() },
        });
      }
      message.success(
        isAppeal
          ? approved
            ? "申诉已通过，该评价转下架"
            : "申诉已驳回，评价保持原状态"
          : approved
            ? "评价已通过审核"
            : "评价已驳回",
      );
      await onSaved();
      onClose();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "提交失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical" initialValues={{ decision: "APPROVE", note: "" }}>
      <div className="muted text-12" style={{ marginBottom: 12 }}>
        {isAppeal ? "申诉处置" : "审核对象"}：{target.row.targetName || `#${target.row.targetId}`} ·{" "}
        {target.row.score} 星 · {target.row.content || "（未写文字）"}
      </div>
      <Form.Item name="decision" label={isAppeal ? "处置结论" : "审核结论"} style={{ width: 200 }}>
        <Select
          options={
            isAppeal
              ? [
                  { value: "APPROVE", label: "申诉成立（评价下架）" },
                  { value: "REJECT", label: "申诉不成立" },
                ]
              : [
                  { value: "APPROVE", label: "通过" },
                  { value: "REJECT", label: "驳回" },
                ]
          }
        />
      </Form.Item>
      <Form.Item
        name="note"
        label={isAppeal ? "处置说明" : "审核说明"}
        extra={rejected ? "写清理由，操作会留痕" : "可留空"}
        rules={rejected ? [{ required: true, whitespace: true, message: "请填写说明" }] : []}
      >
        <Input.TextArea rows={3} maxLength={isAppeal ? 500 : 200} showCount />
      </Form.Item>
      <Space>
        <Button type="primary" loading={saving} onClick={() => void submit()}>
          提交
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}

/* ------------------------------ 口碑统计 ------------------------------ */

function ReviewStatSection({ shopId }: { shopId: number }) {
  const [targetKind, setTargetKind] = useState("all");
  const list = useHealthResource(
    () => healthApi.reviewStats({ query: { shopId, targetKind } }),
    [shopId, targetKind],
  );
  const rows = list.data ?? [];

  const columns: TableProps<HealthReviewStatRow>["columns"] = [
    { title: "评价对象", dataIndex: "targetName", width: 220 },
    {
      title: "类型",
      dataIndex: "targetKind",
      width: 110,
      render: (value: string) => TARGET_KIND_LABELS[value] ?? value,
    },
    { title: "评价数", dataIndex: "count", width: 100 },
    { title: "平均分", dataIndex: "avgScore", width: 100 },
    {
      title: "好评率",
      dataIndex: "goodPercent",
      width: 260,
      render: (value: number) => (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 52px", gap: 8, alignItems: "center" }}>
          <div style={{ background: "var(--border)", borderRadius: 4, height: 8 }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, Number(value || 0)))}%`,
                height: 8,
                borderRadius: 4,
                background: "var(--ant-color-primary, #3370ff)",
              }}
            />
          </div>
          <span className="text-12">{Number(value || 0)}%</span>
        </div>
      ),
    },
    {
      title: "差评数",
      dataIndex: "badCount",
      width: 100,
      render: (value: number) => (value ? <span style={{ color: "#cf1322" }}>{value}</span> : 0),
    },
    {
      title: "待处理申诉",
      dataIndex: "pendingAppeal",
      width: 120,
      render: (value: number) => (value ? <Tag color="gold">{value}</Tag> : <span className="muted">0</span>),
    },
  ];

  return (
    <Panel title="口碑统计" titleBadge={list.data ? `${list.data.length}` : undefined}>
      <FilterBar>
        <Select
          style={{ width: 150 }}
          value={targetKind}
          onChange={(value: string) => setTargetKind(value)}
          options={[
            { value: "all", label: "全部对象" },
            ...TARGET_KINDS.map((value) => ({ value, label: TARGET_KIND_LABELS[value] ?? value })),
          ]}
        />
        <span className="muted text-12">
          好评按 4 星及以上计；差评为 2 星及以下。统计口径只反映服务体验，不代表任何医疗结论。
        </span>
      </FilterBar>
      {list.error ? <LoadError text={list.error} /> : null}
      <DataTable<HealthReviewStatRow>
        rows={rows}
        columns={columns}
        page={1}
        loading={list.loading}
        rowKey={(row) => `${row.targetKind}-${row.targetId}`}
      />
    </Panel>
  );
}
