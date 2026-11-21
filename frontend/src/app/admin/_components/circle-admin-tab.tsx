"use client";

import { App, Button, Form, Input, InputNumber, Space, Switch, Table, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import type { CircleAdminCommunity, CircleAdminSettings } from "@enterprise/contracts";
import { circleAdminApi } from "@/api/circle";
import { Panel } from "@/components/ui/panel";

export function CircleAdminTab() {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<CircleAdminCommunity[]>([]);
  const [settings, setSettings] = useState<CircleAdminSettings | null>(null);
  const [keyword, setKeyword] = useState("");
  const [form] = Form.useForm<CircleAdminSettings>();

  const load = useCallback(async () => {
    const [list, config] = await Promise.all([
      circleAdminApi.communities({ query: { page: 1, pageSize: 50, keyword } }),
      circleAdminApi.settings(),
    ]);
    setRows(list?.list || []);
    setSettings(config || null);
    if (config) form.setFieldsValue(config);
  }, [form, keyword]);

  useEffect(() => {
    void load().catch((error) =>
      message.error(error instanceof Error ? error.message : "读取失败"),
    );
  }, [load, message]);

  const save = async () => {
    const values = await form.validateFields();
    try {
      await circleAdminApi.saveSettings({ body: values });
      message.success("平台参数已保存");
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  return (
    <>
      <Panel
        title="圈子社区平台参数"
        extra={<Button type="primary" onClick={save}>保存参数</Button>}
      >
        <Form form={form} layout="inline" initialValues={settings || undefined}>
          <Form.Item name="enabled" label="开放板块" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="defaultPostReview" label="默认发帖审核" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="defaultCommentReview" label="默认评论审核" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="maxGroupsPerUser" label="每人建圈上限">
            <InputNumber min={0} max={1000} />
          </Form.Item>
          <Form.Item name="maxPostsPerDay" label="每日发帖上限">
            <InputNumber min={0} max={10000} />
          </Form.Item>
        </Form>
      </Panel>

      <Panel
        title="社区台账"
        extra={
          <Space>
            <Input.Search
              placeholder="社区名 / 码 / 账号"
              allowClear
              onSearch={setKeyword}
              style={{ width: 260 }}
            />
          </Space>
        }
      >
        <Table<CircleAdminCommunity>
          rowKey="id"
          dataSource={rows}
          pagination={false}
          columns={[
            { title: "社区", dataIndex: "name" },
            { title: "社区码", dataIndex: "code", width: 120 },
            { title: "负责人", dataIndex: "ownerName", width: 180 },
            { title: "成员", dataIndex: "users", width: 80 },
            { title: "圈子", dataIndex: "groups", width: 80 },
            { title: "帖子", dataIndex: "posts", width: 80 },
            {
              title: "状态",
              dataIndex: "status",
              width: 110,
              render: (value: string) =>
                value === "ONLINE" ? (
                  <Tag color="green">运营中</Tag>
                ) : value === "SUSPENDED" ? (
                  <Tag color="red">平台停用</Tag>
                ) : (
                  <Tag>未上线</Tag>
                ),
            },
            {
              title: "操作",
              width: 160,
              render: (_, row) => (
                <Button
                  size="small"
                  danger={row.status === "ONLINE"}
                  onClick={() =>
                    modal.confirm({
                      title:
                        row.status === "ONLINE"
                          ? `停用「${row.name}」？`
                          : `恢复「${row.name}」？`,
                      content:
                        row.status === "ONLINE"
                          ? "停用后 C 端立即不可访问；成员与内容保留。"
                          : "恢复后社区回到运营中；用户仍需自行上线。",
                      onOk: async () => {
                        await circleAdminApi.communityStatus({
                          body: {
                            id: row.id,
                            status: row.status === "ONLINE" ? "SUSPENDED" : "ONLINE",
                            reason: row.status === "ONLINE" ? "平台人工停用" : "",
                          },
                        });
                        message.success("已更新");
                        await load();
                      },
                    })
                  }
                >
                  {row.status === "ONLINE" ? "停用" : "恢复"}
                </Button>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}