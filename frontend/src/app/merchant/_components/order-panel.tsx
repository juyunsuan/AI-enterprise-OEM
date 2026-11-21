"use client";

import {
  App,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { MpShopOrder, MpShopOrderItem } from "@enterprise/contracts";
import { MP_ORDER_STATUS_LABELS } from "@enterprise/contracts";
import { mpMerchantApi } from "@/api/marketplace";
import { Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";

const STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT: "gold",
  PAID: "blue",
  SHIPPED: "cyan",
  COMPLETED: "green",
  CANCELLED: "default",
};

const REFUND_LABELS: Record<string, string> = {
  APPLIED: "买家申请退款",
  AGREED: "已同意退款",
  REJECTED: "退款被驳回",
  REFUNDED: "已退款",
  CLOSED: "退款关闭",
};

function ItemsCell({ items }: { items: MpShopOrderItem[] }) {
  return (
    <Space orientation="vertical" size={4}>
      {items.map((item) => (
        <Space key={item.id} size={8}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              overflow: "hidden",
              background: "#fafafa",
              flexShrink: 0,
            }}
          >
            {item.image ? (
              <RawImg
                src={item.image}
                alt={item.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : null}
          </div>
          <span className="text-12">
            {item.title}
            {item.skuName ? `（${item.skuName}）` : ""} × {item.quantity}
          </span>
        </Space>
      ))}
    </Space>
  );
}

/**
 * 商户订单台账：这里是拆单后的子单，只包含本店商品。
 * 父单支付后子单转「待发货」，发货只填快递公司与单号，金额与佣金由中台计算，商户不可改。
 */
export function OrderPanel({ workspaceReady }: { workspaceReady: boolean }) {
  const { message } = App.useApp();
  const [rows, setRows] = useState<MpShopOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MpShopOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceReady) return;
    setLoading(true);
    try {
      const result = await mpMerchantApi.orders({ page, pageSize, status });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "订单读取失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceReady, page, pageSize, status, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: MpShopOrder) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      const next = await mpMerchantApi.orderDetail(row.id);
      if (next) setDetail(next);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "订单详情读取失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<MpShopOrder> = [
    {
      title: "子单号",
      dataIndex: "subOrderNo",
      width: 190,
      render: (value: string, row) => (
        <Space orientation="vertical" size={2}>
          <span>{value}</span>
          <span className="text-12 muted">{row.createdAt}</span>
        </Space>
      ),
    },
    {
      title: "商品",
      dataIndex: "items",
      render: (_, row) => <ItemsCell items={row.items ?? []} />,
    },
    {
      title: "金额",
      dataIndex: "payAmount",
      width: 140,
      render: (_, row) => (
        <div>
          <div>¥{row.payAmount.toFixed(2)}</div>
          <div className="text-12 muted">
            佣金 ¥{row.commissionAmount.toFixed(2)}（{row.commissionRate}%）
          </div>
        </div>
      ),
    },
    {
      title: "收货人",
      dataIndex: "receiverName",
      width: 200,
      render: (_, row) => (
        <div>
          <div>
            {row.receiverName} {row.receiverPhone}
          </div>
          <div className="text-12 muted">{row.receiverAddress}</div>
        </div>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={STATUS_COLOR[row.status]}>
            {MP_ORDER_STATUS_LABELS[row.status] ?? row.status}
          </Tag>
          {row.refundStatus ? (
            <span className="text-12 muted">
              {REFUND_LABELS[row.refundStatus] ?? row.refundStatus}
            </span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "物流",
      dataIndex: "expressNo",
      width: 150,
      render: (_, row) =>
        row.expressNo ? (
          <div>
            <div>{row.expressCompany}</div>
            <div className="text-12 muted">{row.expressNo}</div>
          </div>
        ) : (
          <span className="muted">未发货</span>
        ),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_, row) => (
        <Button size="small" type="link" onClick={() => void openDetail(row)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <Panel title="订单台账">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Select
          allowClear
          placeholder="订单状态"
          style={{ width: 150 }}
          value={status || undefined}
          onChange={(value) => {
            setPage(1);
            setStatus(value ?? "");
          }}
          options={Object.entries(MP_ORDER_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
        }}
      />
      <div className="text-12 muted" style={{ marginTop: 8 }}>
        平台按每单佣金比例结算；退款由市场运营方处理，商户侧只读。
      </div>
      <OrderDrawer
        order={detail}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        onChanged={async () => {
          await load();
          if (detail) {
            try {
              const next = await mpMerchantApi.orderDetail(detail.id);
              if (next) setDetail(next);
            } catch {
              setDetail(null);
            }
          }
        }}
      />
    </Panel>
  );
}

function OrderDrawer({
  order,
  loading,
  onClose,
  onChanged,
}: {
  order: MpShopOrder | null;
  loading: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ expressCompany: string; expressNo: string }>();
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    form.setFieldsValue({
      expressCompany: order.expressCompany,
      expressNo: order.expressNo,
    });
    setRemark(order.sellerRemark);
  }, [order, form]);

  if (!order) {
    return <Drawer open={false} onClose={onClose} title="订单详情" />;
  }

  const ship = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      await mpMerchantApi.orderShip({
        id: order.id,
        expressCompany: values.expressCompany,
        expressNo: values.expressNo,
      });
      message.success("已发货");
      await onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "发货失败");
    } finally {
      setBusy(false);
    }
  };

  const saveRemark = async () => {
    setBusy(true);
    try {
      await mpMerchantApi.orderRemark({ id: order.id, sellerRemark: remark });
      message.success("商家备注已保存");
      await onChanged();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "备注保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      size={680}
      onClose={onClose}
      title={`订单 ${order.subOrderNo}`}
      loading={loading}
    >
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="状态">
          <Tag color={STATUS_COLOR[order.status]}>
            {MP_ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="支付状态">{order.payStatus}</Descriptions.Item>
        <Descriptions.Item label="商品金额">¥{order.goodsAmount.toFixed(2)}</Descriptions.Item>
        <Descriptions.Item label="运费">¥{order.freightAmount.toFixed(2)}</Descriptions.Item>
        <Descriptions.Item label="优惠">¥{order.discountAmount.toFixed(2)}</Descriptions.Item>
        <Descriptions.Item label="实付">¥{order.payAmount.toFixed(2)}</Descriptions.Item>
        <Descriptions.Item label="佣金">
          ¥{order.commissionAmount.toFixed(2)}（{order.commissionRate}%）
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">{order.createdAt}</Descriptions.Item>
        <Descriptions.Item label="收货人" span={2}>
          {order.receiverName} {order.receiverPhone} · {order.receiverAddress}
        </Descriptions.Item>
        <Descriptions.Item label="买家备注" span={2}>
          {order.buyerRemark || "无"}
        </Descriptions.Item>
        {order.shippedAt ? (
          <Descriptions.Item label="发货时间" span={2}>
            {order.shippedAt}
          </Descriptions.Item>
        ) : null}
      </Descriptions>

      <div style={{ marginTop: 16 }}>
        <ItemsCell items={order.items ?? []} />
      </div>

      {order.status === "PAID" ? (
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Space align="end" wrap>
            <Form.Item
              name="expressCompany"
              label="快递公司"
              rules={[{ required: true, message: "请填写快递公司" }]}
            >
              <Input maxLength={40} style={{ width: 180 }} placeholder="如 顺丰速运" />
            </Form.Item>
            <Form.Item
              name="expressNo"
              label="快递单号"
              rules={[{ required: true, message: "请填写快递单号" }]}
            >
              <Input maxLength={60} style={{ width: 240 }} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" loading={busy} onClick={() => void ship()}>
                确认发货
              </Button>
            </Form.Item>
          </Space>
        </Form>
      ) : null}

      <div style={{ marginTop: 16 }}>
        <div className="text-12 muted" style={{ marginBottom: 6 }}>
          商家备注（仅商户后台可见）
        </div>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            value={remark}
            maxLength={500}
            placeholder="内部备注，如已电话确认地址"
            onChange={(event) => setRemark(event.target.value)}
          />
          <Button loading={busy} onClick={() => void saveRemark()}>
            保存
          </Button>
        </Space.Compact>
      </div>
    </Drawer>
  );
}
