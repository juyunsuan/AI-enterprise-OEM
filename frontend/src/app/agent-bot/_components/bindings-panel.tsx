"use client";

import { App, Button, Modal, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Notice, Panel } from "@/components/ui/panel";
import { aiCallApi, type AiCallAccount, type AiCallPrincipalKind } from "./ai-call/common";

/**
 * Agent 绑定账号：把「AI 调用账号」里的第三方平台凭据按设备主体授权给具体 Agent。
 * 一台 AWBotDSH 主机 / 一部 AWBot 手机 / 一个 WorkBuddy 企业账号各选各的；
 * 设备侧取凭据时（x-bot-token 设备通道或 x-api-key + kind/agentId）严格按这份绑定放行。
 */
export type BindableDevice = {
  id: number;
  name: string;
  /** 设备摘要（系统/版本、状态等），只显示不参与判定。 */
  hint?: string;
  /** 设备当前不可用（离线/停用）：界面标灰，绑定关系仍保留。 */
  inactive?: boolean;
};

type Row = BindableDevice & { accountIds: number[] };

export function AgentBindingsPanel({
  kind,
  devices,
  title = "Agent 绑定账号",
  emptyDevices,
}: {
  kind: AiCallPrincipalKind;
  devices: BindableDevice[];
  title?: string;
  emptyDevices?: string;
}) {
  const { message } = App.useApp();
  const [accounts, setAccounts] = useState<AiCallAccount[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const deviceKey = useMemo(
    () => `${kind}:${devices.map((row) => row.id).join(",")}`,
    [kind, devices],
  );

  const reload = useCallback(async () => {
    const [accountResult, ...bindingResults] = await Promise.all([
      aiCallApi.accounts(),
      ...devices.map((device) => aiCallApi.bindings(kind, device.id)),
    ]);
    setAccounts(accountResult.data ?? []);
    setRows(
      devices.map((device, index) => ({
        ...device,
        accountIds: bindingResults[index].data?.accountIds ?? [],
      })),
    );
    setError(
      [accountResult, ...bindingResults]
        .map((result) => result.message)
        .filter(Boolean)
        .join("；"),
    );
    setLoading(false);
  }, [devices, kind]);

  useEffect(() => {
    void reload();
    // deviceKey 变了（设备增减或切换类型）才重取，避免父组件每次渲染都打一遍接口。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceKey]);

  const accountName = useCallback(
    (id: number) => accounts.find((item) => item.id === id),
    [accounts],
  );

  const options = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: `${account.name}（${account.platform}）${
          account.status === "active" ? "" : " · 已停用"
        }`,
      })),
    [accounts],
  );

  const columns: ColumnsType<Row> = [
    {
      title: "Agent",
      dataIndex: "name",
      key: "name",
      width: 220,
      render: (value: string, row) => (
        <div>
          <b>{value}</b>
          {row.hint ? (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{row.hint}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "已绑定的 AI 调用账号",
      key: "accounts",
      render: (_, row) =>
        row.accountIds.length ? (
          row.accountIds.map((id) => {
            const account = accountName(id);
            return (
              <Tag
                key={id}
                color={account && account.status === "active" ? "blue" : "default"}
              >
                {account ? `${account.name} · ${account.platform}` : `#${id}`}
              </Tag>
            );
          })
        ) : (
          <span style={{ color: "var(--muted)" }}>未绑定（取不到任何凭据）</span>
        ),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_, row) => (
        <Button
          onClick={() => {
            setEditing(row);
            setSelected(row.accountIds);
          }}
        >
          绑定
        </Button>
      ),
    },
  ];

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await aiCallApi.saveBindings(kind, editing.id, selected);
      setRows((prev) =>
        prev.map((row) => (row.id === editing.id ? { ...row, accountIds: selected } : row)),
      );
      setEditing(null);
      message.success(`已更新「${editing.name}」的可用凭据`);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={title} titleBadge={`${devices.length} 台`}>
      {error ? <Notice variant="error">{`绑定数据加载失败：${error}`}</Notice> : null}

      {!devices.length ? (
        <EmptyState
          text={
            emptyDevices ||
            "还没有可绑定的 Agent：先在本工具里配好设备/账号，再回来把 AI 调用账号授权给它"
          }
        />
      ) : (
        <Table<Row>
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: "max-content" }}
          pagination={false}
        />
      )}

      <Modal
        open={Boolean(editing)}
        title={editing ? `绑定给「${editing.name}」` : ""}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
        okText={busy ? "保存中" : "保存绑定"}
        cancelText="取消"
        confirmLoading={busy}
        destroyOnHidden
        width={620}
      >
        <div style={{ marginBottom: 10, color: "var(--muted)" }}>
          勾选后，这台 Agent 取凭据时才能看到并解密这些账号；不勾＝一个都取不到。
        </div>
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          value={selected}
          options={options}
          optionFilterProp="label"
          placeholder={accounts.length ? "选择可用的 AI 调用账号" : "还没有 AI 调用账号，请先到「AI 调用账号」页签登记"}
          onChange={setSelected}
        />
      </Modal>
    </Panel>
  );
}
