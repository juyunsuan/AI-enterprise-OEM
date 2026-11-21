"use client";
// 首页轮播：位置 + 图片 + 跳转对象，字段与 onsiteBannerInputSchema 对应（跳转是 link 嵌套对象）。
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag } from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";
import {
  type OnsiteBannerRow,
  type OnsiteLink,
} from "@enterprise/contracts";
import { EmptyState, Panel } from "@/components/ui/panel";
import { RawImg } from "@/components/ui/raw-img";
import { useOnsiteBanners, useOnsiteContentActions } from "@/query/onsite";
import { DataTable, FilterBar } from "./list-kit";

const IMAGE = {
  width: 72,
  height: 44,
  borderRadius: 6,
  objectFit: "cover" as const,
  background: "#fafafa",
};

/** 契约里 link.type 是内联枚举、没导出常量与字典，这里按同一套取值补齐。 */
const LINK_TYPES: OnsiteLink["type"][] = [
  "NONE",
  "SERVICE",
  "CATEGORY",
  "STAFF",
  "ARTICLE",
  "WEBVIEW",
];
const LINK_TYPE_LABELS: Record<OnsiteLink["type"], string> = {
  NONE: "不跳转",
  SERVICE: "跳到某个服务",
  CATEGORY: "跳到某个分类",
  STAFF: "跳到某个技师",
  ARTICLE: "跳到某篇文章",
  WEBVIEW: "打开网页",
};
const LINK_VALUE_HINTS: Record<OnsiteLink["type"], string> = {
  NONE: "留空即可",
  SERVICE: "填服务编号（在「服务目录 → 服务」列表的地址栏能看到）",
  CATEGORY: "填分类编号",
  STAFF: "填技师编号",
  ARTICLE: "填文章编号",
  WEBVIEW: "填完整网址 https://…",
};

type BannerForm = {
  position: string;
  title: string;
  image: string;
  link: { type: OnsiteLink["type"]; value: string };
  sortOrder: number;
  enabled: boolean;
};

const NEW_BANNER: BannerForm = {
  position: "HOME",
  title: "",
  image: "",
  link: { type: "NONE", value: "" },
  sortOrder: 0,
  enabled: true,
};

export function BannerPanel({ shopId }: { shopId: number }) {
  const { modal } = App.useApp();
  const actions = useOnsiteContentActions();
  const [position, setPosition] = useState("all");
  const filteredQuery = useOnsiteBanners({ shopId }, position);
  // 位置是自由字符串，选项从「全部」结果里取，筛完不会把别的位置筛没了
  const allQuery = useOnsiteBanners({ shopId }, "all");
  const rows = filteredQuery.data?.list ?? [];
  const positions = useMemo(
    () => Array.from(new Set((allQuery.data?.list ?? []).map((row) => row.position))),
    [allQuery.data],
  );
  const [editing, setEditing] = useState<{ open: boolean; row: OnsiteBannerRow | null }>({
    open: false,
    row: null,
  });

  const removeRow = (row: OnsiteBannerRow) => {
    modal.confirm({
      title: `删除轮播「${row.title || row.position}」`,
      content: "删除后小程序首页这一位立即少一张图，图片本身不会从存储里清除。",
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await actions.removeBanner.mutateAsync({
          params: { id: String(shopId) },
          body: { id: row.id },
        });
      },
    });
  };

  const columns: TableProps<OnsiteBannerRow>["columns"] = [
    {
      title: "位置",
      dataIndex: "position",
      width: 120,
      render: (value: string) => <Tag>{value || "HOME"}</Tag>,
    },
    {
      title: "标题",
      dataIndex: "title",
      width: 200,
      render: (value: string) => value || <span className="muted">未填（只做纯图位）</span>,
    },
    {
      title: "图片",
      dataIndex: "image",
      width: 100,
      render: (value: string) =>
        value ? <RawImg src={value} alt="" style={IMAGE} /> : <span className="muted">—</span>,
    },
    {
      title: "跳转",
      dataIndex: "link",
      width: 240,
      render: (value: OnsiteLink) => (
        <div>
          <div>{LINK_TYPE_LABELS[value.type]}</div>
          {value.type !== "NONE" ? (
            <div className="muted text-12">{value.value || "未填目标编号"}</div>
          ) : null}
        </div>
      ),
    },
    { title: "排序", dataIndex: "sortOrder", width: 80 },
    {
      title: "状态",
      dataIndex: "enabled",
      width: 100,
      render: (value: boolean) => (
        <Tag color={value ? "green" : "default"}>{value ? "展示中" : "已停用"}</Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      fixed: "right",
      render: (_, row) => (
        <Space size={0} wrap>
          <Button
            size="small"
            type="link"
            icon={<EditOutlined aria-hidden />}
            onClick={() => setEditing({ open: true, row })}
          >
            编辑
          </Button>
          <Button size="small" type="link" danger onClick={() => removeRow(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Panel
      title="首页轮播"
      titleBadge={allQuery.data ? `${allQuery.data.list.length}` : undefined}
      extra={
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined aria-hidden />}
          onClick={() => setEditing({ open: true, row: null })}
        >
          新建轮播
        </Button>
      }
    >
      <FilterBar>
        <Select
          style={{ width: 180 }}
          value={position}
          onChange={(value: string) => setPosition(value)}
          options={[
            { value: "all", label: "全部位置" },
            ...positions.map((value) => ({ value, label: `位置 ${value}` })),
          ]}
        />
        <span className="muted text-12">
          位置标识要和小程序里请求的轮播位一致，默认 HOME 即首页顶部；排序值越小越靠前。
        </span>
      </FilterBar>
      {rows.length || filteredQuery.isFetching ? (
        <DataTable<OnsiteBannerRow>
          rows={rows}
          columns={columns}
          page={1}
          loading={filteredQuery.isFetching}
        />
      ) : (
        <EmptyState
          text={
            position === "all"
              ? "还没有轮播图。首页顶部空着会让顾客觉得店没开张，先上一张主推活动的图。"
              : `位置「${position}」还没有图，切回全部位置看看别的位，或在这里新建一张。`
          }
          action={
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              onClick={() => setEditing({ open: true, row: null })}
            >
              新建轮播
            </Button>
          }
        />
      )}
      <BannerModal
        shopId={shopId}
        editing={editing}
        onClose={() => setEditing({ open: false, row: null })}
      />
    </Panel>
  );
}

function BannerModal({
  shopId,
  editing,
  onClose,
}: {
  shopId: number;
  editing: { open: boolean; row: OnsiteBannerRow | null };
  onClose: () => void;
}) {
  const row = editing.row;
  const initial: BannerForm = row
    ? {
        position: row.position,
        title: row.title,
        image: row.image,
        link: { type: row.link.type, value: row.link.value },
        sortOrder: row.sortOrder,
        enabled: row.enabled,
      }
    : NEW_BANNER;

  return (
    <Modal
      open={editing.open}
      title={row ? "编辑轮播" : "新建轮播"}
      width={560}
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      {editing.open ? (
        <BannerFormBlock
          key={row?.id ?? "new"}
          shopId={shopId}
          rowId={row?.id}
          initial={initial}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function BannerFormBlock({
  shopId,
  rowId,
  initial,
  onClose,
}: {
  shopId: number;
  rowId?: number;
  initial: BannerForm;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const save = useOnsiteContentActions().saveBanner;
  const [form] = Form.useForm<BannerForm>();
  const linkType = Form.useWatch(["link", "type"], form) ?? "NONE";
  const image = Form.useWatch("image", form) ?? "";

  const submit = async () => {
    const values = await form.validateFields();
    await save.mutateAsync({
      params: { id: String(shopId) },
      body: rowId ? { ...values, id: rowId } : values,
    });
    message.success(rowId ? "轮播已保存" : "轮播已创建，启用后首页才会展示");
    onClose();
  };

  return (
    <Form form={form} layout="vertical" initialValues={initial}>
      <Space wrap align="start">
        <Form.Item
          name="position"
          label="位置标识"
          extra="默认 HOME = 首页顶部轮播"
          style={{ width: 220 }}
        >
          <Input maxLength={20} placeholder="HOME" />
        </Form.Item>
        <Form.Item name="sortOrder" label="排序值" extra="越小越靠前" style={{ width: 160 }}>
          <InputNumber min={0} max={9999} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          name="enabled"
          label="展示中"
          valuePropName="checked"
          style={{ width: 140 }}
        >
          <Switch />
        </Form.Item>
      </Space>
      <Form.Item name="title" label="标题" extra="只做后台识别与备用文案，可留空">
        <Input maxLength={80} />
      </Form.Item>
      <Form.Item
        name="image"
        label="图片直链"
        rules={[{ required: true, message: "请填写图片直链" }]}
        extra="数字资产或对象存储的图片地址；建议尺寸 750×350"
      >
        <Input maxLength={500} placeholder="https://…" />
      </Form.Item>
      {image ? (
        <RawImg
          src={image}
          alt=""
          style={{ width: 220, height: 104, objectFit: "cover", borderRadius: 8, marginBottom: 16 }}
        />
      ) : null}
      <Space wrap align="start">
        <Form.Item name={["link", "type"]} label="点击跳转" style={{ width: 220 }}>
          <Select
            options={LINK_TYPES.map((value) => ({
              value,
              label: LINK_TYPE_LABELS[value],
            }))}
          />
        </Form.Item>
        {linkType === "NONE" ? null : (
          <Form.Item
            name={["link", "value"]}
            label="跳转目标"
            extra={LINK_VALUE_HINTS[linkType]}
            rules={[{ required: true, message: "填了跳转类型就要给目标" }]}
            style={{ width: 280 }}
          >
            <Input maxLength={300} />
          </Form.Item>
        )}
      </Space>
      <Space>
        <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
          保存轮播
        </Button>
        <Button onClick={onClose}>取消</Button>
      </Space>
    </Form>
  );
}
