"use client";
import { SearchOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Avatar,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Timeline,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BRAND_ORDER_STATUSES,
  BRAND_ORDER_STATUS_LABELS,
  BRAND_PAY_TYPES,
  BRAND_PAY_TYPE_LABELS,
  BRAND_REFUND_STATUSES,
  type BrandMeta,
  type BrandOrderDetail,
  type BrandOrderItem,
  type BrandOrderRow,
  type BrandOrderStatus,
  type BrandPayType,
  type BrandRefund,
} from "@enterprise/contracts";
import { EmptyState, Panel, PillTabs } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import { useBrandOrder, useBrandOrderActions, useBrandOrders } from "@/query/brand-mall";
import { BrandShell, useBrandScope } from "../_components/brand-shell";
import {
  ActionLink,
  StatusTag,
  countOf,
  dash,
  withShop,
} from "../_components/brand-common";
import { OrderShipModal } from "../_components/order-ship-modal";
import { PromptModal } from "../_components/prompt-modal";

/** 契约里 keyword 上限 60、卖家备注 500、关闭理由 200，输入端先卡住，省一次 400。 */
const KEYWORD_MAX = 60;
const REMARK_MAX = 500;
const CLOSE_REASON_MAX = 200;

/** 订单日志的操作者，契约是 SYSTEM/CUSTOMER/OWNER 三个字面量、没有文案字典。 */
const LOG_OPERATOR_LABELS: Record<string, string> = {
  SYSTEM: "系统",
  CUSTOMER: "顾客",
  OWNER: "店主",
};

/**
 * 页签定义：前五个取契约的订单状态枚举；「售后中」不是订单状态，
 * 而是订单上的售后汇总态 refundStatus=PENDING，所以单独一条并带上候选计数键。
 */
type OrderTab = {
  key: string;
  label: string;
  status?: BrandOrderStatus;
  refundStatus?: (typeof BRAND_REFUND_STATUSES)[number];
  /** statusCounts 的候选键，按序取第一个非 0 的（契约只声明了 string→number 表）。 */
  countKeys: string[];
};

const ORDER_TABS: OrderTab[] = [
  { key: "ALL", label: "全部", countKeys: ["ALL", "TOTAL"] },
  ...BRAND_ORDER_STATUSES.map((status) => ({
    key: status,
    label: BRAND_ORDER_STATUS_LABELS[status] ?? status,
    status,
    countKeys: [status],
  })),
  {
    key: "AFTER_SALE",
    label: "售后中",
    refundStatus: "PENDING",
    countKeys: ["AFTER_SALE", "REFUNDING", "REFUND"],
  },
];

export default function BrandOrderPage() {
  return (
    <BrandShell
      active="order"
      title="订单管理"
      desc="顾客在小程序下的单都进这里：按状态分页签处理，待发货的点「发货」录快递公司与单号，待付款超时的可以关闭。商品、收货地址与金额都取下单时的快照，改商品不会影响历史订单；发货、完成、关闭后各页签计数与今日看板自动刷新。"
    >
      <OrderSection />
    </BrandShell>
  );
}

function OrderSection() {
  const { message, modal } = App.useApp();
  const { shopId, meta } = useBrandScope();
  const params = useSearchParams();
  const actions = useBrandOrderActions();

  const [tab, setTab] = useState(() => {
    const wanted = params.get("status") ?? "";
    return ORDER_TABS.some((item) => item.key === wanted) ? wanted : "ALL";
  });
  const [keyword, setKeyword] = useState(params.get("keyword") ?? "");
  const [payType, setPayType] = useState<BrandPayType | "">("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(0);
  const [shipping, setShipping] = useState<BrandOrderRow | null>(null);
  const [remarking, setRemarking] = useState<BrandOrderRow | null>(null);
  const [closing, setClosing] = useState<BrandOrderRow | null>(null);

  const activeTab = ORDER_TABS.find((item) => item.key === tab) ?? ORDER_TABS[0];
  // 空值一律转 undefined：契约的 query schema 这些都是 optional，传空串会被判成非法值。
  const filter = useMemo(
    () => ({
      keyword: keyword.trim() || undefined,
      status: activeTab.status,
      refundStatus: activeTab.refundStatus,
      payType: payType || undefined,
      dateFrom: range?.[0]?.format("YYYY-MM-DD"),
      dateTo: range?.[1]?.format("YYYY-MM-DD"),
    }),
    [keyword, activeTab, payType, range],
  );

  const query = useBrandOrders({ shopId }, filter, page);
  const rows = query.data?.list ?? [];
  const counts = query.data?.statusCounts;
  const filtered = Boolean(
    keyword.trim() || payType || range || activeTab.key !== "ALL",
  );

  const resetFilters = () => {
    setKeyword("");
    setPayType("");
    setRange(null);
    setTab("ALL");
    setPage(1);
  };

  const finishOrder = (row: BrandOrderRow) => {
    modal.confirm({
      title: `标记完成 · ${row.orderNo}`,
      content:
        "用于顾客已收到货却忘了点「确认收货」的情况。标记后订单转为「已完成」，顾客即可评价，这一步不能撤销。",
      okText: "标记已完成",
      onOk: async () => {
        await actions.finish.mutateAsync({ body: { shopId, id: row.id } });
        message.success(`订单 ${row.orderNo} 已标记完成`);
      },
    });
  };

  const saveRemark = async (row: BrandOrderRow, value: string) => {
    await actions.remark.mutateAsync({
      body: { shopId, id: row.id, sellerRemark: value.slice(0, REMARK_MAX) },
    });
    message.success("卖家备注已保存，只有店铺后台可见");
    setRemarking(null);
  };

  const closeOrder = async (row: BrandOrderRow, reason: string) => {
    await actions.close.mutateAsync({
      body: { shopId, id: row.id, reason: reason.slice(0, CLOSE_REASON_MAX) },
    });
    message.success(`订单 ${row.orderNo} 已关闭，库存已回补`);
    setClosing(null);
  };

  const columns: ColumnsType<BrandOrderRow> = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 190,
      render: (_, row) => (
        <div>
          <div>{row.orderNo}</div>
          {row.status === "PENDING_PAYMENT" && row.expireAt ? (
            <div className="muted text-12">付款截止 {fmtTime(row.expireAt)}</div>
          ) : null}
          {row.paidAt ? (
            <div className="muted text-12">付款 {fmtTime(row.paidAt)}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "商品",
      dataIndex: "itemSummary",
      width: 280,
      render: (_, row) => (
        <Space align="start">
          {row.coverImage ? (
            <RawImg
              src={row.coverImage}
              alt=""
              style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 6,
                background: "#fafafa",
                display: "inline-block",
              }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <div>{dash(row.itemSummary)}</div>
            <div className="muted text-12">共 {row.itemCount} 件</div>
            {row.buyerRemark ? (
              <div className="muted text-12">买家留言：{row.buyerRemark}</div>
            ) : null}
          </div>
        </Space>
      ),
    },
    {
      title: "买家",
      dataIndex: "nickname",
      width: 180,
      render: (_, row) => (
        <Space align="start">
          <Avatar size={28} src={row.avatar || undefined}>
            {row.nickname?.slice(0, 1) || "客"}
          </Avatar>
          <div>
            <div>{dash(row.nickname)}</div>
            <div className="muted text-12">{dash(row.customerPhone)}</div>
          </div>
        </Space>
      ),
    },
    {
      title: "金额",
      dataIndex: "payAmount",
      width: 170,
      render: (_, row) => {
        const extra = [
          row.freightAmount ? `运费 ${moneyCny(row.freightAmount)}` : "",
          row.discountAmount
            ? `优惠 -${moneyCny(row.discountAmount)}${row.couponName ? `（${row.couponName}）` : ""}`
            : "",
          row.pointsDeduct ? `积分抵扣 ${row.pointsDeduct}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div>
            <div>{moneyCny(row.payAmount)}</div>
            {extra ? (
              <div className="muted text-12">
                {extra}
                {row.goodsAmount ? ` · 商品 ${moneyCny(row.goodsAmount)}` : ""}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 150,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <StatusTag meta={meta} kind="order" value={row.status} />
          {row.refundStatus !== "NONE" ? (
            <StatusTag meta={meta} kind="refund" value={row.refundStatus} />
          ) : null}
          {row.payStatus === "REFUNDING" || row.payStatus === "REFUNDED" ? (
            <StatusTag meta={meta} kind="pay" value={row.payStatus} />
          ) : null}
          {row.expressNo ? (
            <span className="muted text-12">
              {dash(row.expressCompany)} {row.expressNo}
            </span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "支付方式",
      dataIndex: "payType",
      width: 110,
      render: (value: string) => <StatusTag meta={meta} kind="payType" value={value} />,
    },
    {
      title: "下单时间",
      dataIndex: "createdAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 250,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
            查看详情
          </Button>
          {row.status === "PAID" ? (
            <Button size="small" type="link" onClick={() => setShipping(row)}>
              发货
            </Button>
          ) : null}
          {row.status === "SHIPPED" ? (
            <Button size="small" type="link" onClick={() => finishOrder(row)}>
              标记完成
            </Button>
          ) : null}
          {row.status === "PENDING_PAYMENT" ? (
            <Button size="small" type="link" danger onClick={() => setClosing(row)}>
              关闭订单
            </Button>
          ) : null}
          <Button size="small" type="link" onClick={() => setRemarking(row)}>
            备注
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="订单列表"
      titleExtra={
        filtered ? (
          <span className="muted text-12">
            已按条件筛选
            <Button size="small" type="link" onClick={resetFilters}>
              清除筛选
            </Button>
          </span>
        ) : null
      }
      extra={
        <PillTabs
          size="small"
          variant="soft"
          value={tab}
          onChange={(key) => {
            setTab(key);
            setPage(1);
          }}
          items={ORDER_TABS.map((item) => ({
            key: item.key,
            label: item.label,
            count: tabCount(item, counts, query.data?.total ?? 0, item.key === tab),
          }))}
        />
      }
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          style={{ width: 240 }}
          maxLength={KEYWORD_MAX}
          prefix={<SearchOutlined aria-hidden />}
          placeholder="订单号 / 买家昵称 / 手机号"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        <DatePicker.RangePicker
          allowClear
          style={{ width: 250 }}
          placeholder={["下单起始日", "下单结束日"]}
          value={range}
          onChange={(value) => {
            setRange(value && value[0] && value[1] ? [value[0], value[1]] : null);
            setPage(1);
          }}
        />
        <Select
          allowClear
          style={{ width: 140 }}
          placeholder="支付方式"
          value={payType || undefined}
          onChange={(value) => {
            setPayType(value ?? "");
            setPage(1);
          }}
          options={BRAND_PAY_TYPES.map((value) => ({
            value,
            label: BRAND_PAY_TYPE_LABELS[value],
          }))}
        />
      </Space>
      <Table<BrandOrderRow>
        rowKey="id"
        size="small"
        loading={query.isFetching}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1580 }}
        locale={{
          emptyText: query.isError ? (
            <EmptyState text={query.error.message || "订单读取失败，请稍后重试"} />
          ) : filtered ? (
            <EmptyState text="没有符合当前条件的订单，换个关键字、放宽日期或切回「全部」页签试试" />
          ) : (
            <EmptyOrderState shopId={shopId} />
          ),
        }}
        pagination={{
          current: page,
          pageSize: 20,
          total: query.data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      <OrderDetailDrawer
        open={detailId > 0}
        shopId={shopId}
        orderId={detailId}
        meta={meta}
        onClose={() => setDetailId(0)}
      />
      <OrderShipModal
        open={Boolean(shipping)}
        shopId={shopId}
        orderId={shipping?.id ?? 0}
        orderNo={shipping?.orderNo ?? ""}
        onClose={() => setShipping(null)}
      />
      <PromptModal
        open={Boolean(remarking)}
        title={`卖家备注 · ${remarking?.orderNo ?? ""}`}
        label="备注内容"
        extra="只有店铺后台可见，不会推给顾客；给顾客看的话请用「发货备注」"
        initialValue={remarking?.sellerRemark ?? ""}
        maxLength={REMARK_MAX}
        placeholder="例如：顾客要求周末送达，已电话确认"
        okText="保存备注"
        confirmLoading={actions.remark.isPending}
        onCancel={() => setRemarking(null)}
        onSubmit={(value) => (remarking ? saveRemark(remarking, value) : Promise.resolve())}
      />
      <PromptModal
        open={Boolean(closing)}
        danger
        title={`关闭订单 · ${closing?.orderNo ?? ""}`}
        label="关闭原因"
        extra="关闭后订单转为「已取消」并回补库存，无法恢复；原因会记进订单流转，顾客端也能看到"
        maxLength={CLOSE_REASON_MAX}
        placeholder="例如：顾客电话要求取消 / 库存不足无法发货"
        okText="确认关闭订单"
        confirmLoading={actions.close.isPending}
        onCancel={() => setClosing(null)}
        onSubmit={(value) => (closing ? closeOrder(closing, value) : Promise.resolve())}
      />
    </Panel>
  );
}

/**
 * `statusCounts` 在契约里只是 string→number 表、没固定汇总键名：先按候选键取，
 * 都取不到时只给当前页签退回列表 total —— 其余页签宁可不显示数字，也不摆一个看着像结论的 0。
 */
function tabCount(
  tab: OrderTab,
  counts: Record<string, number> | undefined,
  activeTotal: number,
  isActive: boolean,
): number | undefined {
  for (const key of tab.countKeys) {
    const value = countOf(counts, key);
    if (value) return value;
  }
  if (tab.key === "ALL") {
    const sum = BRAND_ORDER_STATUSES.reduce((acc, status) => acc + countOf(counts, status), 0);
    if (sum) return sum;
  }
  return isActive && activeTotal ? activeTotal : undefined;
}

/** 一单都没有：把「去哪儿才能让顾客下得了单」说清楚，而不是只留一句空态。 */
function EmptyOrderState({ shopId }: { shopId: number }) {
  const router = useRouter();
  return (
    <EmptyState
      text="还没有订单。商品上架、小程序出包发布后，把小程序码发给顾客，下单会自动进入这里。"
      action={
        <Space wrap>
          <Button type="primary" onClick={() => router.push(withShop("/brand-mall/goods", shopId))}>
            去上架商品
          </Button>
          <Button onClick={() => router.push(withShop("/brand-mall/publish", shopId))}>
            去发布小程序
          </Button>
        </Space>
      }
    />
  );
}

function OrderDetailDrawer({
  open,
  shopId,
  orderId,
  meta,
  onClose,
}: {
  open: boolean;
  shopId: number;
  orderId: number;
  meta: BrandMeta | null;
  onClose: () => void;
}) {
  const detail = useBrandOrder({ shopId }, orderId);
  return (
    <Drawer open={open} size={860} destroyOnHidden onClose={onClose} title="订单详情">
      {!open ? null : detail.data ? (
        <OrderDetailBody
          key={`${shopId}-${orderId}`}
          detail={detail.data}
          meta={meta}
          shopId={shopId}
        />
      ) : detail.isError ? (
        <Alert
          type="error"
          showIcon
          message={`订单详情读取失败：${detail.error.message || "请稍后重试"}`}
        />
      ) : (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin />
        </div>
      )}
    </Drawer>
  );
}

function OrderDetailBody({
  detail,
  meta,
  shopId,
}: {
  detail: BrandOrderDetail;
  meta: BrandMeta | null;
  shopId: number;
}) {
  const { message } = App.useApp();
  const actions = useBrandOrderActions();
  const [remark, setRemark] = useState(detail.sellerRemark);
  const [savingRemark, setSavingRemark] = useState(false);

  const saveRemark = async () => {
    setSavingRemark(true);
    try {
      await actions.remark.mutateAsync({
        body: { shopId, id: detail.id, sellerRemark: remark.trim().slice(0, REMARK_MAX) },
      });
      message.success("卖家备注已保存");
    } finally {
      setSavingRemark(false);
    }
  };

  const itemColumns: ColumnsType<BrandOrderItem> = [
    {
      title: "商品快照",
      dataIndex: "title",
      render: (_, row) => (
        <Space align="start">
          {row.image ? (
            <RawImg
              src={row.image}
              alt=""
              style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }}
            />
          ) : null}
          <div>
            <div>{row.title}</div>
            <div className="muted text-12">
              {dash(row.skuName)}
              {row.reviewed ? " · 已评价" : ""}
            </div>
          </div>
        </Space>
      ),
    },
    { title: "单价", dataIndex: "price", width: 100, render: (value: number) => moneyCny(value) },
    { title: "数量", dataIndex: "quantity", width: 70 },
    {
      title: "小计",
      dataIndex: "totalPrice",
      width: 110,
      render: (value: number) => moneyCny(value),
    },
    {
      title: "售后",
      dataIndex: "refundStatus",
      width: 140,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          {row.refundStatus === "NONE" ? (
            <span className="muted text-12">无售后</span>
          ) : (
            <StatusTag meta={meta} kind="refund" value={row.refundStatus} />
          )}
          {row.refundedAmount ? (
            <span className="muted text-12">已退 {moneyCny(row.refundedAmount)}</span>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: "100%" }}>
      <Descriptions
        size="small"
        bordered
        column={2}
        items={[
          { key: "no", label: "订单号", children: detail.orderNo },
          {
            key: "status",
            label: "状态",
            children: (
              <Space size={4} wrap>
                <StatusTag meta={meta} kind="order" value={detail.status} />
                {detail.refundStatus !== "NONE" ? (
                  <StatusTag meta={meta} kind="refund" value={detail.refundStatus} />
                ) : null}
              </Space>
            ),
          },
          {
            key: "buyer",
            label: "买家",
            children: `${dash(detail.nickname)}（${dash(detail.customerPhone)}）`,
          },
          {
            key: "payType",
            label: "支付方式",
            children: (
              <Space size={4}>
                <StatusTag meta={meta} kind="payType" value={detail.payType} />
                <StatusTag meta={meta} kind="pay" value={detail.payStatus} />
              </Space>
            ),
          },
          { key: "created", label: "下单时间", children: fmtTime(detail.createdAt) },
          { key: "paid", label: "付款时间", children: fmtTime(detail.paidAt) },
          { key: "shipped", label: "发货时间", children: fmtTime(detail.shippedAt) },
          { key: "completed", label: "完成时间", children: fmtTime(detail.completedAt) },
          {
            key: "express",
            label: "物流",
            children: detail.expressNo
              ? `${dash(detail.expressCompany)} ${detail.expressNo}`
              : "未发货",
          },
          { key: "transaction", label: "微信交易号", children: dash(detail.transactionId) },
          ...(detail.status === "CANCELLED"
            ? [{ key: "cancelled", label: "取消时间", children: fmtTime(detail.cancelledAt) }]
            : []),
          ...(detail.status === "PENDING_PAYMENT" && detail.expireAt
            ? [{ key: "expire", label: "付款截止", children: fmtTime(detail.expireAt) }]
            : []),
        ]}
      />

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          收货信息
        </Divider>
        <Descriptions
          size="small"
          bordered
          column={1}
          items={[
            {
              key: "who",
              label: "收货人",
              children: `${dash(detail.receiver.name)} ${dash(detail.receiver.phone)}`,
            },
            {
              key: "addr",
              label: "收货地址",
              children:
                [
                  detail.receiver.province,
                  detail.receiver.city,
                  detail.receiver.district,
                  detail.receiver.detail,
                ]
                  .filter(Boolean)
                  .join(" ") || "—",
            },
            { key: "buyerRemark", label: "买家留言", children: dash(detail.buyerRemark) },
          ]}
        />
      </div>

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          商品明细
        </Divider>
        <Table<BrandOrderItem>
          rowKey="id"
          size="small"
          pagination={false}
          columns={itemColumns}
          dataSource={detail.items}
        />
      </div>

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          金额明细
        </Divider>
        <Descriptions
          size="small"
          bordered
          column={2}
          items={[
            { key: "goods", label: "商品金额", children: moneyCny(detail.goodsAmount) },
            { key: "freight", label: "运费", children: moneyCny(detail.freightAmount) },
            {
              key: "discount",
              label: "优惠",
              children: `-${moneyCny(detail.discountAmount)}${
                detail.couponName ? `（${detail.couponName}）` : ""
              }`,
            },
            {
              key: "points",
              label: "积分抵扣",
              children: detail.pointsDeduct ? `${detail.pointsDeduct} 分` : "无",
            },
            {
              key: "pay",
              label: "实付款",
              children: <strong>{moneyCny(detail.payAmount)}</strong>,
            },
          ]}
        />
      </div>

      {detail.refunds.length ? (
        <div>
          <Divider orientation="horizontal" titlePlacement="left" plain>
            关联售后
          </Divider>
          <Space orientation="vertical" size={6} style={{ width: "100%" }}>
            {detail.refunds.map((refund: BrandRefund) => (
              <Space key={refund.id} wrap size={6}>
                <span className="text-12">{refund.refundNo}</span>
                <StatusTag meta={meta} kind="refundTicket" value={refund.status} />
                <span className="text-12">
                  {dash(refund.reason)} · 申请 {moneyCny(refund.amount)}
                </span>
                <ActionLink
                  path={withShop(
                    `/brand-mall/refund?keyword=${encodeURIComponent(refund.refundNo)}`,
                    shopId,
                  )}
                >
                  处理售后
                </ActionLink>
              </Space>
            ))}
          </Space>
        </div>
      ) : null}

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          卖家备注
        </Divider>
        <Space orientation="vertical" size={8} style={{ width: "100%" }}>
          <Input.TextArea
            rows={2}
            maxLength={REMARK_MAX}
            showCount
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="仅本站可见：打包注意、与顾客的电话约定…"
          />
          <Space size={8}>
            <Button
              size="small"
              type="primary"
              disabled={remark.trim() === detail.sellerRemark}
              loading={savingRemark}
              onClick={() => void saveRemark()}
            >
              保存备注
            </Button>
            <span className="muted text-12">
              备注只有后台看得到；要让顾客知道的话，写在发货弹窗的「发货备注」里
            </span>
          </Space>
        </Space>
      </div>

      <div>
        <Divider orientation="horizontal" titlePlacement="left" plain>
          订单流转
        </Divider>
        {detail.logs.length ? (
          <Timeline
            items={detail.logs.map((log) => ({
              key: log.id,
              color: log.operatorType === "OWNER" ? "blue" : "gray",
              title: log.action,
              content: (
                <span className="muted text-12">
                  {LOG_OPERATOR_LABELS[log.operatorType] ?? log.operatorType}
                  {log.content ? ` · ${log.content}` : ""} · {fmtTime(log.createdAt)}
                </span>
              ),
            }))}
          />
        ) : (
          <span className="muted text-12">这单还没有流转记录。</span>
        )}
      </div>
    </Space>
  );
}
