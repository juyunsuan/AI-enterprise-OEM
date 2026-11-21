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
  Table,
  Tag,
} from "antd";
import type { ParkActivity, ParkActivitySignup } from "@enterprise/contracts";
import { parkApi } from "@/api/park";

type ActivityForm = {
  title: string;
  location?: string;
  startAt: string;
  endAt: string;
  signupDeadline?: string;
  capacity: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  summary?: string;
  content?: string;
};

export function ActivitiesPanel({ siteId }: { siteId: number }) {
  const { message } = App.useApp();
  const [list, setList] = useState<ParkActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signups, setSignups] = useState<ParkActivitySignup[]>([]);
  const [selected, setSelected] = useState<ParkActivity | null>(null);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<ActivityForm>();

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      setList(
        (await parkApi.activities({
          query: { siteId, status: "", keyword: "" },
        })) ?? [],
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "活动读取失败");
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
      await parkApi.activitySave({
        body: {
          id: 0,
          siteId,
          title: values.title,
          cover: "",
          summary: values.summary || "",
          content: values.content || "",
          location: values.location || "",
          startAt: values.startAt,
          endAt: values.endAt,
          signupDeadline: values.signupDeadline || "",
          capacity: values.capacity || 0,
          status: values.status,
        },
      });
      message.success("活动已保存");
      setOpen(false);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: ParkActivity) => {
    try {
      await parkApi.activityStatus({
        body: {
          id: row.id,
          status: row.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED",
        },
      });
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const remove = async (row: ParkActivity) => {
    try {
      await parkApi.activityRemove({ body: { id: row.id } });
      message.success("已删除");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const openSignups = async (row: ParkActivity) => {
    setSelected(row);
    setSignupOpen(true);
    try {
      setSignups(
        (await parkApi.activitySignups({
          query: { activityId: row.id },
        })) ?? [],
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "报名名单读取失败");
    }
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => setOpen(true)}>
          新增活动
        </Button>
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        pagination={false}
        dataSource={list}
        columns={[
          { title: "活动", dataIndex: "title" },
          { title: "地点", dataIndex: "location" },
          { title: "开始", dataIndex: "startAt" },
          { title: "结束", dataIndex: "endAt" },
          {
            title: "报名",
            render: (_, row) =>
              `${row.signupCount}${row.capacity > 0 ? ` / ${row.capacity}` : ""}`,
          },
          {
            title: "状态",
            render: (_, row) => (
              <Tag
                color={
                  row.status === "PUBLISHED"
                    ? "green"
                    : row.status === "CLOSED"
                      ? "default"
                      : "orange"
                }
              >
                {row.statusLabel}
              </Tag>
            ),
          },
          {
            title: "操作",
            render: (_, row) => (
              <Space>
                <Button size="small" onClick={() => void openSignups(row)}>
                  名单
                </Button>
                <Button size="small" onClick={() => void toggle(row)}>
                  {row.status === "PUBLISHED" ? "结束" : "发布"}
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
        title="新增活动"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        confirmLoading={busy}
        destroyOnHidden
        width={720}
      >
        <Form
          layout="vertical"
          form={form}
          initialValues={{ status: "DRAFT", capacity: 0 }}
        >
          <Form.Item label="活动标题" name="title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="地点" name="location">
            <Input />
          </Form.Item>
          <Space>
            <Form.Item
              label="开始时间"
              name="startAt"
              rules={[{ required: true }]}
              tooltip="ISO 时间，例如 2026-11-30T09:00:00+08:00"
            >
              <Input placeholder="2026-11-30T09:00:00+08:00" style={{ width: 260 }} />
            </Form.Item>
            <Form.Item
              label="结束时间"
              name="endAt"
              rules={[{ required: true }]}
              tooltip="ISO 时间，例如 2026-11-30T12:00:00+08:00"
            >
              <Input placeholder="2026-11-30T12:00:00+08:00" style={{ width: 260 }} />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item label="报名截止" name="signupDeadline">
              <Input placeholder="2026-11-29T18:00:00+08:00" style={{ width: 260 }} />
            </Form.Item>
            <Form.Item label="人数上限（0=不限）" name="capacity">
              <InputNumber min={0} max={100000} />
            </Form.Item>
            <Form.Item label="状态" name="status">
              <Select
                options={[
                  { value: "DRAFT", label: "草稿" },
                  { value: "PUBLISHED", label: "发布" },
                  { value: "CLOSED", label: "已结束" },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item label="摘要" name="summary">
            <Input />
          </Form.Item>
          <Form.Item label="正文（支持 HTML）" name="content">
            <Input.TextArea rows={6} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`${selected?.title || ""} 报名名单`}
        open={signupOpen}
        onCancel={() => setSignupOpen(false)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={signups}
          columns={[
            { title: "姓名", dataIndex: "name" },
            { title: "手机号", dataIndex: "phone" },
            { title: "状态", dataIndex: "statusLabel" },
            { title: "备注", dataIndex: "note" },
            { title: "报名时间", dataIndex: "createdAt" },
          ]}
        />
      </Modal>
    </>
  );
}
