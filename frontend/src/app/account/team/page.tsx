"use client";

import {
  App,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { rbacApi } from "@/api/rbac";
import { Notice, PageHero, Panel, PillTabs } from "@/components/ui/panel";

type MembersData = NonNullable<
  Awaited<ReturnType<typeof rbacApi.members>>
>;
type MemberRow = MembersData["items"][number];
type LogsData = NonNullable<
  Awaited<ReturnType<typeof rbacApi.operationLogs>>
>;
type LogRow = LogsData["items"][number];
type MemberForm = {
  name: string;
  username: string;
  password: string;
  roleCode: string;
  scopes: string[];
};

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  ACTIVE: { text: "启用中", color: "green" },
  DISABLED: { text: "已停用", color: "default" },
};

const ACTION_LABEL: Record<string, string> = {
  POST: "新增/提交",
  PUT: "修改",
  PATCH: "修改",
  DELETE: "删除",
};

/** 子账号与操作日志：主账号创建子账号、按模块授权，并查看租户写操作留痕。 */
export default function AccountTeamPage() {
  const { message } = App.useApp();
  const [tab, setTab] = useState("members");
  const [members, setMembers] = useState<MembersData | null>(null);
  const [membersError, setMembersError] = useState("");
  const [membersLoading, setMembersLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<MemberForm>();

  const [logs, setLogs] = useState<LogsData | null>(null);
  const [logError, setLogError] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState<{
    module?: string;
    status?: string;
    page: number;
    pageSize: number;
  }>({ page: 1, pageSize: 20 });

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError("");
    try {
      setMembers(await rbacApi.members());
    } catch (error) {
      setMembersError(error instanceof Error ? error.message : "加载失败");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogError("");
    try {
      setLogs(
        await rbacApi.operationLogs({
          query: {
            module: logFilter.module,
            status: logFilter.status,
            page: logFilter.page,
            pageSize: logFilter.pageSize,
          },
        }),
      );
    } catch (error) {
      setLogError(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLogsLoading(false);
    }
  }, [logFilter]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (tab === "logs") void loadLogs();
  }, [tab, loadLogs]);

  const modules = useMemo(() => members?.modules || [], [members]);
  const moduleName = useMemo(() => {
    const map = new Map(modules.map((item) => [item.key, item.name]));
    return (key: string) => map.get(key) || key;
  }, [modules]);

  const openCreate = () => {
    setEditId(null);
    form.setFieldsValue({
      name: "",
      username: "",
      password: "",
      roleCode: "OPERATOR",
      scopes:
        members?.roles.find((role) => role.code === "OPERATOR")?.defaultScopes ||
        [],
    });
    setDrawerOpen(true);
  };

  const openEdit = (row: MemberRow) => {
    setEditId(row.id);
    form.setFieldsValue({
      name: row.name,
      username: row.username,
      password: "",
      roleCode: row.roleCode,
      scopes: row.scopes,
    });
    setDrawerOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await rbacApi.saveMember({
        body: {
          id: editId ?? undefined,
          name: values.name,
          username: editId ? undefined : values.username,
          password: values.password || undefined,
          roleCode: values.roleCode as "ADMIN" | "OPERATOR" | "FINANCE" | "VIEWER",
          scopes: values.scopes || [],
        },
      });
      message.success(editId ? "子账号已更新" : "子账号已创建");
      setDrawerOpen(false);
      await loadMembers();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: MemberRow) => {
    try {
      await rbacApi.setMemberStatus({
        params: { id: row.id },
        body: { status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" },
      });
      message.success(row.status === "ACTIVE" ? "已停用" : "已启用");
      await loadMembers();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const remove = async (row: MemberRow) => {
    try {
      await rbacApi.removeMember({ params: { id: row.id } });
      message.success("子账号已删除");
      await loadMembers();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const memberColumns: ColumnsType<MemberRow> = [
    {
      title: "成员",
      dataIndex: "name",
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 600 }}>{row.name}</span>
          <span style={{ color: "#8c8c8c", fontSize: 12 }}>{row.username}</span>
        </Space>
      ),
    },
    {
      title: "角色",
      dataIndex: "roleCode",
      width: 110,
      render: (value: string) =>
        members?.roles.find((role) => role.code === value)?.name || value,
    },
    {
      title: "可访问模块",
      dataIndex: "scopes",
      render: (scopes: string[]) => (
        <Space size={[4, 4]} wrap>
          {scopes.length === 0 ? (
            <Tag>未授权</Tag>
          ) : (
            scopes.map((key) => <Tag key={key}>{moduleName(key)}</Tag>)
          )}
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: string) => {
        const item = STATUS_LABEL[value] || { text: value, color: "default" };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
    {
      title: "最近登录",
      dataIndex: "lastLoginAt",
      width: 170,
      render: (value: string | null) =>
        value ? new Date(value).toLocaleString("zh-CN") : "从未登录",
    },
    {
      title: "操作",
      key: "action",
      width: 190,
      render: (_, row) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Button type="link" size="small" onClick={() => void toggleStatus(row)}>
            {row.status === "ACTIVE" ? "停用" : "启用"}
          </Button>
          <Popconfirm
            title="删除该子账号？"
            description="删除后该账号立即无法登录，操作不可恢复。"
            okText="删除"
            cancelText="取消"
            onConfirm={() => void remove(row)}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const logColumns: ColumnsType<LogRow> = [
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 175,
      render: (value: string) => new Date(value).toLocaleString("zh-CN"),
    },
    {
      title: "操作人",
      dataIndex: "actorName",
      width: 150,
      render: (value: string, row) => (
        <Space direction="vertical" size={0}>
          <span>{value || row.actorUserId}</span>
          <span style={{ color: "#8c8c8c", fontSize: 12 }}>
            {row.subAccountId ? "子账号" : "主账号"}
          </span>
        </Space>
      ),
    },
    { title: "模块", dataIndex: "moduleName", width: 130 },
    {
      title: "动作",
      dataIndex: "action",
      width: 100,
      render: (value: string) => ACTION_LABEL[value] || value,
    },
    {
      title: "接口",
      dataIndex: "path",
      render: (value: string, row) => (
        <Space size={6}>
          <Tag>{row.method}</Tag>
          <span style={{ fontSize: 12, color: "#595959" }}>{value}</span>
        </Space>
      ),
    },
    {
      title: "结果",
      dataIndex: "status",
      width: 100,
      render: (value: string) =>
        value === "DENIED" ? (
          <Tag color="red">已拒绝</Tag>
        ) : (
          <Tag color="green">成功</Tag>
        ),
    },
    { title: "IP", dataIndex: "ip", width: 140 },
  ];

  return (
    <div>
      <PageHero
        title="子账号与操作日志"
        desc="为主账号创建独立登录的子账号，按业务模块授权；所有写操作自动留痕，可用于追责与审计。"
      />
      <Panel
        title="成员与审计"
        extra={
          <PillTabs
            items={[
              { key: "members", label: "子账号" },
              { key: "logs", label: "操作日志" },
            ]}
            value={tab}
            onChange={setTab}
            size="small"
          />
        }
      >
        {tab === "members" ? (
          <>
            {membersError ? <Notice variant="error">{membersError}</Notice> : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
                gap: 12,
              }}
            >
              <span style={{ color: "#8c8c8c" }}>
                子账号与主账号共享业务数据，但仅能访问被授权的模块。
              </span>
              <Button type="primary" onClick={openCreate}>
                新增子账号
              </Button>
            </div>
            <Table<MemberRow>
              rowKey="id"
              size="middle"
              loading={membersLoading}
              columns={memberColumns}
              dataSource={members?.items || []}
              pagination={false}
              locale={{ emptyText: "还没有子账号" }}
            />
          </>
        ) : (
          <>
            {logError ? <Notice variant="error">{logError}</Notice> : null}
            <Space style={{ marginBottom: 12 }} wrap>
              <Select
                allowClear
                placeholder="全部模块"
                style={{ width: 170 }}
                value={logFilter.module}
                options={modules.map((item) => ({
                  value: item.key,
                  label: item.name,
                }))}
                onChange={(value) =>
                  setLogFilter((prev) => ({ ...prev, module: value, page: 1 }))
                }
              />
              <Select
                allowClear
                placeholder="全部结果"
                style={{ width: 140 }}
                value={logFilter.status}
                options={[
                  { value: "OK", label: "成功" },
                  { value: "DENIED", label: "已拒绝" },
                ]}
                onChange={(value) =>
                  setLogFilter((prev) => ({ ...prev, status: value, page: 1 }))
                }
              />
            </Space>
            <Table<LogRow>
              rowKey="id"
              size="middle"
              loading={logsLoading}
              columns={logColumns}
              dataSource={logs?.items || []}
              pagination={{
                current: logs?.page || logFilter.page,
                pageSize: logs?.pageSize || logFilter.pageSize,
                total: logs?.total || 0,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                onChange: (page, pageSize) =>
                  setLogFilter((prev) => ({ ...prev, page, pageSize })),
              }}
              locale={{ emptyText: "暂无操作记录" }}
            />
          </>
        )}
      </Panel>

      <Drawer
        title={editId ? "编辑子账号" : "新增子账号"}
        size={480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void submit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" key={editId ?? "create"}>
          <Form.Item
            name="name"
            label="成员姓名"
            rules={[{ required: true, message: "请填写成员姓名" }]}
          >
            <Input maxLength={60} placeholder="用于操作日志展示" />
          </Form.Item>
          <Form.Item
            name="username"
            label="登录名"
            rules={[
              { required: !editId, message: "请填写登录名" },
              {
                pattern: /^[a-z0-9_.-]{3,64}$/,
                message: "3-64 位字母、数字或 _ . -",
              },
            ]}
          >
            <Input disabled={Boolean(editId)} placeholder="子账号登录本站使用" />
          </Form.Item>
          <Form.Item
            name="password"
            label={editId ? "重置密码（留空不改）" : "初始密码"}
            rules={[
              { required: !editId, message: "请设置初始密码" },
              { min: 8, max: 64, message: "密码长度需为 8-64 位" },
            ]}
          >
            <Input.Password placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item
            name="roleCode"
            label="角色"
            rules={[{ required: true, message: "请选择角色" }]}
          >
            <Select
              options={(members?.roles || []).map((role) => ({
                value: role.code,
                label: `${role.name} · ${role.desc}`,
              }))}
              onChange={(value) => {
                const preset = members?.roles.find(
                  (role) => role.code === value,
                )?.defaultScopes;
                if (preset) form.setFieldValue("scopes", preset);
              }}
            />
          </Form.Item>
          <Form.Item
            name="scopes"
            label="可访问模块"
            rules={[{ required: true, message: "至少授权一个模块" }]}
          >
            <Checkbox.Group
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
              options={modules.map((item) => ({
                value: item.key,
                label: item.name,
              }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
