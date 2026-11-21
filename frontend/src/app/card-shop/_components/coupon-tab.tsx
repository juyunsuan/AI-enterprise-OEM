"use client";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import type { CardShopCoupon, CardShopCouponKind, CardShopCategory } from "@enterprise/contracts";
import { cardShopApi } from "@/api/card-shop";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { moneyCny } from "@/lib/money";
import { StatusTag } from "./common";
import { useCardShopScope } from "./scope";

/** 券码：批量生成 + 台账 + 停用/删除。 */
export function CouponTab() {
  const { siteId, meta } = useCardShopScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<CardShopCoupon[]>([]);
  const [categories, setCategories] = useState<CardShopCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [form] = Form.useForm<{
    kind: CardShopCouponKind;
    value: number;
    categoryId: number;
    minAmount: number;
    count: number;
    prefix: string;
    expireAt: string;
    remark: string;
  }>();

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const result = await cardShopApi.couponList({
        query: {
          siteId,
          keyword: keyword.trim() || undefined,
          status: (status || undefined) as CardShopCoupon["status"] | undefined,
          page,
          pageSize,
        },
      });
      setRows(result?.list ?? []);
      setTotal(result?.total ?? 0);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "券码读取失败");
    } finally {
      setLoading(false);
    }
  }, [siteId, keyword, status, page, pageSize, message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!siteId) return;
    void cardShopApi
      .categories({ query: { siteId } })
      .then((data) => setCategories(data ?? []))
      .catch(() => setCategories([]));
  }, [siteId]);

  const generate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const result = await cardShopApi.couponGenerate({
        body: {
          siteId,
          kind: values.kind,
          value: values.value,
          categoryId: values.categoryId || 0,
          minAmount: values.minAmount || 0,
          count: values.count || 10,
          prefix: values.prefix || "",
          expireAt: values.expireAt || "",
          remark: values.remark || "",
        },
      });
      setCodes(result?.codes ?? []);
      message.success(result?.message || "已生成");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "生成失败");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: CardShopCoupon) => {
    try {
      await cardShopApi.couponSave({
        body: {
          siteId,
          id: row.id,
          code: row.code,
          kind: row.kind,
          value: row.value,
          categoryId: row.categoryId,
          minAmount: row.minAmount,
          remark: row.remark,
          expireAt: row.expireAt || "",
          status: row.status === "DISABLED" ? "UNUSED" : "DISABLED",
        },
      });
      message.success("券码状态已更新");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const remove = async (row: CardShopCoupon) => {
    try {
      await cardShopApi.couponRemove({ body: { siteId, ids: [row.id] } });
      message.success("券码已删除");
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  const columns: ColumnsType<CardShopCoupon> = [
    { title: "券码", dataIndex: "code", width: 180 },
    {
      title: "优惠",
      dataIndex: "value",
      width: 140,
      render: (_: unknown, row) =>
        row.kind === "PERCENT" ? `折让 ${row.value}%` : moneyCny(row.value),
    },
    {
      title: "适用范围",
      dataIndex: "categoryName",
      width: 140,
      render: (value: string) => value || "全场",
    },
    {
      title: "门槛",
      dataIndex: "minAmount",
      width: 110,
      render: (value: number) => (Number(value) > 0 ? moneyCny(value) : "无门槛"),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => <StatusTag meta={meta} kind="coupon" value={value} />,
    },
    {
      title: "有效期至",
      dataIndex: "expireAt",
      width: 160,
      render: (value: string | null) => (value ? fmtTime(value) : "长期"),
    },
    { title: "核销订单", dataIndex: "usedOrderNo", width: 170, render: (value: string) => value || "—" },
    {
      title: "操作",
      width: 150,
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Button size="small" type="text" onClick={() => void toggle(row)}>
            {row.status === "DISABLED" ? "启用" : "停用"}
          </Button>
          <Popconfirm title="删除该券码？" onConfirm={() => void remove(row)}>
            <Button size="small" type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="券码台账"
        titleExtra={<span className="muted text-12">下单锁券、关单退回、支付后核销</span>}
        extra={
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ kind: "FIXED", value: 5, count: 10, minAmount: 0, categoryId: 0, prefix: "", expireAt: "", remark: "" });
              setCodes([]);
              setOpen(true);
            }}
          >
            生成券码
          </Button>
        }
      >
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          <Input.Search
            allowClear
            placeholder="券码"
            style={{ width: 200 }}
            onSearch={(value) => {
              setPage(1);
              setKeyword(value);
            }}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 140 }}
            value={status || undefined}
            options={[
              { value: "UNUSED", label: "未使用" },
              { value: "LOCKED", label: "下单占用" },
              { value: "USED", label: "已核销" },
              { value: "DISABLED", label: "已停用" },
            ]}
            onChange={(value) => {
              setPage(1);
              setStatus(value || "");
            }}
          />
        </Space>
        {rows.length || loading ? (
          <Table
            size="small"
            rowKey="id"
            loading={loading}
            dataSource={rows}
            columns={columns}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (value) => `共 ${value} 张`,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                setPageSize(nextSize);
              },
            }}
          />
        ) : (
          <EmptyState text="还没有券码" />
        )}
      </Panel>

      <Modal
        title="批量生成券码"
        open={open}
        width={560}
        onCancel={() => setOpen(false)}
        destroyOnHidden
        footer={
          <Space>
            <Button onClick={() => setOpen(false)}>关闭</Button>
            <Button type="primary" loading={saving} onClick={() => void generate()}>
              生成
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Space size={12} wrap>
            <Form.Item name="kind" label="类型">
              <Select
                style={{ width: 150 }}
                options={[
                  { value: "FIXED", label: "立减金额" },
                  { value: "PERCENT", label: "按比例折让" },
                ]}
              />
            </Form.Item>
            <Form.Item name="value" label="面值 / 折扣" rules={[{ required: true, message: "请填写" }]}>
              <InputNumber min={0} precision={2} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="count" label="数量">
              <InputNumber min={1} max={5000} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="categoryId" label="限定分类（0 = 全场）">
              <Select
                style={{ width: 200 }}
                options={[
                  { value: 0, label: "全场通用" },
                  ...categories.map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
            </Form.Item>
            <Form.Item name="minAmount" label="最低消费（0 = 无门槛）">
              <InputNumber min={0} precision={2} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Space size={12} wrap>
            <Form.Item name="prefix" label="券码前缀">
              <Input maxLength={12} style={{ width: 140 }} placeholder="留空自动生成" />
            </Form.Item>
            <Form.Item name="expireAt" label="有效期至" extra="YYYY-MM-DD，留空长期有效">
              <Input maxLength={32} style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input maxLength={200} />
          </Form.Item>
        </Form>
        {codes.length ? (
          <Panel title="本次生成的券码">
            <Space size={6} wrap>
              {codes.map((code) => (
                <Tag key={code}>{code}</Tag>
              ))}
            </Space>
            <div style={{ marginTop: 8 }}>
              <Button
                size="small"
                onClick={() => {
                  void navigator.clipboard?.writeText(codes.join("\n")).then(() => message.success("已复制全部券码"));
                }}
              >
                复制全部
              </Button>
            </div>
          </Panel>
        ) : null}
      </Modal>
    </div>
  );
}
