"use client";
// 财务-余额与充值：充值卡是顾客在小程序里买的储值档位；充值单到账要店主确认；余额流水与手工调整是全店余额的唯一账本。
import type {
  OnsiteBalanceCardRow,
  OnsiteBalanceCardSave,
  OnsiteBalanceFlowRow,
  OnsiteRechargeRow,
} from "@enterprise/contracts";
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
} from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";
import {
  useOnsiteBalanceCards,
  useOnsiteBalanceFlows,
  useOnsiteRechargeOrders,
  useOnsiteWalletActions,
} from "@/query/onsite";
import type { OnsiteRechargeFilter } from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import { StatusTag, cents, statusOptions, timeText } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const PAGE_SIZE = 20;
const FLOW_TEXT: Record<string, string> = {
  ORDER_PAY: "订单支付",
  RECHARGE: "充值到账",
  ADJUST: "手工调整",
};

type CardForm = {
  name: string;
  faceYuan: number;
  giftYuan: number;
  priceYuan: number;
  validityDays: number;
  sortOrder: number;
  enabled: boolean;
};

const emptyCard: CardForm = {
  name: "",
  faceYuan: 100,
  giftYuan: 0,
  priceYuan: 100,
  validityDays: 0,
  sortOrder: 0,
  enabled: true,
};

const draftOf = (row: OnsiteBalanceCardRow): CardForm => ({
  name: row.name,
  faceYuan: row.faceCents / 100,
  giftYuan: row.giftCents / 100,
  priceYuan: row.priceCents / 100,
  validityDays: row.validityDays,
  sortOrder: row.sortOrder,
  enabled: row.enabled,
});

export function BalancePanel() {
  const { shopId } = useOnsiteScope();
  const actions = useOnsiteWalletActions();
  const cards = useOnsiteBalanceCards({ shopId });
  const [cardOpen, setCardOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<OnsiteBalanceCardRow | null>(null);
  const [cardForm] = Form.useForm<CardForm>();

  const [rechargeStatus, setRechargeStatus] = useState("all");
  const [rechargePage, setRechargePage] = useState(1);
  const rechargeFilter = useMemo(
    () => ({
      status:
        rechargeStatus === "all"
          ? undefined
          : (rechargeStatus as OnsiteRechargeFilter["status"]),
    }),
    [rechargeStatus],
  );
  const recharges = useOnsiteRechargeOrders({ shopId }, rechargeFilter, rechargePage, PAGE_SIZE);
  const [confirming, setConfirming] = useState<OnsiteRechargeRow | null>(null);
  const [confirmForm] = Form.useForm<{ remark: string }>();

  const [customerId, setCustomerId] = useState<number>(0);
  const [flowPage, setFlowPage] = useState(1);
  const flows = useOnsiteBalanceFlows({ shopId }, flowPage, PAGE_SIZE, customerId || 0);
  const [adjustKind, setAdjustKind] = useState<"balance" | "points" | null>(null);
  const [adjustForm] = Form.useForm<{
    customerId: number;
    amount: number;
    remark: string;
  }>();

  const openCard = (row?: OnsiteBalanceCardRow) => {
    cardForm.setFieldsValue(row ? draftOf(row) : { ...emptyCard });
    setEditingCard(row ?? null);
    setCardOpen(true);
  };

  const saveCard = async () => {
    const values = await cardForm.validateFields();
    const body: OnsiteBalanceCardSave = {
      id: editingCard?.id,
      name: values.name,
      faceCents: Math.round(values.faceYuan * 100),
      giftCents: Math.round(values.giftYuan * 100),
      priceCents: Math.round(values.priceYuan * 100),
      validityDays: values.validityDays,
      sortOrder: values.sortOrder,
      enabled: values.enabled,
    };
    await actions.saveBalanceCard.mutateAsync({
      params: { id: String(shopId) },
      body,
    });
    setCardOpen(false);
  };

  const confirmRecharge = async () => {
    if (!confirming) return;
    const values = await confirmForm.validateFields();
    await actions.confirmRecharge.mutateAsync({
      params: { id: String(shopId), rechargeId: String(confirming.id) },
      body: { remark: values.remark || "" },
    });
    setConfirming(null);
  };

  const openAdjust = (kind: "balance" | "points") => {
    adjustForm.setFieldsValue({ customerId: customerId || 0, amount: 0, remark: "" });
    setAdjustKind(kind);
  };

  const submitAdjust = async () => {
    if (!adjustKind) return;
    const values = await adjustForm.validateFields();
    const params = { id: String(shopId) };
    if (adjustKind === "balance") {
      await actions.adjustBalance.mutateAsync({
        params,
        body: {
          customerId: values.customerId,
          amountCents: Math.round(values.amount * 100),
          remark: values.remark,
        },
      });
    } else {
      await actions.adjustPoints.mutateAsync({
        params,
        body: { customerId: values.customerId, points: values.amount, remark: values.remark },
      });
    }
    setAdjustKind(null);
  };

  const cardColumns: TableProps<OnsiteBalanceCardRow>["columns"] = [
    {
      title: "充值卡",
      dataIndex: "name",
      render: (_, row) => (
        <div>
          <strong>{row.name}</strong>
          {row.enabled ? null : <span className="muted text-12">（已下架）</span>}
          <div className="muted text-12">排序 {row.sortOrder}</div>
        </div>
      ),
    },
    { title: "面值", dataIndex: "faceCents", width: 110, render: (v: number) => cents(v) },
    { title: "赠送", dataIndex: "giftCents", width: 110, render: (v: number) => cents(v) },
    { title: "售价", dataIndex: "priceCents", width: 110, render: (v: number) => cents(v) },
    {
      title: "有效期",
      dataIndex: "validityDays",
      width: 110,
      render: (v: number) => (v ? `${v} 天` : "长期"),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => openCard(row)}>
            编辑
          </Button>
          <Popconfirm
            title={`删除充值卡「${row.name}」`}
            description="已售出的充值不受影响；删除后小程序端不再展示这一档。"
            okText="确认删除"
            cancelText="再想想"
            onConfirm={() =>
              void actions.removeBalanceCard.mutateAsync({
                params: { id: String(shopId), cardId: String(row.id) },
                body: undefined,
              })
            }
          >
            <Button size="small" type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const rechargeColumns: TableProps<OnsiteRechargeRow>["columns"] = [
    { title: "充值单号", dataIndex: "orderNo", width: 180 },
    { title: "顾客", dataIndex: "customerName", width: 130 },
    {
      title: "金额",
      dataIndex: "amountCents",
      width: 150,
      render: (_, row) => (
        <div>
          <div>{cents(row.amountCents)}</div>
          <div className="muted text-12">赠送 {cents(row.giftCents)}</div>
        </div>
      ),
    },
    { title: "到账总额", dataIndex: "totalCents", width: 120, render: (v: number) => cents(v) },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <StatusTag kind="recharge" value={value} />,
    },
    {
      title: "下单 / 到账",
      dataIndex: "createdAt",
      width: 200,
      render: (_, row) => (
        <div className="muted text-12">
          <div>{timeText(row.createdAt)}</div>
          {row.paidAt ? <div>到账 {timeText(row.paidAt)}</div> : null}
        </div>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 110,
      render: (_, row) =>
        row.status === "UNPAID" ? (
          <Button
            size="small"
            type="link"
            onClick={() => {
              confirmForm.setFieldsValue({ remark: "" });
              setConfirming(row);
            }}
          >
            确认到账
          </Button>
        ) : (
          <span className="muted text-12">—</span>
        ),
    },
  ];

  const flowColumns: TableProps<OnsiteBalanceFlowRow>["columns"] = [
    { title: "顾客", dataIndex: "customerName", width: 130 },
    {
      title: "类型",
      dataIndex: "type",
      width: 110,
      render: (value: string) => FLOW_TEXT[value] ?? value,
    },
    {
      title: "变动",
      dataIndex: "changeCents",
      width: 110,
      render: (value: number) => (
        <span style={{ color: value >= 0 ? "var(--color-success, #059669)" : "#dc2626" }}>
          {value >= 0 ? "+" : ""}
          {cents(value)}
        </span>
      ),
    },
    {
      title: "变动前 → 后",
      dataIndex: "beforeCents",
      width: 190,
      render: (_, row) => (
        <span className="muted text-12">
          {cents(row.beforeCents)} → {cents(row.afterCents)}
        </span>
      ),
    },
    {
      title: "关联订单",
      dataIndex: "relatedOrderId",
      width: 100,
      render: (value: number) => (value ? `#${value}` : "—"),
    },
    { title: "备注", dataIndex: "remark", width: 220, render: (v: string) => v || "—" },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 160,
      render: (value: string) => timeText(value),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Panel
        title="充值卡"
        extra={
          <Button type="primary" onClick={() => openCard()}>
            新增充值卡
          </Button>
        }
      >
        <Notice variant="info">
          充值卡是顾客在小程序里购买的储值档位：付「售价」，到账「面值 + 赠送」。
          删除只影响小程序端展示，已购买的储值照常使用。
        </Notice>
        {!cards.data?.list.length && !cards.isFetching ? (
          <EmptyState text="还没有充值卡。建一档「充 100 送 10」顾客才买得到储值。" />
        ) : (
          <DataTable<OnsiteBalanceCardRow>
            rows={cards.data?.list ?? []}
            columns={cardColumns}
            page={1}
            loading={cards.isFetching}
          />
        )}
      </Panel>

      <Panel title="充值单">
        <FilterBar>
          <Select
            style={{ width: 160 }}
            value={rechargeStatus}
            options={statusOptions("recharge", ["UNPAID", "PAID", "CANCELLED", "EXPIRED"])}
            onChange={(value) => {
              setRechargeStatus(value);
              setRechargePage(1);
            }}
          />
        </FilterBar>
        {!recharges.data?.list.length && !recharges.isFetching ? (
          <EmptyState text="还没有充值单。顾客在小程序下单充值后在这里确认到账入余额。" />
        ) : (
          <DataTable<OnsiteRechargeRow>
            rows={recharges.data?.list ?? []}
            columns={rechargeColumns}
            total={recharges.data?.total}
            page={rechargePage}
            loading={recharges.isFetching}
            onPage={setRechargePage}
          />
        )}
      </Panel>

      <Panel
        title="余额流水"
        extra={
          <Space>
            <Button onClick={() => openAdjust("points")}>调整积分</Button>
            <Button onClick={() => openAdjust("balance")}>调整余额</Button>
          </Space>
        }
      >
        <FilterBar>
          <InputNumber
            style={{ width: 180 }}
            min={0}
            placeholder="按顾客 ID 筛选"
            value={customerId || undefined}
            onChange={(value) => {
              setCustomerId(Number(value) || 0);
              setFlowPage(1);
            }}
          />
          <span className="muted text-12">留空看全店；每笔变动都记前后余额，可逐笔对账。</span>
        </FilterBar>
        {!flows.data?.list.length && !flows.isFetching ? (
          <EmptyState text="没有余额变动记录。充值到账、订单支付与手工调整都会在这里留一笔。" />
        ) : (
          <DataTable
            rows={flows.data?.list ?? []}
            columns={flowColumns}
            total={flows.data?.total}
            page={flowPage}
            loading={flows.isFetching}
            onPage={setFlowPage}
          />
        )}
      </Panel>

      <Modal
        open={cardOpen}
        destroyOnHidden
        title={editingCard ? `编辑充值卡：${editingCard.name}` : "新增充值卡"}
        confirmLoading={actions.saveBalanceCard.isPending}
        onCancel={() => setCardOpen(false)}
        onOk={() => void saveCard()}
      >
        <Form form={cardForm} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: "请填写充值卡名称" }]}
          >
            <Input maxLength={60} placeholder="例：充 100 送 10" />
          </Form.Item>
          <Space size={12} wrap>
            <Form.Item name="faceYuan" label="面值（元）" rules={[{ required: true }]}>
              <InputNumber style={{ width: 140 }} min={0} step={10} />
            </Form.Item>
            <Form.Item name="giftYuan" label="赠送（元）">
              <InputNumber style={{ width: 140 }} min={0} step={10} />
            </Form.Item>
            <Form.Item
              name="priceYuan"
              label="售价（元）"
              rules={[{ required: true }]}
              extra="顾客实付金额"
            >
              <InputNumber style={{ width: 140 }} min={0} step={10} />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="validityDays" label="有效期（天）" extra="0 = 长期有效">
              <InputNumber style={{ width: 140 }} min={0} max={3650} />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序值">
              <InputNumber style={{ width: 140 }} min={0} max={9999} />
            </Form.Item>
            <Form.Item name="enabled" label="上架" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        open={confirming !== null}
        destroyOnHidden
        title={confirming ? `确认充值到账：${confirming.orderNo}` : ""}
        confirmLoading={actions.confirmRecharge.isPending}
        onCancel={() => setConfirming(null)}
        onOk={() => void confirmRecharge()}
      >
        <div className="muted text-12" style={{ marginBottom: 12 }}>
          顾客 {confirming?.customerName} 应付 {cents(confirming?.amountCents)}，确认后余额增加{" "}
          {cents(confirming?.totalCents)}（含赠送）。请先核实到账再点确认。
        </div>
        <Form form={confirmForm} layout="vertical">
          <Form.Item name="remark" label="到账备注">
            <Input maxLength={200} placeholder="如：微信转账已收到" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={adjustKind !== null}
        destroyOnHidden
        title={adjustKind === "balance" ? "调整余额" : "调整积分"}
        confirmLoading={actions.adjustBalance.isPending || actions.adjustPoints.isPending}
        onCancel={() => setAdjustKind(null)}
        onOk={() => void submitAdjust()}
      >
        <Form form={adjustForm} layout="vertical">
          <Form.Item
            name="customerId"
            label="顾客 ID"
            rules={[{ required: true, message: "请填写顾客 ID" }]}
            extra="在「顾客私域 › 顾客」里查看顾客 ID"
          >
            <InputNumber style={{ width: "100%" }} min={1} />
          </Form.Item>
          <Form.Item
            name="amount"
            label={adjustKind === "balance" ? "调整金额（元）" : "调整积分"}
            rules={[{ required: true, message: "请填写调整数值" }]}
            extra={
              adjustKind === "balance"
                ? "正数加、负数减；余额不允许调成负数"
                : "正数加、负数减；不能填 0"
            }
          >
            <InputNumber
              style={{ width: "100%" }}
              step={adjustKind === "balance" ? 10 : 1}
              placeholder={adjustKind === "balance" ? "如 50 或 -20" : "如 100 或 -50"}
            />
          </Form.Item>
          <Form.Item
            name="remark"
            label="调整原因"
            rules={[{ required: true, message: "请写明调整原因" }]}
          >
            <Input maxLength={200} placeholder="会写进余额流水，便于日后对账" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
