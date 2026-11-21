"use client";

// 订单履约列表：筛选只认契约的 status/keyword/staffId，所有履约动作收敛到详情抽屉里做。
import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select, Space } from "antd";
import type { TableProps } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ONSITE_ORDER_STATUS_LABELS,
  type OnsiteOrderRow,
} from "@enterprise/contracts";
import { useOnsiteOrders, useOnsiteStaff } from "@/query/onsite";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { DataTable, FilterBar } from "./list-kit";
import {
  StatusTag,
  cents,
  dayText,
  statusOptions,
  timeText,
  withShop,
} from "./onsite-common";
import { useOnsiteScope } from "./onsite-shell";
import { OrderDetailDrawer } from "./order-detail-drawer";
import { OrderCreateModal } from "./order-create-modal";

const PAGE_SIZE = 20;
/** 契约 keyword 上限按后端截取 40 字符，输入端先卡住。 */
const KEYWORD_MAX = 40;

/**
 * 契约的订单列表行没有 updatedAt（只有各里程碑时间列），
 * 「更新时间」取这行里最晚的一个，顺带说明是哪一步留下的时间。
 */
function lastTouch(row: OnsiteOrderRow): { at: string; label: string } {
  const candidates = [
    { at: row.createdAt, label: "下单" },
    { at: row.paidAt, label: "付款" },
    { at: row.acceptedAt, label: "接单" },
    { at: row.departedAt, label: "出发" },
    { at: row.arrivedAt, label: "到达" },
    { at: row.serviceStartedAt, label: "开始服务" },
    { at: row.completedAt, label: "完成" },
    { at: row.signedAt, label: "签收" },
  ];
  let best = { at: "", label: "" };
  for (const item of candidates) {
    if (item.at > best.at) best = item;
  }
  return best;
}

export function OrderPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const { shopId } = useOnsiteScope();
  const staffQuery = useOnsiteStaff({ shopId }, {}, 1, 100);

  const [status, setStatus] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [staffId, setStaffId] = useState("");
  const [page, setPage] = useState(1);
  // 站内通知形如 /onsite/order?shopId=3&orderId=9：进来直接展开这一单的抽屉。
  const [detailId, setDetailId] = useState(() =>
    Number(params.get("orderId") || 0),
  );
  const [creating, setCreating] = useState(false);

  // 空值转 undefined：契约 query 这几项都带默认值，传空串会覆盖默认口径。
  const filter = useMemo(
    () => ({
      status: status === "all" ? undefined : status,
      keyword: keyword.trim() || undefined,
      staffId: staffId || undefined,
    }),
    [status, keyword, staffId],
  );
  const query = useOnsiteOrders({ shopId }, filter, page, PAGE_SIZE);
  const rows = useMemo(() => query.data?.list ?? [], [query.data]);
  const staffRows = useMemo(() => staffQuery.data?.list ?? [], [staffQuery.data]);
  const filtered = status !== "all" || Boolean(keyword.trim()) || Boolean(staffId);

  const clearFilters = () => {
    setStatus("all");
    setKeyword("");
    setStaffId("");
    setPage(1);
  };

  const columns: TableProps<OnsiteOrderRow>["columns"] = [
    {
      title: "订单号",
      dataIndex: "orderNo",
      width: 190,
      render: (_, row) => (
        <div>
          <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
            {row.orderNo}
          </Button>
          <div className="muted text-12">下单 {timeText(row.createdAt)}</div>
          {row.addonCount ? (
            <div className="muted text-12">已加 {row.addonCount} 个单位时长</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "服务项目",
      dataIndex: "items",
      width: 260,
      render: (_, row) => (
        <div style={{ minWidth: 0 }}>
          <div>
            {row.items.length
              ? row.items
                  .map((item) => `${item.title}×${item.quantity}`)
                  .join("、")
              : row.serviceMode || "—"}
          </div>
          <div className="muted text-12">共 {row.items.length} 项</div>
          {row.customerRemark ? (
            <div className="muted text-12">顾客留言：{row.customerRemark}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "顾客 / 技师",
      dataIndex: "customerName",
      width: 200,
      render: (_, row) => (
        <div>
          <div>{row.customerName || "—"}</div>
          <div className="muted text-12">{row.customerPhone || "—"}</div>
          <div className="muted text-12">
            {row.staffId ? `技师 ${row.staffName || row.staffId}` : "未派单"}
          </div>
        </div>
      ),
    },
    {
      title: "金额",
      dataIndex: "payAmountCents",
      width: 170,
      render: (_, row) => (
        <div>
          <div>{cents(row.payAmountCents)}</div>
          <div className="muted text-12">
            服务 {cents(row.serviceFeeCents)} · 车费 {cents(row.travelFeeCents)}
          </div>
          {row.discountCents ? (
            <div className="muted text-12">优惠 -{cents(row.discountCents)}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "服务时间",
      dataIndex: "startAt",
      width: 190,
      render: (_, row) => (
        <div>
          <div>{dayText(row.startAt)}</div>
          <div className="muted text-12">
            {timeText(row.startAt).slice(11)}–{timeText(row.endAt).slice(11)}
          </div>
          <div className="muted text-12">约定 {row.durationMinutes} 分钟</div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 130,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <StatusTag kind="order" value={row.status} />
          {row.refundStatus ? <StatusTag kind="refund" value={row.refundStatus} /> : null}
        </Space>
      ),
    },
    {
      title: "支付",
      dataIndex: "payStatus",
      width: 120,
      render: (value: string, row) => (
        <Space orientation="vertical" size={2}>
          <StatusTag kind="pay" value={value} />
          {row.payType ? (
            <span className="muted text-12">{row.payType}</span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "createdAt",
      width: 160,
      render: (_, row) => {
        const last = lastTouch(row);
        return (
          <div>
            <div>{timeText(last.at)}</div>
            <div className="muted text-12">{last.label ? `最近：${last.label}` : "—"}</div>
          </div>
        );
      },
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      fixed: "right",
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => setDetailId(row.id)}>
          详情
        </Button>
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
            <Button size="small" type="link" onClick={clearFilters}>
              清除筛选
            </Button>
          </span>
        ) : null
      }
      extra={
        <Button type="primary" onClick={() => setCreating(true)}>
          新建订单（代客下单）
        </Button>
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
          options={statusOptions("order", Object.keys(ONSITE_ORDER_STATUS_LABELS))}
        />
        <Input
          allowClear
          style={{ width: 240 }}
          maxLength={KEYWORD_MAX}
          prefix={<SearchOutlined aria-hidden />}
          placeholder="订单号 / 顾客手机 / 顾客名"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(1);
          }}
        />
        <Select
          allowClear
          style={{ width: 170 }}
          placeholder="按技师筛选"
          value={staffId || undefined}
          onChange={(value: string) => {
            setStaffId(value ?? "");
            setPage(1);
          }}
          options={staffRows.map((item) => ({
            value: String(item.id),
            label: `${item.name}（${item.staffNo || item.id}）`,
          }))}
        />
      </FilterBar>
      {query.isError ? (
        <Notice variant="error">
          订单读取失败：{query.error.message || "请稍后重试"}
        </Notice>
      ) : null}
      <DataTable<OnsiteOrderRow>
        rows={rows}
        columns={columns}
        total={query.data?.total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={query.isFetching}
        onPage={setPage}
        scroll={{ x: 1500 }}
      />
      {!rows.length && !query.isFetching && !query.isError ? (
        filtered ? (
          <Notice variant="info">
            当前条件下没有订单。换个关键字、把状态切回「全部」，或点上面「清除筛选」。
          </Notice>
        ) : (
          <EmptyState
            text="还没有订单。服务上架、小程序发布并把小程序码发给顾客后，顾客下的单会自动进到这里；你也可以用右上角「新建订单」替熟客下一单。"
            action={
              <Space wrap>
                <Button
                  type="primary"
                  onClick={() => router.push(withShop("/onsite/catalog", shopId))}
                >
                  去上架服务
                </Button>
                <Button onClick={() => router.push(withShop("/onsite/publish", shopId))}>
                  去发布小程序
                </Button>
                <Button onClick={() => setCreating(true)}>代客下单</Button>
              </Space>
            }
          />
        )
      ) : null}

      <OrderDetailDrawer
        open={detailId > 0}
        shopId={shopId}
        orderId={detailId}
        onClose={() => setDetailId(0)}
      />
      <OrderCreateModal
        open={creating}
        shopId={shopId}
        onClose={() => setCreating(false)}
        onCreated={(orderId) => {
          setCreating(false);
          setDetailId(orderId);
        }}
      />
    </Panel>
  );
}
