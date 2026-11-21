"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
} from "antd";
import dayjs from "dayjs";
import type { ErrandCity, ErrandCoupon } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { useErrandScope } from "./scope";
import { cny, labelOf } from "./common";

type CouponForm = {
  name: string;
  type: "FIXED" | "PERCENT";
  discountValue: number;
  minAmount: number;
  total: number;
  range?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  enabled: boolean;
  cityId: number;
  serviceTypes: string[];
  firstOrderOnly: boolean;
  autoIssue: boolean;
};

/** 优惠券：满减/折扣、门槛、总量与有效期。 */
export function CouponTab() {
  const { meta } = useErrandScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<ErrandCoupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ErrandCoupon | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<CouponForm>();
  const [cities, setCities] = useState<ErrandCity[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows((await errandApi.coupons()) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "优惠券读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    errandApi.cities().then((rows) => setCities(rows ?? [])).catch(() => setCities([]));
  }, [load]);

  const openForm = (row?: ErrandCoupon) => {
    setEditing(row ?? null);
    setOpen(true);
    form.setFieldsValue(
      row
        ? {
            name: row.name,
            type: row.type,
            discountValue: row.discountValue,
            minAmount: row.minAmount,
            total: row.total,
            enabled: row.enabled,
            cityId: row.cityId,
            serviceTypes: row.serviceTypes,
            firstOrderOnly: row.firstOrderOnly,
            autoIssue: row.autoIssue,
            range:
              row.startAt || row.endAt
                ? [row.startAt ? dayjs(row.startAt) : null, row.endAt ? dayjs(row.endAt) : null]
                : null,
          }
        : {
            name: "",
            type: "FIXED",
            discountValue: 5,
            minAmount: 0,
            total: 100,
            enabled: true,
            cityId: 0,
            serviceTypes: [],
            firstOrderOnly: false,
            autoIssue: false,
            range: null,
          },
    );
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await errandApi.couponSave({
        body: {
          id: editing?.id ?? 0,
          name: values.name,
          type: values.type,
          discountValue: Number(values.discountValue) || 0,
          minAmount: Number(values.minAmount) || 0,
          total: Number(values.total) || 0,
          startAt: values.range?.[0] ? values.range[0].toISOString() : "",
          endAt: values.range?.[1] ? values.range[1].toISOString() : "",
          enabled: values.enabled !== false,
          serviceTypes: ((values.serviceTypes || []) as string[]).filter(
            (value): value is "SEND" | "BUY" => value === "SEND" || value === "BUY",
          ),
          firstOrderOnly: values.firstOrderOnly === true,
          autoIssue: values.autoIssue === true,
        },
      });
      message.success("优惠券已保存");
      setOpen(false);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    }
  };

  return (
    <Panel
      title="优惠券"
      titleExtra={
        <Button type="primary" onClick={() => openForm()}>
          新建优惠券
        </Button>
      }
    >
      {error ? <Notice variant="error">{error}</Notice> : null}
      <Table<ErrandCoupon>
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={rows}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "类型", width: 90, render: (_, row) => labelOf(meta, "coupon", row.type) },
          {
            title: "优惠",
            width: 120,
            render: (_, row) =>
              row.type === "PERCENT" ? `${row.discountValue}% 折扣` : `${cny(row.discountValue)} 元`,
          },
          { title: "门槛", width: 100, render: (_, row) => (row.minAmount > 0 ? `满 ${cny(row.minAmount)}` : "无") },
          { title: "领取/使用", width: 110, render: (_, row) => `${row.claimed} / ${row.used}` },
          { title: "总量", width: 80, render: (_, row) => (row.total > 0 ? row.total : "不限") },
          {
            title: "城市",
            width: 120,
            render: (_, row) =>
              row.cityId > 0
                ? cities.find((city) => city.id === row.cityId)?.name || `#${row.cityId}`
                : "全站",
          },
          {
            title: "适用范围",
            width: 130,
            render: (_, row) =>
              [
                row.serviceTypes.length
                  ? row.serviceTypes.map((item) => (item === "BUY" ? "帮我买" : "帮我送")).join("/")
                  : "全部服务",
                row.firstOrderOnly ? "仅首单" : "",
                row.autoIssue ? "自动发" : "",
              ]
                .filter(Boolean)
                .join(" · "),
          },
          {
            title: "有效期",
            width: 210,
            render: (_, row) =>
              `${row.startAt ? new Date(row.startAt).toLocaleDateString() : "立即"} - ${
                row.endAt ? new Date(row.endAt).toLocaleDateString() : "长期"
              }`,
          },
          {
            title: "启用",
            width: 80,
            render: (_, row) => (
              <Switch
                size="small"
                checked={row.enabled}
                onChange={async (checked) => {
                  try {
                    await errandApi.couponStatus({ body: { id: row.id, enabled: checked } });
                    await load();
                  } catch (cause) {
                    message.error(cause instanceof Error ? cause.message : "操作失败");
                  }
                }}
              />
            ),
          },
          {
            title: "操作",
            width: 140,
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openForm(row)}>
                  编辑
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={async () => {
                    try {
                      await errandApi.couponRemove({ body: { id: row.id } });
                      message.success("已删除");
                      await load();
                    } catch (cause) {
                      message.error(cause instanceof Error ? cause.message : "删除失败");
                    }
                  }}
                >
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? "编辑优惠券" : "新建优惠券"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        okText="保存"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请填写名称" }]}>
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select
              options={[
                { value: "FIXED", label: "满减券" },
                { value: "PERCENT", label: "折扣券（按百分比抵扣）" },
              ]}
            />
          </Form.Item>
          <Form.Item name="discountValue" label="优惠值（满减填元，折扣填 1–100）">
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="minAmount" label="使用门槛（元，0=无）">
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="total" label="发放总量（0=不限）">
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item name="range" label="有效期（留空=长期）">
            <DatePicker.RangePicker showTime style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="cityId" label="适用城市">
            <Select
              options={[
                { value: 0, label: "全站通用" },
                ...cities.map((city) => ({ value: city.id, label: city.name })),
              ]}
            />
          </Form.Item>
          <Form.Item name="serviceTypes" label="适用服务（不选=全部）">
            <Select
              mode="multiple"
              options={[
                { value: "SEND", label: "帮我送" },
                { value: "BUY", label: "帮我买" },
              ]}
            />
          </Form.Item>
          <Form.Item name="firstOrderOnly" label="仅限首单顾客" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="autoIssue"
            label="首次登录自动发券"
            valuePropName="checked"
            extra="开启后顾客第一次微信登录即发一张，同一张券不会重复发"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Panel>
  );
}