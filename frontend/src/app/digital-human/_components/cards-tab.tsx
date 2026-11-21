"use client";

// 卡密页签：生成批次、导出 CSV、停用未使用卡密。
import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import {
  DH_CARD_STATUS_LABELS,
  DH_PACKAGE_TYPES,
  DH_PACKAGE_TYPE_LABELS,
  type DhCardBatchRow,
  type DhCardRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { PAGE_SIZE, usePagedList } from "./shared";

type PackageType = (typeof DH_PACKAGE_TYPES)[number];

export function CardsTab() {
  const [tab, setTab] = useState("batches");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "batches", label: "生成批次", children: <BatchSection key="batches" /> },
        { key: "cards", label: "卡密台账", children: <CardSection key="cards" /> },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 批次
// ---------------------------------------------------------------------------

type BatchDraft = {
  name: string;
  type: PackageType;
  quantity: number;
  vipDays: number;
  point: number;
  bodyQuota: number;
  voiceQuota: number;
  remark: string;
};

const EMPTY_BATCH: BatchDraft = {
  name: "",
  type: "vip",
  quantity: 10,
  vipDays: 30,
  point: 0,
  bodyQuota: 0,
  voiceQuota: 0,
  remark: "",
};

function BatchSection() {
  const { message } = App.useApp();
  const [draft, setDraft] = useState<BatchDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);

  const fetcher = useCallback(
    (page: number) => digitalHumanApi.cardBatches({ query: { page, pageSize: PAGE_SIZE } }),
    [],
  );
  const list = usePagedList<DhCardBatchRow>(fetcher);

  const create = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.createCardBatch({ body: draft });
      message.success(`已生成 ${draft.quantity} 张卡密`);
      setDraft(null);
      list.reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成失败");
    } finally {
      setSaving(false);
    }
  };

  const exportBatch = async (row: DhCardBatchRow) => {
    setExporting(row.id);
    try {
      const result = await digitalHumanApi.exportCards({ query: { batchId: row.id } });
      if (result?.url) window.open(result.url, "_blank", "noopener");
      else message.warning("导出没有返回文件地址");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "导出失败");
    } finally {
      setExporting(null);
    }
  };

  const columns: ColumnsType<DhCardBatchRow> = [
    {
      title: "批次",
      width: 200,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span>{row.name || `批次 #${row.id}`}</span>
          <span className="muted text-12">
            {DH_PACKAGE_TYPE_LABELS[row.type] || row.type}
          </span>
        </Space>
      ),
    },
    {
      title: "数量",
      width: 120,
      render: (_, row) => `${row.quantity} 张 · 已用 ${row.usedCount}`,
    },
    {
      title: "发放内容",
      render: (_, row) =>
        [
          row.vipDays ? `${row.vipDays} 天会员` : "",
          row.point ? `${row.point} 算力` : "",
          row.bodyQuota ? `${row.bodyQuota} 形象点` : "",
          row.voiceQuota ? `${row.voiceQuota} 声音点` : "",
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    { title: "备注", dataIndex: "remark", ellipsis: true },
    {
      title: "创建",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 110,
      render: (_, row) => (
        <Button
          size="small"
          icon={<DownloadOutlined />}
          loading={exporting === row.id}
          onClick={() => void exportBatch(row)}
        >
          导出
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="卡密批次"
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setDraft({ ...EMPTY_BATCH })}
        >
          生成卡密
        </Button>
      }
    >
      <Notice variant="info">
        一次最多生成 1000 张同参数卡密。导出 CSV 给渠道发货，会员在小程序「会员」页卡密兑换入口使用。
      </Notice>
      {list.rows.length === 0 && !list.loading ? (
        <EmptyState text="还没有生成过卡密批次。" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          loading={list.loading}
          columns={columns}
          dataSource={list.rows}
          pagination={{
            current: list.page,
            pageSize: PAGE_SIZE,
            total: list.total,
            showSizeChanger: false,
            onChange: list.setPage,
          }}
          style={{ marginTop: 12 }}
        />
      )}

      <Modal
        open={Boolean(draft)}
        title="生成卡密"
        okText="生成"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void create()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              批次名称
              <Input
                value={draft.name}
                maxLength={80}
                placeholder="如：双十一渠道"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              类型
              <Select
                style={{ width: "100%" }}
                value={draft.type}
                options={DH_PACKAGE_TYPES.map((value) => ({
                  value,
                  label: DH_PACKAGE_TYPE_LABELS[value],
                }))}
                onChange={(value: PackageType) => setDraft({ ...draft, type: value })}
              />
            </label>
            <Space size={10} wrap>
              <label>
                数量
                <InputNumber
                  min={1}
                  max={1000}
                  value={draft.quantity}
                  onChange={(value) => setDraft({ ...draft, quantity: Number(value ?? 1) })}
                />
              </label>
              <label>
                会员天数
                <InputNumber
                  min={0}
                  max={3650}
                  value={draft.vipDays}
                  onChange={(value) => setDraft({ ...draft, vipDays: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <Space size={10} wrap>
              <label>
                算力
                <InputNumber
                  min={0}
                  value={draft.point}
                  onChange={(value) => setDraft({ ...draft, point: Number(value ?? 0) })}
                />
              </label>
              <label>
                形象点
                <InputNumber
                  min={0}
                  value={draft.bodyQuota}
                  onChange={(value) => setDraft({ ...draft, bodyQuota: Number(value ?? 0) })}
                />
              </label>
              <label>
                声音点
                <InputNumber
                  min={0}
                  value={draft.voiceQuota}
                  onChange={(value) => setDraft({ ...draft, voiceQuota: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <label>
              备注
              <Input
                value={draft.remark}
                maxLength={200}
                onChange={(event) => setDraft({ ...draft, remark: event.target.value })}
              />
            </label>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 卡密
// ---------------------------------------------------------------------------

function CardSection() {
  const { message } = App.useApp();
  const [status, setStatus] = useState("");
  const [batchId, setBatchId] = useState("");
  const [keyword, setKeyword] = useState("");

  const fetcher = useCallback(
    (page: number) =>
      digitalHumanApi.cards({
        query: {
          page,
          pageSize: PAGE_SIZE,
          ...(status ? { status } : {}),
          ...(Number(batchId) > 0 ? { batchId: Number(batchId) } : {}),
          ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
        },
      }),
    [status, batchId, keyword],
  );
  const list = usePagedList<DhCardRow>(fetcher);

  const disable = (row: DhCardRow) => {
    Modal.confirm({
      title: "停用卡密",
      content: `确定停用 ${row.code}？停用后不可兑换且不可恢复。`,
      okText: "停用",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.disableCard({ body: { id: row.id } });
          message.success("已停用");
          list.reload();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "停用失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhCardRow> = [
    { title: "卡密", dataIndex: "code", width: 200, render: (value: string) => <span className="mono">{value}</span> },
    { title: "批次", dataIndex: "batchId", width: 90, render: (value: number) => `#${value}` },
    {
      title: "内容",
      render: (_, row) =>
        [
          row.vipDays ? `${row.vipDays} 天会员` : "",
          row.point ? `${row.point} 算力` : "",
          row.bodyQuota ? `${row.bodyQuota} 形象点` : "",
          row.voiceQuota ? `${row.voiceQuota} 声音点` : "",
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    {
      title: "状态",
      width: 100,
      render: (_, row) => (
        <Tag color={row.status === "unused" ? "green" : row.status === "used" ? "default" : "red"}>
          {DH_CARD_STATUS_LABELS[row.status] || row.status}
        </Tag>
      ),
    },
    {
      title: "使用人",
      width: 160,
      render: (_, row) =>
        row.usedByMemberId ? (
          <Space orientation="vertical" size={0}>
            <span>{row.usedNickname || "微信用户"}</span>
            <span className="muted text-12">{row.usedAt ? fmtTime(row.usedAt) : ""}</span>
          </Space>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      title: "操作",
      width: 80,
      render: (_, row) =>
        row.status === "unused" ? (
          <Button size="small" danger onClick={() => disable(row)}>
            停用
          </Button>
        ) : (
          <span className="muted text-12">—</span>
        ),
    },
  ];

  return (
    <Panel
      title="卡密台账"
      extra={
        <Space wrap>
          <Input
            placeholder="批次 ID"
            value={batchId}
            style={{ width: 100 }}
            onChange={(event) => setBatchId(event.target.value)}
            onPressEnter={() => list.setPage(1)}
          />
          <Input
            placeholder="卡密"
            value={keyword}
            style={{ width: 160 }}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => list.setPage(1)}
          />
          <Select
            value={status}
            style={{ width: 120 }}
            options={[
              { value: "", label: "全部状态" },
              { value: "unused", label: "未使用" },
              { value: "used", label: "已使用" },
              { value: "disabled", label: "已停用" },
            ]}
            onChange={(value: string) => {
              setStatus(value);
              list.setPage(1);
            }}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={list.loading}
        columns={columns}
        dataSource={list.rows}
        pagination={{
          current: list.page,
          pageSize: PAGE_SIZE,
          total: list.total,
          showSizeChanger: false,
          onChange: list.setPage,
        }}
      />
    </Panel>
  );
}
