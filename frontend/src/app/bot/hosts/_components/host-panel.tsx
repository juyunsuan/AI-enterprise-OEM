"use client";

import { CopyOutlined, MessageOutlined } from "@ant-design/icons";
import {
  App,
  Alert,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { usePasswordConfirm } from "@/components/confirm-with-password";
import { EmptyState, Panel } from "@/components/ui/panel";
import { useI18n } from "@/lib/i18n/i18n";
import type { BotHostView } from "@enterprise/contracts";
import { contentApi } from "@/api/content";
import {
  HOST_STATUS_LABEL,
  fmtTime,
  hostHint,
  hostStatusColor,
  botHostApi,
} from "./common";

/**
 * Bot 主机台账：一台主机＝本人机器上跑着的 BotBuddy 客户端。
 * 配对成功后令牌明文只回一次，库内只存 sha256；界面只显前缀，丢了就「重置令牌」重新粘。
 */
export function HostPanel({
  hosts,
  reload,
  onOpenChat,
}: {
  hosts: BotHostView[];
  reload: () => Promise<void>;
  onOpenChat: (hostId: number) => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { request, modal } = usePasswordConfirm();
  const [pairOpen, setPairOpen] = useState(false);
  const [pairForm, setPairForm] = useState({ name: "", code: "" });
  const [busy, setBusy] = useState(false);
  /** 一次性令牌：只在这次配对响应里存在，关掉弹窗即丢。 */
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(
    null,
  );
  /** 平台模型授权弹窗：一台主机同一时刻一个渠道 + 一个模型。 */
  const [grantHost, setGrantHost] = useState<BotHostView | null>(null);
  const [channels, setChannels] = useState<{ id: number; name: string }[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [grantChannel, setGrantChannel] = useState<number>(-1);
  const [grantModel, setGrantModel] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);

  const loadGrant = useCallback(async (row: BotHostView) => {
    setGrantHost(row);
    setGrantChannel(row.modelGrant?.channelId ?? -1);
    setGrantModel(row.modelGrant?.model ?? "");
    const settings = await contentApi.settings();
    setChannels(
      (settings?.channels || [])
        .filter((channel) => channel.enabled)
        .map((channel) => ({ id: channel.id, name: channel.name })),
    );
  }, []);

  // 换渠道就重拉该渠道的模型清单；选中值不在新清单里就清空，避免存下张冠李戴的组合。
  useEffect(() => {
    if (!grantHost) return;
    let alive = true;
    void contentApi
      .models({ query: { channelId: grantChannel } })
      .then((result) => {
        if (!alive) return;
        const list = (result?.models || []).map((item) => item.id);
        setModels(list);
        setGrantModel((current) => (list.includes(current) ? current : ""));
      })
      .catch(() => {
        if (alive) setModels([]);
      });
    return () => {
      alive = false;
    };
  }, [grantHost, grantChannel]);

  const saveGrant = async () => {
    if (!grantHost) return;
    if (!grantModel) {
      message.warning("先选模型");
      return;
    }
    setGrantBusy(true);
    try {
      await botHostApi.saveModelGrant(grantHost.id, {
        channelId: grantChannel,
        model: grantModel,
      });
      message.success("已授权：客户端下次心跳会改用平台渠道");
      setGrantHost(null);
      await reload();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setGrantBusy(false);
    }
  };

  const revokeGrant = async () => {
    if (!grantHost) return;
    setGrantBusy(true);
    try {
      await botHostApi.removeModelGrant(grantHost.id);
      message.success("已撤销授权，客户端会清掉平台渠道并切回本地渠道");
      setGrantHost(null);
      await reload();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setGrantBusy(false);
    }
  };

  const submitPair = async () => {
    const code = pairForm.code.trim();
    const name = pairForm.name.trim();
    if (!code && !name) {
      message.warning("填配对码或给主机起个名字，二选一即可");
      return;
    }
    setBusy(true);
    try {
      const result = await botHostApi.pair({ code: code || undefined, name });
      setPairOpen(false);
      setPairForm({ name: "", code: "" });
      setIssued({ name: result.host.name, token: result.token });
      await reload();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      message.success("令牌已复制，粘贴到客户端的配对框里");
    } catch {
      message.warning("浏览器不允许直接复制，请手动选中复制");
    }
  };

  const toggleEnabled = async (row: BotHostView, enabled: boolean) => {
    try {
      await botHostApi.setStatus(row.id, enabled);
      await reload();
      message.success(enabled ? `已启用「${row.name}」` : `已停用「${row.name}」`);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const rotate = (row: BotHostView) => {
    request({
      title: "重置主机令牌（需密码）",
      content: (
        <div>
          重置后旧令牌立刻失效，客户端要重新粘贴新令牌才能继续配对。
          <br />
          确认重置「{row.name}」的令牌？
        </div>
      ),
      okText: "重置并显示新令牌",
      onOk: async () => {
        const result = await botHostApi.rotateToken(row.id);
        setIssued({ name: row.name, token: result.token });
        await reload();
      },
    });
  };

  const remove = (row: BotHostView) => {
    request({
      title: "删除主机（需密码）",
      content: (
        <div>
          删除会一并清掉这台主机的对话、指令队列、定时任务与运行记录，客户端随即掉线。
          <br />
          确认删除「{row.name}」？
        </div>
      ),
      danger: true,
      okText: "确认删除",
      onOk: async () => {
        await botHostApi.remove(row.id);
        await reload();
      },
    });
  };

  const columns: ColumnsType<BotHostView> = [
    {
      title: "主机",
      dataIndex: "name",
      key: "name",
      width: 220,
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <b>{value}</b>
          <span className="text-12 muted">{hostHint(row)}</span>
        </Space>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (value: string, row) => (
        <Space orientation="vertical" size={2}>
          <Space size={6}>
            <Tag color={hostStatusColor(value)}>
              {HOST_STATUS_LABEL[value] || value}
            </Tag>
            {row.online ? null : (
              <span className="text-12 muted">不在线时指令照排队</span>
            )}
          </Space>
          <span className="text-12 muted">
            {row.lastSeenAt ? `心跳 ${fmtTime(row.lastSeenAt)}` : "尚未接入"}
          </span>
        </Space>
      ),
    },
    {
      title: "工作区",
      key: "workspace",
      width: 190,
      render: (_, row) => (
        <Tooltip title={row.workspace.defaultPath || t("默认工作区")}>
          <Space orientation="vertical" size={0}>
            <span className="text-12" style={{ maxWidth: 190 }}>
              {row.workspace.defaultPath || t("默认工作区")}
            </span>
            <span className="text-12 muted">
              {row.workspace.count
                ? `${row.workspace.count} ${t("个候选目录")}`
                : t("未上报候选目录")}
            </span>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: "平台模型",
      key: "modelGrant",
      width: 210,
      render: (_, row) => {
        const grant = row.modelGrant;
        const sourceLabel =
          grant?.source === "default"
            ? "跟随平台默认"
            : grant?.source === "client"
              ? "客户端同步"
              : "平台授权";
        return (
          <Space orientation="vertical" size={0}>
            <span className="text-12">
              {grant
                ? `${grant.channelName} · ${grant.model}`
                : "未配置（跟随平台默认模型）"}
            </span>
            <span className="text-12 muted">
              {grant
                ? grant.available
                  ? sourceLabel
                  : `${sourceLabel} · 渠道已不可用`
                : "平台「模型设置 → 文本」配好后自动生效"}
            </span>
            <Button
              size="small"
              type="link"
              style={{ padding: 0, height: "auto" }}
              onClick={() => void loadGrant(row)}
            >
              {grant && grant.source !== "default" ? "调整" : "授权平台模型"}
            </Button>
          </Space>
        );
      },
    },
    {
      title: "待执行",
      dataIndex: "pendingCount",
      key: "pendingCount",
      width: 90,
      render: (value: number) => (value ? <b>{value} 条</b> : "—"),
    },
    {
      title: "令牌",
      dataIndex: "tokenPrefix",
      key: "tokenPrefix",
      width: 130,
      render: (value: string) => <span className="mono text-12">{value}…</span>,
    },
    {
      title: "客户端",
      dataIndex: "clientVersion",
      key: "clientVersion",
      width: 110,
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span className="mono text-12">{value || "—"}</span>
          <span className="text-12 muted">{row.lastIp || "—"}</span>
        </Space>
      ),
    },
    {
      title: "启用",
      dataIndex: "enabled",
      key: "enabled",
      width: 70,
      render: (value: boolean, row) => (
        <Switch
          size="small"
          checked={value}
          onChange={(next) => void toggleEnabled(row, next)}
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 190,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<MessageOutlined aria-hidden />}
            onClick={() => onOpenChat(row.id)}
            title="打开对话"
          />
          <Button size="small" onClick={() => rotate(row)}>
            重置令牌
          </Button>
          <Button size="small" danger onClick={() => remove(row)}>
            删
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="Bot 主机"
      titleBadge={`${hosts.length} 台`}
      extra={
        <Button
          type="primary"
          onClick={() => {
            setPairForm({ name: "", code: "" });
            setPairOpen(true);
          }}
        >
          配对主机
        </Button>
      }
    >
      {hosts.length ? (
        <Table<BotHostView>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={hosts}
          scroll={{ x: "max-content" }}
          pagination={false}
        />
      ) : (
        <EmptyState
          text="还没有 Bot 主机：在本机装好 BotBuddy 客户端（自带 Agent），在客户端里配好模型后用配对码完成配对，或直接粘贴令牌"
          action={
            <Button
              type="primary"
              onClick={() => {
                setPairForm({ name: "", code: "" });
                setPairOpen(true);
              }}
            >
              配对主机
            </Button>
          }
        />
      )}

      <Modal
        open={pairOpen}
        title="配对 Bot 主机"
        onCancel={() => setPairOpen(false)}
        onOk={() => void submitPair()}
        okText={busy ? "配对中" : "配对"}
        cancelText="取消"
        confirmLoading={busy}
        destroyOnHidden
        width={560}
      >
        <div className="data-table-form">
          <label className="data-table-form-item">
            <span className="data-table-form-label">配对码</span>
            <Input
              value={pairForm.code}
              maxLength={12}
              placeholder="BotBuddy「配对」页里的 6 位码（推荐）"
              onChange={(event) =>
                setPairForm((prev) => ({ ...prev, code: event.target.value }))
              }
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">主机名</span>
            <Input
              value={pairForm.name}
              maxLength={80}
              placeholder="留空＝用客户端自报的机器名"
              onChange={(event) =>
                setPairForm((prev) => ({ ...prev, name: event.target.value }))
              }
            />
          </label>
          <div className="text-12 muted" style={{ gridColumn: "1 / -1" }}>
            填配对码：客户端登录的平台账号与这个 6 位码双重校验，码只能由生成它的那个账号在本页认领；
            客户端拿回令牌后本站不再显示明文。留空只填主机名：本站直接生成一把令牌，
            你在下一个弹窗里复制并粘贴进客户端的「已有令牌」框。两种方式都只在库内保存令牌的 sha256。
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(issued)}
        title="主机令牌（只显示这一次）"
        onCancel={() => setIssued(null)}
        onOk={() => setIssued(null)}
        okText="我已粘贴"
        cancelText="关闭"
        destroyOnHidden
        width={620}
      >
        {issued ? (
          <Space orientation="vertical" size={12} style={{ width: "100%" }}>
            <Alert
              type="warning"
              showIcon
              title="关掉本弹窗就再也取不到这串令牌；丢失请对该主机「重置令牌」重新生成。"
            />
            <div className="text-12 muted">{`主机「${issued.name}」`}</div>
            <Input.TextArea
              readOnly
              autoSize={{ minRows: 2, maxRows: 4 }}
              value={issued.token}
              className="mono"
            />
            <Button icon={<CopyOutlined aria-hidden />} onClick={() => void copyToken()}>
              复制令牌
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              到 BotBuddy 客户端 →「配对」→ 选「粘贴令牌」，粘进来保存后客户端即开始心跳；
              平台 BaseURL 要在客户端设置里填成本站地址，再在「Agent」页配好模型渠道与模型。
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(grantHost)}
        title={`平台模型授权 · ${grantHost?.name || ""}`}
        width={560}
        onCancel={() => setGrantHost(null)}
        onOk={() => void saveGrant()}
        okText={grantBusy ? "保存中" : "授权"}
        cancelText="取消"
        confirmLoading={grantBusy}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title="授权后平台会在心跳里把这个渠道的真实密钥交给这台主机的客户端，客户端据此调模型；撤销后客户端清掉平台渠道。客户端改了自己的模型设置时，会在「模型设置」里落一条「BotBuddy · 主机名」渠道并同步到这里。"
        />
        <div className="data-table-form">
          <label className="data-table-form-item">
            <span className="data-table-form-label">模型渠道</span>
            <Select
              value={grantChannel}
              options={[
                { value: -1, label: "本站内置渠道（按积分计费）" },
                { value: 0, label: "AIPDD 渠道（本人绑定或平台 Key）" },
                ...channels.map((channel) => ({
                  value: channel.id,
                  label: channel.name,
                })),
              ]}
              onChange={(value) => setGrantChannel(value)}
            />
          </label>
          <label className="data-table-form-item">
            <span className="data-table-form-label">模型</span>
            <Select
              showSearch
              value={grantModel || undefined}
              placeholder={models.length ? "选择模型" : "该渠道没有返回模型清单"}
              options={models.map((model) => ({ value: model, label: model }))}
              onChange={(value) => setGrantModel(value)}
              notFoundContent={models.length ? null : "先选渠道"}
            />
          </label>
        </div>
        {grantHost?.modelGrant && grantHost.modelGrant.source !== "default" ? (
          <Button danger onClick={() => void revokeGrant()} loading={grantBusy}>
            撤销授权
          </Button>
        ) : null}
      </Modal>
      {modal}
    </Panel>
  );
}
