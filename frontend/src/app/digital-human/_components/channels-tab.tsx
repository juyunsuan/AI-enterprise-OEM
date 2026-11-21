"use client";

// 模型配置页签：四类能力各自的渠道台账，密钥只回显是否已配置。
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  DH_CHANNEL_CAPABILITIES,
  DH_CHANNEL_CAPABILITY_LABELS,
  DH_CHANNEL_PROTOCOLS,
  DH_CHANNEL_PROTOCOL_LABELS,
  type DhChannelCapability,
  type DhChannelInput,
  type DhChannelProtocol,
  type DhChannelRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { Notice, Panel } from "@/components/ui/panel";
import { fmtTime } from "@/lib/datetime";

type Draft = DhChannelInput & { id?: number };

const EMPTY: Draft = {
  capability: "tts",
  protocol: "fox",
  name: "",
  baseUrl: "",
  modelTier: "",
  enabled: true,
  isDefault: false,
};

export function ChannelsTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<DhChannelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.channels({ query: {} })) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "渠道加载失败");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.saveChannel({
        body: {
          ...draft,
          // 留空表示保留已保存的密文，不把空串写回去。
          ...(draft.key ? { key: draft.key } : {}),
          ...(draft.secret ? { secret: draft.secret } : {}),
        },
      });
      message.success("渠道已保存");
      setDraft(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const test = async (row: DhChannelRow) => {
    setTesting(row.id);
    try {
      const result = await digitalHumanApi.testChannel({ body: { id: row.id } });
      if (result?.ok) message.success(result.message || "连接正常");
      else message.warning(result?.message || "连接失败");
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "测试失败");
    } finally {
      setTesting(null);
    }
  };

  const remove = (row: DhChannelRow) => {
    Modal.confirm({
      title: "删除渠道",
      content: `确定删除「${row.name}」？该能力若没有其他默认渠道，会员提交对应任务会失败。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removeChannel({ body: { id: row.id } });
          message.success("已删除");
          await load();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhChannelRow> = [
    {
      title: "能力",
      dataIndex: "capability",
      width: 110,
      render: (value: DhChannelCapability) => (
        <Tag color="blue">{DH_CHANNEL_CAPABILITY_LABELS[value] || value}</Tag>
      ),
    },
    {
      title: "渠道",
      dataIndex: "name",
      render: (value: string, row) => (
        <Space orientation="vertical" size={0}>
          <span>
            {value}
            {row.isDefault ? <Tag color="green" style={{ marginLeft: 6 }}>默认</Tag> : null}
          </span>
          <span className="muted text-12">
            {DH_CHANNEL_PROTOCOL_LABELS[row.protocol] || row.protocol}
            {row.modelTier ? ` · ${row.modelTier}` : ""}
            {row.baseUrl ? ` · ${row.baseUrl}` : ""}
          </span>
        </Space>
      ),
    },
    {
      title: "凭据",
      width: 150,
      render: (_, row) => (
        <Space size={4} wrap>
          <Tag color={row.keyConfigured ? "green" : "default"}>
            Key {row.keyConfigured ? "已配" : "未配"}
          </Tag>
          <Tag color={row.secretConfigured ? "green" : "default"}>
            回调密钥 {row.secretConfigured ? "已配" : "未配"}
          </Tag>
        </Space>
      ),
    },
    {
      title: "状态",
      width: 110,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Tag color={row.enabled ? "green" : "default"}>
            {row.enabled ? "启用" : "停用"}
          </Tag>
          <span className="muted text-12">
            {row.verifiedAt ? `验证于 ${fmtTime(row.verifiedAt)}` : "未验证"}
          </span>
        </Space>
      ),
    },
    {
      title: "操作",
      width: 200,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={() => void test(row)}
            loading={testing === row.id}
          >
            测试
          </Button>
          <Button
            size="small"
            onClick={() =>
              setDraft({
                id: row.id,
                capability: row.capability,
                protocol: row.protocol,
                name: row.name,
                baseUrl: row.baseUrl,
                modelTier: row.modelTier,
                enabled: row.enabled,
                isDefault: row.isDefault,
              })
            }
          >
            编辑
          </Button>
          <Button size="small" danger onClick={() => remove(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="模型渠道"
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setDraft({ ...EMPTY })}>
          新增渠道
        </Button>
      }
    >
      <Notice variant="info">
        密钥与回调密钥密文入库，编辑时留空即保留原值。每个能力建议只设一条默认渠道；Fox 聚合支持全部四类，SyncLabs 只支持声音克隆。
      </Notice>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        style={{ marginTop: 12 }}
      />

      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑渠道" : "新增渠道"}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              能力
              <Select
                style={{ width: "100%" }}
                value={draft.capability}
                options={DH_CHANNEL_CAPABILITIES.map((value) => ({
                  value,
                  label: DH_CHANNEL_CAPABILITY_LABELS[value],
                }))}
                onChange={(capability: DhChannelCapability) =>
                  setDraft({ ...draft, capability })
                }
              />
            </label>
            <label>
              供应商协议
              <Select
                style={{ width: "100%" }}
                value={draft.protocol}
                options={DH_CHANNEL_PROTOCOLS.map((value) => ({
                  value,
                  label: DH_CHANNEL_PROTOCOL_LABELS[value],
                }))}
                onChange={(protocol: DhChannelProtocol) =>
                  setDraft({ ...draft, protocol })
                }
              />
            </label>
            <label>
              渠道名称
              <Input
                value={draft.name}
                maxLength={64}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              Base URL
              <Input
                value={draft.baseUrl}
                maxLength={300}
                placeholder="留空用协议默认地址"
                onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
              />
            </label>
            <label>
              模型档位
              <Input
                value={draft.modelTier}
                maxLength={64}
                onChange={(event) => setDraft({ ...draft, modelTier: event.target.value })}
              />
            </label>
            <label>
              API Key
              <Input.Password
                value={draft.key ?? ""}
                maxLength={512}
                placeholder={draft.id ? "留空保留原值" : "供应商密钥"}
                onChange={(event) => setDraft({ ...draft, key: event.target.value })}
              />
            </label>
            <label>
              回调校验密钥
              <Input.Password
                value={draft.secret ?? ""}
                maxLength={512}
                placeholder={draft.id ? "留空保留原值" : "webhook 签名密钥"}
                onChange={(event) => setDraft({ ...draft, secret: event.target.value })}
              />
            </label>
            <Space size={24}>
              <Space size={6}>
                <Switch
                  checked={draft.enabled}
                  onChange={(enabled) => setDraft({ ...draft, enabled })}
                />
                启用
              </Space>
              <Space size={6}>
                <Switch
                  checked={draft.isDefault}
                  onChange={(isDefault) => setDraft({ ...draft, isDefault })}
                />
                设为该能力默认
              </Space>
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}
