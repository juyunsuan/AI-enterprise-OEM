"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ErrandCity } from "@enterprise/contracts";
import { errandApi } from "@/api/errand";
import { Notice, Panel } from "@/components/ui/panel";
import { useErrandScope } from "./scope";
import { cny, labelOf } from "./common";

type CityDraft = {
  name: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  lng: number;
  lat: number;
  status: "ENABLED" | "DISABLED";
  sort: number;
  baseFee: number;
  baseDistanceKm: number;
  perKmFee: number;
  baseWeightKg: number;
  perKgFee: number;
  nightStart: string;
  nightEnd: string;
  nightFee: number;
  buyServiceRate: number;
  minOrderAmount: number;
  maxDistanceKm: number;
  maxWeightKg: number;
  acceptRadiusKm: number;
  autoDispatch: boolean;
  riderShareRate: number;
  maxActiveOrders: number;
  pointsEarnRate: number;
  pointsDeductRate: number;
  maxPointsDiscountRate: number;
  couponEnabled: boolean;
};

const EMPTY: CityDraft = {
  name: "",
  province: "",
  city: "",
  district: "",
  addressLine: "",
  lng: 0,
  lat: 0,
  status: "ENABLED",
  sort: 0,
  baseFee: 5,
  baseDistanceKm: 3,
  perKmFee: 2,
  baseWeightKg: 5,
  perKgFee: 1,
  nightStart: "22:00",
  nightEnd: "06:00",
  nightFee: 3,
  buyServiceRate: 0.1,
  minOrderAmount: 0,
  maxDistanceKm: 30,
  maxWeightKg: 30,
  acceptRadiusKm: 5,
  autoDispatch: false,
  riderShareRate: 1,
  maxActiveOrders: 3,
  pointsEarnRate: 1,
  pointsDeductRate: 100,
  maxPointsDiscountRate: 0.2,
  couponEnabled: true,
};

/**
 * 服务城市：一个平台账号下可开多个城市，每城独立计价、骑手与订单。
 * 不引入第二套账号体系，城市只是站点内的业务分区。
 */
export function CityTab() {
  const { meta, reload } = useErrandScope();
  const { message } = App.useApp();
  const [rows, setRows] = useState<ErrandCity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ErrandCity | null>(null);
  const [form] = Form.useForm<CityDraft>();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows((await errandApi.cities()) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "城市读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = (row?: ErrandCity) => {
    setEditing(row ?? null);
    setOpen(true);
    if (!row) {
      form.setFieldsValue(EMPTY);
      return;
    }
    form.setFieldsValue({
      ...EMPTY,
      ...row,
      ...row.rule,
      status: row.status,
    });
  };

  const submit = async () => {
    const values = await form.validateFields();
    try {
      await errandApi.citySave({
        body: {
          id: editing?.id ?? 0,
          name: values.name,
          province: values.province,
          city: values.city,
          district: values.district,
          addressLine: values.addressLine,
          lng: Number(values.lng) || 0,
          lat: Number(values.lat) || 0,
          status: values.status,
          sort: Number(values.sort) || 0,
          rule: {
            baseFee: Number(values.baseFee) || 0,
            baseDistanceKm: Number(values.baseDistanceKm) || 0,
            perKmFee: Number(values.perKmFee) || 0,
            baseWeightKg: Number(values.baseWeightKg) || 0,
            perKgFee: Number(values.perKgFee) || 0,
            nightStart: values.nightStart || "",
            nightEnd: values.nightEnd || "",
            nightFee: Number(values.nightFee) || 0,
            buyServiceRate: Number(values.buyServiceRate) || 0,
            minOrderAmount: Number(values.minOrderAmount) || 0,
            maxDistanceKm: Number(values.maxDistanceKm) || 1,
            maxWeightKg: Number(values.maxWeightKg) || 1,
            tipPresets: [0, 2, 5, 10],
            couponEnabled: values.couponEnabled !== false,
            acceptRadiusKm: Number(values.acceptRadiusKm) || 0,
            autoDispatch: values.autoDispatch === true,
            riderShareRate: Number(values.riderShareRate) || 1,
            maxActiveOrders: Number(values.maxActiveOrders) || 3,
            pointsEarnRate: Number(values.pointsEarnRate) || 0,
            pointsDeductRate: Number(values.pointsDeductRate) || 100,
            maxPointsDiscountRate: Number(values.maxPointsDiscountRate) || 0,
          },
        },
      });
      message.success("城市与计价已保存");
      setOpen(false);
      await load();
      await reload();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    }
  };

  return (
    <Panel
      title="服务城市"
      titleExtra={<span className="text-12 muted">同一账号下的城市分区：各城独立计价、骑手与订单</span>}
      extra={
        <Button type="primary" onClick={() => openForm()}>
          新增城市
        </Button>
      }
    >
      {error ? <Notice variant="error">{error}</Notice> : null}
      <Notice variant="info">
        小程序进入后先选城市，报价、优惠券、骑手接单与派单都只在该城市内生效；城市停用后顾客看不到、骑手不能再接该城订单。
      </Notice>
      <Table<ErrandCity>
        rowKey="id"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={rows}
        columns={[
          { title: "城市/服务区", dataIndex: "name" },
          {
            title: "区域",
            render: (_, row) => [row.province, row.city, row.district].filter(Boolean).join(" ") || "—",
          },
          {
            title: "状态",
            width: 100,
            render: (_, row) => (
              <Tag color={row.status === "ENABLED" ? "green" : "default"}>
                {labelOf(meta, "city", row.status)}
              </Tag>
            ),
          },
          { title: "起步价", width: 90, render: (_, row) => cny(row.rule.baseFee) },
          { title: "超距/公里", width: 110, render: (_, row) => cny(row.rule.perKmFee) },
          { title: "骑手", width: 80, render: (_, row) => row.riderCount },
          { title: "订单", width: 80, render: (_, row) => row.orderCount },
          { title: "排序", width: 70, dataIndex: "sort" },
          {
            title: "操作",
            width: 210,
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => openForm(row)}>
                  编辑
                </Button>
                <Button
                  size="small"
                  onClick={async () => {
                    try {
                      await errandApi.cityStatus({
                        body: {
                          id: row.id,
                          status: row.status === "ENABLED" ? "DISABLED" : "ENABLED",
                        },
                      });
                      await load();
                    } catch (cause) {
                      message.error(cause instanceof Error ? cause.message : "操作失败");
                    }
                  }}
                >
                  {row.status === "ENABLED" ? "停用" : "开通"}
                </Button>
                <Button
                  size="small"
                  danger
                  onClick={async () => {
                    try {
                      await errandApi.cityRemove({ body: { id: row.id } });
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
        title={editing ? "编辑城市与计价" : "新增城市"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        okText="保存"
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Divider titlePlacement="left">城市信息</Divider>
          <Space wrap align="start">
            <Form.Item name="name" label="城市/服务区名称" rules={[{ required: true, message: "请填写名称" }]}>
              <Input style={{ width: 220 }} maxLength={60} />
            </Form.Item>
            <Form.Item name="province" label="省">
              <Input style={{ width: 120 }} maxLength={40} />
            </Form.Item>
            <Form.Item name="city" label="市">
              <Input style={{ width: 120 }} maxLength={40} />
            </Form.Item>
            <Form.Item name="district" label="区">
              <Input style={{ width: 120 }} maxLength={40} />
            </Form.Item>
            <Form.Item name="sort" label="排序">
              <InputNumber min={0} max={9999} />
            </Form.Item>
          </Space>
          <Form.Item name="addressLine" label="城市中心/默认地址">
            <Input maxLength={200} />
          </Form.Item>
          <Space wrap align="start">
            <Form.Item name="lng" label="经度">
              <InputNumber min={-180} max={180} />
            </Form.Item>
            <Form.Item name="lat" label="纬度">
              <InputNumber min={-90} max={90} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select
                style={{ width: 120 }}
                options={[
                  { value: "ENABLED", label: "开通" },
                  { value: "DISABLED", label: "停用" },
                ]}
              />
            </Form.Item>
          </Space>

          <Divider titlePlacement="left">计价与派单</Divider>
          <Space wrap align="start">
            <Form.Item name="baseFee" label="起步价（元）">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="baseDistanceKm" label="起步距离（公里）">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="perKmFee" label="超距（元/公里）">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="minOrderAmount" label="最低服务费">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="baseWeightKg" label="起步重量（kg）">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="perKgFee" label="超重（元/kg）">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="nightStart" label="夜间开始">
              <Input style={{ width: 90 }} maxLength={5} />
            </Form.Item>
            <Form.Item name="nightEnd" label="夜间结束">
              <Input style={{ width: 90 }} maxLength={5} />
            </Form.Item>
            <Form.Item name="nightFee" label="夜间加价">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="buyServiceRate" label="帮买费率">
              <InputNumber min={0} max={1} step={0.01} />
            </Form.Item>
            <Form.Item name="maxDistanceKm" label="最大距离">
              <InputNumber min={0.1} />
            </Form.Item>
            <Form.Item name="maxWeightKg" label="最大重量">
              <InputNumber min={0.1} />
            </Form.Item>
            <Form.Item name="acceptRadiusKm" label="抢单半径（0=不限）">
              <InputNumber min={0} max={100} />
            </Form.Item>
            <Form.Item name="riderShareRate" label="骑手分成（0.8=80%）">
              <InputNumber min={0} max={1} step={0.05} />
            </Form.Item>
            <Form.Item name="maxActiveOrders" label="骑手在途单上限">
              <InputNumber min={1} max={20} />
            </Form.Item>
            <Form.Item name="pointsEarnRate" label="每元返积分">
              <InputNumber min={0} max={100} step={0.1} />
            </Form.Item>
            <Form.Item name="pointsDeductRate" label="多少积分抵1元">
              <InputNumber min={1} max={10000} />
            </Form.Item>
            <Form.Item name="maxPointsDiscountRate" label="积分最多抵扣比例">
              <InputNumber min={0} max={1} step={0.05} />
            </Form.Item>
            <Form.Item name="autoDispatch" label="自动派单" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="couponEnabled" label="启用优惠券" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Panel>
  );
}