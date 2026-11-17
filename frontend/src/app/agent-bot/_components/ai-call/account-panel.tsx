"use client";

import { App, Button, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useState } from "react";
import { usePasswordConfirm } from "@/components/confirm-with-password";
import { EmptyState, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";
import { botHostApi } from "../bot-host/common";
import { workbuddyApi } from "../workbuddy/common";
import {
  AI_CALL_PRINCIPAL_LABEL,
  AI_CALL_STATUS_LABEL,
  AI_CALL_STATUS_OPTIONS,
  agentKey,
  aiCallApi,
  extraLines,
  parseAgentKey,
  parseExtraLines,
  type AiCallAccount,
} from "./common";

type AccountForm = {
  name: string;
  platform: string;
  loginUrl: string;
  username: string;
  password: string;
  apiKey: string;
  cookie: string;
  extraText: string;
  status: string;
  notes: string;
};

const EMPTY: AccountForm = {
  name: "",
  platform: "",
  loginUrl: "",
  username: "",
  password: "",
  apiKey: "",
  cookie: "",
  extraText: "",
  status: "active",
  notes: "",
};

/** 已存账号回填：凭据永远不回显（后端只给 hasXxx），留空即不改。 */
function toForm(row: AiCallAccount): AccountForm {
  return {
    ...EMPTY,
    name: row.name,
    platform: row.platform,
    loginUrl: row.loginUrl,
    username: row.username,
    extraText: extraLines(row.extra),
    status: row.status,
    notes: row.notes,
  };
}

/**
 * AI 调用账号：AI 自动化任务登录第三方平台要用的凭据清单（所有类型的 Agent-Bot 共用）。
 * 口令 / API Key / Cookie 以密文落库，界面只显「存过没有」；
 * 一份凭据可授权给多台 Agent——既能在各工具的「Agent 绑定账号」页签按设备勾选，
 * 也能在本页签按凭据点「绑定」一次勾多台。
 */
export function AccountPanel({
  accounts,
  reload,
}: {
  accounts: AiCallAccount[];
  reload: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { request, modal } = usePasswordConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AiCallAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY);
  const [busy, setBusy] = useState(false);

  // 凭据侧绑定：一个账号可以授权给多台 Agent，勾选形态与设备侧「Agent 绑定账号」一致。
  const [agentRow, setAgentRow] = useState<AiCallAccount | null>(null);
  const [agentGroups, setAgentGroups] = useState<
    { label: string; options: { value: string; label: string }[] }[]
  >([]);
  const [agentSelected, setAgentSelected] = useState<string[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);

  const openAgents = useCallback(async (row: AiCallAccount) => {
    setAgentRow(row);
    setAgentSelected(row.bindings.map((item) => agentKey(item.principalKind, item.principalId)));
    setAgentGroups([]);
    setAgentLoading(true);
    try {
      const [desktop, mobot, cloud] = await Promise.all([
        botHostApi.hosts("DESKTOP"),
        botHostApi.hosts("MOBOT"),
        workbuddyApi.accounts(),
      ]);
      const groups = [
        {
          label: AI_CALL_PRINCIPAL_LABEL.DESKTOP,
          options: (desktop.data?.list ?? []).map((host) => ({
            value: agentKey("DESKTOP", host.id),
            label: `${host.name}（${host.statusLabel}）`,
          })),
        },
        {
          label: AI_CALL_PRINCIPAL_LABEL.MOBOT,
          options: (mobot.data?.list ?? []).map((host) => ({
            value: agentKey("MOBOT", host.id),
            label: `${host.name}（${host.statusLabel}）`,
          })),
        },
        {
          label: AI_CALL_PRINCIPAL_LABEL.WORKBUDDY,
          options: (cloud.data ?? []).map((account) => ({
            value: agentKey("WORKBUDDY", account.id),
            label: `${account.name}（${account.status === "active" ? "可用" : "已停用"}）`,
          })),
        },
      ];
      const errors = [desktop.message, mobot.message, cloud.message].filter(Boolean);
      if (errors.length) message.error(errors.join("；"));
      setAgentGroups(groups.filter((group) => group.options.length));
    } finally {
      setAgentLoading(false);
    }
  }, [message]);

  const closeAgents = () => {
    setAgentRow(null);
    setAgentSelected([]);
    setAgentGroups([]);
  };

  const saveAgents = async () => {
    if (!agentRow) return;
    setAgentBusy(true);
    try {
      await aiCallApi.saveAccountAgents(agentRow.id, agentSelected.map(parseAgentKey));
      closeAgents();
      await reload();
      message.success(
        agentSelected.length
          ? `已把「${agentRow.name}」授权给 ${agentSelected.length} 台 Agent`
          : `已解除「${agentRow.name}」的全部 Agent 授权`,
      );
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setAgentBusy(false);
    }
  };

  const patch = (next: Partial<AccountForm>) =>
    setForm((prev) => ({ ...prev, ...next }));

  const close = () => {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
  };

  const submit = async () => {
    const name = form.name.trim();
    const platform = form.platform.trim();
    if (!name) {
      message.error("请填写账号名称");
      return;
    }
    if (!platform) {
      message.error("请填写平台名称或站点地址");
      return;
    }
    const secretReady = Boolean(
      form.password || form.apiKey.trim() || form.cookie.trim(),
    );
    if (!editing && !secretReady) {
      message.error("请至少填一种凭据：登录口令 / API Key / Cookie");
      return;
    }
    const body = {
      name,
      platform,
      loginUrl: form.loginUrl.trim(),
      username: form.username.trim(),
      password: form.password,
      apiKey: form.apiKey.trim(),
      cookie: form.cookie.trim(),
      extra: parseExtraLines(form.extraText),
      status: form.status,
      notes: form.notes.trim(),
    };
    if (editing) {
      const target = editing;
      request({
        title: "修改 AI 调用账号（需密码）",
        content: `确认修改「${target.name}」？${
          secretReady
            ? "填写的凭据会替换旧值，没填的凭据保持原样。"
            : "凭据留空＝沿用已存值。"
        }`,
        okText: "保存修改",
        onOk: async () => {
          await aiCallApi.updateAccount(target.id, body);
          close();
          await reload();
        },
      });
      return;
    }
    setBusy(true);
    try {
      await aiCallApi.createAccount(body);
      close();
      await reload();
      message.success("已登记 1 个 AI 调用账号");
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (row: AiCallAccount) => {
    const boundHint = row.bindings.length
      ? `已绑定 ${row.bindings.length} 台 Agent 的绑定关系会一并删除。`
      : "";
    request({
      title: "删除 AI 调用账号",
      content: `确认删除「${row.name}」？${boundHint}删除后相关任务将无法再取用这份凭据。`,
      danger: true,
      okText: "确认删除",
      onOk: async () => {
        await aiCallApi.deleteAccount(row.id);
        await reload();
      },
    });
  };

  const columns: ColumnsType<AiCallAccount> = [
    {
      title: "账号名称",
      dataIndex: "name",
      key: "name",
      width: 160,
      render: (value: string) => <b>{value}</b>,
    },
    {
      title: "平台",
      dataIndex: "platform",
      key: "platform",
      width: 180,
      ellipsis: true,
      render: (value: string, row) =>
        row.loginUrl ? (
          <a href={row.loginUrl} target="_blank" rel="noreferrer">
            {value}
          </a>
        ) : (
          value
        ),
    },
    {
      title: "登录账号",
      dataIndex: "username",
      key: "username",
      width: 170,
      ellipsis: true,
      render: (value: string) => value || "—",
    },
    {
      title: "凭据",
      key: "credentials",
      width: 190,
      render: (_, row) => {
        const tags = [
          row.hasPassword ? "口令" : "",
          row.hasApiKey ? "API Key" : "",
          row.hasCookie ? "Cookie" : "",
        ].filter(Boolean);
        return tags.length
          ? tags.map((label) => <Tag key={label}>{label}</Tag>)
          : "—";
      },
    },
    {
      title: "绑定的 Agent",
      key: "bindings",
      width: 260,
      render: (_, row) =>
        row.bindings.length
          ? row.bindings.map((binding) => (
              <Tag
                key={`${binding.principalKind}:${binding.principalId}`}
                color="blue"
              >
                {binding.name}
                <span style={{ opacity: 0.65 }}>
                  {`（${AI_CALL_PRINCIPAL_LABEL[binding.principalKind] || binding.principalKind}）`}
                </span>
              </Tag>
            ))
          : "—",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      render: (value: string) => (
        <Tag color={value === "active" ? "success" : "default"}>
          {AI_CALL_STATUS_LABEL[value] || value}
        </Tag>
      ),
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 150,
      render: (value: string) => fmtTime(value),
    },
    {
      title: "操作",
      key: "actions",
      width: 170,
      render: (_, row) => (
        <Space.Compact>
          <Button
            onClick={() => {
              setEditing(row);
              setForm(toForm(row));
              setOpen(true);
            }}
          >
            改
          </Button>
          <Button onClick={() => void openAgents(row)}>绑定</Button>
          <Button danger onClick={() => remove(row)}>
            删
          </Button>
        </Space.Compact>
      ),
    },
  ];

  return (
    <Panel
      title="AI 调用账号"
      titleBadge={`${accounts.length} 个`}
      extra={
        <Button
          onClick={() => {
            setEditing(null);
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          登记账号
        </Button>
      }
    >
      {accounts.length ? (
        <Table<AiCallAccount>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={accounts}
          scroll={{ x: "max-content" }}
          pagination={false}
        />
      ) : (
        <EmptyState text="还没有 AI 调用账号：先登记第三方平台的凭据，再到各工具的「Agent 绑定账号」页签绑定给具体设备" />
      )}

      <Modal
        open={open}
        title={editing ? `修改账号（${editing.name}）` : "登记 AI 调用账号"}
        onCancel={close}
        onOk={() => void submit()}
        okText={busy ? "提交中" : editing ? "下一步（密码确认）" : "保存"}
        cancelText="取消"
        confirmLoading={busy}
        destroyOnHidden
        width={720}
      >
        <div className="data-table-form">
          <label className="data-table-form-item">
            <span className="data-table-form-label">
              账号名称<b style={{ color: "var(--danger)" }}> *</b>
            </span>
            <Input
              value={form.name}
              maxLength={128}
              placeholder="便于在任务里认出它，如「淘宝-运营店」"
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">
              平台<b style={{ color: "var(--danger)" }}> *</b>
            </span>
            <Input
              value={form.platform}
              maxLength={191}
              placeholder="如 淘宝 / 微信公众号 / https://www.taobao.com"
              onChange={(event) => patch({ platform: event.target.value })}
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">登录入口</span>
            <Input
              value={form.loginUrl}
              maxLength={500}
              placeholder="https://…（可选）"
              onChange={(event) => patch({ loginUrl: event.target.value })}
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">用户名</span>
            <Input
              value={form.username}
              maxLength={191}
              placeholder="平台登录名 / 账号 ID"
              onChange={(event) => patch({ username: event.target.value })}
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">登录口令</span>
            <Input.Password
              value={form.password}
              maxLength={500}
              placeholder={
                editing
                  ? editing.hasPassword
                    ? "已保存；留空沿用，填写则替换"
                    : "未保存；按需填写"
                  : "按平台填写，保存后不再回显"
              }
              onChange={(event) => patch({ password: event.target.value })}
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">API Key</span>
            <Input.Password
              value={form.apiKey}
              maxLength={2000}
              placeholder={
                editing
                  ? editing.hasApiKey
                    ? "已保存；留空沿用，填写则替换"
                    : "未保存；按需填写"
                  : "平台签发的 API Key / Access Token"
              }
              onChange={(event) => patch({ apiKey: event.target.value })}
            />
          </label>
          <label className="data-table-form-item" style={{ gridColumn: "1 / -1" }}>
            <span className="data-table-form-label">Cookie</span>
            <Input.TextArea
              value={form.cookie}
              rows={3}
              placeholder={
                editing && editing.hasCookie
                  ? "已保存；留空沿用，填写则替换"
                  : "从浏览器复制的 Cookie 原文（可选）"
              }
              onChange={(event) => patch({ cookie: event.target.value })}
            />
          </label>
          <label className="data-table-form-item" style={{ gridColumn: "1 / -1" }}>
            <span className="data-table-form-label">其他字段</span>
            <Input.TextArea
              value={form.extraText}
              rows={3}
              placeholder={"一行一条，如：\nshopId: 123456\nsubAccount: ops-a"}
              onChange={(event) => patch({ extraText: event.target.value })}
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">状态</span>
            <Select
              value={form.status}
              options={AI_CALL_STATUS_OPTIONS}
              onChange={(value) => patch({ status: value })}
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">备注</span>
            <Input
              value={form.notes}
              maxLength={500}
              placeholder="验证码方式、登录限制等"
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(agentRow)}
        title={agentRow ? `授权给 Agent（${agentRow.name}）` : ""}
        onCancel={closeAgents}
        onOk={() => void saveAgents()}
        okText={agentBusy ? "保存中" : "保存授权"}
        cancelText="取消"
        confirmLoading={agentBusy}
        destroyOnHidden
        width={620}
      >
        <div style={{ marginBottom: 10, color: "var(--muted)" }}>
          一份凭据可以同时授权给多台 Agent：勾选的 BotBuddy 主机 / MoBot 手机 /
          WorkBuddy 企业账号取凭据时都能看到并解密这份凭据，不勾＝一个都取不到。
        </div>
        {agentLoading ? null : agentGroups.length ? (
          <Select
            mode="multiple"
            style={{ width: "100%" }}
            value={agentSelected}
            options={agentGroups}
            optionFilterProp="label"
            placeholder="选择可用的 Agent"
            onChange={setAgentSelected}
          />
        ) : (
          <EmptyState text="还没有可授权的 Agent：先在「BotBuddy 主机」「MoBot 手机」页签配对设备，或在「WorkBuddy 企业云」登记企业账号" />
        )}
      </Modal>
      {modal}
    </Panel>
  );
}
