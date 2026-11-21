"use client";

import { useCallback, useEffect, useState } from "react";
import {
  App,
  Button,
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
import type { ParkBuilding, ParkResource } from "@enterprise/contracts";
import { PARK_RESOURCE_KINDS } from "@enterprise/contracts";
import { parkApi } from "@/api/park";

type ResourceForm = {
  name: string;
  kind: "VENUE" | "MEETING";
  buildingId?: number;
  capacity: number;
  feeAmount: number;
  stock: number;
  deposit: number;
  location?: string;
  approvalRequired: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  stepMin: number;
};

type SlotForm = {
  date: string;
  startTime: string;
  endTime: string;
  stepMin: number;
};

export function ResourcesPanel({
  siteId,
  buildings,
}: {
  siteId: number;
  buildings: ParkBuilding[];
}) {
  const { message } = App.useApp();
  const [list, setList] = useState<ParkResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [slots, setSlots] = useState<
    Array<{ id: number; label: string; startAt: string; endAt: string; booked: boolean }>
  >([]);
  const [selected, setSelected] = useState<ParkResource | null>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<ResourceForm>();
  const [slotForm] = Form.useForm<SlotForm>();

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setList((await parkApi.resources({ query: { siteId } })) ?? []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "场地读取失败");
    } finally {
      setLoading(false);
    }
  }, [message, siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      await parkApi.resourceSave({
        body: {
          id: 0,
          siteId,
          buildingId: values.buildingId || 0,
          name: values.name,
          kind: values.kind,
          capacity: values.capacity || 1,
          feeAmount: values.feeAmount || 0,
          stock: values.stock || 1,
          deposit: values.deposit || 0,
          location: values.location || "",
          description: "",
          cover: "",
          approvalRequired: Boolean(values.approvalRequired),
          schedule: {
            start: values.scheduleStart || "09:00",
            end: values.scheduleEnd || "18:00",
            stepMin: values.stepMin || 60,
            weekdays: [1, 2, 3, 4, 5],
          },
          status: "ONLINE",
          sort: 0,
        },
      });
      message.success("场地已保存");
      setOpen(false);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: ParkResource) => {
    try {
      await parkApi.resourceStatus({
        body: {
          id: row.id,
          status: row.status === "ONLINE" ? "OFFLINE" : "ONLINE",
        },
      });
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const remove = async (row: ParkResource) => {
    try {
      await parkApi.resourceRemove({ body: { id: row.id } });
      message.success("已删除");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const openSlots = async (row: ParkResource) => {
    setSelected(row);
    setSlotOpen(true);
    try {
      setSlots((await parkApi.resourceSlots({ query: { resourceId: row.id } })) ?? []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "时段读取失败");
    }
  };

  const generate = async () => {
    if (!selected) return;
    const values = await slotForm.validateFields();
    setBusy(true);
    try {
      setSlots(
        (await parkApi.resourceGenerateSlots({
          body: {
            resourceId: selected.id,
            date: values.date,
            startTime: values.startTime,
            endTime: values.endTime,
            stepMin: values.stepMin || 60,
          },
        })) ?? [],
      );
      message.success("时段已生成");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => setOpen(true)}>
          新增场地/会议室
        </Button>
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={list}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "类型", dataIndex: "kindLabel" },
          { title: "楼宇", dataIndex: "buildingName" },
          { title: "容量", dataIndex: "capacity" },
          {
            title: "费用",
            render: (_, row) =>
              row.feeAmount > 0 ? `¥${row.feeAmount.toFixed(2)}` : "免费",
          },
          {
            title: "库存/押金",
            render: (_, row) =>
              row.kind === "EQUIPMENT"
                ? `${row.stock} / ¥${row.deposit.toFixed(2)}`
                : "-",
          },
          {
            title: "审批",
            render: (_, row) => (row.approvalRequired ? "需要" : "免审"),
          },
          {
            title: "状态",
            render: (_, row) => (
              <Tag color={row.status === "ONLINE" ? "green" : "default"}>
                {row.statusLabel}
              </Tag>
            ),
          },
          {
            title: "操作",
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => void openSlots(row)}>
                  时段
                </Button>
                <Button size="small" onClick={() => void toggle(row)}>
                  {row.status === "ONLINE" ? "关闭" : "开放"}
                </Button>
                <Button danger size="small" onClick={() => void remove(row)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新增场地/会议室"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        confirmLoading={busy}
        destroyOnHidden
      >
        <Form
          layout="vertical"
          form={form}
          initialValues={{
            kind: "MEETING",
            capacity: 10,
            feeAmount: 0,
            stock: 1,
            deposit: 0,
            approvalRequired: true,
            scheduleStart: "09:00",
            scheduleEnd: "18:00",
            stepMin: 60,
          }}
        >
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="类型" name="kind">
            <Select
              options={PARK_RESOURCE_KINDS.map((value) => ({
                value,
                label: value === "VENUE" ? "场地" : "会议室",
              }))}
            />
          </Form.Item>
          <Form.Item label="楼宇" name="buildingId">
            <Select
              allowClear
              options={buildings.map((row) => ({ value: row.id, label: row.name }))}
            />
          </Form.Item>
          <Form.Item label="容量" name="capacity">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="单次费用（元，0=免费）" name="feeAmount">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="库存（设备可用数量）" name="stock">
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="押金（元/件）" name="deposit">
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="位置" name="location">
            <Input />
          </Form.Item>
          <Form.Item label="是否需要审批" name="approvalRequired" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Space>
            <Form.Item label="开放开始" name="scheduleStart">
              <Input placeholder="09:00" />
            </Form.Item>
            <Form.Item label="开放结束" name="scheduleEnd">
              <Input placeholder="18:00" />
            </Form.Item>
            <Form.Item label="时段分钟" name="stepMin">
              <InputNumber min={15} max={480} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={`${selected?.name || ""} 时段`}
        open={slotOpen}
        onCancel={() => setSlotOpen(false)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Form
          layout="inline"
          form={slotForm}
          initialValues={{ startTime: "09:00", endTime: "18:00", stepMin: 60 }}
          style={{ marginBottom: 12 }}
        >
          <Form.Item label="日期" name="date" rules={[{ required: true }]}>
            <Input placeholder="YYYY-MM-DD" style={{ width: 130 }} />
          </Form.Item>
          <Form.Item label="开始" name="startTime">
            <Input style={{ width: 80 }} />
          </Form.Item>
          <Form.Item label="结束" name="endTime">
            <Input style={{ width: 80 }} />
          </Form.Item>
          <Form.Item label="间隔" name="stepMin">
            <InputNumber min={15} max={480} />
          </Form.Item>
          <Button type="primary" loading={busy} onClick={() => void generate()}>
            生成时段
          </Button>
        </Form>
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 8 }}
          dataSource={slots}
          columns={[
            { title: "时段", dataIndex: "label" },
            {
              title: "状态",
              render: (_, row) => (
                <Tag color={row.booked ? "orange" : "green"}>
                  {row.booked ? "已约" : "可约"}
                </Tag>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
}
