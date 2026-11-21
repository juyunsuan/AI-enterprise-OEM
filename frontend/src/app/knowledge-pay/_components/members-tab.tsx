"use client";

// 会员与订单页签：终端会员台账（含人工调整积分/会员天数/停用）与解锁订单流水。
import { SearchOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  KP_CASH_ORDER_STATUS_LABELS,
  KP_PAY_METHOD_LABELS,
  type KpCashOrderRow,
  type KpMemberRow,
  type KpOrderRow,
} from "@enterprise/contracts";
import { knowledgePayApi } from "@/api/knowledge-pay";
import { EmptyState, Notice, Panel, PanelTabs } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

const PAGE_SIZE = 20;

export function MembersTab() {
  const [tab, setTab] = useState("members");
  return (
    <PanelTabs
      value={tab}
      onChange={setTab}
      items={[
        { key: "members", label: "会员", children: <MemberSection key="members" /> },
        { key: "orders", label: "解锁订单", children: <OrderSection key="orders" /> },
        { key: "cash", label: "微信支付订单", children: <CashOrderSection key="cash" /> },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 会员
// ---------------------------------------------------------------------------

type AdjustDraft = {
  member: KpMemberRow;
  pointsDelta: number;
  vipDays: number;
  status: boolean;
  remark: string;
};

function MemberSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpMemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [vip, setVip] = useState("all");

  const [adjust, setAdjust] = useState<AdjustDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.members({
        query: { page, pageSize: PAGE_SIZE, keyword: appliedKeyword, vip },
      });
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "会员加载失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, vip, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitAdjust = async () => {
    if (!adjust) return;
    setSaving(true);
    try {
      await knowledgePayApi.adjustMember({
        params: { id: String(adjust.member.id) },
        body: {
          // 0 视为“不动这项”，不传给后端，避免误清 0。
          ...(adjust.pointsDelta ? { pointsDelta: adjust.pointsDelta } : {}),
          ...(adjust.vipDays ? { vipDays: adjust.vipDays } : {}),
          status: adjust.status,
          ...(adjust.remark.trim() ? { remark: adjust.remark.trim() } : {}),
        },
      });
      message.success(`已调整会员「${adjust.member.nickname}」`);
      setAdjust(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "调整失败");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<KpMemberRow> = [
    {
      title: "会员",
      dataIndex: "nickname",
      width: 220,
      render: (value: string, row) => (
        <Space size={8} align="center">
          {row.avatar ? (
            <Image src={row.avatar} alt="头像" width={28} height={28} style={{ borderRadius: "50%" }} preview={false} />
          ) : (
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                display: "inline-block",
              }}
            />
          )}
          <Space orientation="vertical" size={0}>
            <span>{value || "微信用户"}</span>
            <span className="mono text-12 muted">{row.openidMasked}</span>
          </Space>
        </Space>
      ),
    },
    { title: "积分", dataIndex: "points", width: 90 },
    {
      title: "会员有效期",
      dataIndex: "vipUntil",
      width: 210,
      render: (value: string, row) => (
        <Space size={6}>
          {row.vipActive ? <Tag color="gold">会员中</Tag> : <Tag>非会员</Tag>}
          <span className="text-12 muted">{value ? fmtTime(value) : "—"}</span>
        </Space>
      ),
    },
    { title: "连签", dataIndex: "signInStreak", width: 80 },
    { title: "解锁数", dataIndex: "orderCount", width: 90 },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">正常</Tag> : <Tag color="red">已停用</Tag>),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "最近活动",
      dataIndex: "lastLoginAt",
      width: 160,
      render: (value: string) =>
        value ? <span className="text-12 muted">{fmtTime(value)}</span> : <span className="text-12 muted">—</span>,
    },
    {
      title: "操作",
      width: 90,
      render: (_value, row) => (
        <Button
          type="link"
          size="small"
          onClick={() =>
            setAdjust({ member: row, pointsDelta: 0, vipDays: 0, status: row.status, remark: "" })
          }
        >
          调整
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="终端会员"
      titleExtra={
        <span className="text-12 muted">
          会员由小程序端 wx.login 自动建档；调整用于人工补偿与风控停用
        </span>
      }
    >
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="昵称关键词"
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
          value={vip}
          onChange={(value) => {
            setVip(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部会员" },
            { value: "yes", label: "会员生效中" },
            { value: "no", label: "非会员" },
          ]}
        />
      </Space>

      <Table<KpMemberRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1180 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, onChange: setPage }}
        locale={{ emptyText: <EmptyState text="还没有终端会员；小程序上线后用户进入即自动建档。" /> }}
      />

      <Modal
        open={Boolean(adjust)}
        title={`调整会员「${adjust?.member.nickname || "微信用户"}」`}
        onCancel={() => setAdjust(null)}
        onOk={() => void submitAdjust()}
        confirmLoading={saving}
        okText="提交调整"
        width={560}
        destroyOnHidden
      >
        {adjust ? (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Notice variant="info">
              当前积分 {adjust.member.points} · 会员到期{" "}
              {adjust.member.vipUntil ? fmtTime(adjust.member.vipUntil) : "—"}。
              填 0 表示该项不动；负数扣减到 0 为止、负数天数缩短有效期。
            </Notice>
            <div className="form-2col">
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>积分增减</div>
                <InputNumber
                  min={-999999}
                  max={999999}
                  precision={0}
                  style={{ width: "100%" }}
                  value={adjust.pointsDelta}
                  onChange={(value) => setAdjust({ ...adjust, pointsDelta: Number(value) || 0 })}
                />
              </div>
              <div>
                <div className="text-12 muted" style={{ marginBottom: 4 }}>会员天数增减</div>
                <InputNumber
                  min={-3650}
                  max={3650}
                  precision={0}
                  style={{ width: "100%" }}
                  value={adjust.vipDays}
                  onChange={(value) => setAdjust({ ...adjust, vipDays: Number(value) || 0 })}
                />
              </div>
            </div>
            <Space>
              <Switch
                checked={adjust.status}
                onChange={(value) => setAdjust({ ...adjust, status: value })}
              />
              <span>{adjust.status ? "正常：可登录小程序与解锁内容" : "停用：无法登录小程序与解锁内容"}</span>
            </Space>
            <div>
              <div className="text-12 muted" style={{ marginBottom: 4 }}>备注（可选，如补偿原因）</div>
              <Input
                maxLength={120}
                value={adjust.remark}
                onChange={(event) => setAdjust({ ...adjust, remark: event.target.value })}
              />
            </div>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 订单
// ---------------------------------------------------------------------------

function OrderSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [payMethod, setPayMethod] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.orders({
        query: { page, pageSize: PAGE_SIZE, keyword: appliedKeyword, payMethod },
      });
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "订单加载失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, payMethod, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: ColumnsType<KpOrderRow> = [
    { title: "会员", dataIndex: "nickname", width: 160, render: (value: string) => value || "微信用户" },
    {
      title: "内容",
      dataIndex: "title",
      ellipsis: true,
      render: (value: string, row) => (
        <Space size={8} align="center">
          {row.cover ? (
            <Image src={row.cover} alt="内容封面" width={36} height={36} style={{ borderRadius: 6, objectFit: "cover" }} preview={false} />
          ) : null}
          <span>{value}</span>
        </Space>
      ),
    },
    {
      title: "支付方式",
      dataIndex: "payMethod",
      width: 120,
      render: (value: string) => KP_PAY_METHOD_LABELS[value] || value,
    },
    {
      title: "消耗积分",
      dataIndex: "amount",
      width: 110,
      render: (value: number) => (value > 0 ? value : <span className="text-12 muted">0</span>),
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
  ];

  return (
    <Panel
      title="解锁订单"
      titleExtra={
        <span className="text-12 muted">
          免费获取与会员免费也会留痕，便于对账；关键词匹配会员昵称或内容标题
        </span>
      }
    >
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <Input
          allowClear
          placeholder="昵称 / 内容标题"
          style={{ width: 220 }}
          suffix={
            <Button
              type="text"
              size="small"
              icon={<SearchOutlined aria-hidden />}
              onClick={() => {
                setAppliedKeyword(keyword.trim());
                setPage(1);
              }}
            />
          }
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            if (!event.target.value) {
              setAppliedKeyword("");
              setPage(1);
            }
          }}
          onPressEnter={() => {
            setAppliedKeyword(keyword.trim());
            setPage(1);
          }}
        />
        <Select
          style={{ width: 140 }}
          value={payMethod}
          onChange={(value) => {
            setPayMethod(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部方式" },
            ...Object.entries(KP_PAY_METHOD_LABELS).map(([key, label]) => ({ value: key, label })),
          ]}
        />
      </Space>

      <Table<KpOrderRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 860 }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, onChange: setPage }}
        locale={{ emptyText: <EmptyState text="还没有解锁订单；内容上架并有会员解锁后这里会有流水。" /> }}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// 微信支付订单（现金）
// ---------------------------------------------------------------------------

function CashOrderSection() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<KpCashOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [refundTarget, setRefundTarget] = useState<KpCashOrderRow | null>(null);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await knowledgePayApi.cashOrders({
        query: { page, pageSize: PAGE_SIZE, keyword: appliedKeyword, status, kind },
      });
      setRows(data?.list ?? []);
      setTotal(data?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "现金订单加载失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, status, kind, page, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeOrder = async (row: KpCashOrderRow) => {
    try {
      await knowledgePayApi.closeCashOrder({ params: { id: String(row.id) } });
      message.success("订单已关闭");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "关闭失败");
    }
  };

  const refund = async () => {
    if (!refundTarget) return;
    setRefunding(true);
    try {
      await knowledgePayApi.refundCashOrder({
        params: { id: String(refundTarget.id) },
        body: { reason: reason.trim() },
      });
      message.success("退款成功，课程解锁已撤销/会员时长已回退");
      setRefundTarget(null);
      setReason("");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "退款失败");
    } finally {
      setRefunding(false);
    }
  };

  const columns: ColumnsType<KpCashOrderRow> = [
    { title: "会员", dataIndex: "nickname", width: 140, render: (value: string) => value || "微信用户" },
    {
      title: "订单",
      dataIndex: "title",
      ellipsis: true,
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>{value}</span>
          <span className="text-12 muted">{row.kind === "vip" ? `${row.plan} 个月会员` : "课程购买"}</span>
        </Space>
      ),
    },
    {
      title: "金额",
      dataIndex: "amountCents",
      width: 100,
      render: (value: number) => `¥${(value / 100).toFixed(2)}`,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => (
        <Tag color={value === "paid" ? "green" : value === "pending" ? "orange" : value === "refunded" ? "red" : "default"}>
          {KP_CASH_ORDER_STATUS_LABELS[value] || value}
        </Tag>
      ),
    },
    {
      title: "渠道单号",
      dataIndex: "outTradeNo",
      width: 220,
      ellipsis: true,
      render: (value: string) => <span className="mono text-12">{value}</span>,
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string) => <span className="text-12 muted">{fmtTime(value)}</span>,
    },
    {
      title: "操作",
      width: 140,
      render: (_value, row) =>
        row.status === "pending" ? (
          <Popconfirm title="关闭这笔待支付订单？" onConfirm={() => void closeOrder(row)}>
            <Button type="link" size="small" danger>关闭</Button>
          </Popconfirm>
        ) : row.status === "paid" ? (
          <Button
            type="link"
            size="small"
            danger
            onClick={() => {
              setRefundTarget(row);
              setReason("");
            }}
          >
            退款
          </Button>
        ) : (
          <span className="text-12 muted">—</span>
        ),
    },
  ];

  return (
    <Panel
      title="微信支付订单"
      titleExtra={<span className="text-12 muted">站点自有商户号直收；退款成功会撤销课程解锁或回退会员时长</span>}
    >
      <Space wrap size={8} style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="昵称 / 订单标题 / 渠道单号"
          style={{ width: 260 }}
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
          style={{ width: 130 }}
          value={kind}
          onChange={(value) => {
            setKind(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部类型" },
            { value: "course", label: "课程" },
            { value: "vip", label: "会员" },
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
            { value: "pending", label: "待支付" },
            { value: "paid", label: "已支付" },
            { value: "closed", label: "已关闭" },
            { value: "refunded", label: "已退款" },
          ]}
        />
      </Space>

      <Table<KpCashOrderRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
        locale={{ emptyText: <EmptyState text="还没有微信支付订单；课程/会员设置现金价后才会产生。" /> }}
      />

      <Modal
        open={Boolean(refundTarget)}
        title={`退款 · ${refundTarget?.title || ""}`}
        onCancel={() => setRefundTarget(null)}
        onOk={() => void refund()}
        confirmLoading={refunding}
        okText="确认退款"
        okButtonProps={{ danger: true }}
        destroyOnHidden
      >
        <div className="text-12 muted" style={{ marginBottom: 8 }}>
          退款金额 ¥{((refundTarget?.amountCents || 0) / 100).toFixed(2)}，原路退回；课程购买会同时撤销解锁。
        </div>
        <Input.TextArea
          rows={3}
          maxLength={120}
          value={reason}
          placeholder="退款原因（选填）"
          onChange={(event) => setReason(event.target.value)}
        />
      </Modal>
    </Panel>
  );
}
