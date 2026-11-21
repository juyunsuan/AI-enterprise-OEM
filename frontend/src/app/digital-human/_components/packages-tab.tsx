"use client";

// 套餐页签：四类充值套餐的增删改（价格按元录入，后端存分）。
import { PlusOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Input,
  InputNumber,
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
  DH_PACKAGE_TYPES,
  DH_PACKAGE_TYPE_LABELS,
  type DhPackageRow,
} from "@enterprise/contracts";
import { digitalHumanApi } from "@/api/digital-human";
import { EmptyState, Panel } from "@/components/ui/panel";
import { yuan } from "./shared";

type DhPackageType = (typeof DH_PACKAGE_TYPES)[number];

type Draft = {
  id?: number;
  type: DhPackageType;
  name: string;
  priceYuan: number;
  originalYuan: number;
  vipDays: number;
  point: number;
  bodyQuota: number;
  voiceQuota: number;
  limitNum: number;
  recommended: boolean;
  sort: number;
  enabled: boolean;
};

const EMPTY: Draft = {
  type: "vip",
  name: "",
  priceYuan: 9.9,
  originalYuan: 0,
  vipDays: 30,
  point: 0,
  bodyQuota: 0,
  voiceQuota: 0,
  limitNum: 0,
  recommended: false,
  sort: 0,
  enabled: true,
};

export function PackagesTab() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<DhPackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<"" | DhPackageType>("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await digitalHumanApi.packages({ query: type ? { type } : {} })) ?? []);
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "套餐加载失败");
    } finally {
      setLoading(false);
    }
  }, [type, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await digitalHumanApi.savePackage({
        body: {
          ...(draft.id ? { id: draft.id } : {}),
          type: draft.type,
          name: draft.name,
          priceCents: Math.round(draft.priceYuan * 100),
          originalCents: Math.round(draft.originalYuan * 100),
          vipDays: draft.vipDays,
          point: draft.point,
          bodyQuota: draft.bodyQuota,
          voiceQuota: draft.voiceQuota,
          limitNum: draft.limitNum,
          recommended: draft.recommended,
          sort: draft.sort,
          enabled: draft.enabled,
        },
      });
      message.success("套餐已保存");
      setDraft(null);
      await load();
    } catch (cause) {
      message.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = (row: DhPackageRow) => {
    Modal.confirm({
      title: "删除套餐",
      content: `确定删除「${row.name}」？已支付订单不受影响，但小程序端将不再展示该套餐。`,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await digitalHumanApi.removePackage({ body: { id: row.id } });
          message.success("已删除");
          await load();
        } catch (cause) {
          message.error(cause instanceof Error ? cause.message : "删除失败");
        }
      },
    });
  };

  const columns: ColumnsType<DhPackageRow> = [
    {
      title: "套餐",
      width: 200,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Space size={6}>
            <span>{row.name}</span>
            {row.recommended ? <Tag color="gold">推荐</Tag> : null}
            {!row.enabled ? <Tag>已下架</Tag> : null}
          </Space>
          <span className="muted text-12">{DH_PACKAGE_TYPE_LABELS[row.type]}</span>
        </Space>
      ),
    },
    {
      title: "价格",
      width: 150,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <span>{yuan(row.priceCents)}</span>
          {row.originalCents > 0 ? (
            <span className="muted text-12" style={{ textDecoration: "line-through" }}>
              {yuan(row.originalCents)}
            </span>
          ) : null}
        </Space>
      ),
    },
    {
      title: "发放内容",
      render: (_, row) => (
        <span className="text-12">
          {[
            row.vipDays ? `${row.vipDays} 天会员` : "",
            row.point ? `${row.point} 算力` : "",
            row.bodyQuota ? `${row.bodyQuota} 形象点` : "",
            row.voiceQuota ? `${row.voiceQuota} 声音点` : "",
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </span>
      ),
    },
    { title: "限购", dataIndex: "limitNum", width: 80, render: (value: number) => (value > 0 ? `${value} 次` : "不限") },
    { title: "销量", dataIndex: "sales", width: 80 },
    { title: "排序", dataIndex: "sort", width: 70 },
    {
      title: "操作",
      width: 150,
      render: (_, row) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={() =>
              setDraft({
                id: row.id,
                type: row.type,
                name: row.name,
                priceYuan: row.priceCents / 100,
                originalYuan: row.originalCents / 100,
                vipDays: row.vipDays,
                point: row.point,
                bodyQuota: row.bodyQuota,
                voiceQuota: row.voiceQuota,
                limitNum: row.limitNum,
                recommended: row.recommended,
                sort: row.sort,
                enabled: row.enabled,
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
      title="充值套餐"
      extra={
        <Space>
          <Select
            value={type}
            style={{ width: 140 }}
            options={[
              { value: "", label: "全部类型" },
              ...DH_PACKAGE_TYPES.map((value) => ({
                value,
                label: DH_PACKAGE_TYPE_LABELS[value],
              })),
            ]}
            onChange={(value: "" | DhPackageType) => setType(value)}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setDraft({ ...EMPTY })}
          >
            新增套餐
          </Button>
        </Space>
      }
    >
      {rows.length === 0 && !loading ? (
        <EmptyState text="还没有套餐：会员页购买区按套餐类型分组展示。" />
      ) : (
        <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={false} />
      )}

      <Modal
        open={Boolean(draft)}
        title={draft?.id ? "编辑套餐" : "新增套餐"}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setDraft(null)}
      >
        {draft ? (
          <Space orientation="vertical" size={10} style={{ width: "100%" }}>
            <label>
              类型
              <Select
                style={{ width: "100%" }}
                value={draft.type}
                options={DH_PACKAGE_TYPES.map((value) => ({
                  value,
                  label: DH_PACKAGE_TYPE_LABELS[value],
                }))}
                onChange={(value: DhPackageType) => setDraft({ ...draft, type: value })}
              />
            </label>
            <label>
              套餐名称
              <Input
                value={draft.name}
                maxLength={80}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <Space size={10}>
              <label>
                价格（元）
                <InputNumber
                  min={0.01}
                  value={draft.priceYuan}
                  onChange={(value) =>
                    setDraft({ ...draft, priceYuan: Number(value ?? 0) })
                  }
                />
              </label>
              <label>
                原价（元，0 不展示）
                <InputNumber
                  min={0}
                  value={draft.originalYuan}
                  onChange={(value) =>
                    setDraft({ ...draft, originalYuan: Number(value ?? 0) })
                  }
                />
              </label>
            </Space>
            <Space size={10} wrap>
              <label>
                会员天数
                <InputNumber
                  min={0}
                  max={3650}
                  value={draft.vipDays}
                  onChange={(value) => setDraft({ ...draft, vipDays: Number(value ?? 0) })}
                />
              </label>
              <label>
                算力
                <InputNumber
                  min={0}
                  value={draft.point}
                  onChange={(value) => setDraft({ ...draft, point: Number(value ?? 0) })}
                />
              </label>
              <label>
                形象点
                <InputNumber
                  min={0}
                  value={draft.bodyQuota}
                  onChange={(value) =>
                    setDraft({ ...draft, bodyQuota: Number(value ?? 0) })
                  }
                />
              </label>
              <label>
                声音点
                <InputNumber
                  min={0}
                  value={draft.voiceQuota}
                  onChange={(value) =>
                    setDraft({ ...draft, voiceQuota: Number(value ?? 0) })
                  }
                />
              </label>
            </Space>
            <Space size={10}>
              <label>
                限购次数（0 不限）
                <InputNumber
                  min={0}
                  max={9999}
                  value={draft.limitNum}
                  onChange={(value) => setDraft({ ...draft, limitNum: Number(value ?? 0) })}
                />
              </label>
              <label>
                排序
                <InputNumber
                  min={0}
                  max={9999}
                  value={draft.sort}
                  onChange={(value) => setDraft({ ...draft, sort: Number(value ?? 0) })}
                />
              </label>
            </Space>
            <Space size={24}>
              <Space size={6}>
                <Switch
                  checked={draft.recommended}
                  onChange={(recommended) => setDraft({ ...draft, recommended })}
                />
                推荐
              </Space>
              <Space size={6}>
                <Switch
                  checked={draft.enabled}
                  onChange={(enabled) => setDraft({ ...draft, enabled })}
                />
                上架
              </Space>
            </Space>
          </Space>
        ) : null}
      </Modal>
    </Panel>
  );
}
