"use client";

// 卡密页签：按批次生成会员天数卡 / 积分充值卡 / 内容直通券，未使用的卡密可停用或删除（已使用的留作台账）。
import { CopyOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  KP_CARD_KINDS,
  KP_CARD_KIND_LABELS,
  KP_CARD_STATUS_LABELS,
  type KpCardGenerateResult,
  type KpCardKind,
  type KpCardRow,
  type KpResourceRow,
} from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

const PAGE_SIZE = 20;

const STATUS_TAG_COLORS: Record<string, string> = {
  unused: "green",
  used: "blue",
  disabled: "default",
};

type GenerateDraft = {
  kind: KpCardKind;
  count: number;
  days: number;
  points: number;
  resourceId: number;
  remark: string;
};

const EMPTY_GENERATE: GenerateDraft = {
  kind: "vip",
  count: 10,
  days: 30,
  points: 100,
  resourceId: 0,
  remark: "",
};

/** 面额列按种类取不同字段，避免三列全摆出来大半是空的。 */
function denominationText(row: KpCardRow) {
  if (row.kind === "vip") return `${row.days} 天`;
  if (row.kind === "points") return `${row.points} 积分`;
  return row.resourceTitle || `内容 #${row.resourceId}`;
}

export function CardsTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpCardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");

  const [generateOpen, setGenerateOpen] = useState(false);
  const [draft, setDraft] = useState<GenerateDraft>(EMPTY_GENERATE);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<KpCardGenerateResult | null>(null);
  /** 直通券要选站内内容，弹窗打开时拉一次在线内容。 */
  const [onlineResources, setOnlineResources] = useState<KpResourceRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.cards({
        query: { page, pageSize: PAGE_SIZE, keyword: appliedKeyword, kind, status },
      });
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "卡密加载失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, kind, status, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openGenerate = async () => {
    setResult(null);
    setDraft({ ...EMPTY_GENERATE });
    setGenerateOpen(true);
    if (!onlineResources.length) {
      try {
        const data = await knowledgePayApi.resources({
          query: { page: 1, pageSize: 200, status: "online" },
        });
        setOnlineResources(data?.list ?? []);
      } catch {
        // 在线内容拉取失败不阻断生成弹窗；直通券下拉为空时用户可关掉重开。
      }
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      message.success(label);
    } catch {
      message.warning("浏览器不允许剪贴板，请手动选中复制");
    }
  };

  const generate = async () => {
    if (draft.kind === "vip" && (!draft.days || draft.days <= 0)) {
      message.warning("请填写会员天数");
      return;
    }
    if (draft.kind === "points" && (!draft.points || draft.points <= 0)) {
      message.warning("请填写积分面值");
      return;
    }
    if (draft.kind === "resource" && !draft.resourceId) {
      message.warning("请选择直通券对应的付费内容；内容需先上架");
      return;
    }
    setGenerating(true);
    try {
      const data = await knowledgePayApi.generateCards({
        body: {
          kind: draft.kind,
          count: Math.max(1, Math.min(500, Math.round(draft.count || 1))),
          days: draft.kind === "vip" ? draft.days : 0,
          points: draft.kind === "points" ? draft.points : 0,
          resourceId: draft.kind === "resource" ? draft.resourceId : 0,
          remark: draft.remark.trim(),
        },
      });
      if (data) {
        setResult(data);
        message.success(`已生成 ${data.count} 张卡密（批次 ${data.batchNo}）`);
        await load();
      }
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const disableCard = async (row: KpCardRow) => {
    try {
      await knowledgePayApi.disableCard({ params: { id: String(row.id) }, body: {} });
      message.success("卡密已停用");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "停用失败");
    }
  };

  const removeCard = async (row: KpCardRow) => {
    try {
      await knowledgePayApi.removeCard({ params: { id: String(row.id) } });
      message.success("卡密已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<KpCardRow> = [
    {
      title: "卡号",
      dataIndex: "code",
      width: 200,
      render: (value: string) => (
        <Space size={2}>
          <span className="mono">{value}</span>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined aria-hidden />}
            onClick={() => void copyText(value, "卡号已复制")}
          />
        </Space>
      ),
    },
    {
      title: "种类",
      dataIndex: "kind",
      width: 110,
      render: (value: string) => KP_CARD_KIND_LABELS[value] || value,
    },
    { title: "面额", width: 130, render: (_value, row) => denominationText(row) },
    {
      title: "批次",
      dataIndex: "batchNo",
      width: 170,
      render: (value: string) => <span className="mono text-12">{value}</span>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => (
        <Tag color={STATUS_TAG_COLORS[value] || "default"}>{KP_CARD_STATUS_LABELS[value] || value}</Tag>
      ),
    },
    {
      title: "使用者",
      dataIndex: "usedByNickname",
      width: 130,
      render: (value: string) => value || <span className="text-12 muted">—</span>,
    },
    {
      title: "兑换时间",
      dataIndex: "usedAt",
      width: 150,
      render: (value: string) =>
        value ? <span className="text-12 muted">{fmtTime(value)}</span> : <span className="text-12 muted">—</span>,
    },
    {
      title: "生成时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "备注",
      dataIndex: "remark",
      ellipsis: true,
      render: (value: string) => value || <span className="text-12 muted">—</span>,
    },
    {
      title: "操作",
      width: 130,
      render: (_value, row) =>
        row.status === "unused" ? (
          <Space size={4}>
            <Popconfirm title="停用后该卡号兑换会报错，确定？" onConfirm={() => void disableCard(row)}>
              <Button type="link" size="small">停用</Button>
            </Popconfirm>
            <Popconfirm title="删除这张卡密？" onConfirm={() => void removeCard(row)}>
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          </Space>
        ) : (
          <span className="text-12 muted">—</span>
        ),
    },
  ];

  return (
    <Panel
      title="卡密台账"
      titleExtra={
        <span className="text-12 muted">
          卡号在小程序「卡密兑换」页核销；已使用的卡密是兑换台账，不能停用或删除
        </span>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => void openGenerate()}>
          生成卡密
        </Button>
      }
    >
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="卡号关键词"
          style={{ width: 220 }}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            if (!event.target.value) {
              setAppliedKeyword("");
              setPage(1);
            }
          }}
          onSearch={(value) => {
            setAppliedKeyword(value.trim());
            setPage(1);
          }}
        />
        <Select
          style={{ width: 140 }}
          value={kind}
          onChange={(value) => {
            setKind(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部种类" },
            ...KP_CARD_KINDS.map((item) => ({ value: item, label: KP_CARD_KIND_LABELS[item] })),
          ]}
        />
        <Select
          style={{ width: 130 }}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部状态" },
            ...Object.entries(KP_CARD_STATUS_LABELS).map(([key, label]) => ({ value: key, label })),
          ]}
        />
      </Space>

      <Table<KpCardRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1300 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, onChange: setPage }}
        locale={{ emptyText: <EmptyState text="还没有卡密；点「生成卡密」按批次出货。" /> }}
      />

      <Modal
        open={generateOpen}
        title="生成卡密"
        onCancel={() => setGenerateOpen(false)}
        width={640}
        footer={
          result ? (
            <Space>
              <Button
                icon={<CopyOutlined aria-hidden />}
                onClick={() =>
                  void copyText(
                    result.items.map((item) => item.code).join("\n"),
                    `本批 ${result.count} 个卡号已复制`,
                  )
                }
              >
                复制全部卡号
              </Button>
              <Button type="primary" onClick={() => setGenerateOpen(false)}>
                完成
              </Button>
            </Space>
          ) : (
            <Space>
              <Button onClick={() => setGenerateOpen(false)}>取消</Button>
              <Button type="primary" loading={generating} onClick={() => void generate()}>
                生成
              </Button>
            </Space>
          )
        }
        destroyOnHidden
      >
        {result ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <Notice variant="success">
              批次 {result.batchNo} 共生成 {result.count} 张，面值一致；发放前请先复制到渠道话术。
            </Notice>
            <div
              className="mono"
              style={{
                maxHeight: 280,
                overflow: "auto",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                lineHeight: 1.9,
                whiteSpace: "pre-wrap",
              }}
            >
              {result.items.map((item) => item.code).join("\n")}
            </div>
          </Space>
        ) : (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <div className="form-2col">
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>种类</div>
                <Select
                  style={{ width: "100%" }}
                  value={draft.kind}
                  onChange={(value) => setDraft({ ...draft, kind: value })}
                  options={KP_CARD_KINDS.map((item) => ({
                    value: item,
                    label: KP_CARD_KIND_LABELS[item],
                  }))}
                />
              </div>
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>生成张数（1-500）</div>
                <InputNumber
                  min={1}
                  max={500}
                  precision={0}
                  style={{ width: "100%" }}
                  value={draft.count}
                  onChange={(value) => setDraft({ ...draft, count: Number(value) || 1 })}
                />
              </div>
              {draft.kind === "vip" ? (
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>会员天数</div>
                  <InputNumber
                    min={1}
                    max={3650}
                    precision={0}
                    style={{ width: "100%" }}
                    value={draft.days}
                    onChange={(value) => setDraft({ ...draft, days: Number(value) || 0 })}
                  />
                </div>
              ) : null}
              {draft.kind === "points" ? (
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>积分面值</div>
                  <InputNumber
                    min={1}
                    max={999999}
                    precision={0}
                    style={{ width: "100%" }}
                    value={draft.points}
                    onChange={(value) => setDraft({ ...draft, points: Number(value) || 0 })}
                  />
                </div>
              ) : null}
              {draft.kind === "resource" ? (
                <div>
                  <div className="text-12 muted" style={{ marginBottom: 4 }}>对应内容（直通券免积分解锁它）</div>
                  <Select
                    style={{ width: "100%" }}
                    showSearch
                    optionFilterProp="label"
                    value={draft.resourceId || undefined}
                    placeholder={onlineResources.length ? "选择在线内容" : "暂无在线内容，先到「付费内容」上架"}
                    onChange={(value) => setDraft({ ...draft, resourceId: value })}
                    options={onlineResources.map((item) => ({ value: item.id, label: item.title }))}
                  />
                </div>
              ) : null}
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>备注（可选，如渠道名）</div>
                <Input
                  value={draft.remark}
                  maxLength={120}
                  placeholder="会记在每张卡密的台账上"
                  onChange={(event) => setDraft({ ...draft, remark: event.target.value })}
                />
              </div>
            </div>
            <Notice variant="info">
              同批次卡密面值一致、卡号唯一；卡密在小程序端兑换一次即失效，停用与删除仅限未使用的卡密。
            </Notice>
          </Space>
        )}
      </Modal>
    </Panel>
  );
}
