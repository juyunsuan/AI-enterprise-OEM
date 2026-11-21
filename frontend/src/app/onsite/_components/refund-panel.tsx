"use client";

// 退款售后列表与处理：试算 → 同意（原路退回顾客微信）/ 驳回（必须写理由）。
import {
  ONSITE_REFUND_STATUSES,
  type OnsiteRefundDetail,
  type OnsiteRefundQuote,
  type OnsiteRefundRow,
} from "@enterprise/contracts";
import {
  App,
  Button,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Alert,
} from "antd";
import type { TableProps } from "antd";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  useOnsiteRefund,
  useOnsiteRefundActions,
  useOnsiteRefunds,
} from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, Descriptions, FilterBar } from "./list-kit";
import { StatusTag, cents, statusOptions, statusText, timeText, withShop } from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";

const PAGE_SIZE = 20;
const REMARK_MAX = 300;

type QuoteLine = OnsiteRefundQuote["items"][number];
type RefundLine = OnsiteRefundDetail["lines"][number];

export function RefundPanel() {
  const router = useRouter();
  const { shopId, shop } = useOnsiteScope();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(0);
  const filter = useMemo(
    () => ({ status: status === "all" ? undefined : status }),
    [status],
  );
  const query = useOnsiteRefunds({ shopId }, filter, page, PAGE_SIZE);
  const rows = useMemo(() => query.data?.list ?? [], [query.data]);

  const columns: TableProps<OnsiteRefundRow>["columns"] = [
    {
      title: "退款单号",
      dataIndex: "refundNo",
      width: 190,
      render: (_, row) => (
        <div>
          <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
            {row.refundNo}
          </Button>
          <div className="muted text-12">提交 {timeText(row.createdAt)}</div>
        </div>
      ),
    },
    {
      title: "关联订单",
      dataIndex: "orderNo",
      width: 190,
      render: (_, row) => (
        <div>
          <Button
            size="small"
            type="link"
            onClick={() =>
              router.push(
                withShop(`/onsite/order?orderId=${row.orderId}`, shopId),
              )
            }
          >
            {row.orderNo || `#${row.orderId}`}
          </Button>
          <div className="muted text-12">
            顾客 #{row.customerId} · 技师 #{row.staffId || "未派单"}
          </div>
        </div>
      ),
    },
    {
      title: "申请金额",
      dataIndex: "applyAmountCents",
      width: 120,
      render: (value: number) => cents(value),
    },
    {
      title: "实退金额",
      dataIndex: "refundAmountCents",
      width: 120,
      render: (value: number, row) => (
        <div>
          <div>{row.status === "REFUNDED" ? cents(value || row.applyAmountCents) : "—"}</div>
          {row.refundedAt ? (
            <div className="muted text-12">{timeText(row.refundedAt)}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "原因",
      dataIndex: "reason",
      width: 260,
      render: (_, row) => (
        <div>
          <div>{row.reason || "—"}</div>
          {row.description ? (
            <div className="muted text-12">{row.description}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <StatusTag kind="refund" value={value} />,
    },
    {
      title: "处理说明",
      dataIndex: "auditRemark",
      width: 220,
      render: (value: string, row) => (
        <div>
          <div>{value || "—"}</div>
          {row.refundTransactionId ? (
            <div className="muted text-12">微信退款单号 {row.refundTransactionId}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
          {row.status === "PENDING" ? "处理" : "详情"}
        </Button>
      ),
    },
  ];

  return (
    <Panel
      title="退款申请"
      titleExtra={
        <span className="muted text-12">
          退款从你自己的微信支付商户号原路退回顾客微信，平台不经手资金
        </span>
      }
    >
      <FilterBar>
        <Select
          style={{ width: 150 }}
          value={status}
          onChange={(value: string) => {
            setStatus(value);
            setPage(1);
          }}
          options={statusOptions("refund", ONSITE_REFUND_STATUSES)}
        />
      </FilterBar>
      {query.isError ? (
        <Notice variant="error">
          退款列表读取失败：{query.error.message || "请稍后重试"}
        </Notice>
      ) : null}
      <DataTable<OnsiteRefundRow>
        rows={rows}
        columns={columns}
        total={query.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={query.isFetching}
        onPage={setPage}
        scroll={{ x: 1400 }}
      />
      {!rows.length && !query.isFetching && !query.isError ? (
        <EmptyState
          text={
            status === "all"
              ? "还没有退款申请。顾客在小程序订单里发起退款，或你在订单详情里替顾客申请退款后，这里会出现待处理记录。"
              : "当前状态下没有退款单，把状态切回「全部状态」看看。"
          }
          action={
            <Button
              onClick={() =>
                router.push(withShop("/onsite/order", shopId))
              }
            >
              去订单履约
            </Button>
          }
        />
      ) : null}
      {shop && !shop.payEnabled ? (
        <Notice variant="warn">
          本店铺还没配置微信支付商户号，无法原路退回顾客微信。可以在处理时勾选「线下已退」登记，
          或补齐凭据后再同意。
          <Button
            size="small"
            type="link"
            onClick={() =>
              router.push(withShop("/onsite/publish?panel=wechat", shopId))
            }
          >
            去微信凭据配置商户号
          </Button>
        </Notice>
      ) : null}

      <RefundDetailDrawer
        open={detailId > 0}
        shopId={shopId}
        refundId={detailId}
        merchantReady={Boolean(shop?.payEnabled)}
        onClose={() => setDetailId(0)}
      />
    </Panel>
  );
}

function RefundDetailDrawer({
  open,
  shopId,
  refundId,
  merchantReady,
  onClose,
}: {
  open: boolean;
  shopId: number;
  refundId: number;
  merchantReady: boolean;
  onClose: () => void;
}) {
  const detail = useOnsiteRefund({ shopId }, refundId);
  return (
    <Drawer
      title="退款单详情"
      open={open}
      size={760}
      destroyOnHidden
      onClose={onClose}
    >
      {!open ? null : detail.data ? (
        <RefundDetailBody
          key={`${shopId}-${refundId}`}
          shopId={shopId}
          detail={detail.data}
          merchantReady={merchantReady}
        />
      ) : detail.isError ? (
        <Notice variant="error">
          退款单读取失败：{detail.error.message || "请稍后重试"}
        </Notice>
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function RefundDetailBody({
  shopId,
  detail,
  merchantReady,
}: {
  shopId: number;
  detail: OnsiteRefundDetail;
  merchantReady: boolean;
}) {
  const router = useRouter();
  const actions = useOnsiteRefundActions();
  const [quote, setQuote] = useState<OnsiteRefundQuote | null>(null);
  const [agreeing, setAgreeing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const pending = detail.status === "PENDING";

  const lineColumns: TableProps<RefundLine>["columns"] = [
    { title: "明细行", dataIndex: "orderItemId", render: (value: number) => `#${value}` },
    { title: "退回份数", dataIndex: "quantity", width: 100 },
    {
      title: "退款金额",
      dataIndex: "amountCents",
      width: 120,
      render: (value: number) => cents(value),
    },
    {
      title: "含物料费",
      dataIndex: "materialFeeCents",
      width: 120,
      render: (value: number) => cents(value),
    },
  ];

  const quoteColumns: TableProps<QuoteLine>["columns"] = [
    { title: "服务项目", dataIndex: "title" },
    { title: "已购", dataIndex: "quantity", width: 80 },
    { title: "仍可退", dataIndex: "refundableQuantity", width: 90 },
    {
      title: "单价",
      dataIndex: "unitPriceCents",
      width: 110,
      render: (value: number) => cents(value),
    },
    {
      title: "物料费",
      dataIndex: "materialFeeCents",
      width: 110,
      render: (value: number) => cents(value),
    },
    { title: "时长", dataIndex: "durationMinutes", width: 90, render: (v: number) => `${v} 分钟` },
  ];

  /** 同意前先试算：可退余额来自收款台账，和申请金额不一致时要先核对再决定退多少。 */
  const loadQuote = async () =>
    actions.refundQuote.mutateAsync({
      params: { id: String(shopId) },
      body: { orderId: detail.orderId },
    });

  const runQuote = async () => setQuote(await loadQuote());

  const openAgree = async () => {
    setQuote(await loadQuote());
    setAgreeing(true);
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      {pending ? (
        <Space wrap size={8}>
          <Button type="primary" loading={actions.refundQuote.isPending} onClick={() => void runQuote()}>
            试算可退金额
          </Button>
          <Button type="primary" onClick={() => void openAgree()}>
            同意退款
          </Button>
          <Button danger onClick={() => setRejecting(true)}>
            驳回退款
          </Button>
        </Space>
      ) : (
        <Notice variant="info">
          这张退款单已是「{statusText("refund", detail.status)}」，不能重复处理。
          需要再退一笔请到订单详情重新发起申请。
          <Button
            size="small"
            type="link"
            onClick={() =>
              router.push(withShop(`/onsite/order?orderId=${detail.orderId}`, shopId))
            }
          >
            去这单的订单详情
          </Button>
        </Notice>
      )}

      <Descriptions
        items={[
          { label: "退款单号", value: detail.refundNo },
          { label: "状态", value: <StatusTag kind="refund" value={detail.status} /> },
          {
            label: "关联订单",
            value: (
              <Button
                size="small"
                type="link"
                onClick={() =>
                  router.push(withShop(`/onsite/order?orderId=${detail.orderId}`, shopId))
                }
              >
                {detail.orderNo || `#${detail.orderId}`}
              </Button>
            ),
          },
          {
            label: "订单当前状态",
            value: <StatusTag kind="order" value={detail.orderStatus} />,
          },
          { label: "申请金额", value: cents(detail.applyAmountCents) },
          { label: "实退金额", value: cents(detail.refundAmountCents) },
          { label: "支付方式", value: detail.payType || "—" },
          { label: "提交时间", value: timeText(detail.createdAt) },
          { label: "退款原因", value: detail.reason || "—" },
          { label: "补充说明", value: detail.description || "—" },
          { label: "处理说明", value: detail.auditRemark || "—" },
          { label: "微信退款单号", value: detail.refundTransactionId || "—" },
          { label: "退款时间", value: detail.refundedAt ? timeText(detail.refundedAt) : "—" },
        ]}
      />

      {detail.evidenceImages.length ? (
        <div>
          <Divider orientation="horizontal" titlePlacement="left" plain>
            顾客上传的凭证
          </Divider>
          <Space orientation="vertical" size={4}>
            {detail.evidenceImages.map((url, index) => (
              <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">
                凭证 {index + 1}
              </a>
            ))}
          </Space>
        </div>
      ) : null}

      {detail.lines.length ? (
        <div>
          <Divider orientation="horizontal" titlePlacement="left" plain>
            本次退的明细
          </Divider>
          <DataTable<RefundLine> rows={detail.lines} columns={lineColumns} page={1} />
        </div>
      ) : null}

      {quote ? (
        <div>
          <Divider orientation="horizontal" titlePlacement="left" plain>
            试算结果
          </Divider>
          <Descriptions
            items={[
              { label: "订单号", value: quote.orderNo },
              {
                label: "订单状态",
                value: <StatusTag kind="order" value={quote.status} />,
              },
              {
                label: "可退余额",
                value: <strong>{cents(quote.refundableCents)}</strong>,
              },
              {
                label: "已有在途退款",
                value: quote.pendingRefund ? "有（先处理完那张单）" : "无",
              },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <DataTable<QuoteLine>
              rows={quote.items}
              columns={quoteColumns}
              page={1}
              rowKey="id"
            />
          </div>
          <div className="muted text-12" style={{ marginTop: 8 }}>
            可退余额来自收款台账（含加钟单）的剩余可退之和，可能小于订单实付；
            同意退款退的是这张退款单的申请金额，超过可退余额会被后端拒绝。
          </div>
        </div>
      ) : null}

      {agreeing && pending ? (
        <AgreeRefundModal
          shopId={shopId}
          detail={detail}
          quote={quote}
          merchantReady={merchantReady}
          onClose={() => setAgreeing(false)}
        />
      ) : null}
      {rejecting && pending ? (
        <RejectRefundModal
          shopId={shopId}
          detail={detail}
          onClose={() => setRejecting(false)}
        />
      ) : null}
    </Space>
  );
}

function AgreeRefundModal({
  shopId,
  detail,
  quote,
  merchantReady,
  onClose,
}: {
  shopId: number;
  detail: OnsiteRefundDetail;
  quote: OnsiteRefundQuote | null;
  merchantReady: boolean;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const actions = useOnsiteRefundActions();
  const [form] = Form.useForm<{ remark?: string; offline?: boolean }>();

  const submit = async (values: { remark?: string; offline?: boolean }) => {
    await actions.agreeRefund.mutateAsync({
      params: { id: String(shopId) },
      body: {
        refundId: detail.id,
        remark: values.remark ?? "",
        offline: values.offline === true,
      },
    });
    message.success(
      values.offline
        ? "已登记线下退款，订单转为已退款"
        : "已原路退回顾客微信，顾客稍后在微信里看到到账",
    );
    onClose();
  };

  const overQuota = quote
    ? detail.applyAmountCents > quote.refundableCents
    : false;

  return (
    <Modal
      open
      title={`同意退款 · ${detail.refundNo}`}
      okText="确认退款"
      cancelText="再核对一下"
      destroyOnHidden
      confirmLoading={actions.agreeRefund.isPending}
      onCancel={onClose}
      onOk={() => void form.submit()}
    >
      <Descriptions
        items={[
          { label: "本次退款金额", value: <strong>{cents(detail.applyAmountCents)}</strong> },
          {
            label: "订单可退余额",
            value: quote ? cents(quote.refundableCents) : "未试算",
          },
        ]}
      />
      {overQuota ? (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message="申请金额已超过收款台账的剩余可退额，直接同意会被后端拒绝。"
          description="请先驳回这张单并让顾客按可退金额重新申请，或核对是否已有另一张退款单在途。"
        />
      ) : null}
      {!merchantReady ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message="本店铺未配置微信支付商户号，无法原路退款。"
          description={
            <Space wrap size={8}>
              <span>请勾选下面的「线下已退」，或先去补齐凭据。</span>
              <Button
                size="small"
                onClick={() =>
                  router.push(withShop("/onsite/publish?panel=wechat", shopId))
                }
              >
                去微信凭据
              </Button>
            </Space>
          }
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 12 }}
        initialValues={{ offline: false }}
        onFinish={(values) => void submit(values)}
      >
        <Form.Item
          name="offline"
          label="线下已退（登记，不调微信退款接口）"
          valuePropName="checked"
          extra="用于顾客到店退现、转账退款的场景：勾选后只把订单与退款单改成已退款，钱由你自己退给顾客。"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="remark"
          label="处理说明"
          extra="顾客在退款详情里能看到，建议写清退了哪些项、剩余可退多少。"
        >
          <Input.TextArea rows={2} maxLength={REMARK_MAX} showCount />
        </Form.Item>
      </Form>
      <div className="muted text-12" style={{ marginTop: 8 }}>
        同意后：这张退款单转为「已退款」，订单退款完成、对应份数不再可退，
        顾客端会收到退款到账提醒。原路退回走你自己的商户号，平台不经手资金。
      </div>
    </Modal>
  );
}

function RejectRefundModal({
  shopId,
  detail,
  onClose,
}: {
  shopId: number;
  detail: OnsiteRefundDetail;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const actions = useOnsiteRefundActions();
  const [form] = Form.useForm<{ remark: string }>();

  const submit = async (values: { remark: string }) => {
    await actions.rejectRefund.mutateAsync({
      params: { id: String(shopId) },
      body: { refundId: detail.id, remark: values.remark.trim() },
    });
    message.success("已驳回退款，订单回到申请前的状态，顾客可修改后重新申请");
    onClose();
  };

  return (
    <Modal
      open
      title={`驳回退款 · ${detail.refundNo}`}
      okText="确认驳回"
      cancelText="先不驳回"
      destroyOnHidden
      confirmLoading={actions.rejectRefund.isPending}
      onCancel={onClose}
      onOk={() => void form.submit()}
    >
      <Notice variant="info">
        驳回后订单从「退款中」回到申请前的状态（当前是「
        {statusText("order", detail.orderStatus)}」），顾客端能看到驳回理由并重新申请。
      </Notice>
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 12 }}
        onFinish={(values) => void submit(values)}
      >
        <Form.Item
          name="remark"
          label="驳回理由"
          rules={[{ required: true, message: "驳回必须写理由" }]}
          extra="例如：已完成服务且服务时长未缺，仅可退物料费 xxx 元，请修改金额后重新申请。"
        >
          <Input.TextArea rows={3} maxLength={REMARK_MAX} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}
